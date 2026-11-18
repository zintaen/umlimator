import { jsonText, labelOr } from './model.js';
/* ---------- diagram types (work package 1.3) ----------
   A typed view's `diagram` names its type; a view with none is a map, and the map registers itself as the default
   (src/map/typed.js). A type this release does not know is drawn as plain cards, with a warning. Internal until the
   API is documented. */
const TYPES = new Map();

function registerDiagramType(name, def = {}) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(name)) throw new TypeError(`a diagram type's name is <notation> or <notation>.<kind> (uml.class), not ${jsonText(name)}`);
  if (TYPES.has(name)) throw new Error(`diagram type "${name}" is registered already`);
  const type = Object.freeze({ ...(def.ownNodes === false ? def : withOwnNodes(def)), name });
  TYPES.set(name, type);
  return type;
}

/* A typed view's own nodes (view.nodes: what apply()'s add { in: 'view' } puts there, docs/editing.md "From 0.18.0") read as
   the model's, for every type (audit 22 did five, audit 23 all): ownMerge(model, views) is the model with the views' own
   nodes after its nodes, one whose id a model node takes being that node (as mapContext reads them); at: each one's
   [view index, place in view.nodes], k: where they start in nodes. registerDiagramType gives a type's layout, boxes,
   validate, describe, rows, text, word, owners and edits that model, and says a problem at one of them at its own path,
   views[i].nodes[j]. A type that reads view.nodes itself says ownNodes: false. Its edits are held to one rule too (ownGuard):
   a model node never has a parent other views lack */
const R_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), R_ARR = x => (Array.isArray(x) ? x : []);
function ownMerge(model, views) {
  const base = R_ARR(R_OBJ(model) ? model.nodes : null), ids = new Set(base.filter(R_OBJ).map(n => n.id)), add = [], at = [], all = R_ARR(R_OBJ(model) ? model.views : null);
  views.forEach(v => { const vi = all.indexOf(v); R_ARR(R_OBJ(v) ? v.nodes : null).forEach((n, j) => { if (R_OBJ(n) && typeof n.id === 'string' && !ids.has(n.id)) { ids.add(n.id); add.push(n); at.push([vi, j]); } }); });
  return { model: add.length ? { ...model, nodes: [...base, ...add] } : model, at, k: base.length };
}
const ownNodes = (model, view) => ownMerge(model, [view]);
// what one view alone holds: its own nodes (none a model element's id takes) and their members, at any depth, by id
function heldBy(model) {
  // members on a stack, in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const mine = new Set(), out = new Map(), put = (x0, s) => { for (const q = [x0]; q.length;) { const x = q.pop(); if (!R_OBJ(x) || typeof x.id !== 'string' || s.has(x.id)) continue;
    if (s === out) out.set(x.id, x); else s.add(x.id); const ms = R_ARR(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) q.push(ms[j]); } };
  [...R_ARR(R_OBJ(model) ? model.nodes : null), ...R_ARR(R_OBJ(model) ? model.edges : null)].forEach(x => put(x, mine));
  R_ARR(R_OBJ(model) ? model.views : null).forEach(v => R_ARR(R_OBJ(v) ? v.nodes : null).forEach(n => { if (R_OBJ(n) && !mine.has(n.id)) put(n, out); }));
  return out;
}
/* a hook's result held to the rule: an add of a model node under what one view alone holds is added to that view (in:
   'view', as mindmap's add does since audit 22) where its palette takes it, else with no parent; a reparent of a model
   element under one is refused, said on the hint line (audit 23: an action added in a view's own partition, deleted with it) */
function ownGuard(model, r) {
  if (R_OBJ(r) && Array.isArray(r.pick) && typeof r.then === 'function') return { ...r, then: i => ownGuard(model, r.then(i)) };
  const list = Array.isArray(r) ? r : R_OBJ(r) && Array.isArray(r.commands) ? r.commands : null; if (!list) return r;
  const held = heldBy(model), hold = x0 => { for (const q = [x0], seen = new Set(); q.length;) { const x = q.pop(); if (!R_OBJ(x) || typeof x.id !== 'string' || seen.has(x)) continue; seen.add(x); held.set(x.id, x); for (const y of R_ARR(x.members)) q.push(y); } }, out = [];
  for (const c of list) {
    const x = R_OBJ(c) && c.op === 'add' && R_OBJ(c.element) ? c.element : null;
    // where add { in: 'view' } puts it (apply.js): a view's nodes, not its lines nor its fragments (a sequence's)
    const node = () => { const v = R_ARR(model.views).find(w => R_OBJ(w) && w.id === c.view), T = v ? diagramOf(v) || {} : {}, pal = R_ARR(T.elements);
      return !!v && x.from == null && x.to == null && !R_ARR(T.items).includes(x.type) && (!pal.length || pal.some(t => R_OBJ(t) && t.type === x.type)); };
    if (x && c.in === 'view') { if (node()) hold(x); }
    else if (x && c.owner == null && x.from == null && x.to == null && x.parent != null && held.has(x.parent)) {
      if (node()) { out.push({ ...c, in: 'view' }); hold(x); continue; }
      const { parent, ...y } = x; out.push({ ...c, element: y }); continue; }
    else if (R_OBJ(c) && c.op === 'reparent' && c.parent != null && held.has(c.parent) && !held.has(c.id)) {
      const p = held.get(c.parent); return { error: `${String(labelOr(p.label, p.id))} lives in this view only: an element of the model cannot go under it` }; }
    else if (R_OBJ(c) && c.op === 'move' && c.owner != null && held.has(c.owner) && !held.has(c.id)) { // a member moved to a new owner: the same rule (audit 35)
      const p = held.get(c.owner); return { error: `${String(labelOr(p.label, p.id))} lives in this view only: an element of the model cannot go under it` }; }
    out.push(c);
  }
  return Array.isArray(r) ? out : { ...r, commands: out };
}
// each hook wrapped once, by kind: a function two types share (C4's four static names, the Owner field of class and object
// views) stays one function
const OWN_WRAPS = new Map(), ownWrap = (kind, f, make) => { const w = OWN_WRAPS.get(kind) || OWN_WRAPS.set(kind, new WeakMap()).get(kind);
  if (!w.has(f)) w.set(f, Object.assign(make(f), f)); return w.get(f); }; // a hook's own fields (rename.empty, layout.rank) stay
function withOwnNodes(def) {
  const out = { ...def }, L = def.layout, views = model => R_ARR(R_OBJ(model) ? model.views : null), viewOf = (model, id) => views(model).find(v => R_OBJ(v) && v.id === id);
  const M = (model, view) => ownNodes(model, R_OBJ(view) ? view : viewOf(model, view)).model; // a view, or its id (mindmap's hooks take either)
  const typed = model => views(model).filter(v => R_OBJ(v) && v.diagram != null && v.diagram !== 'map'), all = model => ownMerge(model, typed(model));
  const said = (o, ps) => (!o.at.length || !Array.isArray(ps) ? ps : ps.map(p => { const r = /^nodes\[(\d+)\]/.exec(String((R_OBJ(p) ? p.path : '') ?? '')), i = r ? Number(r[1]) - o.k : -1;
    return i >= 0 && i < o.at.length ? { ...p, path: `views[${o.at[i][0]}].nodes[${o.at[i][1]}]` + p.path.slice(r[0].length) } : p; }));
  if (typeof L === 'function') out.layout = ownWrap('layout', L, f => a => f({ ...a, model: M(a.model, a.view) }));
  else if (R_OBJ(L) && typeof L.run === 'function') out.layout = { ...L, run: ownWrap('run', L.run, f => (model, view, o) => f(M(model, view), view, o)) };
  ['boxes', 'rows', 'text'].forEach(k => { if (typeof def[k] === 'function') out[k] = ownWrap('view', def[k], f => (model, view, ...rest) => f(M(model, view), view, ...rest)); });
  // with no view (the PDF's word, the Owner field asked by a host): every view's own nodes
  if (typeof def.word === 'function') out.word = ownWrap('word', def.word, f => (model, id, view) => f(view ? M(model, view) : all(model).model, id));
  // the Owner field: a view's own owners too, for what one view alone holds; never for a model element (ownGuard's rule)
  if (typeof def.owners === 'function') out.owners = ownWrap('owners', def.owners, f => (model, x, view) => { const os = f(view ? M(model, view) : all(model).model, x), held = heldBy(model);
    return Array.isArray(os) && R_OBJ(x) && !held.has(x.id) ? os.filter(o => !(R_OBJ(o) && held.has(o.id))) : os; });
  if (typeof def.validate === 'function') out.validate = def.validate.length < 2 ? ownWrap('validate1', def.validate, f => model => { const o = all(model); return said(o, f(o.model)); })
    // a view's, its own nodes first, then the other typed views' (audit 24: a model line from one view's own node is not "from
    // nothing" to another view's rules); a problem at another view's own node is that view's to say, not this one's
    : ownWrap('validate', def.validate, f => (model, view) => { const vs = typed(model), o = ownMerge(model, [view, ...vs.filter(v => v !== view)]), vi = views(model).indexOf(view);
      return said(o, f(o.model, view)).filter(p => { const r = /^views\[(\d+)\]\.nodes\[/.exec(String((R_OBJ(p) ? p.path : '') ?? '')); return !r || Number(r[1]) === vi || !o.at.some(([i]) => i === Number(r[1])); }); });
  if (typeof def.describe === 'function') out.describe = ownWrap('describe', def.describe, f => (model, viewId) => f(M(model, viewOf(model, viewId)), viewId));
  if (R_OBJ(def.edits)) { const ed = {}; Object.getOwnPropertyNames(def.edits).forEach(k => { const d = Object.getOwnPropertyDescriptor(def.edits, k);
      // remove tells a view's own node from the model's: it gets the model as it is
      if (typeof d.value === 'function') d.value = ownWrap(k === 'remove' ? 'remove' : 'edit', d.value, f => (model, view, ...rest) => { const V = R_OBJ(view) ? view : viewOf(model, view);
        return ownGuard(model, f(k === 'remove' || !V ? model : M(model, V), view, ...rest)); });
      Object.defineProperty(ed, k, d); });
    out.edits = ed; }
  return out;
}

/* A definition's fields are optional and provisional; absent, things go as before. notes/spike-sequence.md §1 says what
   each does (validate(model) with no view runs once a type, not once a view); 1.9's: rankFlip, member, rules, describe.
   2.1's (notes/stage-2.md §3, §4.2, §8):
   - boxes(model, view) -> [{ id, label, title, nodeIds, parent, shape, aria }]: the view's boxes, a map's container format plus
     the drawn title, the shape whose frame(f) draws it (SHAPE, src/draw/shapes.js: its border with class family-box, its title
     with class family-title, as svg.js says) and its accessible name. A box's id is in the view's nodeIds but takes no slot:
     the layout context places its nodeIds as a block (blockPos), and the type's layout passes the same boxes to layoutTyped as
     containers. A drop into, out of or between boxes emits reparent, and removes the node's pin; an edit that changes the box
     a shown element is drawn in lays the view out again (render.js withPlaces). None: no boxes, as before.
   - owners(model, element) -> [{ id, label }]: the properties panel's Owner field for that element, a select of these and
     "none", which emits reparent, or what the type's edits.owner returns (src/typed/edit.js) (the element itself and what it
     holds are left out; its owner is added when not offered).
     None, or not a list: no Owner field.
   - layout.pins false: pos is {}, no ranking; layout.rank false: pos is the view's pins alone, no ranking (risks.md P1).
     reroute is no registry field: reroute: false goes in the dg the type's own layout passes to layoutTyped (src/typed/layout.js).
   Stage 4's (notes/stage-4.md §12.1, §15): edits.rename(model, view, id, text); a hook's { pick, then }; name: false and
   opens on a palette entry; a line's cut, its label's width (150); rows(model, view, id) and word(model, id), the PDF's.
   Stage 5's: a line's fromPort, toPort, inner, portRank, a box's pad, round, head, a view's labelGaps (src/typed/layout.js);
   edits.member, edits.key (src/typed/edit.js). Audit 18's: steps true, a view whose lines are numbered by their order in its
   edges (a C4 dynamic view), so diff() says a reorder as it does a map's sequence. Audit 21's: unnamed, the element types
   whose label nothing draws nor says (a combined fragment, a transition): the properties panel offers them no Name field. */

/* An element's kind in words, one rule for every type and the PDF (audit 30): a type's last part split at its capitals,
   first letter up ('uml.DataType' "Data type"); a type of no notation, no dot, as written ("toString", "dataflow"), as audit 26
   names one; no type, or "", is no word (''): the type's untypedKind names it. untypedKind(T): the kind a type draws and names
   an element of no type (or "") as, its `untyped` field ("Task", "Lifeline"), "Element" by default, null for a type that does
   not draw one. untypedLine(T): what it draws a line of no notation as (no type, "", or no dot), its `untypedLine` field
   ("Data flow"), "Line" (a plain line) by default, null for none; a type with drawsOnly draws none */
const kindWord = t => { const s = String(t ?? ''); if (!s.includes('.')) return s;
  const w = s.split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); return w.charAt(0).toUpperCase() + w.slice(1); };
const untypedKind = T => (T && Object.hasOwn(T, 'untyped') ? T.untyped : 'Element');
const untypedLine = T => (!T ? 'Line' : Array.isArray(T.drawsOnly) ? null : Object.hasOwn(T, 'untypedLine') ? T.untypedLine : 'Line');
// the kind an element is drawn, edited and judged as in a view of type T (audit 30): its type's `untypedAs`, a type (an element of
// no type, or "", drawn as a class: 'uml.Class') or a function of the element (the object view's instance of no UML kind), else its own type
const drawnKind = (T, x) => { if (!x || typeof x !== 'object') return undefined; const a = T && T.untypedAs, k = typeof a === 'function' ? a(x) : x.type == null || x.type === '' ? a : null; return k || x.type; };
const aWord = w => (/^(?!us|uni)[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
// a count of a kind word that varies (a kind outside the view's own): "2 classes", "2 activities", "2 people", never "2 classs" (audit 32)
const countOf = (k, w) => `${k} ${k === 1 ? w : /person$/i.test(w) ? w.slice(0, -4) + 'ople' : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : w + 's'}`;
// x's kind in a message, as a view of type T draws it, with its article: "an interface", "a class" (of no type in a class view), "an
// element" (of no type where T draws none, or with no T), never the type's tail behind a fixed "a" (audit 31: "a undefined", "a Interface")
const aKind = (T, x) => aWord((kindWord(drawnKind(T, x)) || untypedKind(T) || 'Element').toLowerCase());

/* A view's type: the map for a view with no diagram, the registered type, or null for one this release does not draw */
const diagramOf = view => TYPES.get(view && view.diagram != null ? view.diagram : 'map') || null;

/* What only a registered type's geometry uses, installed at load time by the files under src/typed/, which only
   lib/umlimator-all.js holds (tools/build.mjs): rows, rooms and routes in layoutPass, a typed line's ends in svgOf, the
   gestures of edit.js it takes over (edit), diff()'s words for typed models (diff, order: src/uml/diff.js). Empty in
   umlimator.js, where no view is laid out but as a map (risks.md C5).
   Stage 6's: across(model), validate()'s rules on the whole model; fields(model, x), more panel fields (notes/stage-6.md §5)
   Milestone 2's (notes/milestone-2.md §6.3, §9): unfolds; text(model, view, id), the PDF's line text; ENDS open to
   families */
const TYPED = {};

// an id-keyed table with no prototype: an id named constructor, toString or __proto__ is an own key like any other
const idTable = (o = {}) => Object.assign(Object.create(null), o);
// a type is text: any other value (one with a toString key, which no key is read from) refers to nothing (audit 21)
const propRefs = type => typeof type !== 'string' ? {} : Object.assign({}, ...[...TYPES.values()].map(T => T.refs && Object.hasOwn(T.refs, type) && T.refs[type]));

export { registerDiagramType, diagramOf, kindWord, untypedKind, untypedLine, aWord, aKind, countOf, drawnKind, propRefs, idTable, TYPED, ownNodes, heldBy, ownGuard };
