import { TYPED } from '../core/registry.js';
import { andList } from './validate.js';

/* ---------- change: diff (#66) and drift (#68) ----------
   Each returns a model marked with what the map draws already, so a page the CLI writes, or a still, shows the marks
   with nothing to call at run time: a card's change (a NEW or CHANGED tab; REMOVED is faded, dashed and struck
   through), a line's style (added: green and flowing; removed: rose, dashed and faded; security: rose and dashed;
   faded: its own colour, faint and still) and edited (an amber dot on the line). */
const canon = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(f => [f, v[f]])) : v);
// a line's identity in a list, as a Ref names it: its id, else "<from>-><to>#<n>"; "=<id>" for a view's reference to a model line
const lineKeys = list => { const seen = {}; return list.map(e => typeof e === 'string' ? '=' + e : e && typeof e === 'object'
  ? (e.id != null ? String(e.id) : (k => `${k}#${seen[k] = (seen[k] ?? -1) + 1}`)(e.from + '->' + e.to)) : ''); };
// a line that stands for several edges (A→B and B→A, parallel edges) shows the strongest of their marks: removed or
// undrawn, then added, then changed (its edited dot, which a stronger mark hides); it fades as idle only when every one
// of them is idle, and otherwise takes the first style that is no mark
const markOf = all => { const top = all.find(x => x.style === 'removed' || x.drift === 'undrawn') || all.find(x => x.style === 'added');
  if (top) return { style: top.style, strong: true };
  return { style: all.every(x => x.style === 'faded') ? 'faded' : (all.find(x => x.style && x.style !== 'faded') || {}).style }; };
// the lines a view draws: its own list (a model line by id, or one of its own), else every model line between its cards and boxes
const linesOf = (m, v) => { const all = Array.isArray(m.edges) ? m.edges.filter(Boolean) : [];
  if (Array.isArray(v.edges)) { const byId = new Map(all.filter(e => e.id != null).map(e => [String(e.id), e])); return v.edges.map(e => typeof e === 'string' ? byId.get(e) : e).filter(Boolean); }
  const ids = new Set([...(v.nodeIds || []), ...(v.containers || []).map(c => c && c.id)]); return all.filter(e => ids.has(e.from) && ids.has(e.to)); };

/** What changed from one model to the next, as one model to draw: `after`, with each card and line marked added, changed
 *  or removed (removed ones come back from `before`, in their views, boxes and places), a summary in words, and the
 *  views that show a change. Cards and lines are matched by id (a line without one by its ends, as a Ref names it). */
export function diff(before, after) {
  const arr = x => (Array.isArray(x) ? x : []), A = structuredClone(before || {}), out = structuredClone(after || {});
  const how = new Map(), was = new Map(), said = []; // each marked card or line: added, changed or removed; a changed one's [before, after]
  const card = (x, h) => ({ ...x, change: h });
  const line = (x, h) => ({ ...x, change: h, ...(h === 'changed' ? { edited: true } : { style: h }) });
  function mark(old, now, put, keys = l => l.map(x => x && x.id), inPlace) { // now's items, marked; old's that left come back, marked removed
    const ko = keys(old), kn = keys(now), O = new Map(old.map((x, i) => [ko[i], x])), kept = new Set(kn);
    const res = now.map((x, i) => { if (!x || typeof x !== 'object') return x; const o = O.get(kn[i]);
      if (o && typeof o === 'object' && canon(o) === canon(x)) return x;
      const h = o && typeof o === 'object' ? 'changed' : 'added', y = put(x, h); how.set(y, h); if (h === 'changed') was.set(y, [o, x]); return y; });
    const R = [...res]; let at = 0; // in a view's lines (a sequence's are its time order) after the old one before it that stayed, else at the end
    old.forEach((x, i) => { if (kept.has(ko[i])) at = res.indexOf(R[kn.indexOf(ko[i])]) + 1;
      else if (x && typeof x === 'object') { const y = put(x, 'removed'); how.set(y, 'removed'); res.splice(inPlace ? at++ : res.length, 0, y); } });
    return res;
  }
  out.nodes = mark(arr(A.nodes), arr(out.nodes), card);
  out.edges = mark(arr(A.edges), arr(out.edges), line, lineKeys);
  const goneLines = new Set(out.edges.filter(e => how.get(e) === 'removed' && e.id != null).map(e => String(e.id)));
  const V0 = new Map(arr(A.views).filter(Boolean).map(v => [v.id, v])), V1 = new Set(arr(out.views).filter(Boolean).map(v => v.id));
  const moved = [], touched = new Set(); // cards put into or taken out of a view; views whose cards the diff marks there
  const views = arr(out.views).map(v => {
    const o = v && V0.get(v.id); if (!o) return v;
    const w = { ...v }, ids = arr(v.nodeIds), oldIds = arr(o.nodeIds);
    if (v.nodes || o.nodes) w.nodes = mark(arr(o.nodes), arr(v.nodes), card);
    const at = new Map([...out.nodes, ...arr(w.nodes)].filter(Boolean).map(n => [n.id, n]));
    const left = oldIds.filter(id => !ids.includes(id)), came = ids.filter(id => !oldIds.includes(id)), ov = { ...(v.nodeOverrides || {}) };
    w.nodeIds = [...ids, ...left];
    left.forEach(id => { if (how.get(at.get(id)) !== 'removed') { ov[id] = { ...(o.nodeOverrides || {})[id], change: 'removed' }; moved.push(['takes', id, v]); } });
    came.forEach(id => { if (at.get(id) && how.get(at.get(id)) !== 'added') { ov[id] = { ...ov[id], change: 'added' }; moved.push(['puts', id, v]); } });
    if (left.length || came.length) touched.add(v.id);
    if (Object.keys(ov).length) w.nodeOverrides = ov;
    if (left.length && Array.isArray(v.containers)) // a removed card stays in its box, and in its place on a view laid out by hand when that is free
      w.containers = v.containers.map(c => { const back = left.filter(id => c && arr(o.containers).some(b => b && b.id === c.id && arr(b.nodeIds).includes(id))); return back.length ? { ...c, nodeIds: [...arr(c.nodeIds), ...back] } : c; });
    if (left.length && v.layout && o.layout) { const L = { ...v.layout }, taken = new Set(Object.values(L).map(String));
      left.forEach(id => { const p = o.layout[id]; if (Array.isArray(p) && !taken.has(String(p))) { L[id] = p; taken.add(String(p)); } }); w.layout = L; }
    if (Array.isArray(v.edges)) { w.edges = mark(arr(o.edges), v.edges, line, lineKeys, 1);
      arr(o.edges).forEach(e => { if (typeof e === 'string' && !v.edges.includes(e) && goneLines.has(e)) w.edges.push(e); }); } // a removed model line it showed
    return w;
  });
  arr(A.views).forEach(o => { if (!o || V1.has(o.id)) return; // a removed view comes back with everything in it removed
    const w = { ...o, nodeOverrides: { ...(o.nodeOverrides || {}) } };
    arr(o.nodeIds).forEach(id => { w.nodeOverrides[id] = { ...w.nodeOverrides[id], change: 'removed' }; });
    if (o.nodes) w.nodes = o.nodes.map(n => { const y = card(n, 'removed'); how.set(y, 'removed'); return y; });
    if (Array.isArray(o.edges)) w.edges = o.edges.map(e => e && typeof e === 'object' ? line(e, 'removed') : e);
    touched.add(o.id); views.push(w); });
  out.views = views;

  // the summary: views, then cards, then lines, in model order; a line to a card that came or went goes with the card
  const cards = [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].filter(Boolean);
  const named = new Map([...views.flatMap(v => arr(v && v.containers)), ...cards].filter(Boolean).map(n => [n.id, n]));
  const name = id => String((named.get(id) || {}).label || id), cardHow = new Map(cards.filter(n => how.has(n)).map(n => [n.id, how.get(n)]));
  const lines = [...out.edges, ...views.flatMap(v => arr(v && v.edges).filter(e => e && typeof e === 'object'))];
  const diffKeys = ([o, x]) => [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(k => canon(o[k]) !== canon(x[k]));
  views.forEach(v => { if (v && !V0.has(v.id)) said.push(`adds the view ${v.title || v.id}`); });
  arr(A.views).forEach(o => { if (o && !V1.has(o.id)) said.push(`removes the view ${o.title || o.id}`); });
  cards.forEach(n => { const h = how.get(n);
    if (h === 'added') { const ins = lines.filter(e => e.to === n.id && how.get(e) === 'added').map(e => name(e.from)), outs = lines.filter(e => e.from === n.id && how.get(e) === 'added').map(e => name(e.to));
      said.push(`adds ${name(n.id)}` + (ins.length === 1 && outs.length === 1 ? ` between ${ins[0]} and ${outs[0]}` : (ins.length ? `, from ${andList(ins)}` : '') + (outs.length ? `, to ${andList(outs)}` : ''))); }
    if (h === 'removed') said.push(`removes ${name(n.id)}`);
    if (h === 'changed') { const [o, x] = was.get(n), keys = diffKeys([o, x]), rest = keys.filter(k => k !== 'label'), p0 = o.parent ?? null, p1 = x.parent ?? null;
      if (keys.join() === 'parent' && p0 !== p1 && A.schemaVersion === 2 && out.schemaVersion === 2) return said.push(`moves ${name(n.id)} ${p1 != null ? 'into ' + name(p1) : 'out of ' + name(p0)}`); // a re-own (schema version 2; absent or null is no owner)
      const t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t); // a typed element's own words (src/uml/diff.js)
      said.push((keys.includes('label') ? `renames ${o.label || o.id} to ${x.label || x.id}` : `changes ${name(n.id)}`) + (rest.length ? ` (${rest.join(', ')})` : '')); } });
  lines.forEach(e => { const h = how.get(e); if (!h || cardHow.get(e.from) === h && h !== 'changed' || cardHow.get(e.to) === h && h !== 'changed') return;
    const ends = e.from == null && e.to == null ? null : `${name(e.from)} to ${name(e.to)}`, lab = e.label ? ` (${e.label})` : '', it = ends ? 'the line from ' + ends : e.label ?? e.id; // an item with no ends (an interaction use) by its name
    if (h === 'added') said.push(ends ? `adds a line from ${ends}${lab}` : `adds ${it}`);
    if (h === 'removed') said.push(ends ? `removes ${it}${lab}` : `removes ${it}`);
    if (h === 'changed') { const [o, x] = was.get(e), t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t);
      said.push(`changes ${it} (${diffKeys([o, x]).map(k => k === 'label' ? `label ${o.label ?? '-'} → ${x.label ?? '-'}` : k).join(', ')})`); } });
  moved.forEach(([verb, id, v]) => said.push(`${verb} ${name(id)} ${verb === 'puts' ? 'in' : 'out of'} the view ${v.title || v.id}`));
  if (TYPED.order) TYPED.order(A, out, views, V0, said, touched, name);

  // the views that show a change: a card or line the diff marks, or a card it put in or took out
  const changed = views.filter(v => v && (touched.has(v.id) || arr(v.nodeIds).some(id => cardHow.has(id)) || linesOf(out, v).some(e => how.has(e)))).map(v => v.id);
  return { model: out, summary: said, views: changed };
}

/** The map against the traffic seen: a line that carries traffic but is not drawn comes in, dashed rose ("not drawn",
 *  with its calls); a drawn line between two cards that traffic was seen at, with none of its own, fades. `observed`:
 *  [{ from, to, count }], or a Jaeger or Tempo dependency list ([{ parent, child, callCount }], or { data: [...] }). A
 *  service is a card by `options.match[service]`, else by id, else by label (case aside). Counts: lines that carried
 *  traffic, came in undrawn, are idle, or could not be judged (an end traffic never reached), and services with no card,
 *  each a count of model edges (a drawn line that stands for several fades only when all are idle); views: those that
 *  show drift. */
export function drift(model, observed, options = {}) {
  const arr = x => (Array.isArray(x) ? x : []), out = structuredClone(model || {}), match = options.match || {};
  const list = Array.isArray(observed) ? observed : arr(observed && observed.data);
  const cards = [...arr(out.nodes), ...arr(out.views).flatMap(v => arr(v && v.nodes))].filter(n => n && n.id != null);
  const ids = new Set(cards.map(n => String(n.id))), lower = new Map();
  cards.forEach(n => [n.id, n.label].forEach(s => { if (s != null && !lower.has(String(s).toLowerCase())) lower.set(String(s).toLowerCase(), String(n.id)); }));
  const cardOf = s => { s = String(s ?? ''); const id = Object.hasOwn(match, s) ? String(match[s]) : ids.has(s) ? s : lower.get(s.toLowerCase()); return ids.has(id) ? id : null; };
  const seen = new Map(), live = new Set(), unmatched = new Set(); let counted = false;
  list.forEach(o => { if (!o || typeof o !== 'object') return;
    const f = o.from ?? o.parent, t = o.to ?? o.child, n = o.count ?? o.callCount, a = cardOf(f), b = cardOf(t);
    if (a == null) unmatched.add(String(f)); if (b == null) unmatched.add(String(t));
    if (a == null || b == null || a === b) return;
    live.add(a); live.add(b);
    if (n != null) { counted = true; if (!(+n > 0)) return; } // seen with no calls: both ends were watched, the line carried nothing
    const k = a + '\n' + b, s = seen.get(k) || { a, b, n: 0 }; s.n += +n || 0; seen.set(k, s); });
  const counts = { carried: 0, undrawn: 0, idle: 0, unknown: 0, unmatched: [...unmatched].sort() }, drawn = new Set();
  const judge = e => { if (!e || typeof e !== 'object') return e; const k = e.from + '\n' + e.to;
    if (seen.has(k)) { drawn.add(k); counts.carried++; return e; }
    if (live.has(String(e.from)) && live.has(String(e.to))) { counts.idle++; return { ...e, style: 'faded', drift: 'idle' }; }
    counts.unknown++; return e; };
  out.edges = arr(out.edges).map(judge);
  arr(out.views).forEach(v => { if (v && Array.isArray(v.edges)) v.edges = v.edges.map(judge); });
  seen.forEach(({ a, b, n }, k) => { if (drawn.has(k)) return; counts.undrawn++;
    const e = { id: `drift:${a}->${b}`, from: a, to: b, label: 'not drawn', ...(counted ? { sublabel: `${n.toLocaleString('en-US')} calls` } : {}), style: 'security', drift: 'undrawn' };
    out.edges.push(e);
    arr(out.views).forEach(v => { if (v && Array.isArray(v.edges) && arr(v.nodeIds).includes(a) && arr(v.nodeIds).includes(b)) v.edges.push(e.id); }); });
  return { model: out, counts, views: arr(out.views).filter(v => v && linesOf(out, v).some(e => e.drift)).map(v => v.id) };
}

export { canon, markOf };
