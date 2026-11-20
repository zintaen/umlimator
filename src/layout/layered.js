import { EDGE_BREAK, EDGE_LH, brLines, fit, linesW, sansW, textW, widest } from '../core/text.js';
import { behind, detour, onBorder, routeAudit } from './audit.js';
import { edgeRefIds } from '../map/api.js';
import { badgesOf, mapNodeW, mapTabs, toneOf } from '../map/cards.js';
import { warn } from '../core/warn.js';
import { kindOf } from '../map/kinds.js';
import { TYPED, idTable } from '../core/registry.js';

const CHG = Object.assign(Object.create(null), { added: ['green', 'NEW'], new: ['green', 'NEW'], modified: ['amber', 'CHANGED'], changed: ['amber', 'CHANGED'], removed: ['rose', 'REMOVED'], planned: ['cyan', 'PLANNED'] }); // no prototype: a change named constructor is none
// a line's fromSide or toSide, as its side's letter; no prototype: a side named toString is none, as validate() says (audit 28: it was a function)
const EDGE_SIDE = Object.assign(Object.create(null), { left: 'L', right: 'R', top: 'T', bottom: 'B' });
const NW = 168, CG0 = 84, RG0 = 44;
const pillW = (label, sub, max = 440) => Math.max(sansW(fit(label, 10.5, max), 10.5, .92), sub ? sansW(fit(sub, 9.5, max), 9.5, .92) : 0) + 18; // a line's label, and its sublabel under it (#44)
const stepW = s => String(s).length > 1 ? Math.max(20, sansW(String(s), 9.5, .9) + 8) : 16; // a line's step mark: a 16 px circle, or a pill for 2a, 12 or 4.1 (#82)
// steps in order: numbers by value, text by its leading number and then the rest (2 < 2a < 2b < 3); no step last
const stepKey = s => { const t = String(s ?? ''), m = /^\d+(?:\.\d+)?/.exec(t); return [s == null ? 1 : 0, m ? +m[0] : Infinity, m ? t.slice(m[0].length) : t]; };
const stepOrder = (a, b) => { const p = stepKey(a), q = stepKey(b); return p[0] - q[0] || p[1] - q[1] || (p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : 0); };
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
// a plain (not a map's) line label's width: one line of 10 px text, its step first, as layoutPass's sizeOf measures it
// a line whose route layoutPass draws itself in a typed view: 'loop' (a node to itself) or 'fan'. A symbol, so no field of a
// model's line can set it
const OWN_ROUTE = Symbol('own route');
// a typed view laid out as before audit 38 (layoutTyped's try when the new one leaves check() something to say): a symbol, so
// no field of a model's view can set it
const PLAIN = Symbol('plain');
// a typed view whose lines to one card took its top and bottom by turns though the card's other lines go elsewhere (audit 39),
// laid out without those turns too (layoutTyped): a symbol, so no field of a model's view can set it
const TURNS = Symbol('turns');
// a typed view whose box side, past its title, had no room for its lines and grew over the title (audit 44), laid out without
// that too (layoutTyped): a symbol, as TURNS
const SPAN = Symbol('span');
// a typed view's labels placed only once routing was done, on a looser spot (layoutPass's last try): they ask for room as a lost one does
const LOOSE = new WeakSet();
// gridRoute's working arrays, kept between its searches and cleared for each: a fresh set for every search (a view of 90 cards
// makes some 270, on grids of up to 64000 cells) was most of a route's time spent in allocating and collecting them. Kept for
// grids of up to GR_MAX cells (some 15 MB), and a heap of up to a million items; a bigger one is made for its search alone
const GR_MAX = 1 << 18, GR_POOL = { n: 0, hn: 0 };
const grPool = N => { const P = N > GR_MAX ? { n: 0, hn: 0 } : GR_POOL; if (P.n < N) { const n = P === GR_POOL ? Math.min(GR_MAX, Math.max(N, 2 * P.n)) : N;
    P.u8 = Array.from({ length: 7 }, () => new Uint8Array(n)); P.near = new Uint8Array(2 * n); P.dist = new Float64Array(4 * n); P.prev = new Int32Array(4 * n); P.n = n; }
  if (!P.hn || P.hn > 1 << 20) { P.hd = new Float64Array(256); P.hk = new Int32Array(256); P.hn = 256; }
  return P; };
const labelW = e => widest(String((e.step != null ? e.step + ' · ' : '') + (e.label || '')).split(EDGE_BREAK), r => textW(fit(r, 10, e.cut || 150), 10)) + 12; // its widest line

/* Layered auto-layout for views that carry no col/row: longest-path layers (cycles broken by DFS),
   barycentre ordering sweeps, integer rows so row gaps stay free as routing channels. */
/* Lines cross as little as the order of the cards in a column allows (#53): a few barycentre sweeps (each card goes where
   its neighbours in the next or previous column lie, its place now breaking ties), and the best order found is kept only
   when it crosses less than the order given. A line that skips columns has a point in each column it passes (Sugiyama's
   dummy nodes), so it orders the cards it runs between too. cols: columns of ids in reading order, changed in place;
   links: [a, b] with b in a later column.
   A box is one item of its column, h(id) rows tall, and a line meets it at the row of its card inside (#86): [a, b, oa, ob]
   leaves a at row oa inside it and reaches b at row ob, as rowsFor's links do (the middle when not given). Each line into a
   box has its own entry, so two that cross on the way in to its cards count as crossing; they all met it at one point.
   fixed: items at a set row in columns of their own, which stay as they are (a box's far ends, in blockPos). */
function untangle(cols, links, h = () => 1, fixed = Object.create(null)) { // maps by id: no prototype (M3)
  const colOf = Object.create(null); cols.forEach((c, k) => c.forEach(id => { colOf[id] = k; }));
  const segs = [], extra = new Set(), want = Object.create(null), hh = id => extra.has(id) ? 1 : h(id), mid = (id, o) => o ?? (hh(id) - 1) / 2;
  const tops = () => { const at = Object.create(null); cols.forEach(c => { let r = 0; c.forEach(id => { at[id] = fixed[id] ?? r; r += hh(id); }); }); return at; }; // each item's top row
  const at0 = tops();
  links.forEach(([a, b, oa, ob], n) => {
    const ka = colOf[a], kb = colOf[b]; if (ka == null || kb == null || kb <= ka) return;
    let prev = a, po = mid(a, oa); const ra = at0[a] + po, rb = at0[b] + mid(b, ob);
    for (let k = ka + 1; k < kb; k++) { // a point first goes where the straight line between its ends would be
      const p = '\u0001' + n + '.' + k; extra.add(p); colOf[p] = k; want[p] = ra + (rb - ra) * (k - ka) / (kb - ka);
      segs.push([prev, p, po, 0]); prev = p; po = 0; }
    segs.push([prev, b, po, mid(b, ob)]);
  });
  if (extra.size) cols.forEach((c, k) => { const ps = [...extra].filter(p => colOf[p] === k);
    if (ps.length) cols[k] = [...c.map(id => [id, at0[id], 0]), ...ps.map(p => [p, want[p], 1])].sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(x => x[0]); });
  const ins = Object.create(null), outs = Object.create(null); segs.forEach(([a, b, oa, ob]) => { (outs[a] ||= []).push([b, ob, oa]); (ins[b] ||= []).push([a, oa, ob]); });
  // two lines out of one column cross when their order at its end is the other way round from their order at their start (a
  // tie either end is no crossing): sorted by their start (ties by their end), the crossings are the pairs an earlier one ends
  // below a later one, counted with a Fenwick tree over their ends. Each pair tested made a view of 150 lines into one card,
  // which pass through some 30 columns, spend a second here (audit 55)
  const crossings = () => { const at = tops(); let n = 0; const byCol = new Map();
    for (const [a, b, oa, ob] of segs) { const k = colOf[a]; let L = byCol.get(k); if (!L) byCol.set(k, L = []); L.push([at[a] + oa, at[b] + ob]); }
    for (const L of byCol.values()) { if (L.length < 2) continue; L.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const vs = [...new Set(L.map(p => p[1]))].sort((x, y) => x - y), rank = new Map(vs.map((v, i) => [v, i + 1])), bit = new Int32Array(vs.length + 1);
      L.forEach(([, v], seen) => { const r = rank.get(v); let le = 0; for (let i = r; i > 0; i -= i & -i) le += bit[i]; n += seen - le; for (let i = r; i <= vs.length; i += i & -i) bit[i]++; }); }
    return n; };
  let best = segs.length > 1 ? crossings() : 0, keep = cols.map(c => c.slice()); // the order given, unless one crosses less
  for (let it = 0; it < 8 && best; it++) {
    const down = it % 2 === 0, seq = cols.map((_, k) => k).filter(k => (down ? k > 0 : k < cols.length - 1) && !cols[k].every(id => id in fixed));
    if (!down) seq.reverse();
    for (const k of seq) { const at = tops(), side = down ? k - 1 : k + 1; // where each item would be for its lines to run level
      const key = id => { const nb = ((down ? ins : outs)[id] || []).filter(([x]) => colOf[x] === side).map(([x, ox, o]) => at[x] + ox - o);
        return nb.length ? nb.reduce((x, y) => x + y, 0) / nb.length : at[id]; };
      cols[k] = cols[k].map((id, i) => [id, key(id), i]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map(x => x[0]); }
    const n = crossings(); if (n < best) { best = n; keep = cols.map(c => c.slice()); }
  }
  keep.forEach((c, k) => { cols[k] = c.filter(id => !extra.has(id)); });
}
/* A card no line comes into goes just before its nearest callee, not in the first column: its lines get shorter. Returns
   the ranks with it moved, or null when none moves (bestFlow keeps them when they route better). */
function pullSources(ids, links, rank) {
  const into = new Set(links.map(([, b]) => b)); let moved = false; const out = { ...rank };
  ids.forEach(i => { const to = links.filter(([a]) => a === i).map(([, b]) => rank[b]).filter(r => r != null);
    if (to.length && !into.has(i) && Math.min(...to) - 1 > rank[i]) { out[i] = Math.min(...to) - 1; moved = true; } });
  return moved ? out : null;
}
/* Rows for ordered columns: each card level with the cards its lines come from (the median row), then with those they go
   to, then again from the left, as near as the order allows with its height between it and the next (least squares: pool
   adjacent violators); on half rows from 0. A line between cards on one row runs straight, past fewer cards. h: an item's
   height in rows (a box in a view with boxes); a link [a, b, oa, ob] leaves a at row oa inside it and reaches b at row
   ob (a box's card), else at its middle. fixed: items at a set row, in columns of their own that stay (as untangle's). */
function rowsFor(cols, links, h = () => 1, fixed = Object.create(null)) {
  const row = Object.create(null); if (!cols.length) return row; // an empty view
  const colOf = Object.create(null); cols.forEach((c, k) => { let r = 0; c.forEach(id => { row[id] = fixed[id] ?? r; r += h(id); colOf[id] = k; }); });
  const ins = Object.create(null), outs = Object.create(null), at = (id, o) => o ?? (h(id) - 1) / 2; // where a link meets an item, in rows from its top
  links.forEach(([a, b, oa, ob]) => { if (colOf[a] == null || colOf[b] == null || colOf[b] <= colOf[a]) return;
    (outs[a] ||= []).push([b, at(b, ob), at(a, oa)]); (ins[b] ||= []).push([a, at(a, oa), at(b, ob)]); });
  const median = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fit = (list, want) => { const blocks = []; let off = 0;
    list.forEach(id => { blocks.push({ ids: [id], sum: want[id] - off, n: 1 }); off += h(id);
      while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).n > blocks.at(-1).sum / blocks.at(-1).n) { const b = blocks.pop(), a = blocks.at(-1); a.ids.push(...b.ids); a.sum += b.sum; a.n += b.n; } });
    off = 0; blocks.forEach(b => b.ids.forEach(id => { row[id] = b.sum / b.n + off; off += h(id); })); };
  for (const [from, to, step] of [[1, cols.length, 1], [cols.length - 2, -1, -1], [1, cols.length, 1]])
    for (let k = from; k !== to; k += step) { if (cols[k].every(id => id in fixed)) continue; const want = Object.create(null);
      cols[k].forEach(id => { const nb = (step > 0 ? ins : outs)[id] || []; want[id] = nb.length ? median(nb.map(([x, ox, o]) => row[x] + ox - o)) : row[id]; });
      fit(cols[k], want); }
  const low = Math.min(...Object.keys(row).filter(id => !(id in fixed)).map(id => row[id]));
  cols.forEach(c => !c.every(id => id in fixed) && c.forEach((id, i) => { row[id] = Math.round((row[id] - low) * 2) / 2; if (i) row[id] = Math.max(row[id], row[c[i - 1]] + h(c[i - 1])); }));
  return row;
}
/* A typed view's pins, settled (audit 58): two pins on one cell, a pin on the cell of a card in a box it is not in or in such
   a box's cells, or one that grows its own box over a card or box it does not hold, drew one thing over another (Alt + an
   arrow, or a drag, onto any of them). The pins are taken in order, each kept where it is clean, else moved to the nearest
   clean slot: a row down, then up, then across, then a ring further out, as far as the cards placed reach and two cells past.
   With none there (its box hemmed in, a pin far off: audit 59), it goes in a fresh row under its box, what lies below moved
   down to make it, which is always clean. pins: [[id, [col, row]]]; at: the other cards that hold a place (by id); up(id): the
   boxes a card, or a box, lies in, innermost first; fixed: those of them whose cell no pin shares, in a box or not. A box's
   cells run from its cards' first column and row to their last, a card more than half a row (column) into them in it (as
   boxFit, src/map/context.js). The result: the pins' cells by id, and under MOVED the other cards a fresh row moved down.
   Each box's cells are found once a pin, not once a cell tried (audit 59: seconds a layout) */
const MOVED = Symbol('moved');
function settlePins(pins, at, up, fixed = null, rows = .5) { // rows: how far past a box's last row a card is in it (1: a whole row)
  const pos = Object.assign(Object.create(null), at), out = Object.create(null), moved = Object.create(null), ups = Object.create(null), upOf = x => (ups[x] ||= up(x) || []);
  const boxes = [...new Set([...Object.keys(pos), ...pins.map(p => p[0])].flatMap(upOf))];
  const over = (R, c, r) => !!R && c > R.c0 - .5 && c < R.c1 + .5 && r > R.r0 - rows && r < R.r1 + rows, meet = (A, B) => !!A && !!B && A.c0 < B.c1 + .5 && B.c0 < A.c1 + .5 && A.r0 < B.r1 + rows && B.r0 < A.r1 + rows;
  const grow = (R, c, r) => (R ? { c0: Math.min(R.c0, c), c1: Math.max(R.c1, c), r0: Math.min(R.r0, r), r1: Math.max(R.r1, r) } : { c0: c, c1: c, r0: r, r1: r });
  pins.forEach(([i, p]) => { let q = p; delete pos[i];
    const R = Object.create(null), col = new Map(), ui = upOf(i), mine = new Set(Object.keys(out)); // each box's cells, and the cards by column, as placed so far
    for (const j in pos) { const [c, r] = pos[j]; upOf(j).forEach(b => { R[b] = grow(R[b], c, r); }); if (!col.has(c)) col.set(c, []); col.get(c).push(j); }
    const clean = (c, r) => {
      for (const j of col.get(c) || []) if (Math.abs(pos[j][1] - r) < 1 && (mine.has(j) || fixed && fixed.has(j) || upOf(j).some(b => !ui.includes(b)))) return false; // an earlier pin's cell, or a card of a box it is not in
      for (const b of boxes) { if (ui.includes(b)) continue; if (over(R[b], c, r)) return false; } // in such a box's cells
      for (const b of ui) { const R0 = R[b], R1 = grow(R0, c, r); if (R0 && R1.c0 === R0.c0 && R1.c1 === R0.c1 && R1.r0 === R0.r0 && R1.r1 === R0.r1) continue; // not grown
        for (const j in pos) if (!upOf(j).includes(b) && over(R1, ...pos[j]) && !over(R0, ...pos[j])) return false; // its box grown over a card it does not hold
        for (const o of boxes) if (o !== b && !ui.includes(o) && !upOf(o).includes(b) && meet(R1, R[o]) && !meet(R0, R[o])) return false; } // or over another box
      return true; };
    if (!clean(p[0], p[1])) { let c0 = p[0], c1 = p[0], r0 = p[1], r1 = p[1]; for (const j in pos) { const [c, r] = pos[j]; c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
      c0 -= 2; c1 += 2; r0 -= 2; r1 += 2; // the cells tried: as far as the cards placed reach, and two past
      const lim = Math.min(pins.length + Object.keys(pos).length + 4, Math.max(p[0] - c0, c1 - p[0]) + Math.max(p[1] - r0, r1 - p[1])), neg = (v, v0) => v < 0 && v0 >= 0; q = null;
      for (let m = 1; !q && m <= lim; m++) { const ring = []; for (let dc = -m; dc <= m; dc++) { const k = m - Math.abs(dc); ring.push([dc, k]); if (k) ring.push([dc, -k]); }
        ring.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]) || (a[1] < 0) - (b[1] < 0) || (a[0] < 0) - (b[0] < 0));
        for (const [dc, dr] of ring) { const c = p[0] + dc, r = p[1] + dr; if (c < c0 || c > c1 || r < r0 || r > r1 || neg(c, p[0]) || neg(r, p[1])) continue; if (clean(c, r)) { q = [c, r]; break; } } }
      if (!q) { // a fresh row under its innermost box with cards placed, in the column nearest the pin; with none, under every card
        const b = ui.find(x => R[x]), B = b ? R[b] : null, low = B ? B.r1 : Math.max(p[1], ...Object.values(pos).map(x => x[1]));
        const below = Object.keys(pos).filter(j => pos[j][1] > low), d = B && below.length ? Math.max(0, Math.ceil(low + 2 - Math.min(...below.map(j => pos[j][1])))) : 0;
        if (d) below.forEach(j => { pos[j] = [pos[j][0], pos[j][1] + d]; if (mine.has(j)) out[j] = pos[j]; else moved[j] = pos[j]; });
        q = B ? [Math.min(B.c1, Math.max(B.c0, p[0])), low + 1] : [p[0], Math.floor(low) + 2]; } }
    out[i] = pos[i] = q; });
  Object.defineProperty(out, MOVED, { value: moved });
  return out;
}
/* A view that ranks its own cards (component, BPMN, requirement) with pins: at, its ranked cells by id, the pins [[id, cell]]
   settled (settlePins) and put in, then each other card, in order, at its cell, or down a row while a card is there, and on
   to the nearest clean slot when its box would grow there over what it does not hold (the component gallery's Basket pinned
   on Checkout's cell, Checkout down past Payment provider). at is changed and returned */
function pinCells(at, P, up, order = Object.keys(at)) {
  const pinned = new Set(P.map(([id]) => id)), S = settlePins(P, Object.fromEntries(Object.entries(at).filter(([id]) => !pinned.has(id))), up), held = new Set(pinned);
  let taken = P.map(([id]) => S[id]); const free = (c, r) => !taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1);
  P.forEach(([id]) => { at[id] = S[id]; }); Object.assign(at, S[MOVED]); // what a fresh row a pin went in moved down
  order.forEach(id => { if (pinned.has(id) || !Object.hasOwn(at, id)) return; let [c, r] = at[id]; if (!free(c, r)) { while (!free(c, r)) r++;
    const rest = Object.assign(Object.create(null), at); delete rest[id]; const S2 = settlePins([[id, [c, r]]], rest, up, held); [c, r] = S2[id];
    if (Object.keys(S2[MOVED]).length) { Object.assign(at, S2[MOVED]); taken = [...held].map(h => at[h]); } }
    at[id] = [c, r]; taken.push([c, r]); held.add(id); });
  return at;
}
/* Geometry: node boxes, ports, orthogonal routes, label slots. A view with lines the router found no route for is laid
   out once more, with room where those lines need it (#40); a view whose lines all route keeps its geometry. */
function layoutGraph(dg, map) {
  let g = layoutPass(dg, map, null), rr = g.rr, turns = g.turns, grew = g.grew;
  if (g.room) { const g2 = layoutPass(dg, map, g.room, true); g2.ms.probe = g.ms.probe; g = g2; rr ||= g.rr; turns ||= g.turns; grew ||= g.grew; }
  // a label with no room where it fits: the view laid out again with room for it, kept with fewer issues and labels cut short
  if (g.labelRoom) { const g2 = layoutPass(dg, map, g.labelRoom, true), cut = h => h.edges.reduce((n, e) => n + (e.label || e.step != null ? !e.lbl ? 2 : e.lbl.short || LOOSE.has(e) ? 1 : 0 : 0), 0); // a label not drawn the worst
    delete g.labelRoom; rr ||= g2.rr; turns ||= g2.turns; grew ||= g2.grew; if (routeAudit(g2, '').length + cut(g2) < routeAudit(g, '').length + cut(g)) g = g2; }
  if (turns) g.turns = true; // layoutTyped judges those turns
  if (grew) g.grew = true; // and a side grown over a box's title
  if (rr) g.rr = true; // a typed view's request/reply swap kept: buildGeo (context.js) judges it by the finished picture
  // two lines that still cross: one takes another side, and the view is laid out so once more, kept if it has fewer issues. A
  // line that closes a loop leaves its source on the far side, out round the map as a loop under the boxes does, and still comes
  // in on its target's near side (clinic's reminder, from the SMS gateway under Patient records, crossed the line into Patient
  // records); of two other lines, the steeper comes into its target's top or bottom (clinic's "Sends texts" with Clinic bookings
  // unfolded, up past Patient records into the SMS gateway's bottom). ponytail: a layout more, so only up to 30 cards (as
  // bestFlow); a larger view keeps its crossings
  const refs = [], pairs = map && !dg.quick && !dg.flipped && dg.nodes.length <= 30 ? routeAudit(g, '', null, refs).flatMap((s, k) => s.endsWith(' cross') ? [refs[k]] : []) : [];
  const far = { L: 'right', R: 'left', T: 'bottom', B: 'top' }, dy = e => (e.s.y + e.s.h / 2) - (e.t.y + e.t.h / 2), out = new Map();
  pairs.forEach(p => p.forEach(e => { if (e.back && !e.fixed && !e.fromSide) out.set(e.from + '>' + e.to, ['fromSide', far[e.fs]]); }));
  pairs.forEach(p => { const e = p.filter(e => !e.back && !e.fixed && !e.toSide && /[LR]/.test(e.ts) && dy(e)).sort((a, b) => Math.abs(dy(b)) - Math.abs(dy(a)))[0];
    if (e && !p.some(o => out.has(o.from + '>' + o.to))) out.set(e.from + '>' + e.to, ['toSide', dy(e) > 0 ? 'bottom' : 'top']); });
  let best = g, bestDg = dg, n = pairs.length ? routeAudit(g, '').length : 0;
  const attempt = d => { const h = layoutGraph({ ...d, flipped: true }, map), k = routeAudit(h, '').length; if (k < n) { best = h; bestDg = d; n = k; } };
  if (out.size) attempt({ ...dg, edges: dg.edges.map(e => out.has(e.from + '>' + e.to) ? { ...e, [out.get(e.from + '>' + e.to)[0]]: out.get(e.from + '>' + e.to)[1] } : e) });
  // two lines that still cross where neither can take another side without crossing the other (two cards that each feed the
  // same two cards, as web and admin feed kit and api-client in r15's monorepo, issue 111): one of them goes round the outside,
  // out its source's far side and into its target's top (bottom) from beyond. Of the first two crossing pairs, the lines from
  // two cards that both feed both their targets are tried first, then the pairs' own lines, each on its own (on the layout kept so far,
  // and on the first), and the best layout kept. ponytail: up to four layouts more, on views of up to 30 cards; r19/plain takes
  // about four times as long for them, and gains nothing
  const r2 = [], left = n && best !== g ? routeAudit(best, '', null, r2).flatMap((s, k) => s.endsWith(' cross') ? [r2[k]] : []) : pairs;
  const feeds = (s, t) => best.edges.some(o => o.s === s && o.t === t), both = ([a, b]) => { const k = a.t !== b.t && best.edges.filter(o => [a.t, b.t].includes(o.t) && feeds(o.s, a.t) && feeds(o.s, b.t)); return k && k.length >= 4 ? k : []; };
  const round = [...new Set([...left.slice(0, 2).flatMap(both), ...left.slice(0, 2).flat()])].filter(e => !e.back && !e.fixed && !e.fromSide && !e.toSide && /[LR]/.test(e.fs) && /[LR]/.test(e.ts));
  let tries = 4;
  round.forEach(e => { const side = { fromSide: e.fs === 'R' ? 'left' : 'right', toSide: dy(e) >= 0 ? 'top' : 'bottom' };
    [...new Set([bestDg, dg])].forEach(d => { if (n && tries-- > 0) attempt({ ...d, edges: d.edges.map(x => x.from === e.from && x.to === e.to ? { ...x, ...side } : x) }); }); });
  // fan-in (issue 149): lines into a card that six or more lines come into still cross. One line of such a pair at a time, of
  // the first pair first, goes round the outside (out its source's far side, or into its target's), or its target moves to
  // the foot of its column; a layout with fewer such crossings and no more issues is kept, and the search goes on from it; the
  // view keeps the one found only when it has fewer issues than at the start.
  // r19's logger: boxed 5 → 1, plain 6 → 3. ponytail: 14 layouts more at most, on views of up to 30 cards; a crossing-aware
  // placement would reach plain's last ones (search beside db)
  const fan = Object.create(null); best.edges.forEach(e => { if (!e.back) fan[e.to] = (fan[e.to] || 0) + 1; });
  if (map && dg.fan && !dg.quick && !dg.flipped && dg.nodes.length <= 30 && Object.values(fan).some(k => k >= 6)) {
    const audit = h => { const r = [], is = routeAudit(h, '', null, r), hot = r.filter((p, k) => / (cross|share a line)$/.test(is[k]) && p.some(e => fan[e.to] >= 6));
      return { hot, n: is.length }; };
    const far = { L: 'right', R: 'left', T: 'bottom', B: 'top' }, tried = new Set(), start = audit(best), g0 = [best, bestDg], lined = new Set(dg.edges.flatMap(e => [e.from, e.to]));
    let cur = start, left = 14;
    const ways = e => [['fromSide', far[e.fs]], ['toSide', far[e.ts]], ['foot', e.to]].map(([k, s]) => {
      if (k !== 'foot') return !e[k] && s && { key: e.from + '>' + e.to + k, d: { ...bestDg, edges: bestDg.edges.map(x => x.from === e.from && x.to === e.to ? { ...x, [k]: s } : x) } };
      const nodes = bestDg.nodes.map(n => ({ ...n })), me = nodes.find(n => n.id === s), col = nodes.filter(n => n !== me && n.col === me.col), rows = col.filter(n => lined.has(n.id)).map(n => n.row);
      if (!rows.length || me.row > Math.max(...rows)) return null; const r = Math.max(...rows) + 1;
      col.forEach(n => { if (!lined.has(n.id) && n.row > r - 1) n.row++; }); me.row = r; // cards with no line stay under it
      return { key: 'foot ' + s, d: { ...bestDg, nodes } }; });
    for (let more = true; more && cur.hot.length && left > 0;) { more = false;
      for (const e of [...new Set(cur.hot.flat())]) { if (more || e.back || e.fixed) continue;
        for (const w of ways(e)) { if (more || left <= 0 || !w || tried.has(w.key)) continue; tried.add(w.key); left--;
          const h = layoutGraph({ ...w.d, flipped: true }, map), a = audit(h);
          if (a.n <= cur.n && (a.hot.length < cur.hot.length || a.hot.length === cur.hot.length && a.n < cur.n)) { best = h; bestDg = w.d; cur = a; more = true; } } } }
    if (cur.n >= start.n) [best, bestDg] = g0; // kept only with fewer issues
  }
  return best;
}
function layoutPass(dg, map, room, last) { // room: { x: { col: px }, y: { row: px } } (lx, ly: a label's, past the boxes'); last: lay out with it, find no more
  const __ms = { t: performance.now() }, t0 = __ms.t, NEST = !map && !!dg.typed && !!dg.nest && !dg[PLAIN]; let used = false, turns = false, grew = false; // NEST: audit 38's ways (PLAIN); used: one of them changed the layout
  const px = x => typeof x === 'number' && x > 0 ? Math.min(x, 2000) : 0; // a gap that is no positive number is the default (audit 9)
  const CG = px(dg.gap) || (map ? (dg.mainSteps && !(Array.isArray(dg.containers) && dg.containers.length) ? 38 : 66) : CG0), RG = px(dg.rgap) || (map ? 44 : RG0); // family borders also need clearance between columns; containers: [] is no boxes (audit 38)
  const NH = dg.nodeH || 64, pitch = NH + RG;
  const C = map ? 16 : 12, STUB = dg.mainSteps ? C : C + 6, SEP = 10; // maps: 16 px clear of other nodes
  const lim = (dg.nodes || []).length + 64, cl = v => Math.max(-lim, Math.min(lim, v)); // a pin far off the grid (1e6, 1e308) is held at its edge: the column and row loops walk every index between
  const nodes = (dg.nodes || []).map((n, i) => {
    const k = kindOf(n.kind, map);
    const w = n.w || (map ? mapNodeW(n) : NW);
    return { ...n, k, col: cl(n.col ?? i), row: cl(n.row ?? 0), w, h: n.h || NH };
  });
  const byId = idTable(Object.fromEntries(nodes.map(n => [n.id, n]))); // a card named constructor is found only if drawn
  const cols = dg.abs ? [] : [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const colX = {}, colW = {}; let x = 0;
  // a card with no line, in a row under every card that has one, sits in a row of its own (#46): it never widens a column
  const ends = new Set((dg.edges || []).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), low = Math.max(-Infinity, ...nodes.filter(n => ends.has(n.id)).map(n => n.row));
  if (low === -Infinity) ends.clear(); // no lines at all: no such row
  const boxed = new Set((dg.containers || []).flatMap(f => f.nodeIds || [])); // a box's row keeps to the box's columns
  nodes.forEach(n => { n.aside = map && !dg.abs && !ends.has(n.id) && n.row > low && !boxed.has(n.id); });
  cols.forEach(c => { const ns = nodes.filter(n => n.col === c && !n.aside); if (ns.length) colW[c] = Math.max(...ns.map(n => n.w)); });
  // a labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side (a
  // numbered line with no label: for its step mark). A typed view's too, so lines between one pair keep their own labels (risks.md F2)
  const gapAfter = {}, colOf = Object.create(null), boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if ((map || dg.typed) && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);
    // labelled lines that leave (or reach) one card side by side run 16 px apart, too close for their pills to stack,
    // so the pills sit next to each other: the gap fits them all, with 6 px between pills
    const sum = {};
    // a line to a container ends on its box's border, beside the box's nearest column of cards
    const inBox = (b, seen = new Set()) => { const c = !seen.has(b) && seen.add(b) && (dg.containers || []).find(f => f.id === b);
      return c ? [...(c.nodeIds || []), ...(dg.containers || []).filter(k => k.parent === b).flatMap(k => inBox(k.id, seen))] : []; };
    const near = (b, other) => { const cs = inBox(b).map(i => colOf[i]).filter(c => c != null); if (other == null || !cs.length) return null;
      const lo = Math.min(...cs), hi = Math.max(...cs); return other < lo ? lo : other > hi ? hi : null; };
    // a box in a box (an unfolded numbered view's lane, #82, or any nested box): a line to a card in one, or to the box that
    // holds it, crosses two borders
    const inLane = id => (dg.containers || []).some(f => f.parent && (f.parent === id || (f.nodeIds || []).includes(id)));
    (dg.edges || []).forEach(e => { const p = colOf[e.from] ?? near(e.from, colOf[e.to]), q = colOf[e.to] ?? near(e.to, colOf[e.from]); if (p == null || q == null || (!e.label && e.step == null) || Math.abs(p - q) !== 1) return;
      const c = Math.min(p, q), w = !map ? (dg.turned ? 18 : labelW(e)) : (e.label ? pillW(e.label, e.sublabel) : 0) + (e.step != null ? stepW(e.step) + (e.label ? 4 : 6) : 0), box = boxOf(e.from) !== boxOf(e.to) || !(e.from in colOf) || !(e.to in colOf) ? 48 + ([e.from, e.to].some(inLane) ? 12 : 0) : 0;
      gapAfter[c] = Math.max(gapAfter[c] || 0, w + 54 + box);
      [e.from, e.to].forEach(id => { const k = c + '|' + id, t = sum[k] ||= { w: -6, box: 0 }; t.w += w + 6; t.box = Math.max(t.box, box); gapAfter[c] = Math.max(gapAfter[c], t.w + 54 + t.box); }); }); }
  const extraX = { ...(room || {}).x }, extraY = { ...(room || {}).y }; // more room after a column (row): for lines with no route, and where a box would touch another box (below)
  // a typed view's lines from a node to itself, drawn as loops (risks.md F1): the room they take, their ports and routes (src/typed/layout.js)
  const loops = Object.create(null), LP = dg.typed && !dg.abs ? TYPED.loops(loops, dg, { byId, extraX, extraY, STUB, RG, CG, SEP, gapAfter }) : null;
  const rows = dg.typed && TYPED.rows(dg, nodes, pitch, NH, RG); // a typed view's rows (src/typed/layout.js)
  const gap = c => Math.max(CG, gapAfter[c] || 0) + (extraX[c] || 0);
  const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + gap(Math.floor(c)));
  const rowY = r => Object.keys(extraY).reduce((y, k) => +k < r ? y + extraY[k] : y, rows ? rows.at(r) : r * pitch);
  const place = () => {
    x = 0; for (let c = Math.floor(cols[0] ?? 0); c <= Math.ceil(cols[cols.length - 1] ?? 0); c++) { colX[c] = x; x += (colW[c] || NW) + gap(c); }
    nodes.forEach(n => { n.x = cx(n.col) + ((colW[n.col] || n.w) - n.w) / 2; n.y = rowY(n.row); if (map && n.k === 'm-script') { n.h = NH - 22; n.y += 11; } });
    let prev = null; // that row in column order: each card at its column, or right of the one before when that one is wider
    nodes.filter(n => n.aside).sort((a, b) => a.row - b.row || a.col - b.col).forEach(n => { if (prev && prev.row === n.row) n.x = Math.max(n.x, prev.x + prev.w + CG); prev = n; });
  };
  if (dg.abs) nodes.forEach(n => { n.x = n.ax; n.y = n.ay; if (map && n.k === 'm-script') { n.h -= 22; n.y += 11; } });
  else place();
  // Family frames enclose ordinary cards, so clicks, ports and focus keep their existing owners.
  // Children contribute their entire frame to their parent's bounds, rather than just their cards.
  // A typed view's boxes (notes/stage-2.md §3.2) take the same code as a map's: their title is the type's (`title`), and a box
  // grows to hold it; laid out turned (direction down), the 24 px header room goes left, the side that becomes the top
  const familyDefs = dg.containers || [], tagged = n => map && (n.author || n.k === 'm-ext'), TB = !map && dg.turned; // tagged: a name tag hangs under the card
  const headW = f => (map ? textW(f.label || f.id, 11) : linesW(f.title || f.label || f.id, f.head ? 12 : 11)) + 16; // a box's title, as the audit measures it (two lines: at 12 px); a broken one by its widest line (audit 24)
  const kids = new Map(), held = new Set(familyDefs.flatMap(f => f.nodeIds || [])); // a box's boxes; the cards in a box
  familyDefs.forEach(f => { kids.has(f.parent) || kids.set(f.parent, []); kids.get(f.parent).push(f); });
  // a card in a box (a port: on its owner's border) is in what it lies within; a card in none is in none, though a deep box's padding covers it
  // a box whose title the author broke (its header room grown for the lines) holds only the cards it or a box in it holds:
  // grown up over another box's card, it would otherwise take that card for its own and never move off it (audit 24). Nor
  // does any box hold a card of a box it lies in (outer): grown wider than its cards for its title, it covered that card, and no
  // rule between two boxes moves them apart (audit 41: a deployment node six deep over its parent's artifact)
  const boxesOf = new Map(), upOf = new Map(familyDefs.map(f => [f.id, f.parent])); // a card's boxes; a box's parent (a walk up, no recursion: boxes nest 3,000 deep)
  familyDefs.forEach(f => (f.nodeIds || []).forEach(id => { boxesOf.has(id) || boxesOf.set(id, []); boxesOf.get(id).push(f.id); }));
  const under = (f, id) => (boxesOf.get(id) || []).some(b => { for (let k = 0; b != null && k <= familyDefs.length; b = upOf.get(b), k++) if (b === f.id) return true; return false; });
  const outer = (f, id) => (boxesOf.get(id) || []).some(b => { for (let k = 0, x = upOf.get(f.id); x != null && k <= familyDefs.length; x = upOf.get(x), k++) if (x === b) return true; return false; }); // a card of a box f lies in
  const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h, owns = (f, n) => within(n, f) && (n.owner != null || under(f, n.id) || held.has(n.id) && !(f.head > 0 && brLines(f.title ?? f.label ?? f.id).length > 1) && !outer(f, n.id));
  // laid out down (TB): two or more labelled lines between one pair of a box's cards in neighbouring columns fan out across the
  // pair (TYPED.fan), each label across its own lane; the box holds those lanes and labels, so they keep inside it and off its
  // border. Narrower, the labels found no spot inside and each was set on the other line (audit 26: Mermaid's keyboard example)
  const fanPairs = new Map(); if (TB && dg.typed) (dg.edges || []).forEach(e => { const a = byId[e.from], b = byId[e.to];
    if (!a || !b || a === b || a.row !== b.row || Math.abs(a.col - b.col) !== 1) return; const k = a.col < b.col ? a.id + '\u0001' + b.id : b.id + '\u0001' + a.id;
    fanPairs.set(k, [...(fanPairs.get(k) || []), e]); });
  const fanRoom = members => { const ids = new Set(members.map(n => n.id)), out = [];
    fanPairs.forEach((list, k) => { const [i, j] = k.split('\u0001'); if (list.length < 2 || !ids.has(i) || !ids.has(j) || !list.some(e => e.label || e.step != null)) return;
      const a = byId[i], b = byId[j], bh = list.map(e => (e.label || e.step != null ? labelW(e) : 0)), span = bh.reduce((t, h, q) => t + (q ? Math.max(SEP, (bh[q - 1] + h) / 2 + 6) : 0), 0);
      const mid = (a.y + a.h / 2 + b.y + b.h / 2) / 2, half = span / 2 + Math.max(...bh) / 2 + 8;
      out.push({ x: Math.min(a.x, b.x), y: mid - half, w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: 2 * half }); });
    return out; };
  // and a card's loops (TYPED.loops), with their labels, laid out down: each runs out past the card's top, and its label across
  // that run, which the card's 36 px no longer held (audit 26: order-states laid out down)
  const loopRoom = n => { const r = LP.reach(n.id); return r && { x: n.x, y: n.y - r.top - 8, w: n.w + r.right + 8, h: n.h + r.top + 8 }; };
  // laid out across, a box's 14 px over its card and 24 px of header room hold one loop, 36 px beside the card hold two; more
  // run out through its border (audit 36): the box grows to keep each loop as far inside as one, 26 px under its top
  const loopSide = n => { const r = LP.reach(n.id); return r && { x: n.x, y: n.y - r.top + 10, w: n.w + r.right + 8, h: n.h + r.top - 10 }; };
  const framesNow = () => { const cache = Object.create(null); // a box may be named 'constructor'
    const make = (f, children) => {
      const members = (f.nodeIds || []).map(id => byId[id]).filter(Boolean);
      // laid out right, a typed box with more lines to a card outside it than the card's side holds reaches past the card's top
      // and bottom by a port for each line that goes round, below its title: each line meets the box level with where it runs,
      // none turning in the gap between them (audit 38: five transitions from a composite state of one state crossed)
      const reach = NEST && !TB && !dg.abs ? nodes.flatMap(c => { if (held.has(c.id) && under(f, c.id)) return [];
        const k = (dg.edges || []).filter(e => (e.from === f.id && e.to === c.id) || (e.to === f.id && e.from === c.id)).length, m = k - Math.max(1, Math.floor(c.h * 0.84 / 14));
        return m >= 2 && members.length ? [{ x: members[0].x, y: c.y - STUB - 16 * Math.ceil(m / 2) - 4, w: 1, h: c.h + 2 * (STUB + 16 * Math.ceil(m / 2)) + 8 }] : []; }) : [];
      if (reach.length) used = true;
      const rects = [...reach, ...members.map(n => TB ? { x: n.x - 14, y: n.y - 36, w: n.w + 44, h: n.h + 72 } : {x:n.x - 36,y:n.y - 14,w:n.w + 72,h:n.h + 44 + (tagged(n) ? 14 : 0)}), ...(TB ? fanRoom(members) : []), ...(LP ? members.map(n => (TB ? loopRoom : loopSide)(n)).filter(Boolean) : []), ...children];
      if (!rects.length) return null;
      const p = 12, x = Math.min(...rects.map(r => r.x)) - p - (TB ? 24 : 0), y = Math.min(...rects.map(r => r.y)) - p - (TB ? 0 : 24);
      const b = {...f, x, y, w:Math.max(...rects.map(r => r.x+r.w)) + p - x, h:Math.max(...rects.map(r => r.y+r.h)) + p - y};
      // laid out down, its title runs along its top, and the ports there go right of it: the box holds a port's room for each
      // line out of it, up to four (audit 38: as wide as its title, every line through its top met it at one point, or crossed the title)
      const outs = NEST && TB ? Math.min(4, (dg.edges || []).filter(e => { const i = id => id === f.id || under(f, id); return i(e.from) !== i(e.to); }).length) : 0;
      if (!map) { const k = TB ? 'h' : 'w', was = Math.max(b[k], headW(f) + 16); b[k] = Math.max(b[k], headW(f) + 16 + (outs ? 36 + 16 * outs : 0)); if (b[k] > was) used = true; }
      return cache[f.id] = dg.typed ? TYPED.frame(b, TB) : b;
    };
    // a box's frame holds its children's: a stack, not recursion, so boxes nest to any depth; a box already on it closes a parent cycle
    const frameOf = f => { const st = [[f, 0, []]], on = new Set([f.id]); let r = cache[f.id];
      while (!r && st.length) { const t = st[st.length - 1], c = (kids.get(t[0].id) || [])[t[1]++];
        if (c) { if (cache[c.id]) t[2].push(cache[c.id]); else if (!on.has(c.id)) { on.add(c.id); st.push([c, 0, []]); } continue; }
        st.pop(); on.delete(t[0].id); const b = make(t[0], t[2]); if (!st.length) return b; if (b) st[st.length - 1][2].push(b); }
      return r; };
    const out = familyDefs.map(f => frameOf(f)).filter(Boolean);
    if (map) out.forEach(f => { // the box fits its title and its badges, which are tabs on its top border, at the right
      const tabs = [...badgesOf(f).map((b, i) => ({ text: b.text, fill: toneOf(b), badge: i, w: b.text.length * 6.4 + 10 })), ...(f.unfolds ? [{ text: '⤡', fold: true, w: 28 }] : [])], all = tabs.reduce((a, t) => a + t.w + 4, -4); // an unfolded card's box: its ⤡ folds it (#71)
      f.w = Math.max(f.w, String(f.label || f.id).length * 6.7 + 32 + (tabs.length ? all + 8 : 0));
      let tx = f.x + f.w - 12 - all; f.tabs = tabs.map(t => { const o = { ...t, x: tx }; tx += t.w + 4; return o; }); });
    return out;
  };
  // Boxes keep apart: a column (row) gap widens wherever a box would come within 32 px of another box, or of a card outside
  // it, so their borders never touch and a line can run between them. Frames are measured again until nothing is too close.
  if (!dg.abs && familyDefs.length) for (let pass = 0, BOXGAP = 32; pass < 4; pass++) {
    const span = ns => ns.length ? { c0: Math.min(...ns.map(n => n.col)), c1: Math.max(...ns.map(n => n.col)), r0: Math.min(...ns.map(n => n.row)), r1: Math.max(...ns.map(n => n.row)) } : null;
    const fr = framesNow().map(f => ({ ...f, s: span(nodes.filter(n => owns(f, n))) })).filter(f => f.s);
    const cards = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h + (tagged(n) ? 14 : 0), s: span([n]), n }));
    const wantX = {}, wantY = {}, want = (o, k, v) => { if (v > 0) o[k] = Math.max(o[k] || 0, Math.ceil(v)); };
    const at = v => v; // the room goes after that row, a half row too: a card on row .5 leaves a box on 1.5 (a map floored it, audit 42: the room went after row 1, and a card on 1.5 moved down with the box on 2.5, 6 px into it)
    // a column's room goes after a whole column k (gap(k) reads no other), and moves a column c in (k, k + 1) by c - k of it
    // a box beside a card it has more lines to than the card's side holds: the extras go to the card's top (bottom), each up
    // (down) a track of its own between the box and the card, which 32 px holds one of (audit 37: laid out right, four
    // transitions from a composite state to the state beside it, two of them on one track)
    const tracks = (f, n) => { const k = (dg.edges || []).filter(e => (e.from === f.id && e.to === n.id) || (e.to === f.id && e.from === n.id)).length, m = k - Math.max(1, Math.floor(n.h * 0.84 / 14));
      return !TB && m >= 2 ? STUB + C + (m - 1) * SEP + 4 : 0; };
    fr.forEach((A, i) => [...fr.slice(i + 1), ...cards].forEach(B => {
      const gap = Math.max(BOXGAP, B.n ? tracks(A, B.n) : 0);
      if (within(A, B) || (B.n ? owns(A, B.n) : within(B, A)) || !hit(A, B, gap)) return;
      const a = A.s, b = B.s;
      if (a.c1 < b.c0 || b.c1 < a.c0) { const [L, R] = a.c1 < b.c0 ? [A, B] : [B, A], k = Math.floor(L.s.c1); want(wantX, k, (L.x + L.w + gap - R.x) / (Math.min(1, R.s.c0 - k) - L.s.c1 + k)); }
      else if (a.r1 < b.r0 || b.r1 < a.r0) { const [T, U] = a.r1 < b.r0 ? [A, B] : [B, A]; want(wantY, at(T.s.r1), T.y + T.h + BOXGAP - U.y); }
    }));
    // a card's loops (TYPED.loops) run up past its top and right past its right side, and the 32 px a box keeps from the card
    // does not hold the outer ones: a box above the loops keeps 8 px from them, the room a single loop has (audit 36: a second
    // loop ran inside the box above, along its border); a box right of them 32 px, a stub's room and a loop corner's (audit 37:
    // 8 px off, a line into the box took its port level with the loop's first run, its stub ended on the loop, and the router
    // took it over the box and down through its name strip)
    if (LP) nodes.forEach(n => { const r = LP.reach(n.id); if (!r) return;
      const B = { x: n.x, y: n.y - r.top, w: n.w + r.right, h: n.h + r.top, s: span([n]) };
      fr.forEach(A => { if (owns(A, n) || !hit(A, B, 32)) return; const a = A.s, b = B.s;
        if (a.c1 < b.c0 || b.c1 < a.c0) { if (b.c1 < a.c0) { const k = Math.floor(b.c1); want(wantX, k, (B.x + B.w + 32 - A.x) / (Math.min(1, a.c0 - k) - b.c1 + k)); } }
        else if (a.r1 < b.r0 && hit(A, B, 8)) want(wantY, at(a.r1), A.y + A.h + 8 - B.y); }); });
    if (!Object.keys(wantX).length && !Object.keys(wantY).length) break;
    Object.entries(wantX).forEach(([k, v]) => { extraX[k] = (extraX[k] || 0) + v; }); Object.entries(wantY).forEach(([k, v]) => { extraY[k] = (extraY[k] || 0) + v; });
    place();
  }
  // a label's room comes on top of what keeps the boxes apart
  if (room && (room.lx || room.ly)) { for (const [k, o] of [['lx', extraX], ['ly', extraY]]) Object.entries(room[k] || {}).forEach(([g, v]) => { o[g] = (o[g] || 0) + v; }); place(); }
  // decorations hanging on a node's top/bottom border (kind tab, step badge, ⤢ badge, author name tag):
  // ports keep off them, routes and labels treat the name tag as an obstacle
  if (map) nodes.forEach(n => {
    n.decoT = []; n.decoB = [];
    let tx = n.x + 12; mapTabs(n).forEach(t => { n.decoT.push([tx - 6, t.w + 12]); tx += t.w + 4; });
    if (n.step) n.decoT.push([n.x - 10, 24]);
    if (n.kids || n.opens) n.decoT.push([n.x + n.w - 46, 40]);
    if (n.author || n.k === 'm-ext') {
      const A = (dg.authors || {})[n.author] || {}, max = n.w - 40;
      let t = n.author ? '@' + n.author : 'unknown';
      while (t.length > 4 && sansW(t, 10, .92) + 42 > max) t = [...t].slice(0, -2).join('') + '…'; // whole characters: never half an emoji
      const w = Math.ceil(sansW(t, 10, .92) + 42);
      n.tag = { x: n.x + n.w - 12 - w, y: n.y + n.h - 9, w, h: 22, text: t, img: A.avatar || '', name: A.name || '' };
      n.decoB.push([n.tag.x - 2, n.tag.w + 4]);
    }
  });
  // an author's name tag only: a typed card's tag is its text ("[Container]"), and its NaN box sorted the grid's lines out of order,
  // so the router's binary search marked no card in the way and lines ran through cards (bookshop-c4's order queue)
  const tagRects = nodes.filter(n => n.tag?.w).map(n => ({ x: n.tag.x - 2, y: n.tag.y - 2, w: n.tag.w + 4, h: n.tag.h + 6 }));
  const families = framesNow();
  families.forEach(f => (f.tabs || []).forEach(t => tagRects.push({ x: t.x - 2, y: f.y - 10, w: t.w + 4, h: 19 }))); // lines and labels keep off a box's tabs
  // intake sources: brand badges stacked left of the node they feed, each with its own short feeds line
  const intake = map ? (dg.intake || []).filter(b => byId[b.to]).map((b, i, all) => {
    const n = byId[b.to], mine = all.filter(o => o.to === b.to), k = mine.indexOf(b), off = k - (mine.length - 1) / 2;
    const cx = n.x - 72, cy = n.y + n.h / 2 + off * 34, py = n.y + n.h / 2 + off * Math.min(16, (n.h - 20) / Math.max(1, mine.length - 1));
    const ex = n.x - 38 + Math.abs(off) * 6; // nested elbows: an outer badge turns nearer the card, so lines never cross
    return { ...b, cx, cy, r: 14, pts: simplify([[cx + 15, cy], [ex, cy], [ex, py], [n.x, py]]) };
  }) : [];
  intake.forEach(b => tagRects.push({ x: b.cx - b.r - 4, y: b.cy - b.r - 4, w: 2 * b.r + 8, h: 2 * b.r + 8 }));
  /* ---- routing: one orthogonal route per edge, no shared trunks ----
     Ported in approach from archify's router (MIT): renderers/shared/route-quality.mjs
     shortestOrthogonalGridRoute + renderers/architecture/routing.mjs. Each edge gets its own
     port, spread along the node side in the order its far end lies; then a sparse orthogonal
     visibility grid (node edges ± clearance, endpoint stubs, gap centre lines, earlier routes
     ± separation) is searched with Dijkstra, carrying the incoming direction so turns cost a
     bend penalty. Earlier routes may never be overlapped and are crossed only when no clean
     route exists; earlier labels are obstacles, so later routes keep clear of them. */
  // an end may be a container: the line ends on its box's border, whose title the ports keep clear of (not a box and
  // something inside it: that has no line, but a typed view's inner line)
  const headOf = f => Math.min((TB ? f.h : f.w) - 16, headW(f)); // the length of a box's title along its header
  const boxEnd = Object.fromEntries(families.map(f => [f.id, { id: f.id, label: f.label || f.id, box: true, x: f.x, y: f.y, w: f.w, h: f.h, hd: TB ? headOf(f) : 0,
    decoT: TB ? [] : [[f.x + 8, headOf(f)], ...(f.tabs || []).map(t => [t.x - 6, t.w + 12])], decoB: [] }]));
  const endOf = Object.assign(Object.create(null), boxEnd, byId), end = id => endOf[id], holds = (b, n) => b.box && n !== b && n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;
  // a line between a box and something inside it is no line: inside by what the box holds (its cards, its boxes and theirs), not by
  // where it lies, as viewEdges decides it for a map; a box grown over a card it does not hold dropped that card's line to the box
  // (audit 41: the integration fixture's system view, pricing with no pin). A port, on its owner's border, by where it lies, as before
  const famIn = (b, x) => { for (let k = 0, y = upOf.get(x); y != null && k <= familyDefs.length; y = upOf.get(y), k++) if (y === b) return true; return false; };
  const joins = (b, n) => b.box && n !== b && (n.box ? famIn(b.id, n.id) : n.owner != null ? holds(b, n) : under(b, n.id));
  const edges = (dg.edges || []).filter(e => { const s = end(e.from), t = end(e.to); if (!s || !t || (e.from === e.to && !loops[e.from])) return false;
    if (!(LP && e[e.inner + 'Port'] != null) && (joins(s, t) || joins(t, s))) { warn(`no line for edge ${e.id ?? e.from + '->' + e.to}: it joins the box "${(joins(s, t) ? s : t).id}" and something inside it`); return false; }
    return true; }).map(e => ({ ...e, s: end(e.from), t: end(e.to) }));
  const segsOf = pts => pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
  const segHitsRect = (a, b, r) => { const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]); return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h; };
  const through = (pts, e, m = 2) => nodes.find(n => n !== e.s && n !== e.t && segsOf(pts).some(([a, b]) => segHitsRect(a, b, { x: n.x + m, y: n.y + m, w: n.w - 2 * m, h: n.h - 2 * m }))); // a card it does not join (m: how far in it may run; less than 0, how far off it keeps)
  // fixed edges arrive with their route already drawn (the hub comb); the router works around them
  // a loop back out of a family runs under the frames: out the source's right side, down past every frame and card it
  // would cut through, left along the bottom, and up the gap right of its target into its near side, the lowest port
  // there (issue 128); where that would cut through a card, up into the target's bottom, as before. Loops into one target
  // nest: the outer comes up nearer the card, into the lower port.
  const inFam = n => families.filter(f => n.x >= f.x && n.x + n.w <= f.x + f.w && n.y >= f.y && n.y + n.h <= f.y + f.h);
  const unders = edges.filter(e => map && e.back && !e.fixed && (inFam(e.s).length || inFam(e.t).length));
  unders.forEach((e, k) => {
    // the source's other outgoing wires keep its middle port; the loop leaves lower down
    const { s, t } = e, sy = s.y + s.h / 2 + (edges.some(o => o !== e && o.from === s.id && !o.back) ? s.h / 4 : 0);
    const xr = Math.max(s.x + s.w + 22, ...inFam(s).map(f => f.x + f.w + 14)) + k * 10;
    const tx = t.tag ? Math.max(t.x + 12, (t.x + t.tag.x - 2) / 2) : t.x + t.w / 2, ty = t.y + t.h + (t.kids || t.opens ? 8 : 0);
    const xn = t.x + t.w + 16 + 10 * unders.slice(k + 1).filter(o => o.t === t).length, near = xn < xr;
    const span = nodes.filter(n => n.x < xr && n.x + n.w > (near ? xn : tx)), yb = Math.max(...[...inFam(s), ...inFam(t)].map(f => f.y + f.h), ...span.map(n => n.y + n.h + (n.tag ? 22 : 8))) + 24 + k * 10;
    const pts = [[s.x + s.w, sy], [xr, sy], [xr, yb]], up = [[xn, yb], [xn, t.y + t.h / 2], [t.x + t.w, t.y + t.h / 2]], bottom = [[tx, yb], [tx, ty]];
    if (near && !through([...pts, ...up], e)) { e.fixed = [...pts, ...up]; e.under = k + 1; }
    else if (!through([...pts, ...bottom], e)) { e.fixed = [...pts, ...bottom]; e.under = true; } // one that would cut through a card is left to the router
  });
  if (LP) LP.mark(edges);
  const free = edges.filter(e => !e.fixed);
  edges.filter(e => e.fixed && !e[OWN_ROUTE]).forEach(e => { e.pts = e.fixed; e.p1 = e.pts[0]; e.p2 = e.pts[e.pts.length - 1]; e.fs = 'R'; e.ts = e.under > 0 ? 'R' : e.under ? 'B' : 'L'; e.stubs = []; e.how = e.under ? 'under' : 'comb'; });
  const sides = {};
  const pushSide = (n, side, e, other) => ((sides[n.id + '|' + side] ||= []).push({ e, other, n }));
  free.forEach(e => {
    const { s, t } = e, sc = s.x + s.w / 2, tc = t.x + t.w / 2, sy = s.y + s.h / 2, ty = t.y + t.h / 2;
    const gapX = tc > sc ? t.x - (s.x + s.w) : s.x - (t.x + t.w), gapY = ty >= sy ? t.y - (s.y + s.h) : s.y - (t.y + t.h);
    if (s.box || t.box ? gapX >= gapY : gapX > 24) { e.fs = tc > sc ? 'R' : 'L'; e.ts = tc > sc ? 'L' : 'R'; } // a box: the sides facing across the wider gap
    else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }
    if (EDGE_SIDE[e.fromSide]) e.fs = EDGE_SIDE[e.fromSide]; if (EDGE_SIDE[e.toSide]) e.ts = EDGE_SIDE[e.toSide];
  });
  // a side holds only as many ports as fit 14px apart; the steepest extras move to the top/bottom side
  const sideSpan = (n, side) => { // longest stretch of a top/bottom border free of decorations
    const decos = side === 'T' ? n.decoT : side === 'B' ? n.decoB : null;
    if (!decos || !decos.length) return null;
    let spans = [[n.x + 8, n.x + n.w - 8]];
    decos.forEach(([dx, dw]) => { spans = spans.flatMap(([a, b]) => { const c = dx - 8, d = dx + dw + 8; if (d <= a || c >= b) return [[a, b]]; return [[a, c], [d, b]].filter(([p, q]) => q - p > 0); }); });
    const best = spans.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    return best && best[1] - best[0] >= 24 ? best : null;
  };
  const PORT = 14, cap = (n, side) => { const sp = sideSpan(n, side); return Math.max(1, Math.floor(((side === 'L' || side === 'R') ? n.h : sp ? sp[1] - sp[0] : n.w) * 0.84 / PORT)); };
  // a card's loops (TYPED.loops) take the room over its top and right of it: the bottom (top) of another card that faces that
  // room takes no extra line, whose stub would end on a loop (audit 37: laid out right, a line moved to the bottom of the card
  // over a card with a loop ran along the loop's last run); a card's own top holds its lines left of its loop's port
  const loopRooms = LP ? nodes.map(m => { const r = LP.reach(m.id); return r && { m, x: m.x + m.w / 2 - SEP, y: m.y - r.top - SEP, w: m.w / 2 + r.right + 2 * SEP, h: r.top + SEP }; }).filter(Boolean) : [];
  const facesLoop = (n, side) => loopRooms.some(r => r.m !== n && hit(r, side === 'T' ? { x: n.x, y: n.y - STUB, w: n.w, h: STUB } : { x: n.x, y: n.y + n.h, w: n.w, h: STUB }));
  for (let pass = 0; pass < 2; pass++) nodes.forEach(n => {
    ['R', 'L'].forEach(side => {
      const mine = free.filter(e => (e.s === n && e.fs === side) || (e.t === n && e.ts === side));
      const over = mine.length - cap(n, side); if (over <= 0) return;
      const far = e => { const o = e.s === n ? e.t : e.s; return (o.y + o.h / 2) - (n.y + n.h / 2); };
      // lines to a box level with the card (NEST: or to a card on its row) take its top and bottom by turns: on one side, two of them leave the box's side one
      // above the other and turn the same way, and the lower one's track ran up through the upper one's stub end (audit 37: laid
      // out right, four transitions from a composite state to the state beside it, two of them on one track; audit 38: seven
      // between two states, all moved went under the card, where the row below left one track)
      const oth = e => e.s === n ? e.t : e.s, level = o => (!TB || NEST) && o.box && o.y < n.y && o.y + o.h > n.y + n.h, turn = new Map();
      const moved = mine.sort((a, b) => Math.abs(far(b)) - Math.abs(far(a))).filter(e => !facesLoop(n, far(e) < 0 ? 'T' : 'B')).slice(0, over);
      moved.forEach(e => {
        const o = oth(e), k = turn.get(o) || 0, all = mine.every(d => oth(d) === o), two = !!(level(o) || NEST && !o.box && Math.abs(far(e)) < 1) && (all || NEST && !dg[TURNS] && (TB || !!level(o)) && moved.filter(d => oth(d) === o).length > 1) && moved.length > 1; turn.set(o, k + 1); if (two && (TB || !level(o))) used = true; if (two && !all) turns = true;
        const ns = (far(e) < 0) !== (two && k % 2 === 1) ? 'T' : 'B';
        if (e.s === n) e.fs = ns; else e.ts = ns;
      });
    });
  });
  free.forEach(e => { pushSide(e.s, e.fs, e, e.t); pushSide(e.t, e.ts, e, e.s); });
  edges.filter(e => e.under > 0).forEach(e => pushSide(e.t, 'R', e, e.s)); // a loop under the boxes takes its port with the side's other lines
  if (LP) LP.ports(pushSide, sides);
  const portAt = (it, side, p) => { if (it.n === it.e.s && it.e.fs === side) it.e.p1 = p; else it.e.p2 = p; };
  Object.entries(sides).sort(([, a], [, b]) => !!a[0].n.box - !!b[0].n.box).forEach(([key, list]) => { // cards first: a box's port lines up with them
    const side = key.split('|').pop(), vertical = side === 'L' || side === 'R';
    const n = list[0].n;
    if (n.box) { // each port in line with its line's other end where the border allows (a straight line): below the title on
      // a side, off the title, tabs and corners on top or bottom; in that order, 16 (26) px apart
      const want = it => { const q = it.e.s === n ? it.e.p2 : it.e.p1, o = it.other; return q ? q[vertical ? 1 : 0] : vertical ? o.y + o.h / 2 : o.x + o.w / 2; };
      // (turned: the title runs down the left side, and the sides across the header room are the top and bottom)
      const across = TB ? !vertical : vertical, a0 = vertical ? n.y : n.x, len = vertical ? n.h : n.w;
      const sp = across ? [a0 + 40, a0 + len - 16] : TB ? [side === 'L' ? n.y + n.hd + 16 : n.y, n.y + n.h] : sideSpan(n, side) || [n.x, n.x + n.w];
      let lo = across ? sp[0] : Math.max(sp[0], a0 + 20), hi = across ? sp[1] : Math.min(sp[1], a0 + len - 20); if (hi < lo) lo = hi = (lo + hi) / 2;
      // a typed view's span too short for its lines (a title that fills the side, audit 44: laid out down, two paths into an
      // execution environment's top met at one point) grows over the title until its ports lie PORT apart; layoutTyped lays the
      // view out without that too and keeps the one check() has less to say of (a dense view's other lines took worse ways)
      let gap = Math.min(vertical ? 16 : 26, (hi - lo) * 0.84 / list.length);
      if (dg.typed && !dg[SPAN] && list.length > 1 && gap < PORT) { grew = true; const need = (list.length - 1) * PORT, f0 = a0 + 20, f1 = a0 + len - 20;
        lo = Math.max(Math.min(f0, lo), Math.min(lo, hi - need)); if (hi - lo < need) hi = Math.max(hi, Math.min(f1, lo + need)); gap = Math.min(PORT, (hi - lo) / (list.length - 1)); }
      const ws = list.map(want), order = list.map((_, i) => i).sort((a, b) => ws[a] - ws[b]);
      const v = order.map(i => Math.min(hi, Math.max(lo, ws[i])));
      for (let k = 1; k < v.length; k++) v[k] = Math.max(v[k], v[k - 1] + gap);
      for (let k = v.length - 1; k >= 0; k--) v[k] = Math.min(v[k], k === v.length - 1 ? hi : v[k + 1] - gap);
      order.forEach((i, k) => portAt(list[i], side, vertical ? [side === 'R' ? n.x + n.w : n.x, v[k]] : [v[k], side === 'T' ? n.y : n.y + n.h]));
      return;
    }
    // order ports by where the far end lies, so neighbouring routes do not cross at the node: on a left or right side by its
    // y; on a top or bottom side by its angle from the side, swept from the side's left end (#49). By x, then a y tie-break
    // in one direction, cards in one column on the left of a bottom side came in the wrong order, and their lines crossed.
    const mx = n.x + n.w / 2, my = n.y + n.h / 2, turn = it => { let a = Math.atan2(it.other.y + it.other.h / 2 - my, it.other.x + it.other.w / 2 - mx) - (side === 'T' ? -Math.PI / 2 : Math.PI / 2);
      while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return side === 'T' ? a : -a; };
    // Far ends level with each other go by the angle they come in at, as on a top or bottom side: of two above the card, the
    // nearer takes the higher port, since the farther one's line passes under it (b10/overview's Reports 7 took the port
    // under Billing 1's, whose line ran below Reports, and had no way in but round the map)
    const lean = it => Math.atan2(it.other.y + it.other.h / 2 - my, Math.abs(it.other.x + it.other.w / 2 - mx));
    list.sort((a, b) => vertical ? ((a.e.under || 0) - (b.e.under || 0)) || (a.other.y - b.other.y) || (lean(a) - lean(b)) || ((side === 'R' ? -1 : 1) * (a.other.x - b.other.x)) : turn(a) - turn(b));
    const sp = vertical ? null : sideSpan(n, side);
    const len = vertical ? n.h : sp ? sp[1] - sp[0] : n.w, mid = sp ? (sp[0] + sp[1]) / 2 : n.x + n.w / 2;
    const gap = Math.min(vertical ? 16 : 26, (len * 0.84) / Math.max(1, list.length)), cy = n.y + n.h / 2;
    list.forEach((it, i) => {
      const off = (i - (list.length - 1) / 2) * gap;
      const p = side === 'R' ? [n.x + n.w, cy + off] : side === 'L' ? [n.x, cy + off]
        : side === 'T' ? [mid + off, n.y] : [mid + off, n.y + n.h];
      portAt(it, side, p);
    });
  });
  // a typed view's lines between one pair take their ports so that they nest (audit 38: laid out right, five transitions from a
  // composite state to the state beside it, two of them crossed and one ran on another): walked round each end clockwise from
  // the side away from the other, the lines meet one end in the order they meet the other in reverse, as strands between two
  // discs do. Each line keeps its port on the pair's first end; the other end's ports go round among them
  if (NEST && !dg.abs) { const pairsOf = new Map();
    free.forEach(e => { if (e.s === e.t || e.inner || e.fromPort != null || e.toPort != null || !e.p1 || !e.p2) return; const k = e.s.id < e.t.id ? e.s.id + '\u0001' + e.t.id : e.t.id + '\u0001' + e.s.id; pairsOf.set(k, [...(pairsOf.get(k) || []), e]); });
    const TAU = 2 * Math.PI, param = (m, o, p) => { const cx = m.x + m.w / 2, cy = m.y + m.h / 2, a = Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(cy - o.y - o.h / 2, cx - o.x - o.w / 2); return ((a % TAU) + TAU) % TAU; };
    const at = (e, m) => e.s === m ? ['p1', 'fs'] : ['p2', 'ts'];
    pairsOf.forEach(list => { if (list.length < 2) return; const n = list[0].s, o = list[0].t;
      const byN = [...list].sort((a, b) => param(n, o, a[at(a, n)[0]]) - param(n, o, b[at(b, n)[0]]));
      const O = list.map(e => { const [k, sk] = at(e, o); return [e[k], e[sk]]; }).sort((a, b) => param(o, n, b[0]) - param(o, n, a[0]));
      byN.forEach((e, i) => { const [k, sk] = at(e, o); if (e[k] !== O[i][0]) used = true; [e[k], e[sk]] = O[i]; });
      // a box beside a card, laid out right, with every line of the pair on its side that faces the card: each line meets the box
      // level with where it runs, so none turns in the gap between them. One into the card's side runs straight; one into its
      // top (bottom) runs over (under) the card and turns down (up) into it, the line into the port nearest the box lowest
      // (highest), each a track apart. The gap held a track for each of them, and five crossed or ran on one another (audit 38)
      const B = n.box ? n : o.box ? o : null, Cd = B === n ? o : n; if (!B || Cd.box || TB) return;
      const bs = Cd.x > B.x + B.w ? 'R' : Cd.x + Cd.w < B.x ? 'L' : null; if (!bs || list.some(e => at(e, B)[1] && e[at(e, B)[1]] !== bs)) return;
      const cs = bs === 'R' ? 'L' : 'R', near = p => Math.abs(p[0] - (bs === 'R' ? B.x + B.w : B.x)), ys = new Map();
      list.filter(e => e[at(e, Cd)[1]] === cs).forEach(e => ys.set(e, e[at(e, Cd)[0]][1]));
      for (const [side, sg] of [['T', -1], ['B', 1]]) list.filter(e => e[at(e, Cd)[1]] === side).sort((a, b) => near(a[at(a, Cd)[0]]) - near(b[at(b, Cd)[0]]))
        .forEach((e, i) => ys.set(e, (side === 'T' ? Cd.y : Cd.y + Cd.h) + sg * (STUB + (i + 1) * 16)));
      const lo = B.y + 40, hi = B.y + B.h - 16, mine = new Set(list);
      // a box too short for them: the lines over (under) the card come down (up) to where it starts (ends), in turn
      for (const [side, sg] of [['T', 1], ['B', -1]]) { const g = list.filter(e => e[at(e, Cd)[1]] === side), v = g.map(e => ys.get(e)), d = sg > 0 ? lo - Math.min(...v) : hi - Math.max(...v);
        if (g.length && d * sg > 0) g.forEach(e => ys.set(e, ys.get(e) + d)); }
      const others = (sides[B.id + '|' + bs] || []).filter(it => !mine.has(it.e)).map(it => (it.e.s === B ? it.e.p1 : it.e.p2)[1]);
      const all = [...ys.values()].sort((a, b) => a - b);
      if (ys.size !== list.length || all[0] < lo || all.at(-1) > hi || all.some((y, i) => i && y - all[i - 1] < PORT) || others.some(y => all.some(v => Math.abs(v - y) < PORT))) return;
      list.forEach(e => { const k = at(e, B)[0]; if (e[k][1] !== ys.get(e)) used = true; e[k] = [e[k][0], ys.get(e)]; });
    });
  }
  edges.filter(e => e.under > 0).forEach(e => { const P = e.fixed; e.pts = e.fixed = [...P.slice(0, 4), [P[3][0], e.p2[1]], e.p2]; });
  const corners = LP ? LP.route() : []; // a loop's corners: obstacles to the other routes
  // and each box's title, which the router keeps clear of (audit 25: a fanned line ran up through a boundary's title)
  const headRect = f => { const t = 22 + (!map && f.head || 0); return TB ? { x: f.x + 3, y: f.y + 8, w: t, h: headOf(f) } : { x: f.x + 8, y: f.y + 3, w: headOf(f), h: t }; };
  if (dg.typed && dg.turned && TYPED.fan(free, { simplify, through, STUB, SEP, families, heads: families.map(headRect), nest: NEST })) used = true; // a view laid out down: lines between one pair fan out (src/typed/layout.js)
  const BEND = map ? 60 : 26, CROSS = 900; // maps: few bends
  const OUT = { R: [1, 0], L: [-1, 0], T: [0, -1], B: [0, 1] };
  const nodeRects = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const gapLinesX = [], gapLinesY = [];
  if (dg.abs) {
    (dg.lanes || []).forEach(l => gapLinesX.push(l.x - (dg.laneGap || 32) / 2, l.x + 8, l.x + l.w - 8, l.x + l.w + (dg.laneGap || 32) / 2));
    nodes.forEach(n => gapLinesY.push(n.y - RG / 2, n.y + n.h + RG / 2));
  } else {
    Object.keys(colX).map(Number).forEach(c => gapLinesX.push(colX[c] - CG / 2, colX[c] + (colW[c] || NW) + CG / 2));
    [...new Set(nodes.map(n => n.y))].forEach(y => gapLinesY.push(y - RG / 2, y + (rows ? rows.ht(nodes.find(n => n.y === y).row) : NH) + RG / 2));
  }
  const routed = [], reserved = [];
  const inRect = (p, r) => p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h;
  const colinear = (a, b, c, d) => {
    if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < SEP - 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 0;
    if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < SEP - 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 0;
    return false;
  };
  const crosses = (p, q, r, s) => { // perpendicular interior crossing
    const pv = p[0] === q[0], rv = r[0] === s[0]; if (pv === rv) return false;
    const [v, hz] = pv ? [[p, q], [r, s]] : [[r, s], [p, q]];
    return hz[0][1] > Math.min(v[0][1], v[1][1]) && hz[0][1] < Math.max(v[0][1], v[1][1]) && v[0][0] > Math.min(hz[0][0], hz[1][0]) && v[0][0] < Math.max(hz[0][0], hz[1][0]); };
  const onSegInterior = (p, a, b) => (a[0] === b[0] && Math.abs(p[0] - a[0]) < 0.5 && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]))
    || (a[1] === b[1] && Math.abs(p[1] - a[1]) < 0.5 && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]));
  let shut = false; // gridRoute shuts each box that holds neither end of its line (NEST's box pass)
  // the work the last resort (a search that may cross or run along lines) may spend in this pass, in cells built and visited
  // (audit 55: 150 lines into one card's side, too many for its tracks, each fell to the last resort, whose grid holds every
  // line before it and whose search, its crossings dear, visits all of it: 30 s). Past it, the last resort keeps off cards,
  // tags and labels but not other lines, whose grid is small and whose search goes nearly straight to its end.
  // ponytail: 4e6 is some six times what the largest test model spends (requirement-stress: 0.66e6)
  let anyWork = 0; const ANY_WORK = 4e6;
  // a search near its ends (win) that fails for its start or end being shut in, where the grid near them is the whole grid's,
  // fails the same on the whole grid: wide() then skips that search, whose grid of the whole view was most of the time a view
  // of many lines into one card spent (audit 55). sealed: the last search so failed (as bare, or not)
  let sealed = null;
  const wide = (e, allowCross, spare) => gridRoute(e, allowCross, 320, spare)
    || (sealed !== null && sealed === (allowCross >= 2 && anyWork > ANY_WORK) ? null : gridRoute(e, allowCross, 0, spare));
  function gridRoute(e, allowCross, win, spare, soft) {
    sealed = null;
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB];
    const en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    // ends that face each other closer than two stubs (a card 32 px beside a box) leave the grid no room: the plain
    // elbow between them is the route, when it keeps off cards and tags and does not run along or across another line
    if (OUT[e.fs][0] === -OUT[e.ts][0] && OUT[e.fs][1] === -OUT[e.ts][1] && (en[0] - st[0]) * OUT[e.fs][0] + (en[1] - st[1]) * OUT[e.fs][1] < 0) {
      const lines = routed.flatMap(r => segsOf(r.pts)), clear = (p, ls) => segsOf(p).every(([a, b]) => ![...nodeRects, ...tagRects].some(r => segHitsRect(a, b, r)) && !ls.some(([c, d]) => colinear(a, b, c, d) || (!allowCross && crosses(a, b, c, d))));
      // nor along the stub of a line not yet routed: its turn half way across ran along the stub of another line into the box's
      // end beside its own, and the two joined there (audit 39); so the turn moves 5 px at a time toward either end until it is clear
      const stubs = free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || []), ax = OUT[e.fs][0] ? 0 : 1, half = Math.abs(e.p2[ax] - e.p1[ax]) / 2;
      for (let d = 0; d < half - 4; d = d > 0 ? -d : 5 - d) { const p = fallback(e, d); if (clear(p, [...lines, ...stubs])) return p; }
      const p = fallback(e); if (clear(p, lines)) return p;
    }
    const W = win ? { x: Math.min(st[0], en[0]) - win, y: Math.min(st[1], en[1]) - win, x2: Math.max(st[0], en[0]) + win, y2: Math.max(st[1], en[1]) + win } : null;
    const any = allowCross >= 2, bare = any && anyWork > ANY_WORK; // the last resort: only cards and tags stand in the way; crossing or running along a line, or a label, costs
    // past it (3, a typed view's line that would else run through a card, audit 21): a loop's corners cost as a crossing, and the
    // line may run round its own end
    // the name strip of a box the line enters (one that holds one of its ends itself, and not the other), shut to the last resort;
    // (NEST) and of a box that holds neither end (audit 39: a transition from a state over a composite to the state under it ran
    // in through the composite's title)
    const loose = allowCross === 3, heads = any && !loose && !soft && families.length ? families.filter(f => ((f.nodeIds || []).includes(e.s.id) !== (f.nodeIds || []).includes(e.t.id) && holds(boxEnd[f.id], e.s) !== holds(boxEnd[f.id], e.t)) || (NEST && !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t))).map(headRect) : [], hard = heads.length > 0;
    const obs = [...nodeRects.map(r => ({ x: r.x - C, y: r.y - C, w: r.w + 2 * C, h: r.h + 2 * C })), ...tagRects, ...(loose ? [] : corners), ...heads, ...(any ? [] : reserved.map(r => ({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 })))];
    // a typed view's line out of a box to something outside it keeps out of that box once it has left it: the box's inside is
    // shut to it, as a card is, though its border makes no grid line (audit 27: a dependency out of an open package turned back
    // in, ran down inside it and crossed its border again)
    // (shut, the box pass below) and a box that holds neither end, as a card is
    const own = dg.typed && !loose && !e.inner ? [...[[e.s, e.t], [e.t, e.s]].filter(([b, o]) => b.box && !holds(b, o)).map(([b]) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...(shut ? families.filter(f => !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t)).map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h })) : [])] : [];
    const avoid = bare ? [] : [...routed.flatMap(r => segsOf(r.pts)), ...free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || [])];
    const xs = new Set([st[0], en[0], ...gapLinesX]), ys = new Set([st[1], en[1], ...gapLinesY]);
    obs.forEach(r => { xs.add(r.x - 1); xs.add(r.x + r.w + 1); ys.add(r.y - 1); ys.add(r.y + r.h + 1); });
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) { xs.add(a[0]); xs.add(a[0] - SEP); xs.add(a[0] + SEP); } else { ys.add(a[1]); ys.add(a[1] - SEP); ys.add(a[1] + SEP); } });
    const keep = new Set([st[0], en[0], st[1], en[1]]);
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) keep.add(a[0]); else keep.add(a[1]); }); // a route's own line is never merged away
    const co = vals => { const s = Float64Array.from(vals).sort(), o = []; for (let i = 0; i < s.length; i++) if (i === 0 || keep.has(s[i]) || s[i] - s[i - 1] >= 5) o.push(s[i]); return o; };
    families.forEach(f => { xs.add(f.x - 16); xs.add(f.x + f.w + 16); ys.add(f.y - 16); ys.add(f.y + f.h + 16); });
    let X = co([...xs]), Y = co([...ys]);
    if (families.length) { const far = (v, bs) => keep.has(v) || bs.every(u => Math.abs(v - u) >= 8);
      const fx = families.flatMap(f => [f.x, f.x + f.w]), fy = families.flatMap(f => [f.y, f.y + f.h]); X = X.filter(v => far(v, fx)); Y = Y.filter(v => far(v, fy)); } // once, not per line
    const XF = X, YF = Y; // the whole grid's lines, which the window's are among
    if (W) { X = X.filter(v => keep.has(v) || (v >= W.x && v <= W.x2)); Y = Y.filter(v => keep.has(v) || (v >= W.y && v <= W.y2)); }
    const nx = X.length, ny = Y.length, N = nx * ny; if (any && !bare) anyWork += N;
    // an end that lies in an obstacle (or, without crossings, on an earlier line) fails the search: say so before building the grid
    const blockedAt = p => obs.some(r => inRect(p, r)) || (!allowCross && avoid.some(([a, b]) => onSegInterior(p, a, b)));
    if (blockedAt(st) || blockedAt(en)) { if (!soft) sealed = bare; return null; }
    // the grid on lines X and Y: which cells are open, which moves are shut, and which cost a crossing or a run along a line
    const grid = (X, Y) => { const nx = X.length, ny = Y.length, N = nx * ny;
      const P = grPool(N), U = (k, v = 0) => P.u8[k].subarray(0, N).fill(v);
      // a cell is open (ok) until an obstacle covers it, or an earlier line runs through it and the route may not cross; one an
      // earlier line runs through costs a crossing (crossAt, read only on an open cell)
      const ok = U(0, 1), crossAt = U(1);
      // each obstacle and earlier line marks only the cells and moves near it (found by binary search, then tested
      // exactly as inRect, segHitsRect, onSegInterior and colinear do); every cell testing every obstacle and line
      // made one route cost O(cells x obstacles)
      const from = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] < v) a = m + 1; else b = m; } return a; };
      const blockH = U(2), blockV = U(3), alongH = any ? U(4) : blockH, alongV = any ? U(5) : blockV;
      for (const r of [...obs, ...own]) {
        const i0 = from(X, r.x - 1), j0 = from(Y, r.y - 1), qx = r.x + .5, qy = r.y + .5, qx2 = qx + (r.w - 1), qy2 = qy + (r.h - 1);
        for (let i = i0; i < nx && X[i] <= r.x + r.w + 1; i++) for (let j = j0; j < ny && Y[j] <= r.y + r.h + 1; j++)
          if (X[i] > r.x && X[i] < r.x + r.w && Y[j] > r.y && Y[j] < r.y + r.h) ok[i * ny + j] = 0;
        const lx = Math.min(qx, qx2), hx = Math.max(qx, qx2), ly = Math.min(qy, qy2), hy = Math.max(qy, qy2), jl = from(Y, ly - 1);
        for (let i = Math.max(0, from(X, lx - 1) - 1); i < nx - 1 && X[i] <= hx + 1; i++) for (let j = jl; j < ny && Y[j] <= hy + 1; j++)
          if (X[i + 1] > qx && X[i] < qx2 && Y[j] > qy && Y[j] < qy2) blockH[i * ny + j] = 1;
        for (let i = from(X, lx - 1); i < nx && X[i] <= hx + 1; i++) for (let j = Math.max(0, jl - 1); j < ny - 1 && Y[j] <= hy + 1; j++)
          if (X[i] > qx && X[i] < qx2 && Y[j + 1] > qy && Y[j] < qy2) blockV[i * ny + j] = 1;
      }
      const onAv = allowCross ? crossAt : ok, onV = allowCross ? 1 : 0; // a cell on an earlier line: a crossing, or shut
      // each line marks whole runs of cells: a vertical one a run down a column, which lies in one piece in the arrays (a fill); a
      // horizontal one a run along a row, noted only at its two ends (+1 where it starts, -1 past it) and summed column by column
      // once every line is in. Cell by cell, the lines into one card's side (each beside the others and spanning the view) cost
      // O(lines x cells) a route (audit 55). The runs are the cells the tests marked: upto finds the first value past v
      const upto = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] <= v) a = m + 1; else b = m; } return a; };
      let onD = null, alD = null; const D = () => { if (!P.dn || P.dn < N + ny) { P.dn = Math.max(N + ny, 2 * (P.dn || 0)); P.d1 = new Int32Array(P.dn); P.d2 = new Int32Array(P.dn); }
        onD = P.d1.subarray(0, N + ny).fill(0); alD = P.d2.subarray(0, N + ny).fill(0); };
      for (const [c, d] of avoid) {
        const x1 = Math.min(c[0], d[0]), x2 = Math.max(c[0], d[0]), y1 = Math.min(c[1], d[1]), y2 = Math.max(c[1], d[1]);
        if (c[0] === d[0]) { // vertical: cells on its interior; vertical moves alongside it
          const lo = upto(Y, y1), hi = from(Y, y2), alo = Math.max(0, lo - 1), ahi = Math.min(ny - 1, hi);
          if (lo < hi) for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++) if (Math.abs(X[i] - c[0]) < 0.5) onAv.fill(onV, i * ny + lo, i * ny + hi);
          if (y2 > y1 && alo < ahi) for (let i = from(X, x1 - SEP - 1); i < nx && X[i] <= x2 + SEP + 1; i++) if (Math.abs(X[i] - c[0]) < SEP - 1) alongV.fill(1, i * ny + alo, i * ny + ahi);
        }
        if (c[1] === d[1]) { // horizontal: the same, across
          const lo = upto(X, x1), hi = from(X, x2), alo = Math.max(0, lo - 1), ahi = Math.min(nx - 1, hi);
          if (lo < hi) for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++) if (Math.abs(Y[j] - c[1]) < 0.5) { if (!onD) D(); onD[lo * ny + j]++; onD[hi * ny + j]--; }
          if (x2 > x1 && alo < ahi) for (let j = from(Y, y1 - SEP - 1); j < ny && Y[j] <= y2 + SEP + 1; j++) if (Math.abs(Y[j] - c[1]) < SEP - 1) { if (!onD) D(); alD[alo * ny + j]++; alD[ahi * ny + j]--; }
        }
      }
      if (onD) for (let i = 0; i < nx; i++) for (let j = 0, k = i * ny; j < ny; j++, k++) { // the runs along rows, summed
        if (i) { onD[k] += onD[k - ny]; alD[k] += alD[k - ny]; } if (onD[k] > 0) onAv[k] = onV; if (alD[k] > 0) alongH[k] = 1; }
      // routed after a port swap, it keeps off the end of its partner's stub, where the partner, routed next, starts
      if (spare) for (const p of [spare.stubs[0][1], spare.stubs[1][0]]) { const i = X.indexOf(p[0]), j = Y.indexOf(p[1]); if (i >= 0 && j >= 0) { if (allowCross) crossAt[i * ny + j] = 1; else ok[i * ny + j] = 0; } }
      // a line never runs round one of its own ends: the grid behind each (past the side opposite its port) is shut to it, unless its
      // other end is there. A route with no crossing went any length, round its own card too (clinic's reminder went over the
      // patient, down its far side and under it to reach the port below the patient's other line), and port repair saw nothing
      if (!loose) for (const [n, side, far] of [[e.s, e.fs, en], [e.t, e.ts, st]]) if (!behind(n, side, far)) {
        const lr = side === 'R' || side === 'L';
        (lr ? X : Y).forEach((v, a) => { if (behind(n, side, lr ? [v, n.y] : [n.x, v])) for (let b = 0; b < (lr ? ny : nx); b++) ok[lr ? a * ny + b : b * ny + a] = 0; });
      }
      if (any) for (const r of [...reserved, ...(loose ? corners : [])]) for (let i = from(X, r.x - 3); i < nx && X[i] < r.x + r.w + 3; i++) for (let j = from(Y, r.y - 3); j < ny && Y[j] < r.y + r.h + 3; j++) crossAt[i * ny + j] = 1;
      return { nx, ny, N, P, U, ok, crossAt, blockH, blockV, alongH, alongV }; };
    const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1]; // the four moves: right, left, down, up
    // a target shut in a small pocket that does not hold the start cannot be reached: flood out from it (moves work
    // both ways) and give up at once, instead of letting the search visit every cell it can reach. 'shut' when it is so shut in;
    // 'part' when, too, a cell of the pocket lies next to a line of this grid not next to it on the whole grid (XF, YF) or at
    // this grid's edge and not the whole one's: on the whole grid the pocket may go on; '' when the target is not shut in
    const at = (A, F) => { const g = new Int32Array(A.length); for (let a = 0, b = 0; a < A.length; a++) { while (F[b] !== A[a]) b++; g[a] = b; } return g; };
    const same = (g, a, n, nf) => (a + 1 < n ? g[a + 1] === g[a] + 1 : g[a] === nf - 1) && (a ? g[a - 1] === g[a] - 1 : g[a] === 0);
    const flood = (G, X, Y, s0, t0) => { const { nx, ny, ok, blockH, blockV } = G, gx = X === XF ? null : at(X, XF), gy = gx && at(Y, YF);
      const seen = G.U(6), q = [t0]; seen[t0] = 1; let whole = true;
      const passable = (i1, j1, i2, j2) => !(i1 !== i2 ? blockH[Math.min(i1, i2) * ny + j1] : blockV[i1 * ny + Math.min(j1, j2)]);
      for (let h = 0; h < q.length && q.length < 4000; h++) { const c = q[h], i = Math.floor(c / ny), j = c % ny;
        if (c === s0) break;
        if (gx && whole && !(same(gx, i, nx, XF.length) && same(gy, j, ny, YF.length))) whole = false;
        for (let nd = 0; nd < 4; nd++) { const i2 = i + DI[nd], j2 = j + DJ[nd]; if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
          const c2 = i2 * ny + j2; if (!seen[c2] && ok[c2] && passable(i, j, i2, j2)) { seen[c2] = 1; q.push(c2); } } }
      return q.length < 4000 && (s0 < 0 || !seen[s0]) ? whole ? 'shut' : 'part' : ''; };
    // on a big grid, the pocket is first looked for on a small one round the target: when it lies the same on the whole grid
    // (and so on this one, whose lines near the target are the whole grid's), the search fails without the big grid being built
    // (audit 55: the lines into one card's side, each beside the others, shut most of them in by its port, each on a grid of
    // the whole view)
    if (N > 20000) { const lX = X.filter(v => Math.abs(v - en[0]) <= 160), lY = Y.filter(v => Math.abs(v - en[1]) <= 160), L = grid(lX, lY);
      const li = v => lX.indexOf(v), lj = v => lY.indexOf(v), t = li(en[0]) * L.ny + lj(en[1]), s = li(st[0]) < 0 || lj(st[1]) < 0 ? -1 : li(st[0]) * L.ny + lj(st[1]);
      if (!L.ok[t] || (s >= 0 && !L.ok[s]) || flood(L, lX, lY, s, t) === 'shut') { if (!soft) sealed = bare; return null; } }
    const { P, U, ok, crossAt, blockH, blockV, alongH, alongV } = grid(X, Y);
    // a run within 8 px of a box's border costs ten times its length: the grid keeps a port's track and an earlier line's however
    // near a border, and a box levelled half a row from a card (#86) puts its border right by that card's ports
    const near = families.length ? P.near.subarray(0, 2 * N).fill(0) : null, nearY = families.length && Y.map(y => families.filter(f => Math.abs(y - f.y) < 8 || Math.abs(y - f.y - f.h) < 8)), nearX = families.length && X.map(x => families.filter(f => Math.abs(x - f.x) < 8 || Math.abs(x - f.x - f.w) < 8));
    const ix = v => X.indexOf(v), iy = v => Y.indexOf(v);
    const s0 = ix(st[0]) * ny + iy(st[1]), t0 = ix(en[0]) * ny + iy(en[1]);
    if (!ok[s0] || !ok[t0]) { if (!soft) sealed = bare; return null; }
    { const f = flood({ nx, ny, ok, blockH, blockV, U }, X, Y, s0, t0); if (f) { if (!soft && (!W || f === 'shut')) sealed = bare; return null; } }
    // Dijkstra over (cell, incoming direction)
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = P.dist.subarray(0, N * 4).fill(Infinity), prev = P.prev.subarray(0, N * 4).fill(-1);
    // a binary heap in typed arrays, with the same sift steps as before, so equal keys pop in the same order (each sift moves
    // a hole and writes the item once, where it stops, as the swaps it stands for would leave it)
    let hd = P.hd, hk = P.hk, hn = 0, pd = 0, pk = 0;
    const hpush = (k, d) => { if (hn === hd.length) { const d2 = new Float64Array(hn * 2), k2 = new Int32Array(hn * 2); d2.set(hd); k2.set(hk); hd = P.hd = d2; hk = P.hk = k2; P.hn = hn * 2; }
      let i = hn++; while (i) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hd[i] = hd[p]; hk[i] = hk[p]; i = p; } hd[i] = d; hk[i] = k; };
    const hpop = () => { pd = hd[0]; pk = hk[0]; hn--; if (hn) { const d = hd[hn], k = hk[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, dm = d;
      if (l < hn && hd[l] < dm) { m = l; dm = hd[l]; } if (r < hn && hd[r] < dm) m = r; if (m === i) break; hd[i] = hd[m]; hk[i] = hk[m]; i = m; } hd[i] = d; hk[i] = k; } };
    const d0 = DIRS.findIndex(d => d[0] === OUT[e.fs][0] && d[1] === OUT[e.fs][1]);
    const dEnd = DIRS.findIndex(d => d[0] === -OUT[e.ts][0] && d[1] === -OUT[e.ts][1]);
    // A*: the heap is keyed by distance plus the straight distance left, which never overestimates (every move costs
    // at least its length), so each route keeps its cost; the search stops visiting cells far from the target
    const hx = Float64Array.from(X, x => Math.abs(x - en[0])), hy = Float64Array.from(Y, y => Math.abs(y - en[1]));
    dist[s0 * 4 + d0] = 0; hpush(s0 * 4 + d0, hx[(s0 / ny) | 0] + hy[s0 % ny]);
    let best = -1;
    const nearOf = (nd, i, j, i2, j2) => (nd < 2 ? nearY[j].some(f => Math.max(X[i], X[i2]) > f.x && Math.min(X[i], X[i2]) < f.x + f.w) : nearX[i].some(f => Math.max(Y[j], Y[j2]) > f.y && Math.min(Y[j], Y[j2]) < f.y + f.h)) ? 2 : 1;
    while (hn) {
      if (any && !bare && ++anyWork > ANY_WORK) return gridRoute(e, allowCross, win, spare, soft); // past the budget: bare
      hpop(); const k = pk, cell = k >> 2, dir = k & 3, i = (cell / ny) | 0, j = cell - i * ny;
      if (pd > dist[k] + (hx[i] + hy[j])) continue;
      // (NEST) head on only for up to two bends more than the cheapest way in: a route that kept to it at any cost ran along a
      // box's border into its end (audit 38: laid out right, a transition past a two-level composite state, 3616 for 1950)
      if (NEST && best >= 0 && pd > dist[best] + 2 * BEND) { used = true; break; }
      const d = dist[k];
      // in head-on if it can; else the cheapest way in, the first found (it kept the last, the dearest: a top-to-top line on
      // the top row ran past its card and back, #80)
      if (cell === t0) { if (dir === dEnd) { best = k; break; } if (best < 0) best = k; continue; }
      const xi = X[i], yj = Y[j];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === dir && ((nd >> 1) === (dir >> 1))) continue; // no reversal
        const i2 = i + DI[nd], j2 = j + DJ[nd];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        // the move's own index: a move right or left between columns i and i2 at row j; up or down between rows j and j2
        const mv = nd < 2 ? (nd === 0 ? i : i2) * ny + j : i * ny + (nd === 2 ? j : j2);
        const c2 = i2 * ny + j2; if (!ok[c2] || (nd < 2 ? blockH[mv] : blockV[mv])) continue;
        const len = nd < 2 ? Math.abs(X[i2] - xi) : Math.abs(Y[j2] - yj);
        let w = len + (nd === dir ? 0 : BEND) + (crossAt[c2] ? CROSS : 0);
        if (any && (nd < 2 ? alongH[mv] : alongV[mv])) w += 2 * CROSS + 3 * len;
        if (near) { const q = 2 * mv + (nd < 2 ? 0 : 1); // each move's answer found once a search
          if (!near[q]) near[q] = nearOf(nd, i, j, i2, j2);
          if (near[q] === 2) w += 10 * len; }
        if (c2 === t0 && nd !== dEnd) w += BEND;
        const k2 = c2 * 4 + nd; if (d + w < dist[k2]) { dist[k2] = d + w; prev[k2] = k; hpush(k2, d + w + (hx[i2] + hy[j2])); }
      }
    }
    if (best < 0) return hard ? gridRoute(e, allowCross, win, spare, true) : null;
    const cells = []; for (let k = best; k >= 0; k = prev[k]) { cells.push(k >> 2); if (k === s0 * 4 + d0) break; }
    const pts = simplify([e.p1, ...cells.reverse().map(c => [X[Math.floor(c / ny)], Y[c % ny]]), e.p2]);
    // a box's title is shut to the last resort too (audit 37: laid out right, a line into a nested card ran in through its
    // box's name strip), unless keeping out of it makes the line run on another (check()'s share a line): then it costs
    if (hard && segsOf(pts).some(([a, b]) => avoid.some(([c, d]) => a[0] === b[0] ? c[0] === d[0] && Math.abs(a[0] - c[0]) < 1 && Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1
      : c[1] === d[1] && Math.abs(a[1] - c[1]) < 1 && Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1))) return gridRoute(e, allowCross, win, spare, true);
    return pts;
  }
  function simplify(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], a = out[out.length - 1];
      if (Math.abs(p[0] - a[0]) < .01 && Math.abs(p[1] - a[1]) < .01) continue;
      if (out.length > 1) { const b = out[out.length - 2]; if ((b[0] === a[0] && a[0] === p[0]) || (b[1] === a[1] && a[1] === p[1])) out.pop(); }
      out.push(p);
    }
    return out;
  }
  function fallback(e, d = 0) { // last resort: a plain elbow, its turn d px off half way
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    const horiz = e.fs === 'R' || e.fs === 'L', mid = (horiz ? (st[0] + en[0]) / 2 : (st[1] + en[1]) / 2) + d;
    return simplify(horiz ? [e.p1, st, [mid, st[1]], [mid, en[1]], en, e.p2] : [e.p1, st, [st[0], mid], [en[0], mid], en, e.p2]);
  }
  // labels: on the edge's own segment, in free space — never across another route, node, or label
  const placed = [];
  // every spot on e's line where a label of this text fits, best first, at pass 0 (strict), 1 (strict, but it may touch a box
  // border) or 2 (relaxed); a typed view's late tries (placeLabel) also 3 (relaxed, off box borders), 4 (strict, beside the line)
  // and 5 (relaxed, beside the line, off box borders: a long label on a short line in a box sat on its border, audit 25)
  const subOf = (e, text) => map && text && e.sublabel ? fit(e.sublabel, 9.5, e.under ? 320 : 440) : ''; // a second, smaller line under the label (#44)
  const sizeOf = (e, text, sub = subOf(e, text)) => { const two = !!(text && sub), pill = map && e.step != null;
    // a typed view's label: one line per line break, as wide as its widest, 12 px a line more (audit 22)
    const rows = map ? null : String(text ?? '').split(EDGE_BREAK);
    const w = map ? (text ? pillW(text, two && sub) : 0) + (pill ? stepW(e.step) + (text ? 4 : 6) : 0) : widest(rows, r => textW(r, 10)) + 12, hgt = map ? (two ? 32 : 20) : 18 + EDGE_LH * (rows.length - 1);
    return dg.turned ? { two, w: hgt, hgt: w } : { two, w, hgt }; }; // a view laid out down: turned, as its nodes are (stage 1 note §6)
  function* fits(e, text, pass) { const relax = pass === 2 || pass === 3 || pass === 5, sub = subOf(e, text);
    const segs = segsOf(e.pts).map((s, i) => ({ a: s[0], b: s[1], i, l: Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), h: s[0][1] === s[1][1] }));
    const order = [...segs].sort((p, q) => (q.h - p.h) * 40 + (q.l - p.l));
    // the runs of the other routed lines, as boxes (for spots) and as their ends' least and most x and y (for a box a label would
    // take), found once a call: routed does not change while it yields. Found for every spot, they made a view of 150 labelled
    // lines into one card spend seconds here (audit 55)
    let runs = null, ends = null;
    const cards = nodeRects.map(r => relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }); // each card and the room its stubs take
    const lines = () => runs ||= [...routed.filter(r => r !== e).map(r => r.pts), e.pts].flatMap(P => segsOf(P).map(([p, q]) => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) })));
    const onLine = g => { if (!ends) { const B = []; for (const r of routed) if (r !== e) for (const [a, b] of segsOf(r.pts)) B.push(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])); ends = Float64Array.from(B); }
      for (let k = 0; k < ends.length; k += 4) if (ends[k + 1] > g.x && ends[k] < g.x + g.w && ends[k + 3] > g.y && ends[k + 2] < g.y + g.h) return true; return false; }; // segHitsRect
    // the strict spots along a segment: the middle, a third and a fifth of the way, then those just clear of each card's stub room,
    // tag, label and line beside it, the middle's nearest first: where the label fits, one of them is in. The five alone missed a
    // gap 15 px wide, and the label sat on a box's border (clinic's "Queues reminders")
    const spots = (sg, w, hgt, off = 0) => { const v = sg.h ? 0 : 1, lo = sg.a[v], len = sg.b[v] - lo, half = (v ? hgt : w) / 2 + 3.5, mid = sg.a[1 - v] + off, across = (v ? w : hgt) / 2 + 3;
      const span = r => [[r.x, r.x + r.w], [r.y, r.y + r.h]], rs = [...nodeRects.map(r => ({ x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 })), ...tagRects, ...placed, ...lines()];
      return [.5, .32, .68, .2, .8, ...rs.map(span).filter(s => s[1 - v][0] < mid + across && s[1 - v][1] > mid - across).flatMap(s => [s[v][0] - half, s[v][1] + half])
        .map(u => (u - lo) / len).filter(f => f >= 0 && f <= 1).sort((p, q) => Math.abs(p - .5) - Math.abs(q - .5))]; };
    const { two, w, hgt } = sizeOf(e, text, sub), pill = map && e.step != null;
    for (const sg of order) {
      if (!relax && sg.h && sg.l < w + 10) continue;
      if (!relax && !sg.h && sg.l < hgt + 14) continue;
      // pass 4: beside the segment, either side, as strict (a line along a box's border leaves no spot on itself)
      for (const off of (pass === 4 || pass === 5 ? [-1, 1].map(k => k * ((sg.h ? hgt : w) / 2 + 4)) : [0])) for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : spots(sg, w, hgt, off))) {
        const lx = sg.a[0] + (sg.b[0] - sg.a[0]) * f + (sg.h ? 0 : off), ly = sg.a[1] + (sg.b[1] - sg.a[1]) * f + (sg.h ? off : 0);
        const box = { x: lx - w / 2, y: ly - hgt / 2, w, h: hgt };
        const grow = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
        if (cards.some(r => hit(r, box))) continue; // keep port stubs free
        if (tagRects.some(r => hit(r, grow))) continue;
        if (placed.some(r => (pass === 0 || pass >= 3 || !r.band) && hit(r, grow))) continue;
        if (!relax && onLine(grow)) continue;
        if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;
        yield { box, grow, lbl: { ...box, text, ...(two ? { sub } : {}), step: map ? e.step : null, ...(pill ? { sw: stepW(e.step) } : {}) } };
      }
    }
  }
  const put = (e, s, full) => { placed.push(s.box); reserved.push(s.grow); e.lbl = { ...s.lbl, short: s.lbl.text !== full }; };
  const unput = e => { const L = e.lbl, same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)), q = reserved.findIndex(same(3)); if (p >= 0) placed.splice(p, 1); if (q >= 0) reserved.splice(q, 1); e.lbl = null; };
  const fullOf = e => map ? fit(e.label || '', 10.5, e.under ? 320 : 440) : String((e.step != null ? e.step + ' · ' : '') + (e.label || '')).split(EDGE_BREAK).map(r => fit(r, 10, e.cut || 150)).join('\n');
  function placeLabel(e, late) { // late: a line left with no spot, once every line is routed: a typed view's takes a map's fallbacks too
    if (!e.label && e.step == null) return;
    const full = fullOf(e);
    const tries = [full]; if (e.step != null && e.label && !dg.abs) tries.push(map ? '' : String(e.step));
    const first = (x, text, pass) => fits(x, text, pass).next().value;
    let s = first(e, full, 0); if (s) return put(e, s, full);
    // a label whose spots are all taken by a label placed before it: that label moves to each of its other spots in turn, until
    // this one fits too. Both centred on their lines, the labels of two lines that leave a card side by side (16 px apart, too
    // close to stack) left the second no room, and it fell back to its step (assistant's "a draft", by a jog of 16 px)
    // Only a label within reach of e's line can be in its way: the others are passed over (each try scans every spot of both
    // lines, and over every line it made the late tries of a large typed view three times as slow)
    const { w: lw, hgt: lh } = sizeOf(e, full), xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]);
    const reach = { x: Math.min(...xs) - lw / 2 - 4, y: Math.min(...ys) - lh / 2 - 4, w: Math.max(...xs) - Math.min(...xs) + lw + 8, h: Math.max(...ys) - Math.min(...ys) + lh + 8 };
    if (map ? !late : late) for (const o of routed) { if (o === e || !o.lbl || o.lbl.short || o.fixed || !hit(o.lbl, reach)) continue;
      const was = o.lbl, back = () => put(o, { box: { x: was.x, y: was.y, w: was.w, h: was.h }, grow: { x: was.x - 3, y: was.y - 3, w: was.w + 6, h: was.h + 6 }, lbl: was }, was.text);
      unput(o); if (!first(e, full, 0)) { back(); continue; } // e finds no spot even without it
      for (const so of fits(o, was.text, 0)) { put(o, so, was.text); if ((s = first(e, full, 0))) return put(e, s, full); unput(o); }
      back(); }
    for (const pass of (late ? (map ? [4, 3] : [0, 4, 3, 5, 1, 2]) : map ? [0, 1, 2] : [0])) for (const text of tries) if ((pass || text !== full) && (s = first(e, text, pass))) return put(e, s, full);
  }
  let stats = {};
  free.forEach(e => { // every port's stub is reserved before routing starts
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    e.stubs = [[e.p1, st], [en, e.p2]];
  });
  const runRouting = order => {
    routed.length = 0; reserved.length = 0; placed.length = 0; stats = {};
    (dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });
    families.forEach(f => { const h = headRect(f); reserved.push(h); placed.push(h);
      placed.push(...[{ x: f.x, y: f.y - 3, w: f.w, h: 6 }, { x: f.x, y: f.y + f.h - 3, w: f.w, h: 6 }, { x: f.x - 3, y: f.y, w: 6, h: f.h }, { x: f.x + f.w - 3, y: f.y, w: 6, h: f.h }].map(r => ({ ...r, band: true }))); }); // lane headers and arrows stay clear
    edges.filter(e => e.fixed).forEach(e => { routed.push(e); if (e.under || e[OWN_ROUTE]) { placeLabel(e); stats[e.how] = (stats[e.how] || 0) + 1; return; } if (e.lbl) { placed.push(e.lbl); reserved.push({ x: e.lbl.x - 3, y: e.lbl.y - 3, w: e.lbl.w + 6, h: e.lbl.h + 6 }); } stats.comb = (stats.comb || 0) + 1; });
    order.forEach(e => {
      let how = 'grid'; e.lbl = null; e.pts = wide(e, false);
      if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 0); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
      stats[how] = (stats[how] || 0) + 1; e.how = how;
      routed.push(e); placeLabel(e);
    });
    return (stats.cross || 0) + (stats.fallback || 0);
  };
  __ms.place = performance.now() - __ms.t; __ms.t = performance.now();
  let order = [...free].sort((a, b) => (Math.abs(a.p1[0] - a.p2[0]) + Math.abs(a.p1[1] - a.p2[1])) - (Math.abs(b.p1[0] - b.p2[0]) + Math.abs(b.p1[1] - b.p2[1])));
  // lines into one side of a card nest (#49). The router turns a line as late as it can, so the line whose turn must lie
  // nearest the card goes first and each next one takes the track beside it: coming from below, the lowest port first;
  // from above, the highest. Shortest first, the last line found no track left and went round its own column.
  const into = {}; free.forEach(e => (into[e.t.id + '|' + e.ts] ||= []).push(e));
  Object.entries(into).forEach(([k, list]) => { if (list.length < 2) return; const ax = /\|[LR]$/.test(k) ? 1 : 0;
    const nearFirst = e => { const d = e.p1[ax] - e.p2[ax]; return d > 0 ? -e.p2[ax] : d < 0 ? e.p2[ax] - 1e6 : 1e7; };
    const slots = list.map(e => order.indexOf(e)).sort((a, b) => a - b), turns = [...list].sort((a, b) => nearFirst(a) - nearFirst(b));
    slots.forEach((at, i) => { order[at] = turns[i]; }); });
  // fan-in (issue 111): lines into a card that six or more lines come into go first, in that order, so they take the tracks by
  // the card and the rest go round them (r19's logger has seven; its lines crossed the ones routed before them).
  // ponytail: six fits the bench (five made d24's hub worse); a fan-in card's own layout row is what is left
  // (NEST) not a card whose lines all come from one other, which nest (shortest first, above): taken first, the lines one way
  // between two states took the inner tracks, and those the other way went round them and crossed (audit 39: eight
  // transitions, laid out right)
  const srcs = Object.create(null); if (NEST) free.forEach(e => { (srcs[e.t.id] ||= new Set()).add(e.s.id); });
  const fan = Object.create(null), hot = e => fan[e.t.id] >= 6 && !(NEST && srcs[e.t.id].size < 2); free.forEach(e => { fan[e.t.id] = (fan[e.t.id] || 0) + 1; });
  order = [...order.filter(hot), ...order.filter(e => !hot(e))];
  let bad = runRouting(order);
  // rip-up and reroute: an edge that had to cross goes first next time; keep the best attempt (not when the view is laid
  // out again with room for lines: that layout's tries seldom gained anything, and they cost a third of its time; with room for
  // a label it tries, as the layout it may replace did; none with reroute: false)
  // reroute: false still tries once when a line that had to cross runs across its own card's loop (audit 27: laid out right, a
  // two-way pair's line out of a card with a loop climbed through the loop; routed first, it keeps clear of it)
  const acrossLoop = () => { const L = edges.filter(e => e[OWN_ROUTE] === 'loop' && e.pts);
    return L.length > 0 && order.some(e => e.how !== 'grid' && L.some(l => (l.s === e.s || l.s === e.t) && segsOf(e.pts || []).some(([p, q]) => segsOf(l.pts).some(([r, s]) => crosses(p, q, r, s))))); };
  for (let tries = 0; bad && (dg.reroute !== false || !tries && acrossLoop()) && (!last || room.lx) && tries < 4; tries++) {
    const stuck = order.filter(e => e.how !== 'grid');
    const next = [...stuck, ...order.filter(e => e.how === 'grid')];
    const snap = order.map(e => [e, e.pts, e.lbl, e.how]), snapStats = stats, snapR = [routed.slice(), reserved.slice(), placed.slice()];
    const b2 = runRouting(next);
    if (b2 < bad) { bad = b2; order = next; }
    else { snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; }); stats = snapStats; routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); break; }
  }
  __ms.route = performance.now() - __ms.t; __ms.t = performance.now(); __ms.rounds = 0; __ms.reroutes = 0;
  // Lines left with no route get room (#40). Each one's route around the cards (the last resort's, below) shows where it
  // would run along another line: that column (row) gap widens by two lanes for it, and the view is laid out again.
  if (!last && !dg.quick && map && !dg.abs && free.some(e => e.how === 'fallback')) {
    const need = { x: {}, y: {} }, cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs));
    const gapAt = (v, vertical) => { if (vertical) return cs.find(c => colX[c] + (colW[c] || NW) < v && v < colX[c + 1]);
      for (let r = r0; r < r1; r++) if (rowY(r) + NH < v && v < rowY(r + 1)) return r; };
    free.filter(e => e.how === 'fallback').forEach(e => { routed.splice(routed.indexOf(e), 1); const p = wide(e, 2), mine = { x: new Set(), y: new Set() };
      segsOf(p || []).forEach(([a, b]) => { if (!routed.some(o => segsOf(o.pts).some(([c, d]) => colinear(a, b, c, d)))) return;
        const v = a[0] === b[0], g = gapAt(v ? a[0] : a[1], v); if (g != null) mine[v ? 'x' : 'y'].add(g); });
      for (const k of ['x', 'y']) mine[k].forEach(g => { need[k][g] = (need[k][g] || 0) + 2 * SEP; }); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) {
      for (const k of ['x', 'y']) Object.entries((room || {})[k] || {}).forEach(([g, v]) => { need[k][g] = (need[k][g] || 0) + v; });
      return { room: need, ms: { probe: performance.now() - t0 } };
    }
  }
  // port repair: two routes that cross next to a shared node side swap ports, keep it if issues drop. On a map a detour
  // counts, as the layout check counts it: a swap that took u21's Web shop's two lines round the map to save one crossing
  // was kept (unfolding Catalog)
  // a typed view's line on another, or along a box's border, counts as more than a crossing: a swap that saves a crossing so is
  // no gain (audit 38: laid out down, two transitions between one pair swapped ports, and one ran down another's track)
  const issueCount = only => routeAudit({ edges }, '', only).reduce((k, s) => k + (!NEST || / cross$/.test(s) ? 1 : (used = true, 3)), 0) + (map ? (only ? [...only] : edges).filter(e => detour(e.pts)).length : 0);
  const endAt = (e, n, side) => (e.s === n && e.fs === side) ? 'p1' : (e.t === n && e.ts === side) ? 'p2' : null;
  let issues = issueCount();
  // a swap re-routes only the two swapped edges (ripped up, then routed after every other route), not the whole
  // graph; a round goes on after an improvement; and repair spends at most 2 routings per free edge, so its cost
  // grows with the graph instead of with crossings x edges x routing (it stalled on 26 nodes / 44 edges)
  const restub = e => { e.stubs = [[e.p1, [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB]], [[e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB], e.p2]]; };
  const ripUp = e => { const i = routed.indexOf(e); if (i >= 0) routed.splice(i, 1); const L = e.lbl; if (!L) return;
    const same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)); if (p >= 0) placed.splice(p, 1); const q = reserved.findIndex(same(3)); if (q >= 0) reserved.splice(q, 1); };
  // a swapped edge tries a clean route near its ends, then one that may cross (near its ends, then anywhere); it
  // skips the clean whole-grid search, which mostly fails here and visits every cell when it does
  const routeOne = (e, spare) => { let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320, spare);
    if (!e.pts) { how = 'cross'; e.pts = wide(e, true, spare); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
    e.how = how; routed.push(e); placeLabel(e); return true; };
  let budget = 2 * free.length, swapped = false, rrSwap = false;
  // a route moved onto its end's new port: its last run follows it
  const moved = (e, k, P) => { const [i, j] = k === 'p1' ? [0, 1] : [P.length - 1, P.length - 2], v = P[i][1] === P[j][1];
    return P.length > 2 && simplify(P.map((p, x) => x === i ? e[k] : x === j ? (v ? [p[0], e[k][1]] : [e[k][0], p[1]]) : p)); };
  const segsE = e => e.pts.slice(0, -1).map((p, i) => [p, e.pts[i + 1]]), xing = (a, b) => segsE(a).some(([p, q]) => segsE(b).some(([r, s]) => crosses(p, q, r, s)));
  // with repair off (S19), two lines between the same two cards that cross (a request and its reply, laid out right) swap their
  // ports at both cards, else at one: their tie in the port order on a side is the model's edge order, which need not match where
  // each turns. Kept when the issues drop; the pairs are found by card pair, so it costs little more than the lines it looks at.
  // A typed view's only: a map's repair:false is its author's, no repair at all
  if (issues && dg.typed && dg.repair === false && !dg.noSwap) { const by = new Map(); free.forEach(e => { if (e.fixed || e.s === e.t || e.fromPort != null || e.toPort != null || e.inner) return; /* a port's end stays on its port */ const k = [e.s.id, e.t.id].sort().join('\n'); by.set(k, [...(by.get(k) || []), e]); });
    by.forEach(l => l.forEach((a, i) => l.slice(i + 1).forEach(b => {
      if (!xing(a, b)) return;
      const ks = [a.s, a.t].flatMap(n => ['L', 'R', 'T', 'B'].map(side => [endAt(a, n, side), endAt(b, n, side)]).filter(([x, y]) => x && y));
      if (ks.length !== 2) return;
      const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how, e.p1, e.p2]), snapR = [routed.slice(), reserved.slice(), placed.slice()], ab = new Set([a, b]), was = issueCount(ab);
      const undo = () => { snap.forEach(([e, p, lb, hw, p1, p2]) => { Object.assign(e, { pts: p, lbl: lb, how: hw, p1, p2 }); restub(e); });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); };
      for (const sw of [ks, [ks[0]], [ks[1]]]) {
        ripUp(a); ripUp(b);
        let ma = a.pts, mb = b.pts; sw.forEach(([ka, kb]) => { [a[ka], b[kb]] = [b[kb], a[ka]]; ma = ma && moved(a, ka, ma); mb = mb && moved(b, kb, mb); }); restub(a); restub(b);
        let now = Infinity;
        if (ma && mb) { a.pts = ma; b.pts = mb; a.lbl = b.lbl = null; routed.push(a, b); placeLabel(a); placeLabel(b); now = issues - was + issueCount(ab); if (now >= issues) { ripUp(a); ripUp(b); } }
        if (now >= issues) { routeOne(a); routeOne(b); now = issues - was + issueCount(ab); }
        if (now < issues) { issues = now; swapped = rrSwap = true; return; }
        undo();
      }
    })));
  }
  for (let round = 0; issues && dg.repair !== false && round < 8 && budget > 0; round++) {
    let fixed = false; __ms.rounds++;
    const pairs = []; edges.forEach((a, i) => edges.slice(i + 1).forEach(b => { if (xing(a, b)) pairs.push([a, b]); }));
    // a crossing pair, or a pair where one shares a node side with the other's crossing partner
    // each pair once, crossing pairs first; by place, since a model's edges need no id (by id, every pair of r15's was one)
    const cand = [], seen = new Set(), add = (a, b) => { const k = edges.indexOf(a) + '|' + edges.indexOf(b); if (!seen.has(k)) { seen.add(k); cand.push([a, b]); } };
    pairs.forEach(([a, b]) => add(a, b)); pairs.forEach(([a, b]) => free.forEach(o => { if (o !== a && o !== b) { add(a, o); add(b, o); } }));
    outer3: for (const [a, b] of cand.filter(([x, y]) => !x.fixed && !y.fixed)) {
      for (const n of [a.s, a.t]) for (const side of ['L', 'R', 'T', 'B']) {
        const ka = endAt(a, n, side), kb = endAt(b, n, side); if (!ka || !kb) continue;
        if (budget <= 0) break outer3;
        const pa = a[ka], pb = b[kb]; a[ka] = pb; b[kb] = pa; restub(a); restub(b);
        const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how]), snapR = [routed.slice(), reserved.slice(), placed.slice()];
        const ab = new Set([a, b]), was = issueCount(ab); // issues away from a and b cannot change
        budget -= 2; __ms.reroutes++;
        if (!was) { a[ka] = pa; b[kb] = pb; restub(a); restub(b); continue; } // nothing to gain: the count can only drop by their own issues
        ripUp(a); ripUp(b);
        // first the routes they have, each moved onto the other's port: two lines that cross where they leave one side no longer
        // cross (r15's web: its line to kit turned down past the line to api-client, and routed again they crossed again)
        const ma = moved(a, ka, a.pts), mb = moved(b, kb, b.pts); let now = Infinity;
        if (ma && mb) { a.pts = ma; b.pts = mb; a.lbl = b.lbl = null; routed.push(a, b); placeLabel(a); placeLabel(b); now = issues - was + issueCount(ab); if (now >= issues) { ripUp(a); ripUp(b); } }
        if (now >= issues) now = routeOne(a, b) && routeOne(b) ? issues - was + issueCount(ab) : Infinity;
        if (now < issues) { issues = now; fixed = swapped = true; if (!issues) break outer3; continue outer3; }
        a[ka] = pa; b[kb] = pb; restub(a); restub(b);
        snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
      }
    }
    if (!fixed) break;
  }
  if (swapped) { ['grid', 'cross', 'fallback'].forEach(k => { delete stats[k]; }); free.forEach(e => { stats[e.how] = (stats[e.how] || 0) + 1; }); }
  // a line that jogs 16 px or less between sides that face each other runs straight when one of its ends is the only port on its
  // side: that port moves level with the other end, if no issue comes with it. Ports are spread round the middle of a side, so a
  // line from the lower of a card's two ports into a card level with it jogged just before it (clinic's "Books appointments")
  if ((map || dg.typed) && dg.repair !== false) free.forEach(e => {
    const P = e.pts, ax = e.fs === 'L' || e.fs === 'R' ? 1 : 0, d = P[P.length - 1][ax] - P[0][ax];
    if (P.length !== 4 || !d || Math.abs(d) > 16 || OUT[e.fs][1 - ax] !== -OUT[e.ts][1 - ax]) return;
    const lone = (n, side) => !n.box && sides[n.id + '|' + side]?.length === 1, [k, n, side, v] = lone(e.t, e.ts) ? ['p2', e.t, e.ts, P[0][ax]] : lone(e.s, e.fs) ? ['p1', e.s, e.fs, P[3][ax]] : [];
    const sp = n && (ax ? [n.y + n.h * .08, n.y + n.h * .92] : sideSpan(n, side) || [n.x + n.w * .08, n.x + n.w * .92]);
    if (!k || v < sp[0] || v > sp[1]) return;
    const was = e[k], before = issueCount(new Set([e])), snap = [e.pts, e.lbl, e.how], snapR = [routed.slice(), reserved.slice(), placed.slice()];
    ripUp(e); e[k] = ax ? [was[0], v] : [v, was[1]]; restub(e); routeOne(e);
    if (e.pts.length === 2 && issueCount(new Set([e])) <= before) return;
    e[k] = was; restub(e); [e.pts, e.lbl, e.how] = snap;
    routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
  });
  // the last resort for a line still with no route: around the cards, across or along other lines if it must (it was a
  // plain elbow through whatever lay in its way, and a card's mask made the line look like a connection to that card)
  // A typed view's line first tries one of its ends on its card's top or bottom: two cards a gap of two stubs apart, each with
  // ports on the sides that face, leave a line out of one no track that keeps off a line into the other at its level (audit 24:
  // a state machine's X→Done ran along Waiting→Packed in the gap between X and Packed). Kept only when clean
  let tbBudget = 48; // ponytail: grid searches for all of a view's ends moved so, ample for the few lines a view leaves with no route
  const lenOf = P => segsOf(P).reduce((k, [a, b]) => k + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), 0) + BEND * (P.length - 2);
  const onTB = e => { if (!dg.typed || e.inner || e.fromPort != null || e.toPort != null || e.s === e.t) return false;
    const was = [e.p1, e.p2, e.fs, e.ts]; let best = null;
    for (const k of ['p1', 'p2']) { const n = k === 'p1' ? e.s : e.t, o = k === 'p1' ? e.t : e.s, fk = k === 'p1' ? 'fs' : 'ts';
      if (n.box || e[fk] === 'T' || e[fk] === 'B') continue;
      for (const side of ['T', 'B']) { const y = side === 'T' ? n.y : n.y + n.h, taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[0]);
        const lo = n.x + n.w * .08, hi = n.x + n.w * .92, ox = o.x + o.w / 2, xs = [0, -1, 1, -2, 2].map(j => n.x + n.w / 2 + j * PORT).filter(x => x >= lo && x <= hi && taken.every(t => Math.abs(t - x) >= PORT)).sort((a, b) => Math.abs(a - ox) - Math.abs(b - ox));
        for (const x of xs) { if (tbBudget-- <= 0) break; e[k] = [x, y]; e[fk] = side; restub(e); const P = wide(e, false);
          if (P && (!best || lenOf(P) < lenOf(best[0]))) best = [P, k, [x, y], side];
          [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } } }
    if (!best) return false;
    const [P, k, q, side] = best; e[k] = q; e[k === 'p1' ? 'fs' : 'ts'] = side; restub(e); e.pts = P; e.how = 'grid'; return true; };
  const issuesOf = e => { const ps = routeAudit({ edges, families, byId }, '', new Set([e])); return [ps.filter(p => / share a line$/.test(p)).length, ps.length]; };
  const lastR = dg.quick ? [] : free.filter(e => e.how === 'fallback');
  lastR.forEach(e => { ripUp(e); e.pts = wide(e, 2) || (dg.typed && through(e.pts, e) && gridRoute(e, 3, 0)) || e.pts; e.lbl = null; routed.push(e); placeLabel(e); });
  // then each of them whose route runs round one of its own ends (the last resort may: audit 21), that end tried on each other
  // side of its card, kept when the route there runs round neither end and has no more issues (audit 28: er-through2-min laid
  // out down left its source's bottom and went left of it, over it and down its right side, and crossed a line anyway)
  // or (NEST) one that passes the line of its end's side and comes back to it (audit 38: laid out down, a line into a final state
  // ran down past its top, under the self-transition of the state above, and back up into it)
  const past = (n, side, p) => side === 'T' ? p[1] > n.y + .5 : side === 'B' ? p[1] < n.y + n.h - .5 : side === 'L' ? p[0] > n.x + .5 : p[0] < n.x + n.w - .5;
  const roundOwn = (e, P) => [[e.s, e.fs, P[P.length - 1]], [e.t, e.ts, P[0]]].find(([n, side, far]) => n && !n.box && !behind(n, side, far) && P.some(p => behind(n, side, p)))
    || (NEST ? [[e.s, e.fs, P[P.length - 1], P.slice(2, -1)], [e.t, e.ts, P[0], P.slice(1, -2)]].find(([n, side, far, mid]) => n && !n.box && !past(n, side, far) && mid.some(p => past(n, side, p))) : undefined);
  if (dg.typed) lastR.forEach(e => { const r = roundOwn(e, e.pts); if (!r || e.inner || e.fromPort != null || e.toPort != null || e.s === e.t) return;
    const k = r[0] === e.s && r[1] === e.fs ? 'p1' : 'p2', fk = k === 'p1' ? 'fs' : 'ts', n = r[0], o = k === 'p1' ? e.t : e.s, k0 = issuesOf(e)[1];
    const was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how]; let best = null; ripUp(e);
    for (const side of ['R', 'L', 'B', 'T'].filter(sd => sd !== e[fk])) { const lr = side === 'L' || side === 'R';
      const taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[lr ? 1 : 0]);
      const mid = lr ? n.y + n.h / 2 : n.x + n.w / 2, len = lr ? n.h : n.w, lo = mid - len * .42, hi = mid + len * .42, to = lr ? o.y + o.h / 2 : o.x + o.w / 2;
      const vs = [0, -1, 1, -2, 2].map(j => mid + j * PORT).filter(v => v >= lo && v <= hi && taken.every(t => Math.abs(t - v) >= PORT)).sort((a, b) => Math.abs(a - to) - Math.abs(b - to));
      for (const v of vs.slice(0, 1)) { if (tbBudget-- <= 0) break;
        e[k] = lr ? [side === 'L' ? n.x : n.x + n.w, v] : [v, side === 'T' ? n.y : n.y + n.h]; e[fk] = side; restub(e);
        const P = wide(e, 2) || gridRoute(e, 3, 0);
        if (P && !roundOwn(e, P) && !through(P, e)) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e)[1];
          if (k1 <= k0 && (!best || k1 < best[0] || (k1 === best[0] && lenOf(P) < lenOf(best[1])))) best = [k1, P, e[k], side]; ripUp(e); }
        [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } }
    if (best) { e[k] = best[2]; e[fk] = best[3]; restub(e); e.pts = best[1]; e.how = 'grid'; } else { e.pts = was[4]; e.how = was[5]; }
    e.lbl = null; routed.push(e); placeLabel(e); });
  // then each of them that runs along another line, its end moved (onTB), when that leaves it none and no more issues
  if (dg.typed) lastR.forEach(e => { const k0 = issuesOf(e); if (!k0[0]) return;
    const was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how]; ripUp(e);
    if (onTB(e)) { e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (!k1[0] && k1[1] <= k0[1]) return; ripUp(e); }
    // else the last resort again, round what the lines before it moved: kept when it runs along fewer
    [e.p1, e.p2, e.fs, e.ts, e.pts, e.how] = was; restub(e); const P = wide(e, 2);
    if (P) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (k1[0] < k0[0] && k1[1] <= k0[1]) return; ripUp(e); e.pts = was[4]; }
    e.lbl = null; routed.push(e); placeLabel(e); });
  // (NEST) then each line that crosses a box's title, runs along a box's border, runs through a box that holds neither of its
  // ends (drawn so it seems to enter the box and leave it, and a region's title, which state.js draws later, may lie on its
  // way) or runs along a line the last resort drew into a box or along a loop (audit 44: laid out right, the last resort's turn
  // ran on a state's self-transition's top run, half a pixel off, where no grid track lay between the loop and the row above): the line routed again with every box that holds neither end
  // shut to it, from its own sides and with each end on each other side of its card, and the best kept by check()'s rule (a
  // title crossed or a border or line run along before crossings, then all issues, then boxes run through). Audit 39: laid out
  // down, a transition from a state over a composite to the state under it, its way in shut by a loop, ran in through the
  // composite's title and out through its bottom; its way into the state's side was clear. (Each title as headRect has it:
  // routeAudit's strip lies along a box's top, and a turned view's title runs down its left)
  // and each box as the type draws it (dg.drawn: state.js stretches a state's regions across it, so a region's title moves to the
  // state's left; audit 44: laid out right, the initial transition ran through a composite whose region's title, drawn there,
  // it crossed, while a route round the composite crossed one line), in the view's own axes
  const drawnAs = (() => { if (!NEST || typeof dg.drawn !== 'function' || !families.length) return null;
    const flip = r => (TB ? { ...r, x: r.y, y: r.x, w: r.h, h: r.w } : r), out = dg.drawn(nodes.map(flip), families.map(flip)) || [];
    const by = new Map(families.map(f => [f.id, f])), m = new Map();
    out.forEach(d => { const f = by.get(d.id), q = d && flip(d); if (f && q && (q.x !== f.x || q.y !== f.y || q.w !== f.w || q.h !== f.h)) m.set(f, { ...f, x: q.x, y: q.y, w: q.w, h: q.h }); }); return m.size ? m : null; })();
  const titles = e => families.filter(f => segsOf(e.pts).some(([a, b]) => segHitsRect(a, b, headRect(f)) || (drawnAs && drawnAs.has(f) && segHitsRect(a, b, headRect(drawnAs.get(f)))))).length;
  const boxIn = e => families.filter(f => !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t) && segsOf(e.pts).some(([a, b]) => segHitsRect(a, b, { x: f.x + 1, y: f.y + 1, w: f.w - 2, h: f.h - 2 }))).length;
  // [issues other than crossings, all, boxes run through] of the lines in `only` (all: the view's, once each)
  const boxSaid = only => { const ps = routeAudit({ edges, families, byId }, '', only).filter(p => !/ header crossed by /.test(p)), x = ps.filter(p => / cross$/.test(p)).length;
    const L = only ? [...only] : edges.filter(e => e.pts), b = L.reduce((k, e) => k + titles(e), 0); return [ps.length - x + b, ps.length + b, L.reduce((k, e) => k + boxIn(e), 0)]; };
  const lt3 = (u, w) => u[0] < w[0] || (u[0] === w[0] && (u[1] < w[1] || (u[1] === w[1] && u[2] < w[2])));
  const relabel = (e, L) => { e.lbl = L; routed.push(e); if (L) { placed.push(L); reserved.push({ x: L.x - 3, y: L.y - 3, w: L.w + 6, h: L.h + 6 }); } };
  // (the pass is kept only when the view as a whole is better for it: a line's move can take a track another line wanted)
  // ponytail: a dozen grid searches a layout, and a line that only runs through a box tried in views of up to 30 cards (as
  // bestFlow): the stress file's 50 states laid out in twice the time
  let boxBudget = 12;
  if (NEST) { const r0 = [], is0 = routeAudit({ edges, families, byId }, '', null, r0), bad = new Set();
    is0.forEach((p, k) => { if (/ along the border of /.test(p)) bad.add(r0[k][0]); else if (/ share a line$/.test(p) && r0[k].some(x => lastR.includes(x) && (x.s.box || x.t.box || r0[k].some(y => y.s === y.t)))) r0[k].forEach(x => bad.add(x)); });
    const todo = free.filter(e => !e.fixed && !e.inner && e.fromPort == null && e.toPort == null && e.s !== e.t && e.pts && (bad.has(e) || titles(e) || (nodes.length <= 30 && boxIn(e))));
    const v0 = todo.length ? boxSaid() : null, snap = todo.length ? edges.map(e => [e, e.p1, e.p2, e.fs, e.ts, e.pts, e.how, e.lbl, e.stubs]) : null, snapR = todo.length ? [routed.slice(), reserved.slice(), placed.slice()] : null, used0 = used;
    todo.forEach(e => { const k0 = boxSaid(new Set([e])), was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how, e.lbl]; let best = null; ripUp(e);
      for (const [k, fk, n, o, given] of [['p1', 'fs', e.s, e.t, e.fromSide], ['p2', 'ts', e.t, e.s, e.toSide]]) { if (n.box) continue;
        // (an end whose side the type gives, a bar's long side, stays on it)
        for (const side of ['R', 'L', 'B', 'T'].filter(sd => sd === e[fk] ? k === 'p1' : !EDGE_SIDE[given])) { const lr = side === 'L' || side === 'R', same = side === e[fk];
          const taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[lr ? 1 : 0]);
          const mid = lr ? n.y + n.h / 2 : n.x + n.w / 2, len = lr ? n.h : n.w, to = lr ? o.y + o.h / 2 : o.x + o.w / 2;
          const v = [0, -1, 1, -2, 2].map(j => mid + j * PORT).filter(x => Math.abs(x - mid) <= len * .42 && taken.every(t => Math.abs(t - x) >= PORT)).sort((a, b) => Math.abs(a - to) - Math.abs(b - to))[0];
          if ((!same && v == null) || boxBudget-- <= 0) continue; // (its own side: the route again, every such box shut)
          if (!same) { e[k] = lr ? [side === 'L' ? n.x : n.x + n.w, v] : [v, side === 'T' ? n.y : n.y + n.h]; e[fk] = side; restub(e); }
          shut = true; const P = gridRoute(e, true, 320) || gridRoute(e, 2, 320); shut = false;
          if (P && !roundOwn(e, P) && !through(P, e)) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = boxSaid(new Set([e]));
            if (lt3(k1, k0) && (!best || lt3(k1, best[0]) || (!lt3(best[0], k1) && lenOf(P) < lenOf(best[1])))) best = [k1, P, k, fk, e[k], side]; ripUp(e); }
          [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } }
      if (best) { e[best[2]] = best[4]; e[best[3]] = best[5]; restub(e); e.pts = best[1]; e.how = 'grid'; used = true; e.lbl = null; routed.push(e); placeLabel(e); }
      else { e.pts = was[4]; e.how = was[5]; relabel(e, was[6]); } });
    if (todo.length && !lt3(boxSaid(), v0)) { snap.forEach(([e, p1, p2, fs, ts, pts, how, lbl, stubs]) => Object.assign(e, { p1, p2, fs, ts, pts, how, lbl, stubs }));
      routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); used = used0; } }
  if (!dg.quick) edges.forEach(e => { const n = through(e.pts, e); if (n) warn(`the line for edge ${edgeRefIds(e).join(' / ') || e.from + '->' + e.to} runs through card "${n.name ?? n.id}", which it does not join: no route found around it`); });
  __ms.repair = performance.now() - __ms.t; delete __ms.t;
  // a label on a box's border, cut to its step or with no spot asks for room where it is: the column gap it sits in widens by
  // the label's width, else the row gap by its height and 14 px; a label in neither, or with no spot, the gap its line's longest
  // run crosses, a column's first. layoutGraph lays the view out again with it, and keeps that layout if it is better
  // a label still with no spot, once every line is routed: a typed view's tries an earlier label moved, a spot beside its line,
  // one over a line but off box borders, then a map's looser ones; a map's (which had those) the two between. Drawn so, it still
  // asks for room below (it was left off with nothing said, audit 6). One left with none, check() names (leaveIssues). A
  // numbered view's comb places its own labels
  // a typed view's label that a line routed after it, or moved later, runs across is taken off first, and placed again so (audit
  // 32: a block definition view laid out down drew a dependency's label on the generalization, which check() names)
  // with a typed view's late tries; where those find no spot off every line, or only its step, it stays where it was
  const STAYS = new Set(); // labels left on a line: the view is laid out again with room for them, as for one with no spot
  const onLine = (e, L) => { const r = { x: L.x + 1, y: L.y + 1, w: L.w - 2, h: L.h - 2 }; return edges.some(o => o !== e && o.pts && segsOf(o.pts).some(([a, b]) => segHitsRect(a, b, r))); };
  if (!map) edges.forEach(e => { const L = e.lbl; if (!L || e.fixed || !onLine(e, L)) return;
    unput(e); placeLabel(e, true);
    if (e.lbl && !(e.lbl.short && !L.short) && !onLine(e, e.lbl)) { LOOSE.add(e); return; }
    if (e.lbl) unput(e); STAYS.add(e);
    placed.push({ x: L.x, y: L.y, w: L.w, h: L.h }); reserved.push({ x: L.x - 3, y: L.y - 3, w: L.w + 6, h: L.h + 6 }); e.lbl = L; });
  edges.forEach(e => { if ((e.label || e.step != null) && !e.lbl && e.pts && !(map && e.fixed)) { placeLabel(e, true); if (e.lbl) LOOSE.add(e); } });
  let labelRoom = null;
  const lost = e => !e.lbl || LOOSE.has(e) || STAYS.has(e) && !dg.labelGaps; // a typed view's rows are of mixed height: only such a label widens a row gap, by its row's foot
  // ponytail: a typed view without labelGaps is laid out again for such a label only up to 30 cards (as bestFlow): the layout
  // more doubled the time of a generated view of 50 (requirement-stress, past CI's 1 s); a larger one keeps the looser spot
  const tight = !last && !dg.quick && !dg.abs ? free.filter(e => (e.label || e.step != null) && (lost(e) && (map || dg.labelGaps || nodes.length <= 30) || (map || dg.labelGaps) && (e.lbl.short || families.some(f => onBorder(e.lbl, f))))) : [];
  if (tight.length) {
    const cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs)), need = { x: {}, y: {} };
    const gaps = [...cs.filter(c => colX[c + 1] != null).map(c => ['x', c, colX[c] + (colW[c] || NW), colX[c + 1]]),
      ...Array.from({ length: r1 - r0 }, (_, k) => ['y', r0 + k, map ? rowY(r0 + k) + NH : Math.max(rowY(r0 + k), ...nodes.filter(n => n.row === r0 + k).map(n => n.y + n.h)), rowY(r0 + k + 1)])];
    tight.forEach(e => { const { w, hgt: h } = sizeOf(e, fullOf(e)), L = !LOOSE.has(e) && e.lbl, c = L && { x: L.x + L.w / 2, y: L.y + L.h / 2 }, gs = map || lost(e) ? gaps : gaps.filter(g => g[0] === 'x');
      let best = c && ['x', 'y'].map(k => gs.find(([gk, g, p, q]) => gk === k && c[k] >= p && c[k] <= q)).find(Boolean);
      if (!best) segsOf(e.pts).forEach(([a, b]) => { const k = a[1] === b[1] ? 'x' : 'y', i = k === 'x' ? 0 : 1, lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
        gs.forEach(([gk, g, p, q]) => { const run = Math.min(hi, q) - Math.max(lo, p); if (gk === k && run > 0 && (!best || (k === 'x') > (best[0] === 'x') || ((k === 'x') === (best[0] === 'x') && run > best[2]))) best = [k, g, run]; }); });
      if (best) need[best[0]][best[1]] = (need[best[0]][best[1]] || 0) + (best[0] === 'x' ? w : h + 14); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) labelRoom = { ...room, lx: need.x, ly: need.y };
  }
  const groups = (dg.groups || []).map(g => {
    const ms = (g.nodes || []).map(i => byId[i]).filter(Boolean);
    if (!ms.length) return null;
    const P = 18;
    return { ...g, k: kindOf(g.kind || 'external'), x: Math.min(...ms.map(n => n.x)) - P, y: Math.min(...ms.map(n => n.y)) - P - 16,
      x2: Math.max(...ms.map(n => n.x + n.w)) + P, y2: Math.max(...ms.map(n => n.y + n.h)) + P };
  }).filter(Boolean);
  const xs = [...families.flatMap(f => [f.x,f.x+f.w]), ...(dg.lanes || []).flatMap(l => [l.x, l.x + l.w]), ...nodes.flatMap(n => [n.x - 14, n.x + n.w + 8]), ...groups.flatMap(g => [g.x, g.x2]), ...edges.flatMap(e => e.pts.map(p => p[0])), ...placed.flatMap(p => [p.x, p.x + p.w])];
  const ys = [...families.flatMap(f => [f.y,f.y+f.h]), ...(dg.lanes || []).flatMap(l => [l.y, l.y + l.h]), ...nodes.flatMap(n => [n.y - 14, n.y + n.h + (n.tag ? 18 : 8)]), ...groups.flatMap(g => [g.y, g.y2]), ...edges.flatMap(e => e.pts.map(p => p[1])), ...placed.flatMap(p => [p.y, p.y + p.h])];
  intake.forEach(b => { xs.push(b.cx - b.r - 8 - textW(b.label || '', 10.5), b.cx + b.r); ys.push(b.cy - b.r, b.cy + b.r); });
  if (!xs.length) xs.push(0), ys.push(0); // a view with nothing in it: an empty stage
  const M = 36, minX = Math.min(...xs) - M, minY = Math.min(...ys) - M;
  return { ms: __ms, ...(used ? { nested: true } : {}), ...(turns ? { turns: true } : {}), ...(grew ? { grew: true } : {}), ...(labelRoom ? { labelRoom } : {}), ...(rrSwap ? { rr: true } : {}), stats, nodes, edges, subAndChips: !!dg.subAndChips, groups, families, intake, tour: dg.tour || null, byId, map, hub: dg.hub || null, lanes: dg.lanes || [], blocks: dg.blocks || [], bounds: { x: minX, y: minY, w: Math.max(...xs) - minX + M, h: Math.max(...ys) - minY + M } };
}

export { CHG, NW, OWN_ROUTE, PLAIN, SPAN, TURNS, labelW, pillW, stepW, stepOrder, hit, untangle, pullSources, rowsFor, layoutGraph, settlePins, pinCells };
