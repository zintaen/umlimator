import { copyOf, migrate, unreadable, jsonText, labelOr } from '../core/model.js';
import { mapContext } from '../map/context.js';
import { cardMatcher, sequenceFromTrace } from '../map/insight.js';
import { interactionWalk } from './interaction.js';

/* ---------- helpers: a numbered view, a sequence view or a trace as a UML diagram (work package 3.7, notes/stage-3.md §7) ----------
   C7 keeps `render: "sequence"` a numbered view; these turn one into a UML diagram. Each returns { model, report }, the
   model a version-2 copy (the one passed in is not changed) and the report a reader's: [{ id, status, message }], status
   `skipped` or `approximated` (R1). Ids are derived (R3), never a source line's: a lifeline is <view>.<card>, a message
   <view>.m<n> by its place in the source's order, a connector <view>.<a>-<b>, each made unique by ~2, ~3 if it would repeat one; none contains "->" (M2). The new view
   (options.view, default <source>.sequence or <source>.communication; options.title) takes the place of the view with its
   id, with that view's lifelines and model messages and connectors that no other view lists, else comes last.
   - sequenceFromView(model, viewId, options): a numbered view as a uml.sequence view; its lines become calls in the
     order the core numbers them, and a hand-written `step` other than that number is reported.
   - communicationFromView(model, viewId, options): a numbered view or a uml.sequence view as a uml.communication view.
     options.operands { <fragment>: <operand> } picks each alt's operand (default its first); opt, loop and break are
     taken once, par's operands one after another (reported); interaction uses are left out (reported).
   - sequenceFromSpans(model, spans, options): a trace through sequenceFromTrace()'s numbered view (options.view, default
     "trace", replaced by the sequence view), so the bars follow rule 3; calls that overlapped are said in the caption.
   Internal (§7 (a)): in lib/umlimator-all.js with no export; the CLI and tests import this file. */

const CV_ARR = x => (Array.isArray(x) ? x : []), CV_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const cvId = s => String(s).replaceAll('->', '-'); // M2: a derived id never names a line by position
// ids made unique among those one helper derives (and `used`): <id>, else <id>~2, <id>~3, ... (card ids may hold '-' or be m<n>)
const cvFresh = (used = []) => { const seen = new Set(used); return want => { let s = want; for (let k = 2; seen.has(s); k++) s = `${want}~${k}`; seen.add(s); return s; }; };

function cvSource(model, viewId) {
  const D = copyOf(migrate(model) || {}), v = CV_ARR(D.views).find(x => CV_OBJ(x) && x.id === viewId);
  if (!v) throw new Error(`convert: the model has no view ${jsonText(viewId)}`);
  return { D, v };
}

// a numbered view's lines as calls of a sequence view `id`: { nodes (new lifelines), view, report }
function cvNumbered(model, v, id, title) {
  if (v.render !== 'sequence') throw new Error(`convert: view ${jsonText(v.id)} is not a numbered view (render: "sequence")`);
  const ctx = mapContext(model), lines = ctx.viewEdges(ctx.V[v.id]), report = [], fresh = cvFresh();
  const cards = [...CV_ARR(v.nodeIds).filter(c => ctx.N[c]), ...lines.flatMap(e => [e.from, e.to])].filter((c, k, a) => a.indexOf(c) === k);
  const lifeOf = new Map(cards.map(c => [c, fresh(`${id}.${cvId(c)}`)])), life = c => lifeOf.get(c);
  const boxes = new Map(CV_ARR(v.containers).filter(CV_OBJ).map(b => [b.id, b]));
  const nodes = cards.map(c => ({ id: life(c), type: 'uml.Lifeline', label: String((ctx.N[c] || boxes.get(c) || {}).label ?? c) }));
  const edges = lines.map((e, i) => { const m = fresh(`${id}.m${i + 1}`), text = [e.label, e.sublabel].filter(x => x != null && x !== '').map(String);
    if (e.step != null && String(e.step) !== String(i + 1)) report.push({ id: m, status: 'approximated', message: `line ${e._id} has step ${jsonText(e.step)}; it is step ${i + 1} in the view's order` });
    return { id: m, type: 'uml.Message', from: life(e.from), to: life(e.to), ...(text.length ? { label: text.length > 1 ? `${text[0]} (${text[1]})` : text[0] } : {}), props: { sort: 'call' } }; });
  return { nodes, report, view: { id, diagram: 'uml.sequence', title: title || labelOr(v.title, v.id), ...(v.caption ? { caption: v.caption } : {}),
    parent: v.parent ?? null, nodeIds: nodes.map(n => n.id), edges } };
}

// a sequence view as a communication view `id`: { edges (model edges: connectors, then messages), view, report }
function cvCommunication(model, v, id, options) {
  const w = interactionWalk(model, v), report = [], picks = CV_OBJ(options.operands) ? options.operands : {}, taken = new Set(), chosen = [];
  CV_ARR(v.fragments).filter(CV_OBJ).forEach(f => { const ops = CV_ARR(f.members).filter(CV_OBJ), op = CV_OBJ(f.props) ? f.props.operator : undefined;
    if (op !== 'alt') { ops.forEach(o => taken.add(o.id)); if (op === 'par') report.push({ id: f.id, status: 'approximated', message: `par ${f.id}'s operands are taken one after another` }); return; }
    const want = Object.hasOwn(picks, f.id) ? picks[f.id] : undefined; let pick = ops.find(o => o.id === want);
    if (want != null && !pick) report.push({ id: f.id, status: 'approximated', message: `alt ${f.id} has no operand ${jsonText(want)}: its first is taken` });
    pick = pick || ops[0]; if (pick) { taken.add(pick.id); if (ops.length > 1 && pick.label != null && pick.label !== '') chosen.push([f, String(pick.label)]); } });
  const inside = o => { for (let p = o.parent, seen = new Set(); p != null; p = w.ops.has(p) ? w.ops.get(p).fragment.parent : null) { if (!taken.has(p) || seen.has(p)) return false; seen.add(p); } return true; };
  const kept = w.occ.filter(o => { if (o.message) return inside(o);
    if (inside(o)) report.push({ id: o.id, status: 'skipped', message: `interaction use ${o.id} is left out` }); return false; });
  const fresh = cvFresh(CV_ARR(v.nodeIds)), ids = new Map(kept.map((o, k) => [o.id, fresh(`${id}.m${k + 1}`)])), links = new Map();
  const end = x => cvId(String(x).startsWith(id + '.') ? String(x).slice(id.length + 1) : x); // a lifeline this helper named: by its card
  const messages = kept.map(o => { const { parent, ...el } = o.el, props = { ...(CV_OBJ(el.props) ? el.props : {}) };
    if (props.replyTo != null) { if (ids.has(props.replyTo)) props.replyTo = ids.get(props.replyTo); else { delete props.replyTo;
      report.push({ id: ids.get(o.id), status: 'approximated', message: `${o.id} answers ${o.replyTo}, which is not taken: it names no call` }); } }
    const k = [o.from, o.to].sort().join('\n'); if (!links.has(k)) links.set(k, { id: fresh(`${id}.${end(o.from)}-${end(o.to)}`), type: 'uml.Connector', from: o.from, to: o.to });
    return { ...el, id: ids.get(o.id), props }; });
  const connectors = [...links.values()], title = options.title || [String(labelOr(v.title, v.id)), chosen.filter(([f]) => inside(f)).map(c => c[1]).join(', ')].filter(Boolean).join(': ');
  return { report, edges: [...connectors, ...messages], view: { id, diagram: 'uml.communication', title, ...(v.caption ? { caption: v.caption } : {}),
    parent: v.parent ?? null, nodeIds: [...CV_ARR(v.nodeIds)], edges: [...connectors, ...messages].map(e => e.id) } };
}

// the model with `view` in place of the view with its id (and what only that one listed), else last; schema version 2
function cvPlace(D, view, nodes = [], edges = []) {
  const views = CV_ARR(D.views), at = views.findIndex(x => CV_OBJ(x) && x.id === view.id), old = at < 0 ? null : views[at];
  const rest = views.filter((x, k) => k !== at).concat(view), lists = (key, id) => rest.some(x => CV_OBJ(x) && CV_ARR(x[key]).includes(id));
  const goneN = new Set(old ? CV_ARR(old.nodeIds).filter(n => !lists('nodeIds', n)) : []), goneE = new Set(old ? CV_ARR(old.edges).filter(e => typeof e === 'string' && !lists('edges', e)) : []);
  const newN = new Set(nodes.map(n => n.id)), newE = new Set(edges.map(e => e.id));
  D.nodes = [...CV_ARR(D.nodes).filter(n => !(CV_OBJ(n) && (newN.has(n.id) || (goneN.has(n.id) && n.type === 'uml.Lifeline')))), ...nodes];
  D.edges = [...CV_ARR(D.edges).filter(e => !(CV_OBJ(e) && (newE.has(e.id) || (goneE.has(e.id) && ['uml.Message', 'uml.Connector'].includes(e.type))))), ...edges];
  D.views = at < 0 ? [...views, view] : views.map((x, k) => (k === at ? view : x));
  D.schemaVersion = 2;
  return D;
}

function sequenceFromView(model, viewId, options = {}) {
  const { D, v } = cvSource(model, viewId), r = cvNumbered(D, v, String(options.view ?? `${viewId}.sequence`), options.title);
  return { model: cvPlace(D, r.view, r.nodes), report: r.report };
}

function communicationFromView(model, viewId, options = {}) {
  const { D, v } = cvSource(model, viewId), id = String(options.view ?? `${viewId}.communication`);
  if (v.diagram === 'uml.sequence') { const r = cvCommunication(D, v, id, options);
    // the lifelines the sequence view holds as its own (view.nodes) go with it: the new view's own when it takes the view's
    // place, else the model's, which both views then list (a card's id is the model's once, audit 24)
    const own = CV_ARR(v.nodes).filter(n => CV_OBJ(n) && n.type === 'uml.Lifeline' && CV_ARR(v.nodeIds).includes(n.id) && !CV_ARR(D.nodes).some(x => CV_OBJ(x) && x.id === n.id));
    if (own.length && id === v.id) r.view.nodes = own;
    else if (own.length) { v.nodes = CV_ARR(v.nodes).filter(n => !own.includes(n)); if (!v.nodes.length) delete v.nodes; }
    return { model: cvPlace(D, r.view, id === v.id ? [] : own, r.edges), report: r.report }; }
  const s = cvNumbered(D, v, id, options.title), r = cvCommunication(D, s.view, id, { title: s.view.title });
  return { model: cvPlace(D, r.view, s.nodes, r.edges), report: [...s.report, ...r.report] };
}

// how many of a trace's calls between cards overlapped one that is neither inside nor around it (as sequenceFromTrace reads them)
function cvOverlaps(model, spans, match) {
  const cards = [...CV_ARR(model && model.nodes), ...CV_ARR(model && model.views).flatMap(v => CV_ARR(v && v.nodes))].filter(n => n && n.id != null);
  const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end)), span = new Map(list.map(s => [String(s.id), s]));
  const cardOf = cardMatcher(cards, match), up = s => (s.parent != null ? span.get(String(s.parent)) : null);
  const calls = list.filter(s => { const to = cardOf(s.service), p = up(s), from = p && cardOf(p.service); return to && from && from !== to; });
  if (calls.length < 2) return 0;
  // the parent links as a forest, each loop of them one node (its spans are all above each other), numbered in depth-first
  // order: a span's relatives above and below are then the ones whose range [pre, last] holds its own or sits inside it, the
  // rest end before it starts (last < pre) or start after it ends (pre > last). The calls sorted by end, the calls that start
  // before each one ends go into two max-of-end trees, one by pre and one by last, so each call asks two ranges for one that
  // ends after it starts: n log n where a pairwise test with a walk up the parents took n³ on a deep chain (audit 65)
  const ns = [...new Set(list)], ix = new Map(ns.map((s, i) => [s, i])), N = ns.length, par = ns.map(s => { const p = up(s); return p ? ix.get(p) : -1; });
  const rep = ns.map((_, i) => i), loop = new Uint8Array(N), state = new Uint8Array(N), kids = ns.map(() => []), roots = [];
  for (let i = 0; i < N; i++) {
    const path = []; let j = i;
    while (j >= 0 && !state[j]) { state[j] = 1; path.push(j); j = par[j]; }
    if (j >= 0 && state[j] === 1) { loop[j] = 1; for (let k = path.length - 1; path[k] !== j; k--) rep[path[k]] = j; } // a new loop, from j round to it
    for (const k of path) state[k] = 2;
  }
  for (let i = 0; i < N; i++) if (rep[i] === i) (loop[i] || par[i] < 0 ? roots : kids[rep[par[i]]]).push(i);
  const pre = new Int32Array(N), last = new Int32Array(N); let t = 0;
  for (const r of roots) for (const st = [r]; st.length;) { const x = st.pop(); if (x < 0) { last[~x] = t - 1; continue; } pre[x] = t++; st.push(~x); for (const k of kids[x]) st.push(k); }
  const byPre = new Float64Array(t + 1).fill(-Infinity), byLast = new Float64Array(t + 1).fill(-Infinity);
  const put = (f, i, v) => { for (i++; i <= t; i += i & -i) if (f[i] < v) f[i] = v; }, most = (f, i) => { let m = -Infinity; for (i++; i > 0; i -= i & -i) if (f[i] > m) m = f[i]; return m; };
  const cs = calls.map(s => { const k = rep[ix.get(s)]; return { s: +s.start, e: +s.end, p: pre[k], l: last[k] }; }), starts = [...cs].sort((a, b) => a.s - b.s);
  let n = 0, j = 0;
  for (const a of cs.sort((a, b) => a.e - b.e)) {
    for (; j < starts.length && starts[j].s < a.e; j++) { put(byPre, t - 1 - starts[j].p, starts[j].e); put(byLast, starts[j].l, starts[j].e); }
    if (most(byPre, t - 2 - a.l) > a.s || most(byLast, a.p - 1) > a.s) n++;
  }
  return n;
}

function sequenceFromSpans(model, spans, options = {}) {
  // read as sequenceFromTrace() reads them: no text String() throws on, and match a table by name (audit 21)
  const match = options && options.match; [model, spans, options] = [model, [].concat(spans || []), { ...options, match: null }].map(x => unreadable(x).model); options.match = match;
  const id = String(options.view ?? 'trace'), M = migrate(model), was = CV_ARR(M.views).find(x => CV_OBJ(x) && x.id === id && x.diagram === 'uml.sequence');
  const m = sequenceFromTrace(M, spans, { ...options, view: id }), r = sequenceFromView(m, id, { ...options, view: id });
  // the UML sequence view replaced takes its lifelines and model messages and connectors with it, those no view of the result
  // lists, as cvPlace says: sequenceFromTrace has put a map view in its place first, so cvPlace saw none of them (audit 25)
  if (was) { const lists = key => new Set(CV_ARR(r.model.views).flatMap(x => (CV_OBJ(x) ? CV_ARR(x[key]) : [])));
    const ns = lists('nodeIds'), es = lists('edges'), goneN = new Set(CV_ARR(was.nodeIds).filter(x => !ns.has(x))), goneE = new Set(CV_ARR(was.edges).filter(x => typeof x === 'string' && !es.has(x)));
    r.model.nodes = CV_ARR(r.model.nodes).filter(x => !(CV_OBJ(x) && x.type === 'uml.Lifeline' && goneN.has(x.id)));
    r.model.edges = CV_ARR(r.model.edges).filter(x => !(CV_OBJ(x) && ['uml.Message', 'uml.Connector'].includes(x.type) && goneE.has(x.id))); }
  const n = cvOverlaps(model, spans, options.match), v = r.model.views.find(x => x.id === id);
  if (n) v.caption = `${v.caption ? v.caption + ' ' : ''}${n} calls overlapped in the trace and are drawn one after another.`;
  return r;
}

export { sequenceFromView, communicationFromView, sequenceFromSpans };
