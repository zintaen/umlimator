import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { trimLine } from '../draw/lines.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { labelW } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.note, a comment
import { FLOW_CONTROL, FLOW_RULES, flowProblems, flowText, parseFlow } from './flow.js';
import { frameTag, tagSize, useSize } from './frame.js';
import { interactionWalk } from './interaction.js';
import { sqDraw, sqRun } from './sequence.js';

/* ---------- the interaction overview diagram, uml.interaction-overview (work package 4.7, notes/stage-4.md §11) ----------
   Activity notation whose nodes are interactions: the control nodes of src/uml/flow.js (flow final included), interaction
   uses (stage 3's SHAPE.use, "ref", with a look that gives it a size and a border) and inline interactions (a frame "sd
   name" holding its sequence view drawn at full size, read only, from sqRun and sqDraw, S11), joined by control flows drawn
   "name [guard]" and cut at 280 px; comments. Each use and inline interaction names its uml.sequence view in opensView,
   which a click on it when selected opens (Q11), and V changes (S18). Laid out by layoutTyped from the host's ranking, with
   repair and reroute off (§17); a view with no `edges` list draws control flows and comment links. Ships in
   lib/umlimator-all.js only. */

const OV_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), OV_ARR = x => (Array.isArray(x) ? x : []);
const OV_HAS = x => x != null && x !== '';
const OV_PROPS = x => (OV_OBJ(x && x.props) ? x.props : {});
const OV_ENDS = [...FLOW_CONTROL, 'uml.InteractionUse', 'uml.Interaction'], OV_NODES = [...OV_ENDS, 'uml.Comment']; // model.md row 13
const OV_LINES = ['uml.ControlFlow', 'uml.CommentLink'];
const OV_WORD = { 'uml.InitialNode': 'Initial node', 'uml.ActivityFinalNode': 'Activity final', 'uml.FlowFinalNode': 'Flow final', 'uml.DecisionNode': 'Decision', 'uml.MergeNode': 'Merge',
  'uml.ForkNode': 'Fork', 'uml.JoinNode': 'Join', 'uml.InteractionUse': 'Interaction use', 'uml.Interaction': 'Inline interaction', 'uml.Comment': 'Comment' };
const OV_SHAPE = { 'uml.InitialNode': 'initial', 'uml.ActivityFinalNode': 'final', 'uml.FlowFinalNode': 'flow-final', 'uml.DecisionNode': 'diamond', 'uml.MergeNode': 'diamond',
  'uml.ForkNode': 'bar', 'uml.JoinNode': 'bar', 'uml.InteractionUse': 'ov-use', 'uml.Interaction': 'ov-inline', 'uml.Comment': 'note' }; // any other type: rounded, warned of
const OV_MAX = { heads: 8, messages: 20 }; // an inline interaction past either is drawn as its frame and name (S11)
const OV_GAP = 26; // a label's room past its own size on half a gap: a stub's 22 px and a little air
const OV_SD = { pad: 10, line: 'var(--um-muted)', bg: 'var(--um-stage-bg)' };
const ovOwn = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined); // a lookup by a model's type: 'constructor' is not Object's (risks.md M3)
const ovWordOf = t => ovOwn(OV_WORD, t) || String(t ?? '').split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase());
const ovPlural = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`;
const ovStereo = x => OV_ARR(OV_PROPS(x).stereotypes).filter(OV_HAS).map(String);

/* ---- the view read: its nodes, its lines (each with both ends shown), the model's views by id ---- */
function ovIndex(model, view) {
  const N = new Map(), E = new Map(), V = new Map();
  OV_ARR(model && model.nodes).forEach((n, i) => { if (OV_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) N.set(n.id, [n, `nodes[${i}]`]); });
  OV_ARR(model && model.edges).forEach(e => { if (OV_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  OV_ARR(model && model.views).forEach(v => { if (OV_OBJ(v) && typeof v.id === 'string' && !V.has(v.id)) V.set(v.id, v); });
  const ids = [...new Set(OV_ARR(view && view.nodeIds).filter(id => N.has(id)))], shown = new Set(ids);
  const list = Array.isArray(view && view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => OV_LINES.includes(e.type));
  const lines = list.filter(e => OV_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to));
  const el = id => (N.get(id) || [])[0];
  return { N, V, ids, shown, lines, el, flows: lines.filter(e => e.type === 'uml.ControlFlow') };
}
// a node in a sentence: its name, else its kind ("merge", "initial node")
const ovNm = (I, id) => { const x = I.el(id); return x && OV_HAS(x.label) ? String(x.label) : x ? ovWordOf(x.type).toLowerCase() : String(id); };

/* ---- the inline interaction (S11): its sequence view, counted, and laid out by the sequence type's own sqRun when it is
   small enough; { view, heads, messages, run } (run null when it is drawn as its frame only), or null with no sequence view */
function ovInline(model, I, n) {
  const sv = I.V.get(n.opensView);
  if (!sv || sv.diagram !== 'uml.sequence') return null;
  const own = new Set(OV_ARR(sv.nodes).filter(OV_OBJ).map(x => x.id)), heads = OV_ARR(sv.nodeIds).filter(id => I.N.has(id) || own.has(id)).length;
  const messages = interactionWalk(model, sv).occ.filter(o => o.message).length;
  return { view: sv, heads, messages, run: heads <= OV_MAX.heads && messages <= OV_MAX.messages ? sqRun(model, sv) : null };
}

/* ---- shapes: an interaction use's look over stage 3's SHAPE.use (its border and a size, useSize), and the inline frame ---- */
const ovBody = n => `<rect x="${r2(n.x)}" y="${r2(n.y)}" width="${r2(n.w)}" height="${r2(n.h)}" class="n-mask"/><rect x="${r2(n.x)}" y="${r2(n.y)}" width="${r2(n.w)}" height="${r2(n.h)}" class="n-body" fill="${OV_SD.bg}" stroke="${OV_SD.line}"/>`;
const ovBox = { out: boxOut(0), inset: () => 0, face: n => [n.y, n.y + n.h] };
SHAPE['ov-use'] = { ...ovBox, size: n => useSize(String(n.label ?? '')), draw: n => SHAPE.use.draw(n).replace(/^<g [^>]*>/, m => m + ovBody(n)) };
// the inline view's markup with nothing the canvas reads as its own (§11.2): no .node, data-id, tabindex or role, no hit
// strip (.ll-hit, from which src/typed/edit.js starts a connect) or frame hit (.f-hit); a body is drawn as one, but not
// styled as the node's when the inline node is hovered or selected
const ovQuiet = s => s.replace(/<(?:rect|path) [^>]*class="(?:ll-hit|f-hit)"[^>]*\/>/g, '').replace(/ class="node /g, ' class="')
  .replace(/ (?:data-id|data-o|tabindex|role|aria-label)="[^"]*"/g, '').replace(/class="n-mask"/g, 'fill="var(--um-mask)" class="ov-mask"').replace(/class="n-body/g, 'stroke-width="1.5" class="ov-body');
// a message as the sequence view draws it, by hand: its path (dashed for a reply or a create), its arrowhead, its label
const OV_TIP = { arrow: [10, 4, true], open: [10, 5, false] };
function ovMessage(e) {
  const T = OV_TIP[e.end && e.end.to] || OV_TIP.open, P = e.pts, [p, q] = P.slice(-2), L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  const b = [q[0] - u[0] * T[0], q[1] - u[1] * T[0]], s = [-u[1] * T[1], u[0] * T[1]], pts = T[2] ? trimLine(P, 0, T[0]) : P, dash = e.end && e.end.dashed ? ' stroke-dasharray="6 4"' : '';
  const tip = `M${r2(b[0] + s[0])} ${r2(b[1] + s[1])}L${r2(q[0])} ${r2(q[1])}L${r2(b[0] - s[0])} ${r2(b[1] - s[1])}${T[2] ? 'Z' : ''}`, l = e.lbl;
  return `<g class="ov-msg" data-sort="${esc(e.sort)}"><path d="M${pts.map(c => `${r2(c[0])} ${r2(c[1])}`).join('L')}" fill="none" stroke="${OV_SD.line}" stroke-width="1.4"${dash}/>`
    + `<path d="${tip}" fill="${T[2] ? OV_SD.line : 'none'}" stroke="${OV_SD.line}" stroke-width="1.4" stroke-linejoin="round"/>`
    + (l && OV_HAS(l.text) ? `<g class="ov-lab"><rect x="${r2(l.x)}" y="${r2(l.y)}" width="${r2(l.w)}" height="${r2(l.h)}" fill="${OV_SD.bg}"/><text x="${r2(l.x + l.w / 2)}" y="${r2(l.y + 12)}" text-anchor="middle" fill="var(--um-text)" style="font:500 10.5px var(--um-sans)">${esc(fit(l.text, 10.5, l.w))}</text></g>` : '') + '</g>';
}
// the sequence's picture inside the frame: sqDraw's layer (frames, stems, uses' boxes, bars, crosses), then each head, each
// fragment's tag, each operand's guard and each use's name by frame.js's shapes, then the messages
function ovInner(run) {
  const by = s => run.nodes.filter(n => n.shape === s), C = 'var(--um-slate)', F = 'var(--um-slate-f)';
  return ovQuiet(sqDraw(run, { esc, r2, textW }).under + by('lifeline').map(n => SHAPE.lifeline.draw(n, C, F)).join('')
    + ['frame', 'operand', 'use'].map(s => by(s).map(n => SHAPE[s].draw(n, C, F)).join('')).join('') + run.edges.map(ovMessage).join(''));
}
const ovTagH = tagSize('sd').h;
SHAPE['ov-inline'] = { ...ovBox,
  draw(n) {
    const S = n.sd, t = String(n.label ?? ''), b = S && S.bounds;
    const inner = b ? frameTag(n.x, n.y, `sd ${t}`, n.w) + `<g class="ov-sd" aria-hidden="true" transform="translate(${r2(n.x + (n.w - b.w) / 2 - b.x)} ${r2(n.y + ovTagH)})">${S.markup}</g>`
      : frameTag(n.x, n.y, 'sd', n.w) + `<text x="${r2(n.x + n.w / 2)}" y="${r2(n.y + n.h / 2 + 4)}" text-anchor="middle" fill="var(--um-text)" style="font:600 11px var(--um-sans)">${esc(fit(t, 11, n.w - 2 * (tagSize('sd').w + 8)))}</text>`;
    return `<g class="node ov-inline" data-id="${esc(n.id)}" data-shape="ov-inline" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Inline interaction ' + t)}">${ovBody(n)}${inner}</g>`;
  },
};
for (const k of ['ov-use', 'ov-inline']) { const S = SHAPE[k]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }

/* ---- names (A1, L13): "Decision Payment accepted?, 2 exits", "Interaction use Find a book, opens Find a book" ---- */
function ovNodeName(model, I, x, ins, outs, sd) {
  const t = OV_HAS(x.label) ? String(x.label) : '', st = ovStereo(x), nm = `${ovWordOf(x.type)}${t ? ' ' + t : ''}${st.length ? ` (${st.join(', ')})` : ''}`;
  const opens = () => { const v = I.V.get(x.opensView); return v && v.diagram === 'uml.sequence' ? `, opens ${v.title ?? v.id}` : ', opens no sequence view'; };
  switch (x.type) {
    case 'uml.Comment': return 'Comment: ' + String(x.label ?? x.id);
    case 'uml.DecisionNode': return `${nm}, ${ovPlural(outs, 'exit')}`;
    case 'uml.MergeNode': return `${nm}, ${ovPlural(ins, 'entry', 'entries')}`;
    case 'uml.ForkNode': return `${nm}, ${ovPlural(outs, 'branch', 'branches')}`;
    case 'uml.JoinNode': return `${nm}, ${ovPlural(ins, 'branch', 'branches')}`;
    case 'uml.InteractionUse': return nm + opens();
    case 'uml.Interaction': return !sd ? nm + opens() : `${nm}, ${ovPlural(sd.heads, 'lifeline')}, ${ovPlural(sd.messages, 'message')}${sd.run ? '' : ', drawn as its frame only'}`;
    default: return nm;
  }
}
const ovFlowName = (I, e) => { const g = OV_PROPS(e).guard;
  return e.type === 'uml.CommentLink' ? `Comment link from ${ovNm(I, e.from)} to ${ovNm(I, e.to)}`
    : `Control flow from ${ovNm(I, e.from)} to ${ovNm(I, e.to)}${OV_HAS(e.label) ? ', ' + e.label : ''}${OV_HAS(g) ? ', guard ' + g : ''}`; };

/* ---- the legend: each line kind drawn, then each control glyph (§14) ---- */
const ovLegendItem = (svg, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const OV_LEGEND = [
  ['uml.ControlFlow', '<g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none"><path d="M2 8H26"/><path d="M17 3L26 8L17 13"/></g>', 'Control flow', 'what runs next'],
  ['uml.CommentLink', '<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4" stroke-dasharray="3 2"/>', 'Comment link', 'what a comment is about'],
  ['initial', '<circle cx="14" cy="8" r="6" fill="var(--um-text)"/>', 'Initial node', 'where the flow starts'],
  ['final', '<circle cx="14" cy="8" r="6.5" fill="var(--um-stage-bg)" stroke="var(--um-muted)" stroke-width="1.4"/><circle cx="14" cy="8" r="3.5" fill="var(--um-text)"/>', 'Activity final', 'ends the whole flow'],
  ['flow-final', '<circle cx="14" cy="8" r="6.5" fill="var(--um-stage-bg)" stroke="var(--um-muted)" stroke-width="1.4"/><path d="M9.4 3.4L18.6 12.6M18.6 3.4L9.4 12.6" stroke="var(--um-muted)" stroke-width="1.4"/>', 'Flow final', 'ends one branch'],
  ['diamond', '<path d="M14 1L21 8L14 15L7 8Z" fill="var(--um-stage-bg)" stroke="var(--um-muted)" stroke-width="1.4"/>', 'Decision or merge', 'one way out by its guards, or ways that meet'],
  ['bar', '<rect x="11.5" y="1" width="5" height="14" fill="var(--um-text)"/>', 'Fork or join', 'splits into branches that run together, or waits for all of them'],
];
const ovLegendOf = (edges, nodes) => { const has = new Set([...edges.map(e => e.type), ...nodes.map(n => n.shape)]);
  return OV_LEGEND.filter(([k]) => has.has(k)).map(([, svg, name, says]) => ovLegendItem(svg, name, says)); };

/* ---- the view laid out: { model, view, pos, memo } ----
   Each node by its shape, sized before the layout: a bar by the lines on its busier side, every line of a bar on its long
   side (the router reads no shape, §4.1); an inline interaction by its sequence's bounds under the "sd" tag. The inline
   view is laid out here, so its markup rides on the node (n.sd) into what layoutTyped returns and the memo keeps; nothing
   after layoutTyped edits what it returned (§2.4): the result is a new object, its nodes a new array in reading order */
function ovGeo({ model, view, pos, memo }) {
  const I = ovIndex(model, view), down = view.direction === 'down', at = id => ovOwn(pos || {}, id) || [0, 0];
  const ins = new Map(), outs = new Map(), bump = (m, id) => m.set(id, (m.get(id) || 0) + 1);
  I.flows.forEach(e => { bump(outs, e.from); bump(ins, e.to); });
  const bar = id => I.el(id).type === 'uml.ForkNode' || I.el(id).type === 'uml.JoinNode';
  const nodes = I.ids.map(id => { const x = I.el(id), shape = ovOwn(OV_SHAPE, x.type) || 'rounded', d = { id, label: OV_HAS(x.label) ? String(x.label) : '', type: x.type, kind: 'file', shape, col: at(id)[0], row: at(id)[1] };
    const sd = x.type === 'uml.Interaction' ? ovInline(model, I, x) : null;
    d.aria = ovNodeName(model, I, x, ins.get(id) || 0, outs.get(id) || 0, sd);
    if (shape === 'rounded') d.stereotypes = ovStereo(x);
    if (shape === 'bar') Object.assign(d, { busy: Math.max(ins.get(id) || 0, outs.get(id) || 0), down });
    if (shape === 'ov-inline') { const b = sd && sd.run && sd.run.bounds, tw = tagSize(`sd ${d.label}`).w + 2 * OV_SD.pad;
      return { ...d, ...(b ? { w: Math.ceil(Math.max(b.w + 2 * OV_SD.pad, tw)), h: Math.ceil(ovTagH + b.h), sd: { bounds: b, markup: ovInner(sd.run) } } : useSize(d.label)) }; }
    return { ...d, ...SHAPE[shape].size(d) }; });
  const edges = I.lines.map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, aria: ovFlowName(I, e), ...(OV_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}),
    ...(e.type === 'uml.CommentLink' ? { end: { from: 'none', to: 'none', dashed: true } }
      : { end: { from: 'none', to: 'open' }, label: flowText(e.label, OV_PROPS(e).guard) || undefined, cut: 280, ...(bar(e.from) ? { fromSide: 'right' } : {}), ...(bar(e.to) ? { toSide: 'left' } : {}) }) }));
  // a typed view makes no room for a label (layoutGraph's labelRoom is a map's). A row's nodes share its top, not their middle,
  // so a flow between two of different heights jogs halfway across the gap, and its label sits on one half, clear of the
  // nodes' stubs (22 px): the gap is twice that and the widest label laid out right, its 18 px height laid out down
  const wide = Math.max(0, ...edges.filter(e => e.label).map(labelW)), gap = wide ? Math.ceil(Math.max(64, 2 * ((down ? 18 : wide) + OV_GAP))) : 64;
  const g = layoutTyped({ nodes, edges, direction: down ? 'down' : 'right', gap, rgap: 56, repair: false, reroute: false }, memo); // P1 on a shared CI runner (§17)
  // reading order (§14): by rank (the layout's column, then its row), then the lines
  const order = I.ids.filter(id => g.byId[id]).sort((a, b) => g.byId[a].col - g.byId[b].col || g.byId[a].row - g.byId[b].row);
  return { ...g, nodes: order.map(id => g.byId[id]), order: [...order, ...g.edges.map(e => e.id)], legend: ovLegendOf(g.edges, g.nodes) };
}

/* ---- validators (§11.3): the shared flow rules (src/uml/flow.js), then the overview's own. Each problem:
   { level, rule, path, message, ids } ---- */
const OV_RULES = {
  ...FLOW_RULES,
  'opens-sequence': 'an interaction use or an inline interaction opens a sequence view of the model',
  'overview-kinds': 'an interaction overview shows control nodes, interaction uses, inline interactions and comments only',
  'inline-size': `an inline interaction's view has at most ${OV_MAX.heads} lifelines and ${OV_MAX.messages} messages, else it is drawn as its frame only`,
};
function ovProblems(model, view) {
  if (!OV_OBJ(view)) return [];
  const I = ovIndex(model, view), out = [...flowProblems(model, view, OV_ENDS)], vi = OV_ARR(model.views).indexOf(view);
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids, message: `${rule}: ${msg}` });
  I.ids.forEach(id => { const [x, path] = I.N.get(id), nm = `${ovWordOf(x.type).toLowerCase()} ${id}${OV_HAS(x.label) ? ` ("${x.label}")` : ''}`;
    if (!OV_NODES.includes(x.type)) say('warning', 'overview-kinds', `views[${vi}].nodeIds[${OV_ARR(view.nodeIds).indexOf(id)}]`, [id], `view ${view.id} shows ${nm}, which an interaction overview does not draw: drawn as an action`);
    if (x.type !== 'uml.InteractionUse' && x.type !== 'uml.Interaction') return;
    const v = I.V.get(x.opensView);
    if (!v || v.diagram !== 'uml.sequence') return say('error', 'opens-sequence', `${path}.opensView`, [id], `${nm} opens ${x.opensView == null ? 'no view' : !v ? `${JSON.stringify(x.opensView)}, which is not a view of the model` : `view ${v.id}, a ${v.diagram || 'map'}, not a sequence`}`);
    const sd = x.type === 'uml.Interaction' && ovInline(model, I, x);
    if (sd && !sd.run) say('warning', 'inline-size', `${path}.opensView`, [id, v.id], `${nm} shows view ${v.id}, of ${ovPlural(sd.heads, 'lifeline')} and ${ovPlural(sd.messages, 'message')}: over ${OV_MAX.heads} lifelines or ${OV_MAX.messages} messages it is drawn as its frame only`); });
  return out;
}

/* ---- describe(): the view in words: from each initial node along the flows, each node once by its accessible name and
   where its flows go; then what no flow reaches; then the comments' links ---- */
function ovDescribe(model, viewId) {
  const v = OV_ARR(model && model.views).find(x => OV_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = ovIndex(model, v), seen = new Set(), walk = [], out = I.flows.reduce((m, e) => m.set(e.from, [...(m.get(e.from) || []), e]), new Map());
  const visit = id => { if (seen.has(id)) return; seen.add(id); walk.push(id); (out.get(id) || []).forEach(e => visit(e.to)); };
  I.ids.filter(id => I.el(id).type === 'uml.InitialNode').forEach(visit); I.ids.forEach(visit);
  const count = id => I.flows.filter(e => e.to === id).length;
  const lines = [`${v.title || v.id}: an interaction overview diagram of ${ovPlural(I.ids.length, 'node')} and ${ovPlural(I.flows.length, 'flow')}.`];
  walk.forEach(id => { const x = I.el(id), next = (out.get(id) || []).map(e => { const g = OV_PROPS(e).guard; return `${ovNm(I, e.to)}${OV_HAS(g) ? ` [${g}]` : ''}`; });
    lines.push(`${ovNodeName(model, I, x, count(id), (out.get(id) || []).length, x.type === 'uml.Interaction' ? ovInline(model, I, x) : null)}${next.length ? '; then ' + next.join(', ') : ''}.`); });
  I.lines.filter(e => e.type === 'uml.CommentLink').forEach(e => lines.push(ovFlowName(I, e) + '.'));
  return lines.join('\n');
}

/* ---- editing (§11.3, §12): each hook returns commands, { pick, then }, null for the default, or { error } ---- */
function ovFreshId(model, base) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).trim().toLowerCase().replace(/[^\p{L}\p{N}_$]+/gu, '-').replace(/^-+|-+$/g, '') || 'node';
  let k = 1; while (used.has(k === 1 ? b : `${b}-${k}`)) k++;
  return k === 1 ? b : `${b}-${k}`;
}
/* add(model, view, entry, label, at): the palette and N. An interaction use or an inline interaction (an entry that opens a
   sequence) asks for its view first, from the model's sequence views (S18), and is added with opensView set and, with no
   name typed, the view's title; with no sequence view, nothing is added. Anything else is added under its name, if any */
function ovAdd(model, view, entry, label, at) {
  if (!OV_OBJ(view) || !OV_OBJ(entry) || typeof entry.type !== 'string') return null;
  const t = String(label ?? '').trim();
  const make = (name, more = {}) => [{ op: 'add', element: { id: ovFreshId(model, name || ovWordOf(entry.type)), type: entry.type, ...(name ? { label: name } : {}), ...more }, view: view.id }];
  if (entry.opens !== 'uml.sequence') return make(t);
  const vs = OV_ARR(model.views).filter(v => OV_OBJ(v) && v.diagram === 'uml.sequence');
  if (!vs.length) return { error: 'The model has no sequence view for it to open: add one first' };
  return { pick: vs.map(v => String(v.title ?? v.id)), then: i => (vs[i] ? make(t || String(vs[i].title ?? vs[i].id), { opensView: vs[i].id }) : []) };
}
/* rename(model, view, id, text): F2 on a control flow reads "name [guard]" (§7.2) and sets the parts that changed, an
   absent part cleared; a text the parser refuses is { error } (E3). Anything else: null, the default set label */
function ovRename(model, view, id, text) {
  const e = OV_ARR(model && model.edges).find(x => OV_OBJ(x) && x.id === id);
  if (!e || e.type !== 'uml.ControlFlow') return null;
  const p = parseFlow(text); if (p.error) return p;
  const now = { label: OV_HAS(e.label) ? String(e.label) : undefined, 'props.guard': OV_HAS(OV_PROPS(e).guard) ? String(OV_PROPS(e).guard) : undefined };
  return [['label', p.name], ['props.guard', p.guard]].filter(([k, v]) => now[k] !== v).map(([path, value]) => ({ op: 'set', id, path, value }));
}

/* ---- the type ---- */
const OV_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const OVERVIEW_TYPE = registerDiagramType('uml.interaction-overview', {
  title: 'interaction overview diagram',
  // control nodes but the decision (its question, S8) are added with no name prompt (§12.1); a use and an inline
  // interaction ask for the view they open, V changes it
  elements: [['InitialNode', 'Initial', { name: false }], ['ActivityFinalNode', 'Final', { name: false }], ['FlowFinalNode', 'Flow final', { name: false }], ['DecisionNode', 'Decision'],
    ['MergeNode', 'Merge', { name: false }], ['ForkNode', 'Fork', { name: false }], ['JoinNode', 'Join', { name: false }], ['InteractionUse', 'Interaction use', { opens: 'uml.sequence' }],
    ['Interaction', 'Inline interaction', { opens: 'uml.sequence' }], ['Comment', 'Comment']].map(([t, label, more]) => ({ type: 'uml.' + t, label, ...more })),
  lines: [{ type: 'uml.ControlFlow', label: 'Control flow' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { ...Object.fromEntries(OV_NODES.map(t => [t, [OV_STEREO]])), 'uml.ControlFlow': [{ key: 'guard', label: 'Guard', kind: 'text' }, OV_STEREO], 'uml.CommentLink': [] },
  layout: ovGeo,
  member: { holds: () => false }, // nothing here has members
  validate: ovProblems,
  rules: OV_RULES,
  describe: ovDescribe,
  edits: { add: ovAdd, rename: ovRename },
});

export { OVERVIEW_TYPE, OV_RULES, ovGeo, ovProblems, ovDescribe, ovAdd, ovRename };
