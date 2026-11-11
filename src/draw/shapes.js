import { esc, fit, textW } from '../core/text.js';
import { CHG } from '../layout/layered.js';
import { mapNodeW, mapTabs } from '../map/cards.js';
import { KIND, NOTATIONS, NOTED, hasKey } from '../map/kinds.js';

const r2 = v => Math.round(v * 100) / 100;
function rrect(x, y, w, h, r) { // a rounded rect's path; r: one radius, or [top left, top right, bottom right, bottom left]
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r], A = (q, X, Y) => q ? `A${r2(q)} ${r2(q)} 0 0 1 ${r2(X)} ${r2(Y)}` : '';
  return `M${r2(x + a)} ${r2(y)}H${r2(x + w - b)}${A(b, x + w, y + b)}V${r2(y + h - c)}${A(c, x + w - c, y + h)}H${r2(x + d)}${A(d, x, y + h - d)}V${r2(y + a)}${A(a, x + a, y)}Z`;
}
const cornerIn = (r, t, a, b) => t < a + r ? r - Math.sqrt(Math.max(0, r * r - (a + r - t) ** 2)) : t > b - r ? r - Math.sqrt(Math.max(0, r * r - (t - b + r) ** 2)) : 0;
const rectIn = (n, s, t, r) => s === 'L' || s === 'R' ? cornerIn(r, t, n.y, n.y + n.h) : cornerIn(r, t, n.x, n.x + n.w);
const ellIn = (e, u, r) => e * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); // an ellipse's depth at u from its axis
const grown = (n, d) => ({ ...n, x: n.x - d, y: n.y - d, w: n.w + 2 * d, h: n.h + 2 * d });
const deeper = (k, p) => `color-mix(in srgb, var(--um-${KIND[k][0]}) ${p}%, var(--um-${KIND[k][0]}-f))`; // a detail's tint, over the card's own
const BAR = 14; // a window's title bar: browser, window, terminal
function chrome(n, c, k, what) { // a tinted title bar, three dots after the card's tabs, then an address field (browser) or a prompt (terminal)
  const { x, y, w } = n, x0 = Math.max(x, n.tabEnd || x), end = n.chromeEnd || x + w - 10;
  const dots = [9, 15.5, 22].map(d => `<circle cx="${r2(x0 + d)}" cy="${y + 7}" r="2.1" class="n-dot depth-read" fill="${c}"/>`).join('');
  const more = what === 'browser' && end - x0 - 30 > 24 ? `<path d="${rrect(x0 + 30, y + 3.5, end - x0 - 30, 7, 3.5)}" class="n-field depth-read" stroke="${c}"/>`
    : what === 'terminal' && end - x0 - 30 > 14 ? `<text x="${r2(x0 + 31)}" y="${y + 10.6}" class="n-prompt" fill="${c}">&gt;_</text>` : '';
  return `<path d="${rrect(x + .75, y + .75, w - 1.5, BAR - .75, [9.25, 9.25, 0, 0])}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + BAR}H${x + w}" class="n-det n-accent" stroke="${c}"/>${dots}${more}`;
}
// where a person's or robot's body starts: b px down, or just above the highest line or feed that ends on its left or right
// side (n.portTop, from the lines as laid out), so each one lands on its outline
const bodyTop = (n, b) => Math.min(n.y + b, (n.portTop ?? Infinity) - 1);
// each card's highest line end on its left side and on its right (a view's feeds end on the left), as laid out
function sidePorts(g) {
  const m = new Map(), at = (n, side, y) => { if (!n || (side !== 'L' && side !== 'R')) return; const o = m.get(n) || { L: Infinity, R: Infinity }; o[side] = Math.min(o[side], y); m.set(n, o); };
  (g.edges || []).forEach(e => { if (e.pts && e.pts.length) { at(e.s, e.fs, e.pts[0][1]); at(e.t, e.ts, e.pts[e.pts.length - 1][1]); } });
  (g.intake || []).forEach(b => at((g.byId || {})[b.to], 'L', b.pts[b.pts.length - 1][1]));
  return m;
}
const boxOut = r => (n, d = 0) => { const g = grown(n, d); return rrect(g.x, g.y, g.w, g.h, r + d); };
const SHAPE = {
  box: { out: boxOut(10), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10) },
  person: { // the C4 model's person: a head over a body with wide, flat shoulders. The body starts 12 px down, or higher where
    // a line ends on its side above that (bodyTop)
    head: 13,
    g(n, d = 0) { const r = 13 + d, cx = n.hx ?? n.x + n.w / 2, hy = n.y + 13, bt = bodyTop(n, 12) - d, sx = 20 + d, sy = 12 + d; return { r, cx, hy, bt, sx, sy, k: Math.sqrt(Math.max(0, r * r - (bt - hy) ** 2)) }; },
    out(n, d = 0) { const { r, cx, hy, bt, sx, sy, k } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + sy)}A${sx} ${sy} 0 0 1 ${r2(x + sx)} ${r2(bt)}H${r2(cx - k)}A${r} ${r} 0 ${bt > hy ? 1 : 0} 1 ${r2(cx + k)} ${r2(bt)}H${r2(x + w - sx)}A${sx} ${sy} 0 0 1 ${r2(x + w)} ${r2(bt + sy)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 12), n.y + n.h], tabY: n => bodyTop(n, 12),
    det(n, c) { const { r, cx, hy, bt, k } = this.g(n); return `<path d="M${r2(cx - k)} ${r2(bt)}A${r} ${r} 0 ${bt < hy ? 1 : 0} 0 ${r2(cx + k)} ${r2(bt)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const { r, cx, hy, bt, sx, sy } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + sy ? ellIn(sx, bt + sy - t, sy) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = t - cx; if (Math.abs(u) < r) return Math.min(hy - Math.sqrt(r * r - u * u), bt) - n.y;
      const e = t < n.x + sx ? n.x + sx - t : t > n.x + n.w - sx ? t - n.x - n.w + sx : 0; return bt - n.y + ellIn(sy, e, sx); } },
  robot: { // Structurizr's robot, and UML's non-human actor: the person's body under a square head with ears
    head: 19,
    // a body that starts higher than 14 px down (bodyTop) has a head as much shorter, its ears and corners with it
    g(n, d = 0) { const B = bodyTop(n, 14), f = (B - n.y) / 14; return { cx: n.hx ?? n.x + n.w / 2, hw: 14 + d, ht: n.y - d, bt: B - d, ew: 19 + d, e0: n.y + 4 * f - d, e1: n.y + 10 * f + d, S: 8 + d, hr: 5 * f + d, ey: n.y + 7.5 * f }; },
    out(n, d = 0) { const { cx, hw, ht, bt, ew, e0, e1, S, hr } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + S)}A${S} ${S} 0 0 1 ${r2(x + S)} ${r2(bt)}H${r2(cx - hw)}V${r2(e1)}H${r2(cx - ew)}V${r2(e0)}H${r2(cx - hw)}V${r2(ht + hr)}A${hr} ${hr} 0 0 1 ${r2(cx - hw + hr)} ${r2(ht)}H${r2(cx + hw - hr)}A${hr} ${hr} 0 0 1 ${r2(cx + hw)} ${r2(ht + hr)}V${r2(e0)}H${r2(cx + ew)}V${r2(e1)}H${r2(cx + hw)}V${r2(bt)}H${r2(x + w - S)}A${S} ${S} 0 0 1 ${r2(x + w)} ${r2(bt + S)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 14), n.y + n.h], tabY: n => bodyTop(n, 14),
    det(n, c) { const { cx, ey } = this.g(n); return [-5.5, 5.5].map(o => `<circle cx="${r2(cx + o)}" cy="${r2(ey)}" r="1.6" class="n-det n-accent" fill="${c}" stroke="${c}"/>`).join(''); },
    inset(n, s, t) { const { cx, hw, ew, e0, bt, S, hr } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + S ? S - Math.sqrt(S * S - (bt + S - t) ** 2) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = Math.abs(t - cx); return u < hw ? cornerIn(hr, u, -1e6, hw) : u < ew ? e0 - n.y : bt - n.y + cornerIn(S, t, n.x, n.x + n.w); } },
  browser: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'browser') },
  window: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'window') },
  terminal: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'terminal') },
  mobile: { // a phone on its side, as the C4 model's example draws its mobile app (MobileDeviceLandscape): a screen, a home button, a speaker
    out: boxOut(14), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 14),
    det(n, c) { const { x, y, w, h } = n, cy = y + h / 2;
      return `<path d="${rrect(x + 11, y + 5, w - 22, h - 10, 5)}" class="n-screen n-accent" stroke="${c}"/><circle cx="${x + 6.6}" cy="${r2(cy)}" r="2.1" class="n-det" stroke="${c}"/><path d="M${r2(x + w - 6.2)} ${r2(cy - 7)}V${r2(cy + 7)}" class="n-det n-speaker" stroke="${c}"/>`; } },
  cylinder: { // a data store: its lid tinted, the lid's front edge its accent
    ry: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const ry = this.ry(n), { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x + w)} ${r2(y + ry)}V${r2(y + h - ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x)} ${r2(y + h - ry)}Z`; },
    face(n) { return [n.y + this.ry(n), n.y + n.h]; },
    det(n, c, k) { const ry = this.ry(n), { x, y, w } = n;
      return `<ellipse cx="${r2(x + w / 2)}" cy="${y + ry}" rx="${r2(w / 2 - .75)}" ry="${ry - .75}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + ry}A${r2(w / 2)} ${ry} 0 0 0 ${r2(x + w)} ${y + ry}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const ry = this.ry(n), rx = n.w / 2; if (s === 'T' || s === 'B') return ellIn(ry, t - n.x - rx, rx);
      const a = n.y + ry, b = n.y + n.h - ry; return t >= a && t <= b ? 0 : ellIn(rx, t < a ? a - t : t - b, ry); } },
  pipe: { // a queue: a cylinder on its side, open at the right where the work leaves; dots on its floor move with the flow
    e: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const e = this.e(n), { x, y, w, h } = grown(n, d); return `M${r2(x + e)} ${r2(y)}H${r2(x + w - e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + w - e)} ${r2(y + h)}H${r2(x + e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + e)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const e = this.e(n), { x, y, w, h } = n;
      return `<ellipse cx="${x + w - e}" cy="${r2(y + h / 2)}" rx="${e - .75}" ry="${r2(h / 2 - .75)}" fill="${deeper(k, 10)}"/><path d="M${x + w - e} ${y}A${e} ${r2(h / 2)} 0 0 0 ${x + w - e} ${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + e + 6} ${r2(y + h - 6.5)}H${x + w - 2 * e - 6}" class="n-floor" stroke="${c}"/>`; },
    inset(n, s, t) { const e = this.e(n), ry = n.h / 2; if (s === 'L' || s === 'R') return ellIn(e, t - n.y - ry, ry);
      const a = n.x + e, b = n.x + n.w - e; return t >= a && t <= b ? 0 : ellIn(ry, t < a ? a - t : t - b, e); } },
  document: { // a file: UML's artifact, a page with its corner folded (and umlimator's own file sigil)
    out(n, d = 0) { const { x, y, w, h } = grown(n, d), R = 10 + d, f = 10;
      return `M${r2(x + R)} ${r2(y)}H${r2(x + w - f)}L${r2(x + w)} ${r2(y + f)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}V${r2(y + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const { x, y, w } = n; return `<path d="M${x + w - 10} ${y}V${y + 7.5}Q${x + w - 10} ${y + 10} ${x + w - 7.5} ${y + 10}H${x + w}Z" fill="${deeper(k, 16)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { if (s === 'R' && t < n.y + 10) return 10 - (t - n.y); if (s === 'T' && t > n.x + n.w - 10) return t - (n.x + n.w - 10); return rectIn(n, s, t, 10); } },
  hexagon: { // the hook card's hexagon, for any card
    hx: n => Math.min(16, n.h / 3),
    out(n, d = 0) { const hx = this.hx(n), { x, y, w, h } = grown(n, d); return `M${r2(x + hx)} ${r2(y)}H${r2(x + w - hx)}L${r2(x + w)} ${r2(y + h / 2)}L${r2(x + w - hx)} ${r2(y + h)}H${r2(x + hx)}L${r2(x)} ${r2(y + h / 2)}Z`; },
    face: n => [n.y, n.y + n.h],
    inset(n, s, t) { const hx = this.hx(n); if (s === 'L' || s === 'R') return hx * Math.abs(t - n.y - n.h / 2) / (n.h / 2);
      const a = n.x + hx, b = n.x + n.w - hx; return t < a ? (a - t) * n.h / 2 / hx : t > b ? (t - b) * n.h / 2 / hx : 0; } },
  folder: { // UML's package: a folder with its tab on top, after the card's own tabs
    tw: n => Math.min(64, Math.round(n.w * .34)),
    out(n, d = 0) { const tw = this.tw(n), x0 = n.tabX ?? n.x, { x, y, w, h } = grown(n, d), r = 4 + d, R = 8 + d, th = 9, X0 = x0 - d, T1 = x0 + tw + d;
      const head = X0 <= x + .5 ? `M${r2(x)} ${r2(y + h - R)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(x + r)} ${r2(y)}`
        : `M${r2(x)} ${r2(y + h - R)}V${r2(y + th + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y + th)}H${r2(X0)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(X0 + r)} ${r2(y)}`;
      return `${head}H${r2(T1 - 3)}Q${r2(T1)} ${r2(y)} ${r2(T1 + 1.5)} ${r2(y + 2.5)}L${r2(T1 + 5)} ${r2(y + th)}H${r2(x + w - R)}A${R} ${R} 0 0 1 ${r2(x + w)} ${r2(y + th + R)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}Z`; },
    face: n => [n.y + 9, n.y + n.h], tabY: n => n.y + 9,
    det(n, c, k) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      return `<path d="M${r2(x0 + .75)} ${n.y + 9}V${n.y + 4}A3.25 3.25 0 0 1 ${r2(x0 + 4)} ${n.y + .75}H${r2(x0 + tw - 3)}Q${r2(x0 + tw)} ${n.y + .75} ${r2(x0 + tw + 1.5)} ${n.y + 3}L${r2(x0 + tw + 4.4)} ${n.y + 9}Z" fill="${deeper(k, 14)}"/><path d="M${r2(x0)} ${n.y + 9}H${r2(x0 + tw + 5)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      if (s === 'T') return t >= x0 && t <= x0 + tw ? 0 : 9 + cornerIn(8, t, x0 > n.x + .5 ? n.x : -1e6, n.x + n.w);
      if (s === 'B') return rectIn(n, s, t, 8);
      // the side's top: a tab at the card's left corner has a 4 px corner at the top; elsewhere the body starts 9 px down, 8 px round
      const top = s === 'L' && x0 <= n.x + .5 ? cornerIn(4, t, n.y, 1e6) : t < n.y + 9 ? null : cornerIn(8, t, n.y + 9, 1e6);
      return top == null || top > 0 ? top : cornerIn(8, t, -1e6, n.y + n.h); } },
  node: { // UML's node: a box seen in perspective, for hosts and devices
    out(n, d = 0) { const p = 7, { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + p)}L${r2(x + p)} ${r2(y)}H${r2(x + w)}V${r2(y + h - p)}L${r2(x + w - p)} ${r2(y + h)}H${r2(x)}Z`; },
    face: n => [n.y + 7, n.y + n.h],
    det(n, c, k) { const p = 7, { x, y, w, h } = n;
      return `<path d="M${x + 1} ${y + p}L${x + p} ${y + 1}H${x + w - 1}L${x + w - p} ${y + p}Z" fill="${deeper(k, 12)}"/><path d="M${x + w - p} ${y + p}L${x + w - 1} ${y + 1}V${y + h - p}L${x + w - p} ${y + h - 1}Z" fill="${deeper(k, 22)}"/>`
        + `<path d="M${x} ${y + p}H${x + w - p}V${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + w - p} ${y + p}L${x + w} ${y}" class="n-det" stroke="${c}"/>`; },
    inset(n, s, t) { const p = 7; return s === 'L' ? Math.max(0, n.y + p - t) : s === 'R' ? Math.max(0, t - n.y - n.h + p) : s === 'T' ? Math.max(0, n.x + p - t) : Math.max(0, t - n.x - n.w + p); } },
  classifier: { // UML's class box (1.5): a rectangle, its name compartment, then one compartment per member kind (classParts)
    size: n => classParts(n).size, out: boxOut(0), face: n => [n.y, n.y + n.h], inset: () => 0, draw: classSvg },
};
// what every shape reports (1.5): size(n), the box layout gives it (a map's card: mapNodeW wide, a row high; the classifier:
// from its text), and ports(n, side, k), k line ends spread evenly along a side ('L', 'R', 'T', 'B'), each on the outline
for (const S of Object.values(SHAPE)) { S.size ||= n => ({ w: mapNodeW(n), h: 64 }); S.ports = (n, side, k = 1) => portsOn(S, n, side, k); }
// ---- the classifier (1.5). Its drawing input, on a typed view's node (not the model: 1.9 fills it from the model and the
// view's present; a map never draws it): shape 'classifier'; label; type ('uml.Class', named in its accessible name);
// stereotypes [text], shown «…» over the name; abstract (the name in italics); compartments [{ name, members }] in order
// ('attributes', 'operations', 'literals'), each member in the model's envelope ({ type, label, props }); collapsed
// [compartment names], hidden with no divider; rows: at most that many rows in a compartment, then "+k more" (stage 1 note §5)
const CL = { pad: 8, name: 13, row: 11, st: 14, nl: 18, rl: 15, gap: 5, empty: 10, minW: 96, maxW: 320 };
const VIS = { public: '+', private: '-', protected: '#', package: '~' };
// a member's row in UML's form: "+ total: Money [1]", "+ /count: Integer = 0", "+ place(at: Date): Order"; a literal's label
function memberText(m) { const p = m.props || {}, has = x => x != null && x !== '', name = (hasKey(VIS, p.visibility) ? VIS[p.visibility] + ' ' : '') + (p.isDerived ? '/' : '') + (m.label ?? '');
  if (/Operation$/.test(m.type || '')) return name + '(' + (Array.isArray(p.parameters) ? p.parameters : []).map(a => (has(a.direction) && a.direction !== 'in' ? a.direction + ' ' : '') + (a.name ?? '') + (has(a.valueType) ? ': ' + a.valueType : '')).join(', ') + ')' + (has(p.returnType) ? ': ' + p.returnType : '');
  return name + (has(p.valueType) ? ': ' + p.valueType : '') + (has(p.multiplicity) ? ` [${p.multiplicity}]` : '') + (has(p.default) ? ' = ' + p.default : ''); }
// the classifier as drawn: its stereotypes, each compartment shown with its rows and how many it leaves out, the head's
// height, and the size its text needs: as wide as its widest text, within minW and maxW (a longer row is cut: classSvg)
function classParts(n) {
  const hidden = new Set(Array.isArray(n.collapsed) ? n.collapsed : []), cap = Number.isFinite(n.rows) ? Math.max(0, Math.floor(n.rows)) : Infinity;
  const st = (Array.isArray(n.stereotypes) ? n.stereotypes : []).map(t => `«${t}»`);
  const comps = (Array.isArray(n.compartments) ? n.compartments : []).filter(c => !hidden.has(c.name)).map(c => { const all = Array.isArray(c.members) ? c.members : [];
    return { name: c.name, rows: all.slice(0, cap).map(m => ({ m, text: memberText(m) })), more: Math.max(0, all.length - cap) }; });
  const texts = [[n.label ?? '', CL.name], ...st.map(t => [t, CL.row]), ...comps.flatMap(c => [...c.rows.map(r => [r.text, CL.row]), ...(c.more ? [[`+${c.more} more`, CL.row]] : [])])];
  const w = Math.ceil(Math.min(CL.maxW, Math.max(CL.minW, ...texts.map(([t, px]) => textW(t, px) + 2 * CL.pad))));
  const head = 2 * CL.gap + st.length * CL.st + CL.nl, tall = c => { const k = c.rows.length + (c.more ? 1 : 0); return k ? 2 * CL.gap - 2 + k * CL.rl : CL.empty; };
  return { st, comps, head, tall, size: { w, h: comps.reduce((a, c) => a + tall(c), head) } };
}
const words = t => String(t).split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'uml.DataType': "Data type"
function classSvg(n, c, f) { // its outline, its head, then each compartment under a divider, every text cut to the box (fit)
  const { st, comps, head, tall } = classParts(n), { x, y, w, h } = n, max = w - 2 * CL.pad, cx = r2(x + w / 2);
  const font = (px, wt, it) => `style="font:${it ? 'italic ' : ''}${wt} ${px}px var(--um-sans)"`;
  const row = (cls, fill, ty, t, more = '') => `<text x="${r2(x + CL.pad)}" y="${r2(ty)}" class="${cls}" fill="${fill}"${more}>${esc(fit(t, CL.row, max))}</text>`;
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-mask"/><rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-body" fill="${f}" stroke="${c}"/>`];
  let ty = y + CL.gap; const hd = [];
  st.forEach(t => { hd.push(`<text x="${cx}" y="${r2(ty + 11)}" text-anchor="middle" class="c-st" fill="var(--um-muted)" ${font(CL.row, 400)}>${esc(fit(t, CL.row, max))}</text>`); ty += CL.st; });
  hd.push(`<text x="${cx}" y="${r2(ty + 14)}" text-anchor="middle" class="c-name" fill="var(--um-text)" ${font(CL.name, 600, n.abstract)} data-o="${esc(n.id)}">${esc(fit(n.label ?? '', CL.name, max))}</text>`);
  out.push(`<g class="c-head" data-band="${r2(y)} ${r2(y + head)}">${hd.join('')}</g>`);
  let top = y + head;
  comps.forEach((C, i) => { const bh = i === comps.length - 1 ? Math.max(y + h - top, 0) : tall(C), at = j => top + CL.gap - 1 + j * CL.rl + 11.5;
    const rows = C.rows.map((r, j) => { const p = r.m.props || {};
      return row('c-row', 'var(--um-text)', at(j), r.text, ` ${font(CL.row, 400, /Operation$/.test(r.m.type || '') && p.isAbstract)}${p.isStatic ? ' text-decoration="underline"' : ''}`); });
    if (C.more) rows.push(row('c-more', 'var(--um-muted)', at(C.rows.length), `+${C.more} more`, ` ${font(CL.row, 400)}`));
    out.push(`<g class="c-comp" data-comp="${esc(C.name)}" data-band="${r2(top)} ${r2(top + bh)}"><path d="M${x} ${r2(top)}H${x + w}" class="n-det" stroke="${c}"/>${rows.join('')}</g>`);
    top += bh; });
  // its accessible name (A1): "Class Order, 2 attributes, 1 operation", every member counted, shown or not
  const counts = (Array.isArray(n.compartments) ? n.compartments : []).map(C => { const k = Array.isArray(C.members) ? C.members.length : 0, nm = String(C.name ?? '');
    return `${k} ${k === 1 ? nm.replace(/s$/, '') : nm}`; });
  const name = [`${words(n.type || 'uml.Class')} ${n.label ?? ''}${n.abstract ? ' (abstract)' : ''}`, ...counts].join(', ');
  return `<g class="node classifier" data-id="${esc(n.id)}" data-shape="classifier" tabindex="-1" role="img" aria-label="${esc(name)}">${out.join('')}</g>`;
}
const SHAPE_NAMES = ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node']; // all 13
// a card's shape in a notation: its own `shape` first; box draws every card as before (a hook stays a hexagon there too)
const shapeOf = (n, notation) => { const sh = String(n.shape ?? '').toLowerCase(); if (SHAPE_NAMES.includes(sh)) return sh;
  const T = hasKey(NOTED, notation) && NOTED[notation], k = String(n.kind ?? '').toLowerCase(); return T ? (hasKey(T, k) && T[k]) || (hasKey(T, n.k) && T[n.k]) || 'box' : 'box'; };
const noteOf = x => NOTATIONS.includes(x) ? x : null;
// a card as its notation draws it (null for a box): its shape, and where its head, folder tab and title bar go, clear of its
// tabs, ⤢ and change badge. Drawing only: layout never sees it. ports: the card's highest line ends on its sides (sidePorts)
function cardLook(n, notation, hint, ports) {
  const sh = shapeOf(n, notation); if (sh === 'box') return null;
  const S = SHAPE[sh], L = { ...n, sh, S, portTop: ports ? Math.min(ports.L, ports.R) : Infinity, portL: ports ? ports.L : Infinity }, tabs = mapTabs(n), spans = []; let tx = n.x + 12;
  // a step keeps 16 px above the highest line into the left side (svgOf): where that is above a person's or robot's shoulder,
  // the shoulder comes up under it, 5 px below its middle (it floated 4 px above the shoulder)
  if (n.step && S.head && L.portL - 16 < S.tabY(L)) L.portTop = Math.min(L.portTop, Math.max(n.y, L.portL - 16) + 6);
  tabs.forEach(t => { spans.push([tx, tx + t.w]); tx += t.w + 4; });
  L.tabEnd = tabs.length ? tx - 2 : 0;
  const right = []; if (hint) right.push([n.x + n.w - 44, n.x + n.w - 8]);
  const ch = CHG[String(n.change || '').toLowerCase()]; if (ch) { const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint ? 40 : 0); right.push([bx, bx + bw]); }
  L.chromeEnd = Math.min(n.x + n.w - 10, ...right.map(s => s[0] - 6));
  const half = (S.head || 0) + 4;
  if (S.head) { // a head in the middle, unless a tab or a badge is there: then in the widest gap they leave
    const all = [...spans, ...right], lo = n.x + 22, hi = n.x + n.w - 22, mid = n.x + n.w / 2;
    let gaps = [[lo, hi]]; all.forEach(([a, b]) => { gaps = gaps.flatMap(([p, q]) => b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v > u)); });
    const fits = gaps.filter(([p, q]) => q - p >= 2 * half), best = fits.find(([p, q]) => p <= mid - half && q >= mid + half) ? [mid - half, mid + half]
      : fits.sort((u, v) => Math.abs((u[0] + u[1]) / 2 - mid) - Math.abs((v[0] + v[1]) / 2 - mid))[0];
    L.hx = best ? Math.min(Math.max(mid, best[0] + half), best[1] - half) : mid;
  }
  if (sh === 'folder') L.tabX = tabs.length ? Math.min(L.tabEnd + 4, n.x + n.w - SHAPE.folder.tw(n) - 14) : n.x;
  // what else is on the tab line after the card's own tabs: ⤢, the change badge, a head (a robot's with its ears), a folder's tab
  L.busy = [...right, ...(S.head ? [[L.hx - S.head, L.hx + S.head]] : []), ...(sh === 'folder' ? [[L.tabX, L.tabX + SHAPE.folder.tw(n) + 5]] : [])];
  return L;
}
// where a tab w wide goes after the card's own tabs (an overlay's or a lens's badge): on a shape, the first place inside the
// card 2 px clear of what L.busy names, else the place inside it that covers least of them; on a box, or where the card's
// own tabs fill it, right after them
function tabAfter(n, L, w) {
  const x0 = mapTabs(n).reduce((a, t) => a + t.w + 4, n.x + 12); if (!L) return x0;
  const max = n.x + n.w - 2 - w, over = x => L.busy.reduce((s, [a, b]) => s + Math.max(0, Math.min(x + w, b + 2) - Math.max(x, a - 2)), 0);
  return [x0, ...L.busy.map(b => b[1] + 4), max].filter(x => x >= x0 && x <= max).reduce((b, x) => over(x) < over(b) ? x : b, x0);
}
// the line a card's tabs, ⤢, change badge and step sit on: a shape's top (a person's shoulders), else the box's
const tabLine = (n, L) => L && L.S.tabY ? L.S.tabY(L) : n.y;
const SIDE_OUT = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
// a point p on a side of a card's box, slid onto the card's outline along the side's normal (S: its shape)
const slide = (S, L, side, p) => { const [ox, oy] = SIDE_OUT[side] || [0, 0], k = S.inset(L, side, side === 'L' || side === 'R' ? p[1] : p[0]) || 0; return [r2(p[0] - ox * k), r2(p[1] - oy * k)]; };
function portsOn(S, n, side, k) { const v = side === 'L' || side === 'R', [a, b] = v ? S.face(n) : [n.x, n.x + n.w]; // a side's span: its face on the left and right
  return Array.from({ length: k }, (_, i) => { const t = a + (b - a) * (i + 1) / (k + 1);
    return slide(S, n, side, v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h]); }); }
// a line as drawn: its ends slid from the card's box onto the card's outline, along the side's normal (the stub lengthens
// by as much); layout's points stay as they are. look(n): the card's look, or null for a box
function drawnPts(e, look) {
  const a = e.s && !e.s.box ? look(e.s) : null, b = e.t && !e.t.box ? look(e.t) : null;
  if (!a && !b) return e.pts;
  const pts = e.pts.map(p => p.slice());
  if (a) pts[0] = slide(a.S, a, e.fs, pts[0]);
  if (b) pts[pts.length - 1] = slide(b.S, b, e.ts, pts[pts.length - 1]);
  return pts;
}

export { r2, sidePorts, SHAPE, SHAPE_NAMES, shapeOf, noteOf, cardLook, tabAfter, tabLine, drawnPts };
