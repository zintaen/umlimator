import { apply } from '../core/apply.js';
import { aKind, ownNodes, registerDiagramType, idTable } from '../core/registry.js';
import { esc, fit, textW, widest } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { labelW } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import { brLines } from '../typed/draw.js';
import { closesCycle, commentConnect, commentLinkProblems, lineIn, lineItem } from './class.js'; // SHAPE.note, a comment's look too
import { ownersOn, placeTabs, readingOrder } from './owners.js';
import { snKindName } from './structure.js';
import { usedIds, jsonText, labelOr, elName, propTextProblems, copyOf } from '../core/model.js';

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
const ucName = elName;
const ucStereo = x => UC_ARR(UC_PROPS(x).stereotypes).filter(UC_HAS).map(String);
const ucPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const UC_LINES = ['uml.Association', 'uml.Include', 'uml.Extend', 'uml.Generalization', 'uml.CommentLink'];
const ucPointsOf = n => UC_ARR(n.members).filter(m => UC_OBJ(m) && m.type === 'uml.ExtensionPoint');

/* ---- the shapes (§4.1): ellipse and actor; a subject's frame ---- */
const UC = { px: 12, lh: 16, max: 160, st: 10, sth: 13, ep: 11, eph: 15, head: 14, gap: 6, k: 1.42, minW: 96, minH: 44 };
// a text in lines of at most max px, at most k lines: the last holds the rest, cut when drawn. A line break in t (a Mermaid
// <br>, F2's Shift+Enter) starts a new line where the author put it (audit 22, as flowWrap)
function ucWrap(t, px, max, k) {
  const out = []; brLines(t).forEach(part => { let fresh = true;
    part.split(/\s+/).filter(Boolean).forEach(w => { const l = out.length && !fresh ? out[out.length - 1] : null;
      if (l != null && (out.length === k || textW(l + ' ' + w, px) <= max)) out[out.length - 1] = l + ' ' + w;
      else if (out.length === k) out[k - 1] += ' ' + w; else out.push(w);
      fresh = false; }); });
  return out.length ? out : [''];
}
// a use case's texts: its stereotypes, its name on at most three lines, then its extension points' heading and names
function ucEllParts(n) {
  const st = UC_ARR(n.stereotypes).map(t => `«${t}»`), name = ucWrap(n.label, UC.px, UC.max, 3), eps = UC_ARR(n.points).flatMap(p => brLines(p)); // a point its author broke: a line each (audit 26)
  const w = Math.min(UC.max, Math.max(widest(st, t => textW(t, UC.st)), widest(name, l => textW(l, UC.px)), ...(eps.length ? [textW('extension points', UC.st), widest(eps, p => textW(p, UC.ep))] : [])));
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
  return { st, name, w: Math.min(UC.max, Math.max(UC_AC.fw, widest(st, t => textW(t, UC.st)), widest(name, l => textW(l, UC.px)))) }; };
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
// header room; a title the author broke (a Mermaid <br>) a line each, its room grown by ucPic's head (audit 22)
SHAPE.subject = {
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" stroke="var(--um-muted)"/>`
    + brLines(f.title ?? f.label ?? f.id).map((l, i) => `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 17 + i * UC.lh)}" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(l, 12, f.w - 24))}</text>`).join(''),
};

/* ---- the view read: its owners (§8.2), its lines, and every element's words ---- */
const UC_LOOK = { boxTypes: ['uml.Subject', 'uml.Package'], qualify: false, shape: x => (x.type === 'uml.Subject' ? 'subject' : 'package'), word: x => (x.type === 'uml.Subject' ? 'Subject' : 'Package') };
// the view's boxes, a subject's accessible name counting its use cases: "Subject Online bookshop, holding 8 use cases"
function ucPic(model, view) {
  const pic = ownersOn(model, view, UC_LOOK);
  const boxes = pic.boxes.map(b => { const held = pic.holds(b.id), x = pic.at.get(b.id), st = ucStereo(x);
    const k = x.type === 'uml.Subject' ? brLines(b.title ?? b.label).length : 1, c = k > 1 ? { ...b, head: (k - 1) * UC.lh } : b;
    return held.every(id => pic.at.get(id).type === 'uml.UseCase') ? { ...c, aria: `${UC_LOOK.word(x)} ${ucName(x)}${st.length ? ` (${st.join(', ')})` : ''}, holding ${ucPlural(held.length, 'use case')}` } : c; });
  return { ...pic, boxes };
}
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two elements it shows; a
// line from a box to what it holds is left out
function ucLines(model, view, pic) {
  const E = new Map(); UC_ARR(model.edges).forEach(e => { if (UC_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const shown = new Set(pic.ids), list = Array.isArray(view.edges) ? [...new Set(view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)))] : [...E.values()].filter(e => UC_LINES.includes(e.type));
  return list.filter(e => UC_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to)
    && ![[e.from, e.to], [e.to, e.from]].some(([b, x]) => pic.open.has(b) && (b === x || pic.chain(x).includes(b))));
}
const UC_KEYWORD = { __proto__: null, 'uml.Include': '«include»', 'uml.Extend': '«extend»' };
// an extend's points by name and its condition: "(payment) [the shopper has a voucher code]"; on the diff page a removed
// extend whose point went with it names it as it was (pointNames, src/map/diff.js; audit 48)
function ucExtendParts(model, e) {
  const to = UC_ARR(model.nodes).find(n => UC_OBJ(n) && n.id === e.to), by = new Map(ucPointsOf(to || {}).map(m => [m.id, ucName(m)]));
  if (UC_OBJ(e.pointNames)) Object.entries(e.pointNames).forEach(([id, w]) => { if (!by.has(id) && typeof w === 'string') by.set(id, w); });
  return { points: UC_ARR(UC_PROPS(e).extensionPoints).map(id => by.get(id) ?? String(id)), cond: UC_HAS(UC_PROPS(e).condition) ? String(UC_PROPS(e).condition) : null };
}
function ucLineLabel(model, e) {
  const x = e.type === 'uml.Extend' ? ucExtendParts(model, e) : null;
  return [UC_KEYWORD[e.type], ...ucStereo(e).map(t => `«${t}»`), e.label, x && x.points.length ? `(${x.points.join(', ')})` : '', x && x.cond ? `[${x.cond}]` : ''].filter(UC_HAS).join(' ');
}
/* rename (F2) on a line: the field holds ucLineLabel's text; its keyword and «stereotypes» come off the front, and on an
   extend its "(points)" off the end (changed: { error }, they are edited in the panel) and a trailing "[condition]", its
   brackets matched from the end, is read back as its condition (none: no condition). The rest is the label (audit 15).
   The text unchanged is nothing; an extend whose drawn text does not read back as its label and condition (a label
   ending in [..]) is { error }: those are edited in the panel (audit 16). Anything else: null */
function ucRename(model, view, id, text) {
  const e = lineIn(model, view, id); if (!e) return null;
  const t0 = String(text ?? '').trim(); if (t0 === ucLineLabel(model, e)) return [];
  const pre = [UC_KEYWORD[e.type], ...ucStereo(e).map(t => `«${t}»`)].filter(UC_HAS).join(' '), x = e.type === 'uml.Extend' ? ucExtendParts(model, e) : null;
  const read = s => { let t = s, cond = null;
    if (pre && (t === pre || t.startsWith(pre + ' '))) t = t.slice(pre.length).trim();
    if (!x) return { label: t, cond };
    if (t.endsWith(']')) { let d = 0, i = t.length - 1; for (; i >= 0; i--) { if (t[i] === ']') d++; else if (t[i] === '[' && --d === 0) break; }
      if (i >= 0) { cond = t.slice(i + 1, -1).trim() || null; t = t.slice(0, i).trim(); } }
    const pts = x.points.length ? `(${x.points.join(', ')})` : '';
    if (pts) { if (t !== pts && !t.endsWith(' ' + pts)) return { error: 'Edit an extend\'s extension points in its properties' }; t = t.slice(0, -pts.length).trim(); }
    return { label: t, cond }; };
  if (x) { const b = read(ucLineLabel(model, e)); if (b.error || b.label !== String(e.label ?? '').trim() || b.cond !== x.cond) return { error: 'This extend\'s text does not read back as its name and condition: edit them in its properties' }; }
  const r = read(t0); if (r.error) return r;
  return [...(r.label === String(e.label ?? '') ? [] : [{ op: 'set', id, path: 'label', value: r.label || undefined }]), ...(x && r.cond !== x.cond ? [{ op: 'set', id, path: 'props.condition', value: r.cond ?? undefined }] : [])];
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
  // a kind outside the view's own in words, "Data type Money", never its type's name (audit 23); no type: "Element Plain" (audit 27)
  return `${n.type === 'uml.Actor' ? 'Actor' : n.type === 'uml.Subject' ? 'Subject' : snKindName(n.type)} ${ucName(n)}${why}`;
}
// "Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher code"
function ucLineName(model, e, pic) {
  const nm = id => ucName(pic.at.get(id)), word = Object.hasOwn(UC_LINE_WORD, e.type) ? UC_LINE_WORD[e.type] : 'Line';
  const said = [...ucStereo(e).map(t => `«${t}»`), e.label].filter(UC_HAS).join(' ');
  if (e.type !== 'uml.Extend') return `${word} from ${nm(e.from)} to ${nm(e.to)}${said ? ': ' + said : ''}`;
  const { points, cond } = ucExtendParts(model, e); // an extend's name and «stereotypes», drawn, said too (audit 17)
  return `Extend from ${nm(e.from)} to ${nm(e.to)}${said ? ': ' + said : ''}${points.length ? `, at ${points.join(', ')}` : ''}${cond ? `, when ${cond}` : ''}`;
}
// reading order (§14): actors, then each subject (or package) and what it holds, then the rest, then the lines
function ucOrder(pic, lines) {
  const top = pic.holds(null), at = id => pic.at.get(id).type; // readingOrder's stack: packages nested to any depth
  const first = [...top.filter(id => at(id) === 'uml.Actor'), ...top.filter(id => at(id) === 'uml.Subject' || at(id) === 'uml.Package'), ...top.filter(id => !['uml.Actor', 'uml.Subject', 'uml.Package'].includes(at(id)))];
  return [...readingOrder({ ...pic, holds: o => (o == null ? first : pic.holds(o)) }), ...lines.map(e => e.id)];
}

/* ---- the legend: each line kind drawn. ponytail: copies class.js's legendItem and ends, which it does not export ---- */
const UC_ENDS = { none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>', triangle: '<path d="M16 3L26 8L16 13Z" fill="var(--um-panel)"/>' };
const UC_SAYS = { 'uml.Association': 'an actor takes part in the use case', 'uml.Include': 'the base always does the included use case',
  'uml.Extend': 'adds to the base at its extension points, when the condition holds', 'uml.Generalization': 'is a kind of the one it points to', 'uml.CommentLink': 'what a comment is about' };
const ucLegend = edges => Object.keys(UC_SAYS).filter(t => edges.some(e => e.type === t)).map(t => { const L = UC_LINE_LOOK[t], name = UC_LINE_WORD[t], says = UC_SAYS[t];
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${L.to === 'none' ? 26 : 17}"${L.dashed ? ' stroke-dasharray="3 2"' : ''}/>${UC_ENDS[L.to]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; })
  .concat(edges.some(e => !Object.hasOwn(UC_LINE_WORD, e.type)) ? [lineItem()] : []); // a kind it does not draw as its own: "Line", its arrow (audit 27)

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
  const out = idTable(Object.fromEntries([...rest.map(id => [id, pos[id]]), ...pinned.map(id => [id, [c, pos[id][1]]])])); // out['__proto__'] = ... is an own key
  order.filter(id => !pinned.includes(id)).reduce((r, id) => { let y = Math.max(r, at(id)); while (pinned.some(p => Math.abs(out[p][1] - y) < 1)) y++; out[id] = [c, y]; return y + 1; }, -Infinity);
  return out;
}
function ucGeo({ model, view, pos: ranked, memo }) {
  const pic = ucPic(model, view), lines = ucLines(model, view, pic), pos = ucActorsFirst(ranked || {}, view, pic, lines), P = id => (Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = pic.at.get(id), st = ucStereo(n);
    const shape = n.type === 'uml.Comment' ? { shape: 'note' } : n.type === 'uml.Package' ? { shape: 'package', stereotypes: st } : n.type === 'uml.Actor' ? { shape: 'actor', stereotypes: st }
      : n.type === 'uml.UseCase' ? { shape: 'ellipse', stereotypes: st, points: ucPointsOf(n).map(ucName) } : { shape: 'classifier', stereotypes: st, compartments: [], ariaOwn: ucNodeName(model, n, pic) }; // a closed subject, or another node: named as describe() names it (audit 28)
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
  return { ...g, ...(ns ? { nodes: ns, byId: idTable(Object.fromEntries(ns.map(n => [n.id, n]))) } : {}), legend: ucLegend(g.edges), order: ucOrder(pic, lines) }; // a new object: what layoutTyped returned is never edited (§2.4)
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
  'generalization-cycle': 'no actor or use case is its own ancestor',
  named: 'every actor and use case has a name',
  'point-names': 'a use case\'s extension points have different names',
  'comment-link': 'a comment link has a comment at one end',
};
const UC_KINDS = ['uml.Actor', 'uml.UseCase'];
function ucProblems(model, view) {
  const out = [], at = new Map(), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  UC_ARR(model && model.nodes).forEach(n => { if (UC_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const ty = id => (at.get(id) || {}).type, q = id => JSON.stringify(at.has(id) ? ucName(at.get(id)) : String(id)), uc = id => ty(id) === 'uml.UseCase';
  UC_ARR(model && model.nodes).forEach((n, i) => { if (!UC_OBJ(n) || !UC_KINDS.includes(n.type)) return;
    if (!UC_HAS(n.label) || !String(n.label).trim()) say('error', 'named', `nodes[${i}]`, [n.id], `${n.type === 'uml.Actor' ? 'actor' : 'use case'} ${n.id} has no name`);
    const p = n.parent != null && at.get(n.parent), ok = n.type === 'uml.UseCase' ? ['uml.Subject', 'uml.Package'] : ['uml.Package'];
    if (p && !ok.includes(p.type)) say('warning', 'use-case-owner', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)} is owned by ${q(p.id)}, ${aKind(UC_TYPE, p)}: ${n.type === 'uml.UseCase' ? 'a use case\'s owner is a subject or a package' : 'an actor\'s owner is a package, or none'}`);
    if (n.type !== 'uml.UseCase') return;
    const seen = new Map(); ucPointsOf(n).forEach(m => { const k = ucName(m), was = seen.get(k);
      if (was) say('warning', 'point-names', `nodes[${i}].members[${UC_ARR(n.members).indexOf(m)}]`, [n.id, was, m.id], `${q(n.id)} has two extension points named "${k}" (${was}, ${m.id})`); else seen.set(k, m.id); }); });
  const inc = new Map(), gen = new Map(), lines = UC_ARR(model && model.edges).map((e, i) => [e, `edges[${i}]`]).filter(([e]) => UC_OBJ(e));
  // and the view's own lines (view.edges objects), which ucLines draws; one a model line's id takes is that one (audit 20, as
  // flowProblems since audit 19). That view's alone: validate() asks once a view, so two views' own lines are never weighed together (audit 21)
  const lids = new Set(lines.map(([e]) => e.id)), vi = UC_ARR(model && model.views).indexOf(view);
  if (vi >= 0 && view.diagram === 'uml.use-case') UC_ARR(view.edges).forEach((e, j) => { if (UC_OBJ(e) && !lids.has(e.id)) { lids.add(e.id); lines.push([e, `views[${vi}].edges[${j}]`]); } });
  lines.forEach(([e, path]) => { const ends = [e.id, e.from, e.to];
    if (e.type === 'uml.Association' && (UC_KINDS.includes(ty(e.from)) || UC_KINDS.includes(ty(e.to))) && ![ty(e.from), ty(e.to)].sort().every((t, k) => t === UC_KINDS[k]))
      say('error', 'association-ends', path, ends, `${e.id} joins ${q(e.from)} and ${q(e.to)}: an association joins an actor and a use case`);
    if ((e.type === 'uml.Include' || e.type === 'uml.Extend') && (!uc(e.from) || !uc(e.to) || e.from === e.to))
      say('error', e.type === 'uml.Include' ? 'include-ends' : 'extend-ends', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: from a use case to another use case`);
    if (e.type === 'uml.Include' && uc(e.from) && uc(e.to)) inc.set(e.from, [...(inc.get(e.from) || []), [e.to, path, e.id]]);
    if (e.type === 'uml.Extend') out.push(...propTextProblems(e, path, ['condition'])); // drawn `[condition]` as text (audit 43)
    if (e.type === 'uml.Extend' && uc(e.to)) { const pts = UC_ARR(UC_PROPS(e).extensionPoints), mine = new Set(ucPointsOf(at.get(e.to)).map(m => m.id)), bad = pts.filter(p => !mine.has(p));
      if (!pts.length) say('error', 'extend-points', path, [e.id, e.to], `${e.id} names no extension point of ${q(e.to)}`);
      else if (bad.length) say('error', 'extend-points', `${path}.props.extensionPoints`, [e.id, e.to, ...bad.map(String)], `${e.id} names ${bad.map(p => JSON.stringify(String(p))).join(', ')}, not ${bad.length === 1 ? 'an extension point' : 'extension points'} of ${q(e.to)}`); }
    if (e.type === 'uml.Generalization' && (UC_KINDS.includes(ty(e.from)) || UC_KINDS.includes(ty(e.to))) && ty(e.from) !== ty(e.to))
      say('error', 'generalization-kinds', path, ends, `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a generalization joins two actors or two use cases`);
    // a self-generalization is generalization-cycle's, as in the class view: its two ends are of one kind (audit 30)
    else if (e.type === 'uml.Generalization' && UC_KINDS.includes(ty(e.from))) gen.set(e.from, [...(gen.get(e.from) || []), [e.to, path, e.id]]); });
  // an include cycle, and a generalization cycle between actors or use cases (UML 2.5.1 forbids one for every classifier, as
  // the class view's rule says it, audit 29): each said once, at the line that closes it, naming every element on it
  const cycles = (next, rule, said) => { const state = new Map(), stack = [];
    const walk = id => { const at = [0]; state.set(id, 1); stack.push(id); // a stack of frames, not recursion: a chain of any depth
      while (at.length) { const top = stack[stack.length - 1], ps = next.get(top) || [];
        if (at[at.length - 1] === ps.length) { at.pop(); stack.pop(); state.set(top, 2); continue; }
        const [p, path, eid] = ps[at[at.length - 1]++];
        if (state.get(p) === 1) { const loop = stack.slice(stack.indexOf(p)); say('error', rule, path, [...loop, eid], `${[...loop, p].map(q).join(' → ')} ${said} (${eid})`); }
        else if (!state.has(p)) { state.set(p, 1); stack.push(p); at.push(0); } } };
    [...next.keys()].forEach(id => { if (!state.has(id)) walk(id); }); };
  cycles(inc, 'include-cycle', 'includes itself'); cycles(gen, 'generalization-cycle', 'is its own ancestor');
  // a comment link with no comment at either end (audit 46), of the lines this view draws: one another view draws is that view's to judge (audit 47)
  const drawn = UC_OBJ(view) ? new Set(ucLines(model, view, ucPic(model, view)).map(e => e.id)) : null;
  out.push(...commentLinkProblems(drawn ? lines.filter(([e]) => drawn.has(e.id)) : lines, ty, q));
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function ucDescribe(model, viewId) {
  const v = UC_ARR(model && model.views).find(x => UC_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const pic = ucPic(model, v), lines = ucLines(model, v, pic), by = new Map(lines.map(e => [e.id, e]));
  return [`${labelOr(v.title, v.id)}: a use case diagram of ${ucPlural(pic.ids.length, 'element')} and ${ucPlural(lines.length, 'line')}.`,
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
// connect: an association drawn from a use case to an actor is added from the actor, so that actors are ranked first (§8.1);
function ucConnect(model, view, from, to, at, line) {
  const ty = id => (UC_ARR(model.nodes).find(n => UC_OBJ(n) && n.id === id) || {}).type;
  // a generalization or an include that would close a cycle (generalization-cycle, include-cycle), an extend to its own use
  // case (extend-ends) is refused, as validate() would flag it (audit 36)
  if (UC_OBJ(line) && line.type === 'uml.CommentLink') return commentConnect(model, view, from, to, line); // from the comment (audit 46)
  if (UC_OBJ(line) && line.type === 'uml.Extend' && from === to) return { error: 'An extend runs from a use case to another use case' };
  const loop = UC_OBJ(line) && (line.type === 'uml.Generalization' ? closesCycle(model, view, line.type, from, to)
    : line.type === 'uml.Include' ? closesCycle(model, view, line.type, from, to, 'an include', 'include itself') : null);
  if (loop) return loop;
  if (!UC_OBJ(line) || typeof line.type !== 'string' || !UC_OBJ(view)) return null;
  const used = new Set(); usedIds(model, used);
  const fresh = b => { let k = 1; while (used.has(b + k)) k++; return b + k; }, flip = line.type === 'uml.Association' && ty(from) === 'uml.UseCase' && ty(to) === 'uml.Actor';
  const commands = [{ op: 'add', element: { id: fresh(flip ? 'association' : line.type.split('.').pop().toLowerCase()), type: line.type, from: flip ? to : from, to: flip ? from : to,
    ...(UC_OBJ(line.props) ? { props: copyOf(line.props) } : {}) }, view: view.id }];
  // any other error the line brings (include-ends, extend-ends, association-ends, generalization-kinds) is refused with the
  // rule's words, as the state machine's and the overview's connect refuse theirs (audit 50). extend-points is the new extend's
  // own until its extension points are picked in the properties panel, so it is not one
  const key = p => p.rule + ' ' + p.ids.join(' '), errs = m => ucProblems(m, UC_ARR(m.views).find(v => UC_OBJ(v) && v.id === view.id) || view).filter(p => p.level === 'error' && p.rule !== 'extend-points');
  let now; try { now = apply(model, commands); } catch (e) { return { error: String(e.message) }; }
  const was = new Set(errs(model).map(key)), bad = errs(now).find(p => !was.has(key(p)));
  if (bad) return { error: flip ? bad.message : bad.message.replace(`: ${commands[0].element.id} `, ': the new line ') }; // not added: the canvas names its own
  return flip ? commands : null; // null: the canvas's own add, its own id
}

/* remove: Shift + Delete on extension points (the member list's ✕) takes every extend left naming none of its use case's
   (extend-points), in the same transaction, said on the hint line; an extend naming another point keeps it. Else the default */
function ucRemove(model, view, ids, fromModel) {
  // a use case view's own extends (view.edges objects) as well (audit 20)
  const own = UC_ARR(model && model.views).filter(v => UC_OBJ(v) && v.diagram === 'uml.use-case').flatMap(v => UC_ARR(v.edges));
  const gone = new Set(UC_ARR(ids)), ext = fromModel ? [...new Set([...UC_ARR(model && model.edges), ...own])].filter(e => UC_OBJ(e) && e.type === 'uml.Extend' && ![e.id, e.from, e.to].some(x => gone.has(x))
    && UC_ARR(UC_PROPS(e).extensionPoints).length && UC_ARR(UC_PROPS(e).extensionPoints).every(p => gone.has(p))) : [];
  if (!ext.length) return null;
  // named with the view's own use cases too (remove gets the model as it is: registry.js), audit 24
  const N = UC_ARR(ownNodes(model, view).model.nodes).filter(UC_OBJ), pt = id => N.flatMap(n => UC_ARR(n.members)).find(p => UC_OBJ(p) && p.id === id);
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
  refs: { 'uml.Extend': { 'props.extensionPoints': 'drop empties' } }, // a deleted extension point leaves every extend that names it; an extend left naming none goes too, on any path (audit 19)
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.Extend', // the parent and the base first
  layout: ucGeo,
  boxes: (model, view) => ucPic(model, view).boxes,
  owners: ucOwners,
  member: { print: m => String(m.label ?? ''), edit: (m, t) => { const r = ucPointText(t); return r.error ? r : { commands: [{ op: 'set', id: m.id, path: 'label', value: r.label }] }; }, add: ucPointText, holds: n => n.type === 'uml.UseCase' },
  validate: ucProblems,
  rules: UC_RULES,
  describe: ucDescribe,
  // the PDF's Kind of an element of no type: "Element", as its accessible name (audit 28); null: the type's word
  word: (model, id) => { const x = UC_ARR(model && model.nodes).find(n => UC_OBJ(n) && n.id === id); return x && !x.type ? snKindName(x.type) : null; }, // no type (or ""): "Element", as named (audit 29)
  // the PDF's members: an extension point as drawn, one with no name (or "") by its id; member.print stays F2's edit text (audit 36)
  rows: (model, view, id) => { const x = [...UC_ARR(model && model.nodes), ...UC_ARR(view && view.nodes)].find(n => UC_OBJ(n) && n.id === id);
    return x && x.type === 'uml.UseCase' ? UC_ARR(x.members).filter(UC_OBJ).map(m => (m.type === 'uml.ExtensionPoint' ? ucName(m) : String(m.label ?? ''))) : null; },
  edits: { connect: ucConnect, remove: ucRemove, rename: ucRename },
});

export { UC_TYPE, UC_RULES, ucGeo, ucProblems, ucDescribe, ucConnect, ucRemove, ucRename };
