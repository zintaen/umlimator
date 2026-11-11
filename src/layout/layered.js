import { fit, sansW, textW } from '../core/text.js';
import { behind, detour, onBorder, routeAudit } from './audit.js';
import { edgeRefIds } from '../map/api.js';
import { badgesOf, mapNodeW, mapTabs, toneOf } from '../map/cards.js';
import { warn } from '../core/warn.js';
import { kindOf } from '../map/kinds.js';

const CHG = { added: ['green', 'NEW'], new: ['green', 'NEW'], modified: ['amber', 'CHANGED'], changed: ['amber', 'CHANGED'], removed: ['rose', 'REMOVED'], planned: ['cyan', 'PLANNED'] };
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
const labelW = e => textW(fit((e.step != null ? e.step + ' · ' : '') + (e.label || ''), 10, 150), 10) + 12;

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
  const crossings = () => { const at = tops(); let n = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const [a, b, oa, ob] = segs[i], [c, d, oc, od] = segs[j];
      if (colOf[a] === colOf[c] && (at[a] + oa - at[c] - oc) * (at[b] + ob - at[d] - od) < 0) n++; }
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
  const row = Object.create(null), colOf = Object.create(null); cols.forEach((c, k) => { let r = 0; c.forEach(id => { row[id] = fixed[id] ?? r; r += h(id); colOf[id] = k; }); });
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
/* Geometry: node boxes, ports, orthogonal routes, label slots. A view with lines the router found no route for is laid
   out once more, with room where those lines need it (#40); a view whose lines all route keeps its geometry. */
function layoutGraph(dg, map) {
  let g = layoutPass(dg, map, null);
  if (g.room) { const g2 = layoutPass(dg, map, g.room, true); g2.ms.probe = g.ms.probe; g = g2; }
  // a label with no room where it fits: the view laid out again with room for it, kept with fewer issues and labels cut short
  if (g.labelRoom) { const g2 = layoutPass(dg, map, g.labelRoom, true), cut = h => h.edges.filter(e => (e.label || e.step != null) && (!e.lbl || e.lbl.short)).length;
    delete g.labelRoom; if (routeAudit(g2, '').length + cut(g2) < routeAudit(g, '').length + cut(g)) g = g2; }
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
  const fan = {}; best.edges.forEach(e => { if (!e.back) fan[e.to] = (fan[e.to] || 0) + 1; });
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
  const __ms = { t: performance.now() }, t0 = __ms.t;
  const CG = dg.gap ? dg.gap : map ? (dg.mainSteps && !dg.containers ? 38 : 66) : CG0, RG = dg.rgap ? dg.rgap : map ? 44 : RG0; // family borders also need clearance between columns
  const NH = dg.nodeH || 64, pitch = NH + RG;
  const C = map ? 16 : 12, STUB = dg.mainSteps ? C : C + 6, SEP = 10; // maps: 16 px clear of other nodes
  const nodes = (dg.nodes || []).map((n, i) => {
    const k = kindOf(n.kind, map);
    const w = n.w || (map ? mapNodeW(n) : NW);
    return { ...n, k, col: n.col ?? i, row: n.row ?? 0, w, h: n.h || NH };
  });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
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
  const gapAfter = {}, colOf = {}, boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if ((map || dg.typed) && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);
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
  // A typed view's lines from a node to itself (risks.md F1) are loops round its top right corner, nested, the first innermost:
  // each one's top run D px above the node, its label on that run clear of the node's stub room and of the loop inside; its
  // right run R px right of the node, far enough for the top run to hold the label. out: how far each loop's port on the
  // node's top lies left of its right side (0 before ports are known, for the room: above the node's row, right of its column)
  const loopDims = (list, out) => { let D = 0, R = 0, half = 0;
    return list.map((e, k) => { const lw = e.label || e.step != null ? labelW(e) : 0, [bw, bh] = dg.turned ? [lw && 18, lw] : [lw, lw && 18];
      D = k ? D + half + bh / 2 + 10 : STUB + 6 + bh / 2; half = bh / 2;
      R = Math.max(k ? R + 2 * SEP : STUB + 4, bw + 12 - out[k]); return { D, R, top: D + half }; }); };
  const loops = Object.create(null); if (dg.typed && !dg.abs) (dg.edges || []).forEach(e => { if (e.from === e.to && byId[e.from]) (loops[e.from] ||= []).push(e); });
  Object.entries(loops).forEach(([id, list]) => { const n = byId[id], d = loopDims(list, list.map(() => 0)).at(-1);
    extraY[n.row - .5] = Math.max(extraY[n.row - .5] || 0, d.top + STUB + 7 - RG);
    extraX[n.col] = Math.max(extraX[n.col] || 0, d.R + STUB + 6 - Math.max(CG, gapAfter[n.col] || 0)); });
  // a typed view's rows (stage 1 note §4): each as tall as its tallest node, a node on a half row counting toward both rows, and
  // NH with none. With every node NH tall, the pitch is a map's
  const rowH = {}, rowTop = {}; if (dg.typed && !dg.abs && nodes.length) {
    nodes.forEach(n => [Math.floor(n.row), Math.ceil(n.row)].forEach(k => { rowH[k] = Math.max(rowH[k] ?? 0, n.h); }));
    const r0 = Math.min(...Object.keys(rowH).map(Number)), r1 = Math.max(...Object.keys(rowH).map(Number));
    for (let k = r0, y = r0 * pitch; k <= r1 + 1; k++) { rowTop[k] = y; y += (rowH[k] ?? NH) + RG; } }
  const rowAt = r => { const k = Math.floor(r), f = r - k; return rowTop[k] == null || rowTop[k + 1] == null ? r * pitch : rowTop[k] + f * (rowTop[k + 1] - rowTop[k]); };
  const rowHt = r => Math.max(rowH[Math.floor(r)] ?? NH, rowH[Math.ceil(r)] ?? NH); // a typed row's height, a half row's the taller of its two
  const gap = c => Math.max(CG, gapAfter[c] || 0) + (extraX[c] || 0);
  const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + gap(Math.floor(c)));
  const rowY = r => Object.keys(extraY).reduce((y, k) => +k < r ? y + extraY[k] : y, dg.typed ? rowAt(r) : r * pitch);
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
  const familyDefs = dg.containers || [], tagged = n => map && (n.author || n.k === 'm-ext'); // tagged: a name tag hangs under the card
  const framesNow = () => { const cache = {};
    const frameOf = (f, trail = new Set()) => {
      if (cache[f.id]) return cache[f.id];
      if (trail.has(f.id)) return null;
      const next = new Set([...trail, f.id]);
      const children = familyDefs.filter(c => c.parent === f.id).map(c => frameOf(c, next)).filter(Boolean);
      const members = (f.nodeIds || []).map(id => byId[id]).filter(Boolean);
      const rects = [...members.map(n => ({x:n.x - 36,y:n.y - 14,w:n.w + 72,h:n.h + 44 + (tagged(n) ? 14 : 0)})), ...children];
      if (!rects.length) return null;
      const p = 12, x = Math.min(...rects.map(r => r.x)) - p, y = Math.min(...rects.map(r => r.y)) - p - 24;
      return cache[f.id] = {...f, x, y, w:Math.max(...rects.map(r => r.x+r.w)) + p - x, h:Math.max(...rects.map(r => r.y+r.h)) + p - y};
    };
    const out = familyDefs.map(f => frameOf(f)).filter(Boolean);
    if (map) out.forEach(f => { // the box fits its title and its badges, which are tabs on its top border, at the right
      const tabs = [...badgesOf(f).map((b, i) => ({ text: b.text, fill: toneOf(b), badge: i, w: b.text.length * 6.4 + 10 })), ...(f.unfolds ? [{ text: '⤡', fold: true, w: 28 }] : [])], all = tabs.reduce((a, t) => a + t.w + 4, -4); // an unfolded card's box: its ⤡ folds it (#71)
      f.w = Math.max(f.w, String(f.label || f.id).length * 6.7 + 32 + (tabs.length ? all + 8 : 0));
      let tx = f.x + f.w - 12 - all; f.tabs = tabs.map(t => { const o = { ...t, x: tx }; tx += t.w + 4; return o; }); });
    return out;
  };
  // Boxes keep apart: a column (row) gap widens wherever a box would come within 32 px of another box, or of a card outside
  // it, so their borders never touch and a line can run between them. Frames are measured again until nothing is too close.
  if (map && !dg.abs && familyDefs.length) for (let pass = 0, BOXGAP = 32; pass < 4; pass++) {
    const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    const span = ns => ns.length ? { c0: Math.min(...ns.map(n => n.col)), c1: Math.max(...ns.map(n => n.col)), r0: Math.min(...ns.map(n => n.row)), r1: Math.max(...ns.map(n => n.row)) } : null;
    const fr = framesNow().map(f => ({ ...f, s: span(nodes.filter(n => within(n, f))) })).filter(f => f.s);
    const cards = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h + (tagged(n) ? 14 : 0), s: span([n]) }));
    const wantX = {}, wantY = {}, want = (o, k, v) => { if (v > 0) o[k] = Math.max(o[k] || 0, Math.ceil(v)); };
    fr.forEach((A, i) => [...fr.slice(i + 1), ...cards].forEach(B => {
      if (within(A, B) || within(B, A) || !hit(A, B, BOXGAP)) return;
      const a = A.s, b = B.s;
      if (a.c1 < b.c0 || b.c1 < a.c0) { const [L, R] = a.c1 < b.c0 ? [A, B] : [B, A]; want(wantX, Math.floor(L.s.c1), L.x + L.w + BOXGAP - R.x); }
      else if (a.r1 < b.r0 || b.r1 < a.r0) { const [T, U] = a.r1 < b.r0 ? [A, B] : [B, A]; want(wantY, Math.floor(T.s.r1), T.y + T.h + BOXGAP - U.y); }
    }));
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
      while (t.length > 4 && sansW(t, 10, .92) + 42 > max) t = t.slice(0, -2) + '…';
      const w = Math.ceil(sansW(t, 10, .92) + 42);
      n.tag = { x: n.x + n.w - 12 - w, y: n.y + n.h - 9, w, h: 22, text: t, img: A.avatar || '', name: A.name || '' };
      n.decoB.push([n.tag.x - 2, n.tag.w + 4]);
    }
  });
  const tagRects = nodes.filter(n => n.tag).map(n => ({ x: n.tag.x - 2, y: n.tag.y - 2, w: n.tag.w + 4, h: n.tag.h + 6 }));
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
  // something inside it: that has no line)
  const boxEnd = map ? Object.fromEntries(families.map(f => [f.id, { id: f.id, label: f.label || f.id, box: true, x: f.x, y: f.y, w: f.w, h: f.h,
    decoT: [[f.x + 8, Math.min(f.w - 16, textW(f.label || f.id, 11) + 16)], ...(f.tabs || []).map(t => [t.x - 6, t.w + 12])], decoB: [] }])) : {};
  const end = id => byId[id] || boxEnd[id], holds = (b, n) => b.box && n !== b && n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;
  const edges = (dg.edges || []).filter(e => { const s = end(e.from), t = end(e.to); if (!s || !t || (e.from === e.to && !loops[e.from])) return false;
    if (holds(s, t) || holds(t, s)) { warn(`no line for edge ${e.id ?? e.from + '->' + e.to}: it joins the box "${(holds(s, t) ? s : t).id}" and something inside it`); return false; }
    return true; }).map(e => ({ ...e, s: end(e.from), t: end(e.to) }));
  const segsOf = pts => pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
  const segHitsRect = (a, b, r) => { const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]); return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h; };
  const through = (pts, e) => nodes.find(n => n !== e.s && n !== e.t && segsOf(pts).some(([a, b]) => segHitsRect(a, b, { x: n.x + 2, y: n.y + 2, w: n.w - 4, h: n.h - 4 }))); // a card it does not join
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
  edges.forEach(e => { if (e.s === e.t) Object.assign(e, { [OWN_ROUTE]: 'loop', fixed: true, fs: 'R', ts: 'T', stubs: [], how: 'self' }); }); // its loop is drawn once its ports are known
  const free = edges.filter(e => !e.fixed);
  edges.filter(e => e.fixed && !e[OWN_ROUTE]).forEach(e => { e.pts = e.fixed; e.p1 = e.pts[0]; e.p2 = e.pts[e.pts.length - 1]; e.fs = 'R'; e.ts = e.under > 0 ? 'R' : e.under ? 'B' : 'L'; e.stubs = []; e.how = e.under ? 'under' : 'comb'; });
  const sides = {};
  const pushSide = (n, side, e, other) => ((sides[n.id + '|' + side] ||= []).push({ e, other, n }));
  free.forEach(e => {
    const { s, t } = e, sc = s.x + s.w / 2, tc = t.x + t.w / 2, sy = s.y + s.h / 2, ty = t.y + t.h / 2;
    const gapX = tc > sc ? t.x - (s.x + s.w) : s.x - (t.x + t.w), gapY = ty >= sy ? t.y - (s.y + s.h) : s.y - (t.y + t.h);
    if (s.box || t.box ? gapX >= gapY : gapX > 24) { e.fs = tc > sc ? 'R' : 'L'; e.ts = tc > sc ? 'L' : 'R'; } // a box: the sides facing across the wider gap
    else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }
    const SIDE = { left: 'L', right: 'R', top: 'T', bottom: 'B' }; if (SIDE[e.fromSide]) e.fs = SIDE[e.fromSide]; if (SIDE[e.toSide]) e.ts = SIDE[e.toSide];
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
  for (let pass = 0; pass < 2; pass++) nodes.forEach(n => {
    ['R', 'L'].forEach(side => {
      const mine = free.filter(e => (e.s === n && e.fs === side) || (e.t === n && e.ts === side));
      const over = mine.length - cap(n, side); if (over <= 0) return;
      const far = e => { const o = e.s === n ? e.t : e.s; return (o.y + o.h / 2) - (n.y + n.h / 2); };
      mine.sort((a, b) => Math.abs(far(b)) - Math.abs(far(a))).slice(0, over).forEach(e => {
        const ns = far(e) < 0 ? 'T' : 'B';
        if (e.s === n) e.fs = ns; else e.ts = ns;
      });
    });
  });
  free.forEach(e => { pushSide(e.s, e.fs, e, e.t); pushSide(e.t, e.ts, e, e.s); });
  edges.filter(e => e.under > 0).forEach(e => pushSide(e.t, 'R', e, e.s)); // a loop under the boxes takes its port with the side's other lines
  // a loop from a node to itself takes the top port of its right side and the right port of its top, the inner loop the nearer the corner
  const loopsOf = n => edges.filter(e => e[OWN_ROUTE] === 'loop' && e.s === n);
  edges.filter(e => e[OWN_ROUTE] === 'loop').forEach(e => { const n = e.s, k = loopsOf(n).indexOf(e);
    pushSide(n, 'R', e, { x: n.x + n.w, y: -1e6 + k, w: 0, h: 0 }); pushSide(n, 'T', e, { x: 1e6 - k, y: n.y, w: 0, h: 0 }); });
  const portAt = (it, side, p) => { if (it.n === it.e.s && it.e.fs === side) it.e.p1 = p; else it.e.p2 = p; };
  Object.entries(sides).sort(([, a], [, b]) => !!a[0].n.box - !!b[0].n.box).forEach(([key, list]) => { // cards first: a box's port lines up with them
    const side = key.split('|').pop(), vertical = side === 'L' || side === 'R';
    const n = list[0].n;
    if (n.box) { // each port in line with its line's other end where the border allows (a straight line): below the title on
      // a side, off the title, tabs and corners on top or bottom; in that order, 16 (26) px apart
      const want = it => { const q = it.e.s === n ? it.e.p2 : it.e.p1, o = it.other; return q ? q[vertical ? 1 : 0] : vertical ? o.y + o.h / 2 : o.x + o.w / 2; };
      const sp = vertical ? [n.y + 40, n.y + n.h - 16] : sideSpan(n, side) || [n.x, n.x + n.w];
      let lo = vertical ? sp[0] : Math.max(sp[0], n.x + 20), hi = vertical ? sp[1] : Math.min(sp[1], n.x + n.w - 20); if (hi < lo) lo = hi = (lo + hi) / 2;
      const ws = list.map(want), order = list.map((_, i) => i).sort((a, b) => ws[a] - ws[b]), gap = Math.min(vertical ? 16 : 26, (hi - lo) * 0.84 / list.length);
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
  edges.filter(e => e.under > 0).forEach(e => { const P = e.fixed; e.pts = e.fixed = [...P.slice(0, 4), [P[3][0], e.p2[1]], e.p2]; });
  // a loop from a node to itself: out of the right side, up, left, down into the top. Other routes keep SEP px off its corners
  // (corners: obstacles to routes only), so none touches it or turns where it does
  const corners = []; [...new Set(edges.filter(e => e[OWN_ROUTE] === 'loop').map(e => e.s))].forEach(n => { const list = loopsOf(n);
    loopDims(list, list.map(e => n.x + n.w - e.p2[0])).forEach(({ D, R }, k) => { const e = list[k], x = n.x + n.w + R, y = n.y - D;
      e.pts = e.fixed = [e.p1, [x, e.p1[1]], [x, y], [e.p2[0], y], e.p2];
      e.pts.slice(1, 4).forEach(([px, py]) => corners.push({ x: px - SEP, y: py - SEP, w: 2 * SEP, h: 2 * SEP })); }); });
  // A view laid out down (turned): the labels of lines between one pair are wider than the 16 px between the lines, so the
  // lines fan out in the gap between the pair's columns, each to a lane of its own that holds its label. Above the middle, the
  // outer line turns nearer each node, so none crosses another; a group the gap or another node leaves no room for goes to the router
  if (dg.typed && dg.turned) { const pairs = new Map(), lr = e => e.fs === 'R' ? [e.p1, e.p2] : [e.p2, e.p1];
    free.forEach(e => { const [l, r] = e.fs === 'R' ? [e.s, e.t] : [e.t, e.s], k = l.id + '\u0001' + r.id;
      if (/^(RL|LR)$/.test(e.fs + e.ts) && l.x + l.w < r.x) pairs.set(k, [...(pairs.get(k) || []), e]); });
    pairs.forEach(list => { if (list.length < 2 || !list.some(e => e.label || e.step != null)) return;
      list.sort((a, b) => lr(a)[0][1] - lr(b)[0][1]); if (list.some((e, i) => i && lr(e)[1][1] <= lr(list[i - 1])[1][1])) return;
      const bh = list.map(e => e.label || e.step != null ? labelW(e) : 0), gaps = bh.map((h, i) => i ? Math.max(SEP, (bh[i - 1] + h) / 2 + 6) : 0);
      const mid = list.reduce((a, e) => a + lr(e)[0][1] + lr(e)[1][1], 0) / (2 * list.length), lanes = [];
      gaps.reduce((y, g, i) => (lanes[i] = y + g), mid - gaps.reduce((a, g) => a + g, 0) / 2);
      // each line's turn on each side: the k-th line turning towards its lane from the outside turns k SEP px past the stub
      const turns = side => { const at = []; const up = list.map((e, i) => i).filter(i => lanes[i] < lr(list[i])[side][1]), down = list.map((e, i) => i).filter(i => lanes[i] >= lr(list[i])[side][1]).reverse();
        [up, down].forEach(g => g.forEach((i, k) => { at[i] = lr(list[i])[side][0] + (side ? -1 : 1) * (STUB + k * SEP); })); return at; };
      const xl = turns(0), xr = turns(1);
      if (Math.min(...xr) - Math.max(...xl) < 18 + 16) return;
      const pts = list.map((e, i) => { const [a, b] = lr(e), P = simplify([a, [xl[i], a[1]], [xl[i], lanes[i]], [xr[i], lanes[i]], [xr[i], b[1]], b]); return e.fs === 'R' ? P : P.reverse(); });
      if (list.some((e, i) => through(pts[i], e))) return;
      list.forEach((e, i) => { Object.assign(e, { [OWN_ROUTE]: 'fan', fixed: pts[i], pts: pts[i], stubs: [], how: 'fan' }); free.splice(free.indexOf(e), 1); }); }); }
  const BEND = map ? 60 : 26, CROSS = 900; // maps: few bends
  const OUT = { R: [1, 0], L: [-1, 0], T: [0, -1], B: [0, 1] };
  const nodeRects = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const gapLinesX = [], gapLinesY = [];
  if (dg.abs) {
    (dg.lanes || []).forEach(l => gapLinesX.push(l.x - (dg.laneGap || 32) / 2, l.x + 8, l.x + l.w - 8, l.x + l.w + (dg.laneGap || 32) / 2));
    nodes.forEach(n => gapLinesY.push(n.y - RG / 2, n.y + n.h + RG / 2));
  } else {
    Object.keys(colX).map(Number).forEach(c => gapLinesX.push(colX[c] - CG / 2, colX[c] + (colW[c] || NW) + CG / 2));
    [...new Set(nodes.map(n => n.y))].forEach(y => gapLinesY.push(y - RG / 2, y + (dg.typed ? rowHt(nodes.find(n => n.y === y).row) : NH) + RG / 2));
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
  function gridRoute(e, allowCross, win, spare) {
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB];
    const en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    // ends that face each other closer than two stubs (a card 32 px beside a box) leave the grid no room: the plain
    // elbow between them is the route, when it keeps off cards and tags and does not run along or across another line
    if (OUT[e.fs][0] === -OUT[e.ts][0] && OUT[e.fs][1] === -OUT[e.ts][1] && (en[0] - st[0]) * OUT[e.fs][0] + (en[1] - st[1]) * OUT[e.fs][1] < 0) {
      const p = fallback(e), lines = routed.flatMap(r => segsOf(r.pts));
      if (segsOf(p).every(([a, b]) => ![...nodeRects, ...tagRects].some(r => segHitsRect(a, b, r)) && !lines.some(([c, d]) => colinear(a, b, c, d) || (!allowCross && crosses(a, b, c, d))))) return p;
    }
    const W = win ? { x: Math.min(st[0], en[0]) - win, y: Math.min(st[1], en[1]) - win, x2: Math.max(st[0], en[0]) + win, y2: Math.max(st[1], en[1]) + win } : null;
    const any = allowCross === 2; // the last resort: only cards and tags stand in the way; crossing or running along a line, or a label, costs
    const obs = [...nodeRects.map(r => ({ x: r.x - C, y: r.y - C, w: r.w + 2 * C, h: r.h + 2 * C })), ...tagRects, ...corners, ...(any ? [] : reserved.map(r => ({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 })))];
    const avoid = [...routed.flatMap(r => segsOf(r.pts)), ...free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || [])];
    const xs = new Set([st[0], en[0], ...gapLinesX]), ys = new Set([st[1], en[1], ...gapLinesY]);
    obs.forEach(r => { xs.add(r.x - 1); xs.add(r.x + r.w + 1); ys.add(r.y - 1); ys.add(r.y + r.h + 1); });
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) { xs.add(a[0]); xs.add(a[0] - SEP); xs.add(a[0] + SEP); } else { ys.add(a[1]); ys.add(a[1] - SEP); ys.add(a[1] + SEP); } });
    const keep = new Set([st[0], en[0], st[1], en[1]]);
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) keep.add(a[0]); else keep.add(a[1]); }); // a route's own line is never merged away
    const co = vals => vals.filter(v => !W || keep.has(v) || true).sort((a, b) => a - b).filter((v, i, s) => i === 0 || keep.has(v) || v - s[i - 1] >= 5);
    if (map) families.forEach(f => { xs.add(f.x - 16); xs.add(f.x + f.w + 16); ys.add(f.y - 16); ys.add(f.y + f.h + 16); });
    let X = co([...xs]), Y = co([...ys]);
    if (map) { const far = (v, bs) => keep.has(v) || bs.every(u => Math.abs(v - u) >= 8);
      X = X.filter(v => far(v, families.flatMap(f => [f.x, f.x + f.w]))); Y = Y.filter(v => far(v, families.flatMap(f => [f.y, f.y + f.h]))); }
    if (W) { X = X.filter(v => keep.has(v) || (v >= W.x && v <= W.x2)); Y = Y.filter(v => keep.has(v) || (v >= W.y && v <= W.y2)); }
    const nx = X.length, ny = Y.length, N = nx * ny;
    // an end that lies in an obstacle (or, without crossings, on an earlier line) fails the search: say so before building the grid
    const blockedAt = p => obs.some(r => inRect(p, r)) || (!allowCross && avoid.some(([a, b]) => onSegInterior(p, a, b)));
    if (blockedAt(st) || blockedAt(en)) return null;
    const ok = new Uint8Array(N), crossAt = new Uint8Array(N);
    // each obstacle and earlier line marks only the cells and moves near it (found by binary search, then tested
    // exactly as inRect, segHitsRect, onSegInterior and colinear do); every cell testing every obstacle and line
    // made one route cost O(cells x obstacles)
    const from = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] < v) a = m + 1; else b = m; } return a; };
    const inObs = new Uint8Array(N), onAv = new Uint8Array(N), blockH = new Uint8Array(N), blockV = new Uint8Array(N), alongH = any ? new Uint8Array(N) : blockH, alongV = any ? new Uint8Array(N) : blockV;
    for (const r of obs) {
      const i0 = from(X, r.x - 1), j0 = from(Y, r.y - 1), qx = r.x + .5, qy = r.y + .5, qx2 = qx + (r.w - 1), qy2 = qy + (r.h - 1);
      for (let i = i0; i < nx && X[i] <= r.x + r.w + 1; i++) for (let j = j0; j < ny && Y[j] <= r.y + r.h + 1; j++)
        if (X[i] > r.x && X[i] < r.x + r.w && Y[j] > r.y && Y[j] < r.y + r.h) inObs[i * ny + j] = 1;
      const lx = Math.min(qx, qx2), hx = Math.max(qx, qx2), ly = Math.min(qy, qy2), hy = Math.max(qy, qy2);
      for (let i = Math.max(0, from(X, lx - 1) - 1); i < nx - 1 && X[i] <= hx + 1; i++) for (let j = from(Y, ly - 1); j < ny && Y[j] <= hy + 1; j++)
        if (X[i + 1] > qx && X[i] < qx2 && Y[j] > qy && Y[j] < qy2) blockH[i * ny + j] = 1;
      for (let i = from(X, lx - 1); i < nx && X[i] <= hx + 1; i++) for (let j = Math.max(0, from(Y, ly - 1) - 1); j < ny - 1 && Y[j] <= hy + 1; j++)
        if (X[i] > qx && X[i] < qx2 && Y[j + 1] > qy && Y[j] < qy2) blockV[i * ny + j] = 1;
    }
    for (const [c, d] of avoid) {
      const x1 = Math.min(c[0], d[0]), x2 = Math.max(c[0], d[0]), y1 = Math.min(c[1], d[1]), y2 = Math.max(c[1], d[1]);
      if (c[0] === d[0]) { // vertical: cells on its interior; vertical moves alongside it
        for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++) if (Math.abs(X[i] - c[0]) < 0.5) for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++)
          if (Y[j] > y1 && Y[j] < y2) onAv[i * ny + j] = 1;
        for (let i = from(X, x1 - SEP - 1); i < nx && X[i] <= x2 + SEP + 1; i++) if (Math.abs(X[i] - c[0]) < SEP - 1) for (let j = Math.max(0, from(Y, y1 - 1) - 1); j < ny - 1 && Y[j] <= y2 + 1; j++)
          if (Math.min(Y[j + 1], y2) - Math.max(Y[j], y1) > 0) alongV[i * ny + j] = 1;
      }
      if (c[1] === d[1]) { // horizontal: the same, across
        for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++) if (Math.abs(Y[j] - c[1]) < 0.5) for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++)
          if (X[i] > x1 && X[i] < x2) onAv[i * ny + j] = 1;
        for (let j = from(Y, y1 - SEP - 1); j < ny && Y[j] <= y2 + SEP + 1; j++) if (Math.abs(Y[j] - c[1]) < SEP - 1) for (let i = Math.max(0, from(X, x1 - 1) - 1); i < nx - 1 && X[i] <= x2 + 1; i++)
          if (Math.min(X[i + 1], x2) - Math.max(X[i], x1) > 0) alongH[i * ny + j] = 1;
      }
    }
    for (let k = 0; k < N; k++) if (!inObs[k] && (!onAv[k] || allowCross)) { ok[k] = 1; crossAt[k] = onAv[k]; }
    // routed after a port swap, it keeps off the end of its partner's stub, where the partner, routed next, starts
    if (spare) for (const p of [spare.stubs[0][1], spare.stubs[1][0]]) { const i = X.indexOf(p[0]), j = Y.indexOf(p[1]); if (i >= 0 && j >= 0) { if (allowCross) crossAt[i * ny + j] = 1; else ok[i * ny + j] = 0; } }
    // a line never runs round one of its own ends: the grid behind each (past the side opposite its port) is shut to it, unless its
    // other end is there. A route with no crossing went any length, round its own card too (clinic's reminder went over the
    // patient, down its far side and under it to reach the port below the patient's other line), and port repair saw nothing
    for (const [n, side, far] of [[e.s, e.fs, en], [e.t, e.ts, st]]) if (!behind(n, side, far)) {
      const lr = side === 'R' || side === 'L';
      (lr ? X : Y).forEach((v, a) => { if (behind(n, side, lr ? [v, n.y] : [n.x, v])) for (let b = 0; b < (lr ? ny : nx); b++) ok[lr ? a * ny + b : b * ny + a] = 0; });
    }
    if (any) for (const r of reserved) for (let i = from(X, r.x - 3); i < nx && X[i] < r.x + r.w + 3; i++) for (let j = from(Y, r.y - 3); j < ny && Y[j] < r.y + r.h + 3; j++) crossAt[i * ny + j] = 1;
    // a run within 8 px of a box's border costs ten times its length: the grid keeps a port's track and an earlier line's however
    // near a border, and a box levelled half a row from a card (#86) puts its border right by that card's ports
    const nearY = families.length && Y.map(y => families.filter(f => Math.abs(y - f.y) < 8 || Math.abs(y - f.y - f.h) < 8)), nearX = families.length && X.map(x => families.filter(f => Math.abs(x - f.x) < 8 || Math.abs(x - f.x - f.w) < 8));
    const ix = v => X.indexOf(v), iy = v => Y.indexOf(v);
    const s0 = ix(st[0]) * ny + iy(st[1]), t0 = ix(en[0]) * ny + iy(en[1]);
    if (!ok[s0] || !ok[t0]) return null;
    const passable = (i1, j1, i2, j2) => !(i1 !== i2 ? blockH[Math.min(i1, i2) * ny + j1] : blockV[i1 * ny + Math.min(j1, j2)]);
    // a target shut in a small pocket that does not hold the start cannot be reached: flood out from it (moves work
    // both ways) and give up at once, instead of letting the search visit every cell it can reach
    { const seen = new Uint8Array(N), q = [t0]; seen[t0] = 1;
      for (let h = 0; h < q.length && q.length < 4000; h++) { const c = q[h], i = Math.floor(c / ny), j = c % ny;
        if (c === s0) break;
        for (const [i2, j2] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
          const c2 = i2 * ny + j2; if (!seen[c2] && ok[c2] && passable(i, j, i2, j2)) { seen[c2] = 1; q.push(c2); } } }
      if (q.length < 4000 && !seen[s0]) return null; }
    // Dijkstra over (cell, incoming direction)
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
    // a binary heap in typed arrays, with the same sift steps as before, so equal keys pop in the same order
    let hd = new Float64Array(256), hk = new Int32Array(256), hn = 0, pd = 0, pk = 0;
    const hswap = (a, b) => { const d = hd[a], k = hk[a]; hd[a] = hd[b]; hk[a] = hk[b]; hd[b] = d; hk[b] = k; };
    const hpush = (k, d) => { if (hn === hd.length) { const d2 = new Float64Array(hn * 2), k2 = new Int32Array(hn * 2); d2.set(hd); k2.set(hk); hd = d2; hk = k2; }
      let i = hn++; hd[i] = d; hk[i] = k; while (i) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; hswap(p, i); i = p; } };
    const hpop = () => { pd = hd[0]; pk = hk[0]; hn--; if (hn) { hd[0] = hd[hn]; hk[0] = hk[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < hn && hd[l] < hd[m]) m = l; if (r < hn && hd[r] < hd[m]) m = r; if (m === i) break; hswap(m, i); i = m; } } };
    const d0 = DIRS.findIndex(d => d[0] === OUT[e.fs][0] && d[1] === OUT[e.fs][1]);
    const dEnd = DIRS.findIndex(d => d[0] === -OUT[e.ts][0] && d[1] === -OUT[e.ts][1]);
    // A*: the heap is keyed by distance plus the straight distance left, which never overestimates (every move costs
    // at least its length), so each route keeps its cost; the search stops visiting cells far from the target
    const hx = Float64Array.from(X, x => Math.abs(x - en[0])), hy = Float64Array.from(Y, y => Math.abs(y - en[1])), DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
    dist[s0 * 4 + d0] = 0; hpush(s0 * 4 + d0, hx[(s0 / ny) | 0] + hy[s0 % ny]);
    let best = -1;
    while (hn) {
      hpop(); const k = pk, cell = k >> 2, dir = k & 3, i = (cell / ny) | 0, j = cell - i * ny;
      if (pd > dist[k] + (hx[i] + hy[j])) continue;
      const d = dist[k];
      // in head-on if it can; else the cheapest way in, the first found (it kept the last, the dearest: a top-to-top line on
      // the top row ran past its card and back, #80)
      if (cell === t0) { if (dir === dEnd) { best = k; break; } if (best < 0) best = k; continue; }
      const xi = X[i], yj = Y[j];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === dir && ((nd >> 1) === (dir >> 1))) continue; // no reversal
        const i2 = i + DI[nd], j2 = j + DJ[nd];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        const c2 = i2 * ny + j2; if (!ok[c2] || (nd < 2 ? blockH[(nd === 0 ? i : i2) * ny + j] : blockV[i * ny + (nd === 2 ? j : j2)])) continue;
        let w = Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj) + (nd === dir ? 0 : BEND) + (crossAt[c2] ? CROSS : 0);
        if (any && (nd < 2 ? alongH[(nd === 0 ? i : i2) * ny + j] : alongV[i * ny + (nd === 2 ? j : j2)])) w += 2 * CROSS + 3 * (Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj));
        if (nearY && (nd < 2 ? nearY[j].some(f => Math.max(xi, X[i2]) > f.x && Math.min(xi, X[i2]) < f.x + f.w) : nearX[i].some(f => Math.max(yj, Y[j2]) > f.y && Math.min(yj, Y[j2]) < f.y + f.h))) w += 10 * (Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj));
        if (c2 === t0 && nd !== dEnd) w += BEND;
        const k2 = c2 * 4 + nd; if (d + w < dist[k2]) { dist[k2] = d + w; prev[k2] = k; hpush(k2, d + w + (hx[i2] + hy[j2])); }
      }
    }
    if (best < 0) return null;
    const cells = []; for (let k = best; k >= 0; k = prev[k]) { cells.push(k >> 2); if (k === s0 * 4 + d0) break; }
    const pts = [e.p1, ...cells.reverse().map(c => [X[Math.floor(c / ny)], Y[c % ny]]), e.p2];
    return simplify(pts);
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
  function fallback(e) { // last resort: a plain elbow
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    const horiz = e.fs === 'R' || e.fs === 'L', mid = horiz ? (st[0] + en[0]) / 2 : (st[1] + en[1]) / 2;
    return simplify(horiz ? [e.p1, st, [mid, st[1]], [mid, en[1]], en, e.p2] : [e.p1, st, [st[0], mid], [en[0], mid], en, e.p2]);
  }
  // labels: on the edge's own segment, in free space — never across another route, node, or label
  const placed = [];
  // every spot on e's line where a label of this text fits, best first, at pass 0 (strict), 1 (strict, but it may touch a box
  // border) or 2 (relaxed)
  const subOf = (e, text) => map && text && e.sublabel ? fit(e.sublabel, 9.5, e.under ? 320 : 440) : ''; // a second, smaller line under the label (#44)
  const sizeOf = (e, text, sub = subOf(e, text)) => { const two = !!(text && sub), pill = map && e.step != null;
    const w = map ? (text ? pillW(text, two && sub) : 0) + (pill ? stepW(e.step) + (text ? 4 : 6) : 0) : textW(text, 10) + 12, hgt = map ? (two ? 32 : 20) : 18;
    return dg.turned ? { two, w: hgt, hgt: w } : { two, w, hgt }; }; // a view laid out down: turned, as its nodes are (stage 1 note §6)
  function* fits(e, text, pass) { const relax = pass === 2, sub = subOf(e, text);
    const segs = segsOf(e.pts).map((s, i) => ({ a: s[0], b: s[1], i, l: Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), h: s[0][1] === s[1][1] }));
    const order = [...segs].sort((p, q) => (q.h - p.h) * 40 + (q.l - p.l));
    // the strict spots along a segment: the middle, a third and a fifth of the way, then those just clear of each card's stub room,
    // tag, label and line beside it, the middle's nearest first: where the label fits, one of them is in. The five alone missed a
    // gap 15 px wide, and the label sat on a box's border (clinic's "Queues reminders")
    const spots = (sg, w, hgt) => { const v = sg.h ? 0 : 1, lo = sg.a[v], len = sg.b[v] - lo, half = (v ? hgt : w) / 2 + 3.5, mid = sg.a[1 - v], across = (v ? w : hgt) / 2 + 3;
      const span = r => [[r.x, r.x + r.w], [r.y, r.y + r.h]], rs = [...nodeRects.map(r => ({ x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 })), ...tagRects, ...placed,
        ...[...routed.filter(r => r !== e).map(r => r.pts), e.pts].flatMap(P => segsOf(P).map(([p, q]) => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) })))];
      return [.5, .32, .68, .2, .8, ...rs.map(span).filter(s => s[1 - v][0] < mid + across && s[1 - v][1] > mid - across).flatMap(s => [s[v][0] - half, s[v][1] + half])
        .map(u => (u - lo) / len).filter(f => f >= 0 && f <= 1).sort((p, q) => Math.abs(p - .5) - Math.abs(q - .5))]; };
    const { two, w, hgt } = sizeOf(e, text, sub), pill = map && e.step != null;
    for (const sg of order) {
      if (!relax && sg.h && sg.l < w + 10) continue;
      if (!relax && !sg.h && sg.l < hgt + 14) continue;
      for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : spots(sg, w, hgt))) {
        const lx = sg.a[0] + (sg.b[0] - sg.a[0]) * f, ly = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
        const box = { x: lx - w / 2, y: ly - hgt / 2, w, h: hgt };
        const grow = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
        if (nodeRects.some(r => hit(relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }, box))) continue; // keep port stubs free
        if (tagRects.some(r => hit(r, grow))) continue;
        if (placed.some(r => (pass === 0 || !r.band) && hit(r, grow))) continue;
        if (!relax && routed.some(r => r !== e && segsOf(r.pts).some(([a, b]) => segHitsRect(a, b, grow)))) continue;
        if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;
        yield { box, grow, lbl: { ...box, text, ...(two ? { sub } : {}), step: map ? e.step : null, ...(pill ? { sw: stepW(e.step) } : {}) } };
      }
    }
  }
  const put = (e, s, full) => { placed.push(s.box); reserved.push(s.grow); e.lbl = { ...s.lbl, short: s.lbl.text !== full }; };
  const unput = e => { const L = e.lbl, same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)), q = reserved.findIndex(same(3)); if (p >= 0) placed.splice(p, 1); if (q >= 0) reserved.splice(q, 1); e.lbl = null; };
  const fullOf = e => map ? fit(e.label || '', 10.5, e.under ? 320 : 440) : fit((e.step != null ? e.step + ' · ' : '') + (e.label || ''), 10, 150);
  function placeLabel(e) {
    if (!e.label && e.step == null) return;
    const full = fullOf(e);
    const tries = [full]; if (e.step != null && e.label && !dg.abs) tries.push(map ? '' : String(e.step));
    const first = (x, text, pass) => fits(x, text, pass).next().value;
    let s = first(e, full, 0); if (s) return put(e, s, full);
    // a label whose spots are all taken by a label placed before it: that label moves to each of its other spots in turn, until
    // this one fits too. Both centred on their lines, the labels of two lines that leave a card side by side (16 px apart, too
    // close to stack) left the second no room, and it fell back to its step (assistant's "a draft", by a jog of 16 px)
    if (map) for (const o of routed) { if (o === e || !o.lbl || o.lbl.short || o.fixed) continue;
      const was = o.lbl, back = () => put(o, { box: { x: was.x, y: was.y, w: was.w, h: was.h }, grow: { x: was.x - 3, y: was.y - 3, w: was.w + 6, h: was.h + 6 }, lbl: was }, was.text);
      unput(o); if (!first(e, full, 0)) { back(); continue; } // e finds no spot even without it
      for (const so of fits(o, was.text, 0)) { put(o, so, was.text); if ((s = first(e, full, 0))) return put(e, s, full); unput(o); }
      back(); }
    for (const pass of (map ? [0, 1, 2] : [0])) for (const text of tries) if ((pass || text !== full) && (s = first(e, text, pass))) return put(e, s, full);
  }
  let stats = {};
  free.forEach(e => { // every port's stub is reserved before routing starts
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    e.stubs = [[e.p1, st], [en, e.p2]];
  });
  const runRouting = order => {
    routed.length = 0; reserved.length = 0; placed.length = 0; stats = {};
    (dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });
    if (map) families.forEach(f => { const h = { x: f.x + 8, y: f.y + 3, w: Math.min(f.w - 16, textW(f.label || f.id, 11) + 16), h: 22 }; reserved.push(h); placed.push(h);
      placed.push(...[{ x: f.x, y: f.y - 3, w: f.w, h: 6 }, { x: f.x, y: f.y + f.h - 3, w: f.w, h: 6 }, { x: f.x - 3, y: f.y, w: 6, h: f.h }, { x: f.x + f.w - 3, y: f.y, w: 6, h: f.h }].map(r => ({ ...r, band: true }))); }); // lane headers and arrows stay clear
    edges.filter(e => e.fixed).forEach(e => { routed.push(e); if (e.under || e[OWN_ROUTE]) { placeLabel(e); stats[e.how] = (stats[e.how] || 0) + 1; return; } if (e.lbl) { placed.push(e.lbl); reserved.push({ x: e.lbl.x - 3, y: e.lbl.y - 3, w: e.lbl.w + 6, h: e.lbl.h + 6 }); } stats.comb = (stats.comb || 0) + 1; });
    order.forEach(e => {
      let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320) || gridRoute(e, false, 0);
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
  const fan = {}, hot = e => fan[e.t.id] >= 6; free.forEach(e => { fan[e.t.id] = (fan[e.t.id] || 0) + 1; });
  order = [...order.filter(hot), ...order.filter(e => !hot(e))];
  let bad = runRouting(order);
  // rip-up and reroute: an edge that had to cross goes first next time; keep the best attempt (not when the view is laid
  // out again with room for lines: that layout's tries seldom gained anything, and they cost a third of its time; with room for
  // a label it tries, as the layout it may replace did)
  for (let tries = 0; bad && (!last || room.lx) && tries < 4; tries++) {
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
    free.filter(e => e.how === 'fallback').forEach(e => { routed.splice(routed.indexOf(e), 1); const p = gridRoute(e, 2, 320) || gridRoute(e, 2, 0), mine = { x: new Set(), y: new Set() };
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
  const issueCount = only => routeAudit({ edges }, '', only).length + (map ? (only ? [...only] : edges).filter(e => detour(e.pts)).length : 0);
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
    if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 320, spare) || gridRoute(e, true, 0, spare); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
    e.how = how; routed.push(e); placeLabel(e); return true; };
  let budget = 2 * free.length, swapped = false;
  for (let round = 0; issues && dg.repair !== false && round < 8 && budget > 0; round++) {
    let fixed = false; __ms.rounds++;
    const segsE = e => e.pts.slice(0, -1).map((p, i) => [p, e.pts[i + 1]]);
    const xing = (a, b) => segsE(a).some(([p, q]) => segsE(b).some(([r, s]) => crosses(p, q, r, s)));
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
        const moved = (e, k, P) => { const [i, j] = k === 'p1' ? [0, 1] : [P.length - 1, P.length - 2], v = P[i][1] === P[j][1];
          return P.length > 2 && simplify(P.map((p, x) => x === i ? e[k] : x === j ? (v ? [p[0], e[k][1]] : [e[k][0], p[1]]) : p)); };
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
    const lone = (n, side) => !n.box && sides[n.id + '|' + side].length === 1, [k, n, side, v] = lone(e.t, e.ts) ? ['p2', e.t, e.ts, P[0][ax]] : lone(e.s, e.fs) ? ['p1', e.s, e.fs, P[3][ax]] : [];
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
  if (!dg.quick) free.filter(e => e.how === 'fallback').forEach(e => { ripUp(e); e.pts = gridRoute(e, 2, 320) || gridRoute(e, 2, 0) || e.pts; e.lbl = null; routed.push(e); placeLabel(e); });
  if (!dg.quick) edges.forEach(e => { const n = through(e.pts, e); if (n) warn(`the line for edge ${edgeRefIds(e).join(' / ') || e.from + '->' + e.to} runs through card "${n.id}", which it does not join: no route found around it`); });
  __ms.repair = performance.now() - __ms.t; delete __ms.t;
  // a label on a box's border, cut to its step or with no spot asks for room where it is: the column gap it sits in widens by
  // the label's width, else the row gap by its height and 14 px; a label in neither, or with no spot, the gap its line's longest
  // run crosses, a column's first. layoutGraph lays the view out again with it, and keeps that layout if it is better
  let labelRoom = null;
  const tight = !last && !dg.quick && map && !dg.abs ? free.filter(e => (e.label || e.step != null) && (!e.lbl || e.lbl.short || families.some(f => onBorder(e.lbl, f)))) : [];
  if (tight.length) {
    const cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs)), need = { x: {}, y: {} };
    const gaps = [...cs.filter(c => colX[c + 1] != null).map(c => ['x', c, colX[c] + (colW[c] || NW), colX[c + 1]]),
      ...Array.from({ length: Math.max(0, r1 - r0) }, (_, k) => ['y', r0 + k, rowY(r0 + k) + NH, rowY(r0 + k + 1)])];
    tight.forEach(e => { const { w, hgt: h } = sizeOf(e, fullOf(e)), L = e.lbl, c = L && { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      let best = c && ['x', 'y'].map(k => gaps.find(([gk, g, p, q]) => gk === k && c[k] >= p && c[k] <= q)).find(Boolean);
      if (!best) segsOf(e.pts).forEach(([a, b]) => { const k = a[1] === b[1] ? 'x' : 'y', i = k === 'x' ? 0 : 1, lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
        gaps.forEach(([gk, g, p, q]) => { const run = Math.min(hi, q) - Math.max(lo, p); if (gk === k && run > 0 && (!best || (k === 'x') > (best[0] === 'x') || ((k === 'x') === (best[0] === 'x') && run > best[2]))) best = [k, g, run]; }); });
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
  const M = 36, minX = Math.min(...xs) - M, minY = Math.min(...ys) - M;
  return { ms: __ms, ...(labelRoom ? { labelRoom } : {}), stats, nodes, edges, subAndChips: !!dg.subAndChips, groups, families, intake, tour: dg.tour || null, byId, map, hub: dg.hub || null, lanes: dg.lanes || [], blocks: dg.blocks || [], bounds: { x: minX, y: minY, w: Math.max(...xs) - minX + M, h: Math.max(...ys) - minY + M } };
}

export { CHG, NW, pillW, stepOrder, hit, untangle, pullSources, rowsFor, layoutGraph };
