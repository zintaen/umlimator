import { r2 } from '../draw/shapes.js';

/* ---------- the time-axis layout (work package 3.2, notes/stage-3.md §3.2) ----------
   layoutTimeAxis(input) -> out, the geometry of a sequence (and later of an interaction overview's inline interaction): no
   DOM, no model. Sizes come in measured (the type measures inside the host's measure; src/uml/frame.js gives the sizes of
   what its shapes draw). Only lib/umlimator-all.js holds this file.

   input = {
     heads:  [{ id, w, h, born, ends }],         lifelines, left to right; born, ends: the row that creates it, deletes it
     rows:   [{ id, kind, a, b, w, h, parent }],  occurrences in time order (an index here is an index into view.edges).
                                                  kind 'line' (head a to head b), 'self' (a), 'span' (heads a to b: an
                                                  interaction use); w, h: its label's box (a use's: frame.js useSize);
                                                  parent: its operand, or none
     groups: [{ id, parent, tag: { w, h }, parts: [{ id, guard: { w, h } }] }],  fragments, outermost first; parts: operands
     bars:   [{ head, from, to, depth }],         activations by row (src/uml/interaction.js); depth 1 is the outermost
   }
   out = { heads: [{ id, x, y, w, h }], stems: [{ head, x, y1, y2, cross, gaps: [{ y1, y2 }] }],
           bars: [{ head, depth, x, y, w, h }], frames: [{ id, x, y, w, h, dividers: [{ part, y }], parts: [{ id, x, y, w, h, gx, gy }] }],
           spans: [{ id, x, y, w, h }], lines: [{ id, pts, lbl }], slots: [{ index, y, parent, after }], bounds, problems }
   A frame's tag is drawn at its top left corner; a part's guard at (gx, gy). Bars come deepest last, to be drawn in order.
   Problems: { level, message, ids }, never warn(). */

const TA = {
  top: 16, head: 16, // the heads' top; from the tallest head to the first row
  band: 8, // a slot's band: every slot gets its own, so no two share a y
  above: 4, after: 6, // a label's bottom to its arrow; an arrow to its row's end
  drop: 16, loop: 28, // a self-message's loop: how far down (at least its label's height), how far right of its bar
  bar: 10, step: 6, short: 14, // a bar's width; each level of depth to the right; a bar with no end of its own
  gap: 24, room: 6, // between two heads; between a label and what is beside it
  pad: 10, nest: 10, // a frame's or a use's edge outside the bars of its lifelines; each frame or use nested inside, 10 px more
  gx: 8, hdr: 4, div: 3, empty: 14, close: 8, // a guard's inset; the header under its tag; a divider to its guard; an empty operand; a frame's end
  cut: 320, hit: 12, edge: 16, tail: 24, // the widest head; half the stem's hit strip, and a gap's reach round a row; the margin; the stems past the last row
};

const taArr = x => (Array.isArray(x) ? x : []);
const taNum = x => (Number.isFinite(x) ? x : 0);

function layoutTimeAxis(input = {}) {
  const heads = taArr(input.heads), rows = taArr(input.rows), groups = taArr(input.groups), problems = [];
  const say = (level, message, ids) => problems.push({ level, message, ids });
  const col = new Map(heads.map((h, j) => [h.id, j])), cw = heads.map(h => Math.min(TA.cut, taNum(h.w))), hh = heads.map(h => taNum(h.h));
  const rowOk = i => Number.isInteger(i) && i >= 0 && i < rows.length;
  const born = heads.map(h => (h.born == null ? null : rowOk(h.born) ? h.born : (say('warning', `lifeline ${h.id}: born at row ${h.born}, which is not a row: drawn at the top`, [h.id]), null)));
  const ends = heads.map(h => (h.ends == null ? null : rowOk(h.ends) ? h.ends : (say('warning', `lifeline ${h.id}: ends at row ${h.ends}, which is not a row: its stem runs on`, [h.id]), null)));

  // operands: each one's fragment and place in it
  const opOf = new Map();
  groups.forEach(g => taArr(g.parts).forEach((p, k) => opOf.set(p.id, { g, k })));
  const chainOf = (parent, who) => { const out = [], seen = new Set();
    for (let p = parent; p != null;) { const o = opOf.get(p);
      if (!o) { say('error', `${who}: its parent ${p} is not an operand: drawn outside it`, [who]); break; }
      if (seen.has(o.g.id)) break; seen.add(o.g.id); out.unshift(o); p = o.g.parent; }
    return out; };
  // a fragment with content holds a row; one with none has no place in time and goes at the end of its parent's content
  const full = new Set();
  rows.forEach(r => { for (let p = r.parent, n = 0; p != null && n < groups.length; n++) { const o = opOf.get(p); if (!o) break; full.add(o.g.id); p = o.g.parent; } });

  // ---- down the page: rows, frames, slots
  const R = [], frames = [], slots = [], open = [], placed = new Set(), seenFrame = new Set();
  let y = TA.top + Math.max(0, ...hh.filter((_, j) => born[j] == null)) + TA.head, ri = 0, topN = 0;
  const slot = parent => { slots.push({ index: ri, y: r2(y + TA.band / 2), parent: parent ?? null, after: ri ? rows[ri - 1].id : null }); y += TA.band; };
  const partOf = L => (L ? L.g.parts[L.k].id : null);
  const item = L => { if (L ? L.n : topN) slot(partOf(L)); if (L) L.n++; else topN++; };
  const guard = (g, k) => (g.parts[k] && g.parts[k].guard) || { w: 0, h: 0 };
  const startPart = L => { L.n = 0; slot(partOf(L)); };
  const endPart = L => { orphans(partOf(L)); if (!L.n) y += TA.empty; slot(partOf(L)); L.fr.parts[L.k].bottom = y; };
  const divider = L => { L.k++; const gd = guard(L.g, L.k); L.fr.dividers.push({ part: L.g.parts[L.k].id, y });
    L.fr.parts.push({ id: L.g.parts[L.k].id, top: y, gy: y + TA.div, gw: gd.w }); y += 2 * TA.div + gd.h; };
  const advance = (L, k) => { while (L.k < k) { endPart(L); divider(L); startPart(L); } };
  function openFrag(g, k) {
    const L0 = open[open.length - 1] || null; item(L0);
    if (seenFrame.has(g.id)) say('warning', `fragment ${g.id}: its occurrences are not one run in time, operand by operand: drawn as more than one frame`, [g.id]);
    seenFrame.add(g.id); placed.add(g.id);
    const tag = g.tag || { w: 0, h: 0 }, g0 = guard(g, 0), head = Math.max(tag.h, g0.h) + TA.hdr;
    const fr = { id: g.id, g, top: y, lo: Infinity, hi: -Infinity, up: L0 ? L0.fr : null, kids: [], dividers: [], parts: [{ id: g.parts[0].id, top: y, gy: y + (tag.h - g0.h) / 2, gw: g0.w, first: true }] };
    if (fr.up) fr.up.kids.push(fr);
    frames.push(fr); y += head;
    const L = { g, k: 0, fr, n: 0 }; open.push(L); startPart(L); advance(L, k);
  }
  function closeTop() { const L = open[open.length - 1]; advance(L, L.g.parts.length - 1); endPart(L); y += TA.close; L.fr.bottom = y; open.pop(); }
  function orphans(parent) { // the fragments of this operand (or of the top) with nothing in them: at its end, each with a warning
    groups.filter(g => !full.has(g.id) && !placed.has(g.id) && taArr(g.parts).length && (g.parent === parent || (parent == null && (g.parent == null || !opOf.has(g.parent))))).forEach(g => {
      say('warning', `fragment ${g.id} holds no occurrence: it has no place in time, so it is drawn at the end of ${parent == null ? 'the interaction' : 'operand ' + parent}`, [g.id]);
      openFrag(g, 0); closeTop(); });
  }
  groups.filter(g => !taArr(g.parts).length).forEach(g => say('warning', `fragment ${g.id} has no operand: not drawn`, [g.id]));

  slot(null);
  for (; ri < rows.length;) {
    const r = rows[ri], C = chainOf(r.parent, r.id).filter(o => taArr(o.g.parts).length);
    let m = 0; while (m < open.length && m < C.length && open[m].g === C[m].g && open[m].k === C[m].k) m++;
    if (m < open.length && m < C.length && open[m].g === C[m].g && C[m].k > open[m].k) { while (open.length > m + 1) closeTop(); advance(open[m], C[m].k); m++; }
    else while (open.length > m) closeTop();
    for (; m < C.length; m++) openFrag(C[m].g, C[m].k);
    const L = open[open.length - 1] || null, ia = col.get(r.a), self = r.kind === 'self' || (r.kind === 'line' && r.a === r.b), ib = self ? ia : col.get(r.b);
    if (ia == null || ib == null || !['line', 'self', 'span'].includes(r.kind)) {
      say('error', ia == null || ib == null ? `${r.id}: ${ia == null ? r.a : r.b} is not a lifeline here: not drawn` : `${r.id}: kind "${r.kind}" is not line, self or span: not drawn`, [r.id]);
      R.push(null); ri++; continue; }
    item(L);
    const w = taNum(r.w), h = taNum(r.h), it = { r, ri, kind: r.kind === 'span' ? 'span' : self ? 'self' : 'line', a: Math.min(ia, ib), b: Math.max(ia, ib), from: ia, to: ib, w, h, top: y };
    if (it.kind === 'span') { it.y = y; it.yb = y + h; y += h; }
    else if (it.kind === 'self') { it.y = y + TA.above; it.yb = it.y + Math.max(TA.drop, h); y = it.yb + TA.after; }
    else { const nb = born[ib] === ri ? hh[ib] / 2 : 0; it.y = Math.max(y + h + TA.above, y + nb); it.yb = it.y; y = Math.max(it.y + TA.after, it.y + nb); }
    open.forEach(O => { O.fr.lo = Math.min(O.fr.lo, it.a); O.fr.hi = Math.max(O.fr.hi, it.b); });
    it.up = L ? L.fr : null; if (it.up && it.kind === 'span') it.up.kids.push(it);
    R.push(it); ri++;
  }
  while (open.length) closeTop();
  orphans(null);
  slot(null);
  const end = y + TA.tail;

  // ---- across: each head's reach either side of its stem, then the columns
  const bars = taArr(input.bars).map(b => ({ ...b, j: col.get(b.head), d: Math.max(1, Math.floor(taNum(b.depth)) || 1) })).filter(b => {
    const ok = b.j != null && rowOk(b.from) && rowOk(b.to) && R[b.from] && R[b.to] && b.to >= b.from;
    if (!ok) say('warning', `a bar on ${b.head} from row ${b.from} to row ${b.to}: ${b.j == null ? 'not a lifeline here' : 'its rows are not drawn, or end before they start'}: not drawn`, [b.head]);
    return ok; });
  const depth = heads.map((_, j) => Math.max(1, ...bars.filter(b => b.j === j).map(b => b.d)));
  const solidL = heads.map((_, j) => Math.max(TA.bar / 2, born[j] != null ? cw[j] / 2 : 0));
  const solidR = heads.map((_, j) => Math.max(TA.bar / 2 + (depth[j] - 1) * TA.step, born[j] != null ? cw[j] / 2 : 0));
  const reachR = solidR.map((s, j) => Math.max(s, ...R.filter(it => it && it.kind === 'self' && it.a === j).map(it => s + TA.loop + TA.room + it.w)));
  const adj = heads.map((_, j) => (j ? Math.max((cw[j - 1] + cw[j]) / 2 + TA.gap, reachR[j - 1] + TA.room + solidL[j]) : 0));
  const far = []; // [i, k, need]: X[k] - X[i] >= need
  const need = (i, k, d) => { if (i < 0 || k >= heads.length) return; if (k === i + 1) adj[k] = Math.max(adj[k], d); else far.push([i, k, d]); };
  R.forEach(it => { if (it && it.kind === 'line') { const n = it.from + Math.sign(it.to - it.from), i = Math.min(it.from, n); need(i, i + 1, solidR[i] + 2 * TA.room + it.w + solidL[i + 1]); } });
  // frames and uses: their edges, from the inside out (a frame's kids come after it in frames, so backwards)
  const spans = R.filter(it => it && it.kind === 'span').map(it => ({ lo: it.a, hi: it.b, kids: [], need: it.w, span: true, it }));
  frames.forEach(fr => { fr.kids = fr.kids.map(k => (k.r ? spans.find(s => s.it === k) : k)); });
  const edgeOf = b => {
    if (b.span) { b.n = 0; } else {
      b.n = Math.max(0, ...b.kids.map(k => k.n + 1));
      const tag = b.g.tag || { w: 0, h: 0 };
      b.need = Math.max(tag.w + TA.gx + b.parts[0].gw + TA.gx, ...b.parts.slice(1).map(p => 2 * TA.gx + p.gw), 2 * TA.pad);
    }
    if (!heads.length) { b.L = b.R = 0; return; }
    b.L = solidL[b.lo] + TA.pad + b.n * TA.nest; b.R = (b.span ? solidR[b.hi] : reachR[b.hi]) + TA.pad + b.n * TA.nest;
    b.kids.forEach(k => { if (k.lo === b.lo) b.L = Math.max(b.L, k.L + TA.nest); if (k.hi === b.hi) b.R = Math.max(b.R, k.R + TA.nest); });
    if (b.lo === b.hi) b.R = Math.max(b.R, b.need - b.L); else need(b.lo, b.hi, b.need - b.L - b.R);
    need(b.lo - 1, b.lo, solidR[b.lo - 1] + TA.room + b.L);
    need(b.hi, b.hi + 1, b.R + TA.room + solidL[b.hi + 1]);
    if (b.lo !== b.hi) need(b.lo, b.hi + 1, b.need - b.L + TA.room + solidL[b.hi + 1]);
  };
  frames.forEach(fr => { if (!(fr.lo <= fr.hi)) [fr.lo, fr.hi] = fr.up ? [fr.up.lo, fr.up.hi] : [0, heads.length - 1]; }); // nothing in it: its parent's lifelines
  spans.forEach(edgeOf); frames.slice().reverse().forEach(edgeOf);
  const left0 = heads.length ? Math.max(cw[0] / 2, solidL[0], ...[...spans, ...frames].filter(b => b.lo === 0).map(b => b.L)) : 0;
  const X = [];
  heads.forEach((_, j) => { X[j] = j ? X[j - 1] + adj[j] : TA.edge + left0; far.forEach(([i, k, d]) => { if (k === j) X[j] = Math.max(X[j], X[i] + d); }); });

  // ---- the pieces
  const yOf = i => R[i].y, endOf = (i, j) => { const it = R[i]; return it.kind === 'self' && it.a === j ? it.yb + TA.short : it.kind === 'span' ? it.yb : it.y; };
  const outBars = bars.map(b => { const it = R[b.from], y0 = it.kind === 'self' && it.a === b.j ? it.yb : yOf(b.from), y1 = Math.max(b.to === b.from ? y0 + TA.short : endOf(b.to, b.j), y0 + TA.short);
    return { head: b.head, depth: b.d, j: b.j, y0, y1, x: X[b.j] + (b.d - 1) * TA.step - TA.bar / 2 }; }).sort((a, b) => a.depth - b.depth);
  const active = (j, at) => outBars.filter(b => b.j === j && b.y0 <= at + .5 && at - .5 <= b.y1).pop() || null; // the deepest
  const side = (j, b, dir) => (b ? X[j] + (b.depth - 1) * TA.step + dir * TA.bar / 2 : X[j]);
  const outHeads = heads.map((h, j) => ({ id: h.id, x: r2(X[j] - cw[j] / 2), y: r2(born[j] != null && R[born[j]] ? yOf(born[j]) - hh[j] / 2 : TA.top), w: r2(cw[j]), h: r2(hh[j]) }));
  const lines = [];
  R.forEach(it => { if (!it || it.kind === 'span') return;
    if (it.kind === 'self') { const j = it.a, sx = side(j, active(j, it.y), 1), ex = side(j, active(j, it.yb), 1), lx = Math.max(sx, ex) + TA.loop;
      it.pts = [[sx, it.y], [lx, it.y], [lx, it.yb], [ex, it.yb]]; it.lbl = { x: lx + TA.room, y: it.y + (it.yb - it.y - it.h) / 2, w: it.w, h: it.h }; }
    else { const dir = Math.sign(it.to - it.from), sx = side(it.from, active(it.from, it.y), dir);
      const ex = born[it.to] === it.ri ? X[it.to] - dir * cw[it.to] / 2 : side(it.to, active(it.to, it.y), -dir);
      const n = it.from + dir, near = n === it.to ? ex : dir > 0 ? X[n] - solidL[n] : X[n] + solidR[n], cx = (sx + near) / 2;
      it.pts = [[sx, it.y], [ex, it.y]]; it.lbl = { x: cx - it.w / 2, y: it.y - TA.above - it.h, w: it.w, h: it.h }; }
    lines.push({ id: it.r.id, pts: it.pts.map(p => p.map(r2)), lbl: { x: r2(it.lbl.x), y: r2(it.lbl.y), w: r2(it.w), h: r2(it.h) } }); });
  const boxX = b => (heads.length ? [X[b.lo] - b.L, Math.max(X[b.hi] + b.R, X[b.lo] - b.L + b.need)] : [TA.edge, TA.edge + b.need]);
  const outSpans = spans.map(s => { const [x0, x1] = boxX(s); s.it.box = [x0, x1]; return { id: s.it.r.id, x: r2(x0), y: r2(s.it.y), w: r2(x1 - x0), h: r2(s.it.h) }; });
  const outFrames = frames.map(fr => { const [x0, x1] = boxX(fr);
    return { id: fr.id, x: r2(x0), y: r2(fr.top), w: r2(x1 - x0), h: r2(fr.bottom - fr.top), dividers: fr.dividers.map(d => ({ part: d.part, y: r2(d.y) })),
      parts: fr.parts.map(p => ({ id: p.id, x: r2(x0), y: r2(p.top), w: r2(x1 - x0), h: r2(p.bottom - p.top), gx: r2(x0 + (p.first ? (fr.g.tag || { w: 0 }).w + TA.gx : TA.gx)), gy: r2(p.gy) })) }; });

  // stems, each cut round every row it lies under (S3): a row's label and arrow (a loop's too), 12 px above and below
  const reach = it => { if (it.kind === 'span') return [it.box[0], it.box[1], it.y, it.yb];
    const xs = [...it.pts.map(p => p[0]), it.lbl.x, it.lbl.x + it.w];
    return [Math.min(...xs), Math.max(...xs), Math.min(it.lbl.y, it.y - TA.hit), Math.max(it.yb, it.lbl.y + it.h) + TA.hit]; };
  const bands = R.filter(Boolean).map(reach);
  const stems = heads.map((h, j) => { const y1 = outHeads[j].y + hh[j], y2 = Math.max(y1, ends[j] != null && R[ends[j]] ? yOf(ends[j]) : end), gaps = [];
    bands.filter(([a, b]) => X[j] + TA.hit > a && X[j] - TA.hit < b).map(([, , t, u]) => [Math.max(t, y1), Math.min(u, y2)]).filter(([t, u]) => u > t).sort((p, q) => p[0] - q[0])
      .forEach(([t, u]) => { const g = gaps[gaps.length - 1]; if (g && t <= g[1]) g[1] = Math.max(g[1], u); else gaps.push([t, u]); });
    return { head: h.id, x: r2(X[j]), y1: r2(y1), y2: r2(y2), cross: ends[j] != null && !!R[ends[j]], gaps: gaps.map(([t, u]) => ({ y1: r2(t), y2: r2(u) })) }; });

  const xs = [...outHeads.flatMap(h => [h.x, h.x + h.w]), ...outFrames.flatMap(f => [f.x, f.x + f.w]), ...outSpans.flatMap(s => [s.x, s.x + s.w]),
    ...lines.flatMap(l => [...l.pts.map(p => p[0]), l.lbl.x, l.lbl.x + l.lbl.w])];
  const x0 = Math.min(0, ...xs.map(x => x - TA.edge)), x1 = Math.max(TA.edge, ...xs.map(x => x + TA.edge));
  return {
    heads: outHeads, stems, lines, spans: outSpans, frames: outFrames, slots,
    bars: outBars.map(b => ({ head: b.head, depth: b.depth, x: r2(b.x), y: r2(b.y0), w: TA.bar, h: r2(b.y1 - b.y0) })),
    bounds: { x: r2(x0), y: 0, w: r2(x1 - x0), h: r2(end + TA.edge) }, problems,
  };
}

export { TA, layoutTimeAxis };
