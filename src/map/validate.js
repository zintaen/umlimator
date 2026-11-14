import { typedProblems, versionProblem } from '../core/model.js';
import { TYPED, diagramOf } from '../core/registry.js';
import { SHAPE_NAMES, shapeOf } from '../draw/shapes.js';
import { mapContext } from './context.js';
import { ALIAS, KIND, MAPK, hasKey, kindOf } from './kinds.js';

const WIRE_KINDS = ['calls', 'feeds', 'triggers', 'state', 'guard'], SIDES = ['left', 'right', 'top', 'bottom'];
/** A model's own problems, before anything is drawn: errors draw as holes or not at all (ids that are missing,
 *  repeated or name nothing, boxes inside themselves); warnings draw other than they say (an unknown kind or weight,
 *  a side that is not one, a view opened before the host has loaded it, a line to itself, which is not drawn). Each says where: `views[2].nodeIds[4]`. */
export function validate(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  const arr = x => (Array.isArray(x) ? x : []), m = model && typeof model === 'object' ? model : {}, views = arr(m.views).filter(v => v && typeof v === 'object');
  const ver = versionProblem(m); if (ver) (ver.level === 'error' ? err : warn)('schemaVersion', ver.message); // a model this release cannot read is drawn wrongly: say so (F6)
  if (!Array.isArray(m.nodes)) err('nodes', 'the model needs a list of cards');
  if (!views.length) err('views', 'the model has no views');
  const ids = new Set(), vids = new Set(), lineIds = new Set();
  // schema version 2: typed lines and typed views are the typed core's to check (src/core/model.js), the rest is a map's
  const typed = m.schemaVersion === 2, typedView = v => typed && v.diagram != null && v.diagram !== 'map';
  const card = (n, at) => {
    if (!n || typeof n.id !== 'string' || !n.id) return err(at + '.id', 'a card needs an id');
    if (ids.has(n.id)) err(at + '.id', `card id "${n.id}" is used twice`); ids.add(n.id);
    const k = String(n.kind ?? '').toLowerCase();
    if (n.kind != null && !(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(at + '.kind', `unknown kind "${n.kind}": drawn as a script card`);
    if (n.owner != null && typeof n.owner !== 'string') warn(at + '.owner', 'an owner is a name: ignored');
    list(n, at, 'verbs');
    shapeIs(n, at);
  };
  const shapeIs = (n, at) => { if (n && n.shape != null && !SHAPE_NAMES.includes(String(n.shape).toLowerCase())) warn(at + '.shape', `unknown shape "${n.shape}": drawn by its kind (the shapes: ${SHAPE_NAMES.join(', ')})`); };
  // a field that must be a list and is not: drawn as if missing (a view's cards: none)
  const list = (x, at, k) => { if (x[k] != null && !Array.isArray(x[k])) (k == 'nodeIds' ? err : warn)(`${at}.${k}`, `${k} is a list: ${k == 'nodeIds' ? 'the view draws no cards' : 'ignored'}`); };
  const gone = (x, at) => { if (x && x.shapes !== undefined) warn(at + 'shapes', 'shapes is no longer read: maps draw in one style'); }; // the box/c4/uml choice, removed in 0.21.0
  gone(m, '');
  arr(m.nodes).forEach((n, i) => card(n, `nodes[${i}]`));
  views.forEach((v, i) => arr(v.nodes).forEach((n, j) => card(n, `views[${i}].nodes[${j}]`)));
  views.forEach((v, i) => { if (typeof v.id !== 'string' || !v.id) err(`views[${i}].id`, 'a view needs an id'); else if (vids.has(v.id)) err(`views[${i}].id`, `view id "${v.id}" is used twice`); else vids.add(v.id); });
  if (m.root != null && !vids.has(m.root)) err('root', `root "${m.root}" is not a view`);
  const later = (x, at) => { if (x && x.opensView && !vids.has(x.opensView)) warn(at + '.opensView', `opens "${x.opensView}", a view the model does not have: fine if the host loads it when it is opened`); };
  arr(m.nodes).forEach((n, i) => later(n, `nodes[${i}]`));
  views.forEach((v, i) => { gone(v, `views[${i}].`); ['nodeIds', 'containers', 'intake'].forEach(k => list(v, `views[${i}]`, k)); });
  // a frontend card is drawn as a browser: a person's icon on one says the model means a person (0.15.0); not said of a card
  // only typed views hold, which keep their own notation (0.21.0)
  const typedOnly = id => { const vs = views.filter(v => arr(v.nodeIds).includes(id)); return vs.length && vs.every(v => typedView(v) && diagramOf(v)); };
  arr(m.nodes).forEach((n, i) => { if (!n || n.shape != null || !['user', 'users', 'usercheck'].includes(n.icon) || typedOnly(n.id)) return;
    if (shapeOf({ ...n, k: kindOf(n.kind, true) }) === 'browser') warn(`nodes[${i}].kind`, `"${n.label || n.id}" has a person's icon, but a ${n.kind} card is drawn as a browser: kind "person" (or shape "person") draws a person`); });
  const line = (e, at, ends) => {
    if (!e || typeof e !== 'object') return err(at, 'a line is an object with from and to');
    ['from', 'to'].forEach(k => { if (!ends.has(e[k])) err(`${at}.${k}`, `"${e[k]}" is neither a card nor a box`); });
    if (e.from != null && e.from === e.to) warn(at, `a line from "${e.from}" to itself: not drawn`); // a self-loop (risks.md F1); typed views will draw one
    if (e.kind != null && !WIRE_KINDS.includes(e.kind)) warn(at + '.kind', `unknown line kind "${e.kind}": drawn as calls`);
    if (e.weight != null && ![1, 2, 3].includes(e.weight)) warn(at + '.weight', `weight ${JSON.stringify(e.weight)} is not 1, 2 or 3: drawn as 1`);
    ['fromSide', 'toSide'].forEach(k => { if (e[k] != null && !SIDES.includes(e[k])) warn(`${at}.${k}`, `"${e[k]}" is not left, right, top or bottom: ignored`); });
    ['latency', 'cost'].forEach(k => { if (e[k] != null && !(typeof e[k] === 'number' && e[k] >= 0)) warn(`${at}.${k}`, `${k} ${JSON.stringify(e[k])} is not a number of 0 or more: counted as 0`); }); // budgets (#95)
    if (e.step != null && !(typeof e.step === 'number' ? e.step >= 0 : typeof e.step === 'string' && e.step.length >= 1 && e.step.length <= 3))
      warn(at + '.step', `step ${JSON.stringify(e.step)} is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written`);
  };
  // a model line may end on any view's box (#28); a view's own line only on that view's boxes
  const anyBox = new Set(views.flatMap(v => arr(v.containers).map(c => c && c.id)));
  arr(m.edges).forEach((e, i) => { if (!(typed && e && e.type != null)) line(e, `edges[${i}]`, new Set([...ids, ...anyBox]));
    if (e && e.id != null) { if (lineIds.has(e.id)) err(`edges[${i}].id`, `line id "${e.id}" is used twice`); lineIds.add(e.id); } });
  views.forEach((v, i) => { const lim = arr(v.nodeIds).length + 64; // a pin far off the grid, any view's: held there (context.js onGrid, layered.js)
    Object.entries(v.layout || {}).forEach(([id, p]) => { if (Array.isArray(p) && p.some(x => typeof x === 'number' && !(Math.abs(x) <= lim))) warn(`views[${i}].layout.${id}`, `"${id}"'s place ${JSON.stringify(p)} is off the grid: held at ${lim} columns or rows out`); });
    if (typedView(v)) return;
    const at = `views[${i}]`, mine = new Set(arr(v.nodeIds)), boxes = {};
    if (v.parent != null && !vids.has(v.parent) && !ids.has(v.parent)) err(at + '.parent', `parent "${v.parent}" is not a view`);
    arr(v.nodeIds).forEach((id, j) => { if (!ids.has(id)) err(`${at}.nodeIds[${j}]`, `"${id}" is not a card`); });
    Object.entries(v.nodeOverrides || {}).forEach(([id, o]) => { if (!ids.has(id)) err(`${at}.nodeOverrides.${id}`, `"${id}" is not a card`); later(o, `${at}.nodeOverrides.${id}`); shapeIs(o, `${at}.nodeOverrides.${id}`); });
    arr(v.nodes).forEach((n, j) => later(n, `${at}.nodes[${j}]`));
    ['stepIds', 'tour'].forEach(k => arr(v[k]).forEach((id, j) => { if (!mine.has(id)) err(`${at}.${k}[${j}]`, `"${id}" is not one of the view's cards`); }));
    arr(v.browserOrder).forEach((id, j) => { if (!vids.has(id)) err(`${at}.browserOrder[${j}]`, `"${id}" is not a view`); });
    arr(v.intake).forEach((s, j) => { if (!mine.has(s && s.to)) err(`${at}.intake[${j}].to`, `"${s && s.to}" is not one of the view's cards`); });
    arr(v.containers).forEach((c, j) => { if (!c || !c.id) err(`${at}.containers[${j}].id`, 'a box needs an id'); else if (boxes[c.id]) err(`${at}.containers[${j}].id`, `box id "${c.id}" is used twice`); else boxes[c.id] = c; });
    arr(v.containers).forEach((c, j) => { if (!c) return;
      arr(c.nodeIds).forEach((id, k) => { if (!mine.has(id)) err(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards`); });
      if (c.parent != null && !boxes[c.parent]) err(`${at}.containers[${j}].parent`, `"${c.parent}" is not a box of this view`);
      if (c.tone != null && typeof c.tone !== 'string') warn(`${at}.containers[${j}].tone`, `tone ${JSON.stringify(c.tone)} is not a palette name (green, amber, ...): ${c.tone ? 'drawn in slate' : 'ignored'}`);
      for (let p = c.parent, seen = new Set([c.id]); p != null && boxes[p]; p = boxes[p].parent) { if (seen.has(p)) { err(`${at}.containers[${j}].parent`, `box "${c.id}" ends up inside itself`); break; } seen.add(p); } });
    const ends = new Set([...ids, ...Object.keys(boxes)]);
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { if (typeof e !== 'string') line(e, `${at}.edges[${j}]`, ends); else if (!lineIds.has(e)) err(`${at}.edges[${j}]`, `"${e}" is not a line`); });
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
    if (typeof l.id !== 'string' || !l.id) err(at + '.id', 'a lens needs an id'); else if (lensIds.has(l.id)) err(at + '.id', `lens id "${l.id}" is used twice`); else lensIds.add(l.id);
    pick(l.pick, at + '.pick', true);
    if (l.color != null && l.color !== 'owner') warn(at + '.color', `color ${JSON.stringify(l.color)} is not "owner": ignored`);
  });
  // stories (#69): each step's view, and the cards, lines and tour it names there
  if (m.stories != null && !Array.isArray(m.stories)) err('stories', 'stories is a list of stories');
  const sids = new Set(), lines = new Set([...lineIds, ...views.flatMap(v => arr(v.edges).filter(e => e && e.id != null).map(e => e.id))]);
  arr(m.stories).forEach((s, i) => {
    const at = `stories[${i}]`;
    if (!s || typeof s.id !== 'string' || !s.id) return err(at + '.id', 'a story needs an id');
    if (sids.has(s.id)) err(at + '.id', `story id "${s.id}" is used twice`); sids.add(s.id);
    if (!arr(s.steps).length) err(at + '.steps', 'a story needs steps');
    arr(s.steps).forEach((st, j) => {
      const p = `${at}.steps[${j}]`, v = views.find(x => x.id === (st && st.view));
      if (!v) return err(p + '.view', `"${st && st.view}" is not a view`);
      const mine = new Set(arr(v.nodeIds)), named = (x, q) => { // a card of the view or a line ("a->b#0" names a line with no id)
        if (typeof x === 'string' && !mine.has(x) && !lines.has(x) && !x.includes('->')) err(q, `"${x}" is neither one of view "${v.id}"'s cards nor a line`); };
      named(st.select, p + '.select');
      arr(st.highlight).forEach((x, k) => named(x, `${p}.highlight[${k}]`));
      arr(st.tour).forEach((x, k) => { if (!mine.has(x)) err(`${p}.tour[${k}]`, `"${x}" is not one of the view's cards`); });
      const c = st.camera, fit = ': the step shows the whole view';
      if (c && typeof c === 'object' && c.card != null) { if (!mine.has(c.card)) warn(p + '.camera.card', `"${c.card}" is not one of the view's cards${fit}`); }
      else if (c != null && c !== 'fit' && !(c && Number.isFinite(c.x) && Number.isFinite(c.y))) warn(p + '.camera', `the camera is "fit", { x, y, zoom } or { card, zoom }${fit}`);
      if (st.duration != null && !(st.duration > 0)) warn(p + '.duration', `duration ${JSON.stringify(st.duration)} is not a number of ms: 4000`);
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
  }
  return out;
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
function endsIn(ctx, v) {
  const cs = arrOf(v.containers).filter(c => c && c.id), box = {}; cs.forEach(c => { box[c.id] ||= c; });
  const home = {}; cs.forEach(c => arrOf(c.nodeIds).forEach(id => { home[id] ??= c.id; }));
  const chain = b => { const c = []; for (const seen = new Set(); b != null && box[b] && !seen.has(b); b = box[b].parent) { seen.add(b); c.unshift(b); } return c; }; // outermost first
  const end = id => box[id] ? { id, kind: null, boxes: chain(id), label: box[id].label || id }
    : (n => ({ id, kind: kindOf(n.kind, true), boxes: chain(home[id]), owner: typeof n.owner === 'string' ? n.owner : undefined, label: n.label || id }))(ctx.nodeIn(id, v.id));
  return { box, end };
}
/** Every rule the model breaks, in each view that draws it broken: a line a rule forbids, or a cycle of boxes. */
export function rules(model) {
  const list = arrOf(model && model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles));
  if (!list.length) return [];
  const ctx = mapContext(model), { views, N, viewEdges } = ctx, out = [];
  const anyBox = new Set(views.flatMap(v => arrOf(v.containers).map(c => c && c.id).filter(Boolean)));
  const named = new Map(list.map(r => [r, [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]))]));
  views.forEach(v => {
    const { box, end } = endsIn(ctx, v), order = Object.values(box).map(c => c.id);
    // a target names the drawn line, which may stand for several edges: grouped as prepEdges groups them (parallel edges, and
    // A→B with B→A, unless keepPairs), in its order, so select() finds it
    // ponytail: a copy of prepEdges' grouping; share one helper if that grouping changes
    const lines = viewEdges(v), par = new Map(), drawn = new Map(), ends = new Map();
    lines.forEach(e => { const k = e.from + '>' + e.to + (v.keepPairs ? '#' + e.id : ''); par.has(k) ? par.get(k).push(e) : par.set(k, [e]); });
    par.forEach(es => { const back = !v.keepPairs && ends.get(es[0].to + '>' + es[0].from);
      if (back) back.push(...es); else ends.set(es[0].from + '>' + es[0].to, es); es.forEach(e => drawn.set(e, back || es)); });
    const line = e => ({ type: 'edge', ids: [...new Set(drawn.get(e).map(x => x._id))], view: v.id });
    let rings = null; // the cycles of boxes, worked out for the first noCycles rule: [boxes, the lines between them]
    const cycles = () => {
      const next = {}; // box -> Map(box -> the lines from the one to the other)
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
      const breaks = `breaks rule "${r.title || r.id}"`;
      if (r.noCycles) (rings ||= cycles()).forEach(([ring, via]) => out.push({ rule: r.id, view: v.id,
        message: `view ${v.id}: boxes ${andList(ring.map(c => `"${box[c].label || c}"`))} form a cycle, which ${breaks}`,
        targets: [...ring.map(c => ({ type: 'container', id: c, view: v.id })), ...[...new Set(via.map(e => drawn.get(e)))].map(es => line(es[0]))] }));
      else { const said = new Set(); // parallel edges that break it read as one line, once
        lines.forEach(e => { const a = end(e.from), b = end(e.to), message = `view ${v.id}: edge ${a.label}→${b.label} ${breaks}`;
          if (picks(r.from, a) && picks(r.to, b) && !said.has(message)) { said.add(message); out.push({ rule: r.id, view: v.id, message, targets: [line(e)] }); } }); }
    });
  });
  return out;
}

export { WIRE_KINDS, boxesNamed, picks, andList, arrOf, endsIn };
