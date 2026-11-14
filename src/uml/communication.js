import { apply } from '../core/apply.js';
import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { rowsFor, untangle } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import './frame.js'; // SHAPE.lifeline, the head a lifeline is drawn with
import { interactionWalk, messageNumbers, replyCallFor, INTERACTION_RULES, interactionProblems } from './interaction.js';

/* ---------- the communication diagram, uml.communication (work package 3.5, notes/stage-3.md §6) ----------
   Lifelines joined by connectors; messages are model edges, and the view's `edges` lists the connectors, then the messages
   in time order (model.md row 12). A view is laid out by layoutTyped, like a class view: lifelines are classifier heads,
   connectors the lines, a self connector a loop. The messages on one connector are a stack (S7): a node of the layered
   graph, as wide as its widest row and 16 px tall per message, with its connector split in two through it; after the
   layout the two halves are one connector again and the stack is one `message-row` node per message, its number (S8, from
   src/uml/interaction.js), its text and a small arrow toward its receiver. Ships in lib/umlimator-all.js only. */

const CM_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), CM_ARR = x => (Array.isArray(x) ? x : []);
const CM_HAS = x => x != null && x !== '';
const CM_SORTS = ['call', 'async', 'reply', 'create', 'delete'];
const CM_ROW = { h: 16, px: 11, arrow: 16, pad: 5, max: 280 }; // a message row: its height, font, arrow's room, padding, widest stack
const CM_STACK = '\u0000'; // a stack's id and its connector's halves': the connector's id after it, never a model id

/* ---- the view read: lifelines, connectors and messages, each message on the connector that carries it ---- */
function commIndex(model, view) {
  const N = new Map(), E = new Map();
  CM_ARR(model && model.nodes).forEach(n => { if (CM_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) N.set(n.id, n); });
  CM_ARR(model && model.edges).forEach(e => { if (CM_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const ids = [...new Set(CM_ARR(view && view.nodeIds).filter(id => N.has(id)))], shown = new Set(ids);
  const list = CM_ARR(view && view.edges).map(x => (typeof x === 'string' ? E.get(x) : x)).filter(e => CM_OBJ(e) && typeof e.id === 'string');
  const pair = (a, b) => [a, b].sort().join(CM_STACK), joins = e => shown.has(e.from) && shown.has(e.to);
  const connectors = list.filter(e => e.type === 'uml.Connector' && joins(e)), carrier = new Map(), on = new Map();
  connectors.forEach(c => { const k = pair(c.from, c.to); if (!carrier.has(k)) carrier.set(k, c); on.set(c.id, []); });
  const messages = list.filter(e => e.type === 'uml.Message');
  messages.forEach(m => { const c = joins(m) && carrier.get(pair(m.from, m.to)); if (c) on.get(c.id).push(m); });
  return { N, E, ids, shown, connectors, messages, on, carrierOf: (a, b) => carrier.get(pair(a, b)) || null };
}

const cmNameOf = x => String(x && x.label != null ? x.label : x ? x.id : '');
const cmPropsOf = x => (CM_OBJ(x && x.props) ? x.props : {});
const cmSortOf = m => (CM_SORTS.includes(cmPropsOf(m).sort) ? cmPropsOf(m).sort : 'call'); // any other is drawn as a call (the shared sort rule)
const cmStereoOf = n => CM_ARR(cmPropsOf(n).stereotypes).filter(CM_HAS).map(String);
// a lifeline's head text: "api : ShopApi", or the name alone
const cmHeadText = n => cmNameOf(n) + (CM_HAS(cmPropsOf(n).represents) ? ' : ' + cmPropsOf(n).represents : '');
const CM_KEYWORD = { create: '«create»', delete: '«destroy»' };
const cmRowText = (m, num) => { const t = [CM_KEYWORD[cmSortOf(m)], m.label].filter(CM_HAS).join(' '); return `${num ?? '?'}${t ? ': ' + t : ''}`; }; // "1.1.3: «create» new(order)"; a message with no text, its number
const cmRowW = t => Math.ceil(Math.min(CM_ROW.max, textW(t, CM_ROW.px) + CM_ROW.arrow + 2 * CM_ROW.pad + 2));
const cmPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
// numbers in their order: 1 < 1.1 < 1.1.2 < 1.2 < 2
const cmByNumber = (a, b) => { const p = String(a).split('.').map(Number), q = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] ?? -1) - (q[i] ?? -1); if (d) return d; } return 0; };

/* ---- a message row: its number and text, and an arrow toward the receiver (filled for a call or a delete, open for async
   and create, dashed and open for a reply). n.dir: right, left, down or up ---- */
const CM_ARROW_TURN = { right: 0, down: 90, left: 180, up: 270 };
function cmArrowOf(sort, cx, cy, dir) {
  const head = sort === 'call' || sort === 'delete' ? `<path d="M${r2(cx + 1)} ${r2(cy - 3.5)}L${r2(cx + 6)} ${r2(cy)}L${r2(cx + 1)} ${r2(cy + 3.5)}Z" fill="var(--um-text)"/>`
    : `<path d="M${r2(cx + 1.5)} ${r2(cy - 3.5)}L${r2(cx + 6)} ${r2(cy)}L${r2(cx + 1.5)} ${r2(cy + 3.5)}" fill="none"/>`;
  return `<g class="mr-arrow" stroke="var(--um-text)" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" transform="rotate(${CM_ARROW_TURN[dir] || 0} ${r2(cx)} ${r2(cy)})">`
    + `<path d="M${r2(cx - 6)} ${r2(cy)}H${r2(cx + 5)}"${sort === 'reply' ? ' stroke-dasharray="2.2 1.8"' : ''}/>${head}</g>`;
}
SHAPE['message-row'] = {
  draw(n) {
    const { x, y, w, h } = n, cy = y + h / 2, t = String(n.label ?? '');
    return `<g class="node message-row" data-id="${esc(n.id)}" data-shape="message-row" data-sort="${esc(n.sort)}" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Message ' + t)}">`
      + `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" class="mr-back" fill="var(--um-stage-bg)"/>${cmArrowOf(n.sort, x + CM_ROW.pad + 6, cy, n.dir)}`
      + `<text x="${r2(x + CM_ROW.pad + CM_ROW.arrow)}" y="${r2(cy + 3.8)}" fill="var(--um-text)" style="font:500 ${CM_ROW.px}px var(--um-sans)">${esc(fit(t, CM_ROW.px, w - CM_ROW.arrow - 2 * CM_ROW.pad))}</text></g>`;
  },
};

/* ---- the legend: the connector, then each kind of message the view draws ---- */
const CM_LEGEND = [['call', 'Call', 'waits for its reply'], ['async', 'Async', 'sent without waiting'], ['reply', 'Reply', 'the answer to a call'],
  ['create', 'Create', '«create»: makes its receiver'], ['delete', 'Delete', '«destroy»: ends its receiver']];
const cmLegendItem = (svg, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const cmLegendOf = sorts => [cmLegendItem('<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4"/>', 'Connector', 'a link messages are sent along'),
  ...CM_LEGEND.filter(([s]) => sorts.has(s)).map(([s, name, says]) => cmLegendItem(cmArrowOf(s, 14, 8, 'right'), name, says))];

/* ---- the view laid out: { model, view, memo } ----
   The lifelines and the stacks are ranked as the map ranks its cards (longest paths, cycles broken depth first, columns
   ordered by untangle and rows by rowsFor, src/layout/layered.js): the lifelines are ranked first, without the stacks, and
   then each link runs from its earlier lifeline to its later one, a stack between the two, so a connector's halves leave
   its stack on opposite sides and its rows' arrows point both ways. A lifeline no connector reaches goes in a row under the rest. A view's
   pins (`layout`, by lifeline) win, in the same columns and rows, which a drag or Alt + arrows on a lifeline writes; a
   node a pin would cover moves down. The host's ranking (`pos`) is not used: it has no place for a stack */
// each node's column: the longest path to it over the links, cycles broken depth first; fwd, the links kept
function cmRank(ids, links) {
  const outs = new Map(ids.map(id => [id, []])), back = new Set(), st = new Map();
  links.forEach((l, k) => outs.get(l[0]).push(k));
  const dfs = u => { const fr = [[u, 0]]; st.set(u, 1); // a stack of frames, not recursion: a chain of any length
    while (fr.length) { const f = fr[fr.length - 1], ks = outs.get(f[0]); if (f[1] === ks.length) { fr.pop(); st.set(f[0], 2); continue; }
      const k = ks[f[1]++], v = links[k][1]; if (st.get(v) === 1) back.add(k); else if (!st.has(v)) { st.set(v, 1); fr.push([v, 0]); } } };
  [...ids.filter(id => !links.some(l => l[1] === id)), ...ids].forEach(id => { if (!st.has(id)) dfs(id); });
  const fwd = links.filter((l, k) => !back.has(k)), rank = Object.create(null);
  ids.forEach(id => { rank[id] = 0; });
  for (let it = 0, more = true; more && it <= ids.length; it++) { more = false; fwd.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) { rank[b] = rank[a] + 1; more = true; } }); }
  return { rank, fwd };
}
function cmPlace(ids, links, pins) {
  const { rank, fwd } = cmRank(ids, links), lined = new Set(links.flatMap(l => l));
  const seen = Object.create(null); links.forEach(l => l.forEach(id => { seen[id] ??= Object.keys(seen).length; }));
  const at = Object.create(null), cols = [];
  ids.filter(id => lined.has(id)).forEach(id => (cols[rank[id]] ||= []).push(id));
  const mains = cols.filter(Boolean).map(c => c.sort((a, b) => seen[a] - seen[b])), ranks = mains.map(c => rank[c[0]]);
  untangle(mains, fwd);
  const row = rowsFor(mains, fwd);
  mains.forEach((c, k) => c.forEach(id => { at[id] = [ranks[k], row[id]]; }));
  const loose = ids.filter(id => !lined.has(id)), per = Math.max(2, mains.length), under = Math.max(-1, ...Object.values(at).map(p => p[1])) + 1;
  loose.forEach((id, k) => { at[id] = [k % per, under + Math.floor(k / per)]; });
  if (pins.size) { // pinned first, then each other node at its place or the nearest free one below it
    const taken = [...pins.values()], free = (c, r) => !taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1);
    ids.forEach(id => { if (pins.has(id)) { at[id] = pins.get(id); return; } let [c, r] = at[id]; while (!free(c, r)) r++; at[id] = [c, r]; taken.push([c, r]); });
  }
  return at;
}
function commGeo({ model, view, memo }) {
  const I = commIndex(model, view), nums = messageNumbers(model, view), L = CM_OBJ(view.layout) ? view.layout : {};
  const pins = new Map(I.ids.filter(id => Object.hasOwn(L, id) && Array.isArray(L[id]) && L[id].length === 2 && L[id].every(Number.isFinite)).map(id => [id, L[id]]));
  const nodes = I.ids.map(id => { const n = I.N.get(id), d = { id, label: cmHeadText(n), type: n.type || 'uml.Lifeline', kind: 'file', shape: 'lifeline', stereotypes: cmStereoOf(n),
    aria: `Lifeline ${cmHeadText(n)}${cmStereoOf(n).length ? ` (${cmStereoOf(n).join(', ')})` : ''}` };
    return { ...d, ...SHAPE.lifeline.size(d) }; });
  // each link's way, from the lifelines ranked alone: a stack ranked after both its lifelines leaves both halves on one side,
  // its arrows the same way and one half back across the picture
  const { rank } = cmRank(I.ids, I.connectors.filter(c => c.from !== c.to).map(c => { const f = (I.on.get(c.id)[0] || c).from; return [f, f === c.from ? c.to : c.from]; }));
  const onward = (a, b) => (rank[a] <= rank[b] ? [a, b] : [b, a]);
  const edges = [], links = [], stacks = new Map(), conAria = c => `Connector ${c.from === c.to ? `from ${cmNameOf(I.N.get(c.from))} to itself` : `between ${cmNameOf(I.N.get(c.from))} and ${cmNameOf(I.N.get(c.to))}`}, ${cmPlural(I.on.get(c.id).length, 'message')}`;
  I.connectors.forEach(c => {
    const ms = I.on.get(c.id), plain = { id: c.id, _id: c.id, type: c.type, from: c.from, to: c.to, end: { from: 'none', to: 'none' }, aria: conAria(c) };
    if (!ms.length) { edges.push(plain); if (c.from !== c.to) links.push(onward(c.from, c.to)); return; }
    const [s, t] = onward(c.from, c.to), texts = ms.map(m => cmRowText(m, nums.get(m.id))), id = CM_STACK + c.id;
    const st = { id, label: '', kind: 'file', w: Math.max(...texts.map(cmRowW)), h: ms.length * CM_ROW.h };
    nodes.push(st); stacks.set(c.id, { st, ms, texts, s, t });
    links.push([s, id], ...(s === t ? [] : [[id, t]]));
    edges.push({ ...plain, id: id + CM_STACK + 'a', from: s, to: id }, { ...plain, id: id + CM_STACK + 'b', from: id, to: t });
  });
  const at = cmPlace(nodes.map(n => n.id), links, pins);
  nodes.forEach(n => { [n.col, n.row] = at[n.id]; });
  // a self connector's loop through its stack, which the router would leave crossing itself: in the same row, straight into
  // the stack's near side and back over the top into the lifeline's; else from the lifeline's top or bottom into the
  // stack's near side, and from the stack's side facing the lifeline into the lifeline's far one (sides in the layout's own
  // axes, which a view laid out down turns)
  stacks.forEach(({ st, s, t }) => { const [c, r] = at[s], [c2, r2] = at[st.id]; if (s !== t || c === c2) return;
    const [near, far] = c2 > c ? ['left', 'right'] : ['right', 'left'], [up, down] = r2 < r ? ['top', 'bottom'] : ['bottom', 'top'];
    const a = edges.find(e => e.to === st.id), b = edges.find(e => e.from === st.id);
    Object.assign(a, Math.abs(r2 - r) < 1 ? { fromSide: far, toSide: near } : { fromSide: up, toSide: near });
    Object.assign(b, Math.abs(r2 - r) < 1 ? { fromSide: 'top', toSide: 'top' } : { fromSide: down, toSide: far }); });
  // no port repair: on the stress fixture it saves a fifth of a layout, which a message edit pays (§10), for 13 crossings, not 11
  const g = layoutTyped({ nodes, edges, direction: view.direction === 'down' ? 'down' : 'right', gap: 64, rgap: 40, repair: false, reroute: false }, memo); // no rip-up pass: P1 on a shared CI runner
  return cmFinish(g, I, stacks, nums, view);
}

// a line's two runs crossing (not meeting end to end), axis-aligned
const cmCrosses = P => P.slice(1).some((b, i) => P.slice(i + 3).some((d, k) => { const a = P[i], c = P[i + k + 2], h = a[1] === b[1];
  if (h === (c[1] === d[1])) return false;
  const [A, B, C, D] = h ? [a, b, c, d] : [c, d, a, b];
  return C[0] > Math.min(A[0], B[0]) && C[0] < Math.max(A[0], B[0]) && A[1] > Math.min(C[1], D[1]) && A[1] < Math.max(C[1], D[1]); }));
// a loop's two ends on one side of its node, each with the first run along it, change places: x on a top or bottom, y on a side
const cmSwapEnds = (P, side) => { const v = side === 'T' || side === 'B' ? 0 : 1, n = P.length, Q = P.map(r => [...r]), x = P[0][v], y = P[n - 1][v];
  if (P[1][v] !== x || P[n - 2][v] !== y) return P;
  Q[0][v] = Q[1][v] = y; Q[n - 1][v] = Q[n - 2][v] = x; return cmCrosses(Q) ? P : Q; };

/* The laid-out graph as it is drawn, a new object (layoutTyped's memo keeps the one it returned): each stack replaced by its
   rows, each connector's halves joined through its stack, geo.order, the slots and the legend */
function cmFinish(g, I, stacks, nums, view) {
  const byId = Object.create(null), order = [...I.ids];
  g.nodes.forEach(n => { if (n.id[0] !== CM_STACK) byId[n.id] = { ...n }; });
  const E = new Map(g.edges.map(e => [e.id, e])), edges = [], total = I.messages.filter(m => nums.has(m.id)).length, place = new Map(I.messages.map((m, k) => [m.id, k + 1]));
  I.connectors.forEach(c => {
    const S = stacks.get(c.id);
    if (!S) { const e = E.get(c.id); if (e) edges.push({ ...e, s: byId[e.from], t: byId[e.to] }); return; }
    const a = E.get(CM_STACK + c.id + CM_STACK + 'a'), b = E.get(CM_STACK + c.id + CM_STACK + 'b'), box = g.byId[S.st.id];
    if (!a || !b || !box) return;
    const p = a.pts[a.pts.length - 1], q = b.pts[0], across = a.ts === 'L' || a.ts === 'R';
    const mid = p[0] === q[0] || p[1] === q[1] ? [] : across ? [[box.x + box.w / 2, p[1]], [box.x + box.w / 2, q[1]]] : [[p[0], box.y + box.h / 2], [q[0], box.y + box.h / 2]];
    let pts = [...a.pts, ...mid, ...b.pts];
    if (S.s === S.t && a.fs === b.ts && cmCrosses(pts)) pts = cmSwapEnds(pts, a.fs); // a self connector's loop that crosses itself: its two ports swapped
    const turn = S.s !== c.from; // drawn from the connector's own from to its to
    edges.push({ ...a, id: c.id, _id: c.id, from: c.from, to: c.to, s: byId[c.from], t: byId[c.to], pts: turn ? pts.reverse() : pts, p1: turn ? b.p2 : a.p1, p2: turn ? a.p1 : b.p2,
      fs: turn ? b.ts : a.fs, ts: turn ? a.fs : b.ts, lbl: null, stack: S.ms.map(m => m.id) });
    // a row's arrow points the way its connector leaves the stack toward the message's receiver
    const way = (u, v) => { const dx = v[0] - u[0], dy = v[1] - u[1]; return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'; };
    const out = pts => pts.find(r => r[0] !== pts[0][0] || r[1] !== pts[0][1]) || pts[0], fwd = way(q, out(b.pts)), bwd = way(p, out([...a.pts].reverse()));
    S.ms.forEach((m, k) => { const from = cmNameOf(I.N.get(m.from)), to = cmNameOf(I.N.get(m.to)), num = nums.get(m.id), sort = cmSortOf(m);
      const row = { id: m.id, type: 'uml.Message', shape: 'message-row', kind: 'file', k: box.k, label: S.texts[k], num, sort, dir: m.from === S.s ? fwd : bwd,
        x: box.x, y: box.y + k * CM_ROW.h, w: box.w, h: CM_ROW.h, col: box.col, row: box.row + k / S.ms.length,
        aria: `Message ${place.get(m.id)} of ${total}, ${num}: ${from} to ${to}${CM_HAS(m.label) ? ', ' + m.label : ''}, ${sort}${sort === 'reply' && CM_HAS(cmPropsOf(m).replyTo) && nums.has(cmPropsOf(m).replyTo) ? ' to ' + nums.get(cmPropsOf(m).replyTo) : ''}` };
      byId[row.id] = row; });
  });
  // reading order (S13): lifelines in the layout's order, left to right and top to bottom, then the message rows by number.
  // The nodes are drawn in it too, so a screen reader that reads the picture in document order reads it so. geo.order, the
  // key rings' order and so Tab's, has the connectors between the lifelines and the rows: a connector is selected by its ring
  order.sort((a, b) => byId[a].x - byId[b].x || byId[a].y - byId[b].y);
  order.push(...I.messages.filter(m => byId[m.id]).map(m => m.id).sort((a, b) => cmByNumber(nums.get(a), nums.get(b))));
  const heads = order.slice(0, I.ids.length), mid = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  // the slots (src/typed/edit.js): one after each lifeline, its index in nodeIds (N adds there), and one after each row,
  // named by `after` (L from a message adds after it; a row dropped on a row takes its place)
  const slots = [...heads.map(id => ({ index: CM_ARR(view.nodeIds).indexOf(id) + 1, after: id, parent: null, lifeline: true, ...mid(byId[id]) })),
    ...order.slice(I.ids.length).map(id => ({ after: id, parent: null, ...mid(byId[id]) }))];
  return { ...g, nodes: order.map(id => byId[id]), edges, byId, order: [...heads, ...edges.map(e => e.id), ...order.slice(I.ids.length)], slots,
    legend: cmLegendOf(new Set(I.messages.filter(m => byId[m.id]).map(cmSortOf))) };
}

/* ---- validators: message-link, and the rules both interaction types share (src/uml/interaction.js). Each problem:
   { level, rule, path, message, ids } ---- */
const CM_RULES = { 'message-link': 'a connector of the view joins a message\'s two lifelines; a self-message needs a self connector', ...INTERACTION_RULES };
function commProblems(model, view) {
  if (!CM_OBJ(view)) return [];
  const I = commIndex(model, view), w = interactionWalk(model, view), out = [];
  w.occ.forEach(o => { if (!o.message || I.carrierOf(o.from, o.to) && I.shown.has(o.from) && I.shown.has(o.to)) return;
    const gone = [o.from, o.to].filter(id => !I.shown.has(id)), nm = `${o.id}${CM_HAS(o.el.label) ? ` ("${o.el.label}")` : ''}`;
    out.push({ level: 'error', rule: 'message-link', path: o.path, ids: [o.id, o.from, o.to], message: `message-link: ${nm} runs from ${o.from} to ${o.to}, `
      + (gone.length ? `and ${gone.join(' and ')} ${gone.length > 1 ? 'are' : 'is'} not a lifeline of view ${view.id}` : `and no connector of view ${view.id} joins them`) }); });
  return [...out, ...interactionProblems(model, view)];
}

/* ---- describe(): the view in words, each lifeline with its links, then the messages by number ---- */
function commDescribe(model, viewId) {
  const v = CM_ARR(model && model.views).find(x => CM_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = commIndex(model, v), nums = messageNumbers(model, v), nm = id => cmNameOf(I.N.get(id) || { id });
  const drawn = I.messages.filter(m => I.carrierOf(m.from, m.to)).sort((a, b) => cmByNumber(nums.get(a.id), nums.get(b.id)));
  const out = [`${v.title || v.id}: a communication diagram of ${cmPlural(I.ids.length, 'lifeline')}, ${cmPlural(I.connectors.length, 'connector')} and ${cmPlural(drawn.length, 'message')}.`];
  I.ids.forEach(id => { const n = I.N.get(id), st = cmStereoOf(n), links = [...new Set(I.connectors.filter(c => c.from === id || c.to === id).map(c => (c.from === c.to ? 'itself' : nm(c.from === id ? c.to : c.from))))];
    out.push(`Lifeline ${cmHeadText(n)}${st.length ? ` (${st.join(', ')})` : ''}${links.length ? '; linked to ' + links.join(', ') : '; linked to nothing'}.`); });
  drawn.forEach(m => { const s = cmSortOf(m), r = cmPropsOf(m).replyTo;
    out.push(`${nums.get(m.id)}: ${nm(m.from)} to ${nm(m.to)}${CM_HAS(m.label) ? ', ' + m.label : ''}, ${s}${s === 'reply' && nums.has(r) ? ' to ' + nums.get(r) : ''}.`); });
  return out.join('\n');
}

/* ---- editing (notes/stage-3.md §5.1, §6.4): each hook returns commands, null to leave the gesture to the default, or
   { error } for the hint line, and never a transaction that breaks a rule (S5) ---- */
// an id no element of the model has: the base, else the base and the first number free ('m10', 'api-payments-2')
function cmFreshId(model, base) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).replace(/->/g, '-') || 'el', next = k => (b === 'm' ? b + k : k === 1 ? b : `${b}-${k}`); // ids never hold "->" (M2)
  let k = 1; while (used.has(next(k))) k++;
  return next(k);
}
// where `at` puts a message in view.edges: { index }, { after: id }, or none or a lifeline's slot (the end); never among the
// connectors
function cmMessageIndex(view, at) {
  const list = CM_ARR(view.edges), idOf = x => (typeof x === 'string' ? x : CM_OBJ(x) ? x.id : null);
  let i = list.length;
  if (CM_OBJ(at) && at.lifeline) return i;
  if (CM_OBJ(at) && Number.isInteger(at.index)) i = at.index;
  else if (CM_OBJ(at) && at.after != null && list.some(x => idOf(x) === at.after)) i = list.findIndex(x => idOf(x) === at.after) + 1;
  return Math.max(0, Math.min(list.length, i));
}

// the commands, or { error } naming the first rule they would break that the view does not break already (S5); all: in every
// communication view, for commands that delete from the model
function cmGuard(model, view, commands, all) {
  const key = p => p.view + ' ' + p.rule + ' ' + p.ids.join(' ');
  const errs = m => CM_ARR(m.views).filter(v => CM_OBJ(v) && (v.id === view.id || all && v.diagram === 'uml.communication'))
    .flatMap(v => commProblems(m, v).filter(p => p.level === 'error').map(p => ({ ...p, view: v.id })));
  let now; try { now = apply(model, commands); } catch (e) { return { error: String(e.message) }; }
  const was = new Set(errs(model).map(key)), bad = errs(now).find(p => !was.has(key(p)));
  return bad ? { error: bad.message } : commands;
}

/* connect(model, view, from, to, at, line): line, the picked entry of `lines`. A connector is added among the connectors;
   a message at `at`, with a connector in the same transaction when none joins its lifelines, and a reply answers the
   latest unanswered call from its receiver to its sender */
function commConnect(model, view, from, to, at, line) {
  if (!CM_OBJ(view)) return null;
  const I = commIndex(model, view), type = CM_OBJ(line) && line.type === 'uml.Message' ? 'uml.Message' : 'uml.Connector';
  if (!I.shown.has(from) || !I.shown.has(to)) return { error: 'Connect two lifelines of this view' };
  const cons = CM_ARR(view.edges).filter(x => { const e = typeof x === 'string' ? I.E.get(x) : x; return CM_OBJ(e) && e.type === 'uml.Connector'; }).length; // connectors first, then messages
  const link = id => ({ op: 'add', element: { id, type: 'uml.Connector', from, to }, view: view.id, index: cons });
  if (type === 'uml.Connector') return I.carrierOf(from, to) ? { error: `${from === to ? `${from} is linked to itself` : `${from} and ${to} are linked`} already` } : [link(cmFreshId(model, from === to ? `${from}-self` : `${from}-${to}`))];
  const props = { ...(CM_OBJ(line.props) ? structuredClone(line.props) : {}) }, i = Math.max(cons, cmMessageIndex(view, at));
  if (props.sort === 'reply') { const c = replyCallFor(model, view, from, to, { index: i }); if (c) props.replyTo = c; }
  const id = cmFreshId(model, 'm'), out = [{ op: 'add', element: { id, type: 'uml.Message', from, to, ...(Object.keys(props).length ? { props } : {}) }, view: view.id, index: i }];
  if (!I.carrierOf(from, to)) out.push(link(cmFreshId(model, from === to ? `${from}-self` : `${from}-${to}`))); // added after, at the connectors' end: the message moves one down with it
  return cmGuard(model, view, out); // a message before its lifeline's create, or after its delete
}

/* moveTo(model, view, id, at): a message one place earlier or later in time ({ by: [dx, dy] }: Alt + Up/Down), or onto
   another row ({ id }, or a row's slot: the row it was dropped on, whose place it takes; or { index } in view.edges; a
   lifeline's slot, nothing); { error } when the new order breaks a rule. On a lifeline: null, and the gesture sets a pin as on a class view */
function commMoveTo(model, view, id, at) {
  if (!CM_OBJ(view)) return null;
  const I = commIndex(model, view), list = CM_ARR(view.edges), idOf = x => (typeof x === 'string' ? x : CM_OBJ(x) ? x.id : null);
  const ms = list.map((x, i) => [idOf(x), i]).filter(([x]) => I.messages.some(m => m.id === x)), k = ms.findIndex(([x]) => x === id);
  if (k < 0) return null;
  let to = k;
  if (CM_OBJ(at) && at.lifeline) return [];
  if (CM_OBJ(at) && at.after != null && at.id == null) at = { id: at.after }; // a row's slot
  if (CM_OBJ(at) && Array.isArray(at.by)) to = k + Math.sign(+at.by[1] || 0);
  else if (CM_OBJ(at) && at.id != null) to = ms.findIndex(([x]) => x === at.id);
  else if (CM_OBJ(at) && Number.isInteger(at.index)) { to = ms.filter(([, i]) => i < at.index).length; if (to > k) to--; }
  if (to < 0 || to >= ms.length || to === k) return [];
  return cmGuard(model, view, [{ op: 'move', id, view: view.id, index: ms[to][1] }]); // a reply before its call, a create or delete out of its place
}

/* add(model, view, entry, label, at): the palette's lifeline, at `at.index` in nodeIds (a lifeline's slot: after the selected
   lifeline), else last (no slot, or a row's, which has no index) */
function commAdd(model, view, entry, label, at) {
  if (!CM_OBJ(view) || !CM_OBJ(entry) || entry.type !== 'uml.Lifeline') return null;
  const id = cmFreshId(model, String(label ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}_$-]+/gu, '-').replace(/^-+|-+$/g, '') || 'lifeline');
  return [{ op: 'add', element: { id, type: 'uml.Lifeline', label: String(label ?? '') }, view: view.id, ...(CM_OBJ(at) && Number.isInteger(at.index) ? { index: at.index } : {}) }];
}

/* remove(model, view, ids, fromModel): Delete hides from this view, Shift + Delete deletes from the model. A connector takes
   the messages it carries with it, deleted from every communication view that has no other connector for them; a hidden
   call takes its replies in this view (a deleted one does by refs). A lifeline takes its connectors and messages (apply()
   does), said on the hint line ({ commands, say }). { error } when what is left breaks a rule */
function commRemove(model, view, ids, fromModel) {
  if (!CM_OBJ(view)) return null;
  const I = commIndex(model, view), out = [], seen = new Set(), idOf = x => (typeof x === 'string' ? x : CM_OBJ(x) ? x.id : null);
  const views = fromModel ? CM_ARR(model && model.views).filter(v => CM_OBJ(v) && v.diagram === 'uml.communication') : [view];
  const go = id => { if (seen.has(id)) return; seen.add(id);
    out.push(fromModel ? { op: 'delete', id } : { op: 'hide', id, view: view.id });
    if (I.E.has(id) && I.E.get(id).type === 'uml.Connector') views.forEach(v => { const on = commIndex(model, v).on.get(id); if (!on) return;
      const left = commIndex(model, { ...v, edges: CM_ARR(v.edges).filter(x => !seen.has(idOf(x))) });
      on.forEach(m => { if (v === view && !fromModel || !left.carrierOf(m.from, m.to)) go(m.id); }); });
    if (!fromModel) I.messages.filter(m => cmPropsOf(m).replyTo === id).forEach(m => go(m.id)); };
  CM_ARR(ids).forEach(id => { if (I.shown.has(id) || I.E.has(id)) go(id); });
  return cmSaid(model, view, ids, fromModel, I, fromModel ? cmGuard(model, view, out, true) : out);
}
// the messages a connector or a lifeline took (its own, or by apply()'s cascade), said on the hint line: { commands, say }
function cmSaid(model, view, ids, fromModel, I, r) {
  const what = CM_ARR(ids).filter(id => I.shown.has(id) || I.E.has(id) && I.E.get(id).type === 'uml.Connector');
  if (!Array.isArray(r) || !what.length) return r;
  let next; try { next = apply(model, r); } catch { return r; }
  const left = new Set(fromModel ? CM_ARR(next.edges).filter(CM_OBJ).map(e => e.id) : commIndex(next, CM_ARR(next.views).find(v => CM_OBJ(v) && v.id === view.id)).messages.map(m => m.id));
  const msgs = fromModel ? CM_ARR(model.edges).filter(e => CM_OBJ(e) && e.type === 'uml.Message') : I.messages;
  const took = msgs.filter(m => !left.has(m.id) && !CM_ARR(ids).includes(m.id)); if (!took.length) return r;
  const q = x => JSON.stringify(cmNameOf(x)), nm = id => cmNameOf(I.N.get(id) || { id });
  const who = what.map(id => (I.shown.has(id) ? 'lifeline ' + q(I.N.get(id)) : `connector ${JSON.stringify(nm(I.E.get(id).from) + '–' + nm(I.E.get(id).to))}`)).join(', ');
  return { commands: r, say: `${fromModel ? 'Deleted' : 'Hid'} ${who} and ${what.length === 1 ? 'its' : 'their'} ${cmPlural(took.length, 'message')}: ${took.map(q).join(', ')}` };
}

/* ---- the type ---- */
const CM_SORT = { key: 'sort', label: 'Sort', kind: 'enum', options: CM_SORTS };
const COMM_TYPE = registerDiagramType('uml.communication', {
  title: 'communication diagram',
  elements: [{ type: 'uml.Lifeline', label: 'Lifeline' }],
  lines: [{ type: 'uml.Connector', label: 'Connector' }, ...[['call', 'Call'], ['async', 'Async'], ['reply', 'Reply'], ['create', 'Create'], ['delete', 'Delete']]
    .map(([sort, label]) => ({ type: 'uml.Message', label, props: { sort } }))],
  props: {
    'uml.Lifeline': [{ key: 'represents', label: 'Represents', kind: 'text' }, { key: 'stereotypes', label: 'Stereotypes', kind: 'list' }],
    'uml.Message': [CM_SORT, { key: 'replyTo', label: 'Reply to', kind: 'text' }],
    'uml.Connector': [],
  },
  refs: { 'uml.Message': { 'props.replyTo': 'cascade' } }, // a reply goes with its call
  layout: Object.assign(commGeo, { rank: false }), // commGeo ranks its own lifelines: the host passes only the pins
  // the host ranks a typed view's lifelines before commGeo runs (context.js autoPos), and commGeo ranks its own, with the
  // stacks. Connectors turned round make the messages along them close cycles, which that ranking passes over: a third of
  // its time on the stress fixture; layout.rank false (above) now skips that ranking
  rankFlip: e => e.type === 'uml.Connector',
  validate: commProblems,
  rules: CM_RULES,
  describe: commDescribe,
  edits: { connect: commConnect, moveTo: commMoveTo, add: commAdd, remove: commRemove },
});

export { COMM_TYPE, commGeo, commProblems, commDescribe, commConnect, commMoveTo, commAdd, commRemove, cmRank };
