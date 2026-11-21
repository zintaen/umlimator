/* umlimator_edit.mjs: the edit tools of umlimator.py mcp (umlimator_mcp.py), in Node. It reads one JSON object on stdin,
   { model, steps, source }, and writes one on stdout: the apply() commands each step makes, the model after them, its
   text (source, the file's text, kept as it is written wherever the change leaves it alone: rewritten), and what the
   change does (validate() problems, rules() breaks and check() issues it adds, and diff()'s summary in words).

   A step is an edit tool's call, { tool, ...its arguments }, or an apply() command as it is, { op, ... }. On a typed view
   a tool runs the page's own editor (typedEditor, src/canvas/edit.js, with the type's hooks, src/typed/edit.js): the
   gestures the page runs for N, L, F2, Delete, the Owner and other fields of the properties panel, given a stand-in for
   the canvas instead of a DOM. So an edit made here gives the commands the page gives for the same edit, ids included.
   A map view's page emits `change` events, not commands: here a map view's edit is the commands a host's would be
   (examples/edit.html), with the cards' boxes in the view's `containers`.

   The editor is lib/umlimator-all.js, the file the page inlines, imported with the names its build keeps inside (it
   exports the public API only). Standard library only; nothing is fetched. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LIB = new URL('./lib/umlimator-all.js', import.meta.url);
const u = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(LIB, 'utf8')
  + '\nexport { diagramOf, TYPED, typedEditor, unreadable, usedIds, heldBy };\n').toString('base64'));

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
const text = x => JSON.stringify(x);

class Refused extends Error {}

/* a stand-in for the canvas's DOM, enough for the editor's pickers (the kind of line, a hook's { pick }): each one opened is
   kept, with its labels, and chosen from by the step's `choose` */
function stage() {
  const open = [];
  const element = () => {
    const on = {}, el = { style: {}, dataset: {}, className: '', items: [], labels: [],
      setAttribute() {}, removeAttribute() {}, remove() { const i = open.indexOf(el); if (i >= 0) open.splice(i, 1); },
      addEventListener(type, fn) { on[type] = fn; },
      querySelectorAll: s => (s === 'button' ? el.items : []), querySelector: () => null,
      set innerHTML(h) { el.labels = [...String(h).matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
        el.items = el.labels.map((_, i) => { const b = { dataset: { i: String(i) }, focus() {}, click() { on.click && on.click({ stopPropagation() {}, target: { closest: () => b } }); } }; return b; }); } };
    return el; };
  globalThis.document = { createElement: element };
  return { open, el: { appendChild: m => { open.push(m); return m; }, querySelector: s => (s === '.um-pick' ? open.at(-1) || null : null),
    querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }), contains: () => false,
    addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } } };
}

const settle = () => new Promise(r => setTimeout(r, 0)); // a hook's picker opens in a microtask (src/typed/edit.js choose)

/* the elements of a model by id, as the canvas's editor reads them: { x, kind, owner } */
function elements(m) {
  const at = new Map(), put = (x0, kind0) => { for (const s = [[x0, kind0]]; s.length;) { const [x, kind, owner] = s.pop();
    if (!isObj(x) || typeof x.id !== 'string' || at.has(x.id)) continue; at.set(x.id, { x, kind, owner });
    const ms = arr(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], 'member', x]); } };
  arr(m.nodes).forEach(n => put(n, 'node')); arr(m.edges).forEach(e => put(e, 'edge'));
  arr(m.views).forEach(v => { if (isObj(v)) { [...arr(v.nodes), ...arr(v.fragments)].forEach(n => put(n, 'node')); arr(v.edges).forEach(e => put(e, 'edge')); } });
  return at;
}

const viewOf = (m, id) => { const v = arr(m.views).find(x => isObj(x) && x.id === id);
  if (!v) throw new Refused(`no view ${text(id)}; the views: ${arr(m.views).filter(isObj).map(x => x.id).join(', ')}`); return v; };
const typedView = (m, v) => m.schemaVersion === 2 && v.diagram != null && v.diagram !== 'map'; // as the editor's on()
const nameOf = (m, id) => { const e = elements(m).get(id); const l = e && e.x.label; return typeof l === 'string' && l ? l : String(id); };

/* the views that show an element: those that list it, then those that hold it as their own, then those that draw it */
function viewsShowing(m, id) {
  const vs = arr(m.views).filter(isObj), lists = v => arr(v.nodeIds).includes(id) || arr(v.edges).some(e => e === id || (isObj(e) && e.id === id))
    || [...arr(v.nodes), ...arr(v.fragments)].some(n => isObj(n) && n.id === id);
  const at = elements(m), top = x => { let e = at.get(x); while (e && e.owner) e = at.get(e.owner.id); return e ? e.x.id : x; };
  const line = at.get(id) && at.get(id).kind === 'edge' ? at.get(id).x : null;
  return [...vs.filter(lists), ...vs.filter(v => !lists(v) && (arr(v.nodeIds).includes(top(id)) || (line && arr(v.nodeIds).includes(line.from) && arr(v.nodeIds).includes(line.to) && !Array.isArray(v.edges))))];
}

/* the page's editor on one view of the model: its gestures (I) and what they emitted and said */
function editorOn(m, vid, { sel = null } = {}) {
  const S = stage(), drawn = u.unreadable(m).model, out = { commands: [], said: [] };
  let geo; try { geo = u.layout(m, vid); } catch { geo = { nodes: [], edges: [], byId: {}, slots: [] }; }
  geo.byId ||= {};
  let field = null; // a name field the gesture opened: (text) => its Enter
  const cam = { s: { cx: 0, cy: 0, k: 1 }, size: () => [1000, 800], toWorld: (x, y) => [x, y] };
  const say = t => { if (t != null && String(t) && !out.said.includes(String(t))) out.said.push(String(t)); };
  const api = { root: { activeElement: null, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], contains: () => false, appendChild: x => x }, stage: S.el, can: () => true, say, status: say, touch() {}, nearest: () => null, nameOf: id => nameOf(m, id),
    editor: (box, value, done) => { field = done; }, picked: () => (sel ? [sel] : []), emit: cs => { out.commands.push(...cs); },
    view: () => vid, model: () => drawn, geo: () => geo, svg: () => null, cam: () => cam, sel: () => sel, selectId() {},
    drawn: id => !!geo.byId[id] || arr(geo.edges).some(e => arr(e.ids).includes(id)), rename() {}, focus() {} };
  const I = u.typedEditor(api);
  return { I, out, geo, open: S.open, type: name => field && (field(name), field = null, true) };
}

/* a picker the gesture left open: the one `choose` names (a label, or its place from 0), else refused with the choices */
async function chosen(ed, choose, what) {
  for (let k = 0; k < 4 && !ed.open.length; k++) await settle();
  for (let k = 0; ed.open.length && k < 8; k++) {
    const m = ed.open.at(-1), labels = m.labels, i = typeof choose === 'number' ? choose : labels.indexOf(String(choose ?? ''));
    if (choose == null || !(i >= 0 && i < labels.length)) throw new Refused(`${what} asks which: ${labels.map(text).join(', ')}; call it again with choose (a label, or its place from 0)`);
    m.items[i].click(); choose = undefined; await settle();
  }
}

/* what a gesture gave: its commands, else why it gave none */
function gave(ed, what) {
  if (!ed.out.commands.length) throw new Refused(ed.out.said.length ? `${what}: ${ed.out.said.join('; ')}` : `${what}: nothing to change`);
  return ed.out;
}

/* a new id for a map view's card or line: the base and the first number free in the model, as the editor's newId */
function newId(m, base) {
  const used = u.usedIds(m), b = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el';
  let k = 1; while (used.has(b + k)) k++; return b + k;
}

/* an id the step names for what it adds: the editor's own id, given another (one no element has yet) in all the commands */
function renamed(m, commands, id, want) {
  if (want == null || want === id) return commands;
  if (typeof want !== 'string' || !want || want.includes('->')) throw new Refused(`id ${text(want)} is not an id: a word with no "->"`);
  if (u.usedIds(m).has(want)) throw new Refused(`id ${text(want)} is used already`);
  const swap = x => x === id ? want : Array.isArray(x) ? x.map(swap) : isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k === id ? want : k, swap(v)])) : x;
  return swap(commands);
}

const added = cs => cs.filter(c => isObj(c) && c.op === 'add' && isObj(c.element)).map(c => c.element);

/* a map view's boxes: `containers`, each card in one; moving a card puts it in `box` (null: none) */
function boxesWith(v, id, box) {
  const cs = arr(v.containers).filter(isObj);
  if (box != null && !cs.some(c => c.id === box)) throw new Refused(`no box ${text(box)} on view ${text(v.id)}; its boxes: ${cs.map(c => c.id).join(', ') || 'none'}`);
  return cs.map(c => ({ ...c, nodeIds: [...arr(c.nodeIds).filter(x => x !== id), ...(c.id === box ? [id] : [])] }));
}

/* which of a type's palette entries (its elements, or its lines) a step names by `type`: its palette name ("User task",
   "Reply"), or its type when one entry alone has it (uml.Class); the index, or a refusal that lists them */
const kinds = ts => ts.map(t => (t.label && t.label !== t.type ? `${text(t.label)} (${t.type})` : t.type)).join(', ');
function entry(ts, want, what) {
  const by = f => ts.map((t, i) => (f(t) ? i : -1)).filter(i => i >= 0), low = String(want).toLowerCase();
  const named = by(t => typeof t.label === 'string' && t.label.toLowerCase() === low), typed = by(t => t.type === want);
  if (named.length) return named[0];
  if (typed.length === 1) return typed[0];
  throw new Refused(typed.length ? `${what} ${typed.length} kinds of ${text(want)}; give type as one's name: ${kinds(typed.map(i => ts[i]))}` : `${what} ${kinds(ts)}, not ${text(want)}`);
}

const STEPS = {
  async add_card(m, a) {
    const v = viewOf(m, a.view);
    if (typeof a.label !== 'string' || !a.label.trim()) throw new Refused('add_card: a card needs a label');
    let out;
    if (typedView(m, v)) {
      if (a.kind != null) throw new Refused(`add_card: kind is a map card's; on view ${text(v.id)} (${v.diagram}) give type`);
      const T = u.diagramOf(v) || {}, ts = arr(T.elements).filter(t => isObj(t) && typeof t.type === 'string');
      const i = a.type == null ? 0 : entry(ts, a.type, `add_card: view ${text(v.id)} (${v.diagram}) adds`);
      const ed = editorOn(m, v.id); ed.I.addNode(i); ed.type(a.label.trim()); await chosen(ed, a.choose, 'add_card');
      out = gave(ed, 'add_card');
    } else {
      if (a.type != null) throw new Refused(`add_card: type is a typed view's; on map view ${text(v.id)} give kind`);
      const id = newId(m, a.kind || 'card');
      out = { commands: [{ op: 'add', element: { id, label: a.label.trim(), ...(a.kind != null ? { kind: a.kind } : {}) }, view: v.id }], said: [] };
    }
    const id = added(out.commands).map(e => e.id).find(x => typeof x === 'string');
    out.commands = renamed(m, out.commands, id, a.id); out.id = a.id ?? id;
    if (a.box != null) { // then into its box, as a second gesture on the model with the card in it
      const r = await STEPS.move_to_box(u.apply(m, out.commands), { view: v.id, id: out.id, box: a.box, choose: a.choose });
      out.commands.push(...r.commands); out.said.push(...r.said.filter(x => !out.said.includes(x)));
    }
    return out;
  },
  async connect(m, a) {
    const v = viewOf(m, a.view), at = elements(m);
    for (const k of ['from', 'to']) if (!at.has(a[k]) && !arr(v.containers).some(c => isObj(c) && c.id === a[k])) throw new Refused(`connect: ${text(a[k])} is not an element`);
    let out;
    if (typedView(m, v)) {
      if (a.kind != null) throw new Refused(`connect: kind is a map line's; on view ${text(v.id)} (${v.diagram}) give type`);
      const T = u.diagramOf(v) || {}, ts = arr(T.lines).filter(t => isObj(t) && typeof t.type === 'string');
      if (a.type == null && ts.length > 1) throw new Refused(`connect: view ${text(v.id)} (${v.diagram}) draws ${ts.length} kinds of line; give type: ${kinds(ts)}`);
      const i = a.type == null ? 0 : entry(ts, a.type, `connect: view ${text(v.id)} (${v.diagram}) draws`);
      // L on the card `from`: the line is put after it (the slot after the element selected), as the page's L
      const ed = editorOn(m, v.id, { sel: { type: 'node', id: a.from, view: v.id } });
      // the page draws a line from a card to a card it draws on the view: a box (a package that holds cards) is neither end
      for (const k of ['from', 'to']) if (!Object.hasOwn(ed.geo.byId, a[k]))
        throw new Refused(`connect: ${nameOf(m, a[k]) === a[k] ? text(a[k]) : `${nameOf(m, a[k])} (${a[k]})`} is not drawn as a card on view ${text(v.id)}${arr(ed.geo.families).some(f => isObj(f) && f.id === a[k]) ? ' but as a box that holds cards' : ''}: the page draws a line between two of its cards`);
      ed.I.connect(a.from, a.to);
      if (ts.length > 1) await chosen(ed, i, 'connect');
      await chosen(ed, a.choose, 'connect');
      out = gave(ed, 'connect');
    } else {
      if (a.type != null) throw new Refused(`connect: type is a typed view's; on map view ${text(v.id)} give kind`);
      for (const k of ['from', 'to']) if (!arr(v.nodeIds).includes(a[k])) throw new Refused(`connect: ${text(a[k])} is not a card on view ${text(v.id)}`);
      out = { commands: [{ op: 'add', element: { id: newId(m, 'line'), from: a.from, to: a.to, ...(a.kind != null ? { kind: a.kind } : {}) }, view: v.id }], said: [] };
    }
    const line = added(out.commands).find(e => e.from != null || e.to != null);
    if (a.label != null) { if (!line) throw new Refused('connect: the change adds no line to label'); line.label = a.label; }
    const id = line && line.id;
    out.commands = renamed(m, out.commands, id, a.id); out.id = a.id ?? id;
    return out;
  },
  async rename(m, a) {
    if (typeof a.label !== 'string') throw new Refused('rename: label is text');
    const at = elements(m), vid = a.view ?? viewsShowing(m, a.id).map(v => v.id)[0], v = vid != null ? viewOf(m, vid) : null;
    if (v && !typedView(m, v) && !at.has(a.id) && arr(v.containers).some(c => isObj(c) && c.id === a.id)) { // a map view's box
      if (!a.label.trim()) throw new Refused('rename: a name is not empty');
      return { commands: [{ op: 'set', view: v.id, path: 'containers', value: arr(v.containers).map(c => (isObj(c) && c.id === a.id ? { ...c, label: a.label.trim() } : c)) }], said: [] };
    }
    if (!at.has(a.id)) throw new Refused(`rename: ${text(a.id)} is not an element`);
    const ed = editorOn(m, v ? v.id : arr(m.views).find(isObj)?.id), ref = at.get(a.id).kind === 'edge' ? { type: 'edge', ids: [a.id] } : { type: 'node', id: a.id };
    // F2's field: an empty name does nothing, but where the type's rename hook reads one (the timing ruler's unit)
    if (!a.label.trim() && !(v && typedView(m, v) && ed.I.empty && ed.I.empty(ref))) throw new Refused('rename: a name is not empty');
    if (v && typedView(m, v)) ed.I.label(ref, a.label.trim()); else ed.out.commands.push({ op: 'set', id: a.id, path: 'label', value: a.label.trim() });
    await chosen(ed, a.choose, 'rename');
    return gave(ed, 'rename');
  },
  async move_to_box(m, a) {
    const v = viewOf(m, a.view), at = elements(m);
    if (typedView(m, v)) {
      if (!at.has(a.id)) throw new Refused(`move_to_box: ${text(a.id)} is not an element`);
      if (a.box != null && !at.has(a.box)) throw new Refused(`move_to_box: ${text(a.box)} is not an element`);
      if ((at.get(a.id).x.parent ?? null) === (a.box ?? null)) throw new Refused(`move_to_box: ${text(a.id)} is in ${a.box == null ? 'no box' : text(a.box)} already`);
      // the properties panel's Owner field: the type's rule on owners (TYPED.owns), then its owner hook, else reparent
      const ed = editorOn(m, v.id, { sel: { type: 'node', id: a.id, view: v.id } }); ed.I.owner(a.id, a.box ?? null);
      await chosen(ed, a.choose, 'move_to_box');
      return gave(ed, 'move_to_box');
    }
    if (!arr(v.nodeIds).includes(a.id)) throw new Refused(`move_to_box: ${text(a.id)} is not a card on view ${text(v.id)}`);
    const was = arr(v.containers).find(c => isObj(c) && arr(c.nodeIds).includes(a.id));
    if ((was ? was.id : null) === (a.box ?? null)) throw new Refused(`move_to_box: ${text(a.id)} is in ${a.box == null ? 'no box' : text(a.box)} already`);
    return { commands: [{ op: 'set', view: v.id, path: 'containers', value: boxesWith(v, a.id, a.box ?? null) }], said: [] };
  },
  async remove(m, a) {
    const ids = Array.isArray(a.ids) ? a.ids : [a.ids], at = elements(m);
    if (!ids.length) throw new Refused('remove: no ids');
    for (const id of ids) if (!at.has(id)) throw new Refused(`remove: ${text(id)} is not an element`);
    if (a.view == null && !a.from_model) throw new Refused('remove: give the view to take them out of, or from_model: true to delete them from the model');
    // Delete takes them out of the view, Shift + Delete out of the model: the type's remove hook first, as the page's
    const vid = a.view ?? viewsShowing(m, ids[0]).map(v => v.id)[0] ?? arr(m.views).find(isObj)?.id;
    if (vid == null) return { commands: ids.map(id => ({ op: 'delete', id })), said: [] };
    const ed = editorOn(m, viewOf(m, vid).id); ed.I.remove(!!a.from_model, ids);
    await chosen(ed, a.choose, 'remove');
    return gave(ed, 'remove');
  },
  async set_field(m, a) {
    const path = a.path, value = Object.hasOwn(a, 'value') ? a.value : undefined;
    if (a.id == null) { // a view's own field
      if (a.view == null) throw new Refused('set_field: give id (an element) or view (the view itself)');
      return { commands: [{ op: 'set', view: viewOf(m, a.view).id, path, value }], said: [] };
    }
    if (!elements(m).has(a.id)) throw new Refused(`set_field: ${text(a.id)} is not an element`);
    const vid = a.view ?? viewsShowing(m, a.id).map(v => v.id)[0], v = vid != null ? viewOf(m, vid) : null;
    const set = { op: 'set', id: a.id, path, value };
    if (!v || !typedView(m, v)) return { commands: [set], said: [] };
    // a field of the properties panel: the type's field hook first (a SysML part's Name renames its role too), else the set
    const ed = editorOn(m, v.id, { sel: { type: 'node', id: a.id, view: v.id } }); ed.I.field(a.id, path, value, () => { ed.out.commands.push(set); return true; });
    await chosen(ed, a.choose, 'set_field');
    return gave(ed, 'set_field');
  },
  async pin(m, a) {
    const v = viewOf(m, a.view);
    if (!arr(v.nodeIds).includes(a.id) && ![...arr(v.nodes)].some(n => isObj(n) && n.id === a.id)) throw new Refused(`pin: ${text(a.id)} is not a card on view ${text(v.id)}`);
    if (a.col == null && a.row == null) {
      if (!isObj(v.layout) || !Object.hasOwn(v.layout, a.id)) throw new Refused(`pin: ${text(a.id)} has no pin on view ${text(v.id)}`);
      return { commands: [{ op: 'set', view: v.id, path: ['layout', a.id], value: undefined }], said: [] };
    }
    if (!Number.isInteger(a.col) || !Number.isFinite(a.row) || a.col < 0 || a.row < 0) throw new Refused('pin: col (a whole number) and row (a number, 2.5 between two rows) from 0, both given (neither: take the pin off)');
    if (typedView(m, v)) { // the page's pin (a drag in its box, Alt + arrows): refused where the type lays its cards out itself
      const L = (u.diagramOf(v) || {}).layout || {};
      if (L.pins === false) throw new Refused(`pin: a ${v.diagram} view places its elements itself, so it keeps no pins`);
      // the type's rule on a card's rank and row, as Alt + arrows ask it (layout.keepsRank across ranks, keepsRow along them)
      let geo, g; try { geo = u.layout(m, v.id); g = geo.byId[a.id]; } catch { g = null; }
      const ask = (k, d) => typeof L[k] === 'function' && L[k](m, v, a.id, geo, d);
      const why = g && Number.isFinite(g.col) && (g.col !== a.col && ask('keepsRank', [Math.sign(a.col - g.col), 0]) || g.row !== a.row && ask('keepsRow', [0, Math.sign(a.row - g.row)]));
      if (why) throw new Refused(`pin: ${typeof why === 'string' ? why : `${nameOf(m, a.id)} keeps its place along this axis`}`);
    }
    return { commands: [{ op: 'set', view: v.id, path: ['layout', a.id], value: [a.col, a.row] }], said: [] };
  },
};

/* what a change adds: each entry of `after` beyond as many as `before` has, by a key */
function more(before, after, key) {
  const n = new Map(); before.forEach(x => n.set(key(x), (n.get(key(x)) || 0) + 1));
  return after.filter(x => { const k = key(x), c = n.get(k) || 0; if (c) { n.set(k, c - 1); return false; } return true; });
}
const safe = (f, dflt) => { try { return f(); } catch { return dflt; } };

/* The model's new text, written as its file is: every value the change leaves alone is its own text from the file, as it
   was (its spacing, its line breaks, its escapes); a key or an item the change sets, adds or takes out is spliced into its
   object or list where it was, or at its end, between separators like its neighbours'. So a change of one card is a diff of
   a line or two, not of the whole file. A value the file does not hold yet is written on one line in the file's own spacing,
   or one key or item per line at its indent when it is long. */
function parsed(src) { // the file's JSON with where each value is: { start, end, kind: 'o' | 'a' | 'v', keys (key -> its start) | items }
  let i = 0;
  const ws = () => { while (i < src.length && ' \t\n\r﻿'.includes(src[i])) i++; };
  const str = () => { const s = i; i++; while (src[i] !== '"') i += src[i] === '\\' ? 2 : 1; i++; return JSON.parse(src.slice(s, i)); };
  const val = () => {
    ws(); const start = i, c = src[i];
    if (c === '{') { i++; const keys = []; ws();
      if (src[i] !== '}') for (;;) { ws(); const at = i, k = str(); ws(); i++; keys.push({ k, at, n: val() }); ws(); if (src[i++] === '}') break; }
      else i++;
      return { start, end: i, kind: 'o', keys }; }
    if (c === '[') { i++; const items = []; ws();
      if (src[i] !== ']') for (;;) { const n = val(); items.push({ at: n.start, n }); ws(); if (src[i++] === ']') break; }
      else i++;
      return { start, end: i, kind: 'a', items }; }
    if (c === '"') { str(); return { start, end: i, kind: 'v' }; }
    while (i < src.length && !',]} \t\n\r'.includes(src[i])) i++;
    return { start, end: i, kind: 'v' };
  };
  return val();
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function written(src, before, after) {
  let root; try { root = parsed(src); } catch { root = null; }
  if (!root || !same(JSON.parse(src.slice(root.start, root.end)), before)) return JSON.stringify(after, null, 2) + '\n';
  const lines = src.includes('\n'), unit = (src.match(/\n([ \t]+)\S/) || [, '  '])[1]; // the file's indent: its first indented line's
  const more = (a, b) => (src.match(a) || []).length > (src.match(b) || []).length; // the file's spacing inside braces, and inside brackets
  const st = { padO: more(/\{ "/g, /\{"/g), padA: more(/\[ [^\s\]]/g, /\[[^\s\]]/g), sep: lines || /, /.test(src) ? ', ' : ',', colon: lines || /": /.test(src) ? ': ' : ':' };
  const lead = at => { let j = at; while (j > 0 && (src[j - 1] === ' ' || src[j - 1] === '\t')) j--; return j === 0 || src[j - 1] === '\n' ? src.slice(j, at) : null; };
  const flat = v => { if (!v || typeof v !== 'object') return JSON.stringify(v);
    const ps = Array.isArray(v) ? v.map(flat) : Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + st.colon + flat(x));
    const [o, c] = Array.isArray(v) ? ['[', ']'] : ['{', '}'], pad = (Array.isArray(v) ? st.padA : st.padO) ? ' ' : ''; return ps.length ? o + pad + ps.join(st.sep) + pad + c : o + c; };
  // a value the file does not hold: on one line where its neighbours are (one: an item or key among one-line ones), or
  // when short; else one key or item per line
  const fresh = (v, ind, one = false) => {
    if (!v || typeof v !== 'object' || !lines || one || flat(v).length + ind.length <= 100) return flat(v);
    const arr = Array.isArray(v), ps = arr ? v.map(x => fresh(x, ind + unit)) : Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ': ' + fresh(x, ind + unit));
    return ps.length ? (arr ? '[' : '{') + '\n' + ps.map(p => ind + unit + p).join(',\n') + '\n' + ind + (arr ? ']' : '}') : arr ? '[]' : '{}'; };
  // n: the value's node in the file, or null; ind: the indent of the line it starts on
  const out = (n, v, ind) => {
    const was = n && src.slice(n.start, n.end);
    if (n && same(JSON.parse(was), v)) return was;
    const arr = Array.isArray(v);
    if (!n || !v || typeof v !== 'object' || n.kind !== (arr ? 'a' : 'o')) return fresh(v, ind);
    const olds = arr ? n.items : n.keys;
    if (!olds.length) return fresh(v, ind);
    // a new item goes on one line when items of its shape there are on one line
    const oneLine = x => { const k = Array.isArray(x) ? 'a' : x && typeof x === 'object' ? 'o' : 'v';
      return olds.some(o => o.n.kind === k && !src.slice(o.n.start, o.n.end).includes('\n')); };
    // the entries it keeps, in its order, each with the old one it is (by id for items with ids, else by place), or none
    let pairs;
    if (arr) {
      const idOf = x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string' ? x.id : null;
      const oldIds = olds.map(o => idOf(JSON.parse(src.slice(o.n.start, o.n.end)))), byId = oldIds.some(x => x != null);
      const used = new Set();
      pairs = v.map((x, k) => { const j = byId ? oldIds.findIndex((id, q) => id != null && id === idOf(x) && !used.has(q)) : k < olds.length ? k : -1;
        if (j >= 0) used.add(j); return { j, text: o => (o ? out(o.n, x, ind + unit) : fresh(x, ind + unit, oneLine(x))) }; });
      const kept = pairs.map(p => p.j).filter(j => j >= 0);
      if (kept.some((j, q) => q && j < kept[q - 1])) return fresh(v, ind); // reordered: written again
    } else {
      const ents = Object.entries(v).filter(([, x]) => x !== undefined);
      pairs = [...olds.map((o, j) => ents.some(([k]) => k === o.k) ? { j, text: () => JSON.stringify(o.k) + src.slice(o.at + JSON.stringify(o.k).length, o.n.start) + out(o.n, v[o.k], ind + unit) } : null).filter(Boolean),
        ...ents.filter(([k]) => !olds.some(o => o.k === k)).map(([k, x]) => ({ j: -1, text: () => JSON.stringify(k) + st.colon + fresh(x, (lead(olds[0].at) ?? ind + unit), !src.slice(n.start, n.end).includes('\n')) }))];
    }
    // the separators: before each old entry, what was before it; a new one, the last separator there was
    const gap = j => src.slice(olds[j - 1].n.end, olds[j].at), gaps = olds.map((_, j) => (j ? gap(j) : null)).filter(x => x != null);
    const between = gaps.at(-1) ?? (lead(olds[0].at) != null ? ',\n' + lead(olds[0].at) : st.sep);
    let body = '', first = true;
    for (const p of pairs) {
      const t = p.text(p.j >= 0 ? olds[p.j] : null);
      body += first ? t : (p.j > 0 ? gap(p.j) : between) + t; first = false;
    }
    return src.slice(n.start, olds[0].at) + body + src.slice(olds.at(-1).n.end, n.end);
  };
  const text = src.slice(0, root.start) + out(root, after, '') + src.slice(root.end);
  let back; try { back = JSON.parse(text.replace(/^\ufeff/, '')); } catch { back = undefined; }
  return same(back, after) ? text : JSON.stringify(after, null, 2) + '\n'; // a splice gone wrong: the model, written plainly
}

async function main() {
  let s = ''; for await (const c of process.stdin) s += c;
  const { model, steps, source } = JSON.parse(s);
  let m = model;
  const done = [];
  for (const [i, step] of arr(steps).entries()) {
    let r;
    try {
      if (!isObj(step)) throw new Refused('a step is an object: an edit tool\'s call ({ tool, ... }) or an apply() command ({ op, ... })');
      if (step.op != null) r = { commands: [step], said: [] };
      else if (Object.hasOwn(STEPS, step.tool)) r = await STEPS[step.tool](m, step);
      else throw new Refused(`${text(step.tool)} is not an edit tool (${Object.keys(STEPS).join(', ')})`);
      m = u.apply(m, r.commands);
    } catch (e) {
      return { error: String(e && e.message || e), step: i };
    }
    done.push({ step: step.tool ?? step.op, ...r });
  }
  const errs = x => safe(() => u.validate(x), []), probs = more(errs(model), errs(m), p => p.level + '\u0000' + p.message);
  const d = safe(() => u.diff(model, m), { summary: [], views: [] });
  const has = (x, vid) => arr(x.views).some(v => isObj(v) && v.id === vid);
  const layout = d.views.filter(vid => has(m, vid)).flatMap(vid => more(has(model, vid) ? safe(() => u.check(model, vid), []) : [], safe(() => u.check(m, vid), []), x => x.message).map(x => x.message));
  const rules = more(safe(() => u.rules(model), []), safe(() => u.rules(m), []), x => x.message).map(x => x.message);
  return { steps: done, commands: done.flatMap(x => x.commands), model: m, text: typeof source === 'string' ? written(source, model, m) : JSON.stringify(m, null, 2) + '\n',
    summary: d.summary, views: d.views, problems: probs, rules, layout };
}

export { written };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(JSON.stringify(await main()));
