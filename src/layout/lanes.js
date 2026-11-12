import { r2 } from '../draw/shapes.js';

/* ---------- lanes (work package 4.3, notes/stage-4.md §5.2) ----------
   Bands across a layered flow, for the activity type's partitions (and later BPMN's lanes). No DOM, no model: a type
   gives the ranked positions and which lane each node is in, and gets rows back; after layoutTyped it gets the bands.
   Only lib/umlimator-all.js holds this file.

   laneRows(pos, laneOf, lanes) -> pos'   pos: { id: [col, row] } as ranked (pins included); laneOf: id -> its innermost
                                          lane's id, or null; lanes: [{ id, parent, order }] outermost first, siblings
                                          by `order`, those with none after them in list order. pos' is new: each lane a run of rows
   laneBands(g, lanes, laneOf, turned, rgap) -> { bands: [{ id, parent, depth, x, y, w, h, head: { x, y, w, h } }], shift, bounds }
                                          g: layoutTyped's geometry, read, never written (§2.4); turned: laid out down;
                                          rgap: the row gap it was laid out with (else the narrowest gap between two rows).
                                          bands are where they lie once the type has moved its copy of g by shift ({ x, y });
                                          bounds: g's bounds so moved and grown to hold the bands
   Rows: lanes in depth-first order, a lane's own nodes in the rows before its nested lanes'; in each column a lane's nodes
   keep their ranked order and take its rows from the first; a lane takes as many rows as it has nodes in its busiest
   column, an empty lane one. A pin's row is so an order inside its lane, and nodes in no lane come after every lane.
   Bands: along the flow, the whole diagram and a 22 px header strip per level of nesting at its start; across it, from the
   divider before a lane's first row to the one after its last, each 12 px past the router's line rgap / 2 before the later
   row (gapLinesY), toward it; the outer edges 12 px inside the router's line. An empty lane at an end takes a row that
   leaves its band 120 px across at least. */

const LN = { head: 22, off: 12, pad: 16, gap: 44, row: 64, min: 120 }; // a header level; a divider off the router's line; the bands' margin; the row gap when g has none to measure; an empty end row's least size; an empty end lane's least width

// the lanes in depth-first order, each { id, parent, depth }: a lane whose parent is no lane, or that lies on a cycle of
// parents, is at the top
function laneOrder(lanes) {
  const list = (Array.isArray(lanes) ? lanes : []).filter(l => l && l.id != null), ids = new Set(list.map(l => l.id)), kids = new Map(), out = [], seen = new Set();
  const has = l => Number.isFinite(l.order); // by order, those with none after them; a stable sort keeps list order in ties
  [...list].sort((a, b) => has(b) - has(a) || (has(a) && has(b) ? a.order - b.order : 0)).forEach(l => { const p = ids.has(l.parent) && l.parent !== l.id ? l.parent : null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(l); });
  const walk = (top) => { const stack = [[top, 0]]; // an explicit stack: nesting from an import can be deep
    while (stack.length) { const [l, depth] = stack.pop(); if (seen.has(l.id)) continue; seen.add(l.id); out.push({ id: l.id, parent: depth ? l.parent : null, depth });
      (kids.get(l.id) || []).slice().reverse().forEach(k => stack.push([k, depth + 1])); } };
  (kids.get(null) || []).forEach(walk);
  list.forEach(walk); // on a cycle: never reached from the top
  return out;
}

// each node's segment (a lane's index in order, or order.length for no lane) and each segment's first row and row count
function laneRuns(items, laneOf, order) { // items: [[id, col]]
  const at = new Map(order.map((l, k) => [l.id, k])), seg = new Map(), most = order.map(() => 0).concat(0), per = new Map();
  items.forEach(([id, col]) => { const s = at.get(laneOf(id)) ?? order.length, k = s + '|' + col, n = (per.get(k) || 0) + 1; seg.set(id, s); per.set(k, n); most[s] = Math.max(most[s], n); });
  const full = new Set(); // the lanes that hold a node or a nested lane; the others are empty
  order.forEach((l, s) => { if (most[s]) full.add(l.id); if (l.parent != null) full.add(l.parent); });
  const count = most.map((n, s) => (s < order.length && !full.has(order[s].id) ? 1 : n)), start = []; let r = 0; // an empty lane keeps one row
  count.forEach((n, s) => { start[s] = r; r += n; });
  return { seg, start, count, rows: r };
}

function laneRows(pos, laneOf, lanes) {
  const order = laneOrder(lanes), ids = Object.keys(pos || {}).filter(id => Array.isArray(pos[id]));
  const { seg, start } = laneRuns(ids.map(id => [id, pos[id][0]]), laneOf, order), out = Object.create(null), cols = new Map(); // by id: no prototype (M3)
  ids.forEach((id, i) => { const c = pos[id][0]; if (!cols.has(c)) cols.set(c, []); cols.get(c).push([id, i]); });
  cols.forEach(list => { const next = new Map();
    list.sort((a, b) => seg.get(a[0]) - seg.get(b[0]) || pos[a[0]][1] - pos[b[0]][1] || a[1] - b[1]).forEach(([id]) => { const s = seg.get(id), k = next.get(s) || 0;
      out[id] = [pos[id][0], start[s] + k]; next.set(s, k + 1); }); });
  return out;
}

function laneBands(g, lanes, laneOf, turned, rgap) {
  const order = laneOrder(lanes), nodes = (g && g.nodes) || [], b = (g && g.bounds) || { x: 0, y: 0, w: 0, h: 0 };
  const [A, S, L, T] = turned ? ['x', 'w', 'y', 'h'] : ['y', 'h', 'x', 'w']; // across the flow, its size; along it, its size
  const { start, count, rows } = laneRuns(nodes.map(n => [n.id, n.col]), laneOf, order);
  // each row's extent across the flow: from its nodes, else between its neighbours; a gap is the narrowest between two rows
  const lo = [], hi = [];
  nodes.forEach(n => { const r = n.row; if (!Number.isInteger(r)) return; lo[r] = Math.min(lo[r] ?? Infinity, n[A]); hi[r] = Math.max(hi[r] ?? -Infinity, n[A] + n[S]); });
  let gap = Infinity; for (let r = 0; r + 1 < rows; r++) if (lo[r] != null && lo[r + 1] != null) gap = Math.min(gap, lo[r + 1] - hi[r]);
  if (gap === Infinity) gap = LN.gap;
  if (Number.isFinite(rgap) && rgap > 0) gap = rgap;
  const end = Math.max(LN.row, LN.min + 2 * LN.off - gap); // an empty end row: its band, the row and a gap less two offsets, 120 px at least
  for (let r = 0; r < rows;) { if (lo[r] != null) { r++; continue; }
    let e = r; while (e < rows && lo[e] == null) e++; // rows r to e - 1 hold nothing
    if (r && e < rows) { const unit = (lo[e] - hi[r - 1] - gap) / (e - r); for (let k = r; k < e; k++) { lo[k] = hi[r - 1] + gap + (k - r) * unit; hi[k] = lo[k] + unit - gap; } }
    else if (e < rows) for (let k = e - 1; k >= r; k--) { hi[k] = lo[k + 1] - gap; lo[k] = hi[k] - end; }
    else for (let k = r; k < e; k++) { lo[k] = k ? hi[k - 1] + gap : 0; hi[k] = lo[k] + end; }
    r = e; }
  const before = r => lo[r] - gap / 2 + LN.off, after = r => (r + 1 < rows ? before(r + 1) : hi[r] + gap / 2 - LN.off); // off the router's lines, which lie rgap / 2 from each row
  // each lane's rows: its own and its nested lanes'
  const first = start.slice(0, order.length), last = order.map((l, s) => start[s] + count[s] - 1), at = new Map(order.map((l, s) => [l.id, s]));
  order.forEach((l, s) => { for (let p = order[at.get(l.parent)]; p; p = order[at.get(p.parent)]) { const q = at.get(p.id); first[q] = Math.min(first[q], first[s]); last[q] = Math.max(last[q], last[s]); } });
  const levels = order.length ? 1 + Math.max(...order.map(l => l.depth)) : 0, shift = { x: 0, y: 0, [L]: levels * LN.head };
  const a0 = b[L] + LN.pad, a1 = b[L] + b[T] + shift[L] - LN.pad;
  const bands = order.map((l, s) => { const c0 = before(first[s]), c1 = after(last[s]), s0 = a0 + l.depth * LN.head;
    const box = len => ({ [L]: r2(s0), [T]: r2(len), [A]: r2(c0), [S]: r2(c1 - c0) });
    return { id: l.id, parent: l.parent, depth: l.depth, ...box(a1 - s0), head: box(LN.head) }; });
  const x0 = Math.min(b.x + shift.x, ...bands.map(d => d.x - LN.pad)), y0 = Math.min(b.y + shift.y, ...bands.map(d => d.y - LN.pad));
  const x1 = Math.max(b.x + b.w + shift.x, ...bands.map(d => d.x + d.w + LN.pad)), y1 = Math.max(b.y + b.h + shift.y, ...bands.map(d => d.y + d.h + LN.pad));
  return { bands, shift, bounds: { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) } };
}

export { LN, laneOrder, laneRuns, laneRows, laneBands };
