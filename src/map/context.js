import { esc, fit, measured, sansW, textW } from '../core/text.js';
import { migrate } from '../core/model.js';
import { diagramOf } from '../core/registry.js';
import { held, warn } from '../core/warn.js';
import { noteOf, r2 } from '../draw/shapes.js';
import { svgOf } from '../draw/svg.js';
import { leaveIssues, routeAudit } from '../layout/audit.js';
import { layoutGraph, pillW, pullSources, rowsFor, untangle } from '../layout/layered.js';
import { WIRES, badgesOf, mapNodeW } from './cards.js';
import { markOf } from './diff.js';
import { plainViews } from './typed.js';
import { arrOf, rules } from './validate.js';


/* Swimlanes for run-order views. A view may set `lanes` ([{title, nodeIds}] or false); otherwise a
   sequence view is read step by step and each part is filed under the first workflow phase its own
   label (then the step's label, then its sub line) names. Phases only move forward, so a lane is a
   contiguous stretch of the run order. Fewer than three lanes, or a lane layout that would need a
   crossing, falls back to the free graph. */
const PHASES = [
  ['Ask', /\b(grill|ask|interview|question|intake|taste|intent|clarif)/i],
  ['Plan', /\b(plan|spec\b|scope|claim|triage|ticket|backlog)/i],
  ['Build', /\b(build|implement|launch|scaffold|develop)/i],
  ['Check', /\b(check|review|detect|shots?\b|screenshot|audit|test|qa\b|verif|critique|lint|scan|grade)/i],
  ['Fix', /\b(fix|polish|refine|repair|patch|rework)/i],
  ['Finish', /\b(pr\b|pull request|merge|ship|publish|release|deploy|human|ledger|manifest|report)/i],
];
function phaseOf(texts) {
  for (const t of texts) {
    let best = null;
    PHASES.forEach((p, i) => { const m = p[1].exec(String(t || '')); if (m && (!best || m.index < best[1])) best = [i, m.index]; });
    if (best) return best[0];
  }
  return null;
}

/* ================= map: one model, many views =================
   Viewer UX ported in spirit from archify (MIT): camera with reading depths, minimap, node focus,
   node finder, export. Drill-down views, swimlanes, breadcrumbs and deep links are super-board's /visual. */

// every model edge gets an id for events: its own, else "<from>-><to>#<n>" (n: its place among edges with the same ends)
function edgeIds(list) {
  const seen = {};
  (list || []).forEach(e => { if (!e || typeof e !== 'object') return; const k = e.from + '->' + e.to, n = seen[k] = (seen[k] ?? -1) + 1; e._id = e.id != null ? String(e.id) : `${k}#${n}`; });
}

/* The model's views and everything that lays one out. Works on its own copy of the model, needs no DOM. */
function mapContext(model, opts = {}) {
  const D = structuredClone(migrate(model) || {}); // a newer schemaVersion throws: drawn wrongly otherwise (F6)
  plainViews(D); // typed views of a diagram this release does not draw: plain cards
  const M = opts.measure || null, withM = f => (...a) => measured(M, () => f(...a));
  edgeIds(D.edges); (D.views || []).forEach(v => { if (Array.isArray(v.edges)) edgeIds(v.edges); });
  const views = (D.views || []).filter(v => v && v.id);
  const nodes = [...(D.nodes || []), ...views.flatMap(v => v.nodes || [])];
  const N = Object.fromEntries(nodes.map(n => [n.id, n]));
  const V = Object.fromEntries(views.map(v => [v.id, v]));
  const viewOfParent = p => V[p] ? p : (views.find(v => v.id === p || v.node === p) || {}).id; // parent may name a node
  views.forEach(v => { if (v.parent) v.parent = viewOfParent(v.parent) || null; });
  const rootId = (D.root && V[D.root]) ? D.root : (views.find(v => !v.parent) || views[0] || {}).id;
  const nodeIn = (nid, vid) => ({ ...(N[nid] || {}), ...((V[vid] || {}).nodeOverrides || {})[nid] });
  const childOf = (nid, vid) => { const n = nodeIn(nid, vid); const o = n.view || n.opensView; return o && V[o] ? o : V[nid] ? nid : (views.find(v => v.node === nid) || {}).id; };
  const opensOf = (nid, vid) => { const n = nodeIn(nid, vid), o = childOf(nid, vid) || n.view || n.opensView; return o != null && String(o) !== vid ? String(o) : null; }; // loaded or not (#47)
  const subjectOf = v => v.node || (N[v.id] ? v.id : null);
  const viewsWith = nid => views.filter(v => (v.nodeIds || []).includes(nid));
  const kidsOf = id => views.filter(x => (x.parent || null) === id);
  const chain = vid => { const out = []; let c = V[vid]; const seen = new Set(); while (c && !seen.has(c.id)) { seen.add(c.id); out.unshift(c.id); c = V[c.parent]; } return out; };
  const viewEdges = v => { // an edge's ends are cards of the view or its containers
    const ids = new Set([...(v.nodeIds || []), ...(v.containers || []).map(c => c && c.id).filter(Boolean)]);
    const list = Array.isArray(v.edges) ? v.edges : (D.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
    return list.map(e => typeof e === 'string' ? (D.edges || []).find(x => x.id === e) : e).filter(e => e && ids.has(e.from) && ids.has(e.to));
  };
  /* ---------- reading order: every view runs left → right ----------
     The trigger sits at the far left; each next step or callee goes one column to the right, branches
     stack inside a column, state (board, config, repo) sits at the end of its column. A view whose
     focus node starts three or more things is a hub: its callees go into phase lanes, and one comb of
     lines feeds them — a single trunk, one split per lane, one short branch per callee with its label
     just left of the callee. A line that closes a loop is the only one allowed to run right to left. */
  const HUB_PHASES = [
    ['Prepare', /\b(grill|ask|interview|plan|spec|scope|shape|sharpen|ladder|docs?\b|reads?\b|design|picks?|init|triage|on-ramp|vocabular|idea|requires|climbs)/i],
    ['Build', /\b(build|implement|routes?|test|tdd|writes?|fix|diagnos|resolv|fetch|runs?\b|prototype|split|code|finds?|drafts?|bridges?|wires?)/i],
    ['Check', /\b(review|verif|proves?|audit|critique|judge|coverage|polish|humaniz|hunts?|checks?|grades?)/i],
    ['Hand off', /\b(pr\b|moves? card|files?\b|board|merges?|gate|closes?|bounces?|ships?|posts?|parks?|ticks|updates|backlog)/i],
  ];
  const latestPhase = texts => { for (const t of texts) { let best = null; HUB_PHASES.forEach((p, i) => { if (p[1].test(String(t || ''))) best = i; }); if (best != null) return best; } return null; };
  const isState = id => (N[id] || {}).kind === 'board';
  function loopsOf(v) { // edges that close a cycle, found depth-first in run order from the roots
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v), back = new Set(), st = {};
    edges.forEach((e, k) => { if (e.loop) back.add(k); }); // an edge marked `loop: true` is the view's loop back
    const dfs = u => { st[u] = 1; edges.forEach((e, k) => { if (e.from !== u || e.from === e.to || e.loop) return; if (st[e.to] === 1) back.add(k); else if (!st[e.to]) dfs(e.to); }); st[u] = 2; };
    [...ids.filter(i => !edges.some(e => e.to === i && e.from !== i && !e.loop)), ...ids].forEach(i => { if (!st[i]) dfs(i); });
    if (v.render === 'sequence') { // run order: a step back to a part an earlier step already reached loops back (state may be written again later)
      const first = {}; edges.forEach((e, k) => { if (first[e.from] == null && !edges.some((x, j) => j < k && x.to === e.from)) first[e.from] = -1; if (first[e.to] == null) first[e.to] = k; });
      edges.forEach((e, k) => { if (first[e.to] < k && !isState(e.to) && e.from !== e.to) back.add(k); });
    }
    return { edges, back, keys: new Set(edges.filter((e, k) => back.has(k)).map(e => e.from + '>' + e.to)) };
  }
  function deriveLanes(v, hub) { // sequence views: lanes named by workflow phase, in run order
    if (v.lanes === false) return null;
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v);
    if (Array.isArray(v.lanes)) {
      const lanes = v.lanes.map(l => ({ title: l.title || l.label || '', ids: (l.nodeIds || []).filter(i => ids.includes(i) && i !== hub) })).filter(l => l.ids.length);
      return lanes.length ? { lanes, explicit: true } : null;
    }
    if (v.render !== 'sequence' || edges.length < 4) return null;
    const lanes = [], laneOf = {}, pending = [];
    let curP = -1, named = 0, filed = 0;
    const file = (id, p) => {
      filed++; if (p != null) named++;
      if (p == null) { if (!lanes.length) { pending.push(id); return; } lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1; return; }
      if (p > curP) { curP = p; lanes.push({ title: PHASES[p][0], ids: [] }); }
      lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1;
    };
    edges.forEach(e => [e.from, e.to].forEach(id => {
      if (id === hub || laneOf[id] != null || pending.includes(id)) return;
      const n = N[id];
      file(id, phaseOf([n.label, id === e.to ? e.label : '', n.sublabel || n.sub]));
    }));
    if (lanes.length < 3 || lanes.length > 6 || named < filed * 0.6) return null; // lanes only when most parts name their phase
    lanes[0].ids.unshift(...pending);
    ids.forEach(i => { if (i !== hub && laneOf[i] == null && !pending.includes(i)) lanes[lanes.length - 1].ids.push(i); });
    return { lanes };
  }
  function hubPlan(v, hub, lp) {
    const ids = (v.nodeIds || []).filter(i => N[i] && i !== hub), seq = v.render === 'sequence';
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    const callees = []; lp.edges.forEach(e => { if (e.from === hub && e.to !== hub && !callees.includes(e.to)) callees.push(e.to); });
    const laneOf = {}; let titles = [], boxed = true;
    const dl = deriveLanes(v, hub);
    if (dl) { titles = dl.lanes.map(l => l.title); dl.lanes.forEach((l, i) => l.ids.forEach(id => { laneOf[id] = i; })); }
    else if (seq) { // run order, three to a column
      boxed = false;
      const stepOf = id => lp.edges.findIndex(e => e.from === hub && e.to === id) + 1;
      callees.forEach((id, k) => { laneOf[id] = Math.floor(k / 3); });
      for (let i = 0; i * 3 < callees.length; i++) { const grp = callees.slice(i * 3, i * 3 + 3).map(stepOf); titles.push(grp.length > 1 ? `Steps ${grp[0]}–${grp[grp.length - 1]}` : `Step ${grp[0]}`); }
    } else { // by the kind of work the line names; unnamed ones follow the previous callee
      let prev = 1;
      lp.edges.forEach(e => { if (e.from !== hub || laneOf[e.to] != null) return; const p = isState(e.to) ? 3 : latestPhase([condTag(e.label) ? 'routes' : e.label, N[e.to].label]); laneOf[e.to] = p == null ? prev : p; prev = laneOf[e.to]; });
      titles = HUB_PHASES.map(p => p[0]);
    }
    const raise = () => { for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || laneOf[e.from] == null) return; if (laneOf[e.to] == null || laneOf[e.to] < laneOf[e.from]) laneOf[e.to] = laneOf[e.from]; }); };
    raise();
    ids.forEach(i => { if (laneOf[i] == null) { const t = fwd.filter(e => e.from === i && laneOf[e.to] != null).map(e => laneOf[e.to]); laneOf[i] = t.length ? Math.min(...t) : 0; } });
    if (!dl && !seq) { const last = Math.max(...ids.map(i => laneOf[i])); ids.forEach(i => { if (isState(i)) laneOf[i] = Math.max(laneOf[i], last); }); raise(); }
    const used = [...new Set(ids.map(i => laneOf[i]))].sort((a, b) => a - b);
    // branches: hub → callee is drawn unless the callee already has another line coming in
    const branch = new Set(callees.filter(c => !isState(c) && !lp.edges.some(e => e.to === c && e.from !== hub)));
    const sub = {}; ids.forEach(i => { sub[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || e.to === hub) return; if (laneOf[e.from] === laneOf[e.to] && sub[e.to] < sub[e.from] + 1) sub[e.to] = Math.min(3, sub[e.from] + 1); });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id); return k < 0 ? 999 + lp.edges.findIndex(e => e.from === id) : k; };
    const lanes = used.map(u => {
      const mine = ids.filter(i => laneOf[i] === u), nCols = Math.max(...mine.map(i => sub[i])) + 1;
      const cols = Array.from({ length: nCols }, (_, j) => mine.filter(i => sub[i] === j)
        .sort((a, b) => (branch.has(b) - branch.has(a)) || (isState(a) - isState(b)) || (seen(a) - seen(b))));
      return { title: titles[u] || `Lane ${u + 1}`, ids: mine, cols };
    });
    return { lanes, branch, boxed: boxed && lanes.length > 1 };
  }
  /* a hub plan made stable against the one before it: a card that was there keeps its lane (by title), column and
     order; a new card takes its place in the fresh plan, after the cards already in that column */
  function keepHub(P, Q) {
    const at = {}; Q.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { at[id] = { t: L.title, j, r }; })));
    const titles = Q.lanes.map(L => L.title);
    P.lanes.forEach((L, i) => { if (titles.includes(L.title)) return; const before = P.lanes.slice(0, i).map(x => x.title).filter(t => titles.includes(t)).pop();
      titles.splice(before == null ? 0 : titles.indexOf(before) + 1, 0, L.title); });
    const lanes = titles.map(title => ({ title, ids: [], cols: [] })), lane = Object.fromEntries(lanes.map(L => [L.title, L]));
    const put = (id, t, j, r) => { const L = lane[t]; L.ids.push(id); (L.cols[j] ||= []).push([r, id]); };
    P.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { const a = at[id]; if (a) put(id, a.t, a.j, a.r); else put(id, L.title, j, 1e6 + r); })));
    lanes.forEach(L => { L.cols = L.cols.filter(c => c && c.length).map(c => c.sort((a, b) => a[0] - b[0]).map(x => x[1])); });
    const out = lanes.filter(L => L.ids.length);
    return { ...P, lanes: out, boxed: Q.boxed && out.length > 1 };
  }
  const planCache = {};
  function planOf(vid) {
    if (vid in planCache) return planCache[vid];
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v);
    const outs = id => lp.edges.filter(e => e.from === id && e.to !== id).length;
    let hub = subjectOf(v); if (hub && !ids.includes(hub)) hub = null;
    const sources = ids.filter(i => outs(i) && !lp.edges.some(e => e.to === i && e.from !== i));
    if (!hub && lp.edges.length && outs(lp.edges[0].from) >= 3 && sources.length === 1 && /^(public|lane|verb|external)$/.test(N[lp.edges[0].from]?.kind || '')) hub = lp.edges[0].from; // one trigger only; an overview with several stays a flow
    if (hub && outs(hub) < 3) hub = null;
    const steps = {}; if (v.render === 'sequence') lp.edges.forEach((e, i) => { (steps[e.to] ||= []).push(i + 1); });
    const flow = { flow: true, backKeys: lp.keys, steps, hub: null };
    if (!hub || v.containers || v.mainSteps || v.render === 'process') return (planCache[vid] = flow);
    planCache[vid] = { ...hubPlan(v, hub, lp), hub, backKeys: lp.keys, steps };
    const was = opts.prev && opts.prev[vid]; // after an update: cards keep the lane, column and order they had
    if (was && was.hub === hub && was.lanes) return (planCache[vid] = keepHub(planCache[vid], was));
    // a hub plan that cannot route cleanly gives way to the plain left-to-right flow, if that does better
    const bad = g => routeAudit(g, '').length + ((g.stats.cross || 0) + (g.stats.fallback || 0)) * 5;
    let hb = bad(buildGeo(vid, undefined, undefined, true));
    if (hb) { // try other orders inside each lane column before giving up on the hub layout
      const P0 = planCache[vid]; let evals = 0;
      for (let pass = 0; pass < 2 && hb && evals < 80; pass++) P0.lanes.forEach(L => L.cols.forEach(col => {
        for (let a = 0; a < col.length && hb && evals < 80; a++) for (let b = a + 1; b < col.length && hb && evals < 80; b++) {
          if (P0.branch.has(col[a]) !== P0.branch.has(col[b])) continue;
          [col[a], col[b]] = [col[b], col[a]]; evals++;
          const nb = bad(buildGeo(vid, undefined, undefined, true)); if (nb < hb) hb = nb; else [col[a], col[b]] = [col[b], col[a]];
        }
      }));
    }
    if (hb) { const keep = planCache[vid]; planCache[vid] = flow; const fb = bad(buildGeo(vid, undefined, undefined, true)); if (fb >= hb) planCache[vid] = keep; }
    return planCache[vid];
  }
  /* a layout may place only some cards: they keep their slots, the rest take their auto-layout slot or the next free
     row below it (a complete layout is used as it is) */
  function fillLayout(vid, L) {
    const ids = (V[vid].nodeIds || []).filter(i => N[i]);
    if (ids.every(i => Array.isArray(L[i]))) return L;
    const auto = autoPos(vid), out = {};
    ids.forEach(i => { if (Array.isArray(L[i])) out[i] = L[i]; });
    ids.forEach(i => { if (out[i]) return; let [c, r] = auto[i] || [0, 0]; while (Object.values(out).some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1)) r++; out[i] = [c, r]; }); // auto rows may be half rows: a row apart
    return out;
  }
  /* plain views: longest-path columns from the roots, state at the bottom of its column */
  /* views with containers: each container is a block in columns of its own, its cards in call order inside it; blocks (and
     cards in no container) run left to right by the lines between them, and those with no line between them stack in the
     same columns. A nested container is a block inside its parent's.
     A box is laid out three times (#86): by the lines inside it, as before; then each of its cards level with the cards its
     lines come from and go to outside it too, where the pass before put them; then ordered by those lines as well. Its far
     ends are items at their rows, in a column before its first (a line from the left) or after its last. A box's cards were
     placed by its own lines alone, so a box fed from outside, and the lines that pass it, ran into the cards beside it. */
  function blockPos(vid) {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v), boxes = (v.containers || []).filter(c => c && c.id);
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to), byBox = Object.fromEntries(boxes.map(b => [b.id, b]));
    const home = Object.fromEntries(ids.map(i => [i, (boxes.filter(b => (b.nodeIds || []).includes(i)).pop() || {}).id ?? null])); // the box a card is drawn in
    const up = x => ids.includes(x) ? home[x] : byBox[x] && byBox[byBox[x].parent] ? byBox[x].parent : null; // the box a card or box sits in
    const itemIn = (x, g) => { for (let k = 0; x != null && k < 64; k++, x = up(x)) if (up(x) === g) return x; }; // what in group g holds x
    const holds = (x, y) => { for (let k = 0; y != null && k < 64; k++, y = up(y)) if (y === x) return true; return false; };
    const first = x => { const k = lp.edges.findIndex(e => holds(x, e.from) || holds(x, e.to)); return k < 0 ? Infinity : k; };
    const sink = x => ids.includes(x) && isState(x) && !fwd.some(e => e.from === x); // state that leads nowhere goes last
    const lined = x => lp.edges.some(e => e.from !== e.to && (holds(x, e.from) || holds(x, e.to)));
    let was = {}, now = {}; // each box as the pass before laid it out, and as this one does
    const block = (g, P, order) => { // a group's cards at [col, row] from its top left, and its size in slots; P: where the pass before put each card
      const all = [...ids.filter(i => home[i] === g), ...boxes.filter(b => up(b.id) === g).map(b => b.id)];
      // cards with no line go in rows of their own under the group's columns, as under a plain view (#46): at the bottom of
      // their box, or under the view; they stacked in the first column with the sources
      const loose = all.some(lined) ? all.filter(x => ids.includes(x) && !lined(x)) : [], items = all.filter(x => !loose.includes(x)), size = {}, out = {};
      items.forEach(x => { size[x] = ids.includes(x) ? { w: 1, h: 1, pos: { [x]: [0, 0] } } : block(x, P, order); out[x] = []; });
      fwd.forEach(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g); if (a !== undefined && b !== undefined && a !== b && !out[a].includes(b)) out[a].push(b); });
      const st = {}, dag = [], into = new Set(Object.values(out).flat()); // lines that close a loop do not order the blocks
      const dfs = u => { st[u] = 1; out[u].forEach(w => { if (st[w] === 1) return; dag.push([u, w]); if (!st[w]) dfs(w); }); st[u] = 2; };
      [...items.filter(x => !into.has(x)), ...items].forEach(x => { if (!st[x]) dfs(x); });
      const rank = Object.fromEntries(items.map(x => [x, 0]));
      for (let it = 0; it < items.length; it++) dag.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) rank[b] = rank[a] + 1; });
      const cols = [], pos = {}; let c0 = 0, h = 0;
      items.forEach(x => (cols[rank[x]] ||= []).push(x));
      const main = cols.map(l => (l || []).filter(x => !sink(x)).sort((a, b) => first(a) - first(b)));
      const inside = (x, id) => ids.includes(x) ? 0 : (size[x].pos[id] || [0, null])[1]; // the row of a box's card that a line meets
      const dagged = new Set(dag.map(([a, b]) => a + '\u0000' + b)), lines = fwd.map(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g);
        return a !== undefined && b !== undefined && a !== b ? { e, link: [a, b, inside(a, e.from), inside(b, e.to)] } : null; }).filter(Boolean);
      // the box's lines to cards outside it (#86): each far end at its row from the box's top, where the pass before put both.
      // ponytail: three passes, so a far end that moves in the last one is followed where it was, and a far end in the card's
      // own column, or a line to a box, places nothing; passes until nothing moves, if a map needs them
      const far = [], fixed = Object.create(null), top = P && g != null && was[g] ? Object.keys(was[g].pos).map(c => P[c] && P[c][1] - was[g].pos[c][1]).find(r => r != null) : null;
      if (top != null) fwd.forEach(e => { const fin = holds(g, e.from); if (fin === holds(g, e.to)) return;
        const [mine, other] = fin ? [e.from, e.to] : [e.to, e.from], x = itemIn(mine, g), p = P[mine], q = P[other]; if (x === undefined || !p || !q || p[0] === q[0]) return;
        const id = '\u0002' + far.length, left = q[0] < p[0]; fixed[id] = q[1] - top;
        far.push({ e, id, left, link: left ? [id, x, 0, inside(x, mine)] : [x, id, inside(x, mine), 0] }); });
      const L = far.filter(f => f.left).map(f => f.id), R = far.filter(f => !f.left).map(f => f.id), M = [...(L.length ? [L] : []), ...main, ...(R.length ? [R] : [])];
      const hh = x => size[x] ? size[x].h : 1;
      untangle(M, [...lines.filter(l => dagged.has(l.link[0] + '\u0000' + l.link[1])), ...(order ? far : [])].map(l => l.link), hh, fixed); // in call order, unless another order crosses less (#53)
      main.splice(0, main.length, ...M.slice(L.length ? 1 : 0, M.length - (R.length ? 1 : 0)));
      const row = rowsFor(M, [...lines, ...far].filter(l => level(l.e)).map(l => l.link), hh, fixed); // each block level with the cards its lines come from and go to
      main.forEach((l, k) => { cols[k] = [...l, ...(cols[k] || []).filter(sink).sort((a, b) => first(a) - first(b))]; });
      cols.forEach(list => { let r0 = 0, w = 0;
        list.forEach(x => { const sz = size[x]; if (row[x] != null) r0 = Math.max(r0, row[x]);
          Object.entries(sz.pos).forEach(([id, [c, r]]) => { pos[id] = [c0 + c, r0 + r]; }); r0 += sz.h; w = Math.max(w, sz.w); });
        c0 += w; h = Math.max(h, r0); });
      const per = Math.max(2, c0); loose.forEach((x, k) => { pos[x] = [k % per, h + Math.floor(k / per)]; });
      if (loose.length) { c0 = Math.max(c0, Math.min(per, loose.length)); h += Math.ceil(loose.length / per); }
      return (now[g] = { w: c0, h, pos });
    };
    let P = block(null).pos;
    for (const order of [false, true]) { was = now; now = {}; P = block(null, P, order).pos; } // levelled by the lines from outside, then ordered by them too
    return P;
  }
  // a typed view whose type lays it out (1.9): the plain flow's ranking, with the lines the type turns round for it
  const ownLayout = vid => { if (D.schemaVersion !== 2) return null; const T = diagramOf(V[vid]); return T && T.layout && (T.layout.run || typeof T.layout === 'function') ? T : null; }; // version 1: a map
  const autoPos = vid => ownLayout(vid) ? flowPos(vid, { flip: ownLayout(vid).rankFlip }) : ((V[vid] || {}).containers || []).length ? blockPos(vid) : bestFlow(vid);
  const memos = opts.memos || Object.create(null); // per view, layoutTyped's memo, kept across update()s: an edit that moves nothing lays out nothing
  const level = e => !/^(top|bottom)$/.test(e.fromSide) && !/^(top|bottom)$/.test(e.toSide); // a line into a card's top or bottom asks for no row
  /* A small plain view is routed a few ways and keeps the one the layout check scores best: cards level with their
     neighbours, or packed from the top as before, with cards no line comes into beside their callee or not. A cheap
     version of the CLI's search (optimize), affordable up to 30 cards; a larger view takes the first way. */
  function bestFlow(vid) {
    const first = flowPos(vid), n = ((V[vid] || {}).nodeIds || []).length;
    if (n > 30 || n < 3) return first;
    const seen = new Set([JSON.stringify(first)]), ways = [first];
    for (const o of [{ pull: true }, { packed: true }, { pull: true, packed: true }]) { const p = flowPos(vid, o), k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); ways.push(p); } }
    if (ways.length < 2) return first;
    let best = first, score = Infinity;
    scouting = true; ways.forEach(p => { const g = buildGeo(vid, p), s = scoreGeo(g); if (s < score - 0.5) { score = s; best = p; drawn[vid] = { pos: p, g }; } }); scouting = false; // as it will be drawn: with port repair
    if (fanIn(vid)) delete drawn[vid];
    return best;
  }
  let scouting = false;
  const fanIn = vid => { const k = {}; return viewEdges(V[vid] || {}).some(e => e.from !== e.to && (k[e.to] = (k[e.to] || 0) + 1) >= 6); };
  const drawn = {}; // the way bestFlow kept, routed already: the view's next buildGeo takes it once instead of routing it again
  function flowPos(vid, o = {}) {
    const v = o.flip ? { ...V[vid], edges: viewEdges(V[vid]).map(e => o.flip(e) ? { ...e, from: e.to, to: e.from } : e) } : V[vid];
    const lp = loopsOf(v), fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    // cards with no line go in rows of their own under the view (#46), as wide as its columns; they stacked with the sources
    const all = (v.nodeIds || []).filter(i => N[i]), lined = new Set(lp.edges.filter(e => e.from !== e.to).flatMap(e => [e.from, e.to]));
    const loose = lined.size ? all.filter(i => !lined.has(i)) : [], ids = all.filter(i => !loose.includes(i));
    const rank = Object.create(null); ids.forEach(i => { rank[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (rank[e.to] < rank[e.from] + 1) rank[e.to] = rank[e.from] + 1; });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id || e.from === id); return k < 0 ? 999 : k; };
    const sink = i => isState(i) && !fwd.some(e => e.from === i); // state that leads nowhere sits along the bottom
    const pos = Object.create(null), links = fwd.map(e => [e.from, e.to]);
    const order = rk => { const cols = {}; ids.forEach(i => (cols[rk[i]] ||= []).push(i));
      const ranks = Object.keys(cols).map(Number).sort((a, b) => a - b), mains = ranks.map(c => cols[c].filter(i => !sink(i)).sort((a, b) => seen(a) - seen(b)));
      untangle(mains, links); return { cols, ranks, mains }; }; // in reading order, unless another order crosses less (#53)
    const { cols, ranks, mains } = order((o.pull && pullSources(ids, links, rank)) || rank);
    const row = o.packed ? Object.fromEntries(mains.flatMap(m => m.map((i, r) => [i, r]))) : rowsFor(mains, fwd.filter(level).map(e => [e.from, e.to]));
    const height = Math.max(0, ...Object.values(row)) + 1;
    Object.entries(cols).forEach(([c, list]) => {
      const main = mains[ranks.indexOf(+c)], st = list.filter(sink).sort((a, b) => seen(a) - seen(b));
      main.forEach(i => { pos[i] = [+c, row[i]]; });
      st.forEach((i, r) => { pos[i] = [+c, height + r]; }); // state along the bottom, never above the flow
    });
    const per = Math.max(2, Object.keys(cols).length), under = Math.max(...Object.values(pos).map(p => p[1])) + 1;
    loose.forEach((i, k) => { pos[i] = [k % per, under + Math.floor(k / per)]; });
    return pos;
  }

  function buildView(vid, opts = {}) {
    const g = buildGeo(vid);
    return { g, ...drawView(vid, g, opts) };
  }
  // a view's notation (0.15.0): its own `shapes`, else the model's, else box; drawView: the picture of a geometry in one,
  // with no layout (a change of notation draws the cards again and nothing else)
  const notationOf = vid => noteOf((V[vid] || {}).shapes) || noteOf(D.shapes) || 'box';
  function drawView(vid, g, opts = {}) {
    const v = V[vid], shapes = noteOf(opts.shapes) || notationOf(vid), T = ownLayout(vid);
    return { markup: svgOf(g, { title: v.title, subject: subjectOf(v), icons: D.icons, broken: brokenIn(vid), ...opts, shapes, ...(T && T.draw && T.draw(g, { esc, r2, textW })) }), shapes };
  }
  // the rules a view's lines break (#70), by model edge id: svgOf draws such a line rose, with a mark that names them
  let ruled = null;
  const brokenIn = vid => {
    if (!arrOf(D.rules).length) return null;
    const by = {}, title = id => { const r = D.rules.find(x => x && x.id === id); return String((r && (r.title || r.id)) ?? id); };
    (ruled ||= rules(D)).forEach(b => { if (b.view === vid) b.targets.forEach(t => { if (t.type === 'edge') t.ids.forEach(i => { const l = by[i] ||= []; if (!l.includes(title(b.rule))) l.push(title(b.rule)); }); }); });
    return Object.keys(by).length ? by : null;
  };
  const layoutCache = Object.create(null); // M3
  // the cards a card opens: its inner view's, else the count the host gives for one it has not loaded (opensCount)
  const kidCount = (nid, vid) => { const c = childOf(nid, vid), k = c && c !== vid ? (V[c].nodeIds || []).length : 0, n = +nodeIn(nid, vid).opensCount;
    return k || (opensOf(nid, vid) && n > 0 ? Math.floor(n) : 0); };
  // a line's kind: the first one its edges name (#45); else a hook's line is a guard and a board's is state; else, only where
  // a legend says what the colours mean (the standalone page, or a view's kindsFromLabels), a guess from the label's words
  const wireKind = (e, words) => { const t = N[e.to] || {}, f = N[e.from] || {}, l = String(e.label || '');
    const named = (e.all || [e]).map(x => x.kind).find(k => WIRES.some(w => w[0] === k)); if (named) return named;
    if (f.kind === 'hook') return 'guard';
    if (t.kind === 'board' || f.kind === 'board' || words && /\b(reads?|writes? config|saves?|records?|appends?)\b/i.test(l)) return 'state';
    if (t.kind === 'hook' || words && /\b(trigger|fires|suggests?|offers?|requires|wires)/i.test(l)) return 'triggers';
    if (words && /\b(feeds?|hands? off|routes?|passes|returns|bounces|then)\b/i.test(l)) return 'feeds';
    return 'calls'; };
  function prepEdges(vid, edges, backKeys) {
    const par = {}; // parallel edges between one pair read as one edge listing every relation
    const merged = edges.filter(e => { const k = e.from + '>' + e.to + ((V[vid] || {}).keepPairs ? '#' + e.id : ''), m = par[k]; if (!m) { par[k] = e; e.all = [e]; return true; } m.all.push(e); return false; })
      .map(e => e.all.length < 2 ? e : { ...e, label: (e.label || '') + ' +' + (e.all.length - 1), when: e.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n') });
    const out = merged.map(e => ({ ...e, back: !(V[vid] || {}).keepPairs && backKeys && backKeys.has(e.from + '>' + e.to) }));
    const pair = {}; // A→B plus B→A reads as one two-way edge
    return out.filter(e => { const r = !(V[vid] || {}).keepPairs && pair[e.to + '>' + e.from]; if (r) { r.both = true; r.back = false; r.all = [...(r.all || [r]), ...(e.all || [e])]; if (e.label && e.label !== r.label) r.label = (r.label ? r.label + ' / ' : '') + e.label;
      if (r.all.some(x => x.step != null)) r.when = r.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n'); else if (e.when) r.when = [r.when, e.when].filter(Boolean).join(' · '); return false; } pair[e.from + '>' + e.to] = e; return true; })
      .map(e => { const all = e.all || [e], subs = [...new Set(all.map(x => x.sublabel).filter(x => x != null && x !== '').map(String))];
        return { ...e, wk: wireKind(e, opts.kinds || (V[vid] || {}).kindsFromLabels), weight: Math.max(...all.map(x => [2, 3].includes(+x.weight) ? +x.weight : 1)), sublabel: subs.join(' / ') || undefined, ...markOf(all) }; });
  }
  const condTag = l => { const m = /^(?:routes|on-ramp:?)\s+(\S+)$/i.exec(String(l || '').trim()); return m ? m[1] : null; }; // "routes bug" → a "bug" tag
  // quick: a candidate the layout searches below score and may drop, laid out once, as it was before 0.6.0 (no room for lines
  // with no route, no way round the cards for them, no warning)
  function buildGeo(vid, override, repair = (V[vid] || {}).repair !== false, quick = false) { // a view's repair: false turns port repair off
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), T = ownLayout(vid);
    if (T) { // the type's layout (registry.js), in the host's measure (R2)
      const L = T.layout, memo = memos[vid] ||= {}, k = !override && L.key ? L.key(D, v) : null;
      if (k != null && memo.runKey === k) return memo.runGeo;
      const pos = override || (v.layout && L.pins !== false ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid)));
      const g = L.run ? L.run(D, v, { measure: M, pos, memo }) : L({ model: D, view: v, pos, memo });
      if (k != null) Object.assign(memo, { runKey: k, runGeo: g });
      return g;
    }
    const edges = viewEdges(v).map(e => ({ ...e }));
    if (v.render === 'sequence') edges.forEach((e, i) => { e.step = i + 1; });
    const P = planCache[vid] || { flow: true, backKeys: loopsOf(v).keys, steps: {} };
    if (!override && P.hub) return hubGeo(vid, P, edges, repair, quick);
    const pos = override || (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid)));
    const ready = drawn[vid]; delete drawn[vid]; if (ready && !override && ready.pos === pos && repair === (v.repair !== false) && !quick) return ready.g;
    const mainSteps = v.mainSteps || v.render === 'process';
    const stepIds = v.stepIds || ids;
    const dg = { nodeH: mainSteps ? 82 : v.subAndChips ? 80 : 64, subAndChips: !!v.subAndChips, mainSteps, containers: v.containers, nodes: ids.map(i => { const n = nodeIn(i, vid), step = mainSteps && stepIds.includes(i); return { ...n, sub: n.sub || n.sublabel, emphasis: !!step || !!n.emphasis, step: step ? stepIds.indexOf(i) + 1 : (v.cardSteps || {})[i] || null, verbs: step ? [] : n.verbs, kids: kidCount(i, vid), opens: !!opensOf(i, vid), col: (pos[i] || [0, 0])[0], row: (pos[i] || [0, 0])[1] }; }),
      edges: prepEdges(vid, edges, P.backKeys) };
    dg.authors = D.authors; dg.fan = !scouting; dg.repair = repair; dg.intake = v.intake; dg.tour = v.tour; dg.gap = v.gap; dg.rgap = v.rgap; dg.quick = quick;
    return layoutGraph(dg, true);
  }
  function hubGeo(vid, P, edges, repair, quick) {
    const NH = V[vid].subAndChips ? 80 : 64, CG = 108, RG = 44, pitch = NH + RG, hub = P.hub;
    const all = P.lanes.flatMap(l => l.ids).concat(hub);
    const widths = Object.fromEntries(all.map(i => [i, mapNodeW(nodeIn(i, vid))]));
    const nodeW = widths[hub];
    const stepTxt = id => { const s = (P.steps || {})[id] || []; return s.length > 2 ? s[0] + '+' : s.join('·'); };
    const nodesOut = [{ ...nodeIn(hub, vid), sub: nodeIn(hub, vid).sub || nodeIn(hub, vid).sublabel, kids: kidCount(hub, vid), opens: !!opensOf(hub, vid), ax: 0, ay: 0, w: nodeW, h: NH }];
    const lanes = [], blocks = [], spine = [];
    let x = nodeW + CG, maxRows = 1;
    const rowAt = {};
    P.lanes.forEach((L, li) => {
      const x0 = x; spine[li] = x0 - CG + 28;
      const SUBG = 54; // columns inside a lane carry no branch labels, so they sit closer
      L.cols.forEach((col, j) => {
        const colW = Math.max(...col.map(id => widths[id]));
        const taken = new Set();
        col.forEach((id, r) => { // a follow-on part lines up with the part that leads to it
          let row = r;
          if (j > 0) { const src = edges.find(e => e.to === id && rowAt[e.from] != null && P.lanes[li].ids.includes(e.from)); row = src ? rowAt[src.from] : r; while (taken.has(row)) row++; }
          taken.add(row); rowAt[id] = row; maxRows = Math.max(maxRows, row + 1);
          nodesOut.push({ ...nodeIn(id, vid), sub: nodeIn(id, vid).sub || nodeIn(id, vid).sublabel, kids: kidCount(id, vid), opens: !!opensOf(id, vid), ax: x, ay: row * pitch, w: widths[id], h: NH, lane: li, step: stepTxt(id) });
        });
        x += colW + (j < L.cols.length - 1 ? SUBG : CG);
      });
      const right = x - CG + 16;
      const lx = P.boxed ? x0 - CG + 40 : x0 - 12, lw = P.boxed ? right - lx : right - 4 - lx;
      lanes.push({ title: L.title, ids: L.ids, x: lx, y: -62, w: lw, h: 0, gap: 24, bare: !P.boxed });
      const hx = P.boxed ? lx : x0 - 12;
      blocks.push({ x: hx + 12, y: -52, w: Math.min(lw - 24, 34 + sansW(L.title, 11, .95) + 8 + textW('00 parts', 11)), h: 22, title: L.title });
      if (P.boxed && li < P.lanes.length - 1) blocks.push({ x: lx + lw + 4, y: -48, w: 16, h: 18, title: L.title + ' → next' });
    });
    lanes.forEach(l => { l.h = maxRows * pitch - RG + 30 + 62; });
    // the comb: trunk from the hub, a spine per lane, a branch into each callee with its label at the end
    const yh = NH / 2, yt = -24, hubR = nodeW, byIdLocal = Object.fromEntries(nodesOut.map(n => [n.id, n]));
    const comb = [], others = [];
    const prepared = prepEdges(vid, edges.filter(e => e.from !== hub || P.branch.has(e.to)), P.backKeys);
    prepared.forEach(e => {
      if (e.from !== hub) return others.push(e);
      const c = byIdLocal[e.to]; if (!c) return;
      const li = c.lane, xs = spine[li], yc = c.ay + NH / 2;
      let pts = li === 0 ? [[hubR, yh], [xs, yh], [xs, yc], [c.ax, yc]] : [[hubR, yh], [spine[0], yh], [spine[0], yt], [xs, yt], [xs, yc], [c.ax, yc]];
      pts = pts.filter((p, k) => !k || p[0] !== pts[k - 1][0] || p[1] !== pts[k - 1][1]);
      pts = pts.filter((p, k) => k === 0 || k === pts.length - 1 || !((pts[k - 1][0] === p[0] && p[0] === pts[k + 1][0]) || (pts[k - 1][1] === p[1] && p[1] === pts[k + 1][1])));
      const tag = condTag(e.label), avail = c.ax - 26 - (xs + 10);
      const text = avail >= 44 ? fit(tag || e.label || '', 10.5, Math.max(30, avail - 20) / .92) : '', sub = text && e.sublabel ? fit(e.sublabel, 9.5, Math.max(30, avail - 20) / .92) : '';
      const w = Math.min(avail, pillW(text, sub)), h = sub ? 32 : 20;
      e.fixed = pts; e.lbl = text ? { x: c.ax - 26 - w, y: yc - h / 2, w, h, text, ...(sub ? { sub } : {}), step: null, tag: !!tag } : null;
      comb.push(e);
    });
    return layoutGraph({ nodeH: NH, subAndChips: !!V[vid].subAndChips, abs: true, nodes: nodesOut, edges: [...comb, ...others], lanes, blocks, laneGap: 24, repair, hub, tour: V[vid].tour, authors: D.authors, quick }, true);
  }
  /* crossing-minimising local search over rows and sides; `visual.py render` bakes the result into the page */
  function scoreGeo(g) {
    const bad = routeAudit(g, '').length, len = g.edges.reduce((a, e) => a + e.pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - e.pts[i][0]) + Math.abs(p[1] - e.pts[i][1]), 0), 0);
    const bends = g.edges.reduce((a, e) => a + e.pts.length, 0), drop = g.edges.filter(e => e.label && !e.lbl).length;
    return bad * 1000 + ((g.stats.cross || 0) + (g.stats.fallback || 0)) * 150 + drop * 40 + len / 15 + bends * 12 + g.bounds.w * g.bounds.h / 4e5;
  }
  function optimize(vid, budget = 160) {
    budget = Math.max(budget, Math.min(400, 20 * (V[vid].nodeIds || []).length));
    const t0 = performance.now(); let wall = 4000; // per-view time box, extended while problems remain
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]);
    let pos = JSON.parse(JSON.stringify(autoPos(vid)));
    const start = JSON.stringify(pos), boxed = (v.containers || []).length, homeOf = i => ((v.containers || []).filter(c => (c.nodeIds || []).includes(i)).pop() || {}).id; // blocks stay whole
    const lined = new Set(viewEdges(v).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), loose = i => lined.size && !lined.has(i);
    let best = scoreGeo(buildGeo(vid, pos, false, true)), evals = 1;
    const hub = subjectOf(v), hubCol = hub && pos[hub] ? pos[hub][0] : null;
    const tryPos = cand => { evals++; const s = scoreGeo(buildGeo(vid, cand, false, true)); if (s < best - 0.5) { best = s; pos = cand; return true; } return false; };
    let improved = true;
    while (improved && evals < budget * (best >= 1000 ? 2.5 : 1) && performance.now() - t0 < (best >= 1000 ? 12000 : wall)) {
      improved = false;
      for (const a of ids) {
        if (evals >= budget * (best >= 1000 ? 2.5 : 1) || performance.now() - t0 > (best >= 1000 ? 12000 : wall)) break;
        if (loose(a)) continue; // the row of cards with no line (#46) routes nothing
        const [ca, ra] = pos[a];
        const moves = [];
        // columns are the reading order, so only the order inside a column may change
        const band = i => isState(i) && !viewEdges(v).some(e => e.from === i);
        const stateFloor = () => Math.max(-1, ...ids.filter(i => !band(i) && !loose(i)).map(i => pos[i][1]));
        ids.forEach(b => { if (b !== a && !loose(b) && pos[b][0] === ca && band(a) === band(b) && (!boxed || homeOf(a) === homeOf(b))) moves.push(['swap', b]); });
        if (!boxed) moves.push(['row', -1], ['row', 1]);
        for (const [kind, arg] of moves) {
          if (evals >= budget) break;
          const c = JSON.parse(JSON.stringify(pos));
          if (kind === 'swap') { if (a === hub) continue; const t2 = c[a]; c[a] = c[arg]; c[arg] = t2; }
          else if (kind === 'col') { const nc = ca + arg; let r = ra; while (ids.some(b => b !== a && c[b][0] === nc && Math.abs(c[b][1] - r) < 1)) r++; c[a] = [nc, r]; }
          else if (kind === 'row') {
            let r = ra + arg;
            if (band(a) && r <= stateFloor()) r = stateFloor() + 1;
            while (ids.some(b => b !== a && c[b][0] === ca && Math.abs(c[b][1] - r) < 1)) r += arg > 0 ? 1 : -1; // rows may be half rows: keep a row apart
            if (r < 0 || (band(a) && r <= stateFloor())) continue;
            c[a][1] = r;
          }
          else { const nc = 2 * hubCol - ca; const occ = ids.find(b => c[b][0] === nc && c[b][1] === ra); if (occ) c[occ][0] = ca; c[a][0] = nc; }
          if (Math.min(...ids.map(i => c[i][0])) < 0) { const m = Math.min(...ids.map(i => c[i][0])); ids.forEach(i => { c[i][0] -= m; }); }
          if (tryPos(c)) { improved = true; break; }
        }
      }
    }
    // it scores without port repair: render()'s layout stays unless the one it found routes better as the page draws it (#86: for
    // r15's monorepo it baked in a crossing that render()'s layout has not)
    if (JSON.stringify(pos) !== start && scoreGeo(buildGeo(vid, JSON.parse(start))) <= scoreGeo(buildGeo(vid, pos))) pos = JSON.parse(start);
    return { pos, score: best, evals };
  }
  // what a view's picture is drawn from: an update keeps the layout of every view whose key did not change
  const viewKey = vid => {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), ns = ids.map(i => nodeIn(i, vid));
    const icons = [...new Set(ns.map(n => n.icon).filter(Boolean))].map(k => (D.icons || {})[k]), who = [...new Set(ns.map(n => n.author).filter(Boolean))].map(k => (D.authors || {})[k]);
    return JSON.stringify([{ ...v, shapes: undefined }, ns, viewEdges(v), ids.map(i => [kidCount(i, vid), opensOf(i, vid)]), icons, who]); // a view's notation lays nothing out
  };
  /* ---------- unfolding in place (#71): a stacked card opens into a box on the view it is on ----------
     The card becomes a box with its id and name, holding its inner view's own cards: those not on this view already (the
     inner view's other cards are this view's, its neighbours). Inside, the inner view's lines between them. This view's
     lines stay this view's: one to the card moves onto every card inside that the inner view joins to that neighbour, the
     same way round, or, with none, ends on the box's border; the inner view's other lines to neighbours are not added. The
     box is the inner view's own cards in their own order, at the card's place: later columns move right by its width, and
     the cards under it in its column move down by its height, so the rest of the picture keeps its places (a hub view, which
     has no columns, is laid out again). The inner view's boxes that hold its own cards come along inside, and a numbered
     (sequence) view's run order: its numbers, its loops back and its lanes (#82). Not in a numbered view: its own steps
     would be numbered again; that card opens. */
  // the inner view's own cards: those this view shows neither as cards nor as boxes (a card unfolded here already is one, #98)
  const ownOf = (v, C, nid) => (C.nodeIds || []).filter(i => N[i] && i !== nid && !(v.nodeIds || []).includes(i) && !(v.containers || []).some(b => b && b.id === i));
  const unfoldable = (nid, vid) => { const v = V[vid], ids = (v && v.nodeIds) || [], c = ids.includes(nid) && N[nid] && v.render !== 'sequence' ? childOf(nid, vid) : null;
    if (!c || c === vid || chain(vid).includes(c) || (v.containers || []).some(b => b && b.id === nid)) return null;
    return ownOf(v, V[c], nid).length ? c : null; };
  function unfold(vid, nid) {
    const v = V[vid], c = unfoldable(nid, vid); if (!c) return false;
    const C = V[c], outer = (v.nodeIds || []).filter(i => N[i]), inner = ownOf(v, C, nid);
    const n0 = nodeIn(nid, vid), holder = (v.containers || []).filter(b => b && (b.nodeIds || []).includes(nid)).pop();
    const boxes = (v.containers || []).filter(b => b && b.id).map(b => ({ ...b, nodeIds: (b.nodeIds || []).filter(i => i !== nid) }));
    const taken = new Set([...outer, ...inner, ...boxes.map(b => b.id)]);
    const cb = (C.containers || []).filter(b => b && b.id && !taken.has(b.id) && (b.nodeIds || []).some(i => inner.includes(i))), kept = new Set(cb.map(b => b.id));
    const above = b => { let p = b.parent; for (let k = 0; p != null && !kept.has(p) && k < 64; k++) p = ((C.containers || []).find(x => x && x.id === p) || {}).parent; return kept.has(p) ? p : nid; };
    // a numbered view drawn around one card (a hub) brings its lanes, boxed as it draws them, in their order (#82)
    const hp = C.render === 'sequence' && planOf(c).hub ? planOf(c) : null;
    const lanes = hp && hp.boxed ? hp.lanes.map((L, j) => ({ id: `${nid}:lane${j + 1}`, label: L.title, lane: true, nodeIds: L.ids.filter(i => inner.includes(i)), parent: nid })).filter(b => b.nodeIds.length) : [];
    const own = [...cb.map(b => ({ ...b, nodeIds: b.nodeIds.filter(i => inner.includes(i)), parent: above(b) })), ...lanes], boxed = new Set(own.flatMap(b => b.nodeIds));
    const box = { id: nid, label: n0.label || nid, nodeIds: inner.filter(i => !boxed.has(i)), unfolds: c, ...(holder ? { parent: holder.id } : {}), ...(badgesOf(n0).length ? { badges: badgesOf(n0) } : {}) };
    const isIn = id => inner.includes(id) || kept.has(id), mine = viewEdges(v);
    const to = new Set(mine.filter(e => e.to === nid).map(e => e.from)), from = new Set(mine.filter(e => e.from === nid).map(e => e.to)); // this view's neighbours of the card
    let theirs = viewEdges(C).filter(e => isIn(e.from) ? isIn(e.to) || from.has(e.to) : isIn(e.to) && to.has(e.from));
    // a line drawn both ways stays a pair: it moves inside only if the inner view joins that neighbour to one card both ways
    const ends = (a, out) => [...new Set(theirs.filter(e => out ? isIn(e.from) && e.to === a : e.from === a && isIn(e.to)).map(e => out ? e.from : e.to))].join();
    const split = new Set([...to].filter(a => from.has(a) && (ends(a, true) || ends(a, false)) && (ends(a, true) !== ends(a, false) || ends(a, true).includes(','))));
    theirs = theirs.filter(e => !split.has(isIn(e.from) ? e.to : e.from));
    /* a numbered view's run order comes along (#82): its lines keep their numbers, and a step back stays a loop back. A step
       between the card itself and a card inside has no line (the card is the box), and a hub's steps show on the cards they
       reach, as the numbered view draws them: those numbers go on that card inside. On a numbered card (a process view's
       step, or one an unfolded numbered view numbered) they go under its number: step 4's are 4.1, 4.2 */
    const tags = {}, onCard = e => e.from === nid ? e.to : e.to === nid ? e.from : hp && e.from === hp.hub ? e.to : null;
    const sid = v.stepIds || outer, at = (v.mainSteps || v.render === 'process') && sid.includes(nid) ? sid.indexOf(nid) + 1 : (v.cardSteps || {})[nid];
    const num = j => /^\d+(\.\d+)*$/.test(String(at ?? '')) ? `${at}.${j + 1}` : j + 1; // a card with several numbers (2·3) holds no one step
    if (C.render === 'sequence') { const lq = loopsOf(C);
      lq.edges.forEach((e, j) => { const o = onCard(e); if (inner.includes(o)) (tags[o] ||= []).push(num(j)); });
      theirs = theirs.map(e => { const j = lq.edges.indexOf(e); return { ...e, ...(inner.includes(onCard(e)) ? {} : { step: num(j) }), ...(lq.back.has(j) ? { loop: true } : {}) }; }); }
    const exact = new Set(theirs.flatMap(e => isIn(e.from) === isIn(e.to) ? [] : isIn(e.to) ? [e.from + '>'] : ['>' + e.to])); // neighbours the inner view joins to a card inside
    const k = (v.nodeIds || []).indexOf(nid), grid = !planOf(vid).hub;
    const pos = grid ? (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid))) : null;
    Object.assign(v, { nodeIds: [...v.nodeIds.slice(0, k), ...inner, ...v.nodeIds.slice(k + 1)], containers: [...boxes, box, ...own],
      edges: [...mine.filter(e => !(e.to === nid && exact.has(e.from + '>')) && !(e.from === nid && exact.has('>' + e.to))), ...theirs] });
    if ((v.tour || []).includes(nid)) delete v.tour;
    if (v.mainSteps || v.render === 'process') v.stepIds = v.stepIds || outer; // the steps keep their numbers; the cards inside are not steps
    if (Array.isArray(v.intake)) v.intake = v.intake.filter(s => s && s.to !== nid);
    if (+C.gap > (v.gap || 66)) v.gap = +C.gap; if (+C.rgap > (v.rgap || 44)) v.rgap = +C.rgap; // the room the inner view's lines were given
    Object.entries(tags).forEach(([i, s]) => { (v.cardSteps ||= {})[i] = s.length > 2 ? s[0] + '+' : s.join('·'); }); // as hubGeo's stepTxt; buildGeo draws them
    delete v.layout; delete planCache[vid]; delete layoutCache[vid]; delete drawn[vid];
    if (!grid) return true; // a hub view has no columns to keep: laid out again, with its boxes
    /* the box's slots: the inner view's own cards in its columns, or in this view's reading order, and in its rows packed,
       upside down, or each card level with its neighbours (the median row of the cards outside it joins to, and of those to
       its left inside, as rowsFor does). Each way is routed, and the one the layout check scores best is kept */
    const [xc, xr] = pos[nid] || [0, 0], seen = new Set(), ways = [], med = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const levelled = (ic, ir) => { const R = {}, cols = [...new Set(inner.map(ic))].sort((a, b) => a - b);
      cols.forEach(k => { const want = {}, col = inner.filter(i => ic(i) === k);
        col.forEach(i => { const nb = theirs.flatMap(e => e.from === i ? [e.to] : e.to === i ? [e.from] : []).map(o => !isIn(o) && pos[o] ? pos[o][1] - xr : R[o]).filter(r => r != null);
          want[i] = nb.length ? med(nb) : ir(i); });
        let prev = -1; col.sort((a, b) => want[a] - want[b] || ir(a) - ir(b)).forEach(i => { R[i] = prev = Math.max(0, Math.round(want[i]), prev + 1); }); });
      return i => R[i]; };
    // with boxes of its own, the inner view keeps its slots, moved to the box's corner: empty slots are its boxes' room. Else
    // its columns, or columns in this view's own reading order: a loop the inner view closes with one line may close here
    // with another, or not at all
    const inBox = (id, seen = new Set()) => seen.has(id) ? [] : (seen.add(id), [...((boxes.find(x => x.id === id) || {}).nodeIds || []), ...boxes.filter(k => k.parent === id).flatMap(k => inBox(k.id, seen))]);
    const xBoxes = new Set(); for (let b = holder, k = 0; b && k < 64; k++, b = boxes.find(x => x.id === b.parent)) xBoxes.add(b.id); // the boxes the card is in
    // a hub's slots, as it draws them: the hub, then its lanes' columns in order (#82). ponytail: rows in each column's order,
    // not level with the part before as hubGeo lines them up; do that if a lane of several columns reads badly
    const hs = hp && { [hp.hub]: [0, 0] };
    if (hs) hp.lanes.flatMap(L => L.cols).map(col => col.filter(i => inner.includes(i))).filter(col => col.length).forEach((col, j) => col.forEach((i, r) => { hs[i] = [j + 1, r]; }));
    const ip0 = hs || (C.layout ? fillLayout(c, C.layout) : (layoutCache[c] ||= autoPos(c))), lp = loopsOf(v), rk = Object.fromEntries(inner.map(i => [i, 0]));
    const fwd = lp.edges.filter((e, j) => !lp.back.has(j) && e.from !== e.to && inner.includes(e.from) && inner.includes(e.to));
    for (let it = 0; it < inner.length; it++) fwd.forEach(e => { if (rk[e.to] < rk[e.from] + 1) rk[e.to] = rk[e.from] + 1; });
    const one = own.length || v.nodeIds.length > 30; // its boxes' room to keep, or too big to route seven times: its own slots only
    // the sides the inner view gave its lines are for its own picture: with its own slots they stay; elsewhere each way is
    // also routed with the router picking them (copies, which keep the ids)
    const keepE = v.edges, freeE = theirs.some(e => e.fromSide || e.toSide) ? keepE.map(e => theirs.includes(e) && (e.fromSide || e.toSide) ? (({ fromSide, toSide, ...r }) => r)(e) : e) : null;
    [ip0, ...(one ? [] : [Object.fromEntries(inner.map(i => [i, [rk[i], (ip0[i] || [0, 0])[1]]]))])].forEach(ip => (one ? [false] : [false, true, 'level']).forEach(flip => {
      const at = (i, j) => (ip[i] || [0, 0])[j], rank = j => { const u = [...new Set(inner.map(i => at(i, j)))].sort((a, b) => flip === true && j ? b - a : a - b), lo = u[0];
        const k = j && u.some(r => r % 1) ? 2 : 1; // half rows doubled: a box that ends on a half row gets no gap under it (layoutPass widens whole rows)
        return own.length ? i => (at(i, j) - lo) * k : i => u.indexOf(at(i, j)); };
      const ic = rank(0), ir = flip === 'level' ? levelled(rank(0), rank(1)) : rank(1), w = Math.max(...inner.map(ic)) + 1, h = Math.max(...inner.map(ir)) + 1, L = {};
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + w - 1, r0] : Math.abs(c0 - xc) < .5 && r0 > xr ? [c0, r0 + h - 1] : [c0, r0]; });
      inner.forEach(i => { L[i] = [xc + ic(i), xr + ir(i)]; });
      // a box of this view with cards on both sides of the card's column, under it, would now reach into the unfolded box:
      // it moves down under it, whole; then a card on a taken slot moves down a row
      boxes.forEach(b => { if (xBoxes.has(b.id)) return; const ms = inBox(b.id).filter(i => L[i]); if (!ms.length) return;
        const cs = ms.map(i => L[i][0]), rs = ms.map(i => L[i][1]);
        if (Math.max(...cs) < xc || Math.min(...cs) > xc + w - 1 || Math.max(...rs) < xr || Math.min(...rs) > xr + h - 1) return;
        const dr = xr + h - Math.min(...rs); ms.forEach(i => { L[i] = [L[i][0], L[i][1] + dr]; }); });
      const slots = inner.map(i => L[i]); outer.forEach(i => { if (i === nid) return; let [c0, r0] = L[i];
        while (slots.some(([c1, r1]) => c1 === c0 && Math.abs(r1 - r0) < 1)) r0++; slots.push(L[i] = [c0, r0]); });
      const key = JSON.stringify(inner.map(i => L[i])); if (seen.has(key)) return; seen.add(key);
      ways.push({ L, free: false }); if (freeE && (ip !== ip0 || flip !== false)) ways.push({ L, free: true }); }));
    // a card inside a box it is not in reads as one of the box's (and loses a line to the box): a way with one loses
    const strays = g => (g.families || []).reduce((a, f) => a + g.nodes.filter(n => !(f.nodeIds || []).includes(n.id) && n.x + n.w / 2 > f.x && n.x + n.w / 2 < f.x + f.w && n.y + n.h / 2 > f.y && n.y + n.h / 2 < f.y + f.h
      && !(g.families || []).some(o => o.id !== f.id && (o.nodeIds || []).includes(n.id) && o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h)).length, 0);
    let best = null; // ponytail: up to 12 routings per unfold, a view of over 30 cards one; a smarter search when a bigger map needs it
    const score = ({ L, free }) => { v.edges = free ? freeE : keepE; const [g, said] = held(() => buildGeo(vid, L)); g.said = said;
      const s = scoreGeo(g) + (strays(g) * 5 + leaveIssues(g, '').length) * 1000; if (!best || s < best.s - .5) best = { L, g, s, free }; };
    ways.forEach(score);
    // still an issue, and cards under the card in its column: the box one column to the right instead, so they keep their slots
    if (best.s >= 1000 && v.nodeIds.length <= 30 && outer.some(i => i !== nid && pos[i] && Math.abs(pos[i][0] - xc) < .5)) { const B = best.L, L = {};
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + 1 + Math.max(...inner.map(j => B[j][0])) - xc, r0] : [c0, r0]; });
      inner.forEach(i => { L[i] = [B[i][0] + 1, B[i][1]]; }); score({ L, free: best.free }); }
    best.g.said.forEach(warn); delete best.g.said;
    v.edges = best.free ? freeE : keepE; v.layout = best.L; drawn[vid] = { pos: best.L, g: best.g }; // drawn as scored, without routing it again
    return true;
  }
  const unfolded = {}; // per view: the cards opts.expand named that did unfold, in order (one inside another unfolds after it)
  withM(() => Object.entries(opts.expand || {}).forEach(([vid, ids]) => { let todo = V[vid] ? [...new Set([].concat(ids || []))] : [];
    for (let more = true; more && todo.length;) { more = false; todo = todo.filter(nid => { if (!unfold(vid, nid)) return true; (unfolded[vid] ||= []).push(nid); return !(more = true); }); } }))();
  const geoCache = {};
  return { D, views, nodes, N, V, rootId, nodeIn, childOf, opensOf, subjectOf, viewsWith, kidsOf, chain, viewEdges, isState, planOf: withM(planOf), planCache,
    layoutCache, geoCache, memos, buildGeo: withM(buildGeo), buildView: withM(buildView), drawView: withM(drawView), notationOf, optimize: withM(optimize), flowPos, kidCount, viewKey, brokenIn, unfoldable, unfolded };
}

export { mapContext };
