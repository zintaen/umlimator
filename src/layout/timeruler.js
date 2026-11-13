import { textW } from '../core/text.js';
import { r2 } from '../draw/shapes.js';

/* ---------- the time ruler (work package 6.4, notes/stage-6.md §6) ----------
   layoutTimeRuler(input) -> out, the geometry of a timing view: no DOM, no model, in layoutTimeAxis's contract (sizes come
   in measured by the type, problems go out, never warn(); slots for the gestures). Time here is a quantity, not an order:
   x is linear in it, one base for every lane (§6.3). Only lib/umlimator-all.js holds this file.

   input = {
     lanes: [{ id, name: { w, h }, form: 'states' | 'values', rows: [{ state, w }],   lifelines, top to bottom; rows: the
              changes: [{ id, at, state, w }] }],                                    states, top first (values: []); a
                                                                                     change's w: its text's width
     messages: [{ id, from, to, sentAt, receivedAt, w, h }],                          from, to: lane ids; w, h: the label
     constraints: [{ id, kind: 'duration' | 'time', from, to, w, h }],                from, to: change ids (time: from only)
     unit,                                                                            text or null
   }
   out = { lanes: [{ id, x, y, w, h, name: { x, y }, rows: [{ state, y }], strip: { y, h } }],
           steps: [{ lane, pts }], bands: [{ lane, segs: [{ x0, x1, text, cut }] }], changes: [{ id, x, y, w, h }],
           lines: [{ id, pts, lbl }], marks: [{ id, kind, pts, lbl }],
           ruler: { y, x0, x1, ticks: [{ t, x, major, label }], unit }, slots: [{ index, x, y, parent, after, t }],
           scale: { t0, t1, k, step }, bounds, problems }
   A lane's rows: its states', then one per state its changes name that the lane does not list (drawn at the bottom; the
   type's change-state says it). Changes are drawn by `at`; two on one lane at one instant: the one whose id sorts last
   (the type's change-instant says it); the other gets no hit box, and a constraint on it is on the one drawn. A step
   line starts at a lane's first change; a band segment's text is null under 16 px, and `cut` when the text (cut at
   160 px) and 12 px do not fit it: the type fits it to x1 - x0 - 12. A duration mark's pts run up the extension line at
   its earlier change, along the dimension line, up the other: [a, b, c, d], the arrows on b and c, its label on the
   line; a time mark's are its 6 px tick, its label to the right, bottoms level. A strip's level is 20 px, or its tallest
   label and 4 px. Ticks start at the first minor tick at or after t0. Slots: on each lane one at every minor tick (a
   fifth of the step); index: how many of the lane's drawn changes are at or before t, after: the last of them.
   Problems: { level, rule, message, ids }: timing-dense (the plot at its 4,800 px cap and changes still under 12 px
   apart, or values cut), timing-label (a message label that meets a step, a value or a label within its sender's lane's
   height), and an item not drawn (a time past ±1e300, an end that is not here, a constraint kind not known). */

const TR = {
  edge: 16, pad: 8, cut: 160, // the margin; a column's padding each side; the widest name and value text
  row: 24, above: 12, band: 24, // a state row's pitch; above the first row and below the last; a value band's height
  gap: 12, room: 12, bare: 16, // two changes' least distance; a value's room in its segment; a segment too short for text
  plot: 480, max: 4800, tick: 64, font: 10, // the plot's least and greatest width; majors' least distance; their labels' size
  lift: 4, level: 20, hit: 12, mark: 6, ruler: 28, // a label over its line, and each move; a strip's level; a change's hit width; a tick; the ruler's height
};

const trArr = x => (Array.isArray(x) ? x : []);
const trNum = x => (Number.isFinite(x) ? x : 0);
const trTime = t => Number.isFinite(t) && Math.abs(t) <= 1e300; // past it the span, a step or t1 + a step is no number
const trNice = x => Number(x.toPrecision(12));
const trFmt = (t, s) => (Math.round(t / s) * s).toFixed(Math.max(0, -Math.floor(Math.log10(s) + 1e-9)));
const trMeets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function layoutTimeRuler(input = {}) {
  const problems = [], say = (level, rule, message, ids) => problems.push({ level, rule, message, ids });
  const unit = input.unit == null || input.unit === '' ? null : String(input.unit);

  // ---- each lane's changes in time order, one per instant (§7.2's change-instant): the id that sorts last
  const byId = new Map(), lanes = trArr(input.lanes).map((ln, j) => {
    const all = trArr(ln.changes).filter(c => trTime(c.at) || (say('error', 'change-time', `change ${c.id}: its time is not a number within ±1e300: not drawn`, [c.id]), false))
      .sort((a, b) => a.at - b.at || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const cs = all.filter((c, i) => !(all[i + 1] && all[i + 1].at === c.at)), L = { ln, j, form: ln.form === 'values' ? 'values' : 'states', cs };
    for (let i = all.length - 1, d; i >= 0; i--) { if (!all[i + 1] || all[i + 1].at !== all[i].at) d = all[i]; byId.set(all[i].id, { L, c: d }); } // a skipped id: the change drawn at its instant
    return L; });
  const laneOf = new Map(lanes.map(L => [L.ln.id, L]));
  const msgs = trArr(input.messages).filter(m => {
    if (!laneOf.has(m.from) || !laneOf.has(m.to)) say('error', 'message-ends', `message ${m.id}: ${laneOf.has(m.from) ? m.to : m.from} is not a lifeline here: not drawn`, [m.id]);
    else if (!trTime(m.sentAt) || !trTime(m.receivedAt)) say('error', 'change-time', `message ${m.id}: its times are not numbers within ±1e300: not drawn`, [m.id]);
    else return true;
    return false; });

  // ---- the scale (§6.3): k the least px per unit that keeps changes 12 px apart, values in their segments and the plot
  // 480 px wide, capped at 4,800; t1 the latest time and half a step; the step the least 1, 2 or 5 × 10ⁿ 64 px apart
  let t0 = 0, tMax = 0;
  const time = t => { if (t < t0) t0 = t; if (t > tMax) tMax = t; };
  lanes.forEach(L => L.cs.forEach(c => time(c.at))); msgs.forEach(m => { time(m.sentAt); time(m.receivedAt); });
  const vw = c => Math.min(TR.cut, trNum(c.w)) + TR.room, top = tMax - t0 >= 1e-90 ? tMax : t0 + 1; // all at one instant (or within 1e-90, past toFixed's digits): one unit
  let need = 0;
  lanes.forEach(L => L.cs.forEach((c, i) => { const n = L.cs[i + 1]; if (n) need = Math.max(need, TR.gap / (n.at - c.at), L.form === 'values' ? vw(c) / (n.at - c.at) : 0); }));
  const stepOf = k => { const wide = s => Math.max(textW(trFmt(t0, s), TR.font), textW(trFmt(tMax + s, s), TR.font)) + TR.gap;
    for (let n = Math.floor(Math.log10(TR.tick / k)) - 1; ; n++) for (const m of [1, 2, 5]) { const s = trNice(m * 10 ** n); if (s * k >= TR.tick && s * k >= wide(s)) return s; } };
  const endOf = (k, s) => Math.max(top, tMax + s / 2, ...lanes.filter(L => L.form === 'values' && L.cs.length).map(L => { const c = L.cs[L.cs.length - 1]; return c.at + vw(c) / k; }));
  const kOf = t1 => Math.min(Math.max(need, TR.plot / (t1 - t0)), TR.max / (t1 - t0));
  let k = kOf(top), step, t1;
  for (let n = 0; n < 40; n++) { step = stepOf(k); t1 = endOf(k, step); const kk = kOf(t1); if (kk === k) break; k = kk; }
  step = stepOf(k); t1 = endOf(k, step);
  if ((t1 - t0) * k > TR.max) { k = TR.max / (t1 - t0); step = stepOf(k); } // not settled in 40 rounds: the cap holds
  const name = Math.min(TR.cut, Math.max(0, ...lanes.map(L => trNum((L.ln.name || {}).w)))) + 2 * TR.pad;

  // ---- each lane's rows, height, and the strip its constraints need
  lanes.forEach(L => {
    L.rows = L.form === 'values' ? [] : trArr(L.ln.rows).map(r => ({ state: r.state, w: trNum(r.w) }));
    const listed = new Set(L.rows.map(r => r.state));
    L.cs.forEach(c => { if (L.form === 'states' && !listed.has(c.state)) { listed.add(c.state); L.rows.push({ state: c.state, w: trNum(c.w) }); } });
    const nh = trNum((L.ln.name || {}).h) + 2 * TR.pad;
    L.h = Math.max(nh, L.form === 'values' ? TR.band + 2 * TR.above : Math.max(1, L.rows.length) * TR.row);
    L.levels = []; L.lh = []; L.marks = []; });
  const states = Math.max(0, ...lanes.flatMap(L => L.rows.map(r => r.w)));
  const X0 = TR.edge + name + (states ? states + 2 * TR.pad : 0), xOf = t => X0 + (t - t0) * k, X1 = xOf(t1);

  const marks = trArr(input.constraints).filter(c => {
    if (c.kind !== 'time' && c.kind !== 'duration') { say('error', 'constraint-kind', `constraint ${c.id}: its kind ${c.kind} is not duration or time: not drawn`, [c.id]); return false; }
    const a = byId.get(c.from), b = c.kind === 'time' ? a : byId.get(c.to);
    if (!a || !b) { say('error', 'constraint-ends', `constraint ${c.id}: ${a ? c.to : c.from} is not a change here: not drawn`, [c.id]); return false; }
    const lo = a.c.at <= b.c.at ? a : b, hi = lo === a ? b : a, L = a.L.j >= b.L.j ? a.L : b.L, w = trNum(c.w), h = trNum(c.h);
    const xa = xOf(lo.c.at), xb = xOf(hi.c.at), cx = (xa + xb) / 2;
    const it = c.kind === 'time' ? { c, a, x0: xa - TR.mark / 2, x1: xa + TR.mark / 2 + TR.lift + w, w, h } : { c, a: lo, b: hi, x0: Math.min(xa, cx - w / 2), x1: Math.max(xb, cx + w / 2), w, h };
    L.marks.push(it); return true; });
  lanes.forEach(L => L.marks.slice().sort((p, q) => p.x0 - q.x0 || (String(p.c.id) < String(q.c.id) ? -1 : 1)).forEach(it => { // greedy, by start
    let v = L.levels.findIndex(end => end + TR.mark <= it.x0); if (v < 0) { v = L.levels.length; L.levels.push(0); }
    L.levels[v] = it.x1; L.lh[v] = Math.max(L.lh[v] || TR.level, trNum(it.h) + TR.lift); it.v = v; })); // a level as tall as its labels, 20 px at least

  // ---- down the page: lanes, their strips, the ruler
  let y = TR.edge;
  lanes.forEach(L => { L.y = y; L.mid = y + L.h / 2; y += L.h; L.sy = y;
    L.top = L.lh.map((h, v) => L.lh.slice(0, v).reduce((s, x) => s + x, 0)); L.sh = L.lh.length ? L.lh.reduce((s, x) => s + x, 0) + TR.lift : 0; y += L.sh; });
  const rulerY = y + TR.pad;
  const rowY = (L, s) => L.y + TR.above + L.rows.findIndex(r => r.state === s) * TR.row;
  const lvl = (L, c) => (L.form === 'values' ? L.mid : rowY(L, c.state));
  const levelAt = (L, t) => { let c = null; for (const d of L.cs) { if (d.at > t) break; c = d; } return c ? lvl(L, c) : L.mid; };

  // ---- steps, bands, the changes' hit boxes
  const steps = [], bands = [], changes = [], obst = [], dense = new Set();
  lanes.forEach(L => {
    const pts = [], segs = [], cs = L.cs;
    cs.forEach((c, i) => { const x = xOf(c.at), yc = lvl(L, c), yp = i ? lvl(L, cs[i - 1]) : yc, n = cs[i + 1];
      if (n && (n.at - c.at) * k < TR.gap - 1e-6) dense.add(n.id);
      if (L.form === 'values') { const x1 = n ? xOf(n.at) : X1, cut = x1 - x < vw(c) - 1e-6;
        if (cut) dense.add(c.id);
        segs.push({ x0: x, x1, text: x1 - x < TR.bare ? null : c.state ?? '', cut: cut || trNum(c.w) > TR.cut });
        if (x1 - x >= TR.bare) { const tw = Math.min(TR.cut, trNum(c.w), x1 - x - TR.room); obst.push({ x: (x + x1 - tw) / 2, y: L.mid - 7, w: tw, h: 14 }); }
        changes.push({ id: c.id, x: x - TR.hit / 2, y: L.mid - TR.band / 2, w: TR.hit, h: TR.band }); return; }
      if (i) pts.push([x, yp]); pts.push([x, yc]);
      const h = Math.max(TR.hit, Math.abs(yc - yp));
      changes.push({ id: c.id, x: x - TR.hit / 2, y: (yc + yp) / 2 - h / 2, w: TR.hit, h }); });
    if (L.form === 'values') { if (segs.length) bands.push({ lane: L.ln.id, segs }); return; }
    if (!cs.length) return;
    pts.push([X1, lvl(L, cs[cs.length - 1])]);
    steps.push({ lane: L.ln.id, pts });
    pts.slice(1).forEach((q, i) => { const p = pts[i]; obst.push({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) }); }); });
  // a duplicate at one instant is not dense: it is skipped, and the type's change-instant says so
  if (dense.size) say('warning', 'timing-dense', `the ruler is at its ${TR.max} px cap: ${dense.size} change${dense.size > 1 ? 's are' : ' is'} closer than ${TR.gap} px to the one before, or ${dense.size > 1 ? 'have their values' : 'has its value'} cut`, [...dense].sort());

  // ---- constraints in their strips (§6.6), placed before the messages, whose labels then keep off theirs
  const outMarks = lanes.flatMap(L => L.marks.map(it => {
    const yl = L.sy + L.top[it.v] + L.lh[it.v] - TR.lift; // the dimension line, or the tick's middle; its label on it
    if (it.c.kind === 'time') { const x = xOf(it.a.c.at);
      return { id: it.c.id, kind: 'time', pts: [[x, yl - TR.mark / 2], [x, yl + TR.mark / 2]], lbl: { x: x + TR.mark / 2 + TR.lift, y: yl + TR.mark / 2 - it.h, w: it.w, h: it.h } }; }
    const xa = xOf(it.a.c.at), xb = xOf(it.b.c.at);
    return { id: it.c.id, kind: 'duration', pts: [[xa, lvl(it.a.L, it.a.c)], [xa, yl], [xb, yl], [xb, lvl(it.b.L, it.b.c)]], lbl: { x: (xa + xb) / 2 - it.w / 2, y: yl - it.h, w: it.w, h: it.h } }; }))
    .map(o => ({ ...o, pts: o.pts.map(p => p.map(r2)), lbl: { x: r2(o.lbl.x), y: r2(o.lbl.y), w: r2(o.lbl.w), h: r2(o.lbl.h) } }));
  outMarks.forEach(o => obst.push(o.lbl));

  // ---- messages: straight from the sender's level at sentAt to the receiver's at receivedAt; each label 4 px over its
  // middle, moved up 4 px at a time, at most its lane's height, until it meets nothing placed before it (§6.5).
  // ponytail: quadratic in labels, with the obstacles filtered by x once per message; a grid of buckets if views grow
  const lines = msgs.map(m => {
    const A = laneOf.get(m.from), B = laneOf.get(m.to), p = [xOf(m.sentAt), levelAt(A, m.sentAt)], q = [xOf(m.receivedAt), levelAt(B, m.receivedAt)];
    const w = trNum(m.w), h = trNum(m.h), lbl = { x: (p[0] + q[0]) / 2 - w / 2, y: (p[1] + q[1]) / 2 - TR.lift - h, w, h }, y0 = lbl.y;
    const near = obst.filter(o => o.x < lbl.x + w && lbl.x < o.x + o.w), hits = () => near.some(o => trMeets(lbl, o));
    while (hits() && y0 - lbl.y + TR.lift <= A.h) lbl.y -= TR.lift;
    if (hits()) { lbl.y = y0; say('warning', 'timing-label', `message ${m.id}: its label meets a step, a value or a label within ${A.h} px above it`, [m.id]); }
    obst.push(lbl);
    return { id: m.id, pts: [p, q].map(pt => pt.map(r2)), lbl: { x: r2(lbl.x), y: r2(lbl.y), w: r2(w), h: r2(h) } }; });

  // ---- the ruler and the slots: a tick at every fifth of the step from the first at or after t0
  const minor = step / 5, ticks = [], slots = [];
  for (let i = Math.ceil(t0 / minor - 1e-9), e = Math.floor(t1 / minor + 1e-9); i <= e; i++) { const t = trNice(i * minor), major = i % 5 === 0;
    ticks.push({ t, x: r2(xOf(t)), major, label: major ? trFmt(t, step) : null }); }
  lanes.forEach(L => { let n = 0;
    ticks.forEach(tk => { while (n < L.cs.length && L.cs[n].at <= tk.t) n++;
      slots.push({ index: n, x: tk.x, y: r2(L.mid), parent: L.ln.id, after: n ? L.cs[n - 1].id : null, t: tk.t }); }); });

  // ---- out
  const outLanes = lanes.map(L => ({ id: L.ln.id, x: TR.edge, y: r2(L.y), w: r2(X1 - TR.edge), h: r2(L.h),
    name: { x: TR.edge + TR.pad, y: r2(L.y + (L.h - trNum((L.ln.name || {}).h)) / 2) }, rows: L.rows.map(r => ({ state: r.state, y: r2(rowY(L, r.state)) })),
    strip: { y: r2(L.sy), h: r2(L.sh) } }));
  const last = ticks.filter(t => t.major).pop(), right = X1 + (last ? textW(last.label, TR.font) / 2 : 0) + (unit ? TR.lift + textW(unit, TR.font) : 0);
  const boxes = [...lines.map(l => l.lbl), ...outMarks.map(o => o.lbl)];
  const xs = [right, X1, ...boxes.flatMap(b => [b.x, b.x + b.w])], ys = [rulerY + TR.ruler, ...boxes.flatMap(b => [b.y, b.y + b.h])];
  const bx0 = Math.min(0, ...xs.map(v => v - TR.edge)), by0 = Math.min(0, ...ys.map(v => v - TR.edge));
  return {
    lanes: outLanes, steps: steps.map(s => ({ lane: s.lane, pts: s.pts.map(p => p.map(r2)) })),
    bands: bands.map(b => ({ lane: b.lane, segs: b.segs.map(s => ({ ...s, x0: r2(s.x0), x1: r2(s.x1) })) })),
    changes: changes.map(c => ({ id: c.id, x: r2(c.x), y: r2(c.y), w: c.w, h: r2(c.h) })), lines, marks: outMarks,
    ruler: { y: r2(rulerY), x0: r2(X0), x1: r2(X1), ticks, unit }, slots, scale: { t0, t1: trNice(t1), k, step },
    bounds: { x: r2(bx0), y: r2(by0), w: r2(Math.max(...xs) + TR.edge - bx0), h: r2(Math.max(...ys) + TR.edge - by0) }, problems,
  };
}

export { TR, layoutTimeRuler };
