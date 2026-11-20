import { copyOf, isGone, nameTable, unreadable, jsonText, labelOr, usedIds } from '../core/model.js';
import { diagramOf } from '../core/registry.js';
import { edgeRefIds } from './api.js';
import { mapContext } from './context.js';
import { KIND, kindOf } from './kinds.js';
import { WIRE_KINDS, andList, arrOf, liveIn, runSteps } from './validate.js';

/* ---------- paths(), reach(), describe() and otlpSpans(): a view's lines walked and put in words, with no DOM (#62, #64, #65) ----------
   A line runs from → to as the model gives it. Each result is a list of Refs a host can hand to highlight(); a line's Ref
   names one model edge (a drawn line that stands for several takes the strongest mark among them). */
// a version-2 view's type, when it is not drawn as a map: a view with no diagram, or "map", is walked as a map, its own
// lines with their labels, steps and latency (it was walked as drawn, by model line, which lost a view's own lines' fields)
const viewType = (model, viewId) => { const v = model && model.schemaVersion === 2 && arrOf(model.views).find(x => x && x.id === viewId);
  return v && v.diagram != null && v.diagram !== 'map' ? diagramOf(v) : null; };
// on the diff page's model, the model after's: a card, box or line diff() drew back removed is not walked or counted (audit 57);
// gone: a map sequence view's lines with the removed ones in their places, which describe() says as removed steps (audit 55)
function lineGraph(model, viewId) {
  const ctx = mapContext(model), v = ctx.V[viewId];
  if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const live = liveIn(ctx, v), ids = (v.nodeIds || []).filter(i => ctx.N[i] && live.card(i)), M = new Map(arrOf(ctx.D.edges).map(e => [e && e._id, e]));
  if (!viewType(model, viewId)) { const all = ctx.viewEdges(v).filter(e => e.from !== e.to); return { ctx, v, ids, edges: all.filter(live.line), gone: all }; }
  // a typed view: its lines as drawn (a port's between the cards it is on)
  const g = ctx.buildGeo(viewId), out = new Set(g.nodes.filter(n => isGone(n) || !live.card(n.id)).map(n => n.id)), ok = id => !out.has(id) && live.card(id);
  return { ctx, v, ids: [...new Set([...ids, ...g.nodes.map(n => n.id).filter(ok)])], edges: g.edges.flatMap(d => d.from === d.to || isGone(d) || !ok(d.from) || !ok(d.to) ? [] : edgeRefIds(d).map(_id => ({ ...M.get(_id), _id, from: d.from, to: d.to })).filter(e => !isGone(e))) };
}
// the model after a diff model stands for, as a type's own describe() reads it: what diff() drew back removed left out (a card,
// a member, a line or one to what went, a view's card taken out, its own lines, boxes and fragments), every other mark kept
// (audit 58: an ER, flowchart, DFD, C4 or information flow view counted and listed them). A model with nothing removed: as it is
function afterOf(model) {
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x), gone = new Set(), lost = new Set(); let any = false;
  const walk = x => { if (!obj(x)) return; if (isGone(x)) { any = true; if (typeof x.id === 'string') gone.add(x.id); } arrOf(x.members).forEach(walk); };
  arrOf(model.nodes).forEach(walk); arrOf(model.edges).forEach(e => { if (isGone(e)) { any = true; if (obj(e) && e.id != null) lost.add(String(e.id)); } });
  arrOf(model.views).forEach(v => { if (!obj(v)) return; arrOf(v.nodes).forEach(walk);
    if (obj(v.nodeOverrides) && Object.values(v.nodeOverrides).some(isGone)) any = true;
    if ([v.edges, v.containers, v.fragments].some(l => arrOf(l).some(isGone)) || v.diffMarks != null) any = true; });
  if (!any) return model;
  const keep = x => { if (!obj(x)) return x; return Array.isArray(x.members) ? { ...x, members: x.members.filter(m => !isGone(m)).map(keep) } : x; };
  const live = l => (Array.isArray(l) ? l.filter(x => !isGone(x)).map(keep) : l), endsOk = e => !obj(e) || (!gone.has(e.from) && !gone.has(e.to));
  const edges = Array.isArray(model.edges) ? model.edges.filter(e => !isGone(e) && endsOk(e)) : model.edges;
  arrOf(edges).forEach(e => { if (obj(e) && e.id != null) lost.delete(String(e.id)); });
  arrOf(model.edges).forEach(e => { if (obj(e) && e.id != null && !arrOf(edges).includes(e)) lost.add(String(e.id)); });
  const model1 = new Set(arrOf(edges).filter(e => obj(e) && e.id != null).map(e => String(e.id)));
  const views = Array.isArray(model.views) ? model.views.map(v => { if (!obj(v)) return v;
    const ov = obj(v.nodeOverrides) ? v.nodeOverrides : {}, out = new Set([...gone, ...Object.keys(ov).filter(k => Object.hasOwn(ov, k) && isGone(ov[k]))]);
    const w = { ...v }; delete w.diffMarks;
    if (Array.isArray(v.nodeIds)) w.nodeIds = v.nodeIds.filter(id => !out.has(id));
    if (Array.isArray(v.nodes)) w.nodes = live(v.nodes);
    if (obj(v.nodeOverrides)) w.nodeOverrides = Object.fromEntries(Object.entries(v.nodeOverrides).filter(([k]) => !out.has(k)));
    // a model line it still lists to a card taken out of it: listed, as the model after lists it (diff() marked it removed there)
    const back = x => obj(x) && isGone(x) && x.id != null && model1.has(String(x.id)) && (out.has(x.from) || out.has(x.to)) ? String(x.id) : x;
    if (Array.isArray(v.edges)) w.edges = v.edges.map(back).filter(x => typeof x === 'string' ? !lost.has(x) : !isGone(x) && endsOk(x) && !(obj(x) && (out.has(x.from) || out.has(x.to))));
    if (Array.isArray(v.containers)) w.containers = v.containers.filter(c => !isGone(c)).map(c => obj(c) && Array.isArray(c.nodeIds) ? { ...c, nodeIds: c.nodeIds.filter(id => !out.has(id)) } : c);
    if (Array.isArray(v.fragments)) w.fragments = live(v.fragments);
    if (v.subject != null && out.has(v.subject)) delete w.subject;
    return w; }) : model.views;
  return { ...model, nodes: Array.isArray(model.nodes) ? model.nodes.filter(n => !isGone(n)).map(keep) : model.nodes, edges, views };
}
const walkFrom = (edges, start, back) => { const seen = new Set([start]); // breadth first along lines (back: against them)
  for (let q = [start]; q.length;) { const u = q.shift(); edges.forEach(e => { const [a, b] = back ? [e.to, e.from] : [e.from, e.to]; if (a === u && !seen.has(b)) { seen.add(b); q.push(b); } }); }
  return seen; };

/** Every card and line on a path from one card to another, following lines forward: the cards both reachable from `from`
 *  and leading to `to`, and the lines between them. [] when no path joins them. */
export function paths(model, viewId, from, to) {
  model = unreadable(model).model; // read as mapContext reads it: a host's getter that throws is no value (audit 25)
  const T = viewType(model, viewId); if (T && T.paths) return T.paths(model, viewId, from, to); // a type's own walk (a sequence's, in time)
  const { ids, edges } = lineGraph(model, viewId);
  if (!ids.includes(from) || !ids.includes(to)) return [];
  const F = walkFrom(edges, from), B = walkFrom(edges, to, true), on = id => F.has(id) && B.has(id);
  if (!F.has(to)) return [];
  return [...ids.filter(on).map(id => ({ type: 'node', id, view: viewId })), ...edges.filter(e => on(e.from) && on(e.to)).map(e => ({ type: 'edge', ids: [e._id], view: viewId }))];
}

/** Everything a card's lines lead to (forward), or everything that leads to it (`backward`: for calls, who depends on it),
 *  each with its distance in lines; `depth` stops the walk that many lines out. The card itself is first, at 0. */
export function reach(model, viewId, from, options = {}) {
  model = unreadable(model).model; // as paths() (audit 25)
  const { ids, edges } = lineGraph(model, viewId), back = !!options.backward, depth = options.depth ?? Infinity;
  if (!ids.includes(from)) return [];
  const ends = e => back ? [e.to, e.from] : [e.from, e.to], dist = new Map([[from, 0]]);
  for (let q = [from]; q.length;) { const u = q.shift(), d = dist.get(u); if (d >= depth) continue;
    edges.forEach(e => { const [a, b] = ends(e); if (a === u && !dist.has(b)) { dist.set(b, d + 1); q.push(b); } }); }
  const near = (x, y) => x.distance - y.distance; // a stable sort: the view's order among equals
  return [...ids.filter(id => dist.has(id)).map(id => ({ type: 'node', id, view: viewId, distance: dist.get(id) })).sort(near),
    ...edges.filter(e => { const [a, b] = ends(e); return dist.has(a) && dist.has(b) && dist.get(a) < depth; })
      .map(e => ({ type: 'edge', ids: [e._id], view: viewId, distance: dist.get(ends(e)[0]) + 1 })).sort(near)];
}

// describe()'s sentences are one per line: a line break in a label, a title or any text but an id is a space there, as
// mmOne says a topic (audit 22). A text that is an id stays as it is, so every reference still names what it names
const LINE_BREAK = /\s*[\r\n\u2028\u2029]\s*/g;
function oneLine(model) {
  let text; try { text = JSON.stringify(model); } catch { return model; } // a model JSON cannot write (a cycle): as it is
  if (typeof text !== 'string' || !/\\[nr]|[\u2028\u2029]/.test(text)) return model;
  const ids = new Set(); JSON.parse(text, (k, x) => { if (k === 'id' && typeof x === 'string') ids.add(x); return x; });
  return JSON.parse(text, (k, x) => (typeof x === 'string' && !ids.has(x) ? x.replace(LINE_BREAK, ' ') : x));
}

/** A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do (in run order on a sequence
 *  view), and the cards with no line. The same model gives the same words: a text alternative, docs, or an AI's context. */
export function describe(model, viewId) {
  model = oneLine(unreadable(model).model); // as paths(): its view read once a host's getter is no value (audit 25)
  const T = viewType(model, viewId); if (T && T.describe) return T.describe(afterOf(model), viewId); // a type's own words (1.9), read as mapContext reads them (audit 19)
  const { ctx, v, ids, edges, gone } = lineGraph(model, viewId), boxes = (v.containers || []).filter(c => c && c.id && !isGone(c));
  const name = id => ctx.N[id] ? ctx.nodeIn(id, viewId).label || id : (boxes.find(c => c.id === id) || {}).label || id;
  const list = xs => xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // a line's kind as its colour says it: the one it names, else a hook's line guards and a board's is state (no guesses from words)
  const kind = e => WIRE_KINDS.includes(e.kind) ? e.kind : (ctx.N[e.from] || {}).kind === 'hook' ? 'guard' : [e.from, e.to].some(i => (ctx.N[i] || {}).kind === 'board') ? 'state' : 'calls';
  const VERB = { calls: 'calls', feeds: 'feeds', triggers: 'triggers', state: 'reads or writes', guard: 'guards' };
  const what = (e, n = 1) => { const t = [e.label && `"${e.label}"`, e.sublabel, v.render !== 'sequence' && e.step != null && `step ${e.step}`, n > 1 && `${n} lines`].filter(Boolean); return t.length ? ` (${t.join(', ')})` : ''; };
  // each card at the far end named once, with how many lines say the same (audit 28: "A calls B and B", as diff() said in audit 27)
  const far = es => { const by = new Map(); es.forEach(e => { const k = e.to + '\0' + what(e), g = by.get(k); if (g) g.n++; else by.set(k, { e, n: 1 }); }); return [...by.values()].map(g => name(g.e.to) + what(g.e, g.n)); };
  const out = [`${labelOr(v.title, v.id)}: ${count(ids.length, 'card')} and ${count(edges.length, 'line')}.`];
  if (ids.length) out.push(`Cards: ${ids.map(id => `${name(id)} (${KIND[kindOf(ctx.nodeIn(id, viewId).kind, true)][1]})`).join(', ')}.`);
  boxes.forEach(c => { const ins = (c.nodeIds || []).filter(i => ids.includes(i)); if (ins.length) out.push(`${name(c.id)} holds ${list(ins.map(name))}.`); });
  if (v.render === 'sequence') { const steps = gone || edges, k = runSteps(steps); steps.forEach((e, i) => out.push(`${k[i] == null ? 'Removed step' : 'Step ' + k[i]}: ${name(e.from)} ${VERB[kind(e)]} ${name(e.to)}${what(e)}.`)); } // audit 55
  else [...ids, ...boxes.map(c => c.id)].forEach(id => { const outs = edges.filter(e => e.from === id); if (!outs.length) return;
    out.push(`${name(id)} ${[...new Set(outs.map(kind))].map(k => `${VERB[k]} ${list(far(outs.filter(e => kind(e) === k)))}`).join('; ')}.`); });
  const alone = ids.filter(id => !edges.some(e => e.from === id || e.to === id));
  if (alone.length) out.push(`Not connected here: ${list(alone.map(name))}.`);
  return out.join('\n');
}

/** The spans of an OpenTelemetry trace exported as OTLP JSON, as replay() takes them: { id, parent, service, name, start,
 *  end }, times in milliseconds. */
export function otlpSpans(data) {
  const objs = x => Array.isArray(x) ? x.filter(y => y && typeof y === 'object') : []; // a malformed export: what is no list or object is skipped
  data = unreadable(data).model; // no value String() or Number() throws on (audit 20)
  const prim = x => x == null || typeof x === 'object' ? null : x; // text or a number; anything else no service
  const out = [], attr = (list, k) => { const v = (objs(list).find(a => a.key === k) || {}).value; return v && typeof v === 'object' ? prim(v.stringValue) ?? prim(v.intValue) : null; };
  objs(data && data.resourceSpans).forEach(rs => { const service = attr(rs.resource && rs.resource.attributes, 'service.name');
    objs(rs.scopeSpans || rs.instrumentationLibrarySpans).forEach(ss => objs(ss.spans).forEach(s => out.push({ id: s.spanId, parent: s.parentSpanId || null,
      service, name: typeof s.name === 'string' ? s.name : null, start: Number(s.startTimeUnixNano) / 1e6, end: Number(s.endTimeUnixNano) / 1e6 }))); });
  return out;
}
// a service's card (#65, #96): the card `match` names, else the card with that id, else the one with that label (any case)
// match is a table by name (a service may be named toString), read for text or a number; a service is text or a number
// too, anything else no service (audit 21)
const cardMatcher = (cards, match) => { const m = nameTable(match), ids = new Set(cards.map(n => String(n.id))), low = x => String(x ?? '').trim().toLowerCase();
  return s => typeof s !== 'string' && typeof s !== 'number' ? null : m.has(String(s)) ? (ids.has(m.get(String(s))) ? m.get(String(s)) : null)
    : ids.has(String(s)) ? String(s) : (n => n ? String(n.id) : null)(cards.find(n => low(n.label) === low(s))); };
// a duration in words, as replay() labels a line and a trace's view says a step's: "37 ms", "1.2 s"
const msText = x => x >= 1000 ? `${+(x / 1000).toFixed(x >= 1e4 ? 0 : 1)} s` : `${x >= 10 ? Math.round(x) : +x.toFixed(1)} ms`;

/** The path along a view's lines with the highest total of `by` (#95): `latency` (ms, the default) or `cost`, summed over
 *  its lines (a line without one counts 0). It starts at `from` and ends at `to`, either left out for any card, and never
 *  comes back to a card. { refs, total }: its cards in order, then its lines, as Refs for highlight(); no refs and 0 when
 *  no line leads from `from` (to `to`). */
export function critical(model, viewId, options = {}) {
  model = unreadable(model).model; // as paths() (audit 25)
  const { ids, edges } = lineGraph(model, viewId), by = options.by === 'cost' ? 'cost' : 'latency', { from, to } = options, none = { refs: [], total: 0 };
  if ((from != null && !ids.includes(from)) || (to != null && !ids.includes(to))) return none;
  const w = e => typeof e[by] === 'number' && e[by] > 0 ? e[by] : 0, path = [], on = new Set();
  let best = null;
  // ponytail: every path, depth first: exponential on a dense view with many ways between two cards; a longest-path pass
  // over the lines in run order (few loop back) if a map's size makes the page wait. Walked on a stack of frames, not by
  // recursion: a chain of thousands of cards overflowed the call stack (audit 36)
  const outs = new Map(), at = new Set(ids);
  edges.forEach(e => { if (!outs.has(e.from)) outs.set(e.from, []); outs.get(e.from).push(e); });
  const walk = start => { const st = [{ u: start, sum: 0, i: 0 }]; on.add(start);
    while (st.length) { const f = st[st.length - 1], out = outs.get(f.u) || [];
      if (f.i >= out.length) { on.delete(f.u); st.pop(); if (st.length) path.pop(); continue; } // back to the card before, off the line that led here
      const e = out[f.i++]; if (on.has(e.to)) continue;
      const s = f.sum + w(e); path.push(e);
      if ((to == null ? at.has(e.to) : e.to === to) && (!best || s > best.total)) best = { total: s, lines: [...path] };
      if (e.to !== to) { on.add(e.to); st.push({ u: e.to, sum: s, i: 0 }); } else path.pop(); } };
  (from != null ? [from] : ids).forEach(id => walk(id));
  if (!best) return none;
  const cards = [best.lines[0].from, ...best.lines.map(e => e.to)].filter(id => ids.includes(id));
  return { refs: [...cards.map(id => ({ type: 'node', id, view: viewId })), ...best.lines.map(e => ({ type: 'edge', ids: [e._id], view: viewId }))],
    total: +best.total.toPrecision(12) };
}

/** What taking cards out would cost (#95), with the model left as it is: `unreachable`, what loses its way to them in the
 *  view (backward, as reach() finds it: for calls, what depends on them), each with its distance in lines from the nearest,
 *  the cards themselves at 0. No rule breaks: rules only forbid lines and cycles, which taking cards out never adds. */
export function whatIf(model, viewId, options = {}) {
  const gone = new Set([].concat(options.remove ?? []).map(String)), near = new Map();
  gone.forEach(id => reach(model, viewId, id, { backward: true }).forEach(r => { const k = r.type === 'node' ? r.id : '>' + r.ids[0];
    if (!near.has(k) || r.distance < near.get(k).distance) near.set(k, r); }));
  return { unreachable: [...near.values()].sort((a, b) => (a.type === 'edge') - (b.type === 'edge') || a.distance - b.distance) };
}

/** A trace kept as a numbered view (#96): `model` with a sequence view (`render: "sequence"`) made from `spans` (as
 *  otlpSpans() reads them). Each call from one card to another (a span and its parent's) is a step, in time order, its
 *  line labelled with the span's name and its duration under it. A span's service is a card as replay() matches it:
 *  through `match`, else by id, else by label (any case); a span with no card, or whose caller has none, is no step, and
 *  the view's caption names the services with no card. The view (`view`, default "trace"; `title`) takes the place of one
 *  with its id, else comes last, under the view that shows the most of its cards. The model passed in is not changed. */
export function sequenceFromTrace(model, spans, options = {}) {
  // read as mapContext reads a model (audit 20); the match table by name, where a service may be named toString (audit 21)
  const match = options && options.match; [model, spans, options] = [model, [].concat(spans || []), { ...options, match: null }].map(x => unreadable(x).model);
  const out = copyOf(model || {}), id = String(options.view ?? 'trace'), views = arrOf(out.views);
  const cards = [...arrOf(out.nodes), ...views.flatMap(v => arrOf(v && v.nodes))].filter(n => n && n.id != null);
  const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
  const span = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(cards, match), hops = [], lost = new Set();
  list.forEach(s => { const to = cardOf(s.service); if (!to) { if (typeof s.service === 'string' || typeof s.service === 'number') lost.add(String(s.service)); return; }
    const p = s.parent != null ? span.get(String(s.parent)) : null, from = p && cardOf(p.service);
    if (from && from !== to) hops.push([from, to, s]); }); // a root span, a caller with no card, or work inside one card: no step
  hops.sort((a, b) => +a[2].start - +b[2].start); // stable: calls that start together keep the trace's order
  const nodeIds = [...new Set(hops.flatMap(([a, b]) => [a, b]))], n = hops.length, took = s => msText(+s.end - +s.start);
  // each line "<view>-<n>", unless the model holds that id (a line, a card, a view): then "<view>-<n>-2" and on, the first free;
  // the lines of the view it replaces go with it (audit 41: a model with a line "trace-1" came back failing validate())
  const used = usedIds({ ...out, views: views.filter(v => !(v && String(v.id) === id)) }), free = b => { let k = b; for (let j = 2; used.has(k); j++) k = `${b}-${j}`; used.add(k); return k; };
  const edges = hops.map(([from, to, s], i) => ({ id: free(`${id}-${i + 1}`), from, to, ...(s.name ? { label: String(s.name), sublabel: took(s) } : { label: took(s) }) }));
  // never under itself: the view it replaces and every view below that one are no home (a parent cycle), walked with a list
  const kids = new Map(), below = new Set([id]), todo = [id];
  views.forEach(v => { if (v && v.parent != null) { const p = String(v.parent); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(String(v.id)); } });
  while (todo.length) (kids.get(todo.pop()) || []).forEach(c => { if (!below.has(c)) { below.add(c); todo.push(c); } });
  const home = views.reduce((a, v) => { const k = v && !below.has(String(v.id)) ? nodeIds.filter(x => arrOf(v.nodeIds).includes(x)).length : 0; return k > a[1] ? [v.id, k] : a; }, [null, 0])[0];
  const view = { id, ...(home != null ? { parent: home } : {}), title: options.title || id,
    caption: `From a trace: ${n} call${n === 1 ? '' : 's'} between cards, in time order, each with its duration.${lost.size ? ` No card for ${andList([...lost])}.` : ''}`,
    render: 'sequence', lanes: false, nodeIds, edges };
  const at = views.findIndex(v => v && v.id === id);
  out.views = at < 0 ? [...views, view] : views.map((v, k) => k === at ? view : v);
  return out;
}

export { cardMatcher, msText };
