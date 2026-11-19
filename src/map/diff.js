import { TYPED, idTable, diagramOf } from '../core/registry.js';
import { andList, arrOf, rules } from './validate.js';
import { canon, copyOf, jsonText, labelOr, nameTable, unreadable, elName, usedIds } from '../core/model.js';
import { held } from '../core/warn.js';
import { mapContext } from './context.js';

/* ---------- change: diff (#66) and drift (#68) ----------
   Each returns a model marked with what the map draws already, so a page the CLI writes, or a still, shows the marks
   with nothing to call at run time: a card's change (a NEW or CHANGED tab; REMOVED is faded, dashed and struck
   through), a line's style (added: green and flowing; removed: rose, dashed and faded; security: rose and dashed;
   faded: its own colour, faint and still) and edited (an amber dot on the line). */
const plain = t => Object.fromEntries(Object.entries(t)); // an own-key table back to a plain object, for JSON and deepEqual
// a line's identity in a list, as a Ref names it: its id, else "<from>-><to>#<n>"; "=<id>" for a view's reference to a model line
const lineKeys = list => { const seen = {}; return list.map(e => typeof e === 'string' ? '=' + e : e && typeof e === 'object'
  ? (e.id != null ? String(e.id) : (k => `${k}#${seen[k] = (seen[k] ?? -1) + 1}`)(e.from + '->' + e.to)) : ''); };
// a line that stands for several edges (A→B and B→A, parallel edges) shows the strongest of their marks: removed or
// undrawn, then added, then changed (its edited dot, which a stronger mark hides); it fades as idle only when every one
// of them is idle, and otherwise takes the first style that is no mark
const markOf = all => { const top = all.find(x => x.style === 'removed' || x.drift === 'undrawn') || all.find(x => x.style === 'added');
  if (top) return { style: top.style, strong: true };
  return { style: all.every(x => x.style === 'faded') ? 'faded' : (all.find(x => x.style && x.style !== 'faded') || {}).style }; };
// the lines a view draws: its own list (a model line by id, or one of its own), else every model line between its cards and boxes;
// with ups (id -> the ids of its owners), also each line of a kind the view's type draws whose ends are members of them (a port, a
// part, or a port on a part: audit 18)
const linesOf = (m, v, ups) => { const all = Array.isArray(m.edges) ? m.edges.filter(Boolean) : [];
  if (Array.isArray(v.edges)) { const byId = new Map(all.filter(e => e.id != null).map(e => [String(e.id), e])); return v.edges.map(e => typeof e === 'string' ? byId.get(e) : e).filter(Boolean); }
  const ids = new Set([...arrOf(v.nodeIds), ...arrOf(v.containers).map(c => c && c.id)]), on = id => id != null && (ids.has(id) || ups(id).some(u => ids.has(u)));
  const kinds = ups ? new Set(arrOf((diagramOf(v) || {}).lines).map(t => t && t.type)) : null, end = (e, k) => on(e[k]) || on((((e.props && e.props.ends) || {})[k] || {}).part);
  return all.filter(e => ids.has(e.from) && ids.has(e.to) || ups && kinds.has(e.type) && end(e, 'from') && end(e, 'to')); }; // a list it is not is ignored, as validate() says

// the box a card sits in on a view: the innermost of the boxes that list it
const boxOf = (v, id) => { const cs = arrOf(v.containers).filter(Boolean), by = new Map(cs.map(c => [c.id, c]));
  const depth = c => { let d = 0; for (const seen = new Set(); c && !seen.has(c); c = by.get(c.parent)) { seen.add(c); d++; } return d; };
  return cs.filter(c => arrOf(c.nodeIds).includes(id)).reduce((a, c) => !a || depth(c) > depth(a) ? c : a, null); };
// In the same order (diff() says "reorders the steps" when not): the steps in both, paired along a longest common run of what
// they are, then the rest by what they are and last by Ref name, run in the same order in both lists (a step can repeat, so
// a pairing, not a lookup). p, q: [what, Ref name] per step. The common head and tail pair as they stand, so the table spans
// only the steps between them, and only up to cap cells (a trace's view of 20,000 steps, audit 21; a full table ran Node out
// of memory). The run the table pairs is its own: a step on a tie is skipped in p first. A step left unpaired by a longest
// run whose kind the other list also has unpaired pairs across that run, so the steps are in a new order; so past the cap
// the run is looked for only among the paths with no such step, a band of the table's diagonals as wide as the edits they
// make, and when none has a run that long the answer is a reorder. In the band the table's own run is walked, a few of its
// rows kept and the rest worked out again (audit 23: Myers' diff there paired another run as long, and a step's Ref name
// then read the same edit as a reorder or not by the view's size). Time and memory: the rows x the band, and its root
const LCS = 4e6;
// what moved from k0 to k1, the same ids in another order: those off a longest run kept in the old order (O(n log n)), each
// with the id now before it (null: first)
const movedIn = (k0, k1) => { const at = new Map(k0.map((x, i) => [x, i])), p = k1.map(x => at.get(x)), tail = [], prev = new Array(p.length).fill(-1);
  p.forEach((x, i) => { let lo = 0, hi = tail.length; while (lo < hi) { const m = (lo + hi) >> 1; if (p[tail[m]] < x) lo = m + 1; else hi = m; } if (lo) prev[i] = tail[lo - 1]; tail[lo] = i; });
  const run = new Set(); for (let i = tail.length ? tail[tail.length - 1] : -1; i >= 0; i = prev[i]) run.add(i);
  return k1.flatMap((x, i) => run.has(i) ? [] : [[x, i ? k1[i - 1] : null]]); };
const sameOrder = (p, q, cap = LCS) => { let s = 0, e = 0; while (s < p.length && s < q.length && p[s][0] === q[s][0]) s++;
  if (s === p.length && s === q.length) return true;
  while (e < p.length - s && e < q.length - s && p[p.length - 1 - e][0] === q[q.length - 1 - e][0]) e++;
  const pairs = [], P = new Set(), Q = new Set(), by = f => { const n = new Map(); q.forEach((y, j) => { if (Q.has(j)) return; const l = n.get(y[f]); if (l) l.push(j); else n.set(y[f], [j]); });
    const at = new Map(); p.forEach((x, i) => { const js = !P.has(i) && n.get(x[f]), k = at.get(js) || 0; if (js && k < js.length) { const j = js[k]; at.set(js, k + 1); pairs.push([i, j]); P.add(i); Q.add(j); } }); };
  const two = (i, j) => { pairs.push([i, j]); P.add(i); Q.add(j); };
  for (let k = 0; k < s; k++) two(k, k);
  for (let k = 1; k <= e; k++) two(p.length - k, q.length - k);
  const a = p.length - e, b = q.length - e, w = b - s + 1; // the middle: p[s, a) and q[s, b)
  if ((a - s + 1) * w <= cap) { const T = new Int32Array((a - s + 1) * w), t = (i, j) => T[(i - s) * w + j - s];
    for (let i = a - 1; i >= s; i--) for (let j = b - 1; j >= s; j--) T[(i - s) * w + j - s] = p[i][0] === q[j][0] ? t(i + 1, j + 1) + 1 : Math.max(t(i + 1, j), t(i, j + 1));
    for (let i = s, j = s; i < a && j < b;) if (p[i][0] === q[j][0]) two(i++, j++); else if (t(i + 1, j) >= t(i, j + 1)) i++; else j++; }
  else { const id = new Map(), num = x => id.get(x[0]) ?? id.set(x[0], id.size).get(x[0]), A0 = Int32Array.from(p.slice(s, a), num), B0 = Int32Array.from(q.slice(s, b), num), c = new Int32Array(2 * id.size);
    A0.forEach(k => c[2 * k]++); B0.forEach(k => c[2 * k + 1]++);
    let most = 0; for (let k = 0; k < id.size; k++) most += Math.min(c[2 * k], c[2 * k + 1]);
    // the band spans only the steps of a kind both middles hold (audit 24: with the rest in, 20,000 new ids walked 20,000 x
    // 40,001 cells for nothing). A step of a kind one list alone has changes no cell of the table, t(i, j) = T(fa[i], fb[j]),
    // so the walk below goes step by step in the lists as they are, reading the band, and pairs the table's own run
    const N0 = A0.length, M0 = B0.length, both = k => c[2 * k] && c[2 * k + 1];
    if (most) { const fa = new Int32Array(N0 + 1), fb = new Int32Array(M0 + 1);
      for (let i = 0; i < N0; i++) fa[i + 1] = fa[i] + (both(A0[i]) ? 1 : 0); for (let j = 0; j < M0; j++) fb[j + 1] = fb[j] + (both(B0[j]) ? 1 : 0);
      const A = A0.filter(both), B = B0.filter(both);
      // the table's cell (i, j), i - j from most - m to n - most, at row i and column j - i + hi; NO off the band or the lists
      const n = A.length, m = B.length, hi = n - most, W = n + m - 2 * most + 1, NO = -(1 << 29), K = Math.ceil(Math.sqrt(n + 1));
      const row = (i, nx, cur) => { for (let c = W - 1; c >= 0; c--) { const j = i - hi + c;
        cur[c] = j < 0 || j > m ? NO : i === n || j === m ? 0 : A[i] === B[j] ? nx[c] + 1 : Math.max(c ? nx[c - 1] : NO, c < W - 1 ? cur[c + 1] : NO); } };
      const kept = new Map(); let nx = new Int32Array(W), cur = new Int32Array(W);
      for (let i = n; i >= 0; i--) { row(i, nx, cur); if (i % K === 0 || i === n) kept.set(i, cur.slice()); [nx, cur] = [cur, nx]; }
      if (nx[hi] < most) return false;
      for (let i = 0, j = 0, r0 = 0; i < N0 && j < M0; r0 += K) { const r1 = Math.min(r0 + K, n), R = new Array(r1 - r0 + 1); R[r1 - r0] = kept.get(r1);
        for (let r = r1 - 1; r >= r0; r--) { R[r - r0] = new Int32Array(W); row(r, R[r - r0 + 1], R[r - r0]); }
        const t = (i, j) => { const x = fa[i], y = fb[j], c = y - x + hi; return c < 0 || c >= W ? NO : R[x - r0][c]; };
        while (i < N0 && j < M0 && (fa[i] < r1 || r1 === n)) { if (A0[i] === B0[j]) two(s + i++, s + j++);
          else if (t(i + 1, j) >= t(i, j + 1)) i++; else j++; } } } }
  by(0); by(1); return pairs.sort((x, y) => x[0] - y[0]).every((x, k, l) => !k || l[k - 1][1] < x[1]); };

/** What changed from one model to the next, as one model to draw: `after`, with each card and line marked added, changed
 *  or removed (removed ones come back from `before`, in their views, boxes and places), a summary in words, and the
 *  views that show a change. Cards and lines are matched by id (a line without one by its ends, as a Ref names it). */
export function diff(before, after) {
  before = unreadable(before).model; after = unreadable(after).model; // each read as validate() and mapContext read it (audit 20)
  const arr = arrOf, A = copyOf(before || {}), out = copyOf(after || {}); // a host's function stays as it is (audit 24)
  const how = new Map(), was = new Map(), said = []; // each marked card or line: added, changed or removed; a changed one's [before, after]
  const card = (x, h) => ({ ...x, change: h });
  const line = (x, h) => ({ ...x, change: h, ...(h === 'changed' ? { edited: true } : { style: h }) });
  function mark(old, now, put, keys = l => l.map(x => x && x.id), inPlace) { // now's items, marked; old's that left come back, marked removed; inPlace: the removed model lines' ids
    const ko = keys(old), kn = keys(now), O = new Map(Array.from(old, (x, i) => [ko[i], x])), kept = new Set(kn); // a list's hole as undefined, as map() would keep it and Map() throws on (audit 28)
    const res = now.map((x, i) => { if (!x || typeof x !== 'object') return x; const o = O.get(kn[i]);
      if (o && typeof o === 'object' && canon(o) === canon(x)) return x;
      const h = o && typeof o === 'object' ? 'changed' : 'added', y = put(x, h); how.set(y, h); if (h === 'changed') was.set(y, [o, x]); return y; });
    const R = [...res]; let at = 0; // in a view's lines (a sequence's are its time order) after the old one before it that stayed, else at the end
    old.forEach((x, i) => { if (kept.has(ko[i])) at = res.indexOf(R[kn.indexOf(ko[i])]) + 1;
      else if (x && typeof x === 'object') { const y = put(x, 'removed'); how.set(y, 'removed'); res.splice(inPlace ? at++ : res.length, 0, y); }
      else if (inPlace && inPlace.has(x)) res.splice(at++, 0, inPlace.get(x)); }); // a removed model line a view named, or one it hid, in its place too
    return res;
  }
  out.nodes = mark(arr(A.nodes), arr(out.nodes), card);
  const E1 = arr(out.edges); // the after model's lines as given, before the removed ones come back
  out.edges = mark(arr(A.edges), arr(out.edges), line, lineKeys);
  const goneLines = new Map(out.edges.filter(e => how.get(e) === 'removed' && e.id != null).map(e => [String(e.id), String(e.id)]));
  const keyed = l => { const k = lineKeys(l); return new Map(Array.from(l, (e, i) => [e, k[i]])); }, k1 = new Set(lineKeys(arr(after && after.edges)));
  const line0 = new Map([...keyed(arr(A.edges))].filter(([e, k]) => e && typeof e === 'object' && k1.has(k)).map(([e, k]) => [k, e])); // model lines in both, by their Ref name (an id-less one by its ends)
  const V0 = new Map(arr(A.views).filter(Boolean).map(v => [v.id, v])), V1 = new Set(arr(out.views).filter(Boolean).map(v => v.id));
  const stepped = x => x.render === 'sequence' || (diagramOf(x) || {}).steps === true; // a view that numbers its lines by their order (a C4 dynamic view's steps, audit 18)
  const moved = [], touched = new Set(), viewSaid = []; // cards put into or taken out of a view; views whose cards the diff marks there; what only a view changes
  // a view's picture, as its nodes, lines and bands are placed: the old model's, and the old model's with the view's kept cards
  // in their new order (audit 42); null where it cannot be laid out, which reads as changed
  let c0; const geoOf = (c, id) => { try { const [g] = held(() => c().buildGeo(id)), at = l => arr(l).filter(x => x && typeof x === 'object');
    const set = l => l.map(x => canon(x)).sort(); // as a set: the lists' own order follows nodeIds, the picture need not
    return canon([set(at(g.nodes).map(n => [n.id, n.x, n.y, n.w, n.h])), set(at(g.edges).map(e => [e._id ?? e.id, e.pts ?? null])), ...['bands', 'lanes', 'groups'].map(k => set(at(g[k]).map(b => [b.id, b.x, b.y, b.w, b.h])))]); } catch { return null; } };
  // audit 43: each view laid out twice, in a context of the whole model made for it, took a second a view. Now one context holds
  // every view's new order; a plain view whose grid slots do not change (each card ranked to the same slot, or pinned with no
  // lines) draws the same and is not laid out (a pinned one with lines is: they are routed in its cards' order, audit 44); the
  // others are, once in each context
  const keptOrder = (o, k1) => { const q = [...k1], put = new Set(k1), seen = new Set(); return arr(o.nodeIds).map(x => typeof x === 'string' && put.has(x) && !seen.has(x) && seen.add(x) ? q.shift() : x); };
  const order1 = new Map(); arr(out.views).forEach(v => { const o = v && V0.get(v.id); if (!o) return;
    const ks = new Set(arr(v.nodeIds).filter(x => typeof x === 'string')), ko = new Set(arr(o.nodeIds).filter(x => typeof x === 'string'));
    const k0 = [...ko].filter(x => ks.has(x)), k1 = [...ks].filter(x => ko.has(x)); if (k0.some((x, i) => x !== k1[i])) order1.set(o, keptOrder(o, k1)); });
  let c1; const ctx0 = () => (c0 ||= held(() => mapContext(A))[0]), ctx1 = () => (c1 ||= held(() => mapContext({ ...A, views: arr(A.views).map(w => order1.has(w) ? { ...w, nodeIds: order1.get(w) } : w) }))[0]);
  const reordered = o => { if (!order1.has(o) || arr(A.views).indexOf(o) < 0) return true;
    let a = null, b = null; try { a = held(() => ctx0().gridKey(o.id))[0]; b = a == null ? null : held(() => ctx1().gridKey(o.id))[0]; } catch { a = null; }
    if (a != null && a === b) return false;
    const g0 = geoOf(ctx0, o.id), g1 = geoOf(ctx1, o.id);
    return g0 == null || g1 == null || g0 !== g1; };
  const views = arr(out.views).map(v => {
    const o = v && V0.get(v.id); if (!v) return v;
    if (!o) { touched.add(v.id); // an added view comes with everything of its own added, as a removed one goes
      const w = { ...v }; if (Array.isArray(v.nodes)) w.nodes = v.nodes.map(n => { if (!n || typeof n !== 'object') return n; const y = card(n, 'added'); how.set(y, 'added'); return y; });
      if (Array.isArray(v.edges)) w.edges = v.edges.map(e => e && typeof e === 'object' ? line(e, 'added') : e); return w; }
    const w = { ...v }, ids = arr(v.nodeIds), oldIds = arr(o.nodeIds);
    if (v.nodes || o.nodes) w.nodes = mark(arr(o.nodes), arr(v.nodes), card);
    const at = new Map([...out.nodes, ...arr(w.nodes)].filter(Boolean).map(n => [n.id, n]));
    const left = oldIds.filter(id => !ids.includes(id)), came = ids.filter(id => !oldIds.includes(id)), ov = idTable(v.nodeOverrides); // ov['__proto__'] = ... is an own key
    w.nodeIds = [...ids, ...left];
    left.forEach(id => { if (how.get(at.get(id)) !== 'removed') { ov[id] = { ...(o.nodeOverrides || {})[id], change: 'removed' }; moved.push(['takes', id, v]); } });
    came.forEach(id => { if (at.get(id) && how.get(at.get(id)) !== 'added') { ov[id] = { ...ov[id], change: 'added' }; moved.push(['puts', id, v]); } });
    if (left.length || came.length) touched.add(v.id);
    // what only the view changes: its title, a box's name, a card's name here (nodeOverrides) or the box it sits in
    const vn = labelOr(v.title, v.id), says = t => { viewSaid.push(`${t} in the view ${vn}`); touched.add(v.id); }, bn = c => String(labelOr(c.label, c.id)); // a box labelled "" is drawn by its id (audit 35); by its label alone, as drawn: a box has no title (audit 36)
    if (String(labelOr(o.title, o.id)) !== String(vn)) { viewSaid.push(`retitles the view ${labelOr(o.title, o.id)} to ${vn}`); touched.add(v.id); }
    // and what else it draws differently (audit 15): its caption, lanes and the like, a box's tone or badges, a card's pin
    const other = (x, y, skip) => [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => !skip.includes(k) && canon(x[k]) !== canon(y[k]));
    const vk = other(o, v, ['id', 'title', 'nodeIds', 'nodes', 'edges', 'containers', 'nodeOverrides', 'layout', 'present', 'fragments']); // a card's pin and present: said with the card
    // present keyed by what is no card of the view (a port's side, a part's ports, audit 17), or present that is no table: said with the view
    const tb = x => x && typeof x === 'object' && !Array.isArray(x), P0 = tb(o.present) ? o.present : {}, P1 = tb(v.present) ? v.present : {};
    if (canon(o.present) !== canon(v.present) && ((o.present != null && !tb(o.present)) || (v.present != null && !tb(v.present))
      || [...new Set([...Object.keys(P0), ...Object.keys(P1)])].some(k => !ids.includes(k) && !oldIds.includes(k) && canon(P0[k]) !== canon(P1[k])))) vk.push('present');
    if (vk.length) { viewSaid.push(`changes the view ${vn} (${vk.join(', ')})`); touched.add(v.id); }
    const ob = new Map(arr(o.containers).filter(Boolean).map(c => [c.id, c]));
    arr(v.containers).forEach(c => { const b = c && ob.get(c.id); if (!b) return; if (bn(b) !== bn(c)) says(`renames the box ${bn(b)} to ${bn(c)}`);
      const bk = other(b, c, ['id', 'label', 'title', 'nodeIds']); if (bk.length) says(`changes the box ${bn(c)} (${bk.join(', ')})`); });
    ids.filter(id => oldIds.includes(id)).forEach(id => { const a = (o.nodeOverrides || {})[id] || {}, b = (v.nodeOverrides || {})[id] || {}, base = labelOr((at.get(id) || {}).label, id), cardName = l => (l == null ? base : labelOr(l, id)); // an override "" draws the card by its id (audit 35)
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => canon(a[k]) !== canon(b[k])), b0 = boxOf(o, id), b1 = boxOf(v, id);
      if (canon((o.present || {})[id]) !== canon((v.present || {})[id])) keys.push('present'); // its compartments shown (a typed view's present, by card)
      const rest = keys.filter(k => k !== 'label');
      if (keys.length) says((keys.includes('label') ? `renames ${cardName(a.label)} to ${cardName(b.label)}` : `changes ${cardName(b.label)}`) + (rest.length ? ` (${rest.join(', ')})` : ''));
      if ((b0 && b0.id) !== (b1 && b1.id)) says(`moves ${cardName(b.label)} ${b0 ? 'out of ' + bn(b0) : ''}${b0 && b1 ? ' ' : ''}${b1 ? 'into ' + bn(b1) : ''}`);
      else if (canon((o.layout || {})[id]) !== canon((v.layout || {})[id])) says(`moves ${cardName(b.label)}`);
      if ((keys.length || (b0 && b0.id) !== (b1 && b1.id)) && !how.has(at.get(id))) ov[id] = { ...ov[id], change: 'changed' }; });
    if (Object.keys(ov).length) w.nodeOverrides = plain(ov);
    if (left.length && Array.isArray(v.containers)) // a removed card stays in its box, and in its place on a view laid out by hand when that is free
      w.containers = v.containers.map(c => { const back = left.filter(id => c && arr(o.containers).some(b => b && b.id === c.id && arr(b.nodeIds).includes(id))); return back.length ? { ...c, nodeIds: [...arr(c.nodeIds), ...back] } : c; });
    if (left.length && v.layout && o.layout) { const L = idTable(v.layout), taken = new Set(Object.values(L).map(String));
      left.forEach(id => { const p = o.layout[id]; if (Array.isArray(p) && !taken.has(String(p))) { L[id] = p; taken.add(String(p)); } }); w.layout = plain(L); }
    // a model line the view hid or showed (its ends staying), and a sequence's steps in a new order: said, and marked in a list
    const shown = (m, x) => { const K = keyed(arr(m.edges));
      return linesOf(m, x).filter(e => line0.has(K.get(e)) && !left.includes(e.from) && !left.includes(e.to) && !came.includes(e.from) && !came.includes(e.to)).map(e => K.get(e)); };
    const s0 = shown(A, o), s1 = shown(out, v), hid = s0.filter(id => !s1.includes(id)), put = s1.filter(id => !s0.includes(id));
    const ln = id => { const e = line0.get(id); return `the line from ${labelOr((at.get(e.from) || {}).label, e.from)} to ${labelOr((at.get(e.to) || {}).label, e.to)}${labelOr(e.label, null) != null ? ` (${e.label})` : ''}`; };
    hid.forEach(id => { viewSaid.push(`takes ${ln(id)} out of the view ${vn}`); touched.add(v.id); }); put.forEach(id => says(`puts ${ln(id)}`));
    // the steps' order: a view's list as it runs (a model line by id, one of its own by its id), else its model lines. A step
    // with no id is matched by what it is (its ends and label), and by its Ref name only when nothing matches it, so taking
    // out an earlier a->b step does not read as the later one moving (audit 20)
    const what = e => 'c' + canon([e.from, e.to, e.label ?? null]);
    const ord = (x, s, E) => { if (Array.isArray(x.edges)) { const k = lineKeys(x.edges);
        return x.edges.map((e, i) => typeof e === 'string' ? (s.includes(e) ? ['=' + e, '=' + e] : null) : e && typeof e === 'object' ? [e.id != null ? '+' + e.id : what(e), '+' + k[i]] : null).filter(Boolean); }
      const K = keyed(E); return linesOf({ edges: E }, x).map(e => e.id != null ? ['=' + e.id, '=' + e.id] : [what(e), '=' + K.get(e)]); };
    const q0 = ord(o, s0, arr(A.edges)), q1 = ord(v, s1, E1), two = l => l.map(k => [k, k]);
    // a numbered-card view with no stepIds numbers its cards in nodeIds order (audit 19)
    const numbered = x => (x.mainSteps || x.render === 'process') && !Array.isArray(x.stepIds);
    if ((stepped(v) && stepped(o) && !sameOrder(q0, q1)) || (numbered(v) && numbered(o) && !sameOrder(two(oldIds), two(ids)))) says('reorders the steps');
    // the cards it keeps in a new order (audit 42): a sequence's lifelines, a timing view's lanes, an activity's partitions, a
    // mindmap's subtopics, a layered view's ranks are drawn in nodeIds order. Said, and the view listed, when the picture of
    // the old model with only that order changed differs from the old one's (a view whose cards are pinned draws the same)
    else if (!(numbered(v) && numbered(o))) { const ks = new Set(ids.filter(x => typeof x === 'string')), ko = new Set(oldIds.filter(x => typeof x === 'string'));
      const k0 = [...ko].filter(x => ks.has(x)), k1 = [...ks].filter(x => ko.has(x));
      if (k0.some((x, i) => x !== k1[i]) && reordered(o)) { const mv = movedIn(k0, k1), ovr = v.nodeOverrides && typeof v.nodeOverrides === 'object' ? v.nodeOverrides : {};
        const cn = id => { const x = Object.hasOwn(ovr, id) ? ovr[id] : null; return String(labelOr(x && typeof x === 'object' && x.label != null ? x.label : (at.get(id) || {}).label, id)); };
        if (mv.length > 3) says(`reorders ${mv.length} cards`); else mv.forEach(([id, p]) => says(`moves ${cn(id)} ${p == null ? 'to the start' : 'after ' + cn(p)}`)); } }
    if (Array.isArray(v.edges)) { const back = new Map([...goneLines, ...hid.map(id => [id, line(line0.get(id), 'removed')])]);
      w.edges = mark(arr(o.edges), v.edges, line, lineKeys, back).map(e => typeof e === 'string' && put.includes(e) ? line(out.edges.find(x => x && String(x.id) === e), 'added') : e);
      hid.forEach(id => { if (!w.edges.includes(back.get(id))) w.edges.push(back.get(id)); }); } // hidden from a view that listed none: at the end
    else if (Array.isArray(o.edges)) { // a view that dropped its list: its lines listed (to the cards that left too), the ones it puts marked, and the old
      // list's own and removed lines back in their place (as tags first: mark() keeps a string, so only those come back marked)
      const K = keyed(arr(out.edges)), all = linesOf(out, w), tag = all.map((e, i) => e.id != null ? String(e.id) : '\0' + i), by = new Map(tag.map((t, i) => [t, all[i]]));
      w.edges = mark(arr(o.edges), tag, line, lineKeys, goneLines).map(t => { const e = typeof t === 'string' && by.get(t);
        return !e ? t : put.includes(K.get(e)) ? line(e, 'added') : e.id != null ? t : e; }); }
    return w;
  });
  arr(A.views).forEach(o => { if (!o || V1.has(o.id)) return; // a removed view comes back with everything in it removed
    const ov = idTable(o.nodeOverrides);
    arr(o.nodeIds).forEach(id => { ov[id] = { ...ov[id], change: 'removed' }; });
    const w = { ...o, nodeOverrides: plain(ov) };
    if (o.nodes) w.nodes = o.nodes.map(n => { const y = card(n, 'removed'); how.set(y, 'removed'); return y; });
    if (Array.isArray(o.edges)) w.edges = o.edges.map(e => e && typeof e === 'object' ? line(e, 'removed') : e);
    touched.add(o.id); views.push(w); });
  out.views = views;

  // a removed item whose owner left too (a message in a fragment's operand, a state in a region) brings that owner back,
  // removed, in its place: a member into its element, a fragment into its view
  const at0 = new Map(), have = new Map(), ownIn = (x, to, up, i) => { // id -> [the object, where it sits]
    for (const s = [[x, up, i]]; s.length;) { const [y, u, j] = s.pop(); if (!y || typeof y !== 'object' || y.id == null || to.has(y.id)) continue;
      to.set(y.id, [y, u, j]); arr(y.members).forEach((z, k) => s.push([z, y.id, k])); } };
  arr(A.nodes).forEach(n => ownIn(n, at0)); arr(A.views).forEach(v => v && arr(v.fragments).forEach((f, i) => ownIn(f, at0, { view: v.id }, i)));
  out.nodes.forEach(n => ownIn(n, have)); views.forEach(v => v && [...arr(v.nodes), ...arr(v.fragments)].forEach(n => ownIn(n, have)));
  // a member that left an element that stayed: the summary says it went, not that its owner's members changed; one a removed
  // line ends on (a part, a port) comes back, removed, in its place, so the line's ends hold and it is drawn
  const lost = new Map(), need = new Set(), top = id => { let t = id; while (at0.has(t) && typeof at0.get(t)[1] === 'string') t = at0.get(t)[1]; return t; };
  [...out.edges, ...views.flatMap(v => arr(v && v.edges))].forEach(e => { if (!e || how.get(e) !== 'removed') return; const p = (e.props && e.props.ends) || {};
    [e.from, e.to, (p.from || {}).part, (p.to || {}).part].forEach(r => { for (let t = r; at0.has(t) && !have.has(t) && !need.has(t); t = at0.get(t)[1]) need.add(t); }); });
  at0.forEach(([x, up, i], id) => { if (typeof up !== 'string' || have.has(id) || !have.has(up)) return; lost.set(id, [x, top(up), up]);
    if (!need.has(id)) return; const o = have.get(up)[0], y = { ...copyOf(x), change: 'removed' };
    (o.members = [...arr(o.members)]).splice(Math.min(i, o.members.length), 0, y); ownIn(y, have, up, i); });
  // a member new to an element that stayed (audit 46: an added part, port or lane drawn as live): marked added, and said
  // "adds X to Y"; what it holds is new with it. Only an element's (a card's) members: a fragment's operands are the sequence's
  const rooted = new Set(); [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { for (const s = [n]; s.length;) { const x = s.pop();
    if (!x || typeof x !== 'object' || x.id == null || rooted.has(x.id)) continue; rooted.add(x.id); arr(x.members).forEach(y => s.push(y)); } });
  const gained = new Map(); have.forEach(([x, up], id) => { if (typeof up !== 'string' || at0.has(id) || !at0.has(up) || !rooted.has(id)) return;
    gained.set(id, [x, top(up), up]); x.change = 'added'; });
  const strip = x => { const y = copyOf(x), seen = new Set(); for (const s = [y]; s.length;) { const z = s.pop(); if (seen.has(z)) continue; seen.add(z); if (Array.isArray(z.members)) { const k = z.members.filter(m => !(m && typeof m === 'object' && (lost.has(m.id) || gained.has(m.id)))); if (!k.length) delete z.members; else z.members = k; arr(z.members).forEach(m => m && typeof m === 'object' && s.push(m)); } } return y; };

  // the summary: views, then cards, then lines, in model order; a line to a card that came or went goes with the card
  const cards = [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].filter(Boolean);
  const named = new Map([...views.flatMap(v => arr(v && v.containers)), ...cards, ...[...lost.values(), ...gained.values()].map(([y]) => y), ...[...lost.values(), ...gained.values()].map(([, , u]) => (have.get(u) || [])[0])].filter(Boolean).map(n => [n.id, n]));
  const name = id => String(labelOr((named.get(id) || (have.get(id) || at0.get(id) || [])[0] || {}).label, id)); // a member that stayed (a lane in its pool, audit 47) by its label too
  // a line's end on a member, as describe() names it (audit 18): a port by its owner ("orders of Shop API"), an end through a part by
  // that part ("charge of battery"); else a member by its own name
  const ups = id => { const s = []; for (let t = id, r; (r = have.get(t) || at0.get(t)) && typeof r[1] === 'string' && !s.includes(r[1]);) s.push(t = r[1]); return s; };
  const endName = (e, k) => { const id = e[k], r = have.get(id) || at0.get(id), part = (((e.props && e.props.ends) || {})[k] || {}).part, own = r && r[1];
    if (!r || typeof own !== 'string') return name(id); const m = r[0], word = elName, pr = part != null && (have.get(part) || at0.get(part));
    return word(m) + (part != null && part !== id ? ' of ' + (pr ? word(pr[0]) : name(part)) : /\.Port$/.test(String(m.type)) ? ' of ' + name(own) : ''); };
  const cardHow = new Map([...cards.filter(n => how.has(n)).map(n => [n.id, how.get(n)]), ...[...lost.keys()].map(id => [id, 'removed'])]);
  const lines = [...new Set([...out.edges.filter(e => e && typeof e === 'object'), ...views.flatMap(v => arr(v && v.edges).filter(e => e && typeof e === 'object'))])]; // a view that dropped its list holds the model's lines themselves
  const diffKeys = ([o, x]) => [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(k => canon(o[k]) !== canon(x[k]));
  views.forEach(v => { if (v && !V0.has(v.id)) said.push(`adds the view ${labelOr(v.title, v.id)}`); });
  arr(A.views).forEach(o => { if (o && !V1.has(o.id)) said.push(`removes the view ${labelOr(o.title, o.id)}`); });
  cards.forEach(n => { const h = how.get(n);
    if (h === 'added') { // each card at the far end named once, however many lines join them (audit 27: "to Queue and Queue")
      const far = (k, j) => [...new Set(lines.filter(e => e[k] === n.id && how.get(e) === 'added').map(e => name(e[j])))], ins = far('to', 'from'), outs = far('from', 'to');
      const both = ins.filter(x => outs.includes(x)), only = (l, w) => (l = l.filter(x => !both.includes(x))).length ? `, ${w} ${andList(l)}` : '';
      said.push(`adds ${name(n.id)}` + (ins.length === 1 && outs.length === 1 && !both.length ? ` between ${ins[0]} and ${outs[0]}` : only(ins, 'from') + only(outs, 'to') + (both.length ? `, to and from ${andList(both)}` : ''))); }
    if (h === 'removed') said.push(`removes ${name(n.id)}`);
    lost.forEach(([y, t, u]) => { if (t === n.id) said.push(`removes ${name(y.id)} from ${name(u)}`); });
    gained.forEach(([y, t, u]) => { if (t === n.id) said.push(`adds ${name(y.id)} to ${name(u)}`); });
    if (h === 'changed') { const [o, x] = [...lost.values(), ...gained.values()].some(([, t]) => t === n.id) ? was.get(n).map(strip) : was.get(n); if (canon(o) === canon(x)) return; const keys = diffKeys([o, x]), rest = keys.filter(k => k !== 'label'), p0 = o.parent ?? null, p1 = x.parent ?? null;
      if (keys.join() === 'parent' && p0 !== p1 && A.schemaVersion === 2 && out.schemaVersion === 2) return said.push(`moves ${name(n.id)} ${p1 != null ? 'into ' + name(p1) : 'out of ' + name(p0)}`); // a re-own (schema version 2; absent or null is no owner)
      const t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t); // a typed element's own words (src/uml/diff.js)
      said.push((keys.includes('label') ? `renames ${labelOr(o.label, o.id)} to ${labelOr(x.label, x.id)}` : `changes ${name(n.id)}`) + (rest.length ? ` (${rest.join(', ')})` : '')); } });
  lines.forEach(e => { const h = how.get(e), p = (e.props && e.props.ends) || {}; // an end on a part: the part counts as its card
    if (!h || h !== 'changed' && [e.from, e.to, (p.from || {}).part, (p.to || {}).part].some(id => id != null && cardHow.get(id) === h)) return;
    const ends = e.from == null && e.to == null ? null : `${endName(e, 'from')} to ${endName(e, 'to')}`, lab = labelOr(e.label, null) != null ? ` (${e.label})` : '', it = ends ? 'the line from ' + ends : labelOr(e.label, e.id); // an item with no ends (an interaction use) by its name
    if (h === 'added') said.push(ends ? `adds a line from ${ends}${lab}` : `adds ${it}`);
    if (h === 'removed') said.push(ends ? `removes ${it}${lab}` : `removes ${it}`);
    if (h === 'changed') { const [o, x] = was.get(e), t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t);
      said.push(`changes ${it} (${diffKeys([o, x]).map(k => k === 'label' ? `label ${labelOr(o.label, '-')} → ${labelOr(x.label, '-')}` : k).join(', ')})`); } });
  // the rules: each added, removed or changed said, and the views where what they find changes touched
  const R0 = arr(A.rules), R1 = arr(out.rules);
  if (canon(R0) !== canon(R1)) { const rk = (r, i) => r && typeof r === 'object' && r.id != null ? String(r.id) : '#' + i, rn = r => String(labelOr(r && typeof r === 'object' ? labelOr(r.title, r.id) : null, 'a rule')); // a title 0 by it (audit 34)
    const m0 = new Map(R0.map((r, i) => [rk(r, i), r])), m1 = new Map(R1.map((r, i) => [rk(r, i), r]));
    m1.forEach((r, k) => { if (!m0.has(k)) said.push(`adds the rule ${rn(r)}`); else if (canon(m0.get(k)) !== canon(r)) said.push(`changes the rule ${rn(r)}`); });
    m0.forEach((r, k) => { if (!m1.has(k)) said.push(`removes the rule ${rn(r)}`); });
    const found = m => { const by = new Map(); rules(m).forEach(b => by.set(b.view, [...(by.get(b.view) || []), b.message].sort())); return by; }, f0 = found(A), f1 = found(out);
    views.forEach(v => { if (v && canon(f0.get(v.id) || []) !== canon(f1.get(v.id) || [])) touched.add(v.id); }); }
  // the stories and lenses, as the rules are, and the map's title and any other field of the model's own: none is drawn on a
  // view, but a change to one is a change (audit 31: diff --base said "No map model changed." for a story's caption)
  const listed = (k, word) => { const L0 = arr(A[k]), L1 = arr(out[k]); if (canon(L0) === canon(L1)) return;
    const key = (x, i) => x && typeof x === 'object' && x.id != null ? String(x.id) : '#' + i, nm = x => String(labelOr(x && typeof x === 'object' ? labelOr(x.title, x.id) : null, `a ${word}`));
    const m0 = new Map(L0.map((x, i) => [key(x, i), x])), m1 = new Map(L1.map((x, i) => [key(x, i), x]));
    m1.forEach((x, k) => { if (!m0.has(k)) said.push(`adds the ${word} ${nm(x)}`); else if (canon(m0.get(k)) !== canon(x)) said.push(`changes the ${word} ${nm(x)}`); });
    m0.forEach((x, k) => { if (!m1.has(k)) said.push(`removes the ${word} ${nm(x)}`); }); };
  listed('stories', 'story'); listed('lenses', 'lens');
  const T0 = labelOr((before || {}).title, null), T1 = labelOr((after || {}).title, null); // a title "" is none: the page draws Map (audit 35)
  if (canon(T0) !== canon(T1)) said.unshift(T1 == null ? `takes the title ${String(T0)} off the map` : T0 == null ? `titles the map ${String(T1)}` : `retitles the map ${String(T0)} to ${String(T1)}`);
  const own = new Set(['nodes', 'edges', 'views', 'rules', 'stories', 'lenses', 'title']), B0 = before && typeof before === 'object' ? before : {}, B1 = after && typeof after === 'object' ? after : {};
  const rest = [...new Set([...Object.keys(B0), ...Object.keys(B1)])].filter(k => !own.has(k) && canon(B0[k]) !== canon(B1[k]));
  if (rest.length) said.push(`changes the model (${rest.join(', ')})`);
  moved.forEach(([verb, id, v]) => said.push(`${verb} ${name(id)} ${verb === 'puts' ? 'in' : 'out of'} the view ${labelOr(v.title, v.id)}`));
  said.push(...viewSaid);
  if (TYPED.order) TYPED.order(A, out, views, V0, said, touched, name);

  const W = new Map(views.filter(Boolean).map(v => [v.id, v]));
  const back = [...out.nodes, ...out.edges, ...views.flatMap(v => v ? [...arr(v.nodes), ...arr(v.edges)] : [])].filter(x => x && how.get(x) === 'removed').map(x => x.parent);
  while (back.length) { const chain = []; // the owners that left, from the item's up to one still there
    for (let id = back.pop(); id != null && !have.has(id) && at0.has(id) && !chain.includes(id); id = at0.get(id)[1]) chain.push(id);
    for (const id of chain.reverse()) { if (have.has(id)) continue; const [x, up, i] = at0.get(id), y = { ...copyOf(x), change: 'removed' };
      const v = up && typeof up === 'object' ? W.get(up.view) : null, o = v ? null : (have.get(up) || [])[0];
      if (!v && !o) break;
      const l = v ? (v.fragments = [...arr(v.fragments)]) : (o.members = [...arr(o.members)]); l.splice(Math.min(i, l.length), 0, y);
      ownIn(y, have, up, i); if (v) back.push(y.parent); } }

  // the views that show a change: a card or line the diff marks, or a card it put in or took out
  // a typed view of a model at another schemaVersion draws otherwise (version 1 draws it as a map, audit 39)
  const typedV = v => v.diagram != null && v.diagram !== 'map';
  if (canon(B0.schemaVersion) !== canon(B1.schemaVersion)) views.forEach(v => { if (v && typedV(v)) touched.add(v.id); });
  /* a typed view draws more than it lists (audit 39): a package's box or name over its classes, a part's type and that type's
     ports, a deployed container's name on its instance, the lifelines and messages of the interaction an overview draws
     inline. So it shows a change to any element its own elements name (an id written anywhere in them: a member, a prop, a
     type) or own (their owners, up the tree), and to a view they open. Conservative: a change to such an element that the view
     does not draw lists it too */
  const topOf = new Map(), elOf = new Map(), vids = new Set(views.filter(Boolean).map(v => v.id));
  [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { if (!n || typeof n !== 'object' || n.id == null || elOf.has(n.id)) return; elOf.set(n.id, n);
    for (const s = [n], seen = new Set(); s.length;) { const x = s.pop(); if (!x || typeof x !== 'object' || seen.has(x)) continue; seen.add(x); if (x.id != null && !topOf.has(x.id)) topOf.set(x.id, n.id); arr(x.members).forEach(y => s.push(y)); } });
  // an element named by its name (a part's valueType, an attribute's type), as it was or is: by the name before a rename too
  const named0 = new Map(); [...arr(A.nodes), ...arr(A.views).flatMap(v => arr(v && v.nodes)), ...elOf.values()].forEach(n => { if (n && typeof n === 'object' && typeof n.label === 'string' && topOf.has(n.id) && !named0.has(n.label)) named0.set(n.label, topOf.get(n.id)); });
  // the strings an element's fields hold, but for its own words (audit 43: a C4 container labelled Shop API read as naming the
  // map card Shop API, and its views were listed with the card's change): a name, a caption, a description names nothing
  const wordKeys = new Set(['label', 'sublabel', 'title', 'description', 'note', 'notes', 'doc', 'body', 'text', 'technology', 'caption', 'icon']);
  const texts = x => { const l = []; for (const s = [x], seen = new Set(); s.length;) { const y = s.pop(); if (typeof y === 'string') l.push(y); else if (y && typeof y === 'object' && !seen.has(y)) { seen.add(y); Object.entries(y).forEach(([k, z]) => { if (Array.isArray(y) || !wordKeys.has(k)) s.push(z); }); } } return l; };
  const refs = v => { const ids = new Set(), vs = new Set(), name = s => topOf.has(s) ? topOf.get(s) : typeof s !== 'string' ? null : named0.get(s) ?? named0.get(s.split('::').pop());
    const up = (t, l) => { for (let k = 0; t != null && !ids.has(t) && k < 1e4; k++) { ids.add(t); l.push(t); const p = (elOf.get(t) || {}).parent; t = topOf.has(p) ? topOf.get(p) : null; } };
    let now = []; [...arr(v.nodeIds), ...arr(v.nodes).map(n => n && n.id)].forEach(id => topOf.has(id) && up(topOf.get(id), now));
    linesOf(out, v, ups).forEach(e => [e.from, e.to, ...texts(e.props)].forEach(s => { const n = name(s); if (n != null) up(n, now); }));
    // what its elements name, and what those name in turn (a part's type's port's type), each with its owners
    for (let d = 0; d < 2 && now.length; d++) { const next = []; now.forEach(t => texts(elOf.get(t)).forEach(s => { const n = name(s); if (n != null) up(n, next); else if (vids.has(s)) vs.add(s); })); now = next; }
    return { ids, vs }; };
  const changed = new Set(views.filter(v => v && (touched.has(v.id) || arr(v.nodeIds).some(id => cardHow.has(id)) || linesOf(out, v, ups).some(e => how.has(e)))).map(v => v.id));
  /* what a typed view draws from beyond its own elements and lines (audit 40): the relationships an implied C4 line stands for
     (its type's drawn), a required stereotype's extension, the identifying relationship that makes a shown IDEF1X entity
     dependent (its type's touches), each in the model before and after: listed when one of them is marked */
  // a line a view writes inline is one too (audit 41: an inline identifying relationship makes an IDEF1X entity of another view dependent)
  const lineHow = new Set([...out.edges, ...views.flatMap(v => arr(v && v.edges))].filter(e => e && typeof e === 'object' && e.id != null && how.has(e)).map(e => String(e.id)));
  // and the lines it draws, compared before and after (audit 41): a DFD level's flows change with its parent view's cards, a C4
  // implied line moves with a hidden element moved to another owner (its type's drawnKeys: each line by its ends, else drawn)
  const byId = m => new Map(arr(m.views).filter(w => w && typeof w === 'object').map(w => [w.id, w])), W0 = byId(B0), W1 = byId(B1);
  const keysOf = (T, m, w) => { const f = typeof T.drawnKeys === 'function' ? T.drawnKeys : T.drawn; try { return canon([...new Set(arr(f(m, w)).map(x => String(x)))].sort()); } catch { return null; } };
  if (out.schemaVersion === 2) views.forEach(v => { const T = v && !changed.has(v.id) && typedV(v) && diagramOf(v); if (!T || !T.drawn && !T.touches) return;
    for (const [m, w] of [[out, v], [A, V0.get(v.id)]]) for (const f of [T.drawn, T.touches]) { if (!w || typeof f !== 'function' || changed.has(v.id)) continue;
      try { if (arr(f(m, w)).some(id => cardHow.has(id) || lineHow.has(String(id)))) changed.add(v.id); } catch { /* a model the hook cannot read: as before */ } }
    const w0 = W0.get(v.id), w1 = W1.get(v.id);
    if (!changed.has(v.id) && T.drawn && w0 && w1 && B0.schemaVersion === 2) { const k0 = keysOf(T, B0, w0), k1 = keysOf(T, B1, w1); if (k0 != null && k1 != null && k0 !== k1) changed.add(v.id); } });
  /* the icons table (audit 41): a view is listed when it shows a card whose icon's entry changed, came or went: a map card's
     icon, or a typed card's props.icon (a cloud card's, keyed "<pack>/<icon>"), or one of their owners' (a group's) */
  const icons = m => m.icons && typeof m.icons === 'object' && !Array.isArray(m.icons) ? m.icons : {}, ic0 = icons(B0), ic1 = icons(B1), own1 = (o, k) => Object.hasOwn(o, k) ? o[k] : undefined;
  const iconK = new Set([...Object.keys(ic0), ...Object.keys(ic1)].filter(k => canon(own1(ic0, k)) !== canon(own1(ic1, k))));
  if (iconK.size) { const at = new Map(); [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { if (n && typeof n === 'object' && !at.has(n.id)) at.set(n.id, n); });
    // a typed card's props.icon is looked up as its view's pack's key, "<diagram>/<icon>", as clIcon does (audit 42: not by the
    // key's tail in any pack, which listed an AWS view for a "gcp/Users" entry)
    const hit = (n, pack) => n && typeof n === 'object' && (typeof n.icon === 'string' && iconK.has(n.icon)
      || pack != null && n.props && typeof n.props === 'object' && typeof n.props.icon === 'string' && iconK.has(pack + '/' + n.props.icon));
    views.forEach(v => { if (!v || changed.has(v.id)) return; const ov = v.nodeOverrides && typeof v.nodeOverrides === 'object' ? v.nodeOverrides : {};
      const pack = out.schemaVersion === 2 && typedV(v) && typeof v.diagram === 'string' ? v.diagram : null;
      if ([...arr(v.nodeIds), ...arr(v.nodes).map(n => n && n.id)].some(id => { if (typeof id === 'string' && hit(own1(ov, id), pack)) return true;
        for (let t = id, k = 0, seen = new Set(); t != null && !seen.has(t) && k < 1e4; k++) { seen.add(t); const n = at.get(t); if (hit(n, pack)) return true; t = n && n.parent; } return false; })) changed.add(v.id); }); }
  const typedRefs = out.schemaVersion === 2 ? views.filter(v => v && typedV(v) && !changed.has(v.id)).map(v => [v.id, refs(v)]) : [];
  // a view its elements open: its title is drawn in their names (", opens Checkout"), and an overview draws an interaction inline
  const titled = new Set(views.filter(v => v && V0.has(v.id) && String(labelOr(V0.get(v.id).title, v.id)) !== String(labelOr(v.title, v.id))).map(v => v.id));
  for (let more = true; more;) { more = false; typedRefs.forEach(([id, r]) => { const inl = (diagramOf(W.get(id)) || {}).inlines;
    if (!changed.has(id) && ([...r.ids].some(t => cardHow.has(t)) || [...r.vs].some(x => x !== id && (titled.has(x) || inl && changed.has(x))))) more = !!changed.add(id); }); }
  // a map card's open pill counts what the view it opens draws (audit 40): a map view holding a card that opens a listed view
  // is listed when that count changed, the two models laid out only when asked (a typed view draws no pill)
  let cx; const ctx = i => (cx ||= [before, after].map(m => { try { return held(() => mapContext(m || {}))[0]; } catch { return null; } }))[i];
  const kids = (i, id, vid) => { try { const c = ctx(i); return c ? c.kidCount(id, vid) : null; } catch { return null; } };
  const opened = (i, id, vid) => { try { const c = ctx(i); return c ? c.childOf(id, vid) : null; } catch { return null; } };
  // a card that may open a listed view, as childOf finds one (its view or opensView, a view of its id, a view whose node it is), before or after
  const nodesOf = m => [...arr(m.nodes), ...arr(m.views).flatMap(w => arr(w && w.nodes))].filter(n => n && typeof n === 'object'), byNode = new Map();
  [...nodesOf(A), ...nodesOf(out)].forEach(n => { const l = byNode.get(n.id) || byNode.set(n.id, []).get(n.id); l.push(n); });
  const ofNode = new Set([...arr(A.views), ...views].filter(w => w && changed.has(w.id)).map(w => w.node));
  const may = (id, v) => changed.has(id) || ofNode.has(id) || [...(byNode.get(id) || []), ...[v, V0.get(v.id)].map(w => w && w.nodeOverrides && typeof w.nodeOverrides === 'object' ? w.nodeOverrides[id] : null)]
    .some(n => n && typeof n === 'object' && [n.view, n.opensView].some(o => typeof o === 'string' && changed.has(o)));
  views.forEach(v => { if (v && !changed.has(v.id) && !(out.schemaVersion === 2 && typedV(v)) && arr(v.nodeIds).some(id => typeof id === 'string' && may(id, v) && [0, 1].some(i => changed.has(opened(i, id, v.id))) && kids(0, id, v.id) !== kids(1, id, v.id))) changed.add(v.id); });
  /* a member gone from an element that stayed comes back, removed, in its place when a listed view drew it as its own shape
     (audit 46: a part, port or lane with no line went from the picture): a box, a lane, a region, or a port drawn on a part
     ("<part>-><port>"). A class's attribute or a state's internal transition is a row of its owner, drawn as it is: said, not
     put back. Only the listed typed views are laid out, in the model before, and only when such a member went */
  const back2 = [...lost].filter(([id]) => !need.has(id) && rooted.has(lost.get(id)[2]) && have.has(lost.get(id)[2]));
  if (back2.length) { const drew = new Set();
    for (const v of views) { if (!v || !changed.has(v.id) || !typedV(v) || !V0.has(v.id)) continue;
      try { const [g] = held(() => ctx0().buildGeo(v.id)); ['nodes', 'families', 'lanes', 'groups', 'bands'].forEach(k => arr(g && g[k]).forEach(x => { if (!x || typeof x.id !== 'string') return;
        drew.add(x.id); const j = x.id.lastIndexOf('->'); if (j >= 0) drew.add(x.id.slice(j + 2)); })); } catch { /* a view the old model cannot lay out: nothing to bring back from it */ } }
    back2.forEach(([id, [x, , up]]) => { const [, , i] = at0.get(id), o = have.get(up)[0]; if (!drew.has(id) || arr(o.members).some(m => m && m.id === id)) return; const y = { ...copyOf(x), change: 'removed' };
      (o.members = [...arr(o.members)]).splice(Math.min(i, o.members.length), 0, y); ownIn(y, have, up, i); }); }
  return { model: out, summary: said, views: views.filter(v => v && changed.has(v.id)).map(v => v.id) };
}

/** The map against the traffic seen: a line that carries traffic but is not drawn comes in, dashed rose ("not drawn",
 *  with its calls); a drawn line between two cards that traffic was seen at, with none of its own, fades. `observed`:
 *  [{ from, to, count }], or a Jaeger or Tempo dependency list ([{ parent, child, callCount }], or { data: [...] }). A
 *  service is a card by `options.match[service]`, else by id, else by label (case aside). Counts: lines that carried
 *  traffic, came in undrawn, are idle, or could not be judged (an end traffic never reached), and services with no card,
 *  each a count of model edges (a drawn line that stands for several fades only when all are idle); views: those that
 *  show drift. */
export function drift(model, observed, options = {}) {
  // the model and the traffic: no text String() throws on (audit 20); the match table by name, where a service may be named toString (audit 21)
  const match = nameTable(options && options.match); [model, observed] = [model, observed].map(x => unreadable(x).model);
  const arr = arrOf, out = copyOf(model || {});
  const list = Array.isArray(observed) ? observed : arr(observed && observed.data);
  const cards = [...arr(out.nodes), ...arr(out.views).flatMap(v => arr(v && v.nodes))].filter(n => n && n.id != null);
  const ids = new Set(cards.map(n => String(n.id))), lower = new Map();
  cards.forEach(n => [n.id, n.label].forEach(s => { if (s != null && !lower.has(String(s).toLowerCase())) lower.set(String(s).toLowerCase(), String(n.id)); }));
  const cardOf = s => { s = String(s); const id = match.has(s) ? match.get(s) : ids.has(s) ? s : lower.get(s.toLowerCase()); return ids.has(id) ? id : null; };
  const seen = new Map(), live = new Set(), unmatched = new Set(); let counted = false;
  // an end is a service's name, text or a number: an end that is not (missing, null, or one unreadable() left out) names no
  // service (audit 21: it was listed as a service named "undefined"), and its entry is no traffic; the entry's other end,
  // a name with no card, is still listed in unmatched (audit 22: the docs said the whole entry was skipped)
  const end = x => typeof x === 'string' || typeof x === 'number' ? x : null;
  list.forEach(o => { if (!o || typeof o !== 'object') return;
    const f = end(o.from ?? o.parent), t = end(o.to ?? o.child), n = o.count ?? o.callCount, a = f == null ? null : cardOf(f), b = t == null ? null : cardOf(t);
    if (f != null && a == null) unmatched.add(String(f)); if (t != null && b == null) unmatched.add(String(t));
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
  // a new line's id "drift:a->b", or "drift:a->b-2" and on where the model holds that id, or names "a->b" two ways (audit 41,
  // as sequenceFromTrace(): the model came back failing validate() with a line id used twice)
  const used = usedIds(out), free = x => { let k = x; for (let j = 2; used.has(k); j++) k = `${x}-${j}`; used.add(k); return k; };
  seen.forEach(({ a, b, n }, k) => { if (drawn.has(k)) return; counts.undrawn++;
    const e = { id: free(`drift:${a}->${b}`), from: a, to: b, label: 'not drawn', ...(counted ? { sublabel: `${n.toLocaleString('en-US')} calls` } : {}), style: 'security', drift: 'undrawn' };
    out.edges.push(e);
    arr(out.views).forEach(v => { if (v && Array.isArray(v.edges) && arr(v.nodeIds).includes(a) && arr(v.nodeIds).includes(b)) v.edges.push(e.id); }); });
  return { model: out, counts, views: arr(out.views).filter(v => v && linesOf(out, v).some(e => e.drift)).map(v => v.id) };
}

export { canon, jsonText, markOf, sameOrder };
