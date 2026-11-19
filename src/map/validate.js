import { jsonText, labelOr, labelProblem, lineNames, listOf, typedProblems, unreadable, versionProblem } from '../core/model.js';
import { TYPED, diagramOf, drawnKind } from '../core/registry.js';
import { held } from '../core/warn.js';
import { SHAPE_NAMES, shapeOf } from '../draw/shapes.js';
import { boxHolds, mapContext } from './context.js';
import { ALIAS, KIND, MAPK, hasKey, kindOf } from './kinds.js';

const WIRE_KINDS = ['calls', 'feeds', 'triggers', 'state', 'guard'], SIDES = ['left', 'right', 'top', 'bottom'];
/* A typed view's panel text fields (its type's props: a C4 element's description, a guard, a lifeline's represents, a column's
   type) on the elements it lists, its nodes, their members and its lines, each drawn or said as text: one that is not text is
   drawn "[object Object]", said as a label is, at its own path (audit 43: the structural views' instance classifier, link
   association, end role, collaboration use, port and role types were drawn so with no warning, and every other type's fields).
   A field its type marks drawn: false (a reference: a reply's call, a use's interaction, a call activity's element) is never
   drawn, so its warning says the panel alone shows it (audit 44: each was said "drawn as" what no picture held); drawn: a
   function (model, element) says whether some view draws it, as a C4 deployment node's description is on a leaf, never on a box
   (audit 45) */
const NOT_DRAWN = 'not drawn, and the panel shows it as';
function fieldTextProblems(m, v, T, memos = new Map()) {
  const memoOf = f => memos.get(f) || memos.set(f, new Map()).get(f);
  const F = T && T.props && typeof T.props === 'object' ? T.props : null; if (!F) return [];
  const arr = x => (Array.isArray(x) ? x : []), obj = x => x && typeof x === 'object' && !Array.isArray(x), out = [], vi = arr(m.views).indexOf(v), shown = new Set(arr(v.nodeIds)), mems = new Set();
  const check = (x, at, kind) => { if (!obj(x.props) || typeof kind !== 'string' || !Object.hasOwn(F, kind)) return;
    arr(F[kind]).forEach(f => { if (!obj(f) || f.kind !== 'text' || typeof f.key !== 'string') return; const path = Array.isArray(f.path) ? f.path.map(String) : [f.key];
      let o = x.props; for (const k of path.slice(0, -1)) o = obj(o) && Object.hasOwn(o, k) ? o[k] : undefined;
      const key = path[path.length - 1], where = `${at}.props${path.slice(0, -1).map(k => '.' + k).join('')}`;
      // drawn asked only of a value that is not text, to word its warning (audit 46: a C4 deployment node's text description
      // ran depLeaf, a depPic per view, on every node: validate() went quadratic); memo: one per validate() run, for drawn's own use
      const p = obj(o) && Object.hasOwn(o, key) ? labelProblem(o, where, key) : null;
      if (p) out.push(f.drawn === false || (typeof f.drawn === 'function' && !f.drawn(m, x, memoOf(f))) ? labelProblem(o, where, key, NOT_DRAWN) : p); }); };
  const nodes = new Map(); [...arr(m.nodes).map((n, i) => [n, `nodes[${i}]`]), ...arr(v.nodes).map((n, j) => [n, `views[${vi}].nodes[${j}]`])].forEach(([n, at]) => { if (obj(n) && typeof n.id === 'string' && !nodes.has(n.id)) nodes.set(n.id, [n, at]); });
  shown.forEach(id => { if (!nodes.has(id)) return; const [n, at] = nodes.get(id); check(n, at, drawnKind(T, n));
    arr(n.members).forEach((x, j) => { if (obj(x)) { check(x, `${at}.members[${j}]`, x.type); mems.add(x.id); } }); });
  const lines = new Map(); arr(m.edges).forEach((e, i) => { if (obj(e) && typeof e.id === 'string' && !lines.has(e.id)) lines.set(e.id, [e, `edges[${i}]`]); });
  if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { const r = typeof e === 'string' ? lines.get(e) : obj(e) ? [e, `views[${vi}].edges[${j}]`] : null; if (r) check(r[0], r[1], r[0].type); });
  else { const on = id => shown.has(id) || mems.has(id); arr(m.edges).forEach((e, i) => { if (obj(e) && on(e.from) && on(e.to)) check(e, `edges[${i}]`, e.type); }); }
  return out;
}

/** A model's own problems, before anything is drawn: errors draw as holes or not at all (ids that are missing,
 *  repeated or name nothing, boxes inside themselves); warnings draw other than they say (an unknown kind or weight,
 *  a side that is not one, a view opened before the host has loaded it, a line to itself, which is not drawn). Each says where: `views[2].nodeIds[4]`. */
export function validate(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  // an object with a toString key is no text (String() throws on it): said, and the rest checked without it (audit 19)
  const read = unreadable(model), left = new Set(read.paths); model = read.model; read.paths.forEach(at => err(at, read.thrown.has(at) ? 'a value that throws when it is read (a getter, a Proxy): left out'
    : read.mute.has(at) ? 'a value no text is read from (a Symbol, or a toString, valueOf, toJSON or Symbol.toPrimitive that throws): left out' : 'an object with a "toString" key, which no text is read from: left out'));
  const arr = x => (Array.isArray(x) ? x : []), m = model && typeof model === 'object' ? model : {}, views = arr(m.views).filter(v => v && typeof v === 'object');
  const ver = versionProblem(m); if (ver) (ver.level === 'error' ? err : warn)('schemaVersion', ver.message); // a model this release cannot read is drawn wrongly: say so (F6)
  if (!Array.isArray(m.nodes)) err('nodes', 'the model needs a list of cards');
  if (!views.length) err('views', 'the model has no views');
  arr(m.views).forEach((v, i) => { if (!v || typeof v !== 'object') err(`views[${i}]`, 'a view is an object: left out'); });
  if (m.edges != null && !Array.isArray(m.edges)) err('edges', 'edges is a list: no line is drawn');
  const ids = new Set(), vids = new Set(), lineIds = new Set();
  // schema version 2: typed lines and typed views are the typed core's to check (src/core/model.js), the rest is a map's
  const typed = m.schemaVersion === 2, typedView = v => typed && v.diagram != null && v.diagram !== 'map';
  const card = (n, at) => {
    if (!n || typeof n.id !== 'string' || !n.id) return err(at + '.id', 'a card needs an id');
    if (ids.has(n.id)) err(at + '.id', `card id "${n.id}" is used twice`); ids.add(n.id);
    const k = String(n.kind ?? '').toLowerCase();
    if (n.kind != null && !(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(at + '.kind', `unknown kind "${n.kind}": drawn as a script card`);
    if (n.owner != null && typeof n.owner !== 'string') warn(at + '.owner', 'an owner is a name: ignored');
    const l = labelProblem(n, at); if (l) out.push(l);
    ['when', 'what', 'how', 'origin', 'author', 'note'].forEach(k => { if (n[k] != null && typeof n[k] !== 'string') warn(`${at}.${k}`, `${k} is text: drawn as written`); });
    if (n.source != null && !(typeof n.source === 'string' || Array.isArray(n.source) && n.source.every(s => typeof s === 'string'))) warn(at + '.source', 'source is a path or a list of paths: what is not text is ignored');
    list(n, at, 'verbs');
    shapeIs(n, at);
  };
  const shapeIs = (n, at) => { if (n && n.shape != null && !SHAPE_NAMES.includes(String(n.shape).toLowerCase())) warn(at + '.shape', `unknown shape "${n.shape}": drawn by its kind (the shapes: ${SHAPE_NAMES.join(', ')})`); };
  // a field that must be a list and is not: drawn as if missing (a view's cards: none)
  const list = (x, at, k, box) => { if (x[k] != null && !Array.isArray(x[k])) (k == 'nodeIds' ? err : warn)(`${at}.${k}`, `${k} is a list: ${k != 'nodeIds' ? 'ignored' : box ? 'the box holds no cards' : 'the view draws no cards'}`); };
  const gone = (x, at) => { if (x && x.shapes !== undefined) warn(at + 'shapes', 'shapes is no longer read: maps draw in one style'); }; // the box/c4/uml choice, removed in 0.21.0
  gone(m, '');
  if (m.meta && m.meta.root != null && typeof m.meta.root !== 'string') warn('meta.root', 'meta.root is a path: drawn as written');
  arr(m.nodes).forEach((n, i) => card(n, `nodes[${i}]`));
  views.forEach((v, i) => arr(v.nodes).forEach((n, j) => card(n, `views[${i}].nodes[${j}]`)));
  views.forEach((v, i) => { if (typeof v.id !== 'string' || !v.id) err(`views[${i}].id`, 'a view needs an id'); else if (vids.has(v.id)) err(`views[${i}].id`, `view id "${v.id}" is used twice`); else vids.add(v.id);
    const t = labelProblem(v, `views[${i}]`, 'title'); if (t) out.push(t); // a title that is not text, as a card's label (audit 31)
    // its caption, description and note are drawn too: the About box, the PDF's contents and page header, a walkthrough's note (audit 39)
    ['caption', 'description', 'note'].forEach(k => { const c = labelProblem(v, `views[${i}]`, k); if (c) out.push(c); }); });
  // the map's, a story's, a lens's, a rule's and a lane's title are drawn too: the brand, the menus, a rule's mark (audit 34)
  const titled = (x, at, key = 'title') => { const t = labelProblem(x, at, key); if (t) out.push(at ? t : { ...t, path: key }); };
  titled(m, '');
  views.forEach((v, i) => { if (Array.isArray(v.lanes)) v.lanes.forEach((l, j) => { if (l && typeof l === 'object') titled(l, `views[${i}].lanes[${j}]`, l.title == null || l.title === '' ? 'label' : 'title'); }); });
  if (m.root != null && !vids.has(m.root)) err('root', `root "${m.root}" is not a view`);
  const later = (x, at) => { if (x && x.opensView && !vids.has(x.opensView)) warn(at + '.opensView', `opens "${x.opensView}", a view the model does not have: fine if the host loads it when it is opened`); };
  arr(m.nodes).forEach((n, i) => later(n, `nodes[${i}]`));
  views.forEach((v, i) => { gone(v, `views[${i}].`); ['nodeIds', 'containers', 'intake', 'stepIds', 'tour', 'browserOrder'].forEach(k => list(v, `views[${i}]`, k)); });
  // a frontend card is drawn as a browser: a person's icon on one says the model means a person (0.15.0); not said of a card
  // only typed views hold, which keep their own notation (0.21.0)
  const typedOnly = id => { const vs = views.filter(v => arr(v.nodeIds).includes(id)); return vs.length && vs.every(v => typedView(v) && diagramOf(v)); };
  arr(m.nodes).forEach((n, i) => { if (!n || n.shape != null || !['user', 'users', 'usercheck'].includes(n.icon) || typedOnly(n.id)) return;
    if (shapeOf({ ...n, k: kindOf(n.kind, true) }) === 'browser') warn(`nodes[${i}].kind`, `"${labelOr(n.label, n.id)}" has a person's icon, but a ${n.kind} card is drawn as a browser: kind "person" (or shape "person") draws a person`); });
  const line = (e, at, ends) => {
    if (!e || typeof e !== 'object') return err(at, 'a line is an object with from and to');
    ['from', 'to'].forEach(k => { if (!ends.has(e[k])) err(`${at}.${k}`, `"${e[k]}" is neither a card nor a box`); });
    if (e.from != null && e.from === e.to) warn(at, `a line from "${e.from}" to itself: not drawn`); // a self-loop (risks.md F1); typed views will draw one
    if (e.kind != null && !WIRE_KINDS.includes(e.kind)) warn(at + '.kind', `unknown line kind "${e.kind}": drawn as calls`);
    const l = labelProblem(e, at); if (l) out.push(l);
    if (e.weight != null && ![1, 2, 3].includes(e.weight)) warn(at + '.weight', `weight ${jsonText(e.weight)} is not 1, 2 or 3: drawn as 1`);
    ['fromSide', 'toSide'].forEach(k => { if (e[k] != null && !SIDES.includes(e[k])) warn(`${at}.${k}`, `"${e[k]}" is not left, right, top or bottom: ignored`); });
    ['latency', 'cost'].forEach(k => { if (e[k] != null && !(typeof e[k] === 'number' && e[k] >= 0)) warn(`${at}.${k}`, `${k} ${jsonText(e[k])} is not a number of 0 or more: counted as 0`); }); // budgets (#95)
    if (e.step != null && !(typeof e.step === 'number' ? e.step >= 0 : typeof e.step === 'string' && e.step.length >= 1 && e.step.length <= 3))
      warn(at + '.step', `step ${jsonText(e.step)} is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written`);
  };
  // a card's id is no line's (model-and-schema.md): apply(), references() and a lens read one id space, where the card wins (audit 29)
  const shared = (e, at) => { if (typeof e.id === 'string' && ids.has(e.id)) err(at + '.id', `line id "${e.id}" is also a card's id`); };
  // a view's own line is in that id space too: an id another view's own line or a model line holds sends apply()'s set or delete, and
  // references(), to the first of them, not the line selected (audit 30). lineAt: each line id -> where it is first
  const lineAt = new Map(), ownLine = (e, at) => { if (e.id == null) return; if (lineAt.has(e.id)) err(at + '.id', `line id "${e.id}" is used twice (also ${lineAt.get(e.id)})`); else lineAt.set(e.id, at); };
  // a model line may end on any view's box (#28); a view's own line only on that view's boxes
  const anyBox = new Set(views.flatMap(v => arr(v.containers).map(c => c && c.id)));
  arr(m.edges).forEach((e, i) => { if (!(typed && e && e.type != null)) line(e, `edges[${i}]`, new Set([...ids, ...anyBox]));
    if (e && e.id != null) { if (lineIds.has(e.id)) err(`edges[${i}].id`, `line id "${e.id}" is used twice`); else lineAt.set(e.id, `edges[${i}]`); lineIds.add(e.id); shared(e, `edges[${i}]`); } });
  views.forEach((v, i) => { const lim = arr(v.nodeIds).length + 64; // a pin far off the grid, any view's: held there (context.js onGrid, layered.js)
    Object.entries(v.layout || {}).forEach(([id, p]) => { if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') warn(`views[${i}].layout.${id}`, `"${id}"'s place ${jsonText(p)} is not two numbers: ignored`);
      else if (p.some(x => !(Math.abs(x) <= lim))) warn(`views[${i}].layout.${id}`, `"${id}"'s place ${jsonText(p)} is off the grid: held at ${lim} columns or rows out`); });
    ['gap', 'rgap'].forEach(k => { if (v[k] != null && !(typeof v[k] === 'number' && v[k] > 0 && v[k] <= 2000)) warn(`views[${i}].${k}`, v[k] > 2000 && typeof v[k] === 'number' ? `${k} ${v[k]} is over 2000 px: drawn as 2000` : `${k} ${jsonText(v[k])} is not a number above 0: ignored`); });
    if (typedView(v)) return;
    const at = `views[${i}]`, mine = new Set(), boxes = Object.create(null), home = Object.create(null), full = new Set(); // no prototype: a box or card named toString is no box (M3, audit 8)
    if (v.parent != null && !vids.has(v.parent) && !ids.has(v.parent)) err(at + '.parent', `parent "${v.parent}" is not a view`);
    arr(v.nodeIds).forEach((id, j) => { if (!ids.has(id)) err(`${at}.nodeIds[${j}]`, `"${id}" is not a card`); else if (mine.has(id)) warn(`${at}.nodeIds[${j}]`, `"${id}" is listed twice: drawn twice`); mine.add(id); });
    Object.entries(v.nodeOverrides || {}).forEach(([id, o]) => { if (!ids.has(id)) err(`${at}.nodeOverrides.${id}`, `"${id}" is not a card`); later(o, `${at}.nodeOverrides.${id}`); shapeIs(o, `${at}.nodeOverrides.${id}`);
      const l = labelProblem(o, `${at}.nodeOverrides.${id}`); if (l) out.push(l); }); // its label is the card's here (audit 31)
    arr(v.nodes).forEach((n, j) => later(n, `${at}.nodes[${j}]`));
    ['stepIds', 'tour'].forEach(k => arr(v[k]).forEach((id, j) => { if (!mine.has(id)) err(`${at}.${k}[${j}]`, `"${id}" is not one of the view's cards`); }));
    arr(v.browserOrder).forEach((id, j) => { if (!vids.has(id)) err(`${at}.browserOrder[${j}]`, `"${id}" is not a view`); });
    arr(v.intake).forEach((s, j) => { if (!mine.has(s && s.to)) err(`${at}.intake[${j}].to`, `"${s && s.to}" is not one of the view's cards`); });
    arr(v.containers).forEach((c, j) => { if (!c || !c.id) err(`${at}.containers[${j}].id`, 'a box needs an id'); else if (Object.hasOwn(boxes, c.id)) err(`${at}.containers[${j}].id`, `box id "${c.id}" is used twice`); else if (mine.has(c.id)) err(`${at}.containers[${j}].id`, `box id "${c.id}" is one of the view's cards`); else boxes[c.id] = c; });
    const outer = b => { const a = new Set(); for (let p = b; boxes[p] && !a.has(p); p = boxes[p].parent) a.add(p); return a; }; // b and the boxes it sits in
    arr(v.containers).forEach((c, j) => { if (!c) return; list(c, `${at}.containers[${j}]`, 'nodeIds', 1); const l = labelProblem(c, `${at}.containers[${j}]`); if (l) out.push(l);
      arr(c.nodeIds).forEach((id, k) => { if (!mine.has(id)) return err(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards`);
        const h = home[id]; if (h && !outer(c.id).has(h) && !outer(h).has(c.id)) warn(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is in box "${h}" too, and neither box holds the other: they overlap`);
        if (!h || outer(c.id).has(h)) home[id] = c.id; for (let p = c.id; boxes[p] && !full.has(p); p = boxes[p].parent) full.add(p); });
      if (c.parent != null && !boxes[c.parent]) err(`${at}.containers[${j}].parent`, `"${c.parent}" is not a box of this view`);
      if (c.tone != null && typeof c.tone !== 'string') warn(`${at}.containers[${j}].tone`, `tone ${jsonText(c.tone)} is not a palette name (green, amber, ...): ${c.tone ? 'drawn in slate' : 'ignored'}`);
      for (let p = c.parent, seen = new Set([c.id]); p != null && boxes[p]; p = boxes[p].parent) { if (seen.has(p)) { err(`${at}.containers[${j}].parent`, `box "${c.id}" ends up inside itself`); break; } seen.add(p); } });
    arr(v.containers).forEach((c, j) => { if (c && boxes[c.id] === c && !full.has(c.id)) warn(`${at}.containers[${j}]`, `box "${c.id}" holds no cards: it is not drawn, nor its lines`); });
    const ends = new Set([...ids, ...Object.keys(boxes)]);
    const listed = new Set(), byId = new Map(Array.from(arr(m.edges), e => [e && e.id, e])), here = x => mine.has(x) || !!boxes[x]; // audit 7: a listed line is drawn once, between this view's cards and boxes
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { const p = `${at}.edges[${j}]`;
      if (typeof e !== 'string') { line(e, p, ends); if (e && typeof e === 'object') { shared(e, p); ownLine(e, p); } } else if (!lineIds.has(e)) return err(p, `"${e}" is not a line`); else if (listed.has(e)) return warn(p, `"${e}" is listed twice: drawn once`); else listed.add(e);
      const l = typeof e === 'string' ? byId.get(e) : e, off = l && [l.from, l.to].find(x => (ids.has(x) || anyBox.has(x)) && !here(x)); // a card or any view's box (audit 8)
      if (off != null) warn(p, `${typeof e === 'string' ? `"${e}"` : 'the line'} ends on "${off}", which is not one of the view's cards or boxes: not drawn`); });
    // a line from a box to a card or box inside it has no line (audit 11): said, as a line to itself is
    const inside = boxHolds(v), joins = (l, p) => { if (!l || typeof l !== 'object' || !here(l.from) || !here(l.to)) return;
      const [b, x] = inside(l.from, l.to) ? [l.from, l.to] : inside(l.to, l.from) ? [l.to, l.from] : [];
      if (b != null) warn(p, `joins the box "${b}" and "${x}", which it holds: not drawn${p.startsWith('edges[') ? ` in view "${v.id}"` : ''}`); };
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => joins(typeof e === 'string' ? byId.get(e) : e, `${at}.edges[${j}]`)); else arr(m.edges).forEach((e, j) => joins(e, `edges[${j}]`));
    Object.keys(v.layout || {}).forEach(id => { if (!mine.has(id)) warn(`${at}.layout.${id}`, `"${id}" is not one of the view's cards: its place is ignored`); });
    if (Array.isArray(v.lanes)) v.lanes.forEach((l, j) => arr(l && l.nodeIds).forEach((id, k) => { if (!mine.has(id)) warn(`${at}.lanes[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards: left out of the lane`); }));
  });
  // rules (#70): an id, and from, to or noCycles; a selector that names nothing picks nothing, and a misspelt kind picks script cards
  if (m.rules != null && !Array.isArray(m.rules)) err('rules', 'rules is a list');
  const ruleIds = new Set(), allBoxes = new Set(anyBox), each = (x, at, f) => (Array.isArray(x) ? x : [x]).forEach((y, j) => { if (y != null) f(y, Array.isArray(x) ? `${at}[${j}]` : at); });
  const owners = new Set([...arr(m.nodes), ...views.flatMap(v => [...arr(v.nodes), ...Object.values(v.nodeOverrides || {})])].map(n => n && n.owner).filter(o => typeof o === 'string'));
  const pick = (s, at, lens) => { // lens: a lens's pick (#94), which also takes line kinds at its top
    if (s == null) return;
    if (typeof s !== 'object' || Array.isArray(s)) return err(at, `a selector is an object: id, kind, container, owner${lens ? ', line' : ''} or not`);
    Object.keys(s).forEach(k => { if (!['id', 'kind', 'container', 'owner', 'not', ...(lens ? ['line'] : [])].includes(k)) warn(`${at}.${k}`, `unknown key "${k}": ignored, so the selector picks more cards`); });
    each(s.id, at + '.id', (x, p) => { if (!ids.has(x) && !allBoxes.has(x)) warn(p, `"${x}" is neither a card nor a box: it picks nothing`); });
    each(s.kind, at + '.kind', (x, p) => { const k = String(x).toLowerCase(); if (!(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(p, `unknown kind "${x}": it picks script cards`); });
    each(s.container, at + '.container', (x, p) => { if (!allBoxes.has(x)) warn(p, `"${x}" is not a box: it picks nothing`); });
    each(s.owner, at + '.owner', (x, p) => { if (!owners.has(x)) warn(p, `no card's owner is "${x}": it picks nothing`); });
    if (lens) each(s.line, at + '.line', (x, p) => { if (!WIRE_KINDS.includes(x)) warn(p, `"${x}" is not a line kind (calls, feeds, triggers, state, guard): it picks no line`); });
    pick(s.not, at + '.not');
  };
  arr(m.rules).forEach((r, i) => {
    const at = `rules[${i}]`;
    if (!r || typeof r !== 'object') return err(at, 'a rule is an object with an id');
    titled(r, at);
    if (typeof r.id !== 'string' || !r.id) err(at + '.id', 'a rule needs an id'); else if (ruleIds.has(r.id)) err(at + '.id', `rule id "${r.id}" is used twice`); else ruleIds.add(r.id);
    if (!r.from && !r.to && !r.noCycles) err(at, 'a rule needs from, to or noCycles');
    pick(r.from, at + '.from'); pick(r.to, at + '.to');
    arr(r.views).forEach((v, j) => { if (!vids.has(v)) err(`${at}.views[${j}]`, `"${v}" is not a view`); });
  });
  // lenses (#94): an id each, and a pick as a rule's selector, which also takes line kinds
  if (m.lenses != null && !Array.isArray(m.lenses)) err('lenses', 'lenses is a list');
  const lensIds = new Set();
  arr(m.lenses).forEach((l, i) => {
    const at = `lenses[${i}]`;
    if (!l || typeof l !== 'object') return err(at, 'a lens is an object with an id');
    titled(l, at);
    if (typeof l.id !== 'string' || !l.id) err(at + '.id', 'a lens needs an id'); else if (lensIds.has(l.id)) err(at + '.id', `lens id "${l.id}" is used twice`); else lensIds.add(l.id);
    pick(l.pick, at + '.pick', true);
    if (l.color != null && l.color !== 'owner') warn(at + '.color', `color ${jsonText(l.color)} is not "owner": ignored`);
  });
  // stories (#69): each step's view, and the cards, lines and tour it names there
  if (m.stories != null && !Array.isArray(m.stories)) err('stories', 'stories is a list of stories');
  const modelLine = new Map(arr(m.edges).filter(e => e && typeof e === 'object' && typeof e.id === 'string').map(e => [e.id, e])), cardIds = new Set(arr(m.nodes).filter(n => n && typeof n === 'object').map(n => n.id));
  // a line written in a view is that view's (audit 39: a step on another view named it, and selected nothing there)
  const drewOf = new Map(), geoOf = new Map(), posLines = lineNames(m), sids = new Set(), inline = new Map();
  views.forEach(v => arr(v.edges).forEach(e => { if (e && e.id != null && !inline.has(e.id)) inline.set(e.id, v.id); }));
  let ctx; // the model laid out, for what a typed view draws when its type does not say (audit 39), made once and only if asked
  arr(m.stories).forEach((s, i) => {
    const at = `stories[${i}]`;
    if (s && typeof s === 'object') titled(s, at);
    if (!s || typeof s.id !== 'string' || !s.id) return err(at + '.id', 'a story needs an id');
    if (sids.has(s.id)) err(at + '.id', `story id "${s.id}" is used twice`); sids.add(s.id);
    if (!arr(s.steps).length) err(at + '.steps', 'a story needs steps');
    arr(s.steps).forEach((st, j) => {
      const p = `${at}.steps[${j}]`, v = views.find(x => x.id === (st && st.view));
      if (!v) return err(p + '.view', `"${st && st.view}" is not a view`);
      const mine = new Set(arr(v.nodeIds)), listed = Array.isArray(v.edges), boxes = new Set(arr(v.containers).map(c => c && c.id));
      // the model lines a typed view draws: its type's drawn hook says (a DFD level leaves out its parent level's flows, a C4 view a
      // relationship to a boundary it opens, audit 38), else its picture does, the lines a step can select there (audit 39: a class,
      // ER, flowchart, BPMN, cloud or mindmap view draws only its own kinds), and the model lines it draws as a piece the page
      // selects by id (audit 40: a communication view's messages are rows, not lines). null: a map, or a model that could not be laid out
      const drawn = () => { if (!drewOf.has(v)) { const T = typedView(v) && diagramOf(v); let d = null;
        if (T) try { d = new Set(typeof T.drawn === 'function' ? arr(T.drawn(m, v)) : (g => [...g.edges.flatMap(e => (e.all || [e]).map(x => x._id)),
          ...Object.keys(g.byId || {})])(held(() => (ctx ||= mapContext(m)).buildGeo(v.id))[0])); } catch { d = null; }
        drewOf.set(v, d); } return drewOf.get(v); };
      // the ids of the lines a typed view's picture draws, an implied line's ("a->b") too; null: a model that could not be laid out
      const lineIdsOf = () => { if (!geoOf.has(v)) { let d = null; try { d = new Set(held(() => (ctx ||= mapContext(m)).buildGeo(v.id))[0].edges.map(e => e._id)); } catch { d = null; }
        geoOf.set(v, d); } return geoOf.get(v); };
      const why = (x, seen) => { // why a model line x is no line of the view, or undefined
        if (typeof x !== 'string' || mine.has(x) || !modelLine.has(x) || seen.has(x) || arr(v.edges).some(e => e && e.id === x)) return undefined; seen.add(x);
        const l = modelLine.get(x), card = [l.from, l.to].find(k => cardIds.has(k) && !mine.has(k) && !boxes.has(k));
        if (card != null) return `its end "${card}" is not one of the view's cards`;
        if (listed && !v.edges.includes(x)) return 'the view\'s edges list leaves it out';
        if (drawn() && !drawn().has(x)) return 'the view does not draw it';
        const line = [l.from, l.to].find(k => why(k, seen) != null);
        return line != null ? `its end "${line}" is no line of the view` : undefined; };
      // "a->b" with no "#n" names a typed view's implied line (C4), which it must draw (audit 41: one a direct line replaced, or
      // one another view draws, selected nothing); a map's lines with no id are named "a->b#n" only
      const named = (x, q) => { // a card of the view or a line ("a->b#0" names a line with no id)
        // a model line to a card the view does not show is no line of it, as such a card is no card of it (audit 36); nor is one
        // its edges list leaves out, or one to a line it does not draw (audit 37)
        const off = why(x, new Set());
        if (off != null) err(q, `"${x}" is no line of view "${v.id}": ${off}`);
        else if (typeof x === 'string' && !mine.has(x) && !lineIds.has(x) && inline.has(x) && !arr(v.edges).some(e => e && e.id === x)) err(q, `"${x}" is no line of view "${v.id}": it is written in view "${inline.get(x)}"`);
        else if (typeof x === 'string' && !mine.has(x) && !lineIds.has(x) && !inline.has(x)) { if (!x.includes('->')) err(q, `"${x}" is neither one of view "${v.id}"'s cards nor a line`); else if (/#\d+$/.test(x) ? !posLines.get(listOf(m, m.views.indexOf(v))).has(x) : typedView(v) ? lineIdsOf() && !lineIdsOf().has(x) : true) warn(q, `"${x}" names no line: the step shows nothing for it`); }
        else if (x && typeof x === 'object') [x.type !== 'container' && x.id, x.node, ...arr(x.ids)].forEach(y => typeof y === 'string' && named(y, q)); }; // a Ref
      named(st.select, p + '.select');
      arr(st.highlight).forEach((x, k) => named(x, `${p}.highlight[${k}]`));
      arr(st.tour).forEach((x, k) => { if (!mine.has(x)) err(`${p}.tour[${k}]`, `"${x}" is not one of the view's cards`); });
      const c = st.camera, fit = ': the step shows the whole view';
      if (c && typeof c === 'object' && c.card != null) { if (!mine.has(c.card)) warn(p + '.camera.card', `"${c.card}" is not one of the view's cards${fit}`); }
      else if (c != null && c !== 'fit' && !(c && Number.isFinite(c.x) && Number.isFinite(c.y))) warn(p + '.camera', `the camera is "fit", { x, y, zoom } or { card, zoom }${fit}`);
      if (st.duration != null && !(st.duration > 0)) warn(p + '.duration', `duration ${jsonText(st.duration)} is not a number of ms: 4000`);
    });
  });
  if (typed) {
    const said = new Set(out.map(p => p.path)); // a duplicate id both checks find is said once
    out.push(...typedProblems(m).filter(p => !(p.level === 'error' && said.has(p.path))));
    views.forEach((v, i) => { const at = `views[${i}].diagram`; // a well-formed name of a type this release does not draw (M13)
      if (typedView(v) && !diagramOf(v) && !out.some(p => p.path === at)) warn(at, `diagram "${v.diagram}" is not drawn by this release: its nodes are drawn as plain cards`); });
    const once = new Set(), say = p => { const k = JSON.stringify([p.level, p.path, p.message]); if (!once.has(k)) { once.add(k); out.push(p); } };
    // each view's type's rules, a problem once; a validate(model) that takes no view, once a type
    views.filter(typedView).forEach(v => { const T = diagramOf(v); if (!T || !T.validate || once.has(T)) return; if (T.validate.length < 2) once.add(T); T.validate(m, v).forEach(say); });
    if (TYPED.across) arrOf(TYPED.across(m)).forEach(say);
    // a panel's text field that is not text, unless a type's own rule says that path already (audit 43)
    const ruled = new Set(out.map(p => p.path)); const memos = new Map(); views.filter(typedView).forEach(v => fieldTextProblems(m, v, diagramOf(v), memos).forEach(p => { if (!ruled.has(p.path)) say(p); }));
  }
  // a change the renderer has no mark for draws unmarked, though a key may say it (audit 45: "bogus" passed, and a line's
  // "planned" was said and not drawn). In any case, as the renderer reads it; a card's and a member's, a line's, each its own words
  const CARD_CH = ['added', 'new', 'modified', 'changed', 'removed', 'planned'], LINE_CH = ['added', 'new', 'modified', 'changed', 'removed'];
  const chIs = (x, at, ok, line) => { if (!x || typeof x !== 'object' || x.change == null) return;
    if (!(typeof x.change === 'string' && ok.includes(x.change.toLowerCase()))) warn(at + '.change', `change ${jsonText(x.change)} is not ${line ? 'added, changed or removed' : 'added, changed, removed or planned'}: drawn unmarked`); };
  const deep = (x, at) => { const s = [[x, at]], seen = new Set(); for (let k = 0; k < s.length; k++) { const [y, p] = s[k]; if (!y || typeof y !== 'object' || seen.has(y)) continue; seen.add(y); chIs(y, p, CARD_CH);
    arr(y.members).forEach((z, j) => s.push([z, `${p}.members[${j}]`])); } };
  arr(m.nodes).forEach((n, i) => deep(n, `nodes[${i}]`)); arr(m.edges).forEach((e, i) => chIs(e, `edges[${i}]`, LINE_CH, true));
  views.forEach(v => { const i = arr(m.views).indexOf(v); arr(v.nodes).forEach((n, j) => deep(n, `views[${i}].nodes[${j}]`)); arr(v.fragments).forEach((f, j) => deep(f, `views[${i}].fragments[${j}]`));
    arr(v.edges).forEach((e, j) => chIs(e, `views[${i}].edges[${j}]`, LINE_CH, true));
    if (v.nodeOverrides && typeof v.nodeOverrides === 'object') Object.entries(v.nodeOverrides).forEach(([id, o]) => chIs(o, `views[${i}].nodeOverrides.${id}`, CARD_CH)); });
  // a value left out is said once, as left out: not again at its path as a missing end, type or name (audit 21: a line's
  // end {"toString": 1} was also '"undefined" is neither a card nor a box'). A path in the copy, where a list's entry
  // left out moved the ones after it up, is said as the model has it, so the next entry's problem is said, at its own
  // place (audit 22), and only a value taken out of an object is compared
  if (!left.size) return out;
  const back = p => { const q = read.back(p.path), also = / \(also ([^()]*)\)$/.exec(p.message);
    return q === p.path && !also ? p : { ...p, path: q, ...also && { message: p.message.slice(0, also.index) + ` (also ${read.back(also[1])})` } }; };
  return out.map((p, i) => i < read.paths.length ? p : back(p)).filter((p, i) => i < read.paths.length || !left.has(p.path));
}

/* ================= rules (#70): what a model says must hold =================
   A rule forbids lines from the cards `from` picks to the cards `to` picks (a side left out picks every card), or, with
   noCycles, boxes that reach each other through their lines. A line counts between the two boxes that hold its ends right
   under the box (or view) they share, so a box is weighed against its siblings, at every depth, and a line into a box's
   own inner box counts for nothing. A selector picks cards by id, kind (as the map draws it: "db" is a database) or box
   (at any depth), each a value or a list; every key it has must hold, and `not` turns a selector round. A line's end on
   a box (#28) is that box: in it, and of no kind. A rule that names a box (a container, or a box's id, in from, to or a
   not) holds only in the views that draw one of the boxes it names, as a box belongs to its view; any other rule holds in
   every view. `views` narrows that further. */
const boxesNamed = (s, isBox) => !s || typeof s !== 'object' ? []
  : [...[s.container].flat(), ...[s.id].flat().filter(isBox), ...boxesNamed(s.not, isBox)].filter(x => x != null);
const picks = (s, end) => !s || ((s.id == null || [s.id].flat().includes(end.id))
  && (s.kind == null || [s.kind].flat().some(k => end.kind != null && kindOf(k, true) === end.kind))
  && (s.container == null || [s.container].flat().some(c => end.boxes.includes(c)))
  && (s.owner == null || [s.owner].flat().includes(end.owner))
  && (s.not == null || !picks(s.not, end)));
const andList = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs.join(''), arrOf = x => (Array.isArray(x) ? x : []);
// a view's cards and boxes as a selector sees them (rules, lenses): a card's kind as drawn, the boxes it is in (outermost
// first) and its owner; a box is in itself and its parents, and has no kind or owner
// a view's hand-written boxes: none on a typed view whose type lays it out, which draws its own boxes (own-boxes, audit 10)
const handBoxes = v => ((v.diagram ?? 'map') !== 'map' && (diagramOf(v) || {}).layout ? [] : arrOf(v.containers));
function endsIn(ctx, v) {
  const cs = handBoxes(v).filter(c => c && c.id), box = Object.create(null); cs.forEach(c => { box[c.id] ||= c; }); // no prototype (M3, audit 8)
  const home = Object.create(null); cs.forEach(c => arrOf(c.nodeIds).forEach(id => { home[id] ??= c.id; }));
  const chain = b => { const c = []; for (const seen = new Set(); b != null && box[b] && !seen.has(b); b = box[b].parent) { seen.add(b); c.unshift(b); } return c; }; // outermost first
  const end = id => box[id] ? { id, kind: null, boxes: chain(id), label: box[id].label || id }
    : (n => ({ id, kind: kindOf(n.kind, true), boxes: chain(home[id]), owner: typeof n.owner === 'string' ? n.owner : undefined, label: n.label || id }))(ctx.nodeIn(id, v.id));
  return { box, end };
}
/** Every rule the model breaks, in each view that draws it broken: a line a rule forbids, or a cycle of boxes. */
export function rules(model) {
  model = unreadable(model).model; // read as validate() and mapContext read it: no text String() throws on (audit 20)
  const list = arrOf(model && model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles));
  if (!list.length) return [];
  const ctx = mapContext(model), { views, N, viewEdges } = ctx, out = [];
  const anyBox = new Set(views.flatMap(v => handBoxes(v).map(c => c && c.id).filter(Boolean)));
  const named = new Map(list.map(r => [r, [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]))]));
  views.forEach(v => {
    const { box, end } = endsIn(ctx, v), order = Object.values(box).map(c => c.id);
    // a target names the drawn line, which may stand for several edges: grouped as prepEdges groups them (parallel edges, and
    // A→B with B→A, unless keepPairs), in its order, so select() finds it
    // ponytail: a copy of prepEdges' grouping; share one helper if that grouping changes
    const lines = viewEdges(v).filter(e => e.from !== e.to), par = new Map(), drawn = new Map(), ends = new Map();
    lines.forEach(e => { const k = e.from + '>' + e.to + (v.keepPairs ? '#' + e.id : ''); par.has(k) ? par.get(k).push(e) : par.set(k, [e]); });
    par.forEach(es => { const back = !v.keepPairs && ends.get(es[0].to + '>' + es[0].from);
      if (back) back.push(...es); else ends.set(es[0].from + '>' + es[0].to, es); es.forEach(e => drawn.set(e, back || es)); });
    const line = e => ({ type: 'edge', ids: [...new Set(drawn.get(e).map(x => x._id))], view: v.id });
    let rings = null; // the cycles of boxes, worked out for the first noCycles rule: [boxes, the lines between them]
    const cycles = () => {
      const next = Object.create(null); // box -> Map(box -> the lines from the one to the other)
      lines.forEach(e => { const A = end(e.from).boxes, B = end(e.to).boxes; let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
        if (i < A.length && i < B.length) { const m = next[A[i]] ||= new Map(); m.set(B[i], [...(m.get(B[i]) || []), e]); } });
      const reach = b => { const seen = new Set(), todo = [b]; while (todo.length) for (const c of (next[todo.pop()] || new Map()).keys()) if (!seen.has(c)) { seen.add(c); todo.push(c); } return seen; };
      const R = Object.fromEntries(order.map(b => [b, reach(b)])), done = new Set(), found = [];
      order.forEach(b => { if (done.has(b) || !R[b].has(b)) return;
        const ring = order.filter(c => R[b].has(c) && R[c].has(b)); ring.forEach(c => done.add(c));
        found.push([ring, ring.flatMap(a => ring.flatMap(c => (next[a] && next[a].get(c)) || []))]); });
      return found;
    };
    list.forEach(r => {
      if (Array.isArray(r.views) && !r.views.includes(v.id)) return;
      if (named.get(r).length && !named.get(r).some(b => box[b])) return; // it names boxes, none of them this view's
      const breaks = `breaks rule "${labelOr(r.title, r.id)}"`;
      if (r.noCycles) (rings ||= cycles()).forEach(([ring, via]) => out.push({ rule: r.id, view: v.id,
        message: `view ${v.id}: boxes ${andList(ring.map(c => `"${box[c].label || c}"`))} form a cycle, which ${breaks}`,
        targets: [...ring.map(c => ({ type: 'container', id: c, view: v.id })), ...[...new Set(via.map(e => drawn.get(e)))].map(es => line(es[0]))] }));
      else { const said = new Set(); // parallel edges that break it read as one line, once
        lines.forEach(e => { const a = end(e.from), b = end(e.to), message = `view ${v.id}: edge ${a.label}→${b.label} ${breaks}`;
          if (picks(r.from, a) && picks(r.to, b) && !said.has(drawn.get(e))) { said.add(drawn.get(e)); out.push({ rule: r.id, view: v.id, message, targets: [line(e)] }); } }); }
    });
  });
  return out;
}

export { WIRE_KINDS, boxesNamed, picks, andList, arrOf, endsIn, handBoxes };
