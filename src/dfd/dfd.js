import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, portsOn, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import '../uml/class.js'; // SHAPE.note, a comment's look
import { flowWrap } from '../uml/flow.js';
import '../uml/usecase.js'; // SHAPE.ellipse, Yourdon's process

/* ---------- the data flow diagram, dfd (work package M2.4, notes/milestone-2.md §4.3, §6.1, §6.4, §7.3) ----------
   Processes, data stores and external entities, joined by data flows; comments. Two skins on one geometry (§4.3): each
   node is sized for the larger of its Yourdon and its Gane and Sarson look, and its shape's name carries the skin
   (dfd-process-yourdon), so a change of view.notation repaints and lays nothing out (`shape` is no geometry, `notation`
   no view geometry). Numbers are stored (props.number) and checked under their parent process's; a process that opens a
   level (opensView, a dfd view whose parent is the view the process is on) balances against it (§6.4). D on a selected
   process that opens no view makes its level, balanced from the start (§6.1). Laid out by layoutTyped from the host's
   ranking, repair and reroute off (S19). Ships in lib/umlimator-all.js only. */

const DFD_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), DFD_ARR = x => (Array.isArray(x) ? x : []);
const DFD_HAS = x => x != null && String(x).trim() !== '';
const dfdNum = x => (DFD_OBJ(x && x.props) && DFD_HAS(x.props.number) ? String(x.props.number).trim() : '');
const dfdPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const DFD_LINES = ['dfd.DataFlow', 'uml.CommentLink'];
const DFD_KIND = { 'dfd.Process': 'process', 'dfd.DataStore': 'store', 'dfd.ExternalEntity': 'entity' };
const DFD_WORD = { 'dfd.Process': 'Process', 'dfd.DataStore': 'Data store', 'dfd.ExternalEntity': 'External entity', 'uml.Comment': 'Comment' };
const dfdSkin = view => (view && view.notation === 'gane-sarson' ? 'gane-sarson' : 'yourdon');

/* ---- the shapes (§4.3): one size for both skins; each draws its number and name inside its box ---- */
const DF = { px: 12, lh: 16, nmax: 160, num: 11, numh: 14, pad: 10, k: 1.42, band: 22, shadow: 4, minW: 96 };
const dfdName = (t, k) => flowWrap(t, DF.px, DF.nmax, k);
const dfdTextW = ls => Math.max(0, ...ls.map(l => textW(l, DF.px)));
const dfdText = (x, y, t, px, wt, fill, max, cls, anchor = 'middle', more = '') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" class="${cls}" fill="${fill}"${more} style="font:${wt} ${px}px var(--um-sans)">${esc(fit(t, px, max))}</text>`;
const dfdNode = (n, kind, inner) => `<g class="node dfd-${kind}" data-id="${esc(n.id)}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || '')}">${inner}</g>`;
const dfdBody = (d, c, f) => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${f}" stroke="${c}"/>`;
const dfdRect = (x, y, w, h) => `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
const dfdSquare = { out: (n, d = 0) => dfdRect(n.x - d, n.y - d, n.w + 2 * d, n.h + 2 * d), inset: () => 0 };
// name lines centred in the band [y0, y1] of the box, the first with data-o (F2's field goes over it)
const dfdNameSvg = (n, ls, cx, y0, y1, max) => { const y = (y0 + y1) / 2 - ls.length * DF.lh / 2;
  return ls.map((l, i) => dfdText(cx, y + i * DF.lh + 12, l, DF.px, 600, 'var(--um-text)', max, 'c-name', 'middle', i ? '' : ` data-o="${esc(n.id)}"`)).join(''); };

// a process: Yourdon's ellipse round its number over its name (the text block 1.42 times, so its corners fit inside it), or
// Gane and Sarson's rounded rectangle with the number in a band across its top
const dfdProcParts = n => { const num = String(n.number ?? ''), ls = dfdName(n.label, 3), tw = Math.max(dfdTextW(ls), num ? textW(num, DF.num) : 0), th = (num ? DF.numh : 0) + ls.length * DF.lh;
  return { num, ls, w: Math.ceil(Math.max(DF.minW, tw * DF.k + 16, tw + 2 * DF.pad)), h: Math.ceil(Math.max(56, th * DF.k + 12, DF.band + ls.length * DF.lh + 2 * DF.pad)) }; };
const dfdProcess = skin => ({
  size: n => { const p = dfdProcParts(n); return { w: p.w, h: p.h }; },
  ...(skin === 'yourdon' ? { out: SHAPE.ellipse.out, inset: SHAPE.ellipse.inset } : { out: SHAPE.box.out, inset: SHAPE.box.inset }),
  draw(n, c, f) {
    const { num, ls } = dfdProcParts(n), cx = n.x + n.w / 2;
    if (skin === 'yourdon') { const max = (n.w - 16) / DF.k, y0 = n.y + n.h / 2 - ((num ? DF.numh : 0) + ls.length * DF.lh) / 2;
      return dfdNode(n, 'process', dfdBody(SHAPE.ellipse.out(n), c, f) + (num ? dfdText(cx, y0 + 10.5, num, DF.num, 500, 'var(--um-muted)', max, 'c-st') : '')
        + dfdNameSvg(n, ls, cx, y0 + (num ? DF.numh : 0), n.y + n.h / 2 + ((num ? DF.numh : 0) + ls.length * DF.lh) / 2, max)); }
    const max = n.w - 2 * DF.pad;
    return dfdNode(n, 'process', dfdBody(SHAPE.box.out(n), c, f) + `<path d="M${r2(n.x)} ${r2(n.y + DF.band)}H${r2(n.x + n.w)}" class="n-det" stroke="${c}"/>`
      + (num ? dfdText(cx, n.y + 15, num, DF.num, 500, 'var(--um-muted)', max, 'c-st') : '') + dfdNameSvg(n, ls, cx, n.y + DF.band, n.y + n.h, max));
  },
});
// a data store: Yourdon's two lines with the number before the name, or Gane and Sarson's rectangle open on the right,
// its number in an id box on the left
const dfdStoreParts = n => { const num = String(n.number ?? ''), ls = dfdName(n.label, 2), nw = num ? textW(num, DF.num) : 0, ib = Math.max(28, Math.ceil(nw) + 12), tw = dfdTextW(ls);
  return { num, ls, nw, ib, w: Math.ceil(Math.max(DF.minW, ib + tw + 2 * DF.pad, nw + 8 + tw + 2 * DF.pad)), h: Math.max(36, ls.length * DF.lh + 16) }; };
const dfdStore = skin => ({
  size: n => { const p = dfdStoreParts(n); return { w: p.w, h: p.h }; },
  ...dfdSquare,
  draw(n, c, f) {
    const { num, ls, nw, ib } = dfdStoreParts(n), { x, y, w, h } = n, mask = `<path d="${dfdRect(x, y, w, h)}" class="n-mask"/>`;
    if (skin === 'yourdon') { const tx = x + DF.pad + (num ? nw + 8 : 0), max = x + w - DF.pad - tx;
      return dfdNode(n, 'store', mask + `<path d="${dfdRect(x, y, w, h)}" fill="${f}" stroke="none"/><path d="M${r2(x)} ${r2(y)}H${r2(x + w)}M${r2(x)} ${r2(y + h)}H${r2(x + w)}" class="n-body" fill="none" stroke="${c}"/>`
        + (num ? dfdText(x + DF.pad, y + h / 2 + 4, num, DF.num, 500, 'var(--um-muted)', nw + 1, 'c-st', 'start') : '') + dfdNameSvg(n, ls, tx + max / 2, y, y + h, max)); }
    const max = w - ib - 2 * DF.pad;
    return dfdNode(n, 'store', mask + `<path d="${dfdRect(x, y, w, h)}" fill="${f}" stroke="none"/><path d="M${r2(x + w)} ${r2(y)}H${r2(x)}V${r2(y + h)}H${r2(x + w)}M${r2(x + ib)} ${r2(y)}V${r2(y + h)}" class="n-body" fill="none" stroke="${c}"/>`
      + (num ? dfdText(x + ib / 2, y + h / 2 + 4, num, DF.num, 500, 'var(--um-muted)', ib - 6, 'c-st') : '') + dfdNameSvg(n, ls, x + ib + DF.pad + max / 2, y, y + h, max));
  },
});
// an external entity: a rectangle; in Gane and Sarson a 4 px shadow inside the box, at its right and bottom
const dfdEntityParts = n => { const ls = dfdName(n.label, 3); return { ls, w: Math.ceil(Math.max(DF.minW, dfdTextW(ls) + 2 * DF.pad + DF.shadow)), h: ls.length * DF.lh + 16 + DF.shadow }; };
const dfdEntity = skin => ({
  size: n => { const p = dfdEntityParts(n); return { w: p.w, h: p.h }; },
  ...dfdSquare,
  draw(n, c, f) {
    const { ls } = dfdEntityParts(n), { x, y, w, h } = n, s = skin === 'yourdon' ? 0 : DF.shadow;
    const body = s ? `<path d="${dfdRect(x, y, w, h)}" class="n-mask"/><path d="${dfdRect(x + s, y + s, w - s, h - s)}" class="n-det" fill="${c}" stroke="${c}"/><path d="${dfdRect(x, y, w - s, h - s)}" class="n-body" fill="${f}" stroke="${c}"/>` : dfdBody(dfdRect(x, y, w, h), c, f);
    return dfdNode(n, 'entity', body + dfdNameSvg(n, ls, x + (w - s) / 2, y, y + h - s, w - s - 2 * DF.pad));
  },
});
for (const skin of ['yourdon', 'gane-sarson']) for (const [kind, make] of [['process', dfdProcess], ['store', dfdStore], ['entity', dfdEntity]]) {
  const S = SHAPE[`dfd-${kind}-${skin}`] = make(skin); S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, k = 1) => portsOn(S, n, side, k); }

/* ---- the model read: its elements, the lines a view draws, its levels ---- */
function dfdIndex(model) {
  const at = new Map(), path = new Map(), views = new Map();
  DFD_ARR(model && model.nodes).forEach((x, i) => { if (DFD_OBJ(x) && typeof x.id === 'string' && !at.has(x.id)) { at.set(x.id, x); path.set(x.id, `nodes[${i}]`); } });
  DFD_ARR(model && model.views).forEach(v => { if (DFD_OBJ(v) && typeof v.id === 'string' && !views.has(v.id)) views.set(v.id, v); });
  const flows = DFD_ARR(model && model.edges).map((e, i) => [e, `edges[${i}]`]).filter(([e]) => DFD_OBJ(e) && e.type === 'dfd.DataFlow');
  const ty = id => (at.get(id) || {}).type, proc = id => ty(id) === 'dfd.Process';
  const name = id => { const x = at.get(id); if (!x) return String(id); const k = dfdNum(x); return (k ? k + ' ' : '') + String(x.label ?? x.id); };
  const q = id => `${(DFD_WORD[ty(id)] || 'element').toLowerCase()} "${name(id)}"`;
  // a level: the view a process opens, its parent view, and its own processes, those it shows and its parent view does not
  const level = p => { const v = views.get((at.get(p) || {}).opensView), pv = v && views.get(v.parent), up = new Set(DFD_ARR(pv && pv.nodeIds));
    return v ? { v, pv, up, kids: DFD_ARR(v.nodeIds).filter(id => proc(id) && id !== p && !up.has(id)) } : null; };
  const parentOf = vid => [...at.values()].find(x => x.type === 'dfd.Process' && x.opensView === vid) || null; // the process a view is the level of
  return { at, path, views, flows, ty, proc, name, q, level, parentOf };
}
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two nodes it shows
function dfdLines(model, view) {
  const E = new Map(); DFD_ARR(model.edges).forEach(e => { if (DFD_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const shown = new Set(DFD_ARR(view.nodeIds)), list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => DFD_LINES.includes(e.type));
  return list.filter(e => DFD_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to));
}
// accessible names (A1): "Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out"; a flow: "Data flow basket from Customer to 1 Take order"
function dfdNodeName(I, id, lines) {
  const x = I.at.get(id); if (x.type === 'uml.Comment') return 'Comment: ' + String(x.label ?? '');
  const ins = lines.filter(e => e.type === 'dfd.DataFlow' && e.to === id && e.from !== id).length, outs = lines.filter(e => e.type === 'dfd.DataFlow' && e.from === id && e.to !== id).length;
  const v = x.type === 'dfd.Process' && I.views.get(x.opensView);
  return `${DFD_WORD[x.type] || String(x.type).split('.').pop()} ${I.name(id)}${v ? `, opens level ${v.title || v.id}` : ''}, ${dfdPlural(ins, 'flow')} in, ${outs} out`;
}
const dfdLineName = (I, e) => `${e.type === 'dfd.DataFlow' ? 'Data flow' : 'Comment link'}${DFD_HAS(e.label) ? ' ' + e.label : ''} from ${I.name(e.from)} to ${I.name(e.to)}`;
// reading order: the processes by number, then the stores, the entities and the rest as the view lists them, then the lines
function dfdOrder(I, ids, lines) {
  const rank = id => ['dfd.Process', 'dfd.DataStore', 'dfd.ExternalEntity'].indexOf(I.ty(id)) + 1 || 4, byNum = (a, b) => dfdNum(I.at.get(a)).localeCompare(dfdNum(I.at.get(b)), undefined, { numeric: true });
  return [...[...ids].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? byNum(a, b) : 0)), ...lines.map(e => e.id)];
}

/* ---- the legend: each symbol drawn, in the view's skin, and the line kinds ---- */
const DFD_GLYPH = {
  'process-yourdon': '<ellipse cx="14" cy="8" rx="12" ry="6.5" fill="var(--um-panel)"/>', 'process-gane-sarson': '<rect x="3" y="1.5" width="22" height="13" rx="3" fill="var(--um-panel)"/><path d="M3 5.5H25"/>',
  'store-yourdon': '<path d="M2 3H26M2 13H26"/>', 'store-gane-sarson': '<path d="M26 3H2V13H26M8 3V13"/>',
  'entity-yourdon': '<rect x="3" y="2" width="22" height="12" fill="var(--um-panel)"/>', 'entity-gane-sarson': '<rect x="5" y="4" width="21" height="11" fill="var(--um-muted)"/><rect x="3" y="2" width="21" height="11" fill="var(--um-panel)"/>',
  'dfd.DataFlow': '<path d="M2 8H17"/><path d="M17 4L26 8L17 12Z" fill="var(--um-muted)"/>', 'uml.CommentLink': '<path d="M2 8H26" stroke-dasharray="3 2"/>',
};
const DFD_SAYS = { process: 'transforms the data flowing in into the data flowing out', store: 'holds data at rest', entity: 'outside the system: a source or a sink of data',
  'dfd.DataFlow': 'data moving, named by what it carries', 'uml.CommentLink': 'what a comment is about' };
const dfdLegendItem = (glyph, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none">${glyph}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const dfdLegend = (I, ids, lines, skin) => [
  ...['process', 'store', 'entity'].filter(k => ids.some(id => DFD_KIND[I.ty(id)] === k)).map(k => dfdLegendItem(DFD_GLYPH[`${k}-${skin}`], DFD_WORD[Object.keys(DFD_KIND).find(t => DFD_KIND[t] === k)], DFD_SAYS[k])),
  ...DFD_LINES.filter(t => lines.some(e => e.type === t)).map(t => dfdLegendItem(DFD_GLYPH[t], t === 'dfd.DataFlow' ? 'Data flow' : 'Comment link', DFD_SAYS[t]))];

/* ---- the view laid out (§7): labels cut at 280 with room made for them (labelGaps); a gap of 64 px, as 48 laid a label of
   22-data-flow.json on a line, down (the note's §7.3, amended) ---- */
const DFD_END = { 'dfd.DataFlow': { from: 'none', to: 'arrow' }, 'uml.CommentLink': { from: 'none', to: 'none', dashed: true } };
function dfdGeo({ model, view, pos, memo }) {
  const I = dfdIndex(model), ids = DFD_ARR(view.nodeIds).filter((id, k, a) => I.at.has(id) && a.indexOf(id) === k), lines = dfdLines(model, view), skin = dfdSkin(view), P = id => (pos && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = ids.map(id => { const x = I.at.get(id), k = DFD_KIND[x.type];
    const d = { id, label: String(x.label ?? id), type: x.type || 'dfd.Process', kind: 'file', ...(k ? { shape: `dfd-${k}-${skin}`, number: dfdNum(x) } : x.type === 'uml.Comment' ? { shape: 'note' } : { shape: 'classifier', compartments: [] }),
      aria: dfdNodeName(I, id, lines), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, ...(DFD_HAS(e.label) ? { label: String(e.label), cut: 280 } : {}),
    end: DFD_END[e.type] || DFD_END['dfd.DataFlow'], aria: dfdLineName(I, e), ...(DFD_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }));
  const g = layoutTyped({ nodes, edges, direction: view.direction === 'down' ? 'down' : 'right', gap: 64, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  return { ...g, legend: dfdLegend(I, ids, lines, skin), order: dfdOrder(I, ids, lines) }; // a new object: what layoutTyped returned is never edited (§2.6)
}

/* ---- validators (§6.4, §7.3). Each problem: { level, rule, path, message, ids }; on the whole model, once a type ---- */
const DFD_RULES = {
  'dfd-flow-process': 'a flow has a process at one end at least: no flow between two stores, two entities, or an entity and a store',
  'dfd-process-io': 'a process has a flow in and a flow out',
  'dfd-flow-label': 'a flow to or from a process has a label',
  'dfd-numbers': 'a level\'s processes are numbered under their parent process\'s (1.1, 1.2 under 1); no number is used twice',
  'dfd-balance': 'the flows between a process and the rest of its level match its level\'s flows across the level\'s edge, by label, far end and direction',
  'dfd-level': 'a process opens a dfd view whose parent is a view showing the process',
};
function dfdProblems(model) {
  const I = dfdIndex(model), out = [], say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const procs = [...I.at.values()].filter(x => x.type === 'dfd.Process');
  I.flows.forEach(([e, path]) => { if (!I.at.has(e.from) || !I.at.has(e.to)) return;
    if (!I.proc(e.from) && !I.proc(e.to)) say('warning', 'dfd-flow-process', path, [e.id, e.from, e.to], `${e.id} runs from ${I.q(e.from)} to ${I.q(e.to)}: a flow has a process at one end at least`);
    else if (!DFD_HAS(e.label)) say('warning', 'dfd-flow-label', path, [e.id], `${e.id}, from ${I.q(e.from)} to ${I.q(e.to)}, has no label: a flow is named by the data it carries`); });
  procs.forEach(p => { const has = w => I.flows.some(([e]) => e[w] === p.id && e[w === 'from' ? 'to' : 'from'] !== p.id), miss = ['in', 'out'].filter((k, i) => !has(i ? 'from' : 'to'));
    if (miss.length) say('warning', 'dfd-process-io', I.path.get(p.id), [p.id], `${I.q(p.id)} has no flow ${miss.join(' and no flow ')}`); });
  // numbers: none used twice among processes, nor among stores; a level's processes under their parent's
  for (const t of ['dfd.Process', 'dfd.DataStore']) { const by = new Map(); [...I.at.values()].filter(x => x.type === t && dfdNum(x)).forEach(x => by.set(dfdNum(x), [...(by.get(dfdNum(x)) || []), x.id]));
    by.forEach((list, k) => { if (list.length > 1) say('warning', 'dfd-numbers', I.path.get(list[1]), list, `${list.length} ${t === 'dfd.Process' ? 'processes' : 'stores'} are numbered ${k}: ${list.map(id => JSON.stringify(String(I.at.get(id).label ?? id))).join(', ')}`); }); }
  procs.forEach(p => { const L = I.level(p.id), n = dfdNum(p); if (!L || L.v.diagram !== 'dfd' || !n) return;
    L.kids.filter(id => !new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`).test(dfdNum(I.at.get(id)))).forEach(id =>
      say('warning', 'dfd-numbers', I.path.get(id), [id, p.id], `${I.q(id)}, on the level of ${I.q(p.id)}, is numbered ${dfdNum(I.at.get(id)) || 'nothing'}: its number is ${n}.1, ${n}.2, …`)); });
  // a level: a dfd view whose parent shows the process; then balanced (§6.4), each pair by label, far end and direction
  procs.filter(p => p.opensView != null).forEach(p => { const L = I.level(p.id), path = I.path.get(p.id);
    if (!L || L.v.diagram !== 'dfd' || !L.up.has(p.id)) return say('warning', 'dfd-level', path, [p.id], !L ? `${I.q(p.id)} opens "${p.opensView}", which is no view`
      : L.v.diagram !== 'dfd' ? `${I.q(p.id)} opens "${L.v.id}", a ${L.v.diagram || 'map'} view, not a level` : `${I.q(p.id)} opens "${L.v.id}", whose parent view ${L.pv ? `"${L.pv.id}" does not show it` : `is ${L.v.parent == null ? 'not given' : `"${L.v.parent}", which is no view`}`}`);
    const kids = new Set(L.kids), key = (e, mine) => { const o = e.from === mine ? e.to : e.from; return [e.from === mine ? 'out' : 'in', o, String(e.label ?? '').trim()]; };
    const outer = I.flows.map(([e]) => e).filter(e => (e.from === p.id) !== (e.to === p.id) && L.up.has(e.from === p.id ? e.to : e.from)).map(e => [e, key(e, p.id)]);
    const inner = I.flows.map(([e]) => e).filter(e => kids.has(e.from) !== kids.has(e.to) && ![e.from, e.to].includes(p.id) && L.up.has(kids.has(e.from) ? e.to : e.from)).map(e => [e, key(e, kids.has(e.from) ? e.from : e.to)]);
    const left = [...inner], miss = outer.filter(([, k]) => { const i = left.findIndex(([, j]) => j.join('\u0001') === k.join('\u0001')); if (i < 0) return true; left.splice(i, 1); return false; });
    if (!miss.length && !left.length) return;
    const said = ([e, [dir, o, l]]) => `"${l}" ${dir === 'in' ? 'in from' : 'out to'} ${I.q(o)} (${e.id})`, lv = `level "${L.v.title || L.v.id}"`;
    say('error', 'dfd-balance', path, [p.id, ...miss.map(([e]) => e.id), ...left.map(([e]) => e.id)], `${I.q(p.id)} does not balance with ${lv}: ${[
      miss.length ? `its flow${miss.length > 1 ? 's' : ''} ${miss.map(said).join(', ')} ${miss.length > 1 ? 'have' : 'has'} none at the level` : '',
      left.length ? `the level's flow${left.length > 1 ? 's' : ''} ${left.map(said).join(', ')} ${left.length > 1 ? 'are' : 'is'} not the process's` : ''].filter(Boolean).join('; ')}`); });
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function dfdDescribe(model, viewId) {
  const v = DFD_ARR(model && model.views).find(x => DFD_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = dfdIndex(model), ids = DFD_ARR(v.nodeIds).filter((id, k, a) => I.at.has(id) && a.indexOf(id) === k), lines = dfdLines(model, v), by = new Map(lines.map(e => [e.id, e])), up = I.parentOf(v.id);
  return [`${v.title || v.id}: a data flow diagram${up ? `, the level of ${I.q(up.id)},` : ''} of ${dfdPlural(ids.length, 'element')} and ${dfdPlural(lines.length, 'line')}.`,
    ...dfdOrder(I, ids, lines).map(id => (by.has(id) ? dfdLineName(I, by.get(id)) : dfdNodeName(I, id, lines)) + '.')].join('\n');
}

/* ---- editing (§6.1, §7.3) ---- */
const dfdUsed = model => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; }); return used; };
// a free id: base, else base-2, base-3, …; numbered (the palette's): base1, base2, …. Taken once given
const dfdFree = (used, base, numbered) => { let k = 1, id = numbered ? base + 1 : base; while (used.has(id)) id = base + (numbered ? '' : '-') + ++k; used.add(id); return id; };
// the next free number: under the view's parent process (1.1, 1.2 under 1), else 1, 2, …; a store's D1, D2, …
function dfdNextNumber(model, view, type) {
  const I = dfdIndex(model), taken = new Set([...I.at.values()].filter(x => x.type === type).map(dfdNum)), up = type === 'dfd.Process' && I.parentOf(view.id), pre = type === 'dfd.DataStore' ? 'D' : up && dfdNum(up) ? dfdNum(up) + '.' : '';
  let k = 1; while (taken.has(pre + k)) k++; return pre + k;
}
// the palette's add: a process or a store with the next free number
function dfdAdd(model, view, entry, label) {
  if (!['dfd.Process', 'dfd.DataStore'].includes(entry.type)) return null;
  const id = dfdFree(dfdUsed(model), entry.type === 'dfd.Process' ? 'process' : 'store', true);
  return [{ op: 'add', element: { id, type: entry.type, ...(label ? { label } : {}), props: { number: dfdNextNumber(model, view, entry.type) } }, view: view.id }];
}
/* D on a selected process that opens no view (§6.1): its level, in one transaction. The new view (<id>-level, the next
   free) shows the far ends of the process's flows on this view and one child process, numbered <n>.1 and named as its
   parent; each of those flows is copied with the process's end moved to the child, so the level balances from the start */
function dfdKey(model, view, ids, key) {
  if (key !== 'd' && key !== 'D') return null;
  const I = dfdIndex(model), p = ids.length === 1 && I.proc(ids[0]) ? I.at.get(ids[0]) : null; if (!p) return null;
  if (p.opensView != null) return { error: `${I.q(p.id)} opens "${p.opensView}" already: Enter opens it` };
  const used = dfdUsed(model), shown = new Set(DFD_ARR(view.nodeIds)), n = dfdNum(p), kn = n ? n + '.1' : '1';
  const flows = I.flows.map(([e]) => e).filter(e => (e.from === p.id) !== (e.to === p.id) && shown.has(e.from === p.id ? e.to : e.from));
  const vid = dfdFree(new Set(DFD_ARR(model.views).filter(DFD_OBJ).map(v => v.id)), p.id + '-level'), kid = dfdFree(used, `${p.id}-${kn}`), title = `${n ? n + ' ' : ''}${p.label ?? p.id}`;
  return { commands: [
    { op: 'addView', view: { id: vid, diagram: 'dfd', title, parent: view.id, ...(view.notation != null ? { notation: view.notation } : {}), ...(view.direction != null ? { direction: view.direction } : {}),
      nodeIds: [...new Set(flows.map(e => (e.from === p.id ? e.to : e.from)))] } },
    { op: 'add', element: { id: kid, type: 'dfd.Process', ...(p.label != null ? { label: p.label } : {}), props: { number: kn } }, view: vid },
    ...flows.map(e => ({ op: 'add', element: { id: dfdFree(used, `${e.id}-${kn}`), type: 'dfd.DataFlow', from: e.from === p.id ? kid : e.from, to: e.to === p.id ? kid : e.to, ...(e.label != null ? { label: e.label } : {}) } })),
    { op: 'set', id: p.id, path: 'opensView', value: vid }],
  say: `Made level ${title}, balanced with ${dfdPlural(flows.length, 'flow')}: Enter opens it` };
}

const DFD_NUMBER = { key: 'number', label: 'Number', kind: 'text' };
const DFD_TYPE = registerDiagramType('dfd', {
  title: 'data flow diagram',
  elements: [['dfd.Process', 'Process', 'dfd'], ['dfd.DataStore', 'Data store'], ['dfd.ExternalEntity', 'External entity'], ['uml.Comment', 'Comment']].map(([type, label, opens]) => ({ type, label, ...(opens ? { opens } : {}) })),
  lines: [{ type: 'dfd.DataFlow', label: 'Data flow' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { 'dfd.Process': [DFD_NUMBER], 'dfd.DataStore': [DFD_NUMBER], 'dfd.ExternalEntity': [], 'dfd.DataFlow': [], 'uml.CommentLink': [] },
  layout: dfdGeo,
  validate: dfdProblems,
  rules: DFD_RULES,
  describe: dfdDescribe,
  edits: { add: dfdAdd, key: dfdKey },
  // the PDF's tables (§9): an element's kind; a process's number and the level it opens, a store's number
  word: (model, id) => { const x = dfdIndex(model).at.get(id); return x && Object.hasOwn(DFD_WORD, x.type) ? DFD_WORD[x.type] : null; },
  rows: (model, view, id) => { const I = dfdIndex(model), x = I.at.get(id); if (!x || !['dfd.Process', 'dfd.DataStore'].includes(x.type)) return null;
    const v = x.type === 'dfd.Process' && I.views.get(x.opensView); return [...(dfdNum(x) ? [`number ${dfdNum(x)}`] : []), ...(v ? [`opens level ${v.title || v.id}`] : [])]; },
});

export { DFD_TYPE, DFD_RULES, dfdGeo, dfdProblems, dfdDescribe, dfdAdd, dfdKey };
