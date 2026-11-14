import { r2 } from '../draw/shapes.js';

/* ---------- the tree strategy (work package 4a.1, notes/milestone-4a.md §6) ----------
   layoutTree(input) -> out, the geometry of a mindmap: no DOM, no model, in layoutTimeAxis's contract (sizes come in
   measured by the type, problems go out, never warn()). Only lib/umlimator-all.js holds this file.

   input = { root, topics: [{ id, parent, w, h, side }], gap: { x: 48, y: 12 } }   children in the order listed; side,
                                                                                   'left' or 'right', read on a first-level
                                                                                   topic only; gap optional
   out   = { nodes: [{ id, x, y, w, h, side, depth, branch }], links: [{ from, to, p1, p2 }], bounds, problems }
   Bands (§6.3): a subtree's band is as tall as its topic or its children's bands stacked gap.y apart, whichever is taller;
   children's bands are stacked inside their parent's, centred on its middle; a topic is centred in its band. A child is
   gap.x out from its parent's edge, on its side. The root is at (0, 0), side null, depth 0, branch null; each side's
   first-level bands are stacked and centred on its middle. Sides (§6.4): a first-level topic's side where given; the
   rest, in order, to the side whose first-level bands so far, with their gaps, are shorter, right on a tie. branch: the
   first-level topic a node descends from. A link's p1: the parent's edge midpoint on the child's side; p2: the child's
   near edge midpoint. Nodes and links in pre-order. Bands are disjoint and children keep their order, so no two topics
   overlap and no two links cross. Two passes over an explicit stack, never recursion: linear in the topics.
   Problems: { level, message, ids }: the root not a topic (nothing drawn), a topic listed twice (the first drawn), a
   topic that does not descend from the root, its parent not here or a cycle (hung from the root, last). */

const TREE = { x: 48, y: 12 }; // the gaps when the input gives none: a child from its parent's edge; two sibling bands

const treeNum = v => (Number.isFinite(v) && v > 0 ? v : 0);
const treeGap = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
const treeSpan = (list, gy) => list.reduce((s, T, i) => s + T.band + (i ? gy : 0), 0); // bands stacked gy apart

function layoutTree(input = {}) {
  const problems = [], say = (level, message, ids) => problems.push({ level, message, ids });
  const gx = treeGap((input.gap || {}).x, TREE.x), gy = treeGap((input.gap || {}).y, TREE.y);
  const byId = new Map();
  for (const t of Array.isArray(input.topics) ? input.topics : []) {
    if (!t || t.id == null) continue;
    if (byId.has(t.id)) say('warning', `topic ${t.id} is listed twice: the first is drawn`, [t.id]);
    else byId.set(t.id, { t, id: t.id, w: treeNum(t.w), h: treeNum(t.h), kids: [], sub: [] });
  }
  const root = byId.get(input.root);
  if (!root) { say('error', `the root ${input.root} is not a topic here: nothing drawn`, [input.root]); return { nodes: [], links: [], bounds: { x: 0, y: 0, w: 0, h: 0 }, problems }; }
  for (const T of byId.values()) if (T !== root && byId.has(T.t.parent)) byId.get(T.t.parent).kids.push(T);

  // ---- pre-order, from the root; then each topic not reached, in order, hung from the root with what it holds
  const order = [], walk = S => { const st = [S]; S.seen = true;
    while (st.length) { const T = st.pop(); order.push(T);
      for (let i = T.kids.length - 1; i >= 0; i--) { const C = T.kids[i]; if (!C.seen) { C.seen = true; C.up = T; st.push(C); } } } };
  walk(root);
  for (const T of byId.values()) if (!T.seen) { say('warning', `topic ${T.id} does not descend from the root ${root.id}: hung from it`, [T.id]); T.up = root; walk(T); }
  order.forEach(T => { if (T.up) T.up.sub.push(T); T.depth = T.up ? T.up.depth + 1 : 0; T.branch = T.depth > 1 ? T.up.branch : T.depth ? T.id : null; });

  // ---- bands, post-order; sides
  for (let i = order.length - 1; i >= 0; i--) { const T = order[i]; T.band = Math.max(T.h, treeSpan(T.sub, gy)); }
  const sides = { right: [], left: [] }, span = { right: 0, left: 0 };
  root.sub.forEach(T => { const s = T.t.side === 'left' || T.t.side === 'right' ? T.t.side : span.left < span.right ? 'left' : 'right';
    span[s] += (sides[s].length ? gy : 0) + T.band; T.side = s; sides[s].push(T); });
  root.x = 0; root.y = 0; root.side = null;

  // ---- pre-order: each topic in its band; its children's bands stacked, centred on its middle
  for (const T of order) {
    if (T !== root) { const P = T.up; if (T.depth > 1) T.side = P.side;
      T.y = T.top + (T.band - T.h) / 2; T.x = T.side === 'left' ? P.x - gx - T.w : P.x + P.w + gx; }
    for (const list of T === root ? [sides.right, sides.left] : [T.sub]) {
      let top = T.y + T.h / 2 - treeSpan(list, gy) / 2;
      for (const C of list) { C.top = top; top += C.band + gy; } }
  }

  // ---- out
  const nodes = [], links = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const T of order) {
    nodes.push({ id: T.id, x: r2(T.x), y: r2(T.y), w: T.w, h: T.h, side: T.side, depth: T.depth, branch: T.branch });
    x0 = Math.min(x0, T.x); y0 = Math.min(y0, T.y); x1 = Math.max(x1, T.x + T.w); y1 = Math.max(y1, T.y + T.h);
    if (!T.up) continue;
    const P = T.up, L = T.side === 'left';
    links.push({ from: P.id, to: T.id, p1: [r2(L ? P.x : P.x + P.w), r2(P.y + P.h / 2)], p2: [r2(L ? T.x + T.w : T.x), r2(T.y + T.h / 2)] });
  }
  return { nodes, links, bounds: { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) }, problems };
}

export { TREE, layoutTree };
