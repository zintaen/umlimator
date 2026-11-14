import { registerDiagramType } from '../core/registry.js';
import { apply } from '../core/apply.js';
import { esc, textW } from '../core/text.js';
import { SHAPE } from '../draw/shapes.js';
import { layoutTimeAxis } from '../layout/timeaxis.js';
import { frame, tagSize, guardSize, useSize } from './frame.js';
import { interactionWalk, activationBars, replyCallFor, INTERACTION_RULES, interactionProblems } from './interaction.js';

/* ---------- the sequence diagram, uml.sequence (work package 3.3, notes/stage-3.md §4 and §5) ----------
   The subset of notes/stage-3.md §4.1: lifelines (`represents`, «actor» as text), messages inline in the view's `edges`
   (call, async, reply, create, delete), interaction uses inline among them, combined fragments in `fragments` (alt, opt,
   loop, par, break) with their operands as members. The meaning (occurrences, bars, reply matching, the shared rules) is
   src/uml/interaction.js; the geometry is src/layout/timeaxis.js; the shapes are src/uml/frame.js. This file joins them:
   the view as layoutTimeAxis's input, its output as svgOf's geometry with names and a reading order (geo.order, S13), the
   type's layers, its validators, describe(), the legend, and the gesture hooks of §5.1, each a pure function that returns
   commands for apply(), null, or { error }. Ships in lib/umlimator-all.js only. */

const SQ_ARR = x => (Array.isArray(x) ? x : []), SQ_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const SQ_HAS = x => x != null && x !== '';
const SQ_SORTS = ['call', 'async', 'reply', 'create', 'delete'], SQ_OPS = ['alt', 'opt', 'loop', 'par', 'break'];
const SQ_LABEL = { px: 10.5, pad: 12, h: 16 }; // a message's label as svgOf draws a typed line's: 10.5 px text on a backing
// how each sort is drawn (src/typed/draw.js's ENDS): a call filled, async, reply and create open, reply and create dashed
const SQ_END = { call: { from: 'none', to: 'arrow' }, async: { from: 'none', to: 'open' }, reply: { from: 'none', to: 'open', dashed: true },
  create: { from: 'none', to: 'open', dashed: true }, delete: { from: 'none', to: 'arrow' } };

const sqView = (model, view) => (SQ_OBJ(view) ? view : SQ_ARR(model && model.views).find(v => SQ_OBJ(v) && v.id === view)) || null;
const sqProps = x => (SQ_OBJ(x && x.props) ? x.props : {});
// the view's lifelines by id: a model node, or one of the view's own
function sqHeads(model, view) {
  const at = new Map(); [...SQ_ARR(view.nodes), ...SQ_ARR(model.nodes)].forEach(n => { if (SQ_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  return [...new Set(SQ_ARR(view.nodeIds))].filter(id => at.has(id)).map(id => at.get(id)); // listed twice: one head
}
const sqName = n => String(n.label ?? n.id);
const sqHeadText = n => sqName(n) + (SQ_HAS(sqProps(n).represents) ? ' : ' + sqProps(n).represents : ''); // "api : ShopApi"
const sqStereo = n => SQ_ARR(sqProps(n).stereotypes).filter(SQ_HAS).map(String);
const sqOperator = f => String(sqProps(f).operator ?? '');

/* The view's structure, read once: the walk (interaction.js), each operand's fragment, each fragment's parent and its
   operands, which operand chain each occurrence lies in, and each fragment's block of occurrences (rows lo to hi) */
function sqIndex(model, view) {
  const w = interactionWalk(model, view), frags = SQ_ARR(view.fragments).filter(f => SQ_OBJ(f) && typeof f.id === 'string');
  const F = new Map(frags.map(f => [f.id, f])), opOf = new Map(); // operand id → its fragment
  frags.forEach(f => SQ_ARR(f.members).forEach(o => { if (SQ_OBJ(o) && typeof o.id === 'string' && !opOf.has(o.id)) opOf.set(o.id, f); }));
  // the fragments an occurrence or a fragment lies in, from the innermost out, each with the operand it lies in
  const chain = parent => { const out = [], seen = new Set();
    for (let p = parent; p != null && opOf.has(p);) { const f = opOf.get(p); if (seen.has(f.id)) break; seen.add(f.id); out.push({ f, op: p }); p = f.parent; }
    return out; };
  const occ = w.occ.map(o => ({ ...o, chain: chain(o.parent) }));
  const block = new Map(); // fragment id → the occurrences it holds, in time order
  occ.forEach(o => o.chain.forEach(({ f }) => { if (!block.has(f.id)) block.set(f.id, []); block.get(f.id).push(o); }));
  return { w, occ, frags, F, opOf, chain, block, byId: new Map(occ.map(o => [o.id, o])) };
}

/* ---- layout: the view as layoutTimeAxis's input (notes/stage-3.md §3.2), measured with textW in the host's measure ---- */
function sqInput(model, view, X = sqIndex(model, view)) {
  const heads = sqHeads(model, view), entries = SQ_ARR(view.edges), byI = new Map(X.occ.map(o => [o.i, o])), col = new Map(heads.map((h, j) => [h.id, j]));
  const rows = entries.map((x, i) => { const o = byI.get(i);
    if (!o) return { id: SQ_OBJ(x) ? String(x.id) : String(x), kind: 'none', a: null, b: null, w: 0, h: 0, parent: null }; // the core reports it (src/core/model.js)
    if (!o.message) { const cs = SQ_ARR(sqProps(o.el).covers).filter(id => col.has(id)).sort((a, b) => col.get(a) - col.get(b)); // a use: over what it covers, else every lifeline
      const ends = cs.length ? [cs[0], cs[cs.length - 1]] : heads.length ? [heads[0].id, heads[heads.length - 1].id] : [null, null];
      return { id: o.id, kind: 'span', a: ends[0], b: ends[1], parent: o.parent, ...useSize(String(o.el.label ?? '')) }; }
    const t = SQ_HAS(o.el.label) ? String(o.el.label) : '';
    return { id: o.id, kind: o.from === o.to ? 'self' : 'line', a: o.from, b: o.to, parent: o.parent, ...(t ? { w: Math.ceil(textW(t, SQ_LABEL.px) + SQ_LABEL.pad), h: SQ_LABEL.h } : { w: 0, h: 0 }) }; });
  const first = sort => { const at = new Map(); X.occ.forEach(o => { if (o.message && o.sort === sort && !at.has(o.to)) at.set(o.to, o.i); }); return at; };
  const born = first('create'), ends = first('delete');
  const depth = f => X.chain(f.parent).length;
  const groups = X.frags.map((f, k) => [f, depth(f), k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([f]) => ({ id: f.id, parent: f.parent ?? null, tag: tagSize(sqOperator(f)),
    parts: SQ_ARR(f.members).filter(o => SQ_OBJ(o) && typeof o.id === 'string').map(o => ({ id: o.id, guard: guardSize(o.label) })) }));
  const bars = activationBars(model, view).map(b => ({ head: b.head, from: (X.byId.get(b.from) || {}).i, to: (X.byId.get(b.to) || {}).i, depth: b.depth }));
  return { heads: heads.map(n => ({ id: n.id, ...SHAPE.lifeline.size({ label: sqHeadText(n), stereotypes: sqStereo(n) }), born: born.get(n.id) ?? null, ends: ends.get(n.id) ?? null })), rows, groups, bars };
}

/* run(model, view): svgOf's geometry. Nodes: the heads (shape lifeline, with the stem's hit strip), the frames, operands and
   uses (frame.js's shapes); edges: the messages, with their ends and labels; ta: layoutTimeAxis's output, for draw(); slots
   and problems from it; order (S13): heads left to right, then fragments, operands and occurrences in time order */
function sqRun(model, view) {
  const X = sqIndex(model, view), inp = sqInput(model, view, X), o = layoutTimeAxis(inp), heads = sqHeads(model, view), H = new Map(heads.map(n => [n.id, n]));
  const msgs = X.occ.filter(m => m.message), nth = new Map(msgs.map((m, k) => [m.id, k + 1]));
  const inWhat = parent => { const c = X.chain(parent)[0]; if (!c) return ''; const op = SQ_ARR(c.f.members).find(m => SQ_OBJ(m) && m.id === c.op) || {};
    return `, in ${sqOperator(c.f) || 'fragment'}${SQ_HAS(op.label) ? ', ' + op.label : ''}`; };
  const direct = id => X.occ.filter(m => m.parent === id).length;
  const nodes = [
    ...o.heads.map((h, j) => { const n = H.get(h.id), st = sqStereo(n);
      return { ...h, shape: 'lifeline', type: 'uml.Lifeline', label: sqHeadText(n), stereotypes: st, k: 'file', stem: o.stems[j], aria: `Lifeline ${sqHeadText(n)}${st.length ? ` (${st.join(', ')})` : ''}` }; }),
    ...o.frames.flatMap(fr => { const f = X.F.get(fr.id), op = sqOperator(f), ms = SQ_ARR(f.members).filter(SQ_OBJ);
      return [{ id: fr.id, shape: 'frame', type: 'uml.CombinedFragment', label: op, k: 'file', holder: true, x: fr.x, y: fr.y, w: fr.w, h: fr.h, aria: `Combined fragment ${op}, ${ms.length} ${ms.length === 1 ? 'operand' : 'operands'}` },
        ...fr.parts.map(p => { const m = ms.find(x => x.id === p.id) || {}, k = direct(p.id);
          return { ...p, shape: 'operand', type: 'uml.InteractionOperand', label: m.label, k: 'file', holder: true, aria: `Operand ${SQ_HAS(m.label) ? m.label + ' ' : ''}of ${op}, ${k} ${k === 1 ? 'occurrence' : 'occurrences'}` }; })]; }),
    ...o.spans.map(s => { const u = X.byId.get(s.id), cs = SQ_ARR(sqProps(u.el).covers).filter(id => H.has(id)), all = heads.map(n => n.id), ids = cs.length ? all.filter(id => cs.includes(id)) : all;
      return { ...s, shape: 'use', type: 'uml.InteractionUse', label: String(u.el.label ?? ''), k: 'file', holder: true,
        aria: `Interaction use ${u.el.label ?? ''}${ids.length ? `, over ${sqName(H.get(ids[0]))}${ids.length > 1 ? ' to ' + sqName(H.get(ids[ids.length - 1])) : ''}` : ''}` }; }),
  ];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = o.lines.map(l => { const m = X.byId.get(l.id), t = SQ_HAS(m.el.label) ? String(m.el.label) : '';
    return { id: m.id, _id: m.id, type: 'uml.Message', from: m.from, to: m.to, s: byId[m.from], t: byId[m.to], pts: l.pts, end: SQ_END[m.sort], sort: m.sort,
      ...(t ? { lbl: { ...l.lbl, text: t }, label: t } : {}),
      aria: `Message ${nth.get(m.id)} of ${msgs.length}: ${sqName(H.get(m.from))} to ${sqName(H.get(m.to))}${t ? ', ' + t : ''}, ${m.sort}${inWhat(m.parent)}` }; });
  // reading order: by height on the page; at one height a frame before its first operand, both before what they hold
  const rank = { frame: 0, operand: 1 }, at = [...nodes.filter(n => n.shape !== 'lifeline').map(n => [n.id, n.y, rank[n.shape] ?? 2]), ...edges.map(e => [e.id, e.pts[0][1], 2])];
  const order = [...o.heads.map(h => h.id), ...at.sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0])];
  return { nodes, edges, groups: [], byId, bounds: o.bounds, map: false, order, slots: o.slots, problems: o.problems, ta: o, legend: sqLegend(edges) };
}

/* draw, all under the lines (notes/stage-3.md §4.2): frame outlines and dividers, then the stems, then each use's box
   (filled, so stems pass behind it), then the bars, deepest last, then a deleted lifeline's cross */
function sqDraw(g, kit) {
  const o = g.ta, r2 = kit.r2;
  if (!o) return { under: '', over: '' };
  const under = '<g class="seq-under">' + o.frames.map(f => frame(f.x, f.y, f.w, f.h, f.dividers.map(d => d.y))).join('')
    + o.stems.map(s => `<path class="seq-stem" d="M${r2(s.x)} ${r2(s.y1)}V${r2(s.y2)}" stroke="var(--um-muted)" stroke-width="1.2" stroke-dasharray="5 4"/>`).join('')
    + o.spans.map(s => `<rect class="seq-use" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" fill="var(--um-stage-bg)"/>${frame(s.x, s.y, s.w, s.h)}`).join('')
    + o.bars.map(b => `<rect class="seq-bar" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="var(--um-stage-bg)" stroke="var(--um-text)" stroke-width="1.2"/>`).join('')
    + o.stems.filter(s => s.cross).map(s => `<path class="seq-cross" d="M${r2(s.x - 8)} ${r2(s.y2 - 8)}l16 16m0 -16l-16 16" stroke="var(--um-text)" stroke-width="2"/>`).join('') + '</g>';
  return { under, over: '' };
}

/* the legend (pieces.js shows it): each sort of message the view draws */
const SQ_WORDS = { call: ['Call', 'the sender waits for it'], async: ['Async', 'the sender goes on'], reply: ['Reply', 'the answer to a call'],
  create: ['Create', 'creates the lifeline it points to'], delete: ['Delete', 'ends the lifeline it points to (×)'] };
const SQ_TIP = { arrow: '<path d="M17 4L26 8L17 12Z" fill="var(--um-muted)"/>', open: '<path d="M17 4L26 8L17 12" fill="none"/>' };
function sqLegend(edges) {
  const has = new Set(edges.map(e => e.sort));
  return SQ_SORTS.filter(s => has.has(s)).map(s => { const E = SQ_END[s], [name, says] = SQ_WORDS[s];
    return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H17"${E.dashed ? ' stroke-dasharray="3 2"' : ''}/>${SQ_TIP[E.to]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; });
}

/* ---- validators (notes/stage-3.md §4.3). Each problem: { level, rule, path, message, ids }; the shared ones are
   interaction.js's ---- */
const SQ_RULES = {
  'parent-operand': 'an occurrence\'s or a fragment\'s parent is an operand of this view, and no fragment lies inside itself',
  contiguous: 'a fragment\'s occurrences, nested ones included, are one run in edges, operand by operand in members order',
  'message-ends': 'a message joins two lifelines of the view',
  ...INTERACTION_RULES,
  covers: 'an interaction use covers lifelines of the view that are next to each other in nodeIds',
  operator: 'a fragment\'s operator is alt, opt, loop, par or break; opt, loop and break have one operand',
  empty: 'no operand or fragment is empty',
  view: 'a sequence view has no layout pins and is drawn down',
};
function sqProblems(model, view) {
  const out = [], V = sqView(model, view); if (!SQ_OBJ(model) || !V) return out;
  const vi = SQ_ARR(model.views).indexOf(V), at = `views[${vi}]`, X = sqIndex(model, V), ids = [...new Set(SQ_ARR(V.nodeIds))], col = new Map(ids.map((id, j) => [id, j]));
  const say = (rule, path, who, msg, level = 'error') => out.push({ level, rule, path, ids: who.filter(x => x != null), message: `${rule}: ${msg}` });
  const fPath = f => `${at}.fragments[${SQ_ARR(V.fragments).indexOf(f)}]`;
  // parent-operand: an occurrence's or a fragment's parent; a fragment inside itself
  X.occ.forEach(o => { if (o.parent != null && !X.opOf.has(o.parent)) say('parent-operand', o.path + '.parent', [o.id], `${o.id}'s parent ${JSON.stringify(o.parent)} is not an operand of view ${V.id}`); });
  X.frags.forEach(f => { if (f.parent == null) return;
    if (!X.opOf.has(f.parent)) return say('parent-operand', fPath(f) + '.parent', [f.id], `fragment ${f.id}'s parent ${JSON.stringify(f.parent)} is not an operand of view ${V.id}`);
    const seen = new Set(); for (let p = f.parent; p != null && X.opOf.has(p);) { const g = X.opOf.get(p); if (g === f) { say('parent-operand', fPath(f) + '.parent', [f.id, f.parent], `fragment ${f.id} lies inside itself (its parent ${f.parent})`); break; } if (seen.has(g)) break; seen.add(g); p = g.parent; } });
  // contiguous: each fragment's occurrences one run, operand by operand
  X.frags.forEach(f => { const os = X.block.get(f.id) || [], ops = SQ_ARR(f.members).map(m => SQ_OBJ(m) && m.id);
    const k = o => ops.indexOf(o.chain.find(c => c.f === f).op);
    const split = os.some((o, j) => j && o.r !== os[j - 1].r + 1), back = os.some((o, j) => j && k(o) < k(os[j - 1]));
    if (split || back) say('contiguous', fPath(f), [f.id, ...os.map(o => o.id)], `fragment ${f.id}'s occurrences (${os.map(o => o.id).join(', ')}) are ${split ? 'not one run in edges' : 'not in the order of its operands'}`); });
  // message-ends
  X.occ.filter(o => o.message).forEach(o => { const off = [o.from, o.to].filter(id => !col.has(id));
    if (off.length) say('message-ends', o.path, [o.id, ...off], `${o.id} runs from ${o.from} to ${o.to}, and ${[...new Set(off)].join(' and ')} ${new Set(off).size > 1 ? 'are not lifelines' : 'is not a lifeline'} of view ${V.id}`); });
  out.push(...interactionProblems(model, V));
  // covers
  X.occ.filter(o => !o.message).forEach(o => { const cs = SQ_ARR(sqProps(o.el).covers);
    if (!cs.length) return say('covers', o.path + '.props', [o.id], `${o.id} covers no lifeline: drawn across all of them`, 'warning');
    const off = cs.filter(id => !col.has(id)), js = cs.filter(id => col.has(id)).map(id => col.get(id)).sort((a, b) => a - b);
    if (off.length) say('covers', o.path + '.props.covers', [o.id, ...off], `${o.id} covers ${off.join(', ')}, not ${off.length > 1 ? 'lifelines' : 'a lifeline'} of view ${V.id}`);
    else if (js[js.length - 1] - js[0] + 1 !== new Set(js).size) say('covers', o.path + '.props.covers', [o.id, ...cs], `${o.id} covers ${cs.join(', ')}, which are not next to each other in nodeIds`); });
  // operator, empty
  const holds = id => X.occ.some(o => o.chain.some(c => c.op === id));
  X.frags.forEach(f => { const op = sqProps(f).operator, ms = SQ_ARR(f.members).filter(SQ_OBJ);
    if (!SQ_OPS.includes(op)) say('operator', fPath(f) + '.props.operator', [f.id], `fragment ${f.id} has ${op === undefined ? 'no operator' : `operator ${JSON.stringify(op)}`}, not one of ${SQ_OPS.join(', ')}: it is drawn by its name`, 'warning');
    else if (['opt', 'loop', 'break'].includes(op) && ms.length !== 1) say('operator', fPath(f) + '.members', [f.id], `fragment ${f.id} is ${op}, which has one operand, not ${ms.length}`, 'warning');
    if (!ms.length || !ms.some(m => holds(m.id))) say('empty', fPath(f), [f.id], `fragment ${f.id} holds nothing: it has no place in time and is drawn at the end of what holds it`, 'warning');
    else ms.forEach((m, j) => { if (!holds(m.id)) say('empty', `${fPath(f)}.members[${j}]`, [m.id, f.id], `operand ${m.id} of ${f.id} holds nothing`, 'warning'); }); });
  // view
  if (SQ_OBJ(V.layout) && Object.keys(V.layout).length) say('view', at + '.layout', Object.keys(V.layout), `view ${V.id} pins ${Object.keys(V.layout).join(', ')}: a sequence places its lifelines in nodeIds order, so pins mean nothing`, 'warning');
  if (V.direction != null && V.direction !== 'down') say('view', at + '.direction', [], `view ${V.id} has direction ${JSON.stringify(V.direction)}: a sequence is drawn down`, 'warning');
  return out;
}

/* ---- describe(): the view in words, in time order, nested as it is drawn ---- */
const SQ_VERB = { call: 'calls', async: 'sends to', reply: 'replies to', create: 'creates', delete: 'deletes' };
function sqDescribe(model, viewId) {
  const V = SQ_ARR(model && model.views).find(x => SQ_OBJ(x) && x.id === viewId); if (!V) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const X = sqIndex(model, V), heads = sqHeads(model, V), H = new Map(heads.map(n => [n.id, n])), nm = id => (H.has(id) ? sqName(H.get(id)) : String(id));
  const ms = X.occ.filter(o => o.message), uses = X.occ.length - ms.length, n = new Map(ms.map((m, k) => [m.id, k + 1]));
  const count = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
  const out = [`${V.title || V.id}: a sequence diagram of ${count(heads.length, 'lifeline')}, ${count(ms.length, 'message')}${uses ? `, ${count(uses, 'interaction use')}` : ''} and ${count(X.frags.length, 'combined fragment')}.`];
  if (heads.length) out.push(`Lifelines, left to right: ${heads.map(h => sqHeadText(h) + (sqStereo(h).length ? ` (${sqStereo(h).join(', ')})` : '')).join('; ')}.`);
  let open = [];
  X.occ.forEach(o => { const c = o.chain.slice().reverse(); let k = 0; while (k < open.length && k < c.length && open[k].op === c[k].op) k++;
    open = open.slice(0, k);
    for (; k < c.length; k++) { const { f, op } = c[k], m = SQ_ARR(f.members).find(x => SQ_OBJ(x) && x.id === op) || {};
      out.push(`${'  '.repeat(k)}${sqOperator(f) || 'fragment'}${SQ_HAS(m.label) ? ` [${m.label}]` : ''}:`); open.push(c[k]); }
    const pad = '  '.repeat(c.length), t = SQ_HAS(o.el.label) ? `: ${o.el.label}` : '';
    if (!o.message) { const cs = SQ_ARR(sqProps(o.el).covers); out.push(`${pad}ref ${JSON.stringify(String(o.el.label ?? ''))}${cs.length ? ` over ${cs.map(nm).join(', ')}` : ''}.`); return; }
    const to = o.from === o.to ? 'itself' : nm(o.to), call = o.sort === 'reply' && n.has(o.replyTo) ? ` (answers ${n.get(o.replyTo)})` : '';
    out.push(`${pad}${n.get(o.id)}. ${nm(o.from)} ${SQ_VERB[o.sort]} ${to}${call}${t}.`); });
  return out.join('\n');
}

/* ---- paths(): in time order (C10). A path from one lifeline to another is a run of messages, each later than the one
   before and sent from the lifeline it reached; a line is on one when `from` reaches its sender before it and its receiver
   reaches `to` after it. Self-messages are left out, as paths() leaves them ---- */
function sqPaths(model, viewId, from, to) {
  const V = SQ_ARR(model && model.views).find(x => SQ_OBJ(x) && x.id === viewId); if (!V) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const ids = sqHeads(model, V).map(h => h.id), ms = sqIndex(model, V).occ.filter(o => o.message && o.from !== o.to);
  if (!ids.includes(from) || !ids.includes(to)) return [];
  if (from === to) return [{ type: 'node', id: from, view: viewId }]; // the card alone, as paths() on a map gives it
  const got = new Map([[from, -1]]), left = new Map([[to, Infinity]]);
  ms.forEach((m, i) => { if (got.has(m.from) && !got.has(m.to)) got.set(m.to, i); }); // when each lifeline is first reached
  for (let i = ms.length - 1; i >= 0; i--) { const m = ms[i]; if (left.has(m.to) && !left.has(m.from)) left.set(m.from, i); } // its last chance to reach `to`
  const on = ms.filter((m, i) => got.get(m.from) < i && left.get(m.to) > i), at = new Set(on.flatMap(m => [m.from, m.to]));
  return on.length ? [...ids.filter(id => at.has(id)).map(id => ({ type: 'node', id, view: viewId })), ...on.map(m => ({ type: 'edge', ids: [m.id], view: viewId }))] : [];
}

/* ---- the gesture hooks (notes/stage-3.md §5.1, §5.2). Each takes the model and the view (or its id) and returns the
   commands of one transaction, null to leave the gesture to the canvas's default, or { error } for the hint line. A
   transaction that would add an error the model did not have is never returned: { error } names the rule (S5) ---- */
function sqNewId(model, base, more = []) { // the base and the first number free in the model: 'm11', 'f3'
  const used = new Set(more); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el'; let k = 1; while (['', '.1', '.2'].some(x => used.has(b + k + x))) k++; return b + k; // a fragment's operands free too
}
const sqErr = message => ({ error: message });
const sqErrKey = p => `${p.rule}|${[...p.ids].sort().join()}`;
// the commands, unless they throw or bring an error the view did not have
function sqGuard(model, V, commands) {
  if (!Array.isArray(commands) || !commands.length) return commands;
  let next; try { next = apply(model, commands); } catch (x) { return sqErr(String(x && x.message || x)); }
  const was = new Set(sqProblems(model, V).filter(p => p.level === 'error').map(sqErrKey));
  const bad = sqProblems(next, sqView(next, V.id)).find(p => p.level === 'error' && !was.has(sqErrKey(p)));
  return bad ? sqErr(bad.message) : commands;
}
// the slots of a view (layoutTimeAxis's): their index and parent do not hang on any size
const sqSlots = (model, V, X) => layoutTimeAxis(sqInput(model, V, X)).slots;
// an occurrence's or a fragment's run in edges: { lo, hi, ids, parent, inside (the operands in it) }, or { error }
function sqRunOf(X, V, id) {
  const o = X.byId.get(id); if (o) return { lo: o.i, hi: o.i, ids: [o.id], parent: o.parent ?? null, inside: new Set() };
  const f = X.F.get(id); if (!f) return sqErr(`${id} is not a message, an interaction use or a fragment of view ${V.id}`);
  const os = X.block.get(f.id) || [], inside = new Set([...X.opOf.keys()].filter(op => X.chain(op).some(c => c.f === f)));
  if (os.some((x, j) => j && x.i !== os[j - 1].i + 1)) return sqErr(`fragment ${f.id}'s occurrences are not one run in time: move them together first`);
  return { lo: os.length ? os[0].i : null, hi: os.length ? os[os.length - 1].i : null, ids: os.map(x => x.id), parent: f.parent ?? null, inside };
}
// the commands that put a run at a slot { index, parent }: one move per occurrence it holds, in order, then a reparent
function sqPut(V, id, R, at, el) {
  if (R.inside.has(at.parent)) return sqErr(`${id} cannot move into itself`);
  const t = Number.isInteger(at.index) ? Math.max(0, Math.min(SQ_ARR(V.edges).length, at.index)) : SQ_ARR(V.edges).length, out = [];
  if (R.lo != null) {
    if (t > R.lo && t <= R.hi) return sqErr(`${id} cannot move into itself`);
    if (t > R.hi + 1) R.ids.forEach(x => out.push({ op: 'move', id: x, view: V.id, index: t - 1 }));
    else if (t < R.lo) R.ids.forEach((x, k) => out.push({ op: 'move', id: x, view: V.id, index: t + k }));
  }
  if ((el.parent ?? null) !== (at.parent ?? null)) out.push({ op: 'reparent', id, parent: at.parent ?? null });
  return out;
}

/* connect(model, view, from, to, at, line): a new message from `from` to `to` (the same lifeline: a self-message) at the
   slot `at` ({ index, parent }; null: the end), with the picked entry's props. A reply answers the latest unanswered call
   back along it (interaction.js's replyCallFor) */
function sqConnect(model, view, from, to, at, line) {
  const V = sqView(model, view); if (!V) return null;
  const ids = SQ_ARR(V.nodeIds), props = { ...(SQ_OBJ(line && line.props) ? structuredClone(line.props) : {}) };
  if (!ids.includes(from) || !ids.includes(to)) return sqErr(`a message joins two lifelines of view ${V.id}`);
  const sort = SQ_SORTS.includes(props.sort) ? props.sort : (props.sort = 'call');
  if (from === to && (sort === 'create' || sort === 'delete')) return sqErr(`a lifeline does not ${sort} itself`);
  const slot = SQ_OBJ(at) ? at : { index: SQ_ARR(V.edges).length, parent: null };
  if (sort === 'reply') { const c = replyCallFor(model, V, from, to, slot); if (c != null) props.replyTo = c; }
  const element = { id: sqNewId(model, 'm'), type: (line && typeof line.type === 'string' && line.type) || 'uml.Message', from, to, ...(slot.parent != null ? { parent: slot.parent } : {}), props };
  return sqGuard(model, V, [{ op: 'add', element, view: V.id, index: slot.index ?? SQ_ARR(V.edges).length, in: 'view' }]);
}

// a lifeline dropped at x: its place in nodeIds, among the other heads as laid out in the default measure. The canvas passes
// col, its count of heads drawn left of the drop in the host's font, which wins: the two layouts can differ by more than a gap
const sqColAt = (model, V, id, x) => layoutTimeAxis(sqInput(model, V)).heads.filter(h => h.id !== id && h.x + h.w / 2 < x).length;

/* moveTo(model, view, id, at): a message, a use or a fragment to the slot `at`, or one slot up or down with at = { by: [0, ±1] }
   (Alt + Up/Down); a lifeline one place left or right with { by: [±1, 0] } (Alt + Left/Right), or to its place in nodeIds
   with { index }, or to the place nearest a drop's point { pt: [x, y], col } (a drag sideways; col, the canvas's count of
   heads drawn left of pt, when given); an operand one place up or down
   among its fragment's (the member list's Alt + Up/Down), or to its place with { index }: a move of the member, then one
   move per occurrence it holds, so edges follows the new order. A slot the canvas passes (it has a y, or a drop's pt) is
   never read as a place in nodeIds or members. Anything else: null */
function sqMoveTo(model, view, id, at) {
  const V = sqView(model, view); if (!V || !SQ_OBJ(at)) return null;
  const by = Array.isArray(at.by) ? at.by : null, ids = SQ_ARR(V.nodeIds), pt = Array.isArray(at.pt) ? at.pt : null, slot0 = !!pt || Number.isFinite(at.y);
  const place = () => (!slot0 && Number.isInteger(at.index) ? at.index : null);
  if (ids.includes(id)) { const i = ids.indexOf(id), j = by ? (by[1] ? null : i + Math.sign(by[0])) : pt ? (Number.isInteger(at.col) ? at.col : sqColAt(model, V, id, +pt[0])) : place();
    if (j == null) return null; if (j < 0 || j >= ids.length || j === i) return [];
    return sqGuard(model, V, [{ op: 'move', id, view: V.id, index: j }]); }
  const X = sqIndex(model, V);
  if (X.opOf.has(id)) { // an operand among its fragment's operands: { by: [0, ±1] } or { index }; edges follows (contiguous)
    const f = X.opOf.get(id), ops = SQ_ARR(f.members).filter(SQ_OBJ).map(o => o.id), k = ops.indexOf(id);
    const j = by ? (by[0] ? null : k + Math.sign(by[1])) : place();
    if (j == null) return null; if (j < 0 || j >= ops.length || j === k) return [];
    const R = sqRunOf(X, V, f.id); if (R.error) return R;
    const mine = o => (X.block.get(f.id) || []).filter(x => x.chain.some(c => c.op === o)).map(x => x.i), now = mine(id);
    const out = [{ op: 'move', id, index: j }], past = ops.slice(Math.min(j, k + 1), Math.max(j + 1, k)).flatMap(mine); // what it passes
    if (now.length && past.length) { const ids = now.map(i => SQ_ARR(V.edges)[i].id);
      if (j < k) ids.forEach((x, p) => out.push({ op: 'move', id: x, view: V.id, index: past[0] + p }));
      else ids.forEach(x => out.push({ op: 'move', id: x, view: V.id, index: past[past.length - 1] })); }
    return sqGuard(model, V, out); }
  const R = sqRunOf(X, V, id); if (R.error) return R;
  const el = X.byId.has(id) ? X.byId.get(id).el : X.F.get(id);
  let slot = at;
  if (by) { if (!by[1] || by[0]) return null; // sideways: nothing for an occurrence
    if (R.lo == null) return sqErr(`fragment ${id} holds nothing: it has no place in time to move from`);
    // from the run's own slot in its parent (before it going up, after it going down) to the next one that is another place.
    // A fragment that holds nothing but the run is skipped: once the run leaves, it has no place in time (it is drawn at
    // its parent's end), so stepping into it would only step back out
    const all = sqSlots(model, V, X), P = R.parent, mine = new Set(R.ids), gone = new Set();
    X.frags.forEach(f => { if ((X.block.get(f.id) || []).every(o => mine.has(o.id))) SQ_ARR(f.members).forEach(m => SQ_OBJ(m) && gone.add(m.id)); });
    const here = by[1] < 0 ? R.lo : R.hi + 1, k = by[1] < 0 ? all.findIndex(s => s.parent === P && s.index === here) : all.findLastIndex(s => s.parent === P && s.index === here);
    slot = undefined; if (k < 0) return [];
    for (let j = k + Math.sign(by[1]); j >= 0 && j < all.length; j += Math.sign(by[1])) { const s = all[j];
      if (!gone.has(s.parent) && !(s.parent === P && s.index === here)) { slot = s; break; } }
    if (!slot) return []; }
  return sqGuard(model, V, sqPut(V, id, R, slot, el));
}

/* wrap(model, view, ids, kind): a new fragment of operator `kind` round a run of occurrences (and fragments) that share a
   parent and lie next to each other in time: it is added with one operand (an alt with two, the second "else"), and each
   item of the run moves into its first operand */
function sqWrap(model, view, ids, kind) {
  const V = sqView(model, view); if (!V) return null;
  if (!SQ_OPS.includes(kind)) return sqErr(`a fragment's operator is one of ${SQ_OPS.join(', ')}, not ${JSON.stringify(kind)}`);
  const X = sqIndex(model, V), sel = [...new Set(SQ_ARR(ids))]; if (!sel.length) return sqErr('select the messages to wrap first');
  const runs = sel.map(id => [id, sqRunOf(X, V, id)]), bad = runs.find(([, r]) => r.error); if (bad) return bad[1];
  const P = runs[0][1].parent; if (runs.some(([, r]) => r.parent !== P)) return sqErr('what is wrapped lies in one place: these lie in different operands');
  const lo = Math.min(...runs.map(([, r]) => r.lo ?? Infinity)), hi = Math.max(...runs.map(([, r]) => r.hi ?? -Infinity)), items = new Set(sel);
  // each occurrence of the run is selected, or lies in a fragment of P that lies in the run
  for (const o of X.occ.filter(x => x.i >= lo && x.i <= hi)) {
    if (o.parent === P) { if (!items.has(o.id)) return sqErr(`${o.id} lies between what is selected: select it too, or a run with nothing between`); continue; }
    const c = o.chain.find(x => (x.f.parent ?? null) === P); if (!c) return sqErr(`${o.id} lies between what is selected, in another place`);
    const r = sqRunOf(X, V, c.f.id); if (r.error || r.lo < lo || r.hi > hi) return sqErr(`fragment ${c.f.id} lies only partly in the run`);
    items.add(c.f.id); }
  const fid = sqNewId(model, 'f'), members = [{ id: `${fid}.1`, type: 'uml.InteractionOperand' }, ...(kind === 'alt' ? [{ id: `${fid}.2`, type: 'uml.InteractionOperand', label: 'else' }] : [])];
  const element = { id: fid, type: 'uml.CombinedFragment', ...(P != null ? { parent: P } : {}), props: { operator: kind }, members };
  return sqGuard(model, V, [{ op: 'add', element, view: V.id, in: 'view' }, ...[...items].map(id => ({ op: 'reparent', id, parent: members[0].id }))]);
}

/* add(model, view, entry, label, at): the palette and N. A lifeline is a model node, placed after the last lifeline selected
   (at.sel, the ids the canvas has selected) or the one `at.after` names, else last, and each use that covers both lifelines
   beside it covers it too; an interaction use goes in the view at the slot `at`, covering the lifelines selected and those
   between them, else `at.covers`, else every lifeline */
function sqAdd(model, view, entry, label, at) {
  const V = sqView(model, view), type = SQ_OBJ(entry) ? entry.type : null; if (!V) return null;
  const ids = SQ_ARR(V.nodeIds), t = SQ_HAS(label) ? String(label) : null, js = SQ_ARR(SQ_OBJ(at) && at.sel).map(x => ids.indexOf(x)).filter(j => j >= 0);
  if (type === 'uml.Lifeline') { const i = js.length ? js[js.length - 1] : SQ_OBJ(at) ? ids.indexOf(at.after) : -1, id = sqNewId(model, t || 'lifeline');
    // a use that covers both its neighbours covers it too, so covers stays next to each other
    const grow = i < 0 || i + 1 >= ids.length ? [] : sqIndex(model, V).occ.filter(o => !o.message && [ids[i], ids[i + 1]].every(x => SQ_ARR(sqProps(o.el).covers).includes(x)))
      .map(o => ({ op: 'set', id: o.id, path: 'props.covers', value: sqProps(o.el).covers.flatMap(x => (x === ids[i] ? [x, id] : [x])) }));
    return sqGuard(model, V, [{ op: 'add', element: { id, type, ...(t ? { label: t } : {}) }, view: V.id, index: i < 0 ? ids.length : i + 1 }, ...grow]); }
  if (type === 'uml.InteractionUse') { const slot = SQ_OBJ(at) && Number.isInteger(at.index) ? at : { index: SQ_ARR(V.edges).length, parent: null };
    const covers = js.length ? ids.slice(Math.min(...js), Math.max(...js) + 1) : SQ_ARR(SQ_OBJ(at) && at.covers).length ? [...at.covers] : [...ids];
    return sqGuard(model, V, [{ op: 'add', element: { id: sqNewId(model, 'ref'), type, ...(t ? { label: t } : {}), ...(slot.parent != null ? { parent: slot.parent } : {}), props: { covers } }, view: V.id, index: slot.index, in: 'view' }]); }
  return null;
}

/* remove(model, view, ids, fromModel): Delete (fromModel false) takes a lifeline out of this view (hide, which takes its
   messages with it, after a set that drops it from each use's covers); Shift + Delete deletes it from the model. A message,
   a use or a fragment lives in the view: either deletes it (a call's replies go with it; a fragment's content stays). An
   operand's content moves to just after its fragment before it goes (S6); the last operand, or all of them at once, takes
   its fragment. With a lifeline among what goes, the commands come as { commands, say }: say, for the hint line, counts the
   messages that go with it */
function sqRemove(model, view, ids, fromModel) {
  const V = sqView(model, view); if (!V) return null;
  const X = sqIndex(model, V), lifelines = SQ_ARR(V.nodeIds), out = [], sel = new Set(SQ_ARR(ids));
  // every operand of a fragment selected: the fragment goes instead (its content stays, as an unwrap)
  const whole = id => { const f = X.opOf.get(id); return f && SQ_ARR(f.members).filter(SQ_OBJ).every(m => sel.has(m.id)) ? f.id : id; };
  for (const id of new Set([...sel].map(whole))) {
    if (lifelines.includes(id) && !fromModel && !SQ_ARR(V.nodes).some(n => SQ_OBJ(n) && n.id === id)) { // one of the view's own goes by delete
      X.occ.filter(o => !o.message && SQ_ARR(sqProps(o.el).covers).includes(id)).forEach(o => out.push({ op: 'set', id: o.id, path: 'props.covers', value: sqProps(o.el).covers.filter(x => x !== id) }));
      out.push({ op: 'hide', id, view: V.id }); continue; }
    const f = X.opOf.get(id);
    if (f && SQ_ARR(f.members).filter(SQ_OBJ).length > 1) { const R = sqRunOf(X, V, f.id); if (R.error) return R;
      const mine = (X.block.get(f.id) || []).filter(o => o.chain.some(c => c.op === id)).map(o => o.id);
      if (mine.length && X.byId.get(mine[mine.length - 1]).i !== R.hi) mine.forEach(x => out.push({ op: 'move', id: x, view: V.id, index: R.hi }));
      out.push({ op: 'delete', id }); continue; }
    out.push({ op: 'delete', id: f ? f.id : id });
  }
  const r = sqGuard(model, V, out), heads = sqHeads(model, V).filter(n => sel.has(n.id)), hs = new Set(heads.map(n => n.id));
  if (!Array.isArray(r) || !r.length || !heads.length) return r;
  const n = X.occ.filter(o => o.message && (hs.has(o.from) || hs.has(o.to))).length;
  return { commands: r, say: `${fromModel ? 'Deleted' : 'Removed'} ${heads.map(sqName).join(', ')}${fromModel ? '' : ' from the view'}, and ${n ? `${n} ${n === 1 ? 'message' : 'messages'}` : 'no message'} with ${heads.length > 1 ? 'them' : 'it'}` };
}

/* operands are a fragment's members, edited in the properties panel's member list (src/canvas/edit.js): a guard as text */
const SQ_MEMBER = {
  print: m => String(m.label ?? ''),
  edit: (m, text) => ({ commands: [{ op: 'set', id: m.id, path: 'label', value: String(text).trim() || undefined }] }),
  add: text => ({ type: 'uml.InteractionOperand', label: String(text).trim(), props: {} }),
  holds: n => n.type === 'uml.CombinedFragment',
};

/* ---- the type ---- */
const SEQ_TYPE = registerDiagramType('uml.sequence', {
  title: 'sequence diagram',
  elements: [{ type: 'uml.Lifeline', label: 'Lifeline' }, { type: 'uml.InteractionUse', label: 'Interaction use' }],
  lines: [['Call', 'call'], ['Async', 'async'], ['Reply', 'reply'], ['Create', 'create'], ['Delete', 'delete']].map(([label, sort]) => ({ type: 'uml.Message', label, props: { sort } })),
  items: ['uml.InteractionUse'],
  wraps: SQ_OPS,
  refs: { 'uml.Message': { 'props.replyTo': 'cascade' }, 'uml.InteractionUse': { 'props.covers': 'drop' } },
  props: {
    'uml.Lifeline': [{ key: 'represents', label: 'Represents', kind: 'text' }, { key: 'stereotypes', label: 'Stereotypes', kind: 'list' }],
    'uml.Message': [{ key: 'sort', label: 'Sort', kind: 'enum', options: SQ_SORTS }, { key: 'replyTo', label: 'Reply to', kind: 'text' }],
    'uml.InteractionUse': [{ key: 'refersTo', label: 'Refers to', kind: 'text' }, { key: 'covers', label: 'Covers', kind: 'list' }],
    'uml.CombinedFragment': [{ key: 'operator', label: 'Operator', kind: 'enum', options: SQ_OPS }],
  },
  layout: { run: sqRun, pins: false },
  draw: sqDraw,
  validate: sqProblems,
  rules: SQ_RULES,
  describe: sqDescribe,
  paths: sqPaths,
  member: SQ_MEMBER,
  edits: { connect: sqConnect, moveTo: sqMoveTo, wrap: sqWrap, add: sqAdd, remove: sqRemove },
});

export { SEQ_TYPE, SQ_RULES, sqInput, sqRun, sqDraw, sqProblems, sqDescribe, sqPaths, sqConnect, sqMoveTo, sqWrap, sqAdd, sqRemove };
