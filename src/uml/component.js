import { registerDiagramType } from '../core/registry.js';
import { esc } from '../core/text.js';
import { SHAPE } from '../draw/shapes.js';
import { rowsFor, untangle } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import { memberEdit, parseMember, printMember } from './class.js'; // an interface's operations; SHAPE.note, a comment's look
import { ownersOn, placeTabs, readingOrder } from './owners.js';
import { SN_SAY, STRUCT_RULES, portFit, portSides, portsDrawn, structProblems } from './structure.js';

/* ---------- the component diagram, uml.component (work package 5.4, notes/stage-5.md §10.1) ----------
   Components (src/uml/structure.js's look), a component or package that holds something shown a box (src/uml/owners.js),
   its ports on its border (§4), interfaces as a ball or as the class type's rectangle (§9.2), artifacts, closed packages and
   comments; realizations, component realizations, usages (a socket at a ball, else «use»), assembly and delegation
   connectors (a delegation from a box's port inward is an inner line, §5), dependencies, manifestations and comment links.
   Laid out by layoutTyped from the type's own ranking (cpPlace), a usage of a ball turned so the ball comes before its requirers: gap 48, labelGaps
   and cut 280 (§8), a box with ports 48 px of padding (§7), repair and reroute off (§14). Every port is a node of the
   picture, with its owner's id (owner), which the layout check passes half inside it (decision 22). Ships in
   lib/umlimator-all.js only. */

const CP_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), CP_ARR = x => (Array.isArray(x) ? x : []);
const CP_HAS = x => x != null && x !== '';
const CP_OWN = (o, k) => (CP_OBJ(o) && Object.hasOwn(o, k) ? o[k] : undefined); // a model's id as a key: 'constructor' is not Object's
const cpProps = x => (CP_OBJ(x && x.props) ? x.props : {});
const cpName = x => String(x.label ?? x.id);
const cpStereo = x => CP_ARR(cpProps(x).stereotypes).filter(CP_HAS).map(String);
const cpPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const CP_LINES = ['uml.InterfaceRealization', 'uml.ComponentRealization', 'uml.Usage', 'uml.Connector', 'uml.Dependency', 'uml.Manifestation', 'uml.CommentLink'];
const CP_SIDE = { L: 'left', R: 'right', T: 'top', B: 'bottom' }, CP_OPP = { L: 'R', R: 'L', T: 'B', B: 'T' }, CP_TURN = { L: 'T', T: 'L', R: 'B', B: 'R' };
const cpPortsOf = n => CP_ARR(n && n.members).filter(m => CP_OBJ(m) && m.type === 'uml.Port' && typeof m.id === 'string');

/* ---- the model read: every node, every port and its owner, each node's owners up the chain ---- */
function cpIndex(model) {
  const N = new Map(), P = new Map(); // P: port id -> { x, owner }
  CP_ARR(model && model.nodes).forEach(n => { if (CP_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) N.set(n.id, n); });
  N.forEach(n => cpPortsOf(n).forEach(p => { if (!P.has(p.id) && !N.has(p.id)) P.set(p.id, { x: p, owner: n.id }); }));
  const chain = id => { const out = []; for (let p = (N.get(id) || {}).parent; p != null && N.has(p) && !out.includes(p) && p !== id; p = N.get(p).parent) out.push(p); return out; };
  const comp = id => (P.has(id) ? P.get(id).owner : id); // a port's end: its owner
  const ty = id => (N.get(comp(id)) || {}).type;
  return { N, P, chain, comp, ty, name: id => (P.has(id) ? `${cpName(P.get(id).x)} of ${cpName(N.get(P.get(id).owner))}` : N.has(id) ? cpName(N.get(id)) : String(id)) };
}
const cpBall = (I, view, id) => (I.N.get(id) || {}).type === 'uml.Interface' && (CP_OWN(CP_OWN(view && view.present, id), 'as') === 'ball');
// what a line is drawn as: its key in the look, the legend and the words
function cpKind(I, view, e) {
  if (e.type === 'uml.InterfaceRealization') return cpBall(I, view, e.to) ? 'stem' : 'realization';
  if (e.type === 'uml.Usage') return cpBall(I, view, e.to) ? 'socket' : 'usage';
  if (e.type === 'uml.Connector') return cpProps(e).kind === 'delegation' ? 'delegation' : 'assembly';
  return { 'uml.ComponentRealization': 'component-realization', 'uml.Dependency': 'dependency', 'uml.Manifestation': 'manifestation', 'uml.CommentLink': 'comment-link' }[e.type] || 'dependency';
}
// each kind: its ends and stroke (src/typed/draw.js's ENDS), its keyword, its word, and what the legend says of it
const CP_LOOK = {
  stem: [{ from: 'none', to: 'none' }, '', 'Realization', 'provides the interface drawn as a ball (its stem)'],
  socket: [{ from: 'none', to: 'socket' }, '', 'Usage', 'requires the interface: a socket round its ball'],
  realization: [{ from: 'none', to: 'triangle', dashed: true }, '', 'Realization', 'provides the interface it points to'],
  usage: [{ from: 'none', to: 'open', dashed: true }, '«use»', 'Usage', 'requires the one it points to'],
  'component-realization': [{ from: 'none', to: 'triangle', dashed: true }, '', 'Component realization', 'realizes the component it points to'],
  assembly: [{ from: 'none', to: 'none' }, '', 'Assembly', 'joins what one part requires to what another provides'],
  delegation: [{ from: 'none', to: 'open' }, '', 'Delegation', 'passes on, inward or out, what a port takes or needs'],
  dependency: [{ from: 'none', to: 'open', dashed: true }, '', 'Dependency', 'uses the one it points to'],
  manifestation: [{ from: 'none', to: 'open', dashed: true }, '«manifest»', 'Manifestation', 'the artifact is the component\'s file'],
  'comment-link': [{ from: 'none', to: 'none', dashed: true }, '', 'Comment link', 'what a comment is about'],
};

/* ---- the view read: its boxes, its lines, every element's words ---- */
const CP_BOX = { boxTypes: ['uml.Component', 'uml.Package'], shape: x => (x.type === 'uml.Component' ? 'component' : 'package'), word: x => (x.type === 'uml.Component' ? 'Component' : 'Package') };
const CP_WORD = { 'uml.Component': 'component', 'uml.Interface': 'interface', 'uml.Artifact': 'artifact', 'uml.Package': 'package', 'uml.Comment': 'comment', 'uml.Port': 'port' };
function cpPic(model, view) {
  const I = cpIndex(model), pic = ownersOn(model, view, CP_BOX), shown = new Set(pic.ids);
  // a name is qualified by its components and packages only: an artifact nested in a node (deployed on it, as the
  // deployment view draws it) is not named by the node here (0.22.0, the Bookshop atlas)
  const qual = pic.name; pic.name = id => { const c = pic.chain(id), k = c.findIndex(p => !CP_BOX.boxTypes.includes((pic.at.get(p) || {}).type));
    if (k < 0) return qual(id); const up = c.slice(0, k), o = up.indexOf(pic.owner(id));
    return [...up.slice(0, o < 0 ? k : o).reverse(), id].map(x => String(pic.at.get(x).label ?? x)).join('::'); };
  // each line the view lists (or with no list each of this type's kinds) whose ends, a port taken to its owner, it shows
  const E = new Map(); CP_ARR(model && model.edges).forEach(e => { if (CP_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => CP_LINES.includes(e.type));
  const at = id => (shown.has(id) ? { at: id, port: null } : I.P.has(id) && shown.has(I.P.get(id).owner) ? { at: I.P.get(id).owner, port: id } : null);
  const holds = (b, x) => pic.open.has(b) && pic.chain(x).includes(b);
  const lines = []; list.forEach(e => { if (!CP_OBJ(e) || typeof e.id !== 'string') return; const f = at(e.from), t = at(e.to); if (!f || !t) return;
    // a line between a box and what it holds leaves the box's port inward (§5); without a port at the box's end it is not drawn
    const inner = holds(f.at, t.at) ? 'from' : holds(t.at, f.at) ? 'to' : null;
    if ((inner && !(inner === 'from' ? f : t).port) || (f.at === t.at && (f.port || t.port))) return;
    lines.push({ e, f, t, inner, kind: cpKind(I, view, e) }); });
  const boxes = pic.boxes.map(b => { const x = I.N.get(b.id); if (x.type !== 'uml.Component') return b;
    return { ...b, aria: SN_SAY.component(pic.name(b.id), { stereotypes: cpStereo(x), ports: cpPortsOf(x).length, holds: pic.holds(b.id).map(id => CP_WORD[(I.N.get(id) || {}).type] || 'element') }) }; });
  return { ...pic, boxes, I, lines };
}
// "Port orders of Shop API, provides Orders"; "Interface Orders, as a ball, provided by Shop API, required by Storefront"
function cpNodeName(model, view, pic, id, bare) { // bare: a port without " of <owner>" (the PDF's rows)
  const { I, lines } = pic, x = I.N.get(id) || (I.P.get(id) || {}).x, of = k => lines.filter(l => l.e.type === k);
  if (!x) return String(id);
  if (I.P.has(id)) { const by = k => of(k).filter(l => l.e.from === id && I.ty(l.e.to) === 'uml.Interface').map(l => cpName(I.N.get(l.e.to)));
    return SN_SAY.port(cpName(x), bare ? null : pic.name(I.P.get(id).owner), { valueType: cpProps(x).valueType, provides: by('uml.InterfaceRealization'), requires: by('uml.Usage') }); }
  const b = pic.boxes.find(y => y.id === id); if (b) return b.aria;
  const st = cpStereo(x), owners = k => of(k).filter(l => l.e.to === id).map(l => pic.name(I.comp(l.e.from)));
  if (x.type === 'uml.Component') return SN_SAY.component(pic.name(id), { stereotypes: st, ports: cpPortsOf(x).length });
  if (x.type === 'uml.Interface') return SN_SAY.iface(pic.name(id), { ball: cpBall(I, view, id), providers: owners('uml.InterfaceRealization'), requirers: owners('uml.Usage') });
  if (x.type === 'uml.Artifact') return SN_SAY.artifact(pic.name(id), { manifests: of('uml.Manifestation').filter(l => l.e.from === id).map(l => pic.name(l.e.to)) });
  if (x.type === 'uml.Comment') return 'Comment: ' + cpName(x);
  return `${x.type === 'uml.Package' ? 'Package' : String(x.type).split('.').pop()} ${pic.name(id)}${st.length ? ` (${st.join(', ')})` : ''}`;
}
const cpLabel = (l, said) => [CP_LOOK[l.kind][1], ...cpStereo(l.e).map(t => `«${t}»`), said ? null : l.e.label].filter(CP_HAS).join(' ');
// "Delegation from orders of Shop API to orders of Checkout"
const cpLineName = (pic, l) => { const t = [...cpStereo(l.e).map(s => `«${s}»`), l.e.label].filter(CP_HAS).join(' ');
  return `${CP_LOOK[l.kind][2]} from ${pic.I.name(l.e.from)} to ${pic.I.name(l.e.to)}${t ? ': ' + t : ''}`; };
// reading order (§10.1): each box and what it holds, each element's ports after it in members order, then the lines
const cpOrder = pic => [...readingOrder(pic).flatMap(id => [id, ...cpPortsOf(pic.I.N.get(id)).map(p => p.id)]), ...pic.lines.map(l => l.e.id)];

/* ---- the legend: each line kind drawn. ponytail: copies class.js's legend ends, which it does not export ---- */
const CP_ENDS = { none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>', triangle: '<path d="M16 3L26 8L16 13Z" fill="var(--um-panel)"/>',
  socket: '<path d="M26 2A6 6 0 0 0 26 14" fill="none"/>', ball: '<circle cx="21" cy="8" r="5" fill="var(--um-panel)"/>' };
const cpLegend = kinds => Object.keys(CP_LOOK).filter(k => kinds.has(k)).map(k => { const [L, , name, says] = CP_LOOK[k], end = k === 'stem' ? 'ball' : L.to;
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${end === 'none' ? 26 : end === 'ball' ? 16 : end === 'socket' ? 23 : 17}"${L.dashed ? ' stroke-dasharray="3 2"' : ''}/>${CP_ENDS[end]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; });

/* ---- the view laid out (§10.1) ----
   Ranked here, not by the host, whose ranking reads only lines between the view's nodes and so none from a port (Q11): as
   the host ranks a view with boxes (blockPos, src/map/context.js), in one pass. Each box's contents, then the top, are
   ranked by the lines between them (a line to what a box holds is the box's), longest paths with cycles broken depth first,
   a usage of a ball turned so the ball comes before its requirers (provider, ball, socket from left to right); a box is a block of its
   contents' columns and rows; columns ordered by untangle and rows by rowsFor (src/layout/layered.js); what no line reaches
   in rows under its block. A pin (the view's layout, by element) wins, and a node it would cover moves down */
function cpRank(items, links) {
  const outs = new Map(items.map(id => [id, []])), st = new Map(), fwd = [];
  links.forEach(l => outs.get(l[0]).push(l));
  const dfs = u => { const fr = [[u, 0]]; st.set(u, 1); // a stack of frames, not recursion: a chain of any length
    while (fr.length) { const f = fr[fr.length - 1], ls = outs.get(f[0]); if (f[1] === ls.length) { fr.pop(); st.set(f[0], 2); continue; }
      const l = ls[f[1]++]; if (st.get(l[1]) === 1) continue; fwd.push(l); if (!st.has(l[1])) { st.set(l[1], 1); fr.push([l[1], 0]); } } };
  [...items.filter(id => !links.some(l => l[1] === id)), ...items].forEach(id => { if (!st.has(id)) dfs(id); });
  const rank = Object.fromEntries(items.map(id => [id, 0]));
  for (let it = 0, more = true; more && it <= items.length; it++) { more = false; fwd.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) { rank[b] = rank[a] + 1; more = true; } }); }
  return { rank, fwd };
}
function cpPlace(pic, lines, pins) {
  const links = lines.filter(l => !l.inner).map(l => (l.kind === 'socket' ? [l.t.at, l.f.at] : [l.f.at, l.t.at]));
  const itemIn = (x, g) => { for (let k = 0; x != null && k < 64; k++, x = pic.owner(x)) if (pic.owner(x) === g) return x; };
  // each box placed after the boxes it holds, with no recursion: boxes can nest deep
  const done = new Map(), order = [null]; for (let i = 0; i < order.length; i++) pic.holds(order[i]).forEach(x => pic.open.has(x) && order.push(x));
  const block = g => { const items = pic.holds(g), size = Object.create(null), pos = Object.create(null);
    items.forEach(x => { size[x] = pic.open.has(x) ? done.get(x) : { w: 1, h: 1, pos: { [x]: [0, 0] } }; });
    const L = links.map(([a, b]) => [itemIn(a, g), itemIn(b, g)]).filter(([a, b]) => a !== undefined && b !== undefined && a !== b), lined = new Set(L.flat());
    const { rank, fwd } = cpRank(items.filter(x => lined.has(x)), L), cols = [], hh = x => size[x].h;
    items.filter(x => lined.has(x)).forEach(x => (cols[rank[x]] ||= []).push(x));
    untangle(cols, fwd, hh); const row = rowsFor(cols, fwd, hh);
    let c0 = 0, h = 0; cols.forEach(list => { let r0 = 0, w = 0;
      list.forEach(x => { r0 = Math.max(r0, row[x] ?? 0); Object.entries(size[x].pos).forEach(([id, [c, r]]) => { pos[id] = [c0 + c, r0 + r]; }); r0 += size[x].h; w = Math.max(w, size[x].w); });
      c0 += w; h = Math.max(h, r0); });
    const loose = items.filter(x => !lined.has(x)), per = Math.max(2, c0);
    let c = 0, r = h, rh = 0; // packed by size in rows under the lined columns, a row as tall as its tallest
    loose.forEach(x => { if (c && c + size[x].w > per) { r += rh; c = 0; rh = 0; }
      Object.entries(size[x].pos).forEach(([id, [a, b]]) => { pos[id] = [c + a, r + b]; }); c += size[x].w; rh = Math.max(rh, size[x].h); c0 = Math.max(c0, c); });
    return { w: c0, h: r + rh, pos }; };
  order.reverse().forEach(g => done.set(g, block(g)));
  const at = done.get(null).pos, P = Object.entries(CP_OBJ(pins) ? pins : {}).filter(([id, p]) => Object.hasOwn(at, id) && Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!P.length) return at;
  const taken = P.map(([, p]) => p), free = (c, r) => !taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1), pinned = new Set(P.map(([id]) => id));
  P.forEach(([id, p]) => { at[id] = p; });
  Object.keys(at).forEach(id => { if (pinned.has(id)) return; let [c, r] = at[id]; while (!free(c, r)) r++; at[id] = [c, r]; taken.push([c, r]); });
  return at;
}
function cpGeo({ model, view, pos: pins, memo }) {
  const pic = cpPic(model, view), { I, lines } = pic, down = view.direction === 'down', present = CP_OBJ(view.present) ? view.present : {}, pos = cpPlace(pic, lines, pins);
  const P = id => { const p = CP_OWN(pos, id); if (Array.isArray(p)) return p; const k = pic.open.has(id) ? pic.holds(id).map(P).filter(Boolean) : []; // a box: the mean of what it holds
    return k.length ? [k.reduce((a, q) => a + q[0], 0) / k.length, k.reduce((a, q) => a + q[1], 0) / k.length] : null; };
  const pos2 = Object.fromEntries(pic.ids.map(id => [id, P(id)]).filter(([, p]) => p));
  // each port's side (§4.2): pinned, else facing its lines' far ends outside it; a port whose only lines run to its owner's
  // owner's ports takes their side, so a delegation runs straight in, and their order: the mean place of their far ends
  const shownPorts = pic.ids.flatMap(id => cpPortsOf(I.N.get(id)).filter(p => I.P.has(p.id) && I.P.get(p.id).owner === id).map((p, k) => ({ p, owner: id, rank: k })));
  const ends = id => lines.flatMap(l => [[l, 'from', l.f, l.t], [l, 'to', l.t, l.f]].filter(([, , me]) => me.port === id));
  const far = id => ends(id).filter(([l, w, me, o]) => l.inner !== w && !pic.chain(me.at).includes(o.at)).map(([, , , o]) => o.at);
  const side = portSides(shownPorts.map(({ p, owner }) => ({ id: p.id, owner, pin: CP_OWN(CP_OWN(present, p.id), 'side'), far: far(p.id) })), pos2, down);
  const follow = Object.create(null); shownPorts.forEach(({ p }) => { if (CP_OWN(CP_OWN(present, p.id), 'side') != null || far(p.id).length) return;
    const up = ends(p.id).find(([l, w, me, o]) => o.port && pic.chain(me.at).includes(o.at)); if (up) { side[p.id] = side[up[3].port]; follow[p.id] = up[3].port; } });
  const lay = s => CP_SIDE[down ? CP_TURN[s] : s]; // a picture's side as layoutTyped takes it: laid out down, turned
  const k = id => Math.max(1, ...['out', 'in'].map(w => ends(id).filter(([l, wh]) => (l.inner === wh) === (w === 'in')).length)); // its busiest face
  const fit = portFit(shownPorts.map(({ p, owner }) => ({ id: p.id, owner, lines: k(p.id) })), side);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = I.N.get(id), st = cpStereo(n), pr = CP_OWN(present, id) || {};
    const ops = CP_ARR(n.members).filter(m => CP_OBJ(m) && (m.type === 'uml.Operation' || m.type === 'uml.Property'));
    const look = n.type === 'uml.Comment' ? { shape: 'note' } : n.type === 'uml.Package' ? { shape: 'package', stereotypes: st } : n.type === 'uml.Artifact' ? { shape: 'artifact', stereotypes: st }
      : n.type === 'uml.Interface' ? (cpBall(I, view, id) ? { shape: 'ball' } : { shape: 'classifier', stereotypes: ['interface', ...st], compartments: ops.length ? [{ name: 'operations', members: ops }] : [] })
        : n.type === 'uml.Class' ? { shape: 'classifier', stereotypes: st } : { shape: 'component', stereotypes: st, keyword: !!CP_OWN(pr, 'keyword') };
    const d = { id, label: n.type === 'uml.Comment' ? cpName(n) : pic.name(id), type: n.type || 'uml.Component', kind: 'file', ...look, aria: cpNodeName(model, view, pic, id), col: (P(id) || [0, 0])[0], row: (P(id) || [0, 0])[1] };
    // a ball is laid out as its circle, so the router ends its lines level with the circle's centre; its name hangs under it in
    // the row gap. ponytail: the layout keeps no room for the name, which a line passing under the ball may cross (§17)
    const s = SHAPE[d.shape].size(d), f = CP_OWN(fit, id); return { ...d, w: Math.max(s.w, f ? f.w : 0), h: d.shape === 'ball' ? 16 : Math.max(s.h, f ? f.h : 0) }; });
  // a box whose ports have lines, or that holds one that does, takes 48 px of padding (§7)
  const lined = new Set(shownPorts.filter(({ p }) => ends(p.id).length).map(x => x.owner));
  const pad = new Set(); lined.forEach(x => { if (pic.open.has(x)) for (const p of [x, ...pic.chain(x)]) { if (pad.has(p)) break; pad.add(p); } }); // marked up once: nesting to any depth
  const boxes = pic.boxes.map(b => ({ ...b, ...(pad.has(b.id) ? { pad: 48 } : {}) }));
  const ball = (l, w) => { const me = w === 'from' ? l.f : l.t, o = w === 'from' ? l.t : l.f; if (me.port || !cpBall(I, view, me.at)) return {};
    const a = P(me.at) || [0, 0], b = P(o.at) || [0, 0]; // a ball's line on its left or right by the rank ([col, row] holds it first either way) (§9.2); laid out down, a line from
    // before it comes in above and one from after it on the side it comes from, so none crosses the name under the circle
    return { [w + 'Side']: !down ? CP_SIDE[b[0] > a[0] ? 'R' : 'L'] : b[0] < a[0] ? 'left' : lay(b[1] > a[1] ? 'R' : 'L') }; };
  const end = (l, w) => { const me = w === 'from' ? l.f : l.t; if (!me.port) return ball(l, w); const s = side[me.port];
    return { [w + 'Port']: me.port, [w + 'Side']: lay(l.inner === w ? CP_OPP[s] : s) }; };
  const along = id => { const a = (side[id] === 'L' || side[id] === 'R') !== down ? 1 : 0, f = far(id).map(P).filter(Boolean); return f.length ? f.reduce((t, q) => t + q[a], 0) / f.length : 0; };
  const rank = id => (follow[id] ? along(follow[id]) : (shownPorts.find(x => x.p.id === id) || {}).rank);
  const edges = lines.map(l => { const label = cpLabel(l), r = [l.f.port, l.t.port].map(x => (x ? rank(x) : null));
    return { id: l.e.id, _id: l.e.id, type: l.e.type, from: l.f.at, to: l.t.at, ...end(l, 'from'), ...end(l, 'to'), ...(l.inner ? { inner: l.inner } : {}),
      ...(l.f.port || l.t.port ? { portRank: l.f.port && l.t.port ? r : r[l.f.port ? 0 : 1] } : {}), label: label || undefined, ...(label ? { cut: 280 } : {}),
      end: CP_LOOK[l.kind][0], aria: cpLineName(pic, l), ...(CP_OBJ(l.e.style) || typeof l.e.style === 'string' ? { style: l.e.style } : {}) }; });
  const g = placeTabs(layoutTyped({ nodes, edges, ...(boxes.length ? { containers: boxes } : {}), direction: down ? 'down' : 'right', gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo));
  // on a copy (stage 4 §2.4): every port as a node, and its name
  const d = portsDrawn(g, shownPorts.map(({ p, owner }) => ({ id: p.id, owner, side: side[p.id], label: cpName(p), valueType: cpProps(p).valueType, aria: cpNodeName(model, view, pic, p.id) })));
  // a slot after each element (src/typed/edit.js): the palette's add hears the selection through it (cpAdd, at.sel)
  const slots = Object.values(d.byId).map((n, index) => ({ index, x: n.x, y: n.y, after: n.id }));
  return { ...d, slots, legend: cpLegend(new Set(lines.map(l => l.kind))), order: cpOrder(pic) };
}

/* ---- validators (§10.1). Each problem: { level, rule, path, message, ids }. With a view, the lines and elements it shows ---- */
const CP_RULES = {
  ...STRUCT_RULES,
  'provided-ends': 'a realization runs from a component, a class or a port to an interface',
  'required-ends': 'a usage from a component or a port runs to an interface (another is drawn as «use»)',
  'ball-interface': 'a view draws only an interface as a ball',
  'delegation-ends': 'a delegation joins a component\'s port with a component or port inside it, at any depth',
  'assembly-ends': 'an assembly joins two components or their ports, neither inside the other',
  'component-realization-ends': 'a component realization runs from a class or a component to a component',
  'component-owner': 'a component\'s owner is a component or a package',
};
function cpProblems(model, view) {
  const out = [...structProblems(model, view)], I = cpIndex(model), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const shown = new Set(CP_ARR(view && view.nodeIds)), seen = id => !view || shown.has(I.comp(id)), listed = view && Array.isArray(view.edges) ? new Set(view.edges.map(x => (CP_OBJ(x) ? x.id : x))) : null;
  const q = id => JSON.stringify(I.name(id)), comp = id => I.ty(id) === 'uml.Component', within = (a, b) => I.chain(I.comp(a)).includes(I.comp(b));
  CP_ARR(model && model.nodes).forEach((n, i) => { if (!CP_OBJ(n) || n.type !== 'uml.Component' || !seen(n.id) || n.parent == null || !I.N.has(n.parent)) return;
    const p = I.N.get(n.parent); if (!['uml.Component', 'uml.Package'].includes(p.type)) say('warning', 'component-owner', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)} is owned by ${q(p.id)}, a ${String(p.type).split('.').pop()}: a component's owner is a component or a package`); });
  CP_ARR(model && model.edges).forEach((e, i) => { if (!CP_OBJ(e) || !(seen(e.from) || seen(e.to)) || (listed && !listed.has(e.id))) return;
    const path = `edges[${i}]`, ends = [e.id, e.from, e.to], from = I.P.has(e.from) ? 'port' : I.ty(e.from), kind = cpProps(e).kind === 'delegation' ? 'delegation' : 'assembly'; // drawn as an assembly without one (cpKind)
    if (e.type === 'uml.InterfaceRealization' && (!['uml.Component', 'uml.Class', 'port'].includes(from) || I.P.has(e.to) || I.ty(e.to) !== 'uml.Interface'))
      say('error', 'provided-ends', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a realization runs from a component, a class or a port to an interface`);
    if (e.type === 'uml.Usage' && e.to != null && (from === 'port' || from === 'uml.Component') && (I.P.has(e.to) || I.ty(e.to) !== 'uml.Interface'))
      say('warning', 'required-ends', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}, not an interface: it is drawn as «use»`);
    if (e.type === 'uml.Connector' && kind === 'delegation' && !(comp(e.from) && comp(e.to) && I.comp(e.from) !== I.comp(e.to) && (within(e.to, e.from) ? I.P.has(e.from) : within(e.from, e.to) && I.P.has(e.to))))
      say('error', 'delegation-ends', path, ends, `${e.id} joins ${q(e.from)} and ${q(e.to)}: a delegation joins a component's port with a component or port inside it`);
    if (e.type === 'uml.Connector' && kind === 'assembly' && !(comp(e.from) && comp(e.to) && I.comp(e.from) !== I.comp(e.to) && !within(e.from, e.to) && !within(e.to, e.from)))
      say('error', 'assembly-ends', path, ends, `${e.id} joins ${q(e.from)} and ${q(e.to)}: an assembly joins two components or their ports, neither inside the other`);
    if (e.type === 'uml.ComponentRealization' && (I.P.has(e.from) || I.P.has(e.to) || !['uml.Class', 'uml.Component'].includes(I.ty(e.from)) || I.ty(e.to) !== 'uml.Component'))
      say('error', 'component-realization-ends', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a component realization runs from a class or a component to a component`); });
  if (view) { const vi = CP_ARR(model.views).indexOf(view);
    Object.entries(CP_OBJ(view.present) ? view.present : {}).forEach(([id, p]) => { if (CP_OWN(p, 'as') === 'ball' && (I.N.get(id) || {}).type !== 'uml.Interface')
      say('warning', 'ball-interface', `views[${vi}].present`, [id], `${q(id)} is not an interface: view ${JSON.stringify(view.id)} does not draw it as a ball`); }); }
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function cpDescribe(model, viewId) {
  const v = CP_ARR(model && model.views).find(x => CP_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = cpPic(model, v), by = new Map(pic.lines.map(l => [l.e.id, l]));
  return [`${v.title || v.id}: a component diagram of ${cpPlural(pic.ids.length, 'element')} and ${cpPlural(pic.lines.length, 'line')}.`,
    ...cpOrder(pic).map(id => (by.has(id) ? cpLineName(pic, by.get(id)) : cpNodeName(model, v, pic, id)) + '.')].join('\n');
}

/* ---- editing (§12) ---- */
const cpNewId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; };
// a port's row: `name` or `name : Type`
const cpPortText = t => { const s = String(t ?? ''), k = s.indexOf(':'), [name, type] = (k < 0 ? [s] : [s.slice(0, k), s.slice(k + 1)]).map(x => x.trim()); return name ? { label: name, valueType: type || undefined } : { error: 'A port has a name: name or name : Type' }; };
const cpPortPrint = m => `${m.label ?? ''}${CP_HAS(cpProps(m).valueType) ? ' : ' + cpProps(m).valueType : ''}`;
// connect: a connector between a port (or component) and one inside its owner is a delegation, else an assembly
function cpConnect(model, view, from, to, at, line) {
  if (!CP_OBJ(line) || line.type !== 'uml.Connector') return null;
  const I = cpIndex(model), within = (a, b) => I.chain(I.comp(a)).includes(I.comp(b));
  if (I.comp(from) === I.comp(to)) return { error: 'A connector joins two elements' };
  const kind = within(from, to) || within(to, from) ? 'delegation' : 'assembly';
  if (kind === 'delegation' && !I.P.has(within(to, from) ? from : to)) return { error: 'Delegate from a port of the box' }; // drawn only from its port (cpPic)
  return [{ op: 'add', element: { id: cpNewId(model, 'connector'), type: 'uml.Connector', from, to, props: { kind } }, view: view.id }];
}
// a port dropped, or Alt + arrows on it: its side, as present.<port>.side (§4.5); along its own side, nothing, as said
function cpMoveTo(model, view, id, at) {
  const I = cpIndex(model); if (!I.P.has(id) || !CP_OBJ(at)) return null;
  const g = CP_OBJ(at.geo) ? at.geo : {}, me = CP_OWN(g.byId, id), o = CP_OWN(g.byId, I.P.get(id).owner) || CP_ARR(g.families).find(f => f.id === I.P.get(id).owner);
  let s = null;
  if (Array.isArray(at.by)) { const [dx, dy] = at.by, v = me && (me.side === 'L' || me.side === 'R');
    if (me && (v ? dy && !dx : dx && !dy)) return { commands: [], say: 'A port\'s order along its side follows its lines: Alt + arrows across it moves it to another side' };
    s = dx < 0 ? 'L' : dx > 0 ? 'R' : dy < 0 ? 'T' : dy > 0 ? 'B' : null; }
  else if (Array.isArray(at.pt) && o) { const [x, y] = at.pt, d = { L: Math.abs(x - o.x), R: Math.abs(x - o.x - o.w), T: Math.abs(y - o.y), B: Math.abs(y - o.y - o.h) };
    s = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a)); }
  return s ? [{ op: 'set', view: view.id, path: ['present', id, 'side'], value: CP_SIDE[s] }] : null;
}
// the palette: a port into the selected component; an interface as a ball or a rectangle, picked
function cpAdd(model, view, entry, label, at) {
  const I = cpIndex(model), sel = CP_ARR(at && at.sel).map(id => (I.P.has(id) ? I.P.get(id).owner : id)).find(id => ['uml.Component', 'uml.Class'].includes((I.N.get(id) || {}).type));
  if (entry.type === 'uml.Port') return sel ? [{ op: 'add', element: { id: cpNewId(model, 'port'), type: 'uml.Port', ...(label ? { label } : {}) }, owner: sel }] : { error: 'Select a component to add a port to' };
  if (entry.type !== 'uml.Interface') return null;
  const id = cpNewId(model, 'interface'), add = { op: 'add', element: { id, type: 'uml.Interface', ...(label ? { label } : {}) }, view: view.id };
  return { pick: ['Ball', 'Rectangle'], then: i => (i === 0 ? [add, { op: 'set', view: view.id, path: ['present', id, 'as'], value: 'ball' }] : [add]) };
}
// the panel's member rows on a component: a port, `name` or `name : Type` (§12.1). A class has no rows here (member.holds): its ports come from the palette
function cpMember(model, view, owner, id, text) {
  const I = cpIndex(model); if ((I.N.get(owner) || {}).type !== 'uml.Component') return null;
  if (id != null && !I.P.has(id)) return null; // an operation or attribute row: member.edit's (memberEdit)
  const r = cpPortText(text); if (r.error) return r;
  if (id == null) return [{ op: 'add', element: { id: cpNewId(model, 'port'), type: 'uml.Port', label: r.label, ...(r.valueType ? { props: { valueType: r.valueType } } : {}) }, owner }];
  return [{ op: 'set', id, path: 'label', value: r.label }, { op: 'set', id, path: 'props.valueType', value: r.valueType }];
}
// B on an interface: a ball, or back to a rectangle (S11)
function cpKey(model, view, ids, key) {
  if (key !== 'b' && key !== 'B') return null;
  const I = cpIndex(model), its = ids.filter(id => (I.N.get(id) || {}).type === 'uml.Interface'); if (!its.length) return null;
  return its.map(id => ({ op: 'set', view: view.id, path: ['present', id, 'as'], value: cpBall(I, view, id) ? undefined : 'ball' }));
}
// Delete on a port: a member is not hidden, it is deleted from the model, as said (§12.2, S20)
// the rest of a mixed selection as the canvas's default (src/canvas/edit.js): hidden, or deleted when it lives in this view only
function cpRemove(model, view, ids, fromModel) {
  const I = cpIndex(model), ps = ids.filter(id => I.P.has(id)); if (!ps.length) return null;
  const own = new Set([...CP_ARR(view.nodes), ...CP_ARR(view.edges)].filter(CP_OBJ).map(x => x.id)), lines = new Set(CP_ARR(model.edges).filter(CP_OBJ).map(e => e.id));
  const rest = ids.filter(id => !I.P.has(id) && (fromModel || own.has(id) || !lines.has(id) || Array.isArray(view.edges))); // a line of a view listing none: not hidden, as the default
  const hid = fromModel ? 0 : rest.filter(id => !own.has(id)).length;
  return { commands: [...ps, ...rest].map(id => (fromModel || own.has(id) || I.P.has(id) ? { op: 'delete', id } : { op: 'hide', id, view: view.id })),
    say: `Deleted ${ps.length === 1 ? 'port ' + cpName(I.P.get(ps[0]).x) : cpPlural(ps.length, 'port')} from the model${fromModel ? '' : ': a port is not hidden from a view'}${hid ? `; hid ${cpPlural(hid, 'element')}` : ''}` };
}
// the Owner field: a component's components and packages; an interface's, an artifact's or a comment's packages
function cpOwners(model, x) {
  if (!CP_OBJ(x) || x.from != null || !['uml.Component', 'uml.Interface', 'uml.Artifact', 'uml.Package', 'uml.Comment'].includes(x.type)) return null;
  const kinds = x.type === 'uml.Component' ? ['uml.Component', 'uml.Package'] : ['uml.Package'];
  const I = cpIndex(model); // not itself nor what it holds: apply() refuses a move inside itself
  return CP_ARR(model.nodes).filter(n => CP_OBJ(n) && kinds.includes(n.type) && n.id !== x.id && !I.chain(n.id).includes(x.id)).map(n => ({ id: n.id, label: cpName(n) }));
}

const CP_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const CP_TYPE = registerDiagramType('uml.component', {
  title: 'component diagram',
  elements: [['Component', 'Component'], ['Interface', 'Interface'], ['Artifact', 'Artifact'], ['Package', 'Package'], ['Port', 'Port'], ['Comment', 'Comment']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['InterfaceRealization', 'Realization'], ['ComponentRealization', 'Component realization'], ['Usage', 'Usage'], ['Connector', 'Assembly', 'assembly'], ['Connector', 'Delegation', 'delegation'],
    ['Dependency', 'Dependency'], ['Manifestation', 'Manifestation'], ['CommentLink', 'Comment link']].map(([t, label, kind]) => ({ type: 'uml.' + t, label, ...(kind ? { props: { kind } } : {}) })),
  props: {
    'uml.Component': [CP_STEREO], 'uml.Interface': [CP_STEREO], 'uml.Artifact': [CP_STEREO], 'uml.Package': [CP_STEREO], 'uml.Port': [{ key: 'valueType', label: 'Type', kind: 'text' }, CP_STEREO],
    'uml.Connector': [{ key: 'kind', label: 'Kind', kind: 'enum', options: ['assembly', 'delegation'] }, CP_STEREO],
    'uml.InterfaceRealization': [CP_STEREO], 'uml.ComponentRealization': [CP_STEREO], 'uml.Usage': [CP_STEREO], 'uml.Dependency': [CP_STEREO], 'uml.Manifestation': [CP_STEREO], 'uml.CommentLink': [],
  },
  layout: Object.assign(cpGeo, { rank: false }), // cpGeo ranks the view itself (cpPlace): the host passes only the pins
  boxes: (model, view) => cpPic(model, view).boxes,
  owners: cpOwners,
  // a component's rows are its ports (edits.member reads them first); an interface's its operations, as the class type's
  member: { print: m => (m.type === 'uml.Port' ? cpPortPrint(m) : printMember(m)), edit: (m, t) => (m.type === 'uml.Port' ? { error: 'A port is edited on its component' } : memberEdit(m, t)), add: t => parseMember(String(t ?? '').trim()),
    holds: n => n.type === 'uml.Component' || n.type === 'uml.Interface' },
  validate: cpProblems,
  rules: CP_RULES,
  describe: cpDescribe,
  edits: { connect: cpConnect, moveTo: cpMoveTo, add: cpAdd, member: cpMember, key: cpKey, remove: cpRemove },
  // the PDF's tables (§11): a component's ports, each with what it provides and requires; an interface's operations; what an artifact manifests
  word: (model, id) => { const x = cpIndex(model).N.get(id); return x ? ({ 'uml.Component': 'Component', 'uml.Interface': 'Interface', 'uml.Artifact': 'Artifact', 'uml.Package': 'Package', 'uml.Comment': 'Comment' }[x.type] || null) : null; },
  rows: (model, view, id) => { const pic = cpPic(model, view), x = pic.I.N.get(id); if (!x) return null;
    // then the connectors from it or its ports with a port at an end (0.22.0), which the Lines table leaves out: a port is no card
    if (x.type === 'uml.Component') return [...cpPortsOf(x).map(p => cpNodeName(model, view, pic, p.id, 1).slice(5)),
      ...pic.lines.filter(l => l.e.type === 'uml.Connector' && pic.I.comp(l.e.from) === id && (pic.I.P.has(l.e.from) || pic.I.P.has(l.e.to))).map(l => cpLineName(pic, l))];
    if (x.type === 'uml.Interface') return CP_ARR(x.members).filter(CP_OBJ).map(printMember);
    if (x.type === 'uml.Artifact') return pic.lines.filter(l => l.e.type === 'uml.Manifestation' && l.e.from === id).map(l => `manifests ${pic.name(l.e.to)}`);
    return null; },
});

export { CP_TYPE, CP_RULES, cpGeo, cpProblems, cpDescribe, cpConnect, cpMoveTo, cpAdd, cpMember, cpKey, cpRemove, cpRank, cpPlace };
