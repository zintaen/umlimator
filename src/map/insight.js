import { diagramOf } from '../core/registry.js';
import { mapContext } from './context.js';
import { KIND, kindOf } from './kinds.js';
import { WIRE_KINDS, andList, arrOf } from './validate.js';

/* ---------- paths(), reach(), describe() and otlpSpans(): a view's lines walked and put in words, with no DOM (#62, #64, #65) ----------
   A line runs from → to as the model gives it. Each result is a list of Refs a host can hand to highlight(); a line's Ref
   names one model edge (a drawn line that stands for several takes the strongest mark among them). */
function lineGraph(model, viewId) {
  const ctx = mapContext(model), v = ctx.V[viewId];
  if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  return { ctx, v, ids: (v.nodeIds || []).filter(i => ctx.N[i]), edges: ctx.viewEdges(v).filter(e => e.from !== e.to) };
}
const walkFrom = (edges, start, back) => { const seen = new Set([start]); // breadth first along lines (back: against them)
  for (let q = [start]; q.length;) { const u = q.shift(); edges.forEach(e => { const [a, b] = back ? [e.to, e.from] : [e.from, e.to]; if (a === u && !seen.has(b)) { seen.add(b); q.push(b); } }); }
  return seen; };

/** Every card and line on a path from one card to another, following lines forward: the cards both reachable from `from`
 *  and leading to `to`, and the lines between them. [] when no path joins them. */
export function paths(model, viewId, from, to) {
  const { ids, edges } = lineGraph(model, viewId);
  if (!ids.includes(from) || !ids.includes(to)) return [];
  const F = walkFrom(edges, from), B = walkFrom(edges, to, true), on = id => F.has(id) && B.has(id);
  if (!F.has(to)) return [];
  return [...ids.filter(on).map(id => ({ type: 'node', id, view: viewId })), ...edges.filter(e => on(e.from) && on(e.to)).map(e => ({ type: 'edge', ids: [e._id], view: viewId }))];
}

/** Everything a card's lines lead to (forward), or everything that leads to it (`backward`: for calls, who depends on it),
 *  each with its distance in lines; `depth` stops the walk that many lines out. The card itself is first, at 0. */
export function reach(model, viewId, from, options = {}) {
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

/** A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do (in run order on a sequence
 *  view), and the cards with no line. The same model gives the same words: a text alternative, docs, or an AI's context. */
export function describe(model, viewId) {
  const T = model && model.schemaVersion === 2 && diagramOf(arrOf(model.views).find(v => v && v.id === viewId)); if (T && T.describe) return T.describe(model, viewId); // a type's own words (1.9)
  const { ctx, v, ids, edges } = lineGraph(model, viewId), boxes = (v.containers || []).filter(c => c && c.id);
  const name = id => ctx.N[id] ? ctx.nodeIn(id, viewId).label || id : (boxes.find(c => c.id === id) || {}).label || id;
  const list = xs => xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // a line's kind as its colour says it: the one it names, else a hook's line guards and a board's is state (no guesses from words)
  const kind = e => WIRE_KINDS.includes(e.kind) ? e.kind : (ctx.N[e.from] || {}).kind === 'hook' ? 'guard' : [e.from, e.to].some(i => (ctx.N[i] || {}).kind === 'board') ? 'state' : 'calls';
  const VERB = { calls: 'calls', feeds: 'feeds', triggers: 'triggers', state: 'reads or writes', guard: 'guards' };
  const what = e => { const t = [e.label && `"${e.label}"`, e.sublabel, v.render !== 'sequence' && e.step != null && `step ${e.step}`].filter(Boolean); return t.length ? ` (${t.join(', ')})` : ''; };
  const out = [`${v.title || v.id}: ${count(ids.length, 'card')} and ${count(edges.length, 'line')}.`];
  if (ids.length) out.push(`Cards: ${ids.map(id => `${name(id)} (${KIND[kindOf(ctx.nodeIn(id, viewId).kind, true)][1]})`).join(', ')}.`);
  boxes.forEach(c => { const ins = (c.nodeIds || []).filter(i => ids.includes(i)); if (ins.length) out.push(`${name(c.id)} holds ${list(ins.map(name))}.`); });
  if (v.render === 'sequence') edges.forEach((e, i) => out.push(`Step ${i + 1}: ${name(e.from)} ${VERB[kind(e)]} ${name(e.to)}${what(e)}.`));
  else [...ids, ...boxes.map(c => c.id)].forEach(id => { const outs = edges.filter(e => e.from === id); if (!outs.length) return;
    out.push(`${name(id)} ${[...new Set(outs.map(kind))].map(k => `${VERB[k]} ${list(outs.filter(e => kind(e) === k).map(e => name(e.to) + what(e)))}`).join('; ')}.`); });
  const alone = ids.filter(id => !edges.some(e => e.from === id || e.to === id));
  if (alone.length) out.push(`Not connected here: ${list(alone.map(name))}.`);
  return out.join('\n');
}

/** The spans of an OpenTelemetry trace exported as OTLP JSON, as replay() takes them: { id, parent, service, name, start,
 *  end }, times in milliseconds. */
export function otlpSpans(data) {
  const out = [], attr = (list, k) => { const v = ((list || []).find(a => a && a.key === k) || {}).value || {}; return v.stringValue ?? v.intValue ?? null; };
  ((data && data.resourceSpans) || []).forEach(rs => { const service = attr(rs.resource && rs.resource.attributes, 'service.name');
    (rs.scopeSpans || rs.instrumentationLibrarySpans || []).forEach(ss => (ss.spans || []).forEach(s => out.push({ id: s.spanId, parent: s.parentSpanId || null,
      service, name: s.name, start: Number(s.startTimeUnixNano) / 1e6, end: Number(s.endTimeUnixNano) / 1e6 }))); });
  return out;
}
// a service's card (#65, #96): the card `match` names, else the card with that id, else the one with that label (any case)
const cardMatcher = (cards, match) => { const m = match || {}, ids = new Set(cards.map(n => String(n.id))), low = x => String(x ?? '').trim().toLowerCase();
  return s => s == null ? null : Object.hasOwn(m, s) && m[s] != null ? (ids.has(String(m[s])) ? String(m[s]) : null)
    : ids.has(String(s)) ? String(s) : (n => n ? String(n.id) : null)(cards.find(n => low(n.label) === low(s))); };
// a duration in words, as replay() labels a line and a trace's view says a step's: "37 ms", "1.2 s"
const msText = x => x >= 1000 ? `${+(x / 1000).toFixed(x >= 1e4 ? 0 : 1)} s` : `${x >= 10 ? Math.round(x) : +x.toFixed(1)} ms`;

/** The path along a view's lines with the highest total of `by` (#95): `latency` (ms, the default) or `cost`, summed over
 *  its lines (a line without one counts 0). It starts at `from` and ends at `to`, either left out for any card, and never
 *  comes back to a card. { refs, total }: its cards in order, then its lines, as Refs for highlight(); no refs and 0 when
 *  no line leads from `from` (to `to`). */
export function critical(model, viewId, options = {}) {
  const { ids, edges } = lineGraph(model, viewId), by = options.by === 'cost' ? 'cost' : 'latency', { from, to } = options, none = { refs: [], total: 0 };
  if ((from != null && !ids.includes(from)) || (to != null && !ids.includes(to))) return none;
  const w = e => typeof e[by] === 'number' && e[by] > 0 ? e[by] : 0, path = [], on = new Set();
  let best = null;
  // ponytail: every path, depth first: exponential on a dense view with many ways between two cards; a longest-path pass
  // over the lines in run order (few loop back) if a map's size makes the page wait
  const walk = (u, sum) => { on.add(u);
    edges.forEach(e => { if (e.from !== u || on.has(e.to)) return;
      const s = sum + w(e); path.push(e);
      if ((to == null ? ids.includes(e.to) : e.to === to) && (!best || s > best.total)) best = { total: s, lines: [...path] };
      if (e.to !== to) walk(e.to, s);
      path.pop(); });
    on.delete(u); };
  (from != null ? [from] : ids).forEach(id => walk(id, 0));
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
  const out = structuredClone(model || {}), id = String(options.view ?? 'trace'), views = arrOf(out.views);
  const cards = [...arrOf(out.nodes), ...views.flatMap(v => arrOf(v && v.nodes))].filter(n => n && n.id != null);
  const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
  const span = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(cards, options.match), hops = [], lost = new Set();
  list.forEach(s => { const to = cardOf(s.service); if (!to) { if (s.service != null) lost.add(String(s.service)); return; }
    const p = s.parent != null ? span.get(String(s.parent)) : null, from = p && cardOf(p.service);
    if (from && from !== to) hops.push([from, to, s]); }); // a root span, a caller with no card, or work inside one card: no step
  hops.sort((a, b) => +a[2].start - +b[2].start); // stable: calls that start together keep the trace's order
  const nodeIds = [...new Set(hops.flatMap(([a, b]) => [a, b]))], n = hops.length, took = s => msText(+s.end - +s.start);
  const edges = hops.map(([from, to, s], i) => ({ id: `${id}-${i + 1}`, from, to, ...(s.name ? { label: String(s.name), sublabel: took(s) } : { label: took(s) }) }));
  const home = views.reduce((a, v) => { const k = v && v.id !== id ? nodeIds.filter(x => arrOf(v.nodeIds).includes(x)).length : 0; return k > a[1] ? [v.id, k] : a; }, [null, 0])[0];
  const view = { id, ...(home != null ? { parent: home } : {}), title: options.title || id,
    caption: `From a trace: ${n} call${n === 1 ? '' : 's'} between cards, in time order, each with its duration.${lost.size ? ` No card for ${andList([...lost])}.` : ''}`,
    render: 'sequence', lanes: false, nodeIds, edges };
  const at = views.findIndex(v => v && v.id === id);
  out.views = at < 0 ? [...views, view] : views.map((v, k) => k === at ? view : v);
  return out;
}

export { cardMatcher, msText };
