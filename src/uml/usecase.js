import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { labelW } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.note, a comment's look
import { ownersOn, placeTabs } from './owners.js';

/* ---------- the use case diagram, uml.use-case (work package 4.4, notes/stage-4.md §8) ----------
   Actors (a stick figure), use cases (an ellipse, its extension points in a compartment under the name) and subjects: a
   subject with a shown use case is a box (src/uml/owners.js's look), else a rectangle with its name; associations, includes,
   extends (their points by name, then their condition) and generalizations; comments. Laid out by layoutTyped from the
   host's ranking, a generalization and an extend turned so the parent and the base come first; repair and reroute off
   (§17). Line ends are slid onto the ellipse and the figure's column when drawn (src/typed/draw.js). Ships in
   lib/umlimator-all.js only. */

const UC_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), UC_ARR = x => (Array.isArray(x) ? x : []);
const UC_HAS = x => x != null && x !== '';
const UC_PROPS = x => (UC_OBJ(x && x.props) ? x.props : {});
const ucName = x => String(x.label ?? x.id);
const ucStereo = x => UC_ARR(UC_PROPS(x).stereotypes).filter(UC_HAS).map(String);
const ucPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const UC_LINES = ['uml.Association', 'uml.Include', 'uml.Extend', 'uml.Generalization', 'uml.CommentLink'];
const ucPointsOf = n => UC_ARR(n.members).filter(m => UC_OBJ(m) && m.type === 'uml.ExtensionPoint');

/* ---- the shapes (§4.1): ellipse and actor; a subject's frame ---- */
const UC = { px: 12, lh: 16, max: 160, st: 10, sth: 13, ep: 11, eph: 15, head: 14, gap: 6, k: 1.42, minW: 96, minH: 44 };
// a text in lines of at most max px, at most k lines: the last holds the rest, cut when drawn
function ucWrap(t, px, max, k) {
  const out = []; String(t ?? '').split(/\s+/).filter(Boolean).forEach(w => { const l = out.length ? out[out.length - 1] : null;
    if (l != null && (out.length === k || textW(l + ' ' + w, px) <= max)) out[out.length - 1] = l + ' ' + w; else out.push(w); });
  return out.length ? out : [''];
}
// a use case's texts: its stereotypes, its name on at most three lines, then its extension points' heading and names
function ucEllParts(n) {
  const st = UC_ARR(n.stereotypes).map(t => `«${t}»`), name = ucWrap(n.label, UC.px, UC.max, 3), eps = UC_ARR(n.points);
  const w = Math.min(UC.max, Math.max(...st.map(t => textW(t, UC.st)), ...name.map(l => textW(l, UC.px)), ...(eps.length ? [textW('extension points', UC.st), ...eps.map(p => textW(p, UC.ep))] : [])));
  const h = st.length * UC.sth + name.length * UC.lh + (eps.length ? UC.gap + UC.head + eps.length * UC.eph : 0);
  return { st, name, eps, w, h };
}
// an ellipse's depth inside its box's side at t (src/typed/draw.js slides a line's end by it)
const ucEllDip = (n, s, t) => { const v = s === 'L' || s === 'R', a = v ? n.w / 2 : n.h / 2, r = v ? n.h / 2 : n.w / 2, u = t - (v ? n.y + n.h / 2 : n.x + n.w / 2);
  return a * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); };
const ucEllPath = (n, d = 0) => { const rx = n.w / 2 + d, ry = n.h / 2 + d, cy = r2(n.y + n.h / 2);
  return `M${r2(n.x - d)} ${cy}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(n.x + n.w + d)} ${cy}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(n.x - d)} ${cy}Z`; };
const ucText = (x, y, px, wt, fill, t, max, more = '') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="middle"${more} fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(fit(t, px, max))}</text>`;
const ucNodeG = (n, cls, inner) => `<g class="node ${cls}" data-id="${esc(n.id)}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || '')}">${inner}</g>`;
SHAPE.ellipse = {
  // the text block, 1.42 (about √2) times as wide and as tall: a box that size fits inside the ellipse at its corners
  size: n => { const p = ucEllParts(n); return { w: Math.ceil(Math.max(UC.minW, p.w * UC.k + 16)), h: Math.ceil(Math.max(UC.minH, p.h * UC.k + 12)) }; },
  out: (n, d = 0) => ucEllPath(n, d), face: n => [n.y, n.y + n.h], inset: ucEllDip,
  draw(n, c, f) {
    const p = ucEllParts(n), cx = n.x + n.w / 2, cy = n.y + n.h / 2, max = p.w + 1; let y = cy - p.h / 2;
    const out = [`<path d="${ucEllPath(n)}" class="n-mask"/><path d="${ucEllPath(n)}" class="n-body" fill="${f}" stroke="${c}"/>`], hd = [];
    p.st.forEach(t => { hd.push(ucText(cx, y + 10, UC.st, 400, 'var(--um-muted)', t, max, ' class="c-st"')); y += UC.sth; });
    p.name.forEach(l => { hd.push(ucText(cx, y + 12, UC.px, 500, 'var(--um-text)', l, max, ` class="c-name" data-o="${esc(n.id)}"`)); y += UC.lh; });
    out.push(`<g class="c-head" data-band="${r2(n.y)} ${r2(y)}">${hd.join('')}</g>`);
    if (p.eps.length) { const dy = y + UC.gap / 2, half = n.w / 2 * Math.sqrt(Math.max(0, 1 - ((dy - cy) / (n.h / 2)) ** 2)), rows = [];
      rows.push(ucText(cx, dy + UC.head - 2, UC.st, 400, 'var(--um-muted)', 'extension points', max, ' class="c-st"'));
      p.eps.forEach((t, i) => rows.push(ucText(cx, dy + UC.head + i * UC.eph + 12, UC.ep, 400, 'var(--um-text)', t, max, ' class="c-row"')));
      out.push(`<g class="c-comp" data-comp="extension points" data-band="${r2(dy)} ${r2(n.y + n.h)}"><path d="M${r2(cx - half)} ${r2(dy)}H${r2(cx + half)}" class="n-det" stroke="${c}"/>${rows.join('')}</g>`); }
    return ucNodeG(n, 'usecase', out.join(''));
  },
};
// an actor: a stick figure 24 × 44, its stereotypes and name (two lines of 160 px at most) under it; the node as wide as the wider
const UC_AC = { fw: 24, fh: 44, gap: 4 };
const ucActorParts = n => { const st = UC_ARR(n.stereotypes).map(t => `«${t}»`), name = ucWrap(n.label, UC.px, UC.max, 2);
  return { st, name, w: Math.min(UC.max, Math.max(UC_AC.fw, ...st.map(t => textW(t, UC.st)), ...name.map(l => textW(l, UC.px)))) }; };
SHAPE.actor = {
  size: n => { const p = ucActorParts(n); return { w: Math.ceil(p.w + 4), h: UC_AC.fh + UC_AC.gap + p.st.length * UC.sth + p.name.length * UC.lh }; },
  out: (n, d = 0) => `M${r2(n.x - d)} ${r2(n.y - d)}H${r2(n.x + n.w + d)}V${r2(n.y + n.h + d)}H${r2(n.x - d)}Z`, face: n => [n.y, n.y + UC_AC.fh],
  inset: (n, s) => (s === 'L' || s === 'R' ? Math.max(0, (n.w - UC_AC.fw) / 2) : 0), // its box, narrowed to the figure's column on the left and right
  draw(n, c) {
    const p = ucActorParts(n), cx = r2(n.x + n.w / 2), y = n.y, max = n.w - 2; let ty = y + UC_AC.fh + UC_AC.gap; const hd = [];
    const fig = `<circle cx="${cx}" cy="${r2(y + 7)}" r="6.5"/><path d="M${cx} ${r2(y + 13.5)}V${r2(y + 29)}M${r2(cx - 11)} ${r2(y + 19)}H${r2(cx + 11)}M${r2(cx - 10)} ${r2(y + 43)}L${cx} ${r2(y + 29)}L${r2(cx + 10)} ${r2(y + 43)}"/>`;
    p.st.forEach(t => { hd.push(ucText(cx, ty + 10, UC.st, 400, 'var(--um-muted)', t, max, ' class="c-st"')); ty += UC.sth; });
    p.name.forEach(l => { hd.push(ucText(cx, ty + 12, UC.px, 500, 'var(--um-text)', l, max, ` class="c-name" data-o="${esc(n.id)}"`)); ty += UC.lh; });
    return ucNodeG(n, 'actor', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="n-mask" style="fill:transparent"/><g class="n-body" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${fig}</g>`
      + `<g class="c-head" data-band="${r2(y + UC_AC.fh)} ${r2(ty)}">${hd.join('')}</g>`);
  },
};
// a subject with something shown is a box: a rectangle on its border, its stereotypes and name in bold at the top left of its
// header room (24 px). Closed, it is a classifier with its name only (src/typed/draw.js)
SHAPE.subject = {
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" stroke="var(--um-muted)"/>`
    + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 17)}" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 24))}</text>`,
};

/* ---- the view read: its owners (§8.2), its lines, and every element's words ---- */
const UC_LOOK = { boxTypes: ['uml.Subject', 'uml.Package'], qualify: false, shape: x => (x.type === 'uml.Subject' ? 'subject' : 'package'), word: x => (x.type === 'uml.Subject' ? 'Subject' : 'Package') };
// the view's boxes, a subject's accessible name counting its use cases: "Subject Online bookshop, holding 8 use cases"
function ucPic(model, view) {
  const pic = ownersOn(model, view, UC_LOOK);
  const boxes = pic.boxes.map(b => { const held = pic.holds(b.id), x = pic.at.get(b.id), st = ucStereo(x);
    return held.every(id => pic.at.get(id).type === 'uml.UseCase') ? { ...b, aria: `${UC_LOOK.word(x)} ${ucName(x)}${st.length ? ` (${st.join(', ')})` : ''}, holding ${ucPlural(held.length, 'use case')}` } : b; });
  return { ...pic, boxes };
}
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two elements it shows; a
// line from a box to what it holds is left out
function ucLines(model, view, pic) {
  const E = new Map(); UC_ARR(model.edges).forEach(e => { if (UC_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const shown = new Set(pic.ids), list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : [...E.values()].filter(e => UC_LINES.includes(e.type));
  return list.filter(e => UC_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to)
    && ![[e.from, e.to], [e.to, e.from]].some(([b, x]) => pic.open.has(b) && (b === x || pic.chain(x).includes(b))));
}
const UC_KEYWORD = { 'uml.Include': '«include»', 'uml.Extend': '«extend»' };
// an extend's points by name and its condition: "(payment) [the shopper has a voucher code]"
function ucExtendParts(model, e) {
  const to = UC_ARR(model.nodes).find(n => UC_OBJ(n) && n.id === e.to), by = new Map(ucPointsOf(to || {}).map(m => [m.id, ucName(m)]));
  return { points: UC_ARR(UC_PROPS(e).extensionPoints).map(id => by.get(id) ?? String(id)), cond: UC_HAS(UC_PROPS(e).condition) ? String(UC_PROPS(e).condition) : null };
}
function ucLineLabel(model, e) {
  const x = e.type === 'uml.Extend' ? ucExtendParts(model, e) : null;
  return [UC_KEYWORD[e.type], ...ucStereo(e).map(t => `«${t}»`), e.label, x && x.points.length ? `(${x.points.join(', ')})` : '', x && x.cond ? `[${x.cond}]` : ''].filter(UC_HAS).join(' ');
}
const UC_LINE_WORD = { 'uml.Association': 'Association', 'uml.Include': 'Include', 'uml.Extend': 'Extend', 'uml.Generalization': 'Generalization', 'uml.CommentLink': 'Comment link' };
const UC_LINE_LOOK = { 'uml.Association': { from: 'none', to: 'none' }, 'uml.Include': { from: 'none', to: 'open', dashed: true }, 'uml.Extend': { from: 'none', to: 'open', dashed: true },
  'uml.Generalization': { from: 'none', to: 'triangle' }, 'uml.CommentLink': { from: 'none', to: 'none', dashed: true } };
const ucLookOf = e => (Object.hasOwn(UC_LINE_LOOK, e.type) ? UC_LINE_LOOK[e.type] : { from: 'none', to: 'arrow' });
// accessible names (§14): "Actor Shopper"; "Use case Check out, in Online bookshop, 2 extension points"
function ucNodeName(model, n, pic) {
  if (n.type === 'uml.Comment') return 'Comment: ' + ucName(n);
  const b = pic.boxes.find(x => x.id === n.id); if (b) return b.aria;
  const st = ucStereo(n), why = st.length ? ` (${st.join(', ')})` : '', up = n.parent != null && pic.at.get(n.parent), k = ucPointsOf(n).length;
  if (n.type === 'uml.UseCase') return `Use case ${ucName(n)}${why}${up ? `, in ${ucName(up)}` : ''}${k ? `, ${ucPlural(k, 'extension point')}` : ''}`;
  if (n.type === 'uml.Package') return `Package ${ucName(n)} (${[...st, 'closed'].join(', ')})`;
  return `${n.type === 'uml.Actor' ? 'Actor' : n.type === 'uml.Subject' ? 'Subject' : String(n.type).split('.').pop()} ${ucName(n)}${why}`;
}
// "Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher code"
function ucLineName(model, e, pic) {
  const nm = id => ucName(pic.at.get(id)), word = Object.hasOwn(UC_LINE_WORD, e.type) ? UC_LINE_WORD[e.type] : 'Line';
  if (e.type !== 'uml.Extend') { const said = [...ucStereo(e).map(t => `«${t}»`), e.label].filter(UC_HAS).join(' '); return `${word} from ${nm(e.from)} to ${nm(e.to)}${said ? ': ' + said : ''}`; }
  const { points, cond } = ucExtendParts(model, e);
  return `Extend from ${nm(e.from)} to ${nm(e.to)}${points.length ? `, at ${points.join(', ')}` : ''}${cond ? `, when ${cond}` : ''}`;
}
// reading order (§14): actors, then each subject (or package) and what it holds, then the rest, then the lines
function ucOrder(pic, lines) {
  const top = pic.holds(null), at = id => pic.at.get(id).type, out = [], put = id => { out.push(id); if (pic.open.has(id)) pic.holds(id).forEach(put); };
  [...top.filter(id => at(id) === 'uml.Actor'), ...top.filter(id => at(id) === 'uml.Subject' || at(id) === 'uml.Package'), ...top.filter(id => !['uml.Actor', 'uml.Subject', 'uml.Package'].includes(at(id)))].forEach(put);
  return [...out, ...lines.map(e => e.id)];
}

/* ---- the legend: each line kind drawn. ponytail: copies class.js's legendItem and ends, which it does not export ---- */
const UC_ENDS = { none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>', triangle: '<path d="M16 3L26 8L16 13Z" fill="var(--um-panel)"/>' };
const UC_SAYS = { 'uml.Association': 'an actor takes part in the use case', 'uml.Include': 'the base always does the included use case',
  'uml.Extend': 'adds to the base at its extension points, when the condition holds', 'uml.Generalization': 'is a kind of the one it points to', 'uml.CommentLink': 'what a comment is about' };
const ucLegend = edges => Object.keys(UC_SAYS).filter(t => edges.some(e => e.type === t)).map(t => { const L = UC_LINE_LOOK[t], name = UC_LINE_WORD[t], says = UC_SAYS[t];
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${L.to === 'none' ? 26 : 17}"${L.dashed ? ' stroke-dasharray="3 2"' : ''}/>${UC_ENDS[L.to]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; });

/* ---- the view laid out (§8.1) ---- */
// actors first: each actor the view shows outside a box goes to a column before the rest, in the order of the rows of the
// use cases it is associated with, a specialization after its general; a pinned actor keeps its row. The rest keep the host's
// places, so a pin, read in the host's ranking, is where it was drawn and moves no other node. pos is the host's ranking, kept
// (a cache holds it): a new object is returned
function ucActorsFirst(pos, view, pic, lines) {
  const A = pic.holds(null).filter(id => pic.at.get(id).type === 'uml.Actor' && Object.hasOwn(pos, id)), rest = Object.keys(pos).filter(id => !A.includes(id) && pic.ids.includes(id) && !pic.open.has(id));
  if (!A.length || !rest.length) return pos;
  const L = UC_OBJ(view.layout) ? view.layout : {}, pinned = A.filter(id => Array.isArray(L[id])), c = Math.min(...rest.map(id => pos[id][0])) - 1;
  const at = id => { const r = lines.filter(e => e.type === 'uml.Association' && (e.from === id || e.to === id)).map(e => (e.from === id ? e.to : e.from)).filter(x => Object.hasOwn(pos, x)).map(x => pos[x][1]); // a box takes no slot
    return r.length ? r.reduce((a, b) => a + b) / r.length : pos[id][1]; };
  const up = new Map(lines.filter(e => e.type === 'uml.Generalization' && A.includes(e.from) && A.includes(e.to) && e.from !== e.to).map(e => [e.from, e.to]));
  const order = [], put = (id, seen = new Set()) => { if (order.includes(id) || seen.has(id)) return; seen.add(id); if (up.has(id)) put(up.get(id), seen); order.push(id); };
  A.filter(id => !pinned.includes(id)).sort((a, b) => at(a) - at(b)).forEach(id => put(id));
  const out = Object.fromEntries([...rest.map(id => [id, pos[id]]), ...pinned.map(id => [id, [c, pos[id][1]]])]);
  order.filter(id => !pinned.includes(id)).reduce((r, id) => { let y = Math.max(r, at(id)); while (pinned.some(p => Math.abs(out[p][1] - y) < 1)) y++; out[id] = [c, y]; return y + 1; }, -Infinity);
  return out;
}
function ucGeo({ model, view, pos: ranked, memo }) {
  const pic = ucPic(model, view), lines = ucLines(model, view, pic), pos = ucActorsFirst(ranked || {}, view, pic, lines), P = id => (Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = pic.at.get(id), st = ucStereo(n);
    const shape = n.type === 'uml.Comment' ? { shape: 'note' } : n.type === 'uml.Package' ? { shape: 'package', stereotypes: st } : n.type === 'uml.Actor' ? { shape: 'actor', stereotypes: st }
      : n.type === 'uml.UseCase' ? { shape: 'ellipse', stereotypes: st, points: ucPointsOf(n).map(ucName) } : { shape: 'classifier', stereotypes: st, compartments: [] }; // a closed subject, or another node
    const d = { id, label: ucName(n), type: n.type || 'uml.UseCase', kind: 'file', ...shape, aria: ucNodeName(model, n, pic), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.map(e => { const label = ucLineLabel(model, e);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: label || undefined, end: ucLookOf(e), aria: ucLineName(model, e, pic),
      ...(e.type === 'uml.Extend' ? { cut: 280 } : {}), ...(UC_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  // as the class view (class.js typeGeo): laid out right with boxes, the columns spread by the widest label
  const down = view.direction === 'down', wide = !down && pic.boxes.length ? Math.max(0, ...edges.filter(e => e.label).map(labelW)) : 0;
  const g = placeTabs(layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: down ? 'down' : 'right',
    gap: 96 + (wide ? Math.ceil(wide) + 40 : 0), rgap: 56, repair: false, reroute: false }, memo));
  // the actors' column is -1 when the host put a node in column 0; the canvas pins no column under 0, and an actor's pinned column
  // is not read, so it says 0. ponytail: a drop then reads the actors' and that column's places as one column (render.js), and
  // an actor's pin can push a node of that column down a row (the host's fillLayout); a rank hook in the host would end both
  const ns = g.nodes.some(n => n.col < 0) ? g.nodes.map(n => (n.col < 0 ? { ...n, col: 0 } : n)) : null;
  return { ...g, ...(ns ? { nodes: ns, byId: Object.fromEntries(ns.map(n => [n.id, n])) } : {}), legend: ucLegend(g.edges), order: ucOrder(pic, lines) }; // a new object: what layoutTyped returned is never edited (§2.4)
}

/* ---- validators (§8.3). Each problem: { level, rule, path, message, ids } ---- */
const UC_RULES = {
  'association-ends': 'an association joins an actor and a use case',
  'include-ends': 'an include runs from a use case to another use case',
  'extend-ends': 'an extend runs from a use case to another use case',
  'extend-points': 'an extend names at least one extension point, each of the use case it extends',
  'generalization-kinds': 'a generalization joins two actors or two use cases',
  'use-case-owner': 'a use case is owned by a subject or a package, an actor by a package or nothing',
  'include-cycle': 'no use case includes itself, through other includes or directly',
  named: 'every actor and use case has a name',
  'point-names': 'a use case\'s extension points have different names',
};
const UC_KINDS = ['uml.Actor', 'uml.UseCase'];
function ucProblems(model) {
  const out = [], at = new Map(), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  UC_ARR(model && model.nodes).forEach(n => { if (UC_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const ty = id => (at.get(id) || {}).type, q = id => JSON.stringify(at.has(id) ? ucName(at.get(id)) : String(id)), uc = id => ty(id) === 'uml.UseCase';
  UC_ARR(model && model.nodes).forEach((n, i) => { if (!UC_OBJ(n) || !UC_KINDS.includes(n.type)) return;
    if (!UC_HAS(n.label) || !String(n.label).trim()) say('error', 'named', `nodes[${i}]`, [n.id], `${n.type === 'uml.Actor' ? 'actor' : 'use case'} ${n.id} has no name`);
    const p = n.parent != null && at.get(n.parent), ok = n.type === 'uml.UseCase' ? ['uml.Subject', 'uml.Package'] : ['uml.Package'];
    if (p && !ok.includes(p.type)) say('warning', 'use-case-owner', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)} is owned by ${q(p.id)}, a ${String(p.type).split('.').pop()}: ${n.type === 'uml.UseCase' ? 'a use case\'s owner is a subject or a package' : 'an actor\'s owner is a package, or none'}`);
    if (n.type !== 'uml.UseCase') return;
    const seen = new Map(); ucPointsOf(n).forEach(m => { const k = ucName(m), was = seen.get(k);
      if (was) say('warning', 'point-names', `nodes[${i}].members[${UC_ARR(n.members).indexOf(m)}]`, [n.id, was, m.id], `${q(n.id)} has two extension points named "${k}" (${was}, ${m.id})`); else seen.set(k, m.id); }); });
  const inc = new Map();
  UC_ARR(model && model.edges).forEach((e, i) => { if (!UC_OBJ(e)) return; const path = `edges[${i}]`, ends = [e.id, e.from, e.to];
    if (e.type === 'uml.Association' && (UC_KINDS.includes(ty(e.from)) || UC_KINDS.includes(ty(e.to))) && ![ty(e.from), ty(e.to)].sort().every((t, k) => t === UC_KINDS[k]))
      say('error', 'association-ends', path, ends, `${e.id} joins ${q(e.from)} and ${q(e.to)}: an association joins an actor and a use case`);
    if ((e.type === 'uml.Include' || e.type === 'uml.Extend') && (!uc(e.from) || !uc(e.to) || e.from === e.to))
      say('error', e.type === 'uml.Include' ? 'include-ends' : 'extend-ends', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: from a use case to another use case`);
    if (e.type === 'uml.Include' && uc(e.from) && uc(e.to)) inc.set(e.from, [...(inc.get(e.from) || []), [e.to, path, e.id]]);
    if (e.type === 'uml.Extend' && uc(e.to)) { const pts = UC_ARR(UC_PROPS(e).extensionPoints), mine = new Set(ucPointsOf(at.get(e.to)).map(m => m.id)), bad = pts.filter(p => !mine.has(p));
      if (!pts.length) say('error', 'extend-points', path, [e.id, e.to], `${e.id} names no extension point of ${q(e.to)}`);
      else if (bad.length) say('error', 'extend-points', `${path}.props.extensionPoints`, [e.id, e.to, ...bad.map(String)], `${e.id} names ${bad.map(p => JSON.stringify(String(p))).join(', ')}, not ${bad.length === 1 ? 'an extension point' : 'extension points'} of ${q(e.to)}`); }
    if (e.type === 'uml.Generalization' && (UC_KINDS.includes(ty(e.from)) || UC_KINDS.includes(ty(e.to))) && (ty(e.from) !== ty(e.to) || e.from === e.to))
      say('error', 'generalization-kinds', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a generalization joins two actors or two use cases`); });
  // an include cycle: said once, at the include that closes it, naming every use case on it
  const state = new Map(), stack = [];
  const walk = id => { state.set(id, 1); stack.push(id);
    for (const [p, path, eid] of inc.get(id) || []) {
      if (state.get(p) === 1) { const loop = stack.slice(stack.indexOf(p)); say('error', 'include-cycle', path, [...loop, eid], `${[...loop, p].map(q).join(' → ')} includes itself (${eid})`); }
      else if (!state.has(p)) walk(p); }
    stack.pop(); state.set(id, 2); };
  [...inc.keys()].forEach(id => { if (!state.has(id)) walk(id); });
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function ucDescribe(model, viewId) {
  const v = UC_ARR(model && model.views).find(x => UC_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = ucPic(model, v), lines = ucLines(model, v, pic), by = new Map(lines.map(e => [e.id, e]));
  return [`${v.title || v.id}: a use case diagram of ${ucPlural(pic.ids.length, 'element')} and ${ucPlural(lines.length, 'line')}.`,
    ...ucOrder(pic, lines).map(id => (by.has(id) ? ucLineName(model, by.get(id), pic) : ucNodeName(model, pic.at.get(id), pic)) + '.')].join('\n');
}

/* ---- editing (§8.4) ---- */
// the Owner field: a use case's subjects and packages, an actor's, a subject's or a comment's packages, each by its name
function ucOwners(model, x) {
  if (!UC_OBJ(x) || x.from != null || !['uml.UseCase', 'uml.Actor', 'uml.Subject', 'uml.Comment'].includes(x.type)) return null;
  const kinds = x.type === 'uml.UseCase' ? ['uml.Subject', 'uml.Package'] : ['uml.Package'];
  return UC_ARR(model.nodes).filter(n => UC_OBJ(n) && kinds.includes(n.type)).map(n => ({ id: n.id, label: ucName(n) }));
}
// an extension point is a member row, by its name
const ucPointText = t => { const s = String(t ?? '').trim(); return s ? { type: 'uml.ExtensionPoint', label: s, props: {} } : { error: 'An extension point has a name' }; };
// connect: an association drawn from a use case to an actor is added from the actor, so that actors are ranked first (§8.1)
function ucConnect(model, view, from, to, at, line) {
  const ty = id => (UC_ARR(model.nodes).find(n => UC_OBJ(n) && n.id === id) || {}).type;
  if (!UC_OBJ(line) || line.type !== 'uml.Association' || ty(from) !== 'uml.UseCase' || ty(to) !== 'uml.Actor') return null;
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has('association' + k)) k++;
  return [{ op: 'add', element: { id: 'association' + k, type: 'uml.Association', from: to, to: from }, view: view.id }];
}

/* remove: Shift + Delete on extension points (the member list's ✕) takes every extend left naming none of its use case's
   (extend-points), in the same transaction, said on the hint line; an extend naming another point keeps it. Else the default */
function ucRemove(model, view, ids, fromModel) {
  const gone = new Set(UC_ARR(ids)), ext = fromModel ? UC_ARR(model && model.edges).filter(e => UC_OBJ(e) && e.type === 'uml.Extend' && ![e.id, e.from, e.to].some(x => gone.has(x))
    && UC_ARR(UC_PROPS(e).extensionPoints).length && UC_ARR(UC_PROPS(e).extensionPoints).every(p => gone.has(p))) : [];
  if (!ext.length) return null;
  const N = UC_ARR(model.nodes).filter(UC_OBJ), pt = id => N.flatMap(n => UC_ARR(n.members)).find(p => UC_OBJ(p) && p.id === id);
  const nm = id => (pt(id) ? 'extension point ' : '') + JSON.stringify(ucName(pt(id) || N.find(n => n.id === id) || { id }));
  return { commands: [...gone, ...ext.map(e => e.id)].map(id => ({ op: 'delete', id })),
    say: `Deleted ${[...gone].map(nm).join(', ')} and ${ext.length > 1 ? 'the extends' : 'the extend'} from ${[...new Set(ext.map(e => nm(e.from)))].join(', ')}, which named no other extension point` };
}

const UC_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const UC_TYPE = registerDiagramType('uml.use-case', {
  title: 'use case diagram',
  elements: [['Actor', 'Actor'], ['UseCase', 'Use case'], ['Subject', 'Subject'], ['Comment', 'Comment']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['Association', 'Association'], ['Include', 'Include'], ['Extend', 'Extend'], ['Generalization', 'Generalization'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: {
    'uml.Actor': [UC_STEREO], 'uml.UseCase': [UC_STEREO], 'uml.Subject': [UC_STEREO], 'uml.Association': [UC_STEREO],
    'uml.Extend': [{ key: 'condition', label: 'Condition', kind: 'text' }, { key: 'extensionPoints', label: 'Extension points (ids)', kind: 'list' }],
    'uml.Include': [], 'uml.Generalization': [], 'uml.CommentLink': [],
  },
  refs: { 'uml.Extend': { 'props.extensionPoints': 'drop' } }, // a deleted extension point leaves every extend that names it
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.Extend', // the parent and the base first
  layout: ucGeo,
  boxes: (model, view) => ucPic(model, view).boxes,
  owners: ucOwners,
  member: { print: m => String(m.label ?? ''), edit: (m, t) => { const r = ucPointText(t); return r.error ? r : { commands: [{ op: 'set', id: m.id, path: 'label', value: r.label }] }; }, add: ucPointText, holds: n => n.type === 'uml.UseCase' },
  validate: ucProblems,
  rules: UC_RULES,
  describe: ucDescribe,
  edits: { connect: ucConnect, remove: ucRemove },
});

export { UC_TYPE, UC_RULES, ucGeo, ucProblems, ucDescribe, ucConnect, ucRemove };
