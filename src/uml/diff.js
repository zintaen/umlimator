import { TYPED } from '../core/registry.js';
import { canon } from '../map/diff.js';

/* ---------- diff()'s words for typed models (C10, risks.md M11) ----------
   Only lib/umlimator-all.js holds this file: it fills TYPED.diff and TYPED.order (registry.js), which diff() (src/map/diff.js)
   asks. Where order means something, a reorder reads "moves": a member of an element (an attribute, a slot, a port), a
   message or an interaction use among a sequence view's lines, a message among a communication model's lines. A line that
   only changes its operand reads "moves … into …" (or "out of …"), as a re-own does. A sequence view's combined fragments
   read added, removed and changed. Maps have none of these, and are diffed as before. */
const UD_ARR = x => (Array.isArray(x) ? x : []), UD_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const UD_ORDERED = new Set(['uml.Message', 'uml.InteractionUse']);
const UD_KEY = (x, i) => x.id != null ? String(x.id) : '#' + i;
// what moved from `old` to `now`, both keyed lists: the kept items not on a longest run in their old order, each with the
// kept item now before it (null: first). O(n²), fine for a view's messages or an element's members
function udMoved(old, now) {
  const at = new Map(old.map((x, i) => [UD_KEY(x, i), i])), kept = now.map((x, i) => [x, at.get(UD_KEY(x, i))]).filter(k => k[1] != null);
  const len = kept.map(() => 1), prev = kept.map(() => -1);
  kept.forEach((k, i) => { for (let j = 0; j < i; j++) if (kept[j][1] < k[1] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; } });
  const run = new Set(); for (let i = len.indexOf(Math.max(0, ...len)); i >= 0; i = prev[i]) run.add(i);
  return kept.flatMap((k, i) => run.has(i) ? [] : [[k[0], i ? kept[i - 1][0] : null]]);
}
const UD_WHAT = (x, name) => String(x.label ?? (x.props && (x.props.trigger ?? x.props.name)) ?? (x.from != null ? `the message from ${name(x.from)} to ${name(x.to)}` : x.id));

// a changed card or line (o before, x after): its own words, or nothing for diff()'s
TYPED.diff = (o, x, name, models) => {
  if (!x.type) return;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(k => canon(o[k]) !== canon(x[k]));
  if (keys.join() === 'members') { const a = UD_ARR(o.members).filter(UD_OBJ), b = UD_ARR(x.members).filter(UD_OBJ);
    const same = a.length === b.length && canon([...a].map(canon).sort()) === canon([...b].map(canon).sort());
    if (same) return udMoved(a, b).map(([m, p]) => `moves ${UD_WHAT(m, name)} ${p ? 'after ' + UD_WHAT(p, name) : 'to the top'} in ${name(x.id)}`); }
  if (keys.join() === 'parent' && UD_ORDERED.has(x.type) && x.from != null) { // a message into or out of an operand
    const ops = new Map(models.flatMap(m => UD_ARR(m && m.views)).flatMap(v => UD_ARR(v && v.fragments)).flatMap(f => UD_ARR(f && f.members)).filter(UD_OBJ).map(op => [op.id, op]));
    const op = id => String((ops.get(id) || {}).label ?? id);
    return [`moves ${UD_WHAT(x, name)} ${x.parent != null ? 'into ' + op(x.parent) : 'out of ' + op(o.parent)}`]; }
};

// the order of lines, and a sequence view's fragments: each move or fragment said, a moved line marked changed (its
// edited dot), and the views that show it touched
TYPED.order = (A, out, views, V0, said, touched, name) => {
  const lines = (old, now, v) => { const f = l => UD_ARR(l).filter(e => UD_OBJ(e) && UD_ORDERED.has(e.type) && e.change !== 'removed');
    udMoved(f(old), f(now)).forEach(([e, p]) => { said.push(`moves ${UD_WHAT(e, name)} ${p ? 'after ' + UD_WHAT(p, name) : 'to the start'}`);
      Object.assign(e, { change: 'changed', edited: true });
      views.forEach(w => { if (w && (w === v || !v && UD_ARR(w.nodeIds).includes(e.from) && UD_ARR(w.nodeIds).includes(e.to))) touched.add(w.id); }); }); };
  lines(A.edges, out.edges, null);
  views.forEach(v => { const o = v && V0.get(v.id); if (!o) return;
    if (Array.isArray(v.edges)) lines(o.edges, v.edges, v);
    const F0 = new Map(UD_ARR(o.fragments).filter(UD_OBJ).map(f => [f.id, f])), F1 = new Map(UD_ARR(v.fragments).filter(UD_OBJ).map(f => [f.id, f]));
    const op = f => `the ${(f.props && f.props.operator) || 'combined'} fragment`;
    F1.forEach((f, id) => { const g = F0.get(id); if (g && canon(g) === canon(f)) return;
      said.push(g ? `changes ${op(g)} (${[...new Set([...Object.keys(g), ...Object.keys(f)])].filter(k => canon(g[k]) !== canon(f[k])).join(', ')})` : `adds ${op(f)}`); touched.add(v.id); });
    F0.forEach((f, id) => { if (!F1.has(id)) { said.push(`removes ${op(f)}`); touched.add(v.id); } });
  });
};
