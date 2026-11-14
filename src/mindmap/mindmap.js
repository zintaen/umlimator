import { TYPED, registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { layoutTree } from '../layout/tree.js';
import '../typed/edit.js'; // TYPED.edit, which the outline's Show on a topic wraps (mmShow)

/* ---------- the mindmap, mindmap (work package 4a.4, notes/milestone-4a.md §7) ----------
   Topics (mindmap.Topic) form a tree by parent; the view's nodeIds say which are shown and, among siblings, in what order.
   A shown topic hangs from its nearest shown ancestor; one with none is a root, and each further root's tree is drawn on
   its own under the first (mindmap-root). The geometry is src/layout/tree.js's: this file measures each topic (the root
   15 px, the rest 13 px, wrapped to four lines of 200 px), lays each tree out with layoutTree, stacks the trees and turns
   the output into svgOf's geometry: topics as nodes, no lines for the router, the branches as curves in the type's under
   layer, each first-level branch in a colour of the map's kind palette (decision 14). Then the validators, describe(), the
   PDF's word and rows, and the gesture hooks of §7.3. Ships in lib/umlimator-all.js only. */

const MM_T = 'mindmap.Topic', MM_ARR = x => (Array.isArray(x) ? x : []), MM_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const MM = { root: { px: 15, wt: 600, pad: 14, lh: 20 }, topic: { px: 13, wt: 500, pad: 10, lh: 17 }, max: 200, lines: 4, margin: 24, trees: 48, open: 26 };
const MM_INK = ['public', 'lane', 'ext', 'verb', 'board', 'hook']; // the map's kind palette, cycled over first-level branches
const MM_DEEP = 64; // levels, the root the first: deeper is drawn, and warned (a Mermaid reader writes it flat)
const mmView = (model, view) => (MM_OBJ(view) ? view : MM_ARR(model && model.views).find(v => MM_OBJ(v) && v.id === view)) || null;
const mmText = n => String(n.label ?? n.id);
const mmOne = n => mmText(n).replace(/\s+/g, ' ').trim(); // its text on one line, as describe() and the hint line say it
const mmPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const mmErr = error => ({ error });

/* The view read once: its nodes by id, the topics it shows (nodeIds order, once each), each one's nearest shown ancestor
   (up), its shown children in order, the roots, the trees (each root's, then one of what no root reaches: a cycle), each
   shown topic's depth in its tree, and present.<id>.side where it is left or right. Linear: each hidden ancestor walked once */
function mmIndex(model, V) {
  const N = new Map(); [...MM_ARR(V.nodes), ...MM_ARR(model && model.nodes)].forEach(n => { if (MM_OBJ(n) && typeof n.id === 'string' && !N.has(n.id)) N.set(n.id, n); });
  const topic = id => N.has(id) && N.get(id).type === MM_T, pos = new Map();
  MM_ARR(V.nodeIds).forEach((id, i) => { if (topic(id) && !pos.has(id)) pos.set(id, i); });
  const ids = [...pos.keys()], shown = new Set(ids), P = MM_OBJ(V.present) ? V.present : {};
  const parentOf = id => { const p = N.get(id).parent; return p != null && topic(p) ? p : null; };
  const A = new Map(), up = id => { if (A.has(id)) return A.get(id); // the nearest shown ancestor, or null
    const path = [id], seen = new Set(path); let p = parentOf(id);
    while (p != null && !shown.has(p) && !A.has(p) && !seen.has(p)) { path.push(p); seen.add(p); p = parentOf(p); }
    const r = p == null || seen.has(p) ? null : shown.has(p) ? p : A.get(p); path.forEach(x => A.set(x, r)); return r; };
  const kids = new Map(ids.map(id => [id, []])), roots = [];
  ids.forEach(id => { const u = up(id); if (u == null) roots.push(id); else kids.get(u).push(id); });
  const depth = new Map(), tree = new Map(), trees = [];
  const reach = (root, k) => { for (const s = [root]; s.length;) { const id = s.pop(); tree.set(id, k); trees[k].list.push(id);
    kids.get(id).forEach(c => { if (!tree.has(c)) { depth.set(c, depth.get(id) + 1); s.push(c); } }); } };
  roots.forEach(r => { depth.set(r, 0); trees.push({ root: r, list: [] }); reach(r, trees.length - 1); });
  const lost = ids.filter(id => !tree.has(id)), hung = new Map(); // a cycle of shown topics: one tree, from the first, layoutTree hanging the rest from it; each depth and parent as drawn
  if (lost.length) { trees.push({ root: lost[0], list: [] }); lost.forEach(id => { if (!tree.has(id)) { depth.set(id, id === lost[0] ? 0 : 1); hung.set(id, id === lost[0] ? null : lost[0]); reach(id, trees.length - 1); } }); }
  trees.forEach(t => t.list.sort((a, b) => pos.get(a) - pos.get(b))); // children in nodeIds order
  const side = id => (MM_OBJ(P[id]) && (P[id].side === 'left' || P[id].side === 'right') ? P[id].side : null);
  return { N, topic, pos, ids, shown, up, kids, roots, trees, depth, hung, P, side, parentOf };
}

/* a topic's text, wrapped to four lines of 200 px (a newline breaks one), the last cut with fit; its box */
function mmSize(n, root, opens) {
  const S = root ? MM.root : MM.topic, out = [];
  // ponytail: text past 400 characters per paragraph is cut before wrapping (four lines hold about 130); fit's loop is quadratic in what it gets
  const paras = mmText(n).split('\n').map(p => p.trim().slice(0, 400));
  for (const p of paras) { let line = '';
    for (const w of p.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w;
      if (textW(t, S.px) <= MM.max || !line) line = t; else { out.push(line); line = w; } }
    out.push(line);
    if (out.length > MM.lines) break; }
  const lines = out.length > MM.lines ? [...out.slice(0, MM.lines - 1), out.slice(MM.lines - 1).join(' ')] : out;
  const shown = lines.map(l => fit(l, S.px, MM.max, true)), tw = Math.max(1, ...shown.map(l => Math.ceil(textW(l, S.px))));
  if (lines.length === MM.lines && out.length > MM.lines && !shown.at(-1).endsWith('…')) shown[MM.lines - 1] = fit(shown.at(-1) + '…', S.px, MM.max);
  return { lines: shown, tw, w: tw + 2 * S.pad + (opens ? MM.open : 0), h: shown.length * S.lh + 2 * S.pad };
}

/* run(model, view): svgOf's geometry. Nodes: the topics (shape mm-topic); no lines; mm.links: the branches, for draw();
   order (§7.1): each tree's root, its right branches, then its left ones, each in pre-order; slots: one per topic (after:
   its id), so N and the palette find the topic selected */
function mmRun(model, view) {
  const V = mmView(model, view), X = mmIndex(model, V), views = new Map(MM_ARR(model && model.views).filter(MM_OBJ).map(v => [v.id, v]));
  const nodes = [], links = [], order = [], byId = {}, problems = [];
  let bottom = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  X.trees.forEach(({ root, list }) => {
    const opens = id => { const v = views.get(X.N.get(id).opensView); return v && v.id !== V.id ? v : null; };
    const size = new Map(list.map(id => [id, mmSize(X.N.get(id), id === root, opens(id))]));
    const o = layoutTree({ root, topics: list.map(id => ({ id, parent: id === root ? null : X.up(id), w: size.get(id).w, h: size.get(id).h, side: X.side(id) })) });
    problems.push(...o.problems);
    const dy = bottom == null ? 0 : bottom + MM.trees - o.bounds.y; bottom = o.bounds.y + o.bounds.h + dy;
    const ink = new Map(), kids = new Map(), up = new Map(o.links.map(l => [l.to, l.from]));
    o.nodes.forEach(n => { if (n.depth === 1) ink.set(n.id, MM_INK[ink.size % MM_INK.length]); });
    const mine = o.links.map(l => { kids.set(l.from, (kids.get(l.from) || 0) + 1); return { from: l.from, to: l.to, p1: [l.p1[0], r2(l.p1[1] + dy)], p2: [l.p2[0], r2(l.p2[1] + dy)] }; });
    const branches = new Map(); // a first-level topic's subtree in pre-order (nodes come in pre-order)
    o.nodes.forEach(t => { const x = X.N.get(t.id), k = kids.get(t.id) || 0, v = opens(t.id), p = up.get(t.id), s = size.get(t.id);
      const n = { id: t.id, shape: 'mm-topic', type: MM_T, label: mmText(x), k: 'file', x: t.x, y: r2(t.y + dy), w: t.w, h: t.h, depth: t.depth, side: t.side, branch: t.branch,
        ink: t.branch == null ? null : ink.get(t.branch), root: t.depth === 0, lines: s.lines, tw: s.tw, opens: v ? String(v.title ?? v.id) : null, parent: p ?? null,
        aria: `Topic ${mmOne(x)}, ${p == null ? 'the root' : `under ${mmOne(X.N.get(p))}`}${k ? `, ${mmPlural(k, 'subtopic')}` : ''}${v ? `, opens ${v.title ?? v.id}` : ''}` };
      nodes.push(n); byId[n.id] = n;
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
      if (t.branch != null) (branches.get(t.branch) || branches.set(t.branch, []).get(t.branch)).push(n.id); });
    mine.forEach(l => { const t = byId[l.to]; links.push({ ...l, ink: t.ink, first: t.depth === 1 }); });
    order.push(root, ...['right', 'left'].flatMap(s => o.nodes.filter(t => t.depth === 1 && t.side === s).flatMap(t => branches.get(t.id))));
  });
  const m = MM.margin, bounds = nodes.length ? { x: r2(x0 - m), y: r2(y0 - m), w: r2(x1 - x0 + 2 * m), h: r2(y1 - y0 + 2 * m) } : { x: 0, y: 0, w: 2 * m, h: 2 * m };
  const slots = order.map(id => { const n = byId[id]; return { index: X.pos.get(id) + 1, x: r2(n.x + n.w / 2), y: r2(n.y + n.h / 2), parent: n.parent, after: id }; });
  return { nodes, edges: [], groups: [], byId, bounds, map: false, order, slots, problems, mm: { links } };
}

/* draw, under the topics (§7.1): each branch a curve from p1 to p2 with level tangents, in its first-level branch's
   colour, 2.5 px from the root and 1.5 px below */
function mmDraw(g) {
  if (!g.mm) return { under: '', over: '' };
  const d = ({ p1: [a, b], p2: [c, e] }) => { const x = r2((a + c) / 2); return `M${a} ${b}C${x} ${b} ${x} ${e} ${c} ${e}`; };
  return { under: `<g class="mm-under">${g.mm.links.map(l => `<path class="mm-branch" d="${d(l)}" fill="none" stroke="var(--um-k-${l.ink})" stroke-width="${l.first ? 2.5 : 1.5}" stroke-linecap="round"/>`).join('')}</g>`, over: '' };
}

/* a topic: a rounded box in its branch's colour (the root's in the text's), its lines centred; the drill-down mark when
   it opens a view (as other typed nodes carry it) */
SHAPE['mm-topic'] = {
  draw(n) { const S = n.root ? MM.root : MM.topic, c = n.ink ? `var(--um-k-${n.ink})` : 'var(--um-text)', cx = r2(n.x + S.pad + n.tw / 2);
    const text = MM_ARR(n.lines).map((l, i) => `<tspan x="${cx}" y="${r2(n.y + S.pad + S.lh * (i + .5) + S.px * .35)}">${esc(l)}</tspan>`).join('');
    const hint = n.opens ? (() => { const x = r2(n.x + n.w - 28), y = r2(n.y + n.h / 2 - 7);
      return `<g class="open-hint depth-read"><title>Open ${esc(n.opens)} (or double-click the topic)</title><rect x="${x}" y="${y}" width="20" height="14" rx="7" class="n-mask" stroke="${c}"/><text x="${r2(x + 10)}" y="${r2(y + 10.5)}" text-anchor="middle" class="badge-tx" fill="${c}">⤢</text></g>`; })() : '';
    return `<g class="node mm-topic${n.root ? ' mm-root' : ''}" data-id="${esc(n.id)}" data-shape="mm-topic" tabindex="-1" role="img" aria-label="${esc(n.aria)}"><title>${esc(n.label)}</title>`
      + `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.root ? 12 : 9}" class="n-mask"/><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.root ? 12 : 9}" class="n-body" fill="transparent" stroke="${c}"${n.root ? ' stroke-width="2"' : ''}/>`
      + `<text text-anchor="middle" class="n-label mm-text" fill="var(--um-text)" style="font:${S.wt} ${S.px}px var(--um-sans)" data-o="${esc(n.id)}" data-t="nl">${text}</text>${hint}</g>`; },
};

/* ---- validators (§7.2). Each problem: { level, rule, path, message, ids } ---- */
const MM_RULES = {
  'mindmap-root': 'a view shows one tree: exactly one shown topic has no shown ancestor; each further one is drawn as its own tree under the first',
  'topic-parent': 'a topic\'s parent is a topic',
  'side-first': 'present.<id>.side is left or right, on a first-level topic; anywhere else it is ignored',
  'mindmap-depth': `a tree is at most ${MM_DEEP} levels deep: a deeper topic is drawn, but a Mermaid reader writes it at level ${MM_DEEP}`,
};
function mmProblems(model, view) {
  const out = [], V = mmView(model, view); if (!MM_OBJ(model) || !V) return out;
  const vi = MM_ARR(model.views).indexOf(V), at = `views[${vi}]`, X = mmIndex(model, V), q = id => `"${id}"`;
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids, message: `${rule}: ${msg}` });
  MM_ARR(model.nodes).forEach((n, i) => { if (!MM_OBJ(n) || n.type !== MM_T || n.parent == null || X.topic(n.parent)) return;
    say('error', 'topic-parent', `nodes[${i}].parent`, [n.id], `topic ${q(n.id)}'s parent ${JSON.stringify(n.parent)} is not a topic`); });
  X.roots.slice(1).forEach(r => say('warning', 'mindmap-root', `${at}.nodeIds[${X.pos.get(r)}]`, [X.roots[0], r], `view ${V.id} shows a second root, ${q(r)}, besides ${q(X.roots[0])}: drawn as its own tree under the first`));
  Object.keys(X.P).forEach(id => { const s = MM_OBJ(X.P[id]) ? X.P[id].side : undefined; if (s === undefined || !X.shown.has(id)) return;
    if (s !== 'left' && s !== 'right') say('warning', 'side-first', `${at}.present.${id}.side`, [id], `${q(id)}'s side ${JSON.stringify(s)} is not left or right: ignored`);
    else if (X.depth.get(id) !== 1) say('warning', 'side-first', `${at}.present.${id}.side`, [id], `${q(id)} is not a first-level topic: its side is ignored, it follows its branch`); });
  const deep = X.ids.filter(id => X.depth.get(id) === MM_DEEP);
  if (deep.length) say('warning', 'mindmap-depth', at, deep, `${deep.map(q).join(', ')} ${deep.length === 1 ? 'is' : 'are'} on level ${MM_DEEP + 1}, deeper than ${MM_DEEP} levels: drawn, but a Mermaid reader writes ${deep.length === 1 ? 'it' : 'them'} at level ${MM_DEEP}`);
  return out;
}

/* ---- describe(): the trees as indented outlines, in the reading order (each root, its right branches, then its left) ---- */
function mmDescribe(model, viewId) {
  const V = MM_ARR(model && model.views).find(x => MM_OBJ(x) && x.id === viewId); if (!V) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const g = mmRun(model, V), trees = g.nodes.filter(n => n.root).length;
  return [`${V.title || V.id}: a mindmap of ${mmPlural(g.nodes.length, 'topic')}${trees > 1 ? ` in ${trees} trees` : ''}.`,
    ...g.order.map(id => { const n = g.byId[id]; return '  '.repeat(n.depth) + n.label.replace(/\s+/g, ' ').trim() + (n.opens ? ` (opens ${n.opens})` : ''); })].join('\n');
}

/* the PDF's word and rows (§7.1): a topic's depth and its parent */
function mmRows(model, view, id) {
  const V = mmView(model, view); if (!V) return null; const X = mmIndex(model, V); if (!X.shown.has(id)) return null;
  const p = X.hung.has(id) ? X.hung.get(id) : X.up(id); return [`Depth ${X.depth.get(id) ?? 0}`, p == null ? 'The root' : `Under ${mmOne(X.N.get(p))}`];
}

/* ---- the gesture hooks (§7.3). Each takes the model and the view (or its id) and returns the commands of one transaction,
   { commands, say }, null to leave the gesture to the canvas, or { error } for the hint line ---- */
function mmNewId(model, label) { // from the topic's words, as the Mermaid reader takes one: base, base-2, base-3…
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'topic';
  if (!used.has(b)) return b; let k = 2; while (used.has(`${b}-${k}`)) k++; return `${b}-${k}`;
}
// the last place in nodeIds of a topic and its shown descendants, leaving out skip's branch
function mmEnd(X, id, skip) {
  let k = X.pos.get(id); for (const s = [id]; s.length;) X.kids.get(s.pop()).forEach(c => { if (c !== skip) { k = Math.max(k, X.pos.get(c)); s.push(c); } });
  return k;
}
const mmAfter = (X, V, id, k) => { const i = X.pos.get(id), j = i <= k ? k : k + 1; return j === i ? [] : [{ op: 'move', id, view: V.id, index: j }]; }; // just after what is at k now
const mmBefore = (X, V, id, b) => { const i = X.pos.get(id), j = i < b ? b - 1 : b; return j === i ? [] : [{ op: 'move', id, view: V.id, index: j }]; };
const mmSide = (V, id, value) => ({ op: 'set', view: V.id, path: ['present', id, 'side'], value });
// what the picture shows of the first-level topics' sides, set where no side is given, so a move does not swing the others
const mmPins = (X, V, g, but) => g.nodes.filter(n => n.depth === 1 && n.id !== but && !X.side(n.id)).map(n => mmSide(V, n.id, n.side));
const mmUnside = (X, V, id) => (MM_OBJ(X.P[id]) && X.P[id].side !== undefined ? [mmSide(V, id, undefined)] : []);
// T goes under a topic other than the root: its side, if given, goes; a first-level T pins the other branches, as the demote does
const mmLeave = (X, V, g, T) => [...(T.depth === 1 ? mmPins(X, V, g, T.id) : []), ...mmUnside(X, V, T.id)];
const mmInside = (X, id, of) => { for (let p = of; p != null; p = X.up(p)) if (p === id) return true; return false; }; // of is id or under it
const mmGeo = (model, V, at) => (MM_OBJ(at && at.geo) && at.geo.mm ? at.geo : mmRun(model, V)); // the canvas's, as measured in the host's font

/* add(model, view, entry, label, at): a child of the topic selected (the root when none), after its parent's last shown
   descendant; with no topic shown, a root */
function mmAdd(model, view, entry, label, at) {
  const V = mmView(model, view); if (!V || !MM_OBJ(entry) || entry.type !== MM_T) return null;
  const X = mmIndex(model, V), text = String(label ?? '').trim(); if (!text) return mmErr('a topic needs its text: type it');
  const p = [...MM_ARR(MM_OBJ(at) && at.sel)].reverse().find(id => X.shown.has(id)) ?? X.roots[0] ?? X.ids[0] ?? null;
  const element = { id: mmNewId(model, text), type: MM_T, label: text, ...(p != null ? { parent: p } : {}) };
  return [{ op: 'add', element, view: V.id, ...(p != null ? { index: mmEnd(X, p) + 1 } : {}) }];
}

/* moveTo(model, view, id, at): Alt + arrows ({ by }) or a drop ({ pt }, the dropped topic's centre) */
function mmMoveTo(model, view, id, at) {
  const V = mmView(model, view); if (!V || !MM_OBJ(at)) return null;
  const X = mmIndex(model, V); if (!X.shown.has(id)) return null;
  const g = mmGeo(model, V, at), T = g.byId[id]; if (!T) return null;
  if (Array.isArray(at.by)) return mmKeyMove(X, V, g, T, at.by);
  if (Array.isArray(at.pt)) return mmDrop(X, V, g, T, at.pt);
  return null;
}
// the siblings T is drawn among, top to bottom: a first-level topic's on its side
const mmSibs = (X, g, T) => (T.depth === 1 ? g.nodes.filter(n => n.depth === 1 && n.parent === T.parent && n.side === T.side).map(n => n.id) : X.kids.get(T.parent) || []);
function mmKeyMove(X, V, g, T, [dx, dy]) {
  const id = T.id, name = mmOne(X.N.get(id));
  if (T.depth === 0) return mmErr(`${name} is the root: it stays where it is; Alt + arrows move the topics around it`);
  const sibs = mmSibs(X, g, T), i = sibs.indexOf(id), pins = T.depth === 1 ? mmPins(X, V, g, null) : [];
  if (dy && !dx) { const o = sibs[i + Math.sign(dy)]; if (o == null) return [];
    const mv = dy < 0 ? mmBefore(X, V, id, X.pos.get(o)) : mmAfter(X, V, id, X.pos.get(o)); return [...pins, ...mv]; }
  if (!dx || dy) return null;
  const inward = (T.side === 'right') === (dx < 0);
  if (T.depth === 1 && inward) return [...mmPins(X, V, g, id), mmSide(V, id, T.side === 'right' ? 'left' : 'right')]; // across the root
  if (inward) { const P = T.parent, G = X.up(P), was = g.byId[P]; // promote: under its grandparent, after its old parent
    return [...(was.depth === 1 ? [...mmPins(X, V, g, null), mmSide(V, id, was.side)] : []), { op: 'reparent', id, parent: G }, ...mmAfter(X, V, id, mmEnd(X, P, id))]; }
  const S = sibs[i - 1]; if (S == null) return mmErr(`No topic above ${name} to move it into`); // demote: into the sibling before it, last
  return [...mmLeave(X, V, g, T), { op: 'reparent', id, parent: S }, ...mmAfter(X, V, id, mmEnd(X, S, id))];
}
function mmDrop(X, V, g, T, [x, y]) {
  const id = T.id, hit = g.nodes.find(n => n.id !== id && x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
  if (hit) {
    if (mmInside(X, id, hit.id)) return mmErr('A topic cannot go under one of its own subtopics');
    if (hit.root && T.depth === 1 && hit.id === T.parent) { const s = x < hit.x + hit.w / 2 ? 'left' : 'right'; // the root's other half: the other side
      return s === T.side ? [] : [...mmPins(X, V, g, id), mmSide(V, id, s)]; }
    if (hit.id === T.parent) return [];
    const top = hit.root ? [...mmPins(X, V, g, id), mmSide(V, id, x < hit.x + hit.w / 2 ? 'left' : 'right')] : mmLeave(X, V, g, T);
    return [...top, { op: 'reparent', id, parent: hit.id }, ...mmAfter(X, V, id, mmEnd(X, hit.id, id))];
  }
  // between two siblings drawn one above the other: the gap between their boxes, across both
  for (const P of g.nodes) { const kids = P.root ? ['right', 'left'].map(s => g.nodes.filter(n => n.parent === P.id && n.side === s)) : [MM_ARR(X.kids.get(P.id)).map(k => g.byId[k])];
    for (const list of kids) for (let k = 1; k < list.length; k++) { const a = list[k - 1], b = list[k];
      if (y < a.y + a.h || y > b.y || x < Math.min(a.x, b.x) || x > Math.max(a.x + a.w, b.x + b.w)) continue;
      if (a.id === id || b.id === id) return [];
      if (mmInside(X, id, P.id)) return mmErr('A topic cannot go under one of its own subtopics');
      const top = P.root ? [...mmPins(X, V, g, id), mmSide(V, id, a.side)] : mmLeave(X, V, g, T);
      return [...top, ...(P.id !== T.parent ? [{ op: 'reparent', id, parent: P.id }] : []), ...mmBefore(X, V, id, X.pos.get(b.id))]; } }
  return mmErr('Drop a topic on another to move it under it, or between two topics to put it there');
}

/* remove(model, view, ids, fromModel): Delete hides each topic and its shown descendants (decision 15); Shift + Delete
   deletes it, and apply() takes its descendants. The hint line counts them */
function mmRemove(model, view, ids, fromModel) {
  const V = mmView(model, view); if (!V) return null;
  const X = mmIndex(model, V), mine = [...new Set(MM_ARR(ids))]; if (!mine.length || mine.some(id => !X.topic(id))) return null;
  const top = mine.filter(id => !mine.some(o => o !== id && (fromModel ? mmUnder(X, o, id) : mmInside(X, o, id)))); // one under another goes with it
  const said = (k, verb) => `${verb} ${top.map(id => mmOne(X.N.get(id))).join(', ')}${k ? ` and ${top.length === 1 ? 'its' : 'their'} ${mmPlural(k, 'subtopic')}` : ''}`;
  if (fromModel) { const all = mmAllKids(X), gone = new Set();
    top.forEach(r => { for (const s = [r]; s.length;) { const k = s.pop(); if (gone.has(k)) continue; gone.add(k); MM_ARR(all.get(k)).forEach(c => s.push(c)); } });
    return { commands: top.map(id => ({ op: 'delete', id })), say: said(gone.size - top.length, 'Deleted') }; }
  const hide = []; top.filter(id => X.shown.has(id)).forEach(r => { for (const s = [r]; s.length;) { const k = s.pop(); hide.push(k); s.push(...X.kids.get(k)); } });
  if (!hide.length) return [];
  return { commands: hide.map(id => ({ op: 'hide', id, view: V.id })), say: `${said(hide.length - top.filter(id => X.shown.has(id)).length, 'Hid')}: the outline's Show, or undo, brings ${hide.length === 1 ? 'it' : 'them'} back` };
}
const mmAllKids = X => { const m = new Map(); X.N.forEach((n, id) => { const p = X.topic(id) && X.parentOf(id); if (p != null) (m.get(p) || m.set(p, []).get(p)).push(id); }); return m; };
const mmUnder = (X, id, of) => { for (let p = X.parentOf(of), seen = new Set(); p != null && !seen.has(p); seen.add(p), p = X.parentOf(p)) if (p === id) return true; return false; };

/* rename(model, view, id, text): F2, a topic's text */
function mmRename(model, view, id, text) {
  const V = mmView(model, view); if (!V) return null;
  const X = mmIndex(model, V); if (!X.topic(id)) return null;
  const s = String(text ?? '').trim(); if (!s) return mmErr('a topic needs its text');
  return [{ op: 'set', id, path: 'label', value: s }];
}
const mmConnect = () => mmErr('A mindmap has no lines; drop a topic on another to move it');

/* the outline's Show on a topic: the topic and the descendants hidden with it (under it through hidden topics only), in
   one transaction, after its nearest shown ancestor's last shown descendant; null where nothing is hidden under it */
function mmShow(model, view, id) {
  const V = mmView(model, view); if (!V) return null;
  const X = mmIndex(model, V); if (!X.topic(id) || X.shown.has(id)) return null;
  const all = mmAllKids(X), add = [], seen = new Set(); // seen: a parent cycle among the hidden ends the walk
  for (const s = [id]; s.length;) { const k = s.pop(); if (seen.has(k)) continue; seen.add(k); add.push(k); const c = MM_ARR(all.get(k)).filter(c => !X.shown.has(c)); for (let i = c.length - 1; i >= 0; i--) s.push(c[i]); }
  if (add.length === 1) return null;
  const list = [...MM_ARR(V.nodeIds)], u = X.up(id), k = u == null ? list.length : mmEnd(X, u) + 1;
  list.splice(k, 0, ...add);
  return { commands: [{ op: 'set', view: V.id, path: 'nodeIds', value: list }], say: `Showed ${mmOne(X.N.get(id))} and ${mmPlural(add.length - 1, 'subtopic')} hidden with it` };
}

/* ---- the type ---- */
const MM_TYPE = registerDiagramType('mindmap', {
  title: 'mindmap',
  elements: [{ type: MM_T, label: 'Topic' }],
  lines: [],
  layout: { run: mmRun, pins: false },
  draw: mmDraw,
  validate: mmProblems,
  rules: MM_RULES,
  describe: mmDescribe,
  word: () => 'Topic',
  rows: mmRows,
  edits: { connect: mmConnect, moveTo: mmMoveTo, add: mmAdd, remove: mmRemove, rename: mmRename },
});

// the outline's Show, on a mindmap topic, shows what was hidden with it (the canvas's Show adds the one id): heard on the
// way down, before the panel's own
const mmEdit = TYPED.edit;
TYPED.edit = (I, c) => { mmEdit(I, c);
  c.api.root.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.um-editor [data-show]');
    if (!b || c.def() !== MM_TYPE || !c.api.can('add')) return;
    const r = mmShow(c.model(), c.view(), b.dataset.show); if (!r) return;
    e.preventDefault(); e.stopPropagation(); I.ran(r); }, true); };

export { MM_TYPE, MM_RULES, MM_INK, mmIndex, mmSize, mmRun, mmDraw, mmProblems, mmDescribe, mmRows, mmAdd, mmMoveTo, mmRemove, mmRename, mmConnect, mmShow };
