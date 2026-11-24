import { leaveIssues, overlapIssues, routeAudit, throughIssues } from './audit.js';

/* The layout quality score (docs/diagrams/notes/layout-flow.md section 4.1): what a finished geometry draws well or badly,
   per view, as one number, lower better. Pure: no clock, no random choice, no DOM. The bench (bench/score.mjs) and the
   tests import it; tools/build.mjs leaves it out of lib/, so no host loads it. The weights a run uses are
   bench/score-weights.json's; WEIGHTS below are the same values, for a caller with no file. */
const WEIGHTS = Object.freeze({ hard: 1000, cross: 100, labels: 60, reverse: 40, straight: 30, moved: 200, length: 1 / 15, points: 12, area: 1 / 4e5 });

// the view types whose lines read as a flow (section 5.1): reverse counts on these only; structure, axis and tree types have none
const FLOW_TYPES = new Set(['map', 'flowchart', 'uml.activity', 'dfd', 'bpmn', 'aws', 'gcp', 'azure']);
const flowType = view => { const d = (view && view.diagram) || 'map'; return FLOW_TYPES.has(d) || d.startsWith('c4.'); };

// the model line a drawn line stands for (its first, when several are drawn as one): a model edge, or an object in the view's edges
function modelEdge(e, model, view) {
  const ids = e.ids || [...new Set((e.all || [e]).map(x => x._id).filter(Boolean))];
  const own = ((view && view.edges) || []).filter(x => x && typeof x === 'object'), all = [...own, ...((model && model.edges) || [])];
  for (const id of ids) { const m = all.find(x => x.id === id); if (m) return m; }
  return all.find(x => x.from === e.from && x.to === e.to) || null;
}

// a line's part in the flow (section 5.1): its `flow` field, else on a map its kind (`state` and `guard` are dependencies),
// else a flow line; a typed type's flowRole comes with section 12 step 9
function roleOf(e, model, view) {
  const m = modelEdge(e, model, view);
  if (m && ['main', 'branch', 'dep'].includes(m.flow)) return m.flow;
  if (e.flow && ['main', 'branch', 'dep'].includes(e.flow)) return e.flow;
  const map = !view || !view.diagram || view.diagram === 'map', k = e.wk || (m && m.kind);
  return map && (k === 'state' || k === 'guard') ? 'dep' : 'branch';
}

// a route's corners: points where it turns (a point on a straight run is none)
const corners = P => { let c = 0; for (let i = 1; i + 1 < P.length; i++) { const a = P[i - 1], b = P[i], d = P[i + 1];
  if ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]) !== 0) c++; } return c; };

// the main flow's lines, and its cards in order along them (a path from the card no main line comes into); a view with no
// main line has none. Until section 12 step 6 gives the layout its own main flow, the main lines are those marked `flow: "main"`
function mainFlowOf(g, model, view) {
  const lines = g.edges.filter(e => !e.back && roleOf(e, model, view) === 'main');
  if (!lines.length) return null;
  const next = new Map(), into = new Set(); lines.forEach(e => { if (!next.has(e.from)) next.set(e.from, e.to); into.add(e.to); });
  const first = lines.map(e => e.from).find(id => !into.has(id)) ?? lines[0].from, cards = [first], seen = new Set(cards);
  for (let id = next.get(first); id != null && !seen.has(id); id = next.get(id)) { cards.push(id); seen.add(id); }
  lines.forEach(e => [e.from, e.to].forEach(id => { if (!seen.has(id)) { seen.add(id); cards.push(id); } })); // a broken path: its other cards after
  return { lines, cards };
}

/* The metrics of one view's geometry g (as layout() returns it): hard, cross, labels, straight (null with no main flow),
   reverse (null on a type with no flow), and scoreGeo's length, points and area. o: { model, view, main } where main, if given,
   is { lines, cards } in place of the lines marked `flow: "main"`. */
function viewMetrics(g, o = {}) {
  const { model, view } = o, A = routeAudit(g, ''), count = re => A.filter(m => re.test(m)).length;
  const hard = count(/ share a line$/) + count(/ which it does not hold$/) + count(/^: families .* overlap$/)
    + overlapIssues(g, '').length + throughIssues(g.map ? { ...g, map: false } : g, '').length;
  const cross = count(/ cross$/);
  const labels = count(/^: label .* lies on edge /) + count(/^: label .* sits on the border of family /) + count(/^: name tag .* lies on edge /)
    + leaveIssues(g, '').length - (g.notDrawn || []).length;
  const down = !!g.down, at = n => down ? n.x + n.w / 2 : n.y + n.h / 2, along = n => down ? n.y + n.h / 2 : n.x + n.w / 2, byId = g.byId || Object.fromEntries(g.nodes.map(n => [n.id, n]));
  const main = o.main || mainFlowOf(g, model, view);
  let straight = null;
  if (main) { const rows = new Set(main.cards.map(id => byId[id]).filter(Boolean).map(n => Math.round(at(n))));
    straight = 2 * Math.max(0, rows.size - 1) + main.lines.reduce((a, e) => a + corners(e.pts), 0); }
  let reverse = null;
  if (flowType(view)) {
    const k = down ? 1 : 0;
    reverse = g.edges.filter(e => !e.back && roleOf(e, model, view) !== 'dep' && e.pts.some((p, i) => i && e.pts[i - 1][k] - p[k] > 8)).length;
    if (main) for (let i = 1; i < main.cards.length; i++) { const a = byId[main.cards[i - 1]], b = byId[main.cards[i]]; if (a && b && along(b) <= along(a)) reverse++; }
  }
  const length = g.edges.reduce((a, e) => a + e.pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - e.pts[i][0]) + Math.abs(p[1] - e.pts[i][1]), 0), 0);
  const points = g.edges.reduce((a, e) => a + e.pts.length, 0), area = g.bounds.w * g.bounds.h;
  return { hard, cross, labels, straight, reverse, length, points, area };
}

/* moved (section 4.1): of the cards drawn before and after an edit and not in `touched`, the share whose cell changed, and
   their mean shift in cells (a card's col and row, else its x and y in px). */
function moved(before, after, touched = []) {
  const t = new Set(touched), was = new Map(before.nodes.map(n => [n.id, n]));
  const cell = n => typeof n.col === 'number' && typeof n.row === 'number' ? [n.col, n.row] : [n.x, n.y];
  const both = after.nodes.filter(n => was.has(n.id) && !t.has(n.id));
  if (!both.length) return { share: 0, shift: 0, cards: 0 };
  let changed = 0, shift = 0;
  both.forEach(n => { const [a, b] = [cell(was.get(n.id)), cell(n)], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d > 1e-9) { changed++; shift += d; } });
  return { share: changed / both.length, shift: changed ? shift / changed : 0, cards: both.length };
}

// one view's score from its metrics (and moved's share, for an edit pair); a metric that is null counts nothing
function scoreView(m, w = WEIGHTS, movedShare = 0) {
  const v = k => m[k] || 0;
  const s = w.hard * v('hard') + w.cross * v('cross') + w.labels * v('labels') + w.reverse * v('reverse') + w.straight * v('straight')
    + w.moved * movedShare + w.length * v('length') + w.points * v('points') + w.area * v('area');
  return Math.round(s * 100) / 100;
}

export { WEIGHTS, FLOW_TYPES, roleOf, mainFlowOf, viewMetrics, moved, scoreView };
