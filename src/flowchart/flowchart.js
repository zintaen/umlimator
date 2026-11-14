import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import '../uml/class.js'; // SHAPE.note, a comment's look
import { flowWrap } from '../uml/flow.js'; // and SHAPE.diamond, SHAPE.initial's circle, read only

/* ---------- the flowchart, flowchart (work package M2.3, notes/milestone-2.md §7.2) ----------
   Ten symbols: the decision is stage 4's diamond and the connector a circle over SHAPE.initial's outline, both read only;
   the database is drawn over the map's cylinder's outline with a lid line of its own (the cylinder's det is tinted by a map
   kind); the other seven are this file's, each with size, out, inset (a line's end slid onto it, stage 4 §4.2), face, ports
   and draw. A node's text is flowWrap's, three lines of 180 px, then cut, inside the shape's text box (its padding per
   side, FC_SHAPES). Flows are solid with a filled arrow, their labels cut at 280 px. Laid out down unless the view says
   right (model.md row 21), gap 48 with gapAfter's widening, labelGaps, repair and reroute off (§11). Ships in
   lib/umlimator-all.js only. */

const FC_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), FC_ARR = x => (Array.isArray(x) ? x : []);
const FC_TXT = x => (x != null && String(x).trim() !== '' ? String(x).trim() : '');
const FC = { px: 12, lh: 16, max: 180, padX: 12, padY: 8, minW: 96, minH: 40, slant: 14, wave: 5, slope: 12, side: 8, line: 'var(--um-muted)', ink: 'var(--um-text)', bg: 'var(--um-stage-bg)' };
// each node type: its shape and its word (accessible names, the PDF, the legend)
const FC_LOOK = {
  'flow.Terminator': ['terminator', 'Terminator'], 'flow.Process': ['process', 'Process'], 'flow.Decision': ['diamond', 'Decision'],
  'flow.InputOutput': ['io', 'Input/output'], 'flow.PredefinedProcess': ['predefined', 'Predefined process'], 'flow.Document': ['doc', 'Document'],
  'flow.Database': ['database', 'Database'], 'flow.ManualInput': ['manual', 'Manual input'], 'flow.Delay': ['delay', 'Delay'],
  'flow.Connector': ['connector', 'Connector'], 'uml.Comment': ['note', 'Comment'],
};
const FC_NODES = Object.keys(FC_LOOK).filter(t => t !== 'uml.Comment'); // what a flow may end on
const fcLook = x => (Object.hasOwn(FC_LOOK, x.type) ? FC_LOOK[x.type] : ['process', String(x.type || 'Node').split('.').pop()]);

/* ---- the shapes ---- */
const arcIn = (r, u) => r - Math.sqrt(Math.max(0, r * r - Math.min(r, Math.abs(u)) ** 2)); // a circle's depth at u from its axis
const grow = (n, d) => ({ x: n.x - d, y: n.y - d, w: n.w + 2 * d, h: n.h + 2 * d });
const WAVE = FC.wave / 0.2887; // a cubic's control offset that swings its curve by FC.wave each way
// the document's wavy bottom at u (0 at its right, 1 at its left): how far above the box's bottom it is
const waveIn = u => FC.wave - 3 * WAVE * u * (1 - u) * (2 * u - 1);
// [text padding left, right, top, bottom] past FC.padX and FC.padY, out(n, d), inset(n, side, t), det(n): a shape's own
const FC_SHAPES = {
  process: [() => [0, 0, 0, 0], boxOut(0), () => 0],
  terminator: [h => [h / 4, h / 4, 0, 0], (n, d = 0) => boxOut(n.h / 2)(n, d),
    (n, s, t) => { const r = n.h / 2; return s === 'L' || s === 'R' ? arcIn(r, t - n.y - r) : t < n.x + r ? arcIn(r, n.x + r - t) : t > n.x + n.w - r ? arcIn(r, t - n.x - n.w + r) : 0; }],
  io: [() => [FC.slant, FC.slant, 0, 0], (n, d = 0) => { const { x, y, w, h } = grow(n, d), k = FC.slant; return `M${r2(x + k)} ${r2(y)}H${r2(x + w)}L${r2(x + w - k)} ${r2(y + h)}H${r2(x)}Z`; },
    (n, s, t) => { const k = FC.slant, v = Math.min(1, Math.max(0, (t - n.y) / n.h)), u = Math.max(0, Math.min(1, (n.x + k - t) / k)), b = Math.max(0, Math.min(1, (t - n.x - n.w + k) / k));
      return s === 'L' ? k * (1 - v) : s === 'R' ? k * v : s === 'T' ? n.h * u : n.h * b; }],
  predefined: [() => [FC.side, FC.side, 0, 0], boxOut(0), () => 0,
    n => `<path d="M${r2(n.x + FC.side)} ${r2(n.y)}V${r2(n.y + n.h)}M${r2(n.x + n.w - FC.side)} ${r2(n.y)}V${r2(n.y + n.h)}" class="n-det" stroke="${FC.line}"/>`],
  doc: [() => [0, 0, 0, 2 * FC.wave], (n, d = 0) => { const { x, y, w, h } = grow(n, d), b = y + h - FC.wave;
    return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(b)}C${r2(x + 2 * w / 3)} ${r2(b - WAVE)} ${r2(x + w / 3)} ${r2(b + WAVE)} ${r2(x)} ${r2(b)}Z`; },
  (n, s, t) => (s === 'B' ? waveIn(Math.max(0, Math.min(1, (n.x + n.w - t) / n.w))) : 0), null, n => [n.y, n.y + n.h - FC.wave]],
  // the map's cylinder's outline; its lid's front edge drawn here, in the typed line colour
  database: [() => [0, 0, 12, 6], (n, d = 0) => SHAPE.cylinder.out(n, d), (n, s, t) => SHAPE.cylinder.inset(n, s, t),
    n => { const ry = SHAPE.cylinder.ry(n); return `<path d="M${r2(n.x)} ${r2(n.y + ry)}A${r2(n.w / 2)} ${ry} 0 0 0 ${r2(n.x + n.w)} ${r2(n.y + ry)}" class="n-det" fill="none" stroke="${FC.line}"/>`; },
    n => SHAPE.cylinder.face(n)],
  manual: [() => [0, 0, FC.slope, 0], (n, d = 0) => { const { x, y, w, h } = grow(n, d); return `M${r2(x)} ${r2(y + FC.slope)}L${r2(x + w)} ${r2(y)}V${r2(y + h)}H${r2(x)}Z`; },
    (n, s, t) => (s === 'T' ? FC.slope * Math.max(0, Math.min(1, 1 - (t - n.x) / n.w)) : s === 'L' && t < n.y + FC.slope ? n.w * (n.y + FC.slope - t) / FC.slope : 0), null, n => [n.y + FC.slope, n.y + n.h]],
  delay: [h => [0, h / 2, 0, 0], (n, d = 0) => { const { x, y, w, h } = grow(n, d), r = h / 2; return `M${r2(x)} ${r2(y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}H${r2(x)}Z`; },
    (n, s, t) => { const r = n.h / 2; return s === 'R' ? arcIn(r, t - n.y - r) : (s === 'T' || s === 'B') && t > n.x + n.w - r ? arcIn(r, t - n.x - n.w + r) : 0; }],
};
const fcG = (n, shape, said, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || said)}">${inner}</g>`;
const fcBody = d => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${FC.bg}" stroke="${FC.line}"/>`;
const fcText = (cx, y, t) => `<text x="${r2(cx)}" y="${r2(y)}" text-anchor="middle" class="c-name" fill="${FC.ink}" style="font:600 ${FC.px}px var(--um-sans)">${esc(t)}</text>`;
const fcSaid = (n, word) => (FC_TXT(n.label) ? `${word} ${FC_TXT(n.label)}` : word);
for (const [shape, [pad, out, inset, det, face]] of Object.entries(FC_SHAPES)) {
  const word = Object.values(FC_LOOK).find(l => l[0] === shape)[1];
  const S = SHAPE[shape] = { out, inset, face: face || (n => [n.y, n.y + n.h]),
    size(n) { const ls = flowWrap(n.label, FC.px, FC.max, 3), h = Math.max(FC.minH, 2 * FC.padY + Math.max(1, ls.length) * FC.lh), [l, r, t, b] = pad(h);
      return { w: Math.ceil(Math.max(FC.minW, ...ls.map(x => textW(x, FC.px) + 2 * FC.padX)) + l + r), h: Math.ceil(h + t + b) }; },
    draw(n) { const [l, r, t, b] = pad(n.h), w = n.w - l - r - 2 * FC.padX, ls = flowWrap(n.label, FC.px, FC.max, 3);
      const y0 = n.y + t + (n.h - t - b - ls.length * FC.lh) / 2, cx = n.x + l + (n.w - l - r) / 2;
      return fcG(n, shape, fcSaid(n, word), fcBody(out(n)) + (det ? det(n) : '') + ls.map((x, i) => fcText(cx, y0 + i * FC.lh + 12, fit(x, FC.px, w))).join('')); } };
  S.ports = (n, side, k = 1) => portsOn(S, n, side, k);
}
// the connector: a circle 28 px across, or as wide as its label (one or two characters) up to 40 px, a longer label cut
SHAPE.connector = { out: SHAPE.initial.out, inset: SHAPE.initial.inset, face: n => [n.y, n.y + n.h],
  size: n => { const d = Math.min(40, Math.max(28, Math.ceil(textW(FC_TXT(n.label), FC.px) + 10))); return { w: d, h: d }; },
  draw: n => fcG(n, 'connector', fcSaid(n, 'Connector'), fcBody(SHAPE.initial.out(n)) + (FC_TXT(n.label) ? fcText(n.x + n.w / 2, n.y + n.h / 2 + 4, fit(FC_TXT(n.label), FC.px, n.w - 6)) : '')) };
SHAPE.connector.ports = (n, side, k = 1) => portsOn(SHAPE.connector, n, side, k);

/* ---- the view read: its nodes, its lines, its flows in and out of each node, its starts and ends, its reading order ---- */
function fcIndex(model, view) {
  const N = new Map(), E = new Map(), path = new Map();
  FC_ARR(model && model.nodes).forEach((n, k) => { if (FC_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) { N.set(n.id, n); path.set(n.id, `nodes[${k}]`); } });
  FC_ARR(model && model.edges).forEach((e, k) => { if (FC_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) { E.set(e.id, e); path.set(e.id, `edges[${k}]`); } });
  const ids = view ? [...new Set(FC_ARR(view.nodeIds).filter(id => N.has(id)))] : [...N.keys()].filter(id => Object.hasOwn(FC_LOOK, N.get(id).type)), on = new Set(ids);
  const list = view && Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => e.type === 'flow.Flow' || e.type === 'uml.CommentLink');
  const lines = list.filter(e => FC_OBJ(e) && typeof e.id === 'string' && on.has(e.from) && on.has(e.to)), flows = lines.filter(e => e.type === 'flow.Flow');
  const ins = id => flows.filter(e => e.to === id), outs = id => flows.filter(e => e.from === id);
  const term = id => N.get(id).type === 'flow.Terminator', starts = ids.filter(id => term(id) && !ins(id).length), ends = ids.filter(id => term(id) && !outs(id).length);
  // reading order: from each start along its flows, depth first, a decision's exits in the model's order (one branch read to its end before the next)
  const walk = [], seen = new Set(), visit = s => { const q = [s]; while (q.length) { const id = q.pop(); if (seen.has(id)) continue; seen.add(id); walk.push(id); outs(id).reverse().forEach(e => q.push(e.to)); } };
  starts.forEach(visit); const reached = new Set(seen); ids.forEach(visit);
  return { N, E, path, ids, lines, flows, ins, outs, starts, ends, walk, reached };
}
const fcName = x => String(x.label ?? x.id);
const fcCalled = x => (x ? (FC_TXT(fcName(x)) || fcLook(x)[1].toLowerCase()) : '?');
const fcPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;

// accessible names (A1): "Decision Fit for resale?, exits yes to Refund the payment, no to Rejection letter"; "Terminator Return closed, an end"
function fcNodeName(I, x) {
  if (x.type === 'uml.Comment') return 'Comment: ' + fcName(x);
  const [, word] = fcLook(x), head = fcSaid({ label: fcName(x) }, word), o = I.outs(x.id);
  if (x.type === 'flow.Decision') return `${head}, ${o.length ? 'exits ' + o.map(e => `${FC_TXT(e.label) ? FC_TXT(e.label) + ' ' : ''}to ${fcCalled(I.N.get(e.to))}`).join(', ') : 'no exits'}`;
  if (x.type === 'flow.Terminator') return `${head}, ${I.starts.includes(x.id) ? 'a start' : I.ends.includes(x.id) ? 'an end' : 'flows in and out'}`;
  return head;
}
function fcLineName(I, e) {
  const t = FC_TXT(e.label), ends = `from ${fcCalled(I.N.get(e.from))} to ${fcCalled(I.N.get(e.to))}`;
  return e.type === 'uml.CommentLink' ? `Comment link ${ends}` : `Flow ${ends}${t ? ': ' + t : ''}`;
}

/* ---- the legend: each line kind and each symbol the view draws (1.9's legendItem form) ---- */
const fcKey = (svg, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none">${svg}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const FC_KEYS = [
  ['flow.Flow', '<path d="M2 8H18"/><path d="M17 4L26 8L17 12Z" fill="var(--um-muted)"/>', 'Flow', 'the next step'],
  ['uml.CommentLink', '<path d="M2 8H26" stroke-dasharray="3 2"/>', 'Comment link', 'what a comment is about'],
  ['flow.Terminator', '<rect x="3" y="3" width="22" height="10" rx="5"/>', 'Terminator', 'a start or an end'],
  ['flow.Process', '<rect x="3" y="3" width="22" height="10"/>', 'Process', 'a step'],
  ['flow.Decision', '<path d="M14 2L24 8L14 14L4 8Z"/>', 'Decision', 'a question, an exit per answer'],
  ['flow.InputOutput', '<path d="M7 3H25L21 13H3Z"/>', 'Input/output', 'data read or written'],
  ['flow.PredefinedProcess', '<rect x="3" y="3" width="22" height="10"/><path d="M6 3V13M22 3V13"/>', 'Predefined process', 'steps written out elsewhere'],
  ['flow.Document', '<path d="M3 3H25V11C19 7 9 16 3 11Z"/>', 'Document', 'a document made or read'],
  ['flow.Database', '<path d="M6 4V12A8 2 0 0 0 22 12V4"/><ellipse cx="14" cy="4" rx="8" ry="2"/>', 'Database', 'stored data'],
  ['flow.ManualInput', '<path d="M3 7L25 3V13H3Z"/>', 'Manual input', 'data keyed in by hand'],
  ['flow.Delay', '<path d="M4 3H18A5 5 0 0 1 18 13H4Z"/>', 'Delay', 'a wait'],
  ['flow.Connector', '<circle cx="14" cy="8" r="5"/>', 'Connector', 'flows joined, or carried on elsewhere'],
  ['uml.Comment', '<path d="M4 3H20L24 7V13H4Z"/>', 'Comment', 'a note on the chart'],
];

/* ---- the view laid out: { model, view, pos, memo } ---- */
function fcGeo({ model, view, pos, memo }) {
  const I = fcIndex(model, view), down = view.direction == null || view.direction === 'down', at = id => (FC_OBJ(pos) && Array.isArray(pos[id]) ? pos[id] : [0, 0]);
  const nodes = I.ids.map(id => { const x = I.N.get(id), [shape] = fcLook(x), d = { id, label: fcName(x), type: x.type, kind: 'file', shape, aria: fcNodeName(I, x), col: at(id)[0], row: at(id)[1] };
    return { ...d, ...SHAPE[shape].size(d) }; });
  const edges = I.lines.map(e => { const note = e.type === 'uml.CommentLink', label = note ? '' : FC_TXT(e.label);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, ...(label ? { label, cut: 280 } : {}), end: note ? { from: 'none', to: 'none', dashed: true } : { from: 'none', to: 'arrow' },
      aria: fcLineName(I, e), ...(FC_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  const g = layoutTyped({ nodes, edges, direction: down ? 'down' : 'right', gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  const types = new Set([...I.lines.map(e => e.type), ...I.ids.map(id => I.N.get(id).type)]);
  // a new object: what layoutTyped returned is never edited (stage 4 §2.4). The slots: one per node, so L and the palette hear the selection
  return { ...g, order: [...I.walk, ...I.lines.map(e => e.id)], slots: g.nodes.map(n => ({ after: n.id, x: n.x + n.w / 2, y: n.y + n.h / 2 })),
    legend: FC_KEYS.filter(([t]) => types.has(t)).map(([, svg, name, says]) => fcKey(svg, name, says)) };
}

/* ---- validators (§7.2). Each problem: { level, rule, path, message, ids } ---- */
const FC_RULES = {
  'flow-ends': 'a flow joins two flowchart nodes',
  'start-end': 'a view has exactly one start (a terminator with no flow in) and at least one end (a terminator with no flow out)',
  'terminator-flows': 'a start has one flow out; an end has none out',
  'decision-exits': 'a decision has two or more flows out, each labelled, no two with one label',
  reachable: 'every node is reached from a start',
};
function fcProblems(model, view) {
  const I = fcIndex(model, view), out = [], q = id => { const x = I.N.get(id); return x && FC_TXT(x.label) ? `${id} ("${FC_TXT(x.label)}")` : id; };
  const say = (rule, path, ids, msg, level = 'warning') => out.push({ level, rule, path, ids, message: `${rule}: ${msg}` });
  const shown = new Set(I.ids), mine = id => I.N.has(id) && FC_NODES.includes(I.N.get(id).type), list = es => es.map(e => e.id).join(', ');
  I.E.forEach((e, id) => { if (e.type !== 'flow.Flow' || !(shown.has(e.from) || shown.has(e.to))) return;
    [e.from, e.to].forEach(end => { if (I.N.has(end) && !mine(end)) say('flow-ends', I.path.get(id), [id, end], `flow ${id} ends on ${q(end)}, a ${String(I.N.get(end).type).split('.').pop()}: a flow joins two flowchart nodes`, 'error'); }); });
  if (!view) return out;
  const vp = `views[${FC_ARR(model.views).indexOf(view)}]`;
  if (I.starts.length !== 1) say('start-end', vp, [view.id, ...I.starts], `view ${view.id} has ${fcPlural(I.starts.length, 'start')}${I.starts.length ? ` (${I.starts.map(q).join(', ')})` : ''}; it wants one`);
  if (!I.ends.length) say('start-end', vp, [view.id], `view ${view.id} has no end: no terminator without a flow out`);
  I.ids.forEach(id => { const x = I.N.get(id), i = I.ins(id), o = I.outs(id), p = I.path.get(id);
    if (x.type === 'flow.Terminator' && !i.length && o.length !== 1) say('terminator-flows', p, [id, ...o.map(e => e.id)], `the start ${q(id)} has ${o.length ? `${o.length} flows out (${list(o)})` : 'no flow out'}; it wants one`);
    if (x.type === 'flow.Terminator' && i.length && o.length) say('terminator-flows', p, [id, ...o.map(e => e.id)], `the end ${q(id)} has flows out (${list(o)}); a terminator with flows in is an end`);
    if (x.type === 'flow.Decision') { const bare = o.filter(e => !FC_TXT(e.label)), by = new Map(); o.forEach(e => { const k = FC_TXT(e.label).toLowerCase(); if (k) by.set(k, [...(by.get(k) || []), e]); }); // as connect reads them
      const twice = [...by.values()].filter(es => es.length > 1).flat();
      if (o.length < 2) say('decision-exits', p, [id, ...o.map(e => e.id)], `${q(id)} has ${fcPlural(o.length, 'exit')}; a decision wants two or more`);
      if (bare.length) say('decision-exits', p, [id, ...bare.map(e => e.id)], `${fcPlural(bare.length, 'exit')} of ${q(id)} ${bare.length === 1 ? 'has' : 'have'} no label (${list(bare)})`);
      if (twice.length) say('decision-exits', p, [id, ...twice.map(e => e.id)], `exits of ${q(id)} share a label (${list(twice)})`); }
    if (I.starts.length && mine(id) && !I.reached.has(id)) say('reachable', p, [id], `${q(id)} is reached from no start`); });
  return out;
}

/* ---- describe(): the view in sentences: each node in reading order (from the start, along its flows), then each line ---- */
function fcDescribe(model, viewId) {
  const v = FC_ARR(model && model.views).find(x => FC_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = fcIndex(model, v);
  return [`${v.title || v.id}: a flowchart of ${fcPlural(I.ids.length, 'node')} and ${fcPlural(I.flows.length, 'flow')}.`,
    ...I.walk.map(id => fcNodeName(I, I.N.get(id)) + '.'), ...I.lines.map(e => fcLineName(I, e) + '.')].join('\n');
}

/* ---- editing: each hook returns commands, null to leave the gesture to the default, or { error } for the hint line ---- */
const fcId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; }; // as the canvas names a line: 'flow1'
// connect: a flow joins two flowchart nodes (refused otherwise); a decision's second exit is labelled to answer its first,
// yes then no, and an unlabelled first exit becomes yes
function fcConnect(model, view, from, to, at, line) {
  if (!FC_OBJ(view) || !FC_OBJ(line) || line.type !== 'flow.Flow') return null;
  const I = fcIndex(model, null), bad = [from, to].find(id => !I.N.has(id) || !FC_NODES.includes(I.N.get(id).type));
  if (bad != null) return { error: `flow-ends: a flow joins two flowchart nodes, and ${fcCalled(I.N.get(bad))} is not one` };
  const o = [...I.E.values()].filter(e => e.type === 'flow.Flow' && e.from === from);
  if (I.N.get(from).type !== 'flow.Decision' || o.length !== 1) return null;
  const was = FC_TXT(o[0].label).toLowerCase(), label = was === 'yes' || !was ? 'no' : was === 'no' ? 'yes' : null;
  if (!label) return null;
  return [...(was ? [] : [{ op: 'set', id: o[0].id, path: 'label', value: 'yes' }]), { op: 'add', element: { id: fcId(model, 'flow'), type: 'flow.Flow', from, to, label }, view: view.id }];
}
// moveTo: a line dragged (or Alt + arrows on it) is refused, said on the hint line: a flow follows its ends. Anything else: null,
// the default, which reads a view laid out down (no direction too) from its geometry (render.js hintAt, g.down)
function fcMoveTo(model, view, id) {
  return FC_ARR(model && model.edges).some(e => FC_OBJ(e) && e.id === id) ? { error: 'A flow follows its nodes: move a node instead' } : null;
}

/* ---- the type ---- */
const FC_TYPE = registerDiagramType('flowchart', {
  title: 'flowchart',
  elements: [...FC_NODES, 'uml.Comment'].map(type => ({ type, label: FC_LOOK[type][1] })),
  lines: [{ type: 'flow.Flow', label: 'Flow' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  layout: fcGeo,
  validate: fcProblems,
  rules: FC_RULES,
  describe: fcDescribe,
  // F2 on a node or a flow sets its label: the default
  edits: { connect: fcConnect, moveTo: fcMoveTo },
  // the PDF's tables: a node's symbol; a line's text, which flags a decision's exit with no label (milestone 2 §9)
  word: (model, id) => { const x = FC_ARR(model && model.nodes).find(n => FC_OBJ(n) && n.id === id); return x && Object.hasOwn(FC_LOOK, x.type) ? FC_LOOK[x.type][1] : null; },
  text: (model, view, id) => { const by = x => FC_ARR(x).find(y => FC_OBJ(y) && y.id === id), e = by(model && model.edges), d = e && e.type === 'flow.Flow' && FC_ARR(model.nodes).find(n => FC_OBJ(n) && n.id === e.from);
    return e && !FC_TXT(e.label) && d && d.type === 'flow.Decision' ? `an exit of ${fcCalled(d)} with no label` : null; },
});

export { FC_TYPE, FC_RULES, FC_LOOK, fcGeo, fcProblems, fcDescribe, fcConnect, fcMoveTo };
