import { TYPED } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { trimLine } from '../draw/lines.js';
import { SHAPE, boxOut, drawnPts, portsOn, r2 } from '../draw/shapes.js';
import { hasKey } from '../map/kinds.js';

/* What a typed view draws and a map never does (risks.md C5): the classifier shape, a typed line's ends and its end labels.
   Only lib/umlimator-all.js holds this file; it installs SHAPE.classifier and TYPED.lines (registry.js) as it loads. */

// ---- the classifier (1.5). Its drawing input, on a typed view's node (not the model: 1.9 fills it from the model and the
// view's present; a map never draws it): shape 'classifier'; label; type ('uml.Class', named in its accessible name);
// stereotypes [text], shown «…» over the name; abstract (the name in italics); underline (the name underlined: an instance, notes/stage-2.md §9.1); compartments [{ name, members }] in order
// ('attributes', 'operations', 'literals'), each member in the model's envelope ({ type, label, props }); collapsed
// [compartment names], hidden with no divider; rows: at most that many rows in a compartment, then "+k more" (stage 1 note §5)
const CL = { pad: 8, name: 13, row: 11, st: 14, nl: 18, rl: 15, gap: 5, empty: 10, minW: 96, maxW: 320 };
const VIS = { public: '+', private: '-', protected: '#', package: '~' };
// a member's row in UML's form: "+ total: Money [1]", "+ /count: Integer = 0", "+ place(at: Date): Order"; a literal's label
const obj = x => !!x && typeof x === 'object'; // an entry the classifier reads; null, text or a number is passed over
function memberText(m) { const p = obj(m.props) ? m.props : {}, has = x => x != null && x !== '', name = (hasKey(VIS, p.visibility) ? VIS[p.visibility] + ' ' : '') + (p.isDerived ? '/' : '') + (m.label ?? '');
  if (/Operation$/.test(m.type || '')) return name + '(' + (Array.isArray(p.parameters) ? p.parameters.filter(obj) : []).map(a => (has(a.direction) && a.direction !== 'in' ? a.direction + ' ' : '') + (a.name ?? '') + (has(a.valueType) ? ': ' + a.valueType : '')).join(', ') + ')' + (has(p.returnType) ? ': ' + p.returnType : '');
  return name + (has(p.valueType) ? ': ' + p.valueType : '') + (has(p.multiplicity) ? ` [${p.multiplicity}]` : '') + (has(p.default) ? ' = ' + p.default : ''); }
// the classifier as drawn: its stereotypes, its compartments (all: every one, each with every member; comps: those shown,
// with their rows and how many they leave out), the head's height, and the size its text needs: as wide as its widest text,
// within minW and maxW (a longer row is cut: classSvg). An abstract name is in italics, which the measure (upright) does
// not see: it is measured a tenth wider (slant)
function classParts(n) {
  const hidden = new Set(Array.isArray(n.collapsed) ? n.collapsed : []), cap = Number.isFinite(n.rows) ? Math.max(0, Math.floor(n.rows)) : Infinity, slant = n.abstract ? 1.1 : 1;
  const stereo = (Array.isArray(n.stereotypes) ? n.stereotypes : []).filter(t => t != null && t !== '').map(String), st = stereo.map(t => `«${t}»`);
  const all = (Array.isArray(n.compartments) ? n.compartments : []).filter(obj).map(c => ({ name: String(c.name ?? ''), members: Array.isArray(c.members) ? c.members.filter(obj) : [] }));
  const comps = all.filter(c => !hidden.has(c.name)).map(c => ({ name: c.name, rows: c.members.slice(0, cap).map(m => ({ m, text: memberText(m) })), more: Math.max(0, c.members.length - cap) }));
  const texts = [[n.label ?? '', CL.name, slant], ...st.map(t => [t, CL.row, 1]), ...comps.flatMap(c => [...c.rows.map(r => [r.text, CL.row, 1]), ...(c.more ? [[`+${c.more} more`, CL.row, 1]] : [])])];
  const w = Math.ceil(Math.min(CL.maxW, Math.max(CL.minW, ...texts.map(([t, px, k]) => textW(t, px) * k + 2 * CL.pad))));
  const head = 2 * CL.gap + st.length * CL.st + CL.nl, tall = c => { const k = c.rows.length + (c.more ? 1 : 0); return k ? 2 * CL.gap - 2 + k * CL.rl : CL.empty; };
  return { stereo, st, all, comps, head, tall, slant, size: { w, h: comps.reduce((a, c) => a + tall(c), head) } };
}
const words = t => String(t).split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'uml.DataType': "Data type"
function classSvg(n, c, f) { // its outline, its head, then each compartment under a divider, every text cut to the box (fit)
  const { stereo, st, all, comps, head, tall, slant } = classParts(n), { x, y, w, h } = n, max = w - 2 * CL.pad, cx = r2(x + w / 2);
  const font = (px, wt, it) => `style="font:${it ? 'italic ' : ''}${wt} ${px}px var(--um-sans)"`;
  const row = (cls, fill, ty, t, more = '') => `<text x="${r2(x + CL.pad)}" y="${r2(ty)}" class="${cls}" fill="${fill}"${more}>${esc(fit(t, CL.row, max))}</text>`;
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-mask"/><rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-body" fill="${f}" stroke="${c}"/>`];
  let ty = y + CL.gap; const hd = [];
  st.forEach(t => { hd.push(`<text x="${cx}" y="${r2(ty + 11)}" text-anchor="middle" class="c-st" fill="var(--um-muted)" ${font(CL.row, 400)}>${esc(fit(t, CL.row, max))}</text>`); ty += CL.st; });
  hd.push(`<text x="${cx}" y="${r2(ty + 14)}" text-anchor="middle" class="c-name" fill="var(--um-text)" ${font(CL.name, 600, n.abstract)}${n.underline ? ' text-decoration="underline"' : ''} data-o="${esc(n.id)}">${esc(fit(n.label ?? '', CL.name, max / slant))}</text>`);
  out.push(`<g class="c-head" data-band="${r2(y)} ${r2(y + head)}">${hd.join('')}</g>`);
  let top = y + head;
  comps.forEach((C, i) => { const bh = i === comps.length - 1 ? Math.max(y + h - top, 0) : tall(C), at = j => top + CL.gap - 1 + j * CL.rl + 11.5;
    const rows = C.rows.map((r, j) => { const p = obj(r.m.props) ? r.m.props : {};
      return row('c-row', 'var(--um-text)', at(j), r.text, ` ${font(CL.row, 400, /Operation$/.test(r.m.type || '') && p.isAbstract)}${p.isStatic ? ' text-decoration="underline"' : ''}`); });
    if (C.more) rows.push(row('c-more', 'var(--um-muted)', at(C.rows.length), `+${C.more} more`, ` ${font(CL.row, 400)}`));
    out.push(`<g class="c-comp" data-comp="${esc(C.name)}" data-band="${r2(top)} ${r2(top + bh)}"><path d="M${x} ${r2(top)}H${x + w}" class="n-det" stroke="${c}"/>${rows.join('')}</g>`);
    top += bh; });
  // its accessible name (A1): "Class Order (entity, abstract), 2 attributes, 1 operation", every member counted, shown or not
  const counts = all.map(C => `${C.members.length} ${C.members.length === 1 ? C.name.replace(/s$/, '') : C.name}`), why = [...stereo, ...(n.abstract ? ['abstract'] : [])];
  const name = [`${words(n.type || 'uml.Class')} ${n.label ?? ''}${why.length ? ` (${why.join(', ')})` : ''}`, ...counts].join(', ');
  return `<g class="node classifier" data-id="${esc(n.id)}" data-shape="classifier" tabindex="-1" role="img" aria-label="${esc(name)}">${out.join('')}</g>`;
}
const CLASSIFIER = { // UML's class box (1.5): a rectangle, its name compartment, then one compartment per member kind (classParts)
  size: n => classParts(n).size, out: boxOut(0), face: n => [n.y, n.y + n.h], inset: () => 0, draw: classSvg };
CLASSIFIER.ports = (n, side, k = 1) => portsOn(CLASSIFIER, n, side, k);
SHAPE.classifier = CLASSIFIER;

// A typed view's line (1.5; a map's lines never read it) says how it is drawn in e.end: { from, to, dashed, labels }. from
// and to name an end in this table, the line's ends as UML draws them (none, or a name it does not hold, draws no marker);
// dashed: a dependency's or realization's line; labels: each end's role and multiplicity (endLabels). Each end: [its
// length, half its height, its path pointing right with the tip at its length, its fill]. Its tip is where the line ends,
// on the node's outline. Hollow is the stage's background, filled the line's own colour (T2), in either theme
const ENDS = { none: null, arrow: [10, 4, 'M0 0L10 4L0 8Z', 'line'], open: [10, 5, 'M0 0L10 5L0 10', 'none'], triangle: [13, 7, 'M0 0L13 7L0 14Z', 'hollow'],
  diamond: [16, 6, 'M0 6L8 0L16 6L8 12Z', 'hollow'], 'filled-diamond': [16, 6, 'M0 6L8 0L16 6L8 12Z', 'line'] };
const endOf = (E, w) => hasKey(ENDS, E[w]) && ENDS[E[w]] ? E[w] : null;

// a typed line's end labels (1.5): each end's role and multiplicity (e.end.labels: { from: { role, mult }, to: { role, mult } }),
// each in a box reserved by its end. First choice: 4 px out from the outline along the line, 8 px to one side of it, clear of
// the end's marker; the role above a line that leaves sideways and left of one that leaves up or down, the multiplicity on
// the other side. A box that would meet a segment of its own line (7.5 px round it, so markers too), either end's node or
// a box placed before it moves away from the line, 4 px at a time, on its side and then the other, at the end or centred
// across it (a short end segment, a loop). pts: the line as drawn; e.s and e.t: its nodes. Layout (1.4) may take the boxes
// as obstacles; it moves them apart where many lines meet (L5)
function endLabels(e, pts = e.pts, also = []) { // also: boxes to keep clear of too (other lines, their labels: svgOf)
  const T = e.end && e.end.labels, out = []; if (!T || !pts || pts.length < 2) return out;
  const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const keep = [...pts.slice(1).map((q, i) => { const p = pts[i]; return { x: Math.min(p[0], q[0]) - 7.5, y: Math.min(p[1], q[1]) - 7.5, w: Math.abs(q[0] - p[0]) + 15, h: Math.abs(q[1] - p[1]) + 15 }; }),
    ...[e.s, e.t].filter(n => n && Number.isFinite(n.x)).map(n => ({ x: n.x - 2, y: n.y - 2, w: n.w + 4, h: n.h + 4 })), ...also];
  [['from', pts[0], pts[1]], ['to', pts[pts.length - 1], pts[pts.length - 2]]].forEach(([end, p, q]) => {
    const at = T[end] || {}, flat = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]), dir = Math.sign(flat ? q[0] - p[0] : q[1] - p[1]) || 1;
    [['role', at.role, -1], ['mult', at.mult, 1]].forEach(([kind, t, side]) => { if (t == null || t === '') return;
      const w = r2(textW(t, 10) + 6), h = 14, along = (v, d, mid) => mid ? v - d / 2 : dir > 0 ? v + 4 : v - 4 - d, aside = (v, d, s, o) => s < 0 ? v - o - d : v + o;
      const box = (o, s, mid) => ({ end, kind, text: String(t), x: r2(flat ? along(p[0], w, mid) : aside(p[0], w, s, o)), y: r2(flat ? aside(p[1], h, s, o) : along(p[1], h, mid)), w, h });
      let b = null;
      for (let o = 8; !b && o <= 400; o += 4) for (const s of [side, -side]) for (const mid of [false, true]) { const c = box(o, s, mid); if (!b && ![...keep, ...out].some(k => meets(c, k))) b = c; }
      out.push(b || box(8, side, false)); }); });
  return out;
}

// svgOf's typed lines (TYPED.lines): { id, edges, drawn, lstyle, MC } -> defs, the markers of the ends drawn; edge(e, i), a
// line with ends: its style, its points trimmed for its flow, its markers; labels(i): its end labels' text.
// First each end on a node drawn by a typed shape with an inset (a circle, a diamond: notes/stage-4.md §4.2) is slid from
// the node's box onto its outline, as a map's on its cards: drawn[i] becomes a copy (drawnPts), so the layout's points,
// which a memo hands back (Q13), are never changed. A shape with no inset keeps its box end; the classifier's inset is 0
const insetLook = n => { const S = n && hasKey(SHAPE, n.shape) ? SHAPE[n.shape] : null; return S && S.draw && S.inset ? { ...n, S } : null; };
TYPED.lines = ({ id, edges, drawn, lstyle, MC }) => {
  edges.forEach((e, i) => { if (e.pts) drawn[i] = drawnPts(e, insetLook); });
  const ends = [...new Set(edges.flatMap(e => e.end ? ['from', 'to'].map(w => endOf(e.end, w)).filter(Boolean).map(k => k + '-' + lstyle(e).m) : []))];
  const endMark = km => { const k = km.slice(0, km.lastIndexOf('-')), m = km.slice(k.length + 1), [L, H, p, fl] = ENDS[k];
    return `<marker id="${id}-${km}" markerWidth="${L}" markerHeight="${2 * H}" refX="${L}" refY="${H}" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible"><path d="${p}" fill="${fl === 'line' ? MC[m] : fl === 'hollow' ? 'var(--um-stage-bg)' : 'none'}" stroke="${MC[m]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></marker>`; };
  // a typed line's end labels keep clear of the other lines, their labels and the end labels placed before them (1.9, L5)
  const segs = drawn.map(p => p.slice(1).map((q, k) => ({ x: Math.min(p[k][0], q[0]) - 3, y: Math.min(p[k][1], q[1]) - 3, w: Math.abs(q[0] - p[k][0]) + 6, h: Math.abs(q[1] - p[k][1]) + 6 }))), placed = [];
  const endLabs = i => { const bs = endLabels(edges[i], drawn[i], [...placed, ...segs.flatMap((S, j) => j === i ? [] : [...S, ...(edges[j].lbl ? [edges[j].lbl] : [])])]); placed.push(...bs); return bs; };
  return {
    defs: ends.map(endMark).join(''),
    edge(e, i) { const E = e.end; if (!E) return null;
      const st = E.dashed ? { ...lstyle(e), dash: '6 4' } : lstyle(e), cut = w => endOf(E, w) ? ENDS[endOf(E, w)][0] : 0, at = w => endOf(E, w) ? `url(#${id}-${endOf(E, w)}-${st.m})` : '';
      return { st, pts: trimLine(drawn[i], cut('from'), cut('to')), marks: `${at('to') ? `marker-end="${at('to')}"` : ''} ${at('from') ? `marker-start="${at('from')}"` : ''}` }; },
    labels: i => edges[i].end ? endLabs(i).map(b => `<text x="${r2(b.x + b.w / 2)}" y="${r2(b.y + 10.5)}" text-anchor="middle" class="end-lab" data-i="${i}" data-end="${b.end}" data-box="${b.x} ${b.y} ${b.w} ${b.h}" fill="var(--um-muted)" style="font:500 10px var(--um-sans)">${esc(b.text)}</text>`).join('') : '',
  };
};

export { endLabels };
