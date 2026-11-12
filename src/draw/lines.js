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

export { trimLine, roundPath };
