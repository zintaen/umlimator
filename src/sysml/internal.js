import { registerDiagramType } from '../core/registry.js';
import { esc } from '../core/text.js';
import { r2 } from '../draw/shapes.js';
import { csAdd, csConnect, csGeo, csMember, csMoveTo, csRemove, csRename } from '../uml/composite.js';
import { SYS_AS_UML, SYS_BACK, SYS_CS_PROBLEMS, SYS_DRESS } from './sysml.js';

/* ---------- SysML's internal block diagram, sysml.internal-block (work package M3.4, notes/milestone-3.md §8, §13) ----------
   The view's subject, a block, is drawn as the composite structure type draws a class (src/uml/composite.js), through M3.1's
   projection and dressing (src/sysml/sysml.js): its frame, its part, reference and value properties as boxes, the ports of
   the blocks that type them, connectors through parts. This file adds what is SysML's own: a port's kind and conjugation
   (§8.2, the ~ kept in its name), the arrow a port typed by an interface block shows in its square (its flow properties' way:
   in, out or both; ~ turns it round), an item flow's filled triangle on its connector (§8.3), SysML's names, legend,
   describe(), the PDF's words, rows and line text, the rules (§8.4) and the composite type's editing hooks on the projection,
   what they add mapped back to SysML's types. Only lib/umlimator-all.js holds this file. */

const SYS_IB_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), SYS_IB_ARR = x => (Array.isArray(x) ? x : []);
const SYS_IB_PROPS = x => (SYS_IB_OBJ(x && x.props) ? x.props : {}), SYS_IB_HAS = x => x != null && x !== '';
const SYS_IB_NAME = x => String(x.label ?? x.id);
const SYS_IB_PLURAL = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const SYS_IB_PROP = { 'sysml.PartProperty': 'Part', 'sysml.ReferenceProperty': 'Reference', 'sysml.ValueProperty': 'Value' };
const SYS_IB_FLOWS = ['from-to', 'to-from'];

/* ---- the model read: elements and members by id (the first of an id), the subject, a port's type and its flow ---- */
function SYS_IB_INDEX(model, view) {
  const at = new Map(), mem = new Map();
  SYS_IB_ARR(model && model.nodes).forEach(n => { if (SYS_IB_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  at.forEach(n => SYS_IB_ARR(n.members).forEach(m => { if (SYS_IB_OBJ(m) && typeof m.id === 'string' && !at.has(m.id) && !mem.has(m.id)) mem.set(m.id, { m, owner: n }); }));
  const E = new Map(); SYS_IB_ARR(model && model.edges).forEach(e => { if (SYS_IB_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const S = view && at.has(view.subject) ? at.get(view.subject) : null;
  return { at, mem, E, S, el: id => at.get(id) || (mem.get(id) || {}).m || null };
}
// a port's type: its name, and whether ~ conjugates it (§8.2)
const SYS_IB_TYPE = p => { const t = String(SYS_IB_PROPS(p).valueType ?? '').trim(); return { conj: t.startsWith('~'), name: t.replace(/^~\s*/, '') }; };
const SYS_IB_IFACE = (I, name) => { const c = name ? [...I.at.values()].filter(n => n.type === 'sysml.InterfaceBlock' && n.label === name) : []; return c.length === 1 ? c[0] : null; };
// the way a port's items flow, seen from its owner: in, out or inout (both), from the flow properties of the interface block
// that types it, turned round by ~; null when no interface block with flow properties types it
function SYS_IB_FLOW(I, p) {
  const t = SYS_IB_TYPE(p), B = SYS_IB_IFACE(I, t.name), ds = new Set(B ? SYS_IB_ARR(B.members).filter(m => SYS_IB_OBJ(m) && m.type === 'sysml.FlowProperty').map(m => SYS_IB_PROPS(m).direction) : []);
  if (!ds.size) return null;
  const d = ds.size === 1 && (ds.has('in') || ds.has('out')) ? [...ds][0] : 'inout';
  return t.conj && d !== 'inout' ? (d === 'in' ? 'out' : 'in') : d;
}
const SYS_IB_FLOW_SAY = { in: 'in', out: 'out', inout: 'in and out' };
const SYS_IB_IF = e => { const f = SYS_IB_PROPS(e).itemFlow; return SYS_IB_OBJ(f) && typeof f.item === 'string' && f.item.trim() && SYS_IB_FLOWS.includes(f.direction) ? f : null; };

/* ---- names (§13): the type's words for each part, port and connector; null leaves the composite type's ---- */
const SYS_IB_TEXT = m => { const p = SYS_IB_PROPS(m); return `${m.label ?? m.id}${SYS_IB_HAS(p.valueType) ? ': ' + p.valueType : ''}${SYS_IB_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : ''}`; };
const SYS_IB_PORT_WORD = p => ({ proxy: 'Proxy port', full: 'Full port' })[SYS_IB_PROPS(p).kind] || 'Port';
function SYS_IB_PORT_SAY(I, p, owner) {
  const t = SYS_IB_TYPE(p), f = SYS_IB_FLOW(I, p);
  return `${SYS_IB_PORT_WORD(p)} ${SYS_IB_NAME(p)}${t.name ? ': ' + t.name : ''}${owner ? ' of ' + SYS_IB_NAME(owner) : ''}${t.conj ? ', conjugated' : ''}${f ? ', flow ' + SYS_IB_FLOW_SAY[f] : ''}`;
}
// a connector's end: "power of battery" (a port through a part), "plug of EBike" (the subject's port), or the part's name
function SYS_IB_END(I, e, k) {
  const p = (SYS_IB_PROPS(e).ends || {})[k], part = SYS_IB_OBJ(p) ? p.part : null, x = I.el(e[k]), nm = x ? SYS_IB_NAME(x) : String(e[k]);
  if (part != null) return `${nm} of ${SYS_IB_NAME(I.el(part) || { id: part })}`;
  return I.S && (I.mem.get(e[k]) || {}).owner === I.S ? `${nm} of ${SYS_IB_NAME(I.S)}` : nm;
}
// "Connector from power of battery to supply of controller, carrying DCPower from power to supply"
function SYS_IB_LINE_SAY(I, e) {
  const f = SYS_IB_IF(e), [a, b] = f && f.direction === 'to-from' ? ['to', 'from'] : ['from', 'to'], name = k => { const x = I.el(e[k]); return x ? SYS_IB_NAME(x) : String(e[k]); };
  const say = name(a) === name(b) ? SYS_IB_END : (I2, e2, k) => name(k); // two ends of one name: each with its part
  return `Connector from ${SYS_IB_END(I, e, 'from')} to ${SYS_IB_END(I, e, 'to')}${f ? `, carrying ${f.item} from ${say(I, e, a)} to ${say(I, e, b)}` : SYS_IB_HAS(e.label) ? ': ' + e.label : ''}`;
}
function SYS_IB_SAY(I, g, id) {
  const k = String(id).indexOf('->'), m = I.mem.get(k < 0 ? id : String(id).slice(k + 2));
  if (m && m.m.type === 'sysml.Port') return SYS_IB_PORT_SAY(I, m.m, k < 0 ? m.owner : I.el(String(id).slice(0, k)));
  if (m && I.S && m.owner === I.S && Object.hasOwn(SYS_IB_PROP, m.m.type)) { const ports = SYS_IB_ARR(g.nodes).filter(n => n.owner === id && n.shape === 'port').length;
    return `${SYS_IB_PROP[m.m.type]} ${SYS_IB_TEXT(m.m)}, in ${SYS_IB_NAME(I.S)}${ports ? ', ' + SYS_IB_PLURAL(ports, 'port') : ''}`; }
  const e = I.at.has(id) || m ? null : I.E.get(id);
  return e && e.type === 'sysml.Connector' ? SYS_IB_LINE_SAY(I, e) : null;
}

/* ---- the marks (§8.2, §8.3): a port's arrow in its square, pointing into its owner for in, out of it for out, both ways for
   inout; an item flow's filled 8 px triangle on the middle of its line's longest segment, slid along it to keep 12 px off the
   line's label (another segment, longest first, where that one has no room; its middle as a last resort) ---- */
const SYS_IB_IN = { L: [1, 0], R: [-1, 0], T: [0, 1], B: [0, -1] };
const SYS_IB_TRI = (cx, cy, [dx, dy], len, half) => `M${r2(cx + dx * len / 2)} ${r2(cy + dy * len / 2)}L${r2(cx - dx * len / 2 - dy * half)} ${r2(cy - dy * len / 2 + dx * half)}L${r2(cx - dx * len / 2 + dy * half)} ${r2(cy - dy * len / 2 - dx * half)}Z`;
function SYS_IB_ARROW(n) {
  const v = SYS_IB_IN[n.side]; if (!v || !n.flow) return '';
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, d = n.flow === 'out' ? [-v[0], -v[1]] : v;
  return n.flow === 'inout' ? SYS_IB_TRI(cx + v[0] * 2.5, cy + v[1] * 2.5, v, 4, 3) + SYS_IB_TRI(cx - v[0] * 2.5, cy - v[1] * 2.5, [-v[0], -v[1]], 4, 3) : SYS_IB_TRI(cx, cy, d, 7, 3.5);
}
function SYS_IB_SPOT(e) {
  const pts = SYS_IB_ARR(e.pts), L = e.lbl, segs = pts.slice(1).map((q, k) => [pts[k], q]).filter(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0);
  if (!segs.length) return null;
  const len = ([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]), by = [...segs].sort((a, b) => len(b) - len(a));
  const clear = (x, y) => !L || x + 4 + 12 <= L.x || x - 4 - 12 >= L.x + L.w || y + 4 + 12 <= L.y || y - 4 - 12 >= L.y + L.h;
  for (const s of by) { const n = len(s), u = [(s[1][0] - s[0][0]) / n, (s[1][1] - s[0][1]) / n];
    for (let t = 0; t <= n / 2 - 8; t += 2) for (const o of t ? [n / 2 - t, n / 2 + t] : [n / 2]) { const x = s[0][0] + u[0] * o, y = s[0][1] + u[1] * o; if (clear(x, y)) return { x, y, u }; } }
  const s = by[0], n = len(s); return { x: (s[0][0] + s[1][0]) / 2, y: (s[0][1] + s[1][1]) / 2, u: [(s[1][0] - s[0][0]) / n, (s[1][1] - s[0][1]) / n] };
}
const SYS_IB_DRAW = g => ({ under: '', over: `<g class="ib-marks" aria-hidden="true">${SYS_IB_ARR(g.nodes).map(n => (n.flow ? `<path class="ib-flow" d="${SYS_IB_ARROW(n)}" fill="var(--um-muted)"/>` : '')).join('')}`
  + SYS_IB_ARR(g.edges).map(e => (e.item ? `<path class="ib-item" data-edge="${esc(e.id)}" d="${SYS_IB_TRI(e.item.x, e.item.y, e.item.u, 8, 4)}" fill="var(--um-muted)"/>` : '')).join('') + '</g>' });

/* ---- the legend (§13): connector, item flow, proxy and full port, comment link, as drawn ---- */
const SYS_IB_SW = { line: '<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4"/>', port: '<rect x="8" y="2" width="12" height="12" fill="var(--um-stage-bg)" stroke="var(--um-muted)"/>' };
const SYS_IB_LEGEND = [
  ['Connector', 'a link between parts and ports', g => g.edges.some(e => e.type === 'uml.Connector'), SYS_IB_SW.line],
  ['Item flow', 'what flows along the connector, and which way', g => g.edges.some(e => e.item), SYS_IB_SW.line + `<path d="${SYS_IB_TRI(14, 8, [1, 0], 8, 4)}" fill="var(--um-muted)"/>`],
  ['Proxy port', 'exposes features of its owner, typed by an interface block', (g, I) => g.nodes.some(n => n.shape === 'port' && SYS_IB_PROPS(I.el(n.member)).kind === 'proxy'), SYS_IB_SW.port],
  ['Full port', 'a part of its owner on its border', (g, I) => g.nodes.some(n => n.shape === 'port' && SYS_IB_PROPS(I.el(n.member)).kind === 'full'), SYS_IB_SW.port],
  ['Comment link', 'what a comment is about', g => g.edges.some(e => e.type === 'uml.CommentLink'), '<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4" stroke-dasharray="3 2"/>'],
];

/* ---- the view laid out: the projection laid out by the composite type, dressed (src/sysml/sysml.js), then on a copy: each
   port's member and flow, each item flow's triangle, SysML's legend. A conjugated port's type keeps its ~ in the name the
   layout measures ---- */
function SYS_IB_GEO({ model, view, pos, memo }) {
  const P = SYS_AS_UML(model, view), I = SYS_IB_INDEX(model, view);
  const tilde = m => { const o = SYS_IB_OBJ(m) && m.type === 'uml.Port' ? I.mem.get(m.id) : null; return o && SYS_IB_TYPE(o.m).conj ? { ...m, props: { ...SYS_IB_PROPS(m), valueType: '~' + SYS_IB_TYPE(o.m).name } } : m; };
  const nodes = P.model.nodes.map(n => (SYS_IB_OBJ(n) && SYS_IB_ARR(n.members).some(m => tilde(m) !== m) ? { ...n, members: n.members.map(tilde) } : n));
  const raw = csGeo({ model: { ...P.model, nodes }, view: P.view, pos, memo });
  const d = SYS_DRESS(raw, model, view, id => SYS_IB_SAY(I, raw, id));
  const memberOf = id => { const k = String(id).indexOf('->'); return k < 0 ? id : String(id).slice(k + 2); };
  const out = { ...d, nodes: d.nodes.map(n => { if (n.shape !== 'port') return n; const m = I.el(memberOf(n.id)), f = m ? SYS_IB_FLOW(I, m) : null; return { ...n, member: memberOf(n.id), ...(f ? { flow: f } : {}) }; }),
    edges: d.edges.map(e => { const x = I.E.get(e.id), f = x && x.type === 'sysml.Connector' ? SYS_IB_IF(x) : null, s = f && SYS_IB_SPOT(e);
      return s ? { ...e, item: { ...s, u: f.direction === 'to-from' ? [-s.u[0], -s.u[1]] : s.u } } : e; }) };
  const now = new Map(out.nodes.map(n => [n.id, n])); out.byId = Object.fromEntries(Object.entries(d.byId).map(([k, n]) => [k, now.get(k) || n]));
  out.legend = SYS_IB_LEGEND.filter(([, , on]) => on(out, I)).map(([w, says, , sw]) => `<span class="lgi" title="${esc(w + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${sw}</svg><b>${esc(w)}</b><span>${esc(says)}</span></span>`);
  return out;
}

/* ---- validators (§8.4). Each problem: { level, rule, path, message, ids } ---- */
const SYS_IB_RULES = {
  'subject-block': 'the view\'s subject is a block it lists in nodeIds (a view with none: a warning)',
  'connector-part': 'an end\'s part is a part of the subject, and the end is a port of that part\'s type',
  'connector-scope': 'a connector joins the subject\'s ports and parts',
  'connector-drawn': 'a connector between two ports of the subject is not drawn: the frame has no line to itself',
  'part-type': 'a part or reference property\'s type names exactly one block of the model by label',
  'item-flow': 'an item flow\'s item is text and its direction from-to or to-from',
  'port-compatible': 'two parts\' proxy ports of one interface block are joined conjugate (one ~); a delegation joins ports of one type, conjugated alike, flowing the same way',
};
function SYS_IB_PROBLEMS(model, view) {
  if (!view) return [];
  const out = [], I = SYS_IB_INDEX(model, view), S = I.S, vi = SYS_IB_ARR(model.views).indexOf(view), q = id => JSON.stringify(I.el(id) ? SYS_IB_NAME(I.el(id)) : String(id));
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  if (view.subject == null) say('warning', 'subject-block', `views[${vi}]`, [view.id], `view ${JSON.stringify(view.id)} has no subject (deleted, or hidden from it): it draws no frame until one is set`);
  else if (!S || S.type !== 'sysml.Block' || !SYS_IB_ARR(view.nodeIds).includes(S.id)) say('error', 'subject-block', `views[${vi}].subject`, [view.id, view.subject], `view ${JSON.stringify(view.id)}'s subject ${JSON.stringify(view.subject)} is not a block it lists in nodeIds`);
  out.push(...SYS_CS_PROBLEMS(model, view));
  if (!S) return out;
  const part = (e, k) => { const p = (SYS_IB_PROPS(e).ends || {})[k]; return SYS_IB_OBJ(p) && p.part != null ? p.part : null; };
  const inS = id => id != null && (I.mem.get(id) || {}).owner === S;
  SYS_IB_ARR(model.edges).forEach((e, i) => { if (!SYS_IB_OBJ(e) || e.type !== 'sysml.Connector' || !['from', 'to'].some(k => inS(part(e, k)) || inS(e[k]))) return;
    const path = `edges[${i}]`, f = SYS_IB_PROPS(e).itemFlow;
    if (f !== undefined && !SYS_IB_IF(e)) say('warning', 'item-flow', path + '.props.itemFlow', [e.id], `${e.id}'s item flow ${JSON.stringify(f)} is not { item, direction }: its item is text and its direction from-to or to-from`);
    const ends = ['from', 'to'].map(k => ({ k, part: part(e, k), m: (I.mem.get(e[k]) || {}).m })).filter(x => x.m && x.m.type === 'sysml.Port');
    if (ends.length < 2) return;
    const [a, b] = ends, [ta, tb] = [a, b].map(x => SYS_IB_TYPE(x.m)), raw = x => String(SYS_IB_PROPS(x.m).valueType).trim();
    if (a.part != null && b.part != null) { // assembly: two parts' proxy ports of one interface block meet conjugate, or flowing opposite ways
      if (![a, b].every(x => SYS_IB_PROPS(x.m).kind === 'proxy') || !ta.name || ta.name !== tb.name || !SYS_IB_IFACE(I, ta.name)) return;
      const fa = SYS_IB_FLOW(I, a.m), fb = SYS_IB_FLOW(I, b.m);
      if (ta.conj === tb.conj && !(fa && fb && [fa, fb].sort().join() === 'in,out'))
        say('warning', 'port-compatible', path, [e.id, a.m.id, b.m.id], `${e.id} joins ${q(a.m.id)} of ${q(a.part)} and ${q(b.m.id)} of ${q(b.part)}, proxy ports typed ${ta.name} ${ta.conj ? 'both conjugated' : 'neither conjugated'}: one end is conjugated (~), so what flows out of one flows into the other`);
    } else if ((a.part == null) !== (b.part == null)) { // delegation: the frame's port to a part's port
      const [fr, pt] = a.part == null ? [a, b] : [b, a];
      if (!inS(fr.m.id) || !ta.name || !tb.name) return;
      if (ta.name !== tb.name || ta.conj !== tb.conj) say('warning', 'port-compatible', path, [e.id, fr.m.id, pt.m.id],
        `${e.id} delegates ${q(fr.m.id)} of ${q(S.id)} (${raw(fr)}) to ${q(pt.m.id)} of ${q(pt.part)} (${raw(pt)}): a delegation joins ports of one type, conjugated alike, so both flow the same way`);
    } });
  return out;
}

/* ---- describe(): the frame, then what it holds in reading order, then the connectors, each by its name ---- */
function SYS_IB_DESCRIBE(model, viewId) {
  const v = SYS_IB_ARR(model && model.views).find(x => SYS_IB_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const g = SYS_IB_GEO({ model, view: v, pos: SYS_IB_OBJ(v.layout) ? v.layout : {}, memo: {} }), lines = new Set(g.edges.map(e => e.id));
  const said = new Map([...SYS_IB_ARR(g.families), ...g.nodes, ...g.edges].map(x => [x.id, x.aria])), ids = SYS_IB_ARR(g.order).filter(id => said.has(id));
  return [`${v.title || v.id}: an internal block diagram of ${SYS_IB_PLURAL(ids.filter(id => !lines.has(id)).length, 'element')} and ${SYS_IB_PLURAL(ids.filter(id => lines.has(id)).length, 'line')}.`,
    ...ids.map(id => said.get(id) + '.')].join('\n');
}

/* ---- editing (§8.5): the composite type's hooks on the projection, what they return mapped back (SYS_BACK); a palette entry
   or a line of SysML's type asked as its projected one, and the kind it names kept; a name set to what it is already
   dropped (the projection's names carry «proxy»). A member row may start with proxy or full (a port's kind) or ref (a
   reference) ---- */
const SYS_IB_AS = { 'sysml.PartProperty': 'uml.Property', 'sysml.ReferenceProperty': 'uml.Property', 'sysml.ValueProperty': 'uml.Property', 'sysml.Port': 'uml.Port', 'sysml.Connector': 'uml.Connector' };
const SYS_IB_ENTRY = x => (SYS_IB_OBJ(x) && Object.hasOwn(SYS_IB_AS, x.type) ? { ...x, type: SYS_IB_AS[x.type] } : x);
const SYS_IB_MAP = (r, f) => (Array.isArray(r) ? f(r) : !SYS_IB_OBJ(r) ? r : Array.isArray(r.commands) ? { ...r, commands: f(r.commands) } : typeof r.then === 'function' ? { ...r, then: i => SYS_IB_MAP(r.then(i), f) } : r);
const SYS_IB_ON = hook => (model, view, ...a) => { const P = SYS_AS_UML(model, view), I = SYS_IB_INDEX(model, view);
  return SYS_IB_MAP(SYS_BACK(hook(P.model, P.view, ...a), model, view), cs => cs.filter(c => !(SYS_IB_OBJ(c) && c.op === 'set' && c.path === 'label' && I.el(c.id) && I.el(c.id).label === c.value))); };
const SYS_IB_KIND = (r, f) => SYS_IB_MAP(r, cs => cs.map(c => (SYS_IB_OBJ(c) && c.op === 'add' && SYS_IB_OBJ(c.element) ? { ...c, element: f(c.element) } : c)));
function SYS_IB_ADD(model, view, entry, label, at) {
  const r = SYS_IB_ON(csAdd)(model, view, SYS_IB_ENTRY(entry), label, at), t = SYS_IB_OBJ(entry) ? entry.type : null;
  return Object.hasOwn(SYS_IB_PROP, t) ? SYS_IB_KIND(r, x => (Object.hasOwn(SYS_IB_PROP, x.type) ? { ...x, type: t } : x)) : r;
}
function SYS_IB_MEMBER(model, view, owner, id, text) {
  const k = /^(proxy|full)\s+(?=port\s)/i.exec(String(text)), ref = id == null && /^ref\s+/i.test(String(text)), t = String(text).replace(/^(proxy|full)\s+(?=port\s)/i, '').replace(/^ref\s+/i, '');
  const r = SYS_IB_ON(csMember)(model, view, owner, id, t), kind = k ? k[1].toLowerCase() : undefined;
  if (id == null) return SYS_IB_KIND(r, x => (x.type === 'sysml.Port' && kind ? { ...x, props: { ...SYS_IB_PROPS(x), kind } } : ref && Object.hasOwn(SYS_IB_PROP, x.type) ? { ...x, type: 'sysml.ReferenceProperty' } : x));
  const was = SYS_IB_INDEX(model, view).el(id);
  return was && was.type === 'sysml.Port' && SYS_IB_PROPS(was).kind !== kind ? SYS_IB_MAP(r, cs => [...cs, { op: 'set', id, path: 'props.kind', value: kind }]) : r;
}
const SYS_IB_MEMBERS = {
  print: m => { const p = SYS_IB_PROPS(m);
    if (m.type === 'sysml.Port') return `${SYS_IB_HAS(p.kind) ? p.kind + ' ' : ''}port ${m.label ?? ''}${SYS_IB_HAS(p.valueType) ? ' : ' + p.valueType : ''}`;
    return Object.hasOwn(SYS_IB_PROP, m.type) ? `${m.type === 'sysml.ReferenceProperty' ? 'ref ' : ''}${m.label ?? ''}${SYS_IB_HAS(p.valueType) ? ' : ' + p.valueType : ''}${SYS_IB_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : ''}` : String(m.label ?? ''); },
  // what edits.member does not read (an operation's or a flow property's row) is the block definition view's
  add: () => ({ error: 'A member here is a part, a reference (ref), a value or a port (proxy port, full port)' }),
  edit: () => ({ error: 'This view edits parts, references, values and ports: the block definition view edits the rest' }),
  holds: n => n.type === 'sysml.Block',
};

/* ---- the PDF (§13): a word for each element, its rows, a connector's item flow ---- */
function SYS_IB_WORDS(model, id) {
  const I = SYS_IB_INDEX(model, null), x = I.el(id); if (!x) return null;
  return SYS_IB_PROP[x.type] || (x.type === 'sysml.Port' ? SYS_IB_PORT_WORD(x) : x.type === 'sysml.Block' ? 'Block' : x.type === 'sysml.InterfaceBlock' ? 'Interface block' : null);
}
function SYS_IB_ROWS(model, view, id) {
  const I = SYS_IB_INDEX(model, view), x = I.el(id); if (!x) return null;
  if (Object.hasOwn(SYS_IB_PROP, x.type)) return [SYS_IB_TEXT(x)];
  if (x.type === 'sysml.Port') { const t = SYS_IB_TYPE(x), f = SYS_IB_FLOW(I, x); return [...(t.name ? [t.name + (t.conj ? ', conjugated' : '')] : []), ...(f ? ['flow ' + SYS_IB_FLOW_SAY[f]] : [])]; }
  if (x !== I.S) return null;
  // the subject: its parts, references, values and ports, then its connectors (their ends are members, which the Lines table leaves out)
  const inS = id2 => id2 != null && (I.mem.get(id2) || {}).owner === x, part = (e, k) => { const p = (SYS_IB_PROPS(e).ends || {})[k]; return SYS_IB_OBJ(p) ? p.part : null; };
  return [...SYS_IB_ARR(x.members).filter(m => SYS_IB_OBJ(m) && (Object.hasOwn(SYS_IB_PROP, m.type) || m.type === 'sysml.Port')).map(m => SYS_IB_MEMBERS.print(m)),
    ...SYS_IB_ARR(model.edges).filter(e => SYS_IB_OBJ(e) && e.type === 'sysml.Connector' && ['from', 'to'].some(k => inS(part(e, k)) || inS(e[k]))).map(e => SYS_IB_LINE_SAY(I, e))];
}
// "DCPower, battery to dock": the item, then the parts (or ports) it flows from and to
function SYS_IB_LINE_TEXT(model, view, id) {
  const I = SYS_IB_INDEX(model, view), e = SYS_IB_ARR(model && model.edges).find(x => SYS_IB_OBJ(x) && x.id === id), f = e && e.type === 'sysml.Connector' ? SYS_IB_IF(e) : null; if (!f) return null;
  const at = k => { const p = (SYS_IB_PROPS(e).ends || {})[k], x = I.el(SYS_IB_OBJ(p) && p.part != null ? p.part : e[k]); return x ? SYS_IB_NAME(x) : String(e[k]); }, [a, b] = f.direction === 'to-from' ? ['to', 'from'] : ['from', 'to'];
  return `${f.item}, ${at(a)} to ${at(b)}`;
}

const SYS_IB_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const SYS_IB_PART = [{ key: 'valueType', label: 'Type', kind: 'text' }, { key: 'multiplicity', label: 'Multiplicity', kind: 'text' }, SYS_IB_STEREO];
const SYS_IB_TYPE_DEF = registerDiagramType('sysml.internal-block', {
  title: 'internal block diagram',
  elements: [['sysml.PartProperty', 'Part'], ['sysml.ReferenceProperty', 'Reference'], ['sysml.ValueProperty', 'Value'], ['sysml.Port', 'Port'], ['uml.Comment', 'Comment']].map(([type, label]) => ({ type, label })),
  lines: [['sysml.Connector', 'Connector'], ['uml.CommentLink', 'Comment link']].map(([type, label]) => ({ type, label })),
  props: {
    'sysml.PartProperty': SYS_IB_PART, 'sysml.ReferenceProperty': SYS_IB_PART, 'sysml.ValueProperty': SYS_IB_PART,
    'sysml.Port': [{ key: 'valueType', label: 'Type', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'enum', options: ['proxy', 'full'] }, SYS_IB_STEREO],
    'sysml.Connector': [{ key: 'itemFlow.item', path: ['itemFlow', 'item'], label: 'Item flow', kind: 'text' }, { key: 'itemFlow.direction', path: ['itemFlow', 'direction'], label: 'Item flow direction', kind: 'enum', options: SYS_IB_FLOWS }, SYS_IB_STEREO],
    'sysml.Block': [SYS_IB_STEREO], 'uml.Comment': [SYS_IB_STEREO], 'uml.CommentLink': [],
  },
  refs: { 'sysml.Connector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } }, // a deleted part takes its connectors
  layout: Object.assign(SYS_IB_GEO, { rank: false }), // the composite type ranks the parts itself: the host passes the pins alone
  draw: SYS_IB_DRAW,
  member: SYS_IB_MEMBERS,
  validate: SYS_IB_PROBLEMS,
  rules: SYS_IB_RULES,
  describe: SYS_IB_DESCRIBE,
  word: SYS_IB_WORDS,
  rows: SYS_IB_ROWS,
  text: SYS_IB_LINE_TEXT,
  edits: { connect: (model, view, from, to, at, line) => SYS_IB_ON(csConnect)(model, view, from, to, at, SYS_IB_ENTRY(line)), moveTo: SYS_IB_ON(csMoveTo), add: SYS_IB_ADD,
    remove: SYS_IB_ON(csRemove), rename: SYS_IB_ON(csRename), member: SYS_IB_MEMBER },
});

export { SYS_IB_TYPE_DEF, SYS_IB_GEO, SYS_IB_PROBLEMS, SYS_IB_FLOW, SYS_IB_SPOT };
