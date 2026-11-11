import { textW } from '../core/text.js';
import { r2 } from './shapes.js';

// pts shortened by a at the start and b at the end, along its own segments: a line's flow stops where an arrowhead begins
const trimLine = (pts, a, b) => {
  const cut = (p, d) => { p = p.map(q => q.slice());
    while (d > 0 && p.length > 1) { const [x0, y0] = p[p.length - 2], [x1, y1] = p[p.length - 1], len = Math.hypot(x1 - x0, y1 - y0);
      if (len > d) { const t = (len - d) / len; p[p.length - 1] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; break; }
      d -= len; p.pop(); }
    return p; };
  return cut(cut(pts, b).reverse(), a).reverse();
};
function roundPath(pts, r = 9) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += ` L ${x} ${y}`; continue; }
    const ax = x - (x - px) / l1 * rr, ay = y - (y - py) / l1 * rr, bx = x + (nx - x) / l2 * rr, by = y + (ny - y) / l2 * rr;
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1]; return d + ` L ${last[0]} ${last[1]}`;
}

// a typed line's end labels (1.5): each end's role and multiplicity (e.end.labels: { from: { role, mult }, to: { role, mult } }),
// each in a box reserved by its end: 4 px out from the outline along the line, 8 px to one side of it, clear of the end's
// marker. The role goes above a line that leaves sideways and left of one that leaves up or down, the multiplicity on the
// other side. pts: the line as drawn. Layout (1.4) may take the boxes as obstacles; it moves them apart where many meet (L5)
function endLabels(e, pts = e.pts) {
  const T = e.end && e.end.labels, out = []; if (!T || !pts || pts.length < 2) return out;
  [['from', pts[0], pts[1]], ['to', pts[pts.length - 1], pts[pts.length - 2]]].forEach(([end, p, q]) => {
    const at = T[end] || {}, flat = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]), dir = Math.sign(flat ? q[0] - p[0] : q[1] - p[1]) || 1;
    [['role', at.role, -1], ['mult', at.mult, 1]].forEach(([kind, t, side]) => { if (t == null || t === '') return;
      const w = r2(textW(t, 10) + 6), h = 14, along = (v, d) => dir > 0 ? v + 4 : v - 4 - d, aside = (v, d) => side < 0 ? v - 8 - d : v + 8;
      out.push({ end, kind, text: String(t), x: r2(flat ? along(p[0], w) : aside(p[0], w)), y: r2(flat ? aside(p[1], h) : along(p[1], h)), w, h }); }); });
  return out;
}

export { trimLine, roundPath, endLabels };
