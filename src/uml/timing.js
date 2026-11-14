import { registerDiagramType } from '../core/registry.js';
import { apply } from '../core/apply.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { TR, layoutTimeRuler } from '../layout/timeruler.js';
import '../typed/draw.js'; // a typed line's ends (TYPED.lines): a message's arrowheads

/* ---------- the timing diagram, uml.timing (work package 6.5, notes/stage-6.md §7 and §8) ----------
   Lifelines (nodeIds) are lanes stacked down the page, each drawn in the states form (a step line over its `states`, top to
   bottom) or, with present.<id>.as "values", the values form (a band crossed at each change, its value inside). The view's
   `timeline` holds its changes ({ id, lifeline, at, state }, drawn by `at`) and its time and duration constraints; its
   inline uml.Message lines are drawn from the sender's level at sentAt to the receiver's at receivedAt. The geometry is
   src/layout/timeruler.js's; this file measures the view into its input and turns its output into svgOf's geometry: lanes,
   state rows, changes, constraints and the ruler as nodes (a change, a constraint: their own ids; a state row
   `<lifeline>-><state>` and the ruler `->ruler`: geometry ids no element has, notes/stage-5.md §6), messages as lines, steps
   and bands in the type's `under` layer. Then the validators, describe(), the legend, the PDF's rows and the gesture hooks
   of §8, which write a time item by `set` of the view's timeline path. Ships in lib/umlimator-all.js only. */

const TM_ARR = x => (Array.isArray(x) ? x : []), TM_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const TM_HAS = x => x != null && x !== '';
const TM = { name: 12, text: 10.5, lbl: 16, mark: 14 }; // a lane's name, a state's or a value's text; a message's label's and a constraint's height
const TM_SORTS = ['call', 'async', 'reply'];
// the sequence type's ends for these sorts (sequence.js's SQ_END): a call filled, async open, a reply dashed and open
const TM_END = { call: { from: 'none', to: 'arrow' }, async: { from: 'none', to: 'open' }, reply: { from: 'none', to: 'open', dashed: true } };
const TM_KIND = { 'uml.DurationConstraint': 'duration', 'uml.TimeConstraint': 'time' };
const TM_RULER = '->ruler', tmRowId = (lane, state) => `${lane}->${state}`; // geometry ids: no element id holds '->' (model.md rule 5)

const tmView = (model, view) => (TM_OBJ(view) ? view : TM_ARR(model && model.views).find(v => TM_OBJ(v) && v.id === view)) || null;
const tmProps = x => (TM_OBJ(x && x.props) ? x.props : {});
const tmName = n => String(n.label ?? n.id);
const tmHead = n => tmName(n) + (TM_HAS(tmProps(n).represents) ? ' : ' + tmProps(n).represents : ''); // "worker : OrderWorker"
const tmStates = n => [...new Set(TM_ARR(tmProps(n).states).filter(TM_HAS).map(String))]; // a state listed twice is one row
const tmNameType = s => { const [name, ...rest] = s.split(/\s*:\s*/); return [name, rest.join(':').trim()]; }; // `a : B : C` is a, represents B:C
const tmLabel = x => (TM_HAS(x.label) ? String(x.label) : '');
const tmPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;

/* The view read once: its lanes (nodeIds that are nodes), every node by id, the timeline's changes and constraints, its
   messages, the unit, and each lane's form; shown: the constraints drawn (one on a hidden lifeline's change is not, §7.2) */
function tmIndex(model, V) {
  const N = new Map(); [...TM_ARR(V.nodes), ...TM_ARR(model && model.nodes)].forEach(n => { if (TM_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) N.set(n.id, n); });
  const TL = TM_OBJ(V.timeline) ? V.timeline : {}, item = x => TM_OBJ(x) && typeof x.id === 'string';
  const changes = TM_ARR(TL.changes).filter(item), cons = TM_ARR(TL.constraints).filter(item), msgs = TM_ARR(V.edges).filter(e => item(e) && e.type === 'uml.Message');
  const heads = [...new Set(TM_ARR(V.nodeIds))].filter(id => N.has(id) && N.get(id).type === 'uml.Lifeline').map(id => N.get(id)), P = TM_OBJ(V.present) ? V.present : {};
  const unit = TM_HAS(TL.unit) ? String(TL.unit) : null, t = x => `${x}${unit ? ' ' + unit : ''}`;
  const name = id => (N.has(id) ? tmName(N.get(id)) : String(id)), C = new Map(changes.map(c => [c.id, c]));
  const H = new Map(heads.map(n => [n.id, n])), hid = id => C.has(id) && !H.has(C.get(id).lifeline); // a change of a hidden lifeline
  return { N, H, heads, changes, C, cons, shown: cons.filter(c => !hid(c.from) && !hid(c.to)), msgs, unit, t, name, values: id => TM_OBJ(P[id]) && P[id].as === 'values',
    mine: id => changes.filter(c => c.lifeline === id).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)) };
}

/* ---- names (§9): a change's, a message's, a constraint's, said the same in the picture, describe() and the PDF ---- */
const tmSort = m => (TM_SORTS.includes(tmProps(m).sort) ? tmProps(m).sort : 'call');
const tmChangeSaid = (X, c) => `${X.name(c.lifeline)}: ${c.state ?? ''} from ${X.t(c.at)}`;
const tmMsgSaid = (X, m) => { const p = tmProps(m), t = tmLabel(m), s = tmSort(m);
  return `${s[0].toUpperCase() + s.slice(1)}${t ? ' ' + t : ''} from ${X.name(m.from)} at ${X.t(p.sentAt)} to ${X.name(m.to)} at ${X.t(p.receivedAt)}`; };
const tmConSaid = (X, c) => { const a = X.C.get(c.from), b = X.C.get(c.to), t = tmLabel(c);
  if (TM_KIND[c.type] === 'time') return `Time constraint${t ? ' ' + t : ''}${a ? ` on ${X.name(a.lifeline)} at ${X.t(a.at)}` : ''}`;
  const [p, q] = a && b && b.at < a.at ? [b, a] : [a, b];
  return `Duration constraint${t ? ' ' + t : ''}${p && q ? ` on ${X.name(p.lifeline)}${q.lifeline !== p.lifeline ? ` and ${X.name(q.lifeline)}` : ''} from ${X.t(p.at)} to ${X.t(q.at)}` : ''}`; };

/* ---- F2's micro-syntax (§8.1): `text`, `text @ t`, `text @ t1 → t2` (or ->); times are numbers in the view's unit. A
   text whose part after its last @ is not one or two numbers is all text (an address with @ is a name) ---- */
function tmParse(text) {
  const s = String(text ?? '').trim(), m = /^(.*?)\s*@\s*([^@]*)$/.exec(s);
  const ts = m ? m[2].split(/\s*(?:→|->)\s*/).map(x => x.trim()) : [];
  if (!m || ts.length > 2 || ts.some(x => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(x) || !Number.isFinite(Number(x)))) return { text: s, times: [] };
  return { text: m[1].trim(), times: ts.map(Number) };
}
const tmPrint = (text, ...times) => `${text ?? ''}${times.length ? ' @ ' + times.join(' → ') : ''}`;

/* ---- layout: the view as layoutTimeRuler's input (§6.2), measured with textW in the host's measure ---- */
function tmInput(model, V, X = tmIndex(model, V)) {
  const w = (t, px = TM.text) => Math.ceil(textW(String(t ?? ''), px));
  return {
    lanes: X.heads.map(n => { const vals = X.values(n.id);
      return { id: n.id, name: { w: w(tmHead(n), TM.name), h: TM.lbl }, form: vals ? 'values' : 'states', rows: vals ? [] : tmStates(n).map(s => ({ state: s, w: w(s) })),
        changes: X.changes.filter(c => c.lifeline === n.id).map(c => ({ id: c.id, at: c.at, state: String(c.state ?? ''), w: w(c.state) })) }; }),
    messages: X.msgs.map(m => { const t = tmLabel(m), p = tmProps(m);
      return { id: m.id, from: m.from, to: m.to, sentAt: p.sentAt, receivedAt: p.receivedAt, ...(t ? { w: w(t) + 12, h: TM.lbl } : { w: 0, h: 0 }) }; }),
    constraints: X.shown.map(c => { const t = tmLabel(c); return { id: c.id, kind: TM_KIND[c.type] ?? c.type, from: c.from, to: c.to, ...(t ? { w: w(t) + 6, h: TM.mark } : { w: 0, h: 0 }) }; }),
    unit: X.unit,
  };
}

/* run(model, view): svgOf's geometry. Nodes: each lane (the lifeline, its name in the left column), its state rows, its
   changes' hit boxes, the constraints (their marks and labels) and the ruler; edges: the messages; tr: the ruler's output,
   for draw(); slots and problems from it; order (§9): lanes top to bottom, each with its state rows and its changes in time
   order, then messages by sentAt, then constraints, then the ruler */
function tmRun(model, view) {
  const V = tmView(model, view), X = tmIndex(model, V), o = layoutTimeRuler(tmInput(model, V, X)), x0 = o.ruler.x0;
  const nodes = [], order = [];
  o.lanes.forEach(l => { const n = X.N.get(l.id), vals = X.values(l.id), cs = X.mine(l.id);
    nodes.push({ id: l.id, shape: 'tm-lane', type: 'uml.Lifeline', label: tmHead(n), k: 'file', holder: true, x: l.x, y: l.y, w: l.w, h: l.h, nx: l.name.x, ny: l.name.y,
      aria: `${vals ? 'Value lifeline' : 'Lifeline'} ${tmHead(n)}${vals ? '' : `, ${tmPlural(l.rows.length, 'state')}`}, ${tmPlural(cs.length, 'change')}` });
    order.push(l.id);
    l.rows.forEach(r => { const w = Math.ceil(textW(r.state, TM.text)), id = tmRowId(l.id, r.state);
      nodes.push({ id, shape: 'tm-row', label: r.state, k: 'file', x: r2(x0 - TR.pad - w), y: r2(r.y - 8), w, h: 16, aria: `State ${r.state} of ${tmName(n)}` }); order.push(id); }); });
  o.changes.forEach(h => { const c = X.C.get(h.id); nodes.push({ ...h, shape: 'tm-change', label: tmPrint(c.state, c.at), k: 'file', aria: tmChangeSaid(X, c) }); });
  o.lanes.forEach(l => { const at = o.changes.filter(h => X.C.get(h.id).lifeline === l.id).sort((a, b) => a.x - b.x).map(h => h.id); order.splice(order.indexOf(l.id) + 1 + l.rows.length, 0, ...at); });
  const byCon = new Map(X.cons.map(c => [c.id, c]));
  o.marks.forEach(mk => { const c = byCon.get(mk.id), b = mk.lbl.w ? mk.lbl : { x: mk.pts[1][0] - 6, y: mk.pts[1][1] - 6, w: 12, h: 12 }; // a label-less one: round its line's middle
    nodes.push({ id: c.id, shape: 'tm-mark', kind: mk.kind, pts: mk.pts, lbl: mk.lbl, label: tmLabel(c), k: 'file', x: b.x, y: b.y, w: b.w, h: b.h, aria: tmConSaid(X, c) }); });
  const R = o.ruler, rw = Math.max(R.x1 - x0, 1), s = o.scale, M = new Map(X.msgs.map(m => [m.id, m]));
  const last = [...o.changes.map(h => X.C.get(h.id).at), ...o.lines.flatMap(l => [tmProps(M.get(l.id)).sentAt, tmProps(M.get(l.id)).receivedAt])].reduce((a, t) => (tmNum(t) && t > a ? t : a), s.t0); // the span of the times, not the room after
  nodes.push({ id: TM_RULER, shape: 'tm-ruler', label: X.unit ?? '', k: 'file', x: x0, y: R.y, w: rw, h: TR.ruler, ticks: R.ticks, unit: R.unit,
    aria: `Time ruler, ${s.t0} to ${X.t(last)}, a tick every ${X.t(s.step)}` });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = o.lines.map(l => { const m = M.get(l.id), p = tmProps(m), t = tmLabel(m), sort = tmSort(m);
    return { id: m.id, _id: m.id, type: 'uml.Message', from: m.from, to: m.to, s: byId[m.from], t: byId[m.to], pts: l.pts, end: TM_END[sort], sort,
      label: tmPrint(t, p.sentAt, p.receivedAt), ...(t ? { lbl: { ...l.lbl, text: t } } : {}), aria: tmMsgSaid(X, m) }; });
  order.push(...[...edges].sort((a, b) => tmProps(M.get(a.id)).sentAt - tmProps(M.get(b.id)).sentAt).map(e => e.id), ...o.marks.map(mk => mk.id), TM_RULER);
  return { nodes, edges, groups: [], byId, bounds: o.bounds, map: false, order, slots: o.slots, problems: o.problems, tr: o, legend: tmLegend(X, o) };
}

/* draw, under the lines (§7.1): the rules between lanes, then each step line and value band, --um-text at 1.5 px */
function tmDraw(g) {
  const o = g.tr; if (!o) return { under: '', over: '' };
  const L = new Map(o.lanes.map(l => [l.id, l])), path = pts => 'M' + pts.map(p => `${p[0]} ${p[1]}`).join('L');
  const rules = o.lanes.slice(1).map(l => `<path d="M${l.x} ${l.y}H${r2(l.x + l.w)}" stroke="var(--um-muted)" stroke-width="1"/>`).join('');
  const steps = o.steps.map(s => `<path class="tm-step" d="${path(s.pts)}" fill="none" stroke="var(--um-text)" stroke-width="1.5" stroke-linejoin="round"/>`).join('');
  const bands = o.bands.map(b => { const l = L.get(b.lane), m = r2(l.y + l.h / 2), up = r2(m - TR.band / 2), dn = r2(m + TR.band / 2);
    return b.segs.map(s => { const c = Math.min(4, (s.x1 - s.x0) / 2), a = r2(s.x0 + c), z = r2(s.x1 - c); // the edges cross over 8 px at each change
      return `<path class="tm-band" d="M${s.x0} ${m}L${a} ${up}H${z}L${s.x1} ${m}L${z} ${dn}H${a}Z" fill="none" stroke="var(--um-text)" stroke-width="1.5" stroke-linejoin="round"/>`
        + (s.text != null ? `<text x="${r2((s.x0 + s.x1) / 2)}" y="${r2(m + 4)}" text-anchor="middle" class="tm-value" fill="var(--um-text)" style="font:500 ${TM.text}px var(--um-sans)">${esc(fit(s.text, TM.text, Math.min(TR.cut, s.x1 - s.x0 - TR.room)))}</text>` : ''); }).join(''); }).join('');
  return { under: `<g class="tm-under">${rules}${steps}${bands}</g>`, over: '' };
}

/* the shapes, each a node the canvas selects, names and focuses (§6.7) */
const tmNode = (n, shape, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || n.id)}">${inner}</g>`;
const tmText = (x, y, t, px, w = 500, a = 'start', cls = '') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${a}"${cls ? ` class="${cls}"` : ''} fill="var(--um-text)" style="font:${w} ${px}px var(--um-sans)">${esc(t)}</text>`;
SHAPE['tm-lane'] = { draw: n => tmNode(n, 'tm-lane', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="n-body" fill="transparent"/>${tmText(n.nx, n.ny + 12, fit(n.label, TM.name, TR.cut), TM.name, 600, 'start', 'c-name')}`) };
SHAPE['tm-row'] = { draw: n => tmNode(n, 'tm-row', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="transparent"/>${tmText(n.x + n.w, n.y + 12, n.label, TM.text, 500, 'end')}`) };
SHAPE['tm-change'] = { draw: n => tmNode(n, 'tm-change', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="n-body" fill="transparent"/>`) };
SHAPE['tm-mark'] = {
  draw(n) { const P = n.pts, d = n.kind === 'time' ? `M${P[0][0]} ${P[0][1]}V${P[1][1]}` : `M${P[0][0]} ${P[0][1]}V${P[1][1]}M${P[2][0]} ${P[2][1]}V${P[3][1]}`;
    const arrows = n.kind === 'time' ? '' : (() => { const [b, c] = [P[1], P[2]], k = Math.sign(c[0] - b[0]) || 1, y = b[1], tip = (x, s) => `M${r2(x + 7 * s)} ${r2(y - 3.5)}L${x} ${y}L${r2(x + 7 * s)} ${r2(y + 3.5)}`;
      return `<path d="M${b[0]} ${y}H${c[0]}${tip(b[0], k)}${tip(c[0], -k)}" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/>`; })();
    return tmNode(n, 'tm-mark', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="transparent"/><path d="${d}" stroke="var(--um-muted)" stroke-width="${n.kind === 'time' ? 1.5 : 0.8}"/>${arrows}`
      + (n.label ? tmText(n.lbl.x + (n.kind === 'time' ? 0 : n.lbl.w / 2), n.lbl.y + 11, n.label, TM.text, 500, n.kind === 'time' ? 'start' : 'middle') : '')); },
};
SHAPE['tm-ruler'] = {
  draw(n) { const y = n.y, ticks = TM_ARR(n.ticks), last = ticks.filter(t => t.major).pop();
    const d = `M${n.x} ${y}H${r2(n.x + n.w)}` + ticks.map(t => `M${t.x} ${y}v${t.major ? TR.mark : 3}`).join('');
    const labels = ticks.filter(t => t.major).map(t => tmText(t.x, y + 18, t.label, TR.font, 500, 'middle')).join('');
    const unit = n.unit && last ? tmText(last.x + textW(last.label, TR.font) / 2 + 4, y + 18, n.unit, TR.font, 500) : '';
    return tmNode(n, 'tm-ruler', `<rect x="${n.x}" y="${y}" width="${n.w}" height="${n.h}" fill="transparent"/><path d="${d}" stroke="var(--um-muted)" stroke-width="1"/>${labels}${unit}`); },
};

/* the legend (pieces.js shows it): each sort of message, each kind of constraint and each lane form the view draws */
const TM_WORDS = { call: ['Call', 'the sender waits for it'], async: ['Async', 'the sender goes on'], reply: ['Reply', 'the answer to a call'] };
const tmKey = (name, says, svg) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" fill="none" stroke-linejoin="round">${svg}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
function tmLegend(X, o) {
  const sorts = new Set(o.lines.map(l => tmSort(X.msgs.find(m => m.id === l.id)))), kinds = new Set(o.marks.map(m => m.kind)), forms = new Set(o.lanes.map(l => (X.values(l.id) ? 'values' : 'states')));
  return [...TM_SORTS.filter(s => sorts.has(s)).map(s => tmKey(...TM_WORDS[s], `<path d="M2 8H17"${TM_END[s].dashed ? ' stroke-dasharray="3 2"' : ''}/>${s === 'call' ? '<path d="M17 4L26 8L17 12Z" fill="var(--um-muted)"/>' : '<path d="M17 4L26 8L17 12"/>'}`)),
    ...(kinds.has('duration') ? [tmKey('Duration constraint', 'how long may pass between two changes', '<path d="M2 4V12M26 4V12M2 8H26M8 5L2 8L8 11M20 5L26 8L20 11"/>')] : []),
    ...(kinds.has('time') ? [tmKey('Time constraint', 'when a change may happen', '<path d="M8 4V12"/>')] : []),
    ...(forms.has('states') ? [tmKey('States', 'the lifeline steps between its states', '<path d="M2 12H10V4H18V12H26" stroke="var(--um-text)"/>')] : []),
    ...(forms.has('values') ? [tmKey('Values', 'the lifeline\'s value between changes', '<path d="M2 8L5 3H12L15 8L18 3H26M2 8L5 13H12L15 8L18 13H26" stroke="var(--um-text)"/>')] : [])];
}

/* ---- validators (§7.2). Each problem: { level, rule, path, message, ids } ---- */
const TM_RULES = {
  'change-lifeline': 'a change names a lifeline of the model',
  'change-time': 'a change\'s at, and a message\'s sentAt and receivedAt, are numbers',
  'change-state': 'in the states form, a change\'s state is one of its lifeline\'s states (else it is drawn on an extra row)',
  'change-instant': 'one lifeline has one change at an instant (of two, the one whose id sorts last is drawn)',
  'message-ends': 'a message joins one or two lifelines of the view',
  'message-times': 'a message is received no earlier than it is sent',
  sort: 'a timing message\'s sort is call, async or reply; any other is drawn as a call',
  'reply-call': 'a reply names in replyTo a call of the view going the other way, sent no later',
  'constraint-ends': 'a duration constraint\'s from and to are changes of the view; a time constraint has a from and no to',
  'constraint-order': 'a duration constraint\'s to is no earlier than its from',
};
const tmNum = x => typeof x === 'number' && Number.isFinite(x);
function tmProblems(model, view) {
  const out = [], V = tmView(model, view); if (!TM_OBJ(model) || !V) return out;
  const vi = TM_ARR(model.views).indexOf(V), at = `views[${vi}]`, X = tmIndex(model, V), TL = TM_OBJ(V.timeline) ? V.timeline : {};
  const say = (rule, path, who, msg, level = 'error') => out.push({ level, rule, path, ids: who.filter(x => x != null), message: `${rule}: ${msg}` });
  const cPath = c => `${at}.timeline.changes[${TM_ARR(TL.changes).indexOf(c)}]`, kPath = c => `${at}.timeline.constraints[${TM_ARR(TL.constraints).indexOf(c)}]`, ePath = m => `${at}.edges[${TM_ARR(V.edges).indexOf(m)}]`;
  const seen = new Map();
  X.changes.forEach(c => { const n = X.N.get(c.lifeline);
    if (!n || n.type !== 'uml.Lifeline') return say('change-lifeline', cPath(c) + '.lifeline', [c.id], `change ${c.id} names ${JSON.stringify(c.lifeline)}, which is not a lifeline of the model`);
    if (!tmNum(c.at)) return say('change-time', cPath(c) + '.at', [c.id], `change ${c.id}'s time ${JSON.stringify(c.at)} is not a number`);
    if (!X.H.has(c.lifeline)) return; // a hidden lifeline keeps its changes, not drawn and not warned (§7.2)
    if (!X.values(c.lifeline) && !tmStates(n).includes(String(c.state ?? ''))) say('change-state', cPath(c) + '.state', [c.id, c.lifeline], `change ${c.id}'s state ${JSON.stringify(c.state)} is not one of ${tmName(n)}'s states: drawn on an extra row`, 'warning');
    const k = `${c.lifeline} ${c.at}`; if (!seen.has(k)) seen.set(k, [n]); seen.get(k).push(c); });
  seen.forEach(([n, ...cs]) => { const ids = cs.map(c => c.id); // one warning an instant, naming all its changes and the one drawn
    if (cs.length > 1) say('change-instant', cPath(cs[1]) + '.at', ids, `${tmName(n)} changes ${cs.length > 2 ? cs.length + ' times' : 'twice'} at ${X.t(cs[0].at)} (${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}): only ${[...ids].sort().pop()} is drawn`, 'warning'); });
  X.msgs.forEach(m => { const p = tmProps(m), off = [m.from, m.to].filter(id => !X.H.has(id));
    if (off.length) say('message-ends', ePath(m), [m.id, ...off], `${m.id} runs from ${m.from} to ${m.to}, and ${[...new Set(off)].join(' and ')} ${new Set(off).size > 1 ? 'are not lifelines' : 'is not a lifeline'} of view ${V.id}`);
    if (!tmNum(p.sentAt) || !tmNum(p.receivedAt)) say('change-time', ePath(m) + '.props', [m.id], `message ${m.id}'s sentAt and receivedAt are not both numbers`);
    else if (p.receivedAt < p.sentAt) say('message-times', ePath(m) + '.props.receivedAt', [m.id], `${m.id} is received at ${X.t(p.receivedAt)}, before it is sent at ${X.t(p.sentAt)}`);
    if (!TM_SORTS.includes(p.sort)) say('sort', ePath(m) + '.props.sort', [m.id], `${m.id} has ${p.sort === undefined ? 'no sort' : `sort ${JSON.stringify(p.sort)}`}, not one of ${TM_SORTS.join(', ')}: it is drawn as a call`, 'warning');
    else if (p.sort === 'reply') { const c = X.msgs.find(x => x.id === p.replyTo);
      if (!c || tmSort(c) !== 'call' || c.from !== m.to || c.to !== m.from || !(tmProps(c).sentAt <= p.sentAt)) say('reply-call', ePath(m) + '.props.replyTo', [m.id, c && c.id], `${m.id} answers ${JSON.stringify(p.replyTo)}, which is not a call of this view from ${m.to} to ${m.from} sent no later`); } });
  X.cons.forEach(c => { const kind = TM_KIND[c.type], a = X.C.get(c.from), b = X.C.get(c.to);
    if (!kind || (kind === 'time' ? !a || c.to != null : !a || !b)) return say('constraint-ends', kPath(c), [c.id], kind === 'time' ? `time constraint ${c.id} needs a change of the view in from, and no to` : kind ? `duration constraint ${c.id} needs two changes of the view in from and to` : `${c.id} is a ${JSON.stringify(c.type)}, not a duration or time constraint`);
    if (kind === 'duration' && tmNum(a.at) && tmNum(b.at) && b.at < a.at) say('constraint-order', kPath(c) + '.to', [c.id, c.from, c.to], `${c.id} runs from ${X.t(a.at)} back to ${X.t(b.at)}`, 'warning'); });
  return out;
}

/* ---- describe(): the view in words, lanes top to bottom, then messages in time order, then constraints ---- */
function tmDescribe(model, viewId) {
  const V = TM_ARR(model && model.views).find(x => TM_OBJ(x) && x.id === viewId); if (!V) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const X = tmIndex(model, V), shown = X.changes.filter(c => X.H.has(c.lifeline));
  const out = [`${V.title || V.id}: a timing diagram of ${tmPlural(X.heads.length, 'lifeline')}, ${tmPlural(shown.length, 'change')}, ${tmPlural(X.msgs.length, 'message')} and ${tmPlural(X.shown.length, 'constraint')}${X.unit ? `, in ${X.unit}` : ''}.`];
  X.heads.forEach(n => { const cs = X.mine(n.id); out.push(`${tmHead(n)}${X.values(n.id) ? ' (values)' : ''}: ${cs.length ? cs.map(c => `${c.state ?? ''} from ${X.t(c.at)}`).join('; ') : 'no change'}.`); });
  [...X.msgs].sort((a, b) => tmProps(a).sentAt - tmProps(b).sentAt).forEach(m => out.push(tmMsgSaid(X, m) + '.'));
  X.shown.forEach(c => out.push(tmConSaid(X, c) + '.'));
  return out.join('\n');
}

/* the PDF's rows (4.9, §9): a lifeline's changes in time order, the messages it sends, the constraints on its changes */
function tmRows(model, view, id) {
  const V = tmView(model, view); if (!V) return null; const X = tmIndex(model, V); if (!X.H.has(id)) return null;
  const mine = X.mine(id), ids = new Set(mine.map(c => c.id));
  return [...mine.map(c => `${X.t(c.at)}: ${c.state ?? ''}`),
    ...X.msgs.filter(m => m.from === id).map(m => { const p = tmProps(m); return `${tmLabel(m) || tmSort(m)} to ${X.name(m.to)} at ${X.t(p.sentAt)} → ${X.t(p.receivedAt)}`; }),
    ...X.shown.filter(c => ids.has(c.from) || ids.has(c.to)).map(c => tmConSaid(X, c))];
}

/* ---- the gesture hooks (§8.1). Each takes the model and the view (or its id) and returns the commands of one transaction,
   { commands, say }, null to leave the gesture to the canvas's default, or { error } for the hint line. A transaction that
   would add an error the model did not have, or a change on another's instant, is never returned: { error } names the rule ---- */
function tmNewId(model, base) { // the base and the first number free in the model, time items and members included
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el'; let k = 1; while (used.has(b + k)) k++; return b + k;
}
const tmErr = error => ({ error });
const tmKeyOf = p => `${p.rule}|${[...p.ids].sort().join()}`, tmBad = p => p.level === 'error' || p.rule === 'change-instant'; // a change put on another's instant would not be drawn
function tmGuard(model, V, commands) {
  if (!Array.isArray(commands) || !commands.length) return commands;
  let next; try { next = apply(model, commands); } catch (x) { return tmErr(String(x && x.message || x)); }
  const was = new Set(tmProblems(model, V).filter(tmBad).map(tmKeyOf));
  const bad = tmProblems(next, tmView(next, V.id)).find(p => tmBad(p) && !was.has(tmKeyOf(p)));
  return bad ? tmErr(bad.message) : commands;
}
// a new time item, by set of the whole list (the core's add would put it in nodes or edges, §8.1), its id unused in the model
function tmPut(model, V, list, item) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  if (used.has(item.id)) return tmErr(`id ${item.id} is used already`);
  return { op: 'set', view: V.id, path: ['timeline', list], value: [...TM_ARR(TM_OBJ(V.timeline) && V.timeline[list]), item] };
}
// the minor tick (a fifth of the ruler's step) and the next one before or after t
const tmMinor = (model, V) => layoutTimeRuler(tmInput(model, V)).scale.step / 5;
const tmSnap = (t, minor, dir) => Number(((dir > 0 ? Math.floor(t / minor + 1e-9) + 1 : Math.ceil(t / minor - 1e-9) - 1) * minor).toPrecision(12));
// a state to put a change in: in the states form, one not listed is added to the lifeline's states in the same transaction
function tmState(X, lane, state) {
  const n = X.N.get(lane), have = tmStates(n);
  if (X.values(lane) || have.includes(state)) return { cmds: [], said: null };
  return { cmds: [{ op: 'set', id: lane, path: 'props.states', value: [...have, state] }], said: `added state ${state} to ${tmName(n)}` };
}
const tmSaid = (r, say) => (Array.isArray(r) && say ? { commands: r, say } : r);

/* add(model, view, entry, label, at): a lifeline (name, or `name : Type`) at the end of nodeIds; a change (its state or
   value typed) after the change selected, a minor tick on, else on the lifeline selected at the ruler's start, else at the
   slot `at` (its lane and t), moved on a minor tick at a time past its lifeline's changes; a time constraint on the change
   selected */
function tmAdd(model, view, entry, label, at) {
  const V = tmView(model, view), type = TM_OBJ(entry) ? entry.type : null; if (!V) return null;
  const X = tmIndex(model, V), text = String(label ?? '').trim(), sel = TM_ARR(TM_OBJ(at) && at.sel);
  const change = [...sel].reverse().map(id => X.C.get(id)).find(Boolean), lane = [...sel].reverse().find(id => X.H.has(id));
  if (type === 'uml.Lifeline') { const [name, rep] = tmNameType(text);
    const element = { id: tmNewId(model, name || 'lifeline'), type, ...(name ? { label: name } : {}), ...(TM_HAS(rep) ? { props: { represents: rep } } : {}) };
    return tmGuard(model, V, [{ op: 'add', element, view: V.id }]); }
  if (type === 'uml.StateInvariant') {
    if (!text) return tmErr('a change needs its state: type it');
    const minor = tmMinor(model, V), where = change && X.H.has(change.lifeline) ? { lane: change.lifeline, t: tmSnap(change.at, minor, 1) }
      : lane ? { lane, t: layoutTimeRuler(tmInput(model, V, X)).scale.t0 } : TM_OBJ(at) && X.H.has(at.parent) && Number.isFinite(at.t) ? { lane: at.parent, t: at.t } : null;
    if (!where) return tmErr('select a lifeline or a change first');
    const taken = new Set(X.changes.filter(c => c.lifeline === where.lane).map(c => c.at)); while (taken.has(where.t)) where.t = tmSnap(where.t, minor, 1); // the first free minor tick
    const s = tmState(X, where.lane, text), put = tmPut(model, V, 'changes', { id: tmNewId(model, 'change'), lifeline: where.lane, at: where.t, state: text }); if (put.error) return put;
    return tmSaid(tmGuard(model, V, [...s.cmds, put]), s.said && `Added the change; ${s.said}`); }
  if (type === 'uml.TimeConstraint') {
    if (!change) return tmErr('select the change a time constraint is on first');
    const put = tmPut(model, V, 'constraints', { id: tmNewId(model, 'time'), type, from: change.id, ...(text ? { label: text } : {}) }); if (put.error) return put;
    return tmGuard(model, V, [put]); }
  return null;
}

/* connect(model, view, from, to, at, line): a message between two lifelines at the slot's t (sent and received then), from
   one change's time to another's, or from a change to a lifeline at the change's time; a duration constraint between two
   changes, in time order. A reply answers the latest call back along it sent no later */
function tmConnect(model, view, from, to, at, line) {
  const V = tmView(model, view); if (!V) return null;
  const X = tmIndex(model, V), type = (line && line.type) || 'uml.Message', t0 = TM_OBJ(at) && Number.isFinite(at.t) ? at.t : 0;
  const end = id => (X.C.has(id) ? { lane: X.C.get(id).lifeline, t: X.C.get(id).at, c: X.C.get(id) } : X.H.has(id) ? { lane: id, t: t0 } : null), a = end(from), b = end(to);
  if (type === 'uml.DurationConstraint') {
    if (!a || !b || !a.c || !b.c || a.c === b.c) return tmErr('a duration constraint joins two changes: draw it from one change to another');
    const [p, q] = b.c.at < a.c.at ? [b.c, a.c] : [a.c, b.c], put = tmPut(model, V, 'constraints', { id: tmNewId(model, 'duration'), type, from: p.id, to: q.id }); if (put.error) return put;
    return tmGuard(model, V, [put]); }
  if (!a || !b) return tmErr('a message joins two lifelines of the view, or two changes on them');
  const props = { ...(TM_OBJ(line && line.props) ? structuredClone(line.props) : {}) }, sort = TM_SORTS.includes(props.sort) ? props.sort : (props.sort = 'call');
  Object.assign(props, { sentAt: a.t, receivedAt: b.t });
  if (sort === 'reply') { const c = X.msgs.filter(m => tmSort(m) === 'call' && m.from === b.lane && m.to === a.lane && tmProps(m).sentAt <= a.t).sort((p, q) => tmProps(q).sentAt - tmProps(p).sentAt)[0];
    if (c) props.replyTo = c.id; }
  return tmGuard(model, V, [{ op: 'add', element: { id: tmNewId(model, 'm'), type: 'uml.Message', from: a.lane, to: b.lane, props }, view: V.id, in: 'view' }]);
}

/* moveTo(model, view, id, at): a change dropped (at a slot: its t) or Alt + Left/Right (one minor tick), Alt + Up/Down on a
   states-form change (the state above or below); a message dropped (both times by the drop's t less its sentAt) or Alt +
   Left/Right (both by a minor tick); a lifeline Alt + Up/Down (its place in nodeIds). Anything else: null */
function tmMoveTo(model, view, id, at) {
  const V = tmView(model, view); if (!V || !TM_OBJ(at)) return null;
  const X = tmIndex(model, V), by = Array.isArray(at.by) ? at.by : null, c = X.C.get(id), m = X.msgs.find(x => x.id === id);
  if (X.H.has(id)) { if (!by || by[0] || !by[1]) return null; const ids = TM_ARR(V.nodeIds), i = ids.indexOf(id), j = i + Math.sign(by[1]);
    return j < 0 || j >= ids.length ? [] : [{ op: 'move', id, view: V.id, index: j }]; }
  if (c) {
    if (by && by[1] && !by[0]) { const n = X.N.get(c.lifeline); if (!n || X.values(c.lifeline)) return [];
      const ss = tmStates(n), i = ss.indexOf(String(c.state)), k = (i < 0 ? ss.length : i) + Math.sign(by[1]); // an unlisted state: the extra row below
      return k < 0 || k >= ss.length ? [] : tmGuard(model, V, [{ op: 'set', id, path: 'state', value: ss[k] }]); }
    const t = by ? (by[0] ? tmSnap(c.at, tmMinor(model, V), by[0]) : null) : Number.isFinite(at.t) ? at.t : null;
    return t == null ? null : t === c.at ? [] : tmGuard(model, V, [{ op: 'set', id, path: 'at', value: t }]); }
  if (m) { const p = tmProps(m), d = by ? (by[0] && !by[1] ? Math.sign(by[0]) * tmMinor(model, V) : 0) : Number.isFinite(at.t) ? at.t - p.sentAt : null;
    if (d == null) return null; if (!d) return [];
    const nice = x => Number((x + d).toPrecision(12));
    return tmGuard(model, V, [{ op: 'set', id, path: 'props.sentAt', value: nice(p.sentAt) }, { op: 'set', id, path: 'props.receivedAt', value: nice(p.receivedAt) }]); }
  return null;
}

/* rename(model, view, id, text): F2. A change: `state` or `state @ t`; a message: `label`, `label @ t` or `label @ t1 → t2`;
   a constraint: its label; a lifeline: `name` or `name : Type`; a state's row: the state's name, in states and in every
   change of that lifeline in it; the ruler: the timeline's unit (empty removes it) */
function tmRename(model, view, id, text) {
  const V = tmView(model, view); if (!V) return null;
  const X = tmIndex(model, V), s = String(text ?? '').trim();
  if (id === TM_RULER) return [{ op: 'set', view: V.id, path: ['timeline', 'unit'], value: s || undefined }];
  const c = X.C.get(id);
  if (c) { const r = tmParse(s); if (r.times.length > 1) return tmErr('a change has one time: state @ t'); if (!r.text) return tmErr('a change needs its state');
    const st = X.H.has(c.lifeline) ? tmState(X, c.lifeline, r.text) : { cmds: [], said: null };
    return tmSaid(tmGuard(model, V, [...st.cmds, { op: 'set', id, path: 'state', value: r.text }, ...(r.times.length ? [{ op: 'set', id, path: 'at', value: r.times[0] }] : [])]), st.said && `Renamed the change; ${st.said}`); }
  const m = X.msgs.find(x => x.id === id);
  if (m) { const r = tmParse(s), [t1, t2] = r.times.length === 1 ? [r.times[0], r.times[0]] : r.times;
    return tmGuard(model, V, [{ op: 'set', id, path: 'label', value: r.text || undefined }, ...(r.times.length ? [{ op: 'set', id, path: 'props.sentAt', value: t1 }, { op: 'set', id, path: 'props.receivedAt', value: t2 }] : [])]); }
  if (X.cons.some(k => k.id === id)) return [{ op: 'set', id, path: 'label', value: s || undefined }];
  if (X.H.has(id)) { const [name, rep] = tmNameType(s);
    if (!name) return tmErr('a lifeline needs a name');
    return [{ op: 'set', id, path: 'label', value: name }, ...(s.includes(':') ? [{ op: 'set', id, path: 'props.represents', value: rep || undefined }] : [])]; }
  const k = String(id).indexOf('->'), lane = k > 0 ? String(id).slice(0, k) : null, was = k > 0 ? String(id).slice(k + 2) : null;
  if (lane && X.H.has(lane)) { const ss = tmStates(X.N.get(lane));
    if (!ss.includes(was)) return tmErr(`${was} is not one of ${X.name(lane)}'s listed states: add it to its states first`);
    if (!s) return tmErr('a state needs a name'); if (s !== was && ss.includes(s)) return tmErr(`${X.name(lane)} has a state ${s} already`);
    return [{ op: 'set', id: lane, path: 'props.states', value: ss.map(x => (x === was ? s : x)) }, ...X.changes.filter(x => x.lifeline === lane && String(x.state) === was).map(x => ({ op: 'set', id: x.id, path: 'state', value: s }))]; }
  return null;
}

/* remove(model, view, ids, fromModel): a change, a message or a constraint cannot be hidden (S17): Delete deletes it, and says
   so. Delete on a lifeline hides it (its changes stay in the timeline, not drawn; its messages go with it, said with their
   count, decision 23); Shift + Delete deletes it, its changes and their constraints (the core's cascade). A state's row or
   the ruler is not deleted on its own */
function tmRemove(model, view, ids, fromModel) {
  const V = tmView(model, view); if (!V) return null;
  const X = tmIndex(model, V), out = [], gone = { lane: [] };
  for (const id of new Set(TM_ARR(ids))) {
    if (id === TM_RULER || String(id).includes('->')) return tmErr('a state\'s row and the ruler go with their lifeline or view: rename a state with F2, or edit the lifeline\'s states');
    if (X.H.has(id)) { gone.lane.push(id); out.push(fromModel || TM_ARR(V.nodes).some(n => TM_OBJ(n) && n.id === id) ? { op: 'delete', id } : { op: 'hide', id, view: V.id }); continue; }
    if (X.C.has(id) || X.msgs.some(m => m.id === id) || X.cons.some(c => c.id === id)) { out.push({ op: 'delete', id }); continue; }
    return null;
  }
  const r = tmGuard(model, V, out); if (!Array.isArray(r) || !r.length) return r;
  // what goes, read off the model after: the core's cascade takes a call's reply and a change's constraints too
  const next = apply(model, r), Y = tmIndex(next, tmView(next, V.id)), left = new Set([...Y.changes, ...Y.msgs, ...Y.cons].map(x => x.id));
  const lanes = new Set(gone.lane), theirs = new Set(X.msgs.filter(m => lanes.has(m.from) || lanes.has(m.to)).map(m => m.id)), n = theirs.size;
  const k = X.changes.filter(c => lanes.has(c.lifeline) && left.has(c.id)).length;
  const list = (skip = new Set()) => [[X.changes, 'change'], [X.msgs, 'message'], [X.cons, 'constraint']].map(([xs, w]) => [xs.filter(x => !left.has(x.id) && !skip.has(x.id)).length, w])
    .filter(([c]) => c).map(([c, w]) => tmPlural(c, w)).join(', ').replace(/, ([^,]*)$/, ' and $1'); // "1 change, 2 messages and 1 constraint"
  const who = gone.lane.map(X.name).join(', '), one = gone.lane.length === 1, msgs = n ? tmPlural(n, 'message') : 'no message', more = list(theirs), all = list();
  const say = gone.lane.length ? (fromModel ? `Deleted ${who}${all ? ', ' + all : ''}` : `Hid ${who}; deleted ${one ? 'its' : 'their'} ${msgs}${more ? `, and ${more}` : ''}; ${one ? 'its' : 'their'} ${k === 1 ? 'change stays' : 'changes stay'} in the timeline`)
    : `Deleted ${all}: a change, a message or a constraint is deleted, not hidden`;
  return { commands: r, say };
}

/* key(model, view, ids, key): S on a lifeline turns its values form on or off (present.<id>.as); any other key: null */
function tmKeyHook(model, view, ids, key) {
  const V = tmView(model, view); if (!V || (key !== 's' && key !== 'S')) return null;
  const X = tmIndex(model, V), ls = TM_ARR(ids).filter(id => X.H.has(id)); if (!ls.length) return null;
  const as = id => (X.values(id) ? undefined : 'values');
  if (!ls.some(id => ['__proto__', 'constructor', 'prototype'].includes(id))) return ls.map(id => ({ op: 'set', view: V.id, path: ['present', id, 'as'], value: as(id) }));
  // an id no path of set may hold (core/apply.js UNSAFE): the whole present, each entry an own key
  const P = TM_OBJ(V.present) ? V.present : {};
  return [{ op: 'set', view: V.id, path: ['present'], value: ls.reduce((v, id) => { const e = { ...(Object.hasOwn(P, id) && TM_OBJ(P[id]) ? P[id] : {}), as: as(id) }; if (!e.as) delete e.as; return { ...v, [id]: e }; }, { ...P }) }];
}

/* ---- the type ---- */
const TM_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const TM_TYPE = registerDiagramType('uml.timing', {
  title: 'timing diagram',
  elements: [{ type: 'uml.Lifeline', label: 'Lifeline' }, { type: 'uml.StateInvariant', label: 'Change' }, { type: 'uml.TimeConstraint', label: 'Time constraint' }],
  lines: [...TM_SORTS.map(sort => ({ type: 'uml.Message', label: TM_WORDS[sort][0], props: { sort } })), { type: 'uml.DurationConstraint', label: 'Duration constraint' }],
  refs: { 'uml.Message': { 'props.replyTo': 'cascade' } },
  props: {
    'uml.Lifeline': [{ key: 'represents', label: 'Represents', kind: 'text' }, { key: 'states', label: 'States', kind: 'list' }, TM_STEREO],
    'uml.Message': [{ key: 'sort', label: 'Sort', kind: 'enum', options: TM_SORTS }, { key: 'replyTo', label: 'Reply to', kind: 'text' }],
  },
  layout: { run: tmRun, pins: false },
  draw: tmDraw,
  validate: tmProblems,
  rules: TM_RULES,
  describe: tmDescribe,
  rows: tmRows,
  edits: { connect: tmConnect, moveTo: tmMoveTo, add: tmAdd, remove: tmRemove, rename: tmRename, key: tmKeyHook },
});

export { TM_TYPE, TM_RULES, TM_RULER, tmRowId, tmInput, tmRun, tmDraw, tmProblems, tmDescribe, tmRows, tmParse, tmPrint, tmAdd, tmConnect, tmMoveTo, tmRename, tmRemove, tmKeyHook };
