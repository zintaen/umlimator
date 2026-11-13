import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { rowsFor, untangle } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.note, a comment's look
import './usecase.js'; // SHAPE.ellipse, a collaboration use's; SHAPE.subject, a class subject's frame
import { SN_SAY, STRUCT_RULES, portFit, portSides, portsDrawn, structProblems } from './structure.js';

/* ---------- the composite structure diagram, uml.composite-structure (work package 5.6, notes/stage-5.md §6, §10.2) ----------
   The view's subject (a class, a component or a collaboration, listed in nodeIds) is a box holding its parts (its uml.Property
   members, drawn as nodes under their own ids) and its collaboration uses (shown nodes whose parent it is); its ports sit on the
   box's border. A part shows the ports of the class or component its valueType names by label, and every port a connector
   reaches through it (ends.<end>.part), each under the geometry id `<part>-><port>` (§6), its side under
   present.<part>.ports.<port>.side. A connector from the subject's port to something inside is an inner line (§5). An open
   collaboration is a dashed ellipse (a round box, §9.3) round its roles; role bindings run from a part to a collaboration use,
   the role's name as the line's label (labelGaps, §10.2 as built). Ranked by the type itself (layout.rank false: the host passes the pins alone), then
   laid out by layoutTyped with repair and reroute off (§14); the ports with no line, the port nodes and their names are put
   on a copy (portsDrawn, src/uml/structure.js). Ships in lib/umlimator-all.js only. */

const CS_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), CS_ARR = x => (Array.isArray(x) ? x : []);
const CS_HAS = x => x != null && x !== '';
const CS_PROPS = x => (CS_OBJ(x && x.props) ? x.props : {});
const csName = x => String(x.label ?? x.id);
const csPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const csStereo = x => CS_ARR(CS_PROPS(x).stereotypes).filter(CS_HAS).map(String);
const CS_SUBJECTS = ['uml.Class', 'uml.Component', 'uml.Collaboration'], CS_TYPED = ['uml.Class', 'uml.Component']; // a subject; what owns ports and types parts
const CS_LINES = ['uml.Connector', 'uml.RoleBinding', 'uml.CommentLink'];
const CS_WORD = { L: 'left', R: 'right', T: 'top', B: 'bottom' }, CS_SIDE = { left: 'L', right: 'R', top: 'T', bottom: 'B' }, CS_OPP = { L: 'R', R: 'L', T: 'B', B: 'T' }, CS_TURN = { L: 'T', T: 'L', R: 'B', B: 'R' };
// a port on a part, by its geometry id (§6): no element id holds '->' (model.md rule 5)
const csPortId = (part, port) => `${part}->${port}`;
const csSplit = id => { const s = String(id), k = s.indexOf('->'); return k < 0 ? null : [s.slice(0, k), s.slice(k + 2)]; };

/* ---- a part's text, `name : Type [multiplicity]`, both ways; a member row ---- */
const csPartText = m => { const p = CS_PROPS(m); return `${m.label ?? ''}${CS_HAS(p.valueType) ? ' : ' + p.valueType : ''}${CS_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : ''}`.trim(); };
const csPortText = m => `${m.label ?? ''}${CS_HAS(CS_PROPS(m).valueType) ? ' : ' + CS_PROPS(m).valueType : ''}`;
function csParse(t) {
  const m = /^\s*([^:[\]]*?)\s*(?::\s*([^:[\]]*?)\s*)?(?:\[\s*([^\]]*?)\s*\])?\s*$/.exec(String(t ?? ''));
  return m && m[1] ? { label: m[1], valueType: m[2] || undefined, multiplicity: m[3] || undefined } : { error: 'A part is name : Type [multiplicity]' };
}
// a member row on owner (§12.1): `port name : Type` on a class or component is a port, any other row a part (on a collaboration,
// a role); was: the member the row edits, whose kind it keeps. A member as the model writes it, or { error }
function csRow(owner, text, was) {
  const t = String(text ?? '').trim(), port = was ? was.type === 'uml.Port' : /^port\s/i.test(t) && CS_TYPED.includes(owner && owner.type);
  const r = csParse(port ? t.replace(/^port\s+/i, '') : t);
  if (r.error || (port && r.multiplicity)) return { error: port ? 'A port is port name : Type' : r.error };
  return { type: port ? 'uml.Port' : 'uml.Property', label: r.label, props: { ...(r.valueType ? { valueType: r.valueType } : {}), ...(r.multiplicity ? { multiplicity: r.multiplicity } : {}) } };
}
// the sets that give x what r reads as: its name, its type and its multiplicity, one set each that changed (undefined clears one)
const csSets = (x, r, keepType) => [['label', x.label, r.label], ['props.valueType', CS_PROPS(x).valueType, keepType ? CS_PROPS(x).valueType : r.props.valueType],
  ['props.multiplicity', CS_PROPS(x).multiplicity, x.type === 'uml.Port' ? CS_PROPS(x).multiplicity : r.props.multiplicity]]
  .filter(([, a, b]) => (a ?? undefined) !== b).map(([path, , value]) => ({ op: 'set', id: x.id, path, value }));
// an id not yet in the model: base, else base-2, base-3, …
function csFresh(model, base) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'element'; let id = b, k = 1; while (used.has(id)) id = `${b}-${++k}`;
  return id;
}

/* ---- the shapes (§9.1): a part (and a role), a collaboration use, an open collaboration's frame ---- */
const CS = { pad: 10, px: 12, minW: 96, maxW: 320, h: 48 };
SHAPE.part = {
  size: n => ({ w: Math.ceil(Math.min(CS.maxW, Math.max(CS.minW, textW(n.label ?? '', CS.px) + 2 * CS.pad))), h: CS.h }),
  out: boxOut(0), face: n => [n.y, n.y + n.h], inset: () => 0,
  draw(n, c, f) { const { x, y, w, h } = n;
    return `<g class="node part" data-id="${esc(n.id)}" data-shape="part" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Part ' + (n.label ?? ''))}">`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-mask"/><rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-body" fill="${f}" stroke="${c}"${n.shared ? ' stroke-dasharray="6 4"' : ''}/>`
      + `<text x="${r2(x + w / 2)}" y="${r2(y + h / 2 + 4)}" text-anchor="middle" class="c-name" fill="var(--um-text)" style="font:500 ${CS.px}px var(--um-sans)" data-o="${esc(n.id)}">${esc(fit(n.label ?? '', CS.px, w - 2 * CS.pad))}</text></g>`; },
};
SHAPE.part.ports = (n, side, k = 1) => portsOn(SHAPE.part, n, side, k);
// a collaboration use: the use case's ellipse (src/uml/usecase.js), dashed
SHAPE['collab-use'] = { ...SHAPE.ellipse, draw: (n, c, f) => SHAPE.ellipse.draw(n, c, f).replace('class="node usecase"', 'class="node collab-use"').replace('class="n-body"', 'class="n-body" stroke-dasharray="6 4"') };
// an open collaboration: a dashed ellipse in its frame, which TYPED.frame grew by √2 round the rectangle of its contents (round,
// §9.3); its name in that rectangle's header room, over a dashed line across the ellipse
SHAPE.collaboration = {
  frame(f) { const cx = f.x + f.w / 2, cy = f.y + f.h / 2, w0 = f.w / Math.SQRT2, top = cy - f.h / Math.SQRT2 / 2, y = top + 24, hw = f.w / 2 * Math.sqrt(Math.max(0, 1 - ((y - cy) / (f.h / 2)) ** 2));
    return `<ellipse class="family-box" cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(f.w / 2)}" ry="${r2(f.h / 2)}" stroke="var(--um-muted)" stroke-dasharray="6 4"/>`
      + `<text class="family-title" x="${r2(cx)}" y="${r2(top + 17)}" text-anchor="middle" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, w0 - 24))}</text>`
      + `<path d="M${r2(cx - hw)} ${r2(y)}H${r2(cx + hw)}" class="cs-rule" stroke="var(--um-muted)" stroke-dasharray="4 3"/>`; },
};

/* ---- the view read: its subject, parts, ports, collaboration uses, open collaborations, the rest, and its lines ---- */
function csPic(model, view) {
  const at = new Map(), mem = new Map(); // nodes by id; members by id, with their owner (the first of an id)
  CS_ARR(model && model.nodes).forEach(n => { if (CS_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  at.forEach(n => CS_ARR(n.members).forEach(m => { if (CS_OBJ(m) && typeof m.id === 'string' && !at.has(m.id) && !mem.has(m.id)) mem.set(m.id, { m, owner: n }); }));
  const kids = (x, t) => CS_ARR(x.members).filter(m => CS_OBJ(m) && m.type === t && mem.has(m.id) && mem.get(m.id).m === m);
  const ids = [...new Set(CS_ARR(view && view.nodeIds))].filter(id => at.has(id)), sid = view && view.subject;
  const S = ids.includes(sid) && CS_SUBJECTS.includes(at.get(sid).type) ? at.get(sid) : null;
  const parts = S ? kids(S, 'uml.Property') : [], sPorts = S && CS_TYPED.includes(S.type) ? kids(S, 'uml.Port') : [];
  const uses = S ? ids.filter(id => id !== sid && at.get(id).type === 'uml.CollaborationUse' && at.get(id).parent === sid) : [];
  const collabs = ids.filter(id => id !== sid && at.get(id).type === 'uml.Collaboration').map(id => ({ x: at.get(id), roles: kids(at.get(id), 'uml.Property') })).filter(c => c.roles.length);
  const boxed = new Set([...(S && (parts.length || uses.length) ? [sid] : []), ...collabs.map(c => c.x.id)]);
  const rest = ids.filter(id => !boxed.has(id) && !uses.includes(id));
  const partOf = new Map([...parts.map(m => [m.id, S]), ...collabs.flatMap(c => c.roles.map(m => [m.id, c.x]))]); // a part or role: its structure
  const classes = [...at.values()].filter(n => CS_TYPED.includes(n.type));
  const typeOf = p => { const vt = CS_PROPS(p).valueType, c = CS_HAS(vt) ? classes.filter(n => n.label === vt) : []; return c.length === 1 ? c[0] : null; };
  const el = id => at.get(id) || (mem.get(id) || {}).m || null;
  // a line's end as drawn: { node, port?, id (the model's) }; null where nothing drawn is it
  const end = (e, k) => { const x = e[k], p = (CS_PROPS(e).ends || {})[k], part = CS_OBJ(p) ? p.part : null;
    if (part != null) return partOf.has(part) && (mem.get(x) || {}).m && mem.get(x).m.type === 'uml.Port' ? { node: part, port: csPortId(part, x), id: x, part } : null;
    if (S && sPorts.some(q => q.id === x)) return { node: sid, port: x, id: x };
    return ids.includes(x) || partOf.has(x) ? { node: x, id: x } : null; };
  const within = (b, n) => b === sid ? n !== sid && (partOf.get(n) === S || uses.includes(n)) : collabs.some(c => c.x.id === b && partOf.get(n) === c.x);
  const E = new Map(); CS_ARR(model && model.edges).forEach(e => { if (CS_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const list = Array.isArray(view && view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => CS_LINES.includes(e.type));
  const loops = []; // connectors between two ports of one box: not drawn (the router has no line from a box to itself), warned
  const lines = list.filter(CS_OBJ).map(e => { const f = end(e, 'from'), t = end(e, 'to'); if (!f || !t) return null;
    if (boxed.has(f.node) && f.node === t.node) { loops.push(e.id); return null; }
    // a line from a box to what it holds is drawn only from the box's port, inward (§5)
    const inner = boxed.has(f.node) && within(f.node, t.node) ? 'from' : boxed.has(t.node) && within(t.node, f.node) ? 'to' : null;
    if (inner && !(inner === 'from' ? f : t).port) return null;
    return { e, f, t, inner }; }).filter(Boolean);
  // the ports drawn on each part: its type's, then those its connectors reach through it (§6)
  const partPorts = new Map([...partOf.keys()].map(p => { const T = typeOf(el(p)), own = T ? kids(T, 'uml.Port') : [], seen = new Set(own.map(m => m.id));
    lines.forEach(({ f, t }) => [f, t].forEach(x => { if (x.part === p && !seen.has(x.id)) { seen.add(x.id); own.push(mem.get(x.id).m); } }));
    return [p, own]; }));
  return { at, mem, el, ids, S, sid, parts, sPorts, uses, collabs, boxed, rest, partOf, typeOf, lines, loops, partPorts, kids };
}

/* ---- names (§10.2, A1), reading order and the legend ---- */
const csWord = t => String(t ?? '').split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ./g, s => s.toLowerCase()); // 'uml.CollaborationUse': "Collaboration use"
const csUseText = u => `${u.label ?? ''}${CS_HAS(CS_PROPS(u).collaboration) ? ' : ' + CS_PROPS(u).collaboration : ''}`;
// role bindings to a collaboration use: "publisher to checkout"
const csBindings = (P, u) => P.lines.filter(l => l.e.type === 'uml.RoleBinding' && l.e.to === u).map(l => `${CS_HAS(l.e.label) ? l.e.label : 'a role'} to ${csName(P.el(l.e.from))}`);
function csNodeName(P, id) {
  const x = P.el(id), st = csStereo(x), why = st.length ? ` (${st.join(', ')})` : '';
  if (x.type === 'uml.Comment') return 'Comment: ' + csName(x);
  if (P.boxed.has(id)) { const held = id === P.sid ? [...P.parts.map(() => x.type === 'uml.Collaboration' ? 'role' : 'part'), ...P.uses.map(() => 'collaboration use')] : P.collabs.find(c => c.x.id === id).roles.map(() => 'role');
    return SN_SAY.component(csName(x), { stereotypes: st, ports: id === P.sid ? P.sPorts.length : 0, holds: held }).replace(/^Component/, csWord(x.type)); }
  if (P.partOf.has(id)) { const o = P.partOf.get(id), role = o.type === 'uml.Collaboration' && o !== P.S || P.S && P.S.type === 'uml.Collaboration', k = P.partPorts.get(id).length;
    return `${role ? 'Role' : 'Part'} ${csPartText(x)}${why}${!role && CS_PROPS(x).aggregation === 'shared' ? ', shared' : ''}, in ${csName(o)}${k ? ', ' + csPlural(k, 'port') : ''}`; }
  if (x.type === 'uml.CollaborationUse') { const b = csBindings(P, id); return `Collaboration use ${csUseText(x)}${why}${b.length ? ', binding ' + b.join(', ') : ''}`; }
  return `${csWord(x.type)} ${csName(x)}${why}${id === P.sid && P.sPorts.length ? ', ' + csPlural(P.sPorts.length, 'port') : ''}`;
}
const csEndName = (P, x) => (x.part != null ? `${csName(P.mem.get(x.id).m)} of ${csName(P.el(x.part))}` : x.port != null ? `${csName(P.mem.get(x.id).m)} of ${csName(P.S)}` : csName(P.el(x.id)));
const CS_LINE_WORD = { 'uml.Connector': 'Connector', 'uml.RoleBinding': 'Role binding', 'uml.CommentLink': 'Comment link' };
const csLineName = (P, { e, f, t }) => e.type === 'uml.RoleBinding' ? `Role binding from ${csEndName(P, f)} to ${csEndName(P, t)}${CS_HAS(e.label) ? ', as ' + e.label : ''}`
  : `${CS_LINE_WORD[e.type] || 'Line'} from ${csEndName(P, f)} to ${csEndName(P, t)}${CS_HAS(e.label) ? ': ' + e.label : ''}`;
// the structure a connector is drawn in: its from end's part's or role's, else its from end's owner (a port of the subject)
const csStructOf = (P, e) => { const p = (CS_PROPS(e).ends || {}).from, k = CS_OBJ(p) && p.part != null ? p.part : e.from; return P.partOf.get(k) || (P.mem.get(k) || {}).owner; };
// the subject and its ports, each part and its ports, the collaboration uses, each open collaboration and its roles, the rest; then the lines
function csOrder(P) {
  const out = [], part = m => { out.push(m.id); P.partPorts.get(m.id).forEach(q => out.push(csPortId(m.id, q.id))); };
  if (P.S && !P.rest.includes(P.sid)) { out.push(P.sid, ...P.sPorts.map(q => q.id)); P.parts.forEach(part); out.push(...P.uses); }
  P.collabs.forEach(c => { out.push(c.x.id); c.roles.forEach(part); });
  P.rest.forEach(id => { out.push(id); if (id === P.sid) out.push(...P.sPorts.map(q => q.id)); });
  return [...out, ...P.lines.map(l => l.e.id)];
}
const CS_LOOK = { 'uml.Connector': { from: 'none', to: 'none' }, 'uml.RoleBinding': { from: 'none', to: 'none', dashed: true }, 'uml.CommentLink': { from: 'none', to: 'none', dashed: true } };
const CS_SAYS = { 'uml.Connector': 'a link between parts and ports at run time', 'uml.RoleBinding': 'the part plays the named role of the collaboration', 'uml.CommentLink': 'what a comment is about' };
const csLegend = lines => Object.keys(CS_SAYS).filter(t => lines.some(l => l.e.type === t)).map(t => `<span class="lgi" title="${esc(CS_LINE_WORD[t] + ' — ' + CS_SAYS[t])}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">`
  + `<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4"${CS_LOOK[t].dashed ? ' stroke-dasharray="3 2"' : ''}/></svg><b>${esc(CS_LINE_WORD[t])}</b><span>${esc(CS_SAYS[t])}</span></span>`);

/* ---- the view laid out (§10.2) ---- */
/* each id's [col, row]: the longest path over the links, cycles broken depth first, columns ordered by untangle and rows by
   rowsFor (src/layout/layered.js); an id no link reaches goes in rows under the rest. ponytail: the communication type's
   cmRank and cmPlace in short, which it does not export */
function csRank(ids, links) {
  const outs = new Map(ids.map(id => [id, []])), st = new Map(), back = new Set(), at = Object.create(null);
  links.forEach((l, k) => outs.get(l[0]).push(k));
  const dfs = u => { st.set(u, 1); outs.get(u).forEach(k => { const v = links[k][1]; if (st.get(v) === 1) back.add(k); else if (!st.has(v)) dfs(v); }); st.set(u, 2); };
  ids.forEach(id => { if (!st.has(id)) dfs(id); });
  const fwd = links.filter((l, k) => !back.has(k)), rank = Object.create(null); ids.forEach(id => { rank[id] = 0; });
  for (let i = 0, more = true; more && i <= ids.length; i++) { more = false; fwd.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) { rank[b] = rank[a] + 1; more = true; } }); }
  const lined = new Set(links.flatMap(l => l)), cols = []; ids.filter(id => lined.has(id)).forEach(id => (cols[rank[id]] ||= []).push(id));
  const mains = cols.filter(Boolean); untangle(mains, fwd); const row = rowsFor(mains, fwd);
  mains.forEach((c, k) => c.forEach(id => { at[id] = [k, row[id]]; }));
  const loose = ids.filter(id => !lined.has(id)), per = Math.max(2, mains.length), under = Math.max(-1, ...Object.values(at).map(p => p[1])) + 1;
  loose.forEach((id, k) => { at[id] = [k % per, under + Math.floor(k / per)]; });
  return at;
}
function csGeo({ model, view, pos: pins, memo }) {
  const P = csPic(model, view), down = view.direction === 'down', present = CS_OBJ(view.present) ? view.present : {};
  // the ranking: the subject's parts and uses, then each open collaboration's roles, then the rest, block after block to the right
  const pos = Object.create(null), sBox = P.boxed.has(P.sid), blocks = [], lineNode = l => [l.f.node, l.t.node];
  const links = ids => P.lines.filter(l => l.e.type !== 'uml.CommentLink').map(lineNode).filter(([a, b]) => a !== b && ids.includes(a) && ids.includes(b));
  if (sBox) { const ids = [...P.parts.map(m => m.id), ...P.uses]; blocks.push([ids, links(ids)]); }
  P.collabs.forEach(c => { const ids = c.roles.map(m => m.id); blocks.push([ids, links(ids)]); });
  if (P.rest.length) blocks.push([P.rest, []]);
  // a pin (a column and row of the whole picture) wins, kept to its block's first column at least, and the next block starts past
  // the furthest column this one holds, pins counted: no box reaches over another's. Each id on a cell taken goes down a row, pins first
  const pinOf = id => (CS_OBJ(pins) && Object.hasOwn(pins, id) && Array.isArray(pins[id]) && pins[id].length === 2 && pins[id].every(Number.isFinite) ? pins[id] : null);
  blocks.reduce((off, [ids, ls]) => { const at = csRank(ids, ls), taken = [], free = (c, r) => !taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1);
    [...ids.filter(pinOf), ...ids.filter(id => !pinOf(id))].forEach(id => { const p = pinOf(id); let [c, r] = p ? [Math.max(off, p[0]), p[1]] : [at[id][0] + off, at[id][1]];
      while (!free(c, r)) r++; pos[id] = [c, r]; taken.push([c, r]); });
    return Math.max(...ids.map(id => pos[id][0])) + 1; }, 0);
  // the ports' sides (§4.2): the subject's first, each box at the mean of what it holds; then the parts', a line to the subject's
  // port counting toward a place past the subject's border on that port's side
  const mean = ids => (ids.length ? [0, 1].map(k => ids.reduce((a, id) => a + pos[id][k], 0) / ids.length) : [0, 0]);
  if (sBox) pos[P.sid] = mean(blocks[0][0]);
  const farOf = gid => P.lines.flatMap(l => [[l.f, l.t], [l.t, l.f]].filter(([a]) => a.port === gid).map(([, b]) => b));
  const sides = portSides(P.sPorts.map(q => ({ id: q.id, owner: P.sid, pin: (present[q.id] || {}).side, far: farOf(q.id).map(b => b.node) })), pos, down);
  const inS = sBox ? blocks[0][0] : [], cs = inS.map(id => pos[id][0]), rs = inS.map(id => pos[id][1]), [mc, mr] = pos[P.sid] || [0, 0];
  const past = s => ({ L: [Math.min(...cs) - 1, mr], R: [Math.max(...cs) + 1, mr], T: [mc, Math.min(...rs) - 1], B: [mc, Math.max(...rs) + 1] })[down ? CS_TURN[s] : s];
  const pos2 = Object.assign(Object.create(null), pos), partPorts = [...P.partPorts].flatMap(([p, qs]) => qs.map(q => ({ id: csPortId(p, q.id), owner: p, q,
    pin: ((CS_OBJ(present[p]) && CS_OBJ(present[p].ports) ? present[p].ports : {})[q.id] || {}).side,
    far: farOf(csPortId(p, q.id)).map(b => { if (b.port == null || b.part != null || !sides[b.port]) return b.node; pos2['#' + b.port] = past(sides[b.port]); return '#' + b.port; }) })));
  Object.assign(sides, portSides(partPorts, pos2, down));
  // the nodes, each as big as its ports need (portFit)
  const count = {}; P.lines.forEach(({ f, t }) => [f, t].forEach(x => { if (x.port) count[x.port] = (count[x.port] || 0) + 1; }));
  const fit = portFit([...partPorts, ...(sBox ? [] : P.sPorts.map(q => ({ id: q.id, owner: P.sid })))].map(p => ({ ...p, lines: count[p.id] })), sides);
  const nodes = Object.keys(pos).filter(id => !P.boxed.has(id)).map(id => { const x = P.el(id), st = csStereo(x), part = P.partOf.has(id);
    const shape = part ? { shape: 'part', label: csPartText(x), shared: CS_PROPS(x).aggregation === 'shared' } : x.type === 'uml.Comment' ? { shape: 'note' }
      : x.type === 'uml.CollaborationUse' ? { shape: 'collab-use', label: csUseText(x), stereotypes: st } : x.type === 'uml.Collaboration' ? { shape: 'collab-use', stereotypes: st }
        : x.type === 'uml.Component' ? { shape: 'component', stereotypes: st } : { shape: 'classifier', stereotypes: st, compartments: [] };
    const d = { id, label: csName(x), type: x.type, kind: 'file', ...shape, aria: csNodeName(P, id), col: pos[id][0], row: pos[id][1] }, s = SHAPE[d.shape].size(d), m = fit[id] || { w: 0, h: 0 };
    return { ...d, w: Math.max(s.w, m.w), h: Math.max(s.h, m.h) }; });
  // each line: its ports, the side each leaves by (in the layout's own axes: a view laid out down is laid out turned), inner
  // ends leaving the other way (§5), and the port's place among its owner's ports (portRank)
  const rankOf = x => (x.part != null ? P.partPorts.get(x.part) : P.sPorts).findIndex(q => q.id === x.id);
  const sideOf = (x, inner) => { const s = sides[x.port], r = down ? CS_TURN[s] : s; return CS_WORD[inner ? CS_OPP[r] : r]; };
  const edges = P.lines.map(l => { const { e, f, t, inner } = l, rk = [f, t].map(x => (x.port ? rankOf(x) : null));
    return { id: e.id, _id: e.id, type: e.type, from: f.node, to: t.node, aria: csLineName(P, l),
      ...(f.port ? { fromPort: f.port, fromSide: sideOf(f, inner === 'from') } : {}), ...(t.port ? { toPort: t.port, toSide: sideOf(t, inner === 'to') } : {}), ...(inner ? { inner } : {}),
      ...(f.port || t.port ? { portRank: f.port && t.port ? rk : rk[f.port ? 0 : 1] } : {}),
      // a role binding's role is its line's label, which the router gives room and the port names keep clear of (portsDrawn); an
      // end label, placed when drawn (src/typed/draw.js), would not see them
      end: CS_LOOK[e.type] || { from: 'none', to: 'none' }, ...(e.type !== 'uml.CommentLink' && CS_HAS(e.label) ? { label: String(e.label), cut: 280 } : {}), ...(CS_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  const portsWithLines = P.lines.some(l => l.f.node === P.sid && l.f.port || l.t.node === P.sid && l.t.port);
  const shape = { 'uml.Component': 'component', 'uml.Collaboration': 'collaboration' };
  const containers = [...(sBox ? [P.S] : []), ...P.collabs.map(c => c.x)].map(x => ({ id: x.id, label: csName(x), title: [...csStereo(x).map(t => `«${t}»`), csName(x)].join(' '),
    nodeIds: x === P.S ? blocks[0][0] : P.collabs.find(c => c.x === x).roles.map(m => m.id), shape: shape[x.type] || 'subject', aria: csNodeName(P, x.id),
    ...(x === P.S && portsWithLines ? { pad: 48 } : {}), ...(x.type === 'uml.Collaboration' ? { round: true } : {}) }));
  // labelGaps (§8, decision 9): the role names on role bindings, which span the subject's columns, else find no spot
  const g = layoutTyped({ nodes, edges, ...(containers.length ? { containers } : {}), direction: down ? 'down' : 'right', gap: 64, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  const ports = [...P.sPorts.map(q => ({ q, id: q.id, owner: P.sid })), ...partPorts].map(p => ({ id: p.id, owner: p.owner, side: sides[p.id], label: csName(p.q), valueType: CS_PROPS(p.q).valueType,
    aria: SN_SAY.port(csName(p.q), csName(P.el(p.owner)), { valueType: CS_PROPS(p.q).valueType }) }));
  const out = portsDrawn(g, ports), byId = out.byId; // a copy: what layoutTyped returned is never edited (§2.4)
  // the slots (src/typed/edit.js): one at each node and box, so the palette's add hears what is selected (state.js's)
  const slots = [...out.nodes, ...CS_ARR(out.families)].map(n => ({ after: n.id, parent: null, x: n.x + n.w / 2, y: n.y + n.h / 2 }));
  return { ...out, slots, legend: csLegend(P.lines), order: csOrder(P).filter(id => Object.hasOwn(byId, id) || CS_ARR(out.families).some(f => f.id === id) || out.edges.some(e => e.id === id)) };
}

/* ---- validators (§10.2). Each problem: { level, rule, path, message, ids }; the shared port-owner and manifest-ends too ---- */
const CS_RULES = {
  'subject-shown': 'the view\'s subject is a class, a component or a collaboration listed in nodeIds (a view with none: a warning)',
  'part-type': 'a part\'s valueType names exactly one class or component of the model by label',
  'connector-part': 'an end\'s part is a part of the subject, and the end is a port of that part\'s type',
  'connector-scope': 'a connector\'s ends lie in one structure: the subject\'s ports and parts; or one collaboration\'s roles',
  'connector-drawn': 'a connector between two ports of the subject is not drawn: the box has no line to itself',
  'binding-ends': 'a role binding runs from a part of the subject to a collaboration use of it (a view with no subject: a warning)',
  'binding-role': 'a role binding\'s label names a role of the collaboration its use names',
  'collaboration-named': 'a collaboration use\'s collaboration names a collaboration of the model',
  ...STRUCT_RULES,
};
const csCollab = (P, u) => [...P.at.values()].find(n => n.type === 'uml.Collaboration' && CS_HAS(CS_PROPS(u).collaboration) && n.label === CS_PROPS(u).collaboration) || null;
function csProblems(model, view) {
  const out = [], P = csPic(model, view || {}), vi = CS_ARR(model && model.views).indexOf(view), S = P.S, say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const q = id => JSON.stringify(P.el(id) ? csName(P.el(id)) : String(id));
  if (!view) return structProblems(model);
  // a view with no subject at all (its subject deleted, or hidden from it, takes it: apply()) draws its other cards: a warning
  if (!S && view.subject == null) say('warning', 'subject-shown', `views[${vi}]`, [view.id], `view ${JSON.stringify(view.id)} has no subject (deleted, or hidden from it): it draws its other cards, and no structure until one is set`);
  else if (!S) say('error', 'subject-shown', `views[${vi}].subject`, [view.id, view.subject], `view ${JSON.stringify(view.id)}'s subject ${JSON.stringify(view.subject ?? null)} is not a class, a component or a collaboration it lists in nodeIds`);
  const nodeAt = id => CS_ARR(model.nodes).indexOf(P.at.get(id)), memPath = id => { const o = P.mem.get(id).owner; return `nodes[${nodeAt(o.id)}].members[${o.members.indexOf(P.mem.get(id).m)}]`; };
  if (S && S.type !== 'uml.Collaboration') P.parts.forEach(m => { if (!P.typeOf(m)) say('warning', 'part-type', memPath(m.id) + '.props.valueType', [m.id, S.id],
    `part ${q(m.id)} of ${q(S.id)} is typed ${JSON.stringify(CS_PROPS(m).valueType ?? null)}, which names ${[...P.at.values()].some(n => CS_TYPED.includes(n.type) && CS_HAS(n.label) && n.label === CS_PROPS(m).valueType) ? 'more than one' : 'no'} class or component, so it shows only the ports its connectors reach through it`); });
  // where an end lies: the subject's structure ('S'), a collaboration's (its id), or nowhere (null)
  const owner = id => (P.mem.get(id) || {}).owner, inS = id => S && (id === S.id || owner(id) === S);
  const structOf = (x, part) => { if (part != null) return owner(part) === S && S ? 'S' : null; if (inS(x)) return 'S'; if (S && P.uses.includes(x)) return 'S';
    const o = owner(x); return o && o.type === 'uml.Collaboration' && (P.mem.get(x).m.type === 'uml.Property') ? o.id : null; };
  CS_ARR(model.edges).forEach((e, i) => { if (!CS_OBJ(e)) return; const ends = CS_OBJ(CS_PROPS(e).ends) ? CS_PROPS(e).ends : {}, path = `edges[${i}]`;
    if (e.type === 'uml.Connector') {
      const parts = ['from', 'to'].map(k => (CS_OBJ(ends[k]) ? ends[k].part : null)), touches = ['from', 'to'].some((k, j) => structOf(e[k], parts[j]) || P.collabs.some(c => owner(e[k]) === c.x) || (parts[j] != null && owner(parts[j]) === S));
      if (!touches) return;
      ['from', 'to'].forEach((k, j) => { const p = parts[j]; if (p == null) return;
        if (!S || owner(p) !== S || P.mem.get(p).m.type !== 'uml.Property') return say('error', 'connector-part', `${path}.props.ends.${k}.part`, [e.id, p], `${e.id}'s ${k} end goes through ${q(p)}, not a part of the subject`);
        const T = P.typeOf(P.mem.get(p).m); if (T && !P.kids(T, 'uml.Port').some(m => m.id === e[k])) say('error', 'connector-part', `${path}.${k}`, [e.id, e[k], p], `${e.id}'s ${k} end ${q(e[k])} is not a port of ${q(T.id)}, the type of ${q(p)}`); });
      const a = structOf(e.from, parts[0]), b = structOf(e.to, parts[1]), bare = ['from', 'to'].find((k, j) => S && e[k] === S.id && parts[j] == null);
      // UML 2.5.1 §11.2: a connector's end is a part or a port, never the structured classifier itself
      if (bare) say('error', 'connector-scope', `${path}.${bare}`, [e.id, S.id], `${e.id}'s ${bare} end is ${q(S.id)} itself: a connector joins the subject's ports and parts`);
      else if (!a || a !== b) say('error', 'connector-scope', path, [e.id, e.from, e.to], `${e.id} joins ${q(e.from)} and ${q(e.to)}, which lie in ${a && b ? 'two structures' : 'no structure of this view'}: its ends are the subject's ports and parts, or one collaboration's roles`);
      else if (P.loops.includes(e.id)) say('warning', 'connector-drawn', path, [e.id, S.id], `${e.id} joins two ports of ${q(S.id)}, which this view does not draw: the box has no line to itself`);
    }
    if (e.type === 'uml.RoleBinding' && (P.at.get(e.to) || {}).type === 'uml.CollaborationUse' && P.ids.includes(e.to) || e.type === 'uml.RoleBinding' && S && owner(e.from) === S) {
      const u = P.at.get(e.to);
      if (!(S && owner(e.from) === S && P.mem.get(e.from).m.type === 'uml.Property' && u && u.type === 'uml.CollaborationUse' && u.parent === S.id))
        return say(S || view.subject != null ? 'error' : 'warning', 'binding-ends', path, [e.id, e.from, e.to], `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a role binding runs from a part of the subject to a collaboration use of it`);
      const C = csCollab(P, u);
      if (C && !P.kids(C, 'uml.Property').some(m => m.label === e.label)) say('warning', 'binding-role', `${path}.label`, [e.id, C.id], `${e.id} binds ${JSON.stringify(e.label ?? null)}, not a role of ${q(C.id)}`);
    } });
  P.uses.forEach(id => { const u = P.at.get(id); if (!csCollab(P, u)) say('warning', 'collaboration-named', `nodes[${nodeAt(id)}].props.collaboration`, [id],
    `collaboration use ${q(id)} names ${JSON.stringify(CS_PROPS(u).collaboration ?? null)}, not a collaboration of the model`); });
  return [...out, ...structProblems(model, view)];
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function csDescribe(model, viewId) {
  const v = CS_ARR(model && model.views).find(x => CS_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const P = csPic(model, v), by = new Map(P.lines.map(l => [l.e.id, l])), els = csOrder(P).filter(id => !by.has(id));
  const name = id => { const s = csSplit(id), q = P.mem.get(s ? s[1] : id); if (q && q.m.type === 'uml.Port') return SN_SAY.port(csName(q.m), csName(P.el(s ? s[0] : P.sid)), { valueType: CS_PROPS(q.m).valueType }); return csNodeName(P, id); };
  return [`${v.title || v.id}: a composite structure diagram of ${csPlural(els.length, 'element')} and ${csPlural(P.lines.length, 'line')}.`,
    ...csOrder(P).map(id => (by.has(id) ? csLineName(P, by.get(id)) : name(id)) + '.')].join('\n');
}

/* ---- editing (§6, §12) ---- */
const csOwnerOf = (P, id) => { const s = csSplit(id); return s ? s[0] : id; };
// connect: a connector from a port on a part keeps the part in ends.<end>.part; a role binding from a part to a collaboration
// use, its role picked from the collaboration the use names. Anything else: the default
function csConnect(model, view, from, to, at, line) {
  if (!CS_OBJ(line)) return null;
  const P = csPic(model, view), end = id => { const s = csSplit(id); return s ? { id: s[1], part: s[0] } : { id }; }, a = end(from), b = end(to);
  if (line.type === 'uml.RoleBinding') {
    const isPart = id => P.parts.some(m => m.id === id), isUse = id => P.uses.includes(id);
    let [p, u] = [a.part ?? a.id, b.part ?? b.id]; if (isUse(p) && isPart(u)) [p, u] = [u, p];
    if (!isPart(p) || !isUse(u)) return { error: 'A role binding runs from a part of the subject to a collaboration use' };
    const C = csCollab(P, P.at.get(u)), roles = C ? P.kids(C, 'uml.Property').map(csName) : [];
    const add = role => [{ op: 'add', element: { id: csFresh(model, 'binding'), type: 'uml.RoleBinding', from: p, to: u, ...(role != null ? { label: role } : {}) }, view: view.id }];
    return roles.length ? { pick: roles, then: i => add(roles[i]) } : add(null);
  }
  if (!a.part && !b.part) return null;
  if (line.type !== 'uml.Connector') return { error: `A ${String(line.label || 'line').toLowerCase()} joins the part, not a port on it` };
  const ends = Object.fromEntries([['from', a], ['to', b]].filter(([, x]) => x.part).map(([k, x]) => [k, { part: x.part }]));
  return [{ op: 'add', element: { id: csFresh(model, 'connector'), type: 'uml.Connector', from: a.id, to: b.id, props: { ends } }, view: view.id }];
}
// moveTo: a port dropped, or Alt + an arrow on it, goes to the side nearest the drop, or in the arrow's direction (§4.5); its place
// along its side is not stored (S3). Anything else, and a member's ↑ and ↓ in the panel (no geometry): the default
function csMoveTo(model, view, id, at) {
  const P = csPic(model, view), s = csSplit(id), mine = s ? P.partOf.has(s[0]) && CS_ARR(P.partPorts.get(s[0])).some(q => q.id === s[1]) : P.sPorts.some(q => q.id === id);
  if (!mine || !CS_OBJ(at) || !CS_OBJ(at.geo)) return null;
  const g = at.geo, n = CS_OBJ(g.byId) && Object.hasOwn(g.byId, id) ? g.byId[id] : null, o = n && (Object.hasOwn(g.byId, n.owner) ? g.byId[n.owner] : CS_ARR(g.families).find(f => f.id === n.owner));
  let side = null;
  if (Array.isArray(at.by)) { const [dx, dy] = at.by; side = dx ? (dx < 0 ? 'L' : 'R') : dy < 0 ? 'T' : 'B';
    if (n && (side === n.side || (side === 'L' || side === 'R') !== (n.side === 'L' || n.side === 'R')))
      return { error: side === n.side ? `The port is on its owner's ${CS_WORD[side]} side already` : 'A port\'s place along its side follows its lines and is not stored: Alt + an arrow across the side moves it to another side' }; }
  else if (Array.isArray(at.pt) && o) { const [x, y] = at.pt, d = { L: Math.abs(x - o.x), R: Math.abs(x - o.x - o.w), T: Math.abs(y - o.y), B: Math.abs(y - o.y - o.h) };
    side = Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a), 'L'); }
  if (!side) return null;
  return [{ op: 'set', view: view.id, path: s ? ['present', s[0], 'ports', s[1], 'side'] : ['present', id, 'side'], value: CS_WORD[side] }];
}
// add: a part into the subject; a port into the selected subject, class or component, or a selected part's type (said); a role
// into the selected collaboration; a collaboration use into the subject. Anything else: the default
function csAdd(model, view, entry, label, at) {
  if (!CS_OBJ(entry)) return null;
  const P = csPic(model, view), sel = CS_ARR(at && at.sel).map(id => csOwnerOf(P, id)).map(id => P.el(id)).filter(Boolean)[0] || null, t = String(label ?? '').trim();
  const member = (o, row, say) => { const r = csRow(o, row); if (r.error) return r; const c = [{ op: 'add', element: { id: csFresh(model, `${o.id}.${r.label.toLowerCase()}`), ...r }, owner: o.id }]; return say ? { commands: c, say } : c; };
  if (entry.type === 'uml.Port') {
    if (sel && P.partOf.has(sel.id)) { const T = P.typeOf(sel); if (!T) return { error: `${csName(sel)}'s type, ${JSON.stringify(CS_PROPS(sel).valueType ?? null)}, names no one class or component to add a port to` };
      return member(T, 'port ' + t, `Added the port to ${csName(T)}, the type of ${csName(sel)}: every part of that type shows it`); }
    return sel && CS_TYPED.includes(sel.type) ? member(sel, 'port ' + t) : { error: 'Select the subject, a part, a class or a component to add a port to' };
  }
  if (entry.type === 'uml.Property' && entry.label === 'Role') return sel && sel.type === 'uml.Collaboration' ? member(sel, t) : { error: 'Select a collaboration to add a role to' };
  if (entry.type === 'uml.Property') return P.S ? member(P.S, t) : { error: 'This view has no subject to add a part to' };
  if (entry.type === 'uml.CollaborationUse') { if (!P.S || !CS_TYPED.includes(P.S.type)) return { error: 'A collaboration use goes in a class or component subject' };
    const r = csParse(t); if (r.error || r.multiplicity) return { error: 'A collaboration use is name : Collaboration' };
    return [{ op: 'add', element: { id: csFresh(model, r.label.toLowerCase()), type: 'uml.CollaborationUse', label: r.label, parent: P.sid, props: r.valueType ? { collaboration: r.valueType } : {} }, view: view.id }]; }
  return null;
}
/* remove: a part, a port or a role is a member, which a view cannot hide (S20): Delete deletes it from the model, as Shift +
   Delete does, said. Delete on a port on a part deletes the connectors through that part to it; Shift + Delete, the port from
   its class (§6). Other ids as the default */
function csRemove(model, view, ids, fromModel) {
  const P = csPic(model, view); if (!CS_ARR(ids).some(id => csSplit(id) || P.mem.has(id))) return null;
  const out = [], hide = [], said = [], del = id => { if (!out.some(c => c.op === 'delete' && c.id === id)) out.push({ op: 'delete', id }); };
  ids.forEach(id => { const s = csSplit(id), x = P.mem.get(s ? s[1] : id);
    if (s && x && !fromModel) { const through = CS_ARR(model.edges).filter(e => CS_OBJ(e) && ['from', 'to'].some(k => e[k] === s[1] && CS_OBJ((CS_PROPS(e).ends || {})[k]) && CS_PROPS(e).ends[k].part === s[0]));
      through.forEach(e => del(e.id)); said.push(`the ${csPlural(through.length, 'connector')} through ${csName(P.el(s[0]))} to its port ${csName(x.m)}; Shift + Delete deletes the port from ${csName(x.owner)}`); }
    else if (x) { const lines = CS_ARR(model.edges).filter(e => CS_OBJ(e) && (e.from === x.m.id || e.to === x.m.id || ['from', 'to'].some(k => CS_OBJ((CS_PROPS(e).ends || {})[k]) && CS_PROPS(e).ends[k].part === x.m.id))).length;
      del(x.m.id); said.push(`${x.m.type === 'uml.Port' ? 'port' : x.owner.type === 'uml.Collaboration' ? 'role' : 'part'} ${csName(x.m)} of ${csName(x.owner)}${lines ? ` and its ${csPlural(lines, 'line')}` : ''}${fromModel ? '' : ' (a member is not hidden: it goes from the model)'}`); }
    else if (s) return;
    else if (fromModel) del(id);
    else { const e = CS_ARR(model.edges).find(x => CS_OBJ(x) && x.id === id); // a node or a line selected with them: as the canvas does
      if (e && !Array.isArray(view.edges)) said.push(`not the line ${csName(e)}: this view shows every line between its cards, and Shift + Delete deletes it`);
      else if (e || P.at.has(id)) hide.push({ op: 'hide', id, view: view.id }); } });
  // hidden first: a line hidden after the part it ends at is deleted would be gone with it
  if (!out.length && !hide.length) return { error: `Nothing to delete: ${said[0] || 'no connector'}` };
  return { commands: [...hide, ...out], say: 'Deleted ' + said.join('; ') };
}
// rename: F2 on a port on a part renames its class's port, for every part of that type (said); on a part or a role, its row
// `name : Type [multiplicity]` sets its name, type and multiplicity. Anything else: the default
function csRename(model, view, id, text) {
  const P = csPic(model, view), s = csSplit(id), x = P.mem.get(s ? s[1] : id);
  if (!x || (!s && x.m.type !== 'uml.Property')) return null;
  const r = csRow(x.owner, text, x.m); if (r.error) return r;
  const c = csSets(x.m, r, x.m.type === 'uml.Port' && !String(text).includes(':')); // a name alone keeps a port's type: F2 opens on its name
  return s ? { commands: c, say: `Renamed ${csName(x.owner)}'s port: every part of that type shows it` } : c;
}
// the panel's member rows (edits.member, §12.1): on the subject (or any class or component) a row `port name : Type` is a port
// and `name : Type [multiplicity]` a part; on a collaboration, a role; added, or the member edited. Other members: the panel's
function csMember(model, view, owner, id, text) {
  const P = csPic(model, view), o = P.el(owner); if (!o || !CS_SUBJECTS.includes(o.type)) return null;
  const was = id != null ? CS_ARR(o.members).find(m => CS_OBJ(m) && m.id === id) : null;
  if (id != null && (!was || !['uml.Port', 'uml.Property'].includes(was.type))) return null;
  const r = csRow(o, text, was); if (r.error) return r;
  return was ? csSets(was, r) : [{ op: 'add', element: { id: csFresh(model, `${o.id}.${r.label.toLowerCase()}`), ...r }, owner: o.id }];
}
const CS_MEMBER = {
  print: m => (m.type === 'uml.Port' ? `port ${csPortText(m)}` : m.type === 'uml.Property' ? csPartText(m) : String(m.label ?? '')),
  add: (text, owner) => csRow(owner, text),
  edit: (m, text) => { const r = csRow(null, text, m); return r.error ? r : { commands: csSets(m, r) }; },
  holds: n => CS_SUBJECTS.includes(n.type),
};

const CS_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const CS_TYPE = registerDiagramType('uml.composite-structure', {
  title: 'composite structure diagram',
  elements: [['Property', 'Part'], ['Port', 'Port'], ['Property', 'Role'], ['CollaborationUse', 'Collaboration use'], ['Collaboration', 'Collaboration'], ['Comment', 'Comment']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['Connector', 'Connector'], ['RoleBinding', 'Role binding'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: {
    'uml.Property': [{ key: 'valueType', label: 'Type', kind: 'text' }, { key: 'multiplicity', label: 'Multiplicity', kind: 'text' }, { key: 'aggregation', label: 'Aggregation', kind: 'enum', options: ['composite', 'shared'] }, CS_STEREO],
    'uml.Port': [{ key: 'valueType', label: 'Type', kind: 'text' }, CS_STEREO],
    'uml.CollaborationUse': [{ key: 'collaboration', label: 'Collaboration', kind: 'text' }, CS_STEREO],
    'uml.Class': [CS_STEREO], 'uml.Component': [CS_STEREO], 'uml.Collaboration': [CS_STEREO], 'uml.Connector': [CS_STEREO], 'uml.RoleBinding': [], 'uml.CommentLink': [],
  },
  refs: { 'uml.Connector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } }, // a deleted part takes its connectors (S14)
  layout: Object.assign(csGeo, { rank: false }), // csGeo ranks the parts itself: the host passes only the pins
  member: CS_MEMBER,
  validate: csProblems,
  rules: CS_RULES,
  describe: csDescribe,
  // the PDF's tables (§11): a part's and a collaboration use's kind and rows; null: as before
  word: (model, id) => { const P = csPic(model, {}), q = P.mem.get(id), x = q ? q.m : P.at.get(id); if (!x) return null;
    return x.type === 'uml.Property' ? (q.owner.type === 'uml.Collaboration' ? 'Role' : 'Part') : x.type === 'uml.Port' ? 'Port' : x.type === 'uml.CollaborationUse' ? 'Collaboration use' : null; },
  rows: (model, view, id) => { const P = csPic(model, view), q = P.mem.get(id);
    if (q && q.m.type === 'uml.Property') return [csPartText(q.m), CS_PROPS(q.m).aggregation === 'shared' ? 'shared' : 'composite'];
    const u = P.at.get(id); if (!u) return null;
    // the subject or an open collaboration (0.22.0): its members, a part or role with its aggregation, then the connectors
    // among them, which the Lines table leaves out (their ends are members, not cards)
    if (id === P.sid && P.S || P.collabs.some(c => c.x.id === id)) return [...CS_ARR(u.members).filter(CS_OBJ).map(m => CS_MEMBER.print(m) + (m.type === 'uml.Property' && id === P.sid ? `, ${CS_PROPS(m).aggregation === 'shared' ? 'shared' : 'composite'}` : '')),
      ...P.lines.filter(l => l.e.type === 'uml.Connector' && csStructOf(P, l.e) === u).map(l => csLineName(P, l))];
    if (u.type !== 'uml.CollaborationUse') return null;
    return [...(CS_HAS(CS_PROPS(u).collaboration) ? [String(CS_PROPS(u).collaboration)] : []),
      ...CS_ARR(model.edges).filter(e => CS_OBJ(e) && e.type === 'uml.RoleBinding' && e.to === id).map(e => `${e.label ?? '?'} ← ${csName(P.el(e.from) || { id: e.from })}`)]; },
  edits: { connect: csConnect, moveTo: csMoveTo, add: csAdd, remove: csRemove, rename: csRename, member: csMember },
});

export { CS_TYPE, CS_RULES, csGeo, csProblems, csDescribe, csConnect, csMoveTo, csAdd, csRemove, csRename, csMember, csParse, csRow };
