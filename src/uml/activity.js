import { apply } from '../core/apply.js';
import { registerDiagramType } from '../core/registry.js';
import { esc, fit } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { labelW } from '../layout/layered.js';
import { laneBands, laneRows } from '../layout/lanes.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.note, a comment's
import { frame } from './frame.js';
import { FLOW_RULES, flowProblems, flowText, parseFlow } from './flow.js';

/* ---------- the activity diagram, uml.activity (work package 4.5, notes/stage-4.md §9) ----------
   Control nodes, actions and flows from src/uml/flow.js; the send and accept signals, the object node, the data store and
   the call behaviour action's rake here, each a look over flow.js's rounded box. Partitions are lanes (§5): each node's row
   is moved into its lane's run of rows (laneRows) before layoutTyped, and the bands are found after it (laneBands). A
   partition is left out of the layout and added back to a new geometry as a node on its band's header strip, so it is
   selected, renamed and deleted as a node; the bands are kept in geo.bands and drawn in the type's `under` layer. The
   header room laneBands asks for is made by moving the bands and the bounds back by its shift, not the nodes forward, so
   nothing layoutTyped returned is copied or changed (§2.4). Flows are "name [guard]" (§7.3), cut at 280 px, with an
   open arrowhead; laid out with repair: false and reroute: false (§17, §20 #13) and a row gap of 64 px (§5.2). Ships in
   lib/umlimator-all.js only. */

const AC_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), AC_ARR = x => (Array.isArray(x) ? x : []);
const AC_HAS = x => x != null && String(x).trim() !== '', AC_PART = x => (AC_HAS(x) ? String(x).trim() : undefined);
const AC = { rgap: 64, gap: 64, cut: 280, sig: 14, rake: 10, line: 'var(--um-muted)' };
const AC_FLOWS = ['uml.ControlFlow', 'uml.ObjectFlow'], AC_LINES = [...AC_FLOWS, 'uml.CommentLink'];
const AC_OBJECTS = ['uml.ObjectNode', 'uml.DataStoreNode'];
// each node type: its shape and its word (accessible names, the PDF)
const AC_LOOK = {
  'uml.InitialNode': ['initial', 'Initial node'], 'uml.ActivityFinalNode': ['final', 'Activity final'], 'uml.FlowFinalNode': ['flow-final', 'Flow final'],
  'uml.Action': ['rounded', 'Action'], 'uml.CallBehaviorAction': ['call', 'Call behaviour action'], 'uml.SendSignalAction': ['send', 'Send signal action'],
  'uml.AcceptEventAction': ['accept', 'Accept event action'], 'uml.DecisionNode': ['diamond', 'Decision'], 'uml.MergeNode': ['diamond', 'Merge'],
  'uml.ForkNode': ['bar', 'Fork'], 'uml.JoinNode': ['bar', 'Join'], 'uml.ObjectNode': ['object', 'Object node'], 'uml.DataStoreNode': ['object', 'Data store'],
  'uml.ActivityPartition': ['partition', 'Partition'], 'uml.Comment': ['note', 'Comment'],
};
const AC_NODES = Object.keys(AC_LOOK).filter(t => t !== 'uml.ActivityPartition' && t !== 'uml.Comment'); // what a flow may end on
const acLook = x => (Object.hasOwn(AC_LOOK, x.type) ? AC_LOOK[x.type] : ['rounded', String(x.type || 'Node').split('.').pop()]);

/* ---- the activity's own shapes, each a look over SHAPE.rounded (flow.js): its text drawn in `body` (part of the node's
   box), its outline replaced by `path`, and `extra` drawn over it ---- */
const acOver = (shape, n, body, path, extra = '') => { const m = { ...n, ...body }, s = SHAPE.rounded.draw(m);
  return s.split(SHAPE.rounded.out(m)).join(path).replace('class="node rounded"', `class="node ${shape}"`).replace('data-shape="rounded"', `data-shape="${shape}"`).replace(/<\/g>$/, extra + '</g>'); };
const acGrow = (n, d) => ({ x: n.x - d, y: n.y - d, w: n.w + 2 * d, h: n.h + 2 * d });
// send: a convex pentagon, its point on the right; accept: a concave one, its notch on the left (UML 2.5.1 §16.3.4)
const sigOut = concave => (n, d = 0) => { const { x, y, w, h } = acGrow(n, d), cy = y + h / 2, k = AC.sig;
  return concave ? `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}L${r2(x + k)} ${r2(cy)}Z` : `M${r2(x)} ${r2(y)}H${r2(x + w - k)}L${r2(x + w)} ${r2(cy)}L${r2(x + w - k)} ${r2(y + h)}H${r2(x)}Z`; };
const sigIn = concave => (n, s, t) => { const k = AC.sig, b = n.h / 2, u = Math.min(1, Math.abs(t - n.y - b) / b);
  if (concave) return s === 'L' ? k * (1 - u) : 0;
  return s === 'R' ? k * u : (s === 'T' || s === 'B') && t > n.x + n.w - k ? b * Math.min(1, (t - n.x - n.w + k) / k) : 0; };
const signal = concave => ({ size: n => { const s = SHAPE.rounded.size(n); return { w: s.w + AC.sig, h: s.h }; }, out: sigOut(concave), inset: sigIn(concave),
  draw: n => acOver(concave ? 'accept' : 'send', n, concave ? { x: n.x + AC.sig, w: n.w - AC.sig } : { w: n.w - AC.sig }, sigOut(concave)(n)) });
SHAPE.send = signal(false); SHAPE.accept = signal(true);
// an object node: a rectangle, its name (a data store's «datastore» over it)
SHAPE.object = { size: n => SHAPE.rounded.size(n), out: boxOut(0), inset: () => 0, draw: n => acOver('object', n, {}, boxOut(0)(n)) };
// a call behaviour action: the rounded box, its name above UML's rake at its bottom right
SHAPE.call = { size: n => { const s = SHAPE.rounded.size(n); return { w: s.w, h: s.h + AC.rake }; }, out: SHAPE.rounded.out, inset: SHAPE.rounded.inset,
  draw(n) { const x = n.x + n.w - 14, y = n.y + n.h - 5;
    return acOver('call', n, { h: n.h - AC.rake }, SHAPE.rounded.out(n), `<path d="M${r2(x)} ${r2(y - 10)}V${r2(y)}M${r2(x - 5)} ${r2(y)}V${r2(y - 5)}H${r2(x + 5)}V${r2(y)}" class="n-det ac-rake" fill="none" stroke="${AC.line}" stroke-width="1.3"/>`); } };
for (const k of ['send', 'accept', 'object', 'call']) { const S = SHAPE[k]; S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }
// a partition: its name on its band's header strip (n: the strip), over a transparent area 24 px across to hit
SHAPE.partition = {
  draw(n) { const flat = n.w >= n.h, t = fit(String(n.label ?? ''), 11, (flat ? n.w : n.h) - 12), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const hit = flat ? [n.x, n.y - 1, n.w, n.h + 2] : [n.x - 1, n.y, n.w + 2, n.h];
    return `<g class="node partition" data-id="${esc(n.id)}" data-shape="partition" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Partition ' + (n.label ?? ''))}">`
      + `<rect x="${r2(hit[0])}" y="${r2(hit[1])}" width="${r2(hit[2])}" height="${r2(hit[3])}" class="fl-hit" fill="transparent"/>`
      + `<text x="${r2(cx)}" y="${r2(cy + 4)}" text-anchor="middle" class="c-name" fill="var(--um-text)" style="font:600 11px var(--um-sans)"${flat ? '' : ` transform="rotate(-90 ${r2(cx)} ${r2(cy)})"`}>${esc(t)}</text></g>`; },
};

/* ---- the view read: its nodes, its partitions and the lane each node is drawn in, its lines ---- */
function actIndex(model, view) {
  const N = new Map(), E = new Map(), path = new Map();
  AC_ARR(model && model.nodes).forEach((n, k) => { if (AC_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) { N.set(n.id, n); path.set(n.id, `nodes[${k}]`); } });
  AC_ARR(model && model.edges).forEach((e, k) => { if (AC_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) { E.set(e.id, e); path.set(e.id, `edges[${k}]`); } });
  const ids = [...new Set(AC_ARR(view && view.nodeIds).filter(id => N.has(id)))], shown = new Set(ids);
  const isPart = id => N.has(id) && N.get(id).type === 'uml.ActivityPartition', parts = ids.filter(isPart), lanes = new Set(parts);
  // the nearest shown partition above an element (§9.2), or null; a cycle of owners stops where it closes
  const once = f => { const c = new Map(); return id => (c.has(id) ? c.get(id) : c.set(id, f(id)).get(id)); }; // each worked out once: partitions nested to any depth
  const up = once(id => { const seen = new Set([id]); for (let p = (N.get(id) || {}).parent; p != null && N.has(p) && !seen.has(p); p = N.get(p).parent) { if (lanes.has(p)) return p; seen.add(p); } return null; });
  // a lane's own owner lane, or null at the top: a lane whose chain of shown owners comes back to it is at the top (laneRows')
  const outer = once(id => { const seen = new Set(); for (let l = up(id); l != null && !seen.has(l); l = up(l)) { if (l === id) return null; seen.add(l); } return up(id); });
  const laneOf = id => (lanes.has(id) ? null : up(id)), drawn = ids.filter(id => !lanes.has(id)), on = new Set(drawn);
  const list = Array.isArray(view && view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => AC_LINES.includes(e.type));
  const lines = list.filter(e => AC_OBJ(e) && typeof e.id === 'string' && on.has(e.from) && on.has(e.to));
  const n = new Map(), under = p => n.get(p) || 0; // the nodes under each lane, at any depth, counted in one pass
  drawn.forEach(id => { for (let l = laneOf(id); l != null; l = outer(l)) n.set(l, under(l) + 1); });
  return { N, E, path, ids, shown, parts, drawn, lines, up, laneOf, isPart, under,
    lanes: parts.map((id, order) => ({ id, parent: outer(id), order })) };
}
const acName = x => String(x.label ?? x.id);
const acProps = x => (AC_OBJ(x && x.props) ? x.props : {});
const acStereo = x => AC_ARR(acProps(x).stereotypes).filter(AC_HAS).map(String);
const acPlural = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`;
// a node as a line's end names it: its label, else its word ("merge")
const acCalled = x => (x ? (AC_HAS(x.label) ? String(x.label) : acLook(x)[1].toLowerCase()) : '?');
const acViewName = (model, id) => { const v = AC_ARR(model && model.views).find(w => AC_OBJ(w) && w.id === id); return v ? String(v.title ?? v.id) : null; };

// accessible names (§14): "Action Take the next order from the queue, in Order worker"; "Decision All books in stock?, 2 exits"
function acNodeName(model, I, x, lines) {
  const [, word] = acLook(x), st = acStereo(x), lane = I.laneOf(x.id), outs = lines.filter(e => e.from === x.id && AC_FLOWS.includes(e.type)).length, ins = lines.filter(e => e.to === x.id && AC_FLOWS.includes(e.type)).length;
  if (x.type === 'uml.Comment') return 'Comment: ' + acName(x);
  if (x.type === 'uml.ActivityPartition') return `Partition ${acName(x)}${st.length ? ` (${st.join(', ')})` : ''}, ${acPlural(I.under(x.id), 'node')}`;
  const named = !['initial', 'final', 'flow-final', 'bar'].includes(acLook(x)[0]) && AC_HAS(x.label) ? ' ' + String(x.label).trim() : '';
  const count = { 'uml.DecisionNode': acPlural(outs, 'exit'), 'uml.MergeNode': acPlural(ins, 'entry', 'entries'), 'uml.ForkNode': acPlural(outs, 'branch', 'branches'), 'uml.JoinNode': acPlural(ins, 'branch', 'branches') }[x.type];
  const opens = x.type === 'uml.CallBehaviorAction' ? `opens ${acViewName(model, x.opensView) ?? 'no view'}` : null;
  return [`${word}${named}${st.length ? ` (${st.join(', ')})` : ''}`, count, opens, lane != null ? `in ${acName(I.N.get(lane))}` : null].filter(Boolean).join(', ');
}
const AC_LINE_WORDS = { 'uml.ControlFlow': ['Control flow', 'the next step, once the one before ends'], 'uml.ObjectFlow': ['Object flow', 'an object or data passed on'], 'uml.CommentLink': ['Comment link', 'what a comment is about'] };
function acLineName(I, e) {
  const [word] = Object.hasOwn(AC_LINE_WORDS, e.type) ? AC_LINE_WORDS[e.type] : ['Line'], g = AC_PART(acProps(e).guard), nm = AC_PART(e.label);
  return `${word} from ${acCalled(I.N.get(e.from))} to ${acCalled(I.N.get(e.to))}${nm ? `, named ${nm}` : ''}${g ? `, guard ${g}` : ''}`;
}

/* ---- the legend: each line kind and each control glyph the view draws (1.9's legendItem form) ---- */
const acKey = (svg, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none">${svg}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const AC_ARROW = '<path d="M2 8H25"/><path d="M17 3L26 8L17 13"/>';
const AC_KEYS = [
  ['uml.ControlFlow', AC_ARROW], ['uml.ObjectFlow', AC_ARROW], ['uml.CommentLink', '<path d="M2 8H26" stroke-dasharray="3 2"/>'],
  ['uml.InitialNode', '<circle cx="14" cy="8" r="5" fill="var(--um-text)" stroke="var(--um-text)"/>', 'Initial node', 'where the activity starts'],
  ['uml.ActivityFinalNode', '<circle cx="14" cy="8" r="6"/><circle cx="14" cy="8" r="3" fill="var(--um-text)" stroke="none"/>', 'Activity final', 'ends the whole activity'],
  ['uml.FlowFinalNode', '<circle cx="14" cy="8" r="6"/><path d="M10 4L18 12M18 4L10 12"/>', 'Flow final', 'ends its own branch only'],
  ['uml.ForkNode', '<path d="M14 2V14" stroke="var(--um-text)" stroke-width="4"/>', 'Fork', 'splits the flow into branches that run at once'],
  ['uml.JoinNode', '<path d="M14 2V14" stroke="var(--um-text)" stroke-width="4"/>', 'Join', 'waits for every branch, then goes on'],
  ['uml.DecisionNode', '<path d="M14 2L21 8L14 14L7 8Z"/>', 'Decision', 'takes the one exit whose guard holds'],
  ['uml.MergeNode', '<path d="M14 2L21 8L14 14L7 8Z"/>', 'Merge', 'goes on with whichever flow arrives'],
];
const acLegend = types => AC_KEYS.filter(([t]) => types.has(t)).map(([t, svg, name, says]) => (AC_LINE_WORDS[t] ? acKey(svg, ...AC_LINE_WORDS[t]) : acKey(svg, name, says)));

/* ---- the view laid out: { model, view, pos, memo } (§9.1, §5) ---- */
function actGeo({ model, view, pos, memo }) {
  const I = actIndex(model, view), down = view.direction === 'down';
  const at = id => (Object.hasOwn(pos || {}, id) && Array.isArray(pos[id]) ? pos[id] : [0, 0]);
  const P = I.lanes.length ? laneRows(Object.fromEntries(I.drawn.map(id => [id, at(id)])), I.laneOf, I.lanes) : null; // each lane a run of rows
  const bar = id => acLook(I.N.get(id))[0] === 'bar', side = (id, w) => I.lines.filter(e => e[w] === id).length;
  const nodes = I.drawn.map(id => { const x = I.N.get(id), [shape] = acLook(x), [col, row] = P ? P[id] : at(id), st = acStereo(x);
    const d = { id, label: ['initial', 'final', 'flow-final', 'bar'].includes(shape) ? '' : acName(x), type: x.type, kind: 'file', shape, aria: acNodeName(model, I, x, I.lines), col, row,
      stereotypes: x.type === 'uml.DataStoreNode' ? ['datastore', ...st] : st, ...(shape === 'bar' ? { busy: Math.max(side(id, 'from'), side(id, 'to')), down } : {}) };
    return { ...d, ...SHAPE[shape].size(d) }; });
  // a bar's lines enter on the side facing the flow's start and leave on the other (§4.1): left and right in the layout's
  // own axes, which a view laid out down turns to top and bottom
  const edges = I.lines.map(e => { const note = e.type === 'uml.CommentLink', label = note ? '' : flowText(e.label, acProps(e).guard);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, ...(label ? { label, cut: AC.cut } : {}), end: note ? { from: 'none', to: 'none', dashed: true } : { from: 'none', to: 'open' },
      aria: acLineName(I, e), ...(bar(e.from) ? { fromSide: 'right' } : {}), ...(bar(e.to) ? { toSide: 'left' } : {}), ...(AC_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  // a typed view's router makes no room for a label (labelRoom is a map's): with guards to draw, the columns are spread by the
  // widest label and 40 px for its stubs laid out right, as the class type does, and by 48 px laid out down, where a label
  // lies across its line. ponytail: one gap for every column; a gap per column needs labelRoom for typed views (the core's)
  const wide = edges.some(e => e.label) ? (down ? 48 : Math.ceil(Math.max(...edges.filter(e => e.label).map(labelW))) + 40) : 0;
  const g = layoutTyped({ nodes, edges, direction: down ? 'down' : 'right', gap: AC.gap + wide, rgap: AC.rgap, repair: false, reroute: false }, memo);
  return acFinish(model, g, I, down);
}

/* The laid-out graph as it is drawn, a new object (layoutTyped's memo keeps the one it returned, §2.4): the bands, the
   partitions on their headers, geo.order, the slots and the legend */
function acFinish(model, g, I, down) {
  let bands = [], bounds = g.bounds;
  if (I.lanes.length) { const L = laneBands(g, I.lanes, I.laneOf, down, AC.rgap), back = b => ({ ...b, x: r2(b.x - L.shift.x), y: r2(b.y - L.shift.y) });
    bands = L.bands.map(b => ({ ...back(b), head: back(b.head) })); bounds = back(L.bounds); }
  // a header is aside, off the columns, at the first node's column and row: the canvas reads a drop's column and row from the
  // nodes when every one has them (render.js gridView, hintAt)
  const byId = { ...g.byId }, { col = 0, row = 0 } = g.nodes[0] || {};
  const heads = bands.map(b => { const x = I.N.get(b.id); // k: the 'file' kind's, as layoutTyped gives the nodes, so a view of partitions only draws
    return (byId[b.id] = { id: b.id, label: acName(x), type: x.type, kind: 'file', k: 'file', shape: 'partition', aside: true, col, row, aria: acNodeName(model, I, x, I.lines), ...b.head }); });
  // reading order (§14): a partition, then its nested partitions, then its own nodes by rank; then the nodes in no lane by
  // rank; then the lines. The nodes are drawn in it, then the headers, so the canvas's first node is a laid-out one
  const rank = (a, b) => byId[a].col - byId[b].col || byId[a].row - byId[b].row, order = [];
  const kids = new Map(), own = new Map(), at = (m, k) => m.get(k) || m.set(k, []).get(k);
  I.lanes.forEach(l => at(kids, l.parent).push(l.id)); I.drawn.forEach(id => at(own, I.laneOf(id)).push(id));
  const st = [...at(kids, null)].reverse(); // a stack, not recursion: [p] stands for p's own nodes, after its nested lanes
  while (st.length) { const p = st.pop(); if (Array.isArray(p)) order.push(...at(own, p[0]).sort(rank)); else { order.push(p); st.push([p], ...[...at(kids, p)].reverse()); } }
  order.push(...at(own, null).sort(rank));
  const mid = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const types = new Set([...g.edges.map(e => e.type), ...I.drawn.map(id => I.N.get(id).type)]);
  return { ...g, nodes: [...order.filter(id => !I.isPart(id)), ...I.parts].map(id => byId[id]), byId, bounds, bands, partitions: heads.map(h => h.id), order: [...order, ...g.edges.map(e => e.id)],
    // the slots (src/typed/edit.js): one per node and one per partition's header, so the palette's add hears what is selected
    slots: [...I.drawn.map(id => ({ after: id, parent: I.laneOf(id), ...mid(byId[id]) })), ...heads.map(h => ({ after: h.id, parent: h.id, ...mid(h) }))], legend: acLegend(types) };
}

/* the bands (§5.3), under the lines: each band's outline and the line closing its header strip */
function actDraw(g) {
  const bs = AC_ARR(g.bands);
  if (!bs.length) return { under: '', over: '' };
  return { under: '<g class="ac-lanes">' + bs.map(b => { const h = b.head, flat = h.w >= h.h;
    return frame(b.x, b.y, b.w, b.h) + `<path class="ac-head" d="${flat ? `M${r2(h.x)} ${r2(h.y + h.h)}H${r2(h.x + h.w)}` : `M${r2(h.x + h.w)} ${r2(h.y)}V${r2(h.y + h.h)}`}" stroke="${AC.line}" stroke-width="1.2"/>`; }).join('') + '</g>', over: '' };
}

/* ---- validators (§9.3): the shared flow rules (flow.js), then the activity's own. Each problem: { level, rule, path,
   message, ids } ---- */
const ACT_RULES = {
  ...FLOW_RULES,
  'object-flow': 'an object flow has an object node or a data store at one end; a control flow has none at either',
  'partition-owner': 'a partition\'s owner is a partition or none; a node\'s owner is a partition or none',
  'in-lane': 'on a view that shows a partition, every node is in one',
  'calls-view': 'a call behaviour action opens an activity view of the model',
};
function actProblems(model, view) {
  const I = actIndex(model, view), out = [...flowProblems(model, view, AC_NODES)], seen = id => !view || I.shown.has(id);
  const say = (rule, path, ids, msg, level = 'warning') => out.push({ level, rule, path, ids, message: `${rule}: ${msg}` });
  const q = id => { const x = I.N.get(id); return x && AC_HAS(x.label) ? `${id} ("${x.label}")` : id; };
  I.E.forEach((e, id) => { if (!AC_FLOWS.includes(e.type) || !(seen(e.from) || seen(e.to))) return;
    const objs = [e.from, e.to].filter(x => I.N.has(x) && AC_OBJECTS.includes(I.N.get(x).type));
    if (e.type === 'uml.ObjectFlow' && !objs.length) say('object-flow', I.path.get(id), [id, e.from, e.to], `object flow ${id} joins ${q(e.from)} and ${q(e.to)}, neither an object node nor a data store`);
    if (e.type === 'uml.ControlFlow' && objs.length) say('object-flow', I.path.get(id), [id, ...objs], `control flow ${id} ends on ${objs.map(q).join(' and ')}: a flow to or from an object node is an object flow`); });
  I.N.forEach((x, id) => { if (!seen(id) || !(AC_NODES.includes(x.type) || x.type === 'uml.ActivityPartition') || x.parent == null || !I.N.has(x.parent)) return;
    const p = I.N.get(x.parent); if (p.type !== 'uml.ActivityPartition') say('partition-owner', `${I.path.get(id)}.parent`, [id, p.id], `${q(id)} is owned by ${q(p.id)}, a ${String(p.type).split('.').pop()}, not a partition`, 'error'); });
  I.N.forEach((x, id) => { if (x.type !== 'uml.CallBehaviorAction' || !seen(id)) return;
    const v = AC_ARR(model.views).find(w => AC_OBJ(w) && w.id === x.opensView);
    if (!v || v.diagram !== 'uml.activity') say('calls-view', I.path.get(id), [id], `${q(id)} ${x.opensView == null ? 'opens no view' : `opens ${JSON.stringify(x.opensView)}, which is ${v ? 'not an activity view' : 'no view of the model'}`}`); });
  if (view && I.parts.length) { const vi = AC_ARR(model.views).indexOf(view);
    I.drawn.forEach(id => { if (I.N.get(id).type !== 'uml.Comment' && I.laneOf(id) == null) say('in-lane', `views[${vi}].nodeIds`, [id, view.id], `${q(id)} is in no partition view ${JSON.stringify(view.id)} shows: it is drawn after the lanes`); }); }
  return out;
}

/* ---- describe(): the view in words: its partitions, then from each initial node each node once with the flows out of it,
   then the nodes no flow reaches ---- */
function actDescribe(model, viewId) {
  const v = AC_ARR(model && model.views).find(x => AC_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = actIndex(model, v), flows = I.lines.filter(e => AC_FLOWS.includes(e.type)), seen = new Set(), walk = [];
  const visit = s => { const q = [s]; while (q.length) { const id = q.shift(); if (seen.has(id)) continue; seen.add(id); walk.push(id); flows.filter(e => e.from === id).forEach(e => q.push(e.to)); } };
  I.drawn.filter(id => I.N.get(id).type === 'uml.InitialNode').forEach(visit); I.drawn.forEach(visit);
  const out = [`${v.title || v.id}: an activity diagram of ${acPlural(I.drawn.length, 'node')}, ${acPlural(flows.length, 'flow')} and ${acPlural(I.parts.length, 'partition')}.`];
  I.parts.forEach(p => out.push(acNodeName(model, I, I.N.get(p), I.lines) + '.'));
  walk.forEach(id => { const x = I.N.get(id), said = I.lines.filter(e => e.from === id).map(e => { const g = AC_PART(acProps(e).guard), nm = AC_PART(e.label);
    return e.type === 'uml.CommentLink' ? `about ${acCalled(I.N.get(e.to))}` : `then ${acCalled(I.N.get(e.to))}${nm ? ` (${nm})` : ''}${g ? ` [${g}]` : ''}${e.type === 'uml.ObjectFlow' ? ', an object flow' : ''}`; });
    out.push(acNodeName(model, I, x, I.lines) + (said.length ? '; ' + said.join('; ') : '') + '.'); });
  return out.join('\n');
}

/* ---- editing (§9.4, §12.1): each hook returns commands, null to leave the gesture to the default, or { error } for the
   hint line, and never a transaction that breaks a rule (S5) ---- */
function acFreshId(model, base) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).toLowerCase().replace(/->/g, '-').replace(/[^\p{L}\p{N}_$-]+/gu, '-').replace(/^-+|-+$/g, '') || 'node'; // ids never hold "->" (M2)
  let k = 1; while (used.has(k === 1 ? b : `${b}-${k}`)) k++;
  return k === 1 ? b : `${b}-${k}`;
}
// the commands, or { error } naming the first error they bring that the view does not have already
function acGuard(model, view, commands) {
  const key = p => p.rule + ' ' + p.ids.join(' '), errs = m => actProblems(m, AC_ARR(m.views).find(v => AC_OBJ(v) && v.id === view.id)).filter(p => p.level === 'error');
  let now; try { now = apply(model, commands); } catch (e) { return { error: String(e.message) }; }
  const was = new Set(errs(model).map(key)), bad = errs(now).find(p => !was.has(key(p)));
  return bad ? { error: bad.message } : commands;
}
// connect: a flow of the kind picked; a decision's second exit gets the guard else when neither has one
function actConnect(model, view, from, to, at, line) {
  if (!AC_OBJ(view) || !AC_OBJ(line) || !AC_FLOWS.includes(line.type)) return null;
  const I = actIndex(model, view), x = I.N.get(from), outs = [...I.E.values()].filter(e => AC_FLOWS.includes(e.type) && e.from === from);
  const props = { ...(AC_OBJ(line.props) ? structuredClone(line.props) : {}) };
  if (x && x.type === 'uml.DecisionNode' && outs.length === 1 && !AC_HAS(props.guard) && AC_PART(acProps(outs[0]).guard) !== 'else') props.guard = 'else';
  return acGuard(model, view, [{ op: 'add', element: { id: acFreshId(model, `${from}-${to}`), type: line.type, from, to, ...(Object.keys(props).length ? { props } : {}) }, view: view.id }]);
}
// moveTo: a partition's header moves nothing (§5.3); a node dropped in another band changes lane, its pin removed; within
// its own band, or by Alt + arrows, null: a pin, which is an order inside the lane (§5.2)
function actMoveTo(model, view, id, at) {
  if (!AC_OBJ(view)) return null;
  const I = actIndex(model, view); if (I.isPart(id)) return [];
  if ((I.N.get(id) || {}).type === 'uml.Comment') return null; // a comment is in no lane (add, in-lane): a pin
  const bands = AC_ARR(AC_OBJ(at) && AC_OBJ(at.geo) ? at.geo.bands : null);
  if (!I.shown.has(id) || !Array.isArray(at && at.pt) || !bands.length) return null;
  const [x, y] = at.pt, hit = bands.filter(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h).sort((a, b) => b.depth - a.depth)[0], to = hit ? hit.id : null;
  if (to === I.laneOf(id)) return null;
  const L = view.layout;
  return [{ op: 'reparent', id, parent: to }, ...(AC_OBJ(L) && Object.hasOwn(L, id) ? [{ op: 'set', view: view.id, path: ['layout', id], value: undefined }] : [])];
}
// add: a node in the partition selected, else in the lane of the node selected (its slot's parent); a call behaviour action asks which activity view it opens (S18)
function actAdd(model, view, entry, label, at) {
  if (!AC_OBJ(view) || !AC_OBJ(entry) || !Object.hasOwn(AC_LOOK, entry.type)) return null;
  const N = new Map(AC_ARR(model.nodes).filter(AC_OBJ).map(n => [n.id, n])), part = AC_ARR(AC_OBJ(at) ? at.sel : null).find(id => (N.get(id) || {}).type === 'uml.ActivityPartition');
  const lane = part ?? (AC_OBJ(at) && at.parent != null && AC_ARR(at.sel).includes(at.after) ? at.parent : null);
  const t = AC_PART(label), el = { id: acFreshId(model, t || AC_LOOK[entry.type][1]), type: entry.type, ...(t ? { label: t } : {}), ...(lane != null && entry.type !== 'uml.Comment' ? { parent: lane } : {}) };
  const make = opens => [{ op: 'add', element: { ...el, ...(opens != null ? { opensView: opens } : {}) }, view: view.id }];
  if (entry.type !== 'uml.CallBehaviorAction') return make();
  const vs = AC_ARR(model.views).filter(v => AC_OBJ(v) && v.diagram === 'uml.activity');
  return { pick: vs.map(v => String(v.title ?? v.id)), then: i => make(vs[i].id) };
}
// remove: Shift + Delete on a partition keeps what it holds, which goes to the partition's own owner (S10)
function actRemove(model, view, ids, fromModel) {
  if (!fromModel) return null;
  const N = new Map(AC_ARR(model.nodes).filter(AC_OBJ).map(n => [n.id, n])), gone = new Set(AC_ARR(ids)), parts = [...gone].filter(id => (N.get(id) || {}).type === 'uml.ActivityPartition');
  if (!parts.length) return null;
  const keep = p => { const seen = new Set(); while (p != null && gone.has(p) && !seen.has(p)) { seen.add(p); p = (N.get(p) || {}).parent; } return p != null && N.has(p) && !gone.has(p) ? p : null; };
  return [...[...N.values()].filter(n => !gone.has(n.id) && parts.includes(n.parent)).map(n => ({ op: 'reparent', id: n.id, parent: keep(n.parent) })), ...[...gone].map(id => ({ op: 'delete', id }))];
}
// rename: F2 on a flow reads "name [guard]" (§7.2) and sets each part that changed; on anything else, null (set label)
function actRename(model, view, id, text) {
  const e = AC_ARR(model && model.edges).find(x => AC_OBJ(x) && x.id === id);
  if (!e || !AC_FLOWS.includes(e.type)) return null;
  const r = parseFlow(text); if (r.error) return r;
  return [...(r.name !== AC_PART(e.label) ? [{ op: 'set', id, path: 'label', value: r.name }] : []), ...(r.guard !== AC_PART(acProps(e).guard) ? [{ op: 'set', id, path: 'props.guard', value: r.guard }] : [])];
}
// the Owner field: every partition of the model, by its name from the top
function actOwners(model, x) {
  if (!AC_OBJ(x) || x.from != null || !(AC_NODES.includes(x.type) || x.type === 'uml.ActivityPartition')) return null;
  const N = new Map(AC_ARR(model.nodes).filter(AC_OBJ).map(n => [n.id, n])), full = id => { const out = [], seen = new Set(); for (let p = id; p != null && N.has(p) && !seen.has(p); p = N.get(p).parent) { seen.add(p); out.unshift(acName(N.get(p))); } return out.join('::'); };
  return [...N.values()].filter(n => n.type === 'uml.ActivityPartition').map(n => ({ id: n.id, label: full(n.id) }));
}

/* ---- the type ---- */
const AC_ST = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' }, AC_GUARD = { key: 'guard', label: 'Guard', kind: 'text' };
const ACT_TYPE = registerDiagramType('uml.activity', {
  title: 'activity diagram',
  elements: [['Action', 'Action'], ['InitialNode', 'Initial', false], ['ActivityFinalNode', 'Activity final', false], ['FlowFinalNode', 'Flow final', false],
    ['DecisionNode', 'Decision'], ['MergeNode', 'Merge'], ['ForkNode', 'Fork', false], ['JoinNode', 'Join', false], ['CallBehaviorAction', 'Call behaviour', true, 'uml.activity'],
    ['SendSignalAction', 'Send signal'], ['AcceptEventAction', 'Accept event'], ['ObjectNode', 'Object node'], ['DataStoreNode', 'Data store'], ['ActivityPartition', 'Partition'], ['Comment', 'Comment']]
    .map(([t, label, name, opens]) => ({ type: 'uml.' + t, label, ...(name === false ? { name: false } : {}), ...(opens ? { opens } : {}) })),
  lines: [{ type: 'uml.ControlFlow', label: 'Control flow' }, { type: 'uml.ObjectFlow', label: 'Object flow' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { ...Object.fromEntries(Object.keys(AC_LOOK).map(t => [t, [AC_ST]])), 'uml.Comment': [], 'uml.ControlFlow': [AC_GUARD, AC_ST], 'uml.ObjectFlow': [AC_GUARD, AC_ST], 'uml.CommentLink': [] },
  layout: actGeo,
  draw: actDraw,
  owners: actOwners,
  validate: actProblems,
  rules: ACT_RULES,
  describe: actDescribe,
  unfolds: true, // a call behaviour action unfolds its activity in place (notes/milestone-2.md §6.3)
  edits: { connect: actConnect, moveTo: actMoveTo, add: actAdd, remove: actRemove, rename: actRename },
  // the PDF's tables (§15): a node's kind, and its partition
  word: (model, id) => { const x = AC_ARR(model && model.nodes).find(n => AC_OBJ(n) && n.id === id); return x && Object.hasOwn(AC_LOOK, x.type) ? AC_LOOK[x.type][1] : null; },
  rows: (model, view, id) => { const I = actIndex(model, view), l = I.N.has(id) ? I.laneOf(id) : null; return l != null ? [`in ${acName(I.N.get(l))}`] : null; },
});

export { ACT_TYPE, ACT_RULES, AC_NODES, actGeo, actProblems, actDescribe, actConnect, actMoveTo, actAdd, actRemove, actRename, actOwners };
