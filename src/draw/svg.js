import { clauseFit, esc, fit, measureText, sansW, textW, wrap2 } from '../core/text.js';
import { endLabels, roundPath, trimLine } from './lines.js';
import { SHAPE, cardLook, drawnPts, noteOf, r2, sidePorts, tabLine } from './shapes.js';
import { CHG } from '../layout/layered.js';
import { WIRES, badgesOf, mapTabs, toneOf } from '../map/cards.js';
import { KIND, SIGIL, hasKey } from '../map/kinds.js';

let svgSeq = 0;
// A typed view's line (1.5; a map's lines never read it) says how it is drawn in e.end: { from, to, dashed, labels }. from
// and to name an end in this table, the line's ends as UML draws them (none, or a name it does not hold, draws no marker);
// dashed: a dependency's or realization's line; labels: each end's role and multiplicity (endLabels). Each end: [its
// length, half its height, its path pointing right with the tip at its length, its fill]. Its tip is where the line ends,
// on the node's outline. Hollow is the stage's background, filled the line's own colour (T2), in either theme
const ENDS = { none: null, arrow: [10, 4, 'M0 0L10 4L0 8Z', 'line'], open: [10, 5, 'M0 0L10 5L0 10', 'none'], triangle: [13, 7, 'M0 0L13 7L0 14Z', 'hollow'],
  diamond: [16, 6, 'M0 6L8 0L16 6L8 12Z', 'hollow'], 'filled-diamond': [16, 6, 'M0 6L8 0L16 6L8 12Z', 'line'] };
const endOf = (E, w) => hasKey(ENDS, E[w]) && ENDS[E[w]] ? E[w] : null;
/* SVG markup. opts: { childCount(id) -> n, subject: id, title } */
function svgOf(geo, opts = {}) {
  const id = 'g' + (svgSeq++), { nodes, edges, groups, bounds: B, map } = geo;
  const col = k => `var(--um-${KIND[k][0]})`, fill = k => `var(--um-${KIND[k][0]}-f)`;
  const estyle = e => {
    if (e.style === 'faded') return { ...(map && e.wk ? { c: `var(--um-w-${e.wk})`, m: e.wk, cls: ' w-' + e.wk + ' faded' } : { c: 'var(--um-arrow)', m: 'd', cls: ' faded' }), dash: '', op: .35 }; // its own colour, faint, no flow (drift's idle lines)
    if (map && e.wk && !e.style) return { c: `var(--um-w-${e.wk})`, m: e.wk, dash: e.back ? '6 5' : '', cls: ' w-' + e.wk + (e.back ? ' back' : '') };
    const st = e.style || (e.change === 'added' ? 'added' : e.change === 'removed' ? 'removed' : '');
    if (st === 'added' || st === 'emphasis') return { c: 'var(--um-green)', m: 'g', dash: '', flow: st === 'added' || e.animate };
    if (st === 'removed') return { c: 'var(--um-rose)', m: 'r', dash: '5 5', op: .7 };
    if (st === 'security') return { c: 'var(--um-rose)', m: 'r', dash: '5 5' };
    if (st === 'dashed' || st === 'async') return { c: 'var(--um-violet)', m: 'v', dash: '4 4' };
    return { c: 'var(--um-arrow)', m: 'd', dash: '' };
  };
  // a line that breaks a rule (#70): rose, with a "!" just after its start that names the rule (opts.broken: rule titles by edge id)
  const broke = e => opts.broken ? [...new Set((e.all || [e]).flatMap(x => opts.broken[x._id] || []))] : [];
  const lstyle = e => broke(e).length ? { ...estyle(e), c: 'var(--um-rose)', m: 'r' } : estyle(e);
  const ruleMark = (e, why) => { const [a, b] = e.pts, L = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) || 1, t = Math.min(18, L / 2) / L, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    return `<g class="rule-mark"><title>Breaks rule: ${esc(why.join('; '))}</title><circle cx="${x}" cy="${y}" r="6.5"/><text x="${x}" y="${y + 3.4}" text-anchor="middle">!</text></g>`; };
  const marker = (n, c, k = 1) => `<marker id="${id}-${n}" markerWidth="${10 * k}" markerHeight="${8 * k}" refX="${9 * k}" refY="${4 * k}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L${10 * k} ${4 * k} L0 ${8 * k} Z" fill="${c}"/></marker>`;
  const MC = { d: 'var(--um-arrow)', g: 'var(--um-green)', r: 'var(--um-rose)', v: 'var(--um-violet)', h: 'var(--um-cyan)', ...Object.fromEntries(WIRES.map(w => [w[0], `var(--um-w-${w[0]})`])) };
  const heavy = [...new Set(edges.filter(e => e.weight > 1).map(e => lstyle(e).m + '-w' + e.weight))]; // a heavier line's arrowhead grows with it
  const typed = e => !map && e.end ? e.end : null, ends = [...new Set(edges.flatMap(e => typed(e) ? ['from', 'to'].map(w => endOf(e.end, w)).filter(Boolean).map(k => k + '-' + lstyle(e).m) : []))];
  const endMark = km => { const k = km.slice(0, km.lastIndexOf('-')), m = km.slice(k.length + 1), [L, H, p, fl] = ENDS[k];
    return `<marker id="${id}-${km}" markerWidth="${L}" markerHeight="${2 * H}" refX="${L}" refY="${H}" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible"><path d="${p}" fill="${fl === 'line' ? MC[m] : fl === 'hollow' ? 'var(--um-stage-bg)' : 'none'}" stroke="${MC[m]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></marker>`; };
  // the notation (0.15.0): each card's look, and each line as drawn, its ends on the cards' outlines (a map's cards only)
  const notation = map ? noteOf(opts.shapes) || 'box' : 'box', kidsOf = n => n.kids != null ? n.kids : opts.childCount ? opts.childCount(n.id) : 0;
  const ports = map ? sidePorts(geo) : null, looks = new Map(map ? nodes.map(n => [n, cardLook(n, notation, !!(kidsOf(n) || n.opens) && opts.openHint !== false, ports.get(n))]) : []);
  const drawn = edges.map(e => looks.size ? drawnPts(e, n => looks.get(n) || null) : e.pts);
  let s = `<svg viewBox="${B.x} ${B.y} ${B.w} ${B.h}" data-w="${B.w}" data-h="${B.h}" role="${map ? 'group' : 'img'}" aria-label="${esc(opts.title || 'Diagram')}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>${marker('d', 'var(--um-arrow)')}${marker('g', 'var(--um-green)')}${marker('r', 'var(--um-rose)')}${marker('v', 'var(--um-violet)')}${marker('h', 'var(--um-cyan)')}${map ? WIRES.map(w => marker(w[0], `var(--um-w-${w[0]})`)).join('') : ''}${heavy.map(m => { const [c, k] = m.split('-w'); return marker(m, MC[c], 1 + (k - 1) * .35); }).join('')}${ends.map(endMark).join('')}</defs>`;
  const families = geo.families || [], familyDepth = f => f.parent ? 1 + familyDepth(families.find(p => p.id === f.parent) || {}) : 0;
  families.slice().sort((a,b) => familyDepth(a)-familyDepth(b)).forEach(f => { // in c4 every box is a boundary, dashed as Structurizr draws one (a toned box is dashed in any notation)
    s += `<g class="family${f.tone ? ' toned' : ''}" data-family="${esc(f.id)}"${f.parent ? ` data-parent="${esc(f.parent)}"` : ''}${f.tone ? ` style="--um-tone:${toneOf(f)}"` : ''}><rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" stroke="var(--um-${familyDepth(f) ? 'cyan' : 'border-2'})"${notation === 'c4' ? ' stroke-dasharray="7 5"' : ''}/>
      <text class="family-title" x="${f.x+12}" y="${f.y+18}" fill="var(--um-muted)" data-t="ft" data-o="${esc(f.id)}">${esc(f.label || f.id)}</text>${(f.tabs || []).map(t => t.fold ? `
      <g class="fold-hint"><title>Fold back into one card (E, or Alt + click a card in it)</title><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="16" rx="8" class="n-mask" stroke="var(--um-accent)"/><text x="${t.x + t.w / 2}" y="${f.y + 4}" text-anchor="middle" class="badge-tx" fill="var(--um-accent)">⤡</text></g>` : `
      <g class="pub-tab" data-badge="${t.badge}"><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="15" rx="4" fill="${t.fill}"/><text x="${t.x + t.w / 2}" y="${f.y + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`).join('')}</g>`;
  });
  (geo.lanes || []).forEach((l, i) => {
    s += `<g class="lane" data-lane="${i}">${l.bare ? '' : `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" class="lane-box"/>`}
      <circle cx="${l.x + 20}" cy="${l.y + 20}" r="8" class="lane-num"/><text x="${l.x + 20}" y="${l.y + 24}" text-anchor="middle" class="lane-num-tx">${i + 1}</text>
      <text x="${l.x + 34}" y="${l.y + 24}" class="lane-t" data-t="lt" data-o="lane:${i}">${esc(l.title)}</text>
      <text x="${l.x + 34 + sansW(l.title, 11, .95) + 8}" y="${l.y + 24}" class="lane-c">${l.ids.length} ${l.ids.length === 1 ? 'part' : 'parts'}</text></g>`;
    if (!l.bare && i < geo.lanes.length - 1) s += `<text x="${l.x + l.w + (l.gap || 32) / 2}" y="${l.y + 25}" text-anchor="middle" class="lane-arrow">→</text>`;
  });
  groups.forEach(g => {
    s += `<g class="grp"><rect x="${g.x}" y="${g.y}" width="${g.x2 - g.x}" height="${g.y2 - g.y}" rx="12" fill="${fill(g.k)}" fill-opacity=".35" stroke="${col(g.k)}" stroke-opacity=".55" stroke-dasharray="6 4"/>
      <text x="${g.x + 12}" y="${g.y + 16}" class="g-label" fill="${col(g.k)}">${esc(fit(g.label, 10, g.x2 - g.x - 24))}</text></g>`;
  });
  // tour (map): one ticket dot rides the view's loop; each stop pulses and each wire glows as it passes
  const TOUR = 8, f2 = v => +Math.min(1, Math.max(0, v)).toFixed(4), tour = map && opts.tour !== false && (geo.tour || []).length > 1 ? (() => {
    const pts = [], legs = {}, at = {}, ends = [];
    for (let i = 0; i + 1 < geo.tour.length; i++) {
      const a = geo.tour[i], b = geo.tour[i + 1], k = edges.findIndex(e => (e.from === a && e.to === b) || (e.both && e.from === b && e.to === a));
      if (k < 0) return null;
      const p = edges[k].from === a ? drawn[k] : [...drawn[k]].reverse();
      if (pts.length) pts.push([pts[pts.length - 1][0], p[0][1]]); // through the card to the next port
      const from = pts.length; pts.push(...p); ends.push([k, from, pts.length - 1, b]);
    }
    const P = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]), L = [0];
    pts.slice(1).forEach((p, i) => L.push(L[i] + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1])));
    const tot = L[L.length - 1] || 1; at[geo.tour[0]] = 0;
    ends.forEach(([k, a, b, to]) => { legs[k] = [L[a] / tot, L[b] / tot]; if (!(to in at)) at[to] = L[b] / tot; });
    return { d: roundPath(P), legs, at };
  })() : null;
  const tourAnim = (vals, times) => `<animate attributeName="opacity" values="${vals}" keyTimes="${times.map(f2).join(';')}" dur="${TOUR}s" repeatCount="indefinite"/>`;
  s += '<g class="edges">';
  (geo.intake || []).forEach(b => {
    const bp = roundPath(looks.size ? drawnPts({ pts: b.pts, t: geo.byId[b.to], ts: 'L' }, n => looks.get(n) || null) : b.pts); // its end on the card's outline, as a line's
    s += `<g class="intake"><title>${esc(b.label)} feeds ${esc((geo.byId[b.to] || {}).label || b.to)}</title><path d="${bp}" class="edge" stroke="var(--um-w-feeds)" marker-end="url(#${id}-feeds)"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" class="intake-chip${b.dashed ? ' dashed' : ''}"/>${b.logo ? `<image href="${esc(b.logo)}" x="${b.cx - 9}" y="${b.cy - 9}" width="18" height="18"/>` : b.mark ? `<text x="${b.cx}" y="${b.cy + 4.5}" text-anchor="middle" class="intake-mark">${esc(b.mark)}</text>` : ''}
      <text x="${b.cx - b.r - 7}" y="${b.cy + 3.5}" text-anchor="end" class="intake-tx">${esc(b.label)}</text>
      ${tour ? `<circle r="3.2" class="tour tour-packet" opacity="0"><animateMotion path="${bp}" keyPoints="0;0;1" keyTimes="0;.86;1" calcMode="linear" dur="${TOUR}s" repeatCount="indefinite"/>${tourAnim('0;0;.8;.8;0', [0, .86, .88, .99, 1])}</circle>` : ''}</g>`;
  });
  edges.forEach((e, i) => {
    const E = typed(e), st = E && E.dashed ? { ...lstyle(e), dash: '6 4' } : lstyle(e), why = broke(e), d = roundPath(drawn[i]), mk = st.m + (e.weight > 1 ? '-w' + e.weight : '');
    const cut = w => endOf(E, w) ? ENDS[endOf(E, w)][0] : 0, at = w => endOf(E, w) ? `url(#${id}-${endOf(E, w)}-${st.m})` : '';
    const tip = 9 * (e.weight > 1 ? 1 + (e.weight - 1) * .35 : 1), fd = roundPath(E ? trimLine(drawn[i], cut('from'), cut('to')) : trimLine(drawn[i], e.both ? tip : 0, tip)); // an arrowhead's length (marker refX)
    const marks = E ? `${at('to') ? `marker-end="${at('to')}"` : ''} ${at('from') ? `marker-start="${at('from')}"` : ''}` : `marker-end="url(#${id}-${mk})" ${e.both ? `marker-start="url(#${id}-${mk})"` : ''}`;
    if (tour && tour.legs[i]) { const [a, b] = tour.legs[i];
      s += `<path d="${d}" class="tour-glow" stroke="${st.c}" opacity="0">${tourAnim('0;0;.55;.55;0;0', [0, a, Math.min(a + .01, b), b, b + .03, 1])}</path>`; }
    s += `<g class="edge-g${st.cls || ''}${e.weight > 1 ? ' wt-' + e.weight : ''}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-i="${i}"><path d="${d}" class="halo"/><path d="${d}" class="hitline"/>
      <path d="${d}" class="edge${st.flow ? ' flow' : ''}" stroke="${st.c}" ${st.dash && !st.flow ? `stroke-dasharray="${st.dash}"` : ''} ${st.op ? `opacity="${st.op}"` : ''} ${marks}/>
      <path d="${fd}" class="flowline" stroke="${st.c}"/>${(e.all || [e]).some(x => x.edited) && !e.strong ? (() => { let m = [e.pts[0], e.pts[1]];
        e.pts.slice(1).forEach((p, k) => { const a = e.pts[k]; if (Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) > Math.abs(m[1][0] - m[0][0]) + Math.abs(m[1][1] - m[0][1])) m = [a, p]; });
        return `<circle cx="${(m[0][0] + m[1][0]) / 2}" cy="${(m[0][1] + m[1][1]) / 2}" r="4" class="edited-dot"><title>Edited</title></circle>`; })() : ''}${why.length ? ruleMark(e, why) : ''}
      <title>${e.step != null ? 'Step ' + esc(e.step) + ': ' : ''}${esc(e.s.label)} ${e.both ? '⇄' : '→'} ${esc(e.t.label)}${e.label ? ': ' + esc(e.label) : ''}${e.label && e.sublabel ? ' (' + esc(e.sublabel) + ')' : ''}${e.when ? '\n' + esc(e.when) : ''}${why.length ? '\nBreaks rule: ' + esc(why.join('; ')) : ''}</title></g>`;
  });
  // the tour's dot rides over the lines and boxes but under the cards: it goes into a card and comes out at its next
  // line, rather than across the card's name
  s += '</g>' + (tour ? `<g class="tour" aria-hidden="true"><circle r="5.5" class="tour-dot"><animateMotion path="${tour.d}" dur="${TOUR}s" repeatCount="indefinite"/></circle></g>` : '') + '<g class="nodes">';
  nodes.forEach(n => {
    if (!map && n.shape === 'classifier') { s += SHAPE.classifier.draw(n, col(n.k), fill(n.k)); return; } // a typed view's class box (1.5)
    const c = col(n.k), f = fill(n.k), removed = n.change === 'removed', planned = n.change === 'planned';
    const L = looks.get(n) || null, S = L && L.S; // a shaped card (0.15.0); null: a box, drawn as before
    const pub = map && n.k === 'm-public', priv = map && n.k === 'm-script', ext = map && n.k === 'm-ext', verb = map && n.k === 'm-verb', hook = map && n.k === 'm-hook' && String(n.shape ?? '').toLowerCase() !== 'box';
    const dash = removed || ext || planned || (map && notation !== 'box' && n.k === 'external'); // an external card is dashed where a notation draws types (the legend says so in every notation)
    const rx = verb ? n.h / 2 : map ? 10 : 9;
    const kids = kidsOf(n), stacked = !!(kids || n.opens); // opens a view, loaded or not (#47)
    const subject = opts.subject === n.id;
    const verbs = map && (n.verbs || []).length ? n.verbs : null;
    const subTxt = n.noSub ? '' : n.sub || (map && n.origin ? n.origin : '') || (map ? (n.what ? n.what.replace(/[`*]/g, '').split(/(?<=\.)\s/)[0] : KIND[n.k][1]) : '');
    const third = !!(verbs && subTxt && !priv && geo.subAndChips); // the view's subAndChips: the sub-line, then the chips on a third line (a script card shows no sub-line)
    const sw = map ? n.w - 70 : n.w - 24;  // map cards: text runs from 54 px in (after the mark) to 16 px from the right
    // a shape's face: the rows its mark and text use (a box's: the card). A short face takes a two-line sub-line to one, and
    // gives up the sub-line under a two-line name (the tooltip and the details panel keep it)
    const [ft, fb] = L ? S.face(L) : [n.y, n.y + n.h], fh = fb - ft, fy = (ft + fb) / 2;
    const labelPx = n.emphasis ? 15 : 13;
    const lw = map ? n.w - 70 : n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side
    const wraps = map && textW(n.label, labelPx) > lw && (!L || fh >= 30);
    const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > sw && textW(n.label, n.emphasis ? 15 : 13) <= sw && (!L || fh >= 56) ? wrap2(subTxt, 10, sw) : null;
    const sub = subTxt && (!verbs || third) && !(L && wraps && fh < 44) ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, sw)) : '';
    const two = wraps ? wrap2(n.label, labelPx, lw) : null;
    const lpx = two ? labelPx : textW(n.label, labelPx) > lw ? (measureText ? Math.max(11, labelPx * lw / textW(n.label, labelPx)) : Math.max(11, lw / (String(n.label).length * 0.6))) : labelPx;
    const ly = fy + (third ? -14 : sub || verbs ? -3 : 4) - (two ? 8 : 0) - (sub2 ? 6 : 0);
    // A card is a button named by what it shows, in the order it shows it, so its visible text is a run of whole words of its
    // name (WCAG 2.5.3, as axe checks it) at every zoom: what always shows comes first, then the sub-line and chips (faded out
    // when zoomed far out). What is not shown, or not in full, goes in parentheses, which that check leaves out. The card's
    // texts are apart (whitespace between them), so text-based tools read separate words.
    const said = [], plain = t => String(t ?? '').replace(/…/g, '').replace(/\s+/g, ' ').trim();
    const part = (shown, full) => plain(shown) === plain(full) ? plain(full) : `${plain(shown)} (in full: ${plain(full)})`;
    const tx0 = map ? n.x + 54 : n.x + n.w / 2, anchor = map ? 'start' : 'middle', lines = (t, dy) => `<tspan x="${tx0}">${esc(t[0])}</tspan> <tspan x="${tx0}" dy="${dy}">${esc(t[1])}</tspan>`;
    const label = two ? two.join(' ') : fit(n.label, lpx, lw, true), subShown = sub && !priv; // a script card hides its sub-line
    said.push(part(label, n.label) + (subTxt && !subShown ? ` (${subTxt})` : ''));
    const parts = [`<title>${esc(n.label)}${subTxt ? ' · ' + esc(subTxt) : ''}${n.note ? '\n' + esc(n.note) : ''}${stacked ? '\nDouble-click to open' : ''}</title>`];
    if (L) { // a shape: its outline twice behind it when stacked, then the mask, the body and its details
      const o = S.out(L);
      if (stacked) parts.push([8, 4].map(k => `<path d="${o}" transform="translate(${k} ${k})" class="n-stack" stroke="${c}"/>`).join(''));
      if (pub) parts.push(`<path d="${S.out(L, 4)}" class="n-ring" stroke="${c}"/>`);
      parts.push(`<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="${f}" stroke="${c}"${dash ? ' stroke-dasharray="6 4"' : ''}${removed ? ' opacity=".6"' : ''}/>${S.det ? S.det(L, c, n.k) : ''}`); }
    else {
      if (stacked) parts.push(`<rect x="${n.x + 8}" y="${n.y + 8}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/><rect x="${n.x + 4}" y="${n.y + 4}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/>`);
      if (pub) parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="14" class="n-ring" stroke="${c}"/>`);
      if (hook) { const hx = Math.min(16, n.h / 3), pts = `${n.x + hx},${n.y} ${n.x + n.w - hx},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w - hx},${n.y + n.h} ${n.x + hx},${n.y + n.h} ${n.x},${n.y + n.h / 2}`;
        parts.push(`<polygon points="${pts}" class="n-mask"/><polygon points="${pts}" class="n-body" fill="${f}" stroke="${c}" stroke-linejoin="round"/>`); }
      else parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-mask"/>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-body" fill="${f}" stroke="${c}" ${dash ? 'stroke-dasharray="6 4"' : ''} ${removed ? 'opacity=".6"' : ''}/>`); }
    // the mark, centred on the face; in the uml notation a box's own sigil gives way to UML's component icon
    const glyph = L && SIGIL[L.sh] ? L.sh : notation === 'uml' && !L && !String(n.k).startsWith('m-') ? 'component' : n.k; // a person's, robot's, phone's, terminal's, folder's or node's own mark
    parts.push((() => { const I = (opts.icons || {})[n.icon], x = map ? n.x + 14 : n.x + (verb ? 14 : hook ? 17 : 9), y = map ? fy - 14 : n.y + (priv ? 8 : 11), M = map ? 28 : 16;  // map: one 28 px mark, left, centred
return I && I.src ? `<rect x="${x - M * 3 / 28}" y="${y - M * 3 / 28}" width="${M * 34 / 28}" height="${M * 34 / 28}" rx="${M / 4}" class="n-logo${I.dark ? ' dark' : ''}"/><image href="${I.src}" x="${x}" y="${y}" width="${M}" height="${M}"/>`
  : I && I.g ? `<g transform="translate(${x} ${y}) scale(${M / 24})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 24 / M}" stroke-linecap="round" stroke-linejoin="round">${I.g}</g>`
  : `<g transform="translate(${x} ${y}) scale(${M / 16})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 16 / M}" stroke-linecap="round" stroke-linejoin="round">${SIGIL[glyph]}</g>`; })());
    parts.push(`<text x="${tx0}" y="${ly}" text-anchor="${anchor}" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? 'text-decoration="line-through"' : ''}>${two ? lines(two, 15) : esc(label)}</text>`);
    const ty = tabLine(n, L); // the line the tabs, ⤢, the change badge and a step sit on
    if (map) { let tx = n.x + 12; mapTabs(n, c).forEach(t => { const tw = t.w; // each badge is its own tab, clickable on its own
      parts.push(`<g class="pub-tab"${t.badge != null ? ` data-badge="${t.badge}"` : ''}><rect x="${tx}" y="${ty - 8}" width="${tw}" height="15" rx="4" fill="${t.fill}"/><text x="${tx + tw / 2}" y="${ty + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`);
      said.push(t.badge != null ? badgesOf(n)[t.badge].text : t.text.toLowerCase()); tx += tw + 4; }); }
    if (map && n.edited) parts.push(`<g class="edited"><title>Edited</title><circle cx="${n.x + n.w - 10}" cy="${n.y + n.h - 10}" r="4" class="edited-dot"/></g>`);
    // a step on a shape's tab line (a person's shoulder), but never down over the arrow of a line into its left side: as low as
    // keeps 6 px clear of the highest one, and no higher than the box's corner
    if (map && n.step) { const t = String(n.step), sw = Math.max(20, sansW(t, 9.5, .9) + 10), sy = L ? Math.max(n.y, Math.min(ty, L.portL - 16)) : ty;
      parts.push(`<g class="step"><title>Step ${esc(t)}</title><rect x="${n.x - 10}" y="${sy - 10}" width="${sw}" height="20" rx="10" class="stp"/><text x="${n.x - 10 + sw / 2}" y="${sy + 3.5}" text-anchor="middle" class="stp-tx">${esc(t)}</text></g>`);
      said.push(`(step) ${t}`); }
    if (n.tag) { // author name tag under the card: a bigger headshot + @handle (avatar inlined by render)
      const T = n.tag, cxp = T.x + 11, cyp = T.y + 11, cid = 'av-' + id + '-' + String(n.id).replace(/[^\w-]/g, '_');
      const ini = T.img ? '' : String(n.author || '?').split(/[\s_-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      parts.push(`<g class="ntag"><title>${esc(T.name ? 'by ' + T.name + ' (@' + n.author + ')' : n.author ? '@' + n.author : 'author unknown')}</title><rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="${T.h / 2}" class="ntag-bg"/>`
        + (T.img ? `<clipPath id="${cid}"><circle cx="${cxp}" cy="${cyp}" r="13"/></clipPath><image href="${T.img}" x="${cxp - 13}" y="${cyp - 13}" width="26" height="26" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/><circle cx="${cxp}" cy="${cyp}" r="13" class="ntag-ring" stroke="${c}"/>`
          : `<circle cx="${cxp}" cy="${cyp}" r="13" class="n-mask" stroke="${c}" stroke-width="1.4" stroke-dasharray="2 2"/><text x="${cxp}" y="${cyp + 3}" text-anchor="middle" class="ini-tx2" fill="${c}">${esc(ini)}</text> `)
        + `<text x="${T.x + 30}" y="${T.y + 14.5}" class="ntag-tx" data-t="nt" data-o="${esc(n.id)}">${esc(T.text)}</text></g>`);
      said.push(`(by${T.name ? ' ' + T.name : ''}) ${plain([ini, T.text].filter(Boolean).join(' '))}`);
    }
    const hint = stacked && opts.openHint !== false;
    if (hint) { const kx = map ? n.x + n.w - 44 : n.x + n.w - 40, ky = map ? ty - 8 : n.y + n.h - 11;
      parts.push(`<g class="open-hint${map ? '' : ' depth-read'}"><title>Open the inner view (or double-click the card)</title><rect x="${kx}" y="${ky}" width="36" height="16" rx="8" class="n-mask" stroke="${c}"/><text x="${kx + 18}" y="${ky + 12}" text-anchor="middle" class="badge-tx" fill="${c}">⤢${kids ? ' ' + kids : ''}</text></g>`);
      said.push(kids ? `${kids} (cards inside, opens the inner view)` : '(opens the inner view)'); }
    const ch = CHG[String(n.change || '').toLowerCase()];
    if (ch) {
      const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint && map ? 40 : 0); // left of a map card's ⤢ pill, which sits on the same edge
      parts.push(`<rect x="${bx}" y="${ty - 8}" width="${bw}" height="16" rx="8" fill="var(--um-mask)" stroke="var(--um-${ch[0]})"/>
        <text x="${bx + bw / 2}" y="${ty + 3}" text-anchor="middle" class="badge-tx" fill="var(--um-${ch[0]})">${ch[1]}</text>`);
      said.push(ch[1].toLowerCase());
    }
    if (sub) { parts.push(`<text x="${tx0}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="${anchor}" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? lines(sub2, 12) : esc(sub)}</text>`);
      if (subShown) said.push(part(sub, subTxt)); }
    if (verbs) { // verb chips: the node's public surface, at a glance
      let vx = 0; const chips = [], maxW = third ? sw : n.w - 24; // on a third line they keep to the text's column, clear of the mark
      for (let i = 0; i < verbs.length; i++) {
        const wv = textW(verbs[i], 9.5) + 10, rest = verbs.length - i - 1, more = rest ? textW('+' + rest, 9.5) + 10 : 0;
        if (vx + wv + (rest ? more + 4 : 0) > maxW) { chips.push(['+' + (verbs.length - i), textW('+' + (verbs.length - i), 9.5) + 10, true]); break; } // the first too: a verb wider than any card is "+N" (#84)
        chips.push([verbs[i], wv]); vx += wv + 4;
      }
      const total = chips.reduce((a, c2) => a + c2[1], 0) + (chips.length - 1) * 4;
      let px = third ? tx0 : n.x + (n.w - total) / 2; const py = third ? ly + 23 + (two ? 15 : 0) : ly + 7;
      parts.push(`<g class="verbs depth-read">${chips.map(([t, wv], ci) => { const m = `<rect x="${px}" y="${py}" width="${wv}" height="14" rx="7" class="verb-chip" data-chip="${ci}" stroke="${c}"/><text x="${px + wv / 2}" y="${py + 10}" text-anchor="middle" class="verb-tx" data-chip="${ci}" data-o="${esc(n.id)}" data-t="nv" fill="${c}">${esc(t)}</text>`; px += wv + 4; return m; }).join('\n')}</g>`);
      chips.forEach(([t, , more], ci) => said.push(more ? `${t} (more: ${verbs.slice(ci).join(', ')})` : t));
    }
    if (map) {
      const ports = new Map();
      edges.forEach((e, i) => { const point = e.from === n.id ? (L ? drawn[i][0] : e.p1) : e.to === n.id ? (L ? drawn[i][drawn[i].length - 1] : e.p2) : null; if (!point) return; // a shape's ports on its outline
        const key = point.join(','); const port = ports.get(key) || { point, indices: [] }; port.indices.push(i); ports.set(key, port); });
      ports.forEach(({ point, indices }) => { parts.push(`<circle cx="${point[0]}" cy="${point[1]}" r="3.5" class="n-port" data-edges="${indices.join(',')}" stroke="${c}"/>`); });
    }
    const name = said.join(', ') + (n.edited ? ' (edited)' : '') + (stacked && !hint ? ' (opens inner view)' : '');
    s += `<g class="node${pub ? ' pub' : ''}${priv ? ' priv' : ''}${stacked ? ' has-child' : ''}${subject ? ' subject' : ''}${n.emphasis ? ' main-step' : ''}${planned ? ' planned' : ''}${tour && n.id in tour.at ? ' tour-stop' : ''}"${tour && n.id in tour.at ? ` style="animation-delay:${(tour.at[n.id] * TOUR - .32).toFixed(2)}s"` : ''}${L ? ` data-shape="${L.sh}" data-face="${r2(ft)} ${r2(fb)}"` : ''} data-id="${esc(n.id)}" tabindex="${map ? 0 : -1}" role="${map ? 'button' : 'img'}" aria-label="${esc(name)}">
      ${parts.join('\n')}
    </g>`;
  });
  if (map) { // each line's focus target: after the cards, so lines follow them in the Tab order (#43), under the labels; the mouse still hits the line
    s += '</g><g class="keys">';
    edges.forEach((e, i) => { const said = e.label ? `: ${e.label}${e.sublabel ? ` (${e.sublabel})` : ''}` : '';
      const name = `${e.step != null ? `Step ${e.step}: ` : ''}Line ${e.both ? `between ${e.s.label} and ${e.t.label}, both ways` : `from ${e.s.label} to ${e.t.label}`}${said}${broke(e).length ? `, breaks rule ${broke(e).join('; ')}` : ''}`;
      s += `<g class="um-key line-key${e.weight > 1 ? ' wt-' + e.weight : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(name)}"><path d="${roundPath(drawn[i])}" class="key-ring"/></g>`; });
  }
  s += '</g><g class="labels depth-read">';
  edges.forEach((e, i) => {
    if (typed(e)) s += endLabels(e, drawn[i]).map(b => `<text x="${r2(b.x + b.w / 2)}" y="${r2(b.y + 10.5)}" text-anchor="middle" class="end-lab" data-i="${i}" data-end="${b.end}" data-box="${b.x} ${b.y} ${b.w} ${b.h}" fill="var(--um-muted)" style="font:500 10px var(--um-sans)">${esc(b.text)}</text>`).join('');
    if (!e.lbl) return;
    const L = e.lbl;
    if (map) {
      const sw = L.sw || 16, cy = L.y + L.h / 2; // the step mark: a circle, or a pill as wide as a longer number (#82)
      const st = L.step != null ? `${sw > 16 ? `<rect x="${L.x + 3}" y="${cy - 8}" width="${sw}" height="16" rx="8" class="e-step"/>` : `<circle cx="${L.x + 11}" cy="${cy}" r="8" class="e-step"/>`}<text x="${L.x + 3 + sw / 2}" y="${cy + 3.3}" text-anchor="middle" class="e-step-tx" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.step)}</text>` : '';
      const ax = L.step != null ? L.x + 7 + sw : L.x + L.w / 2, an = L.step != null ? '' : 'text-anchor="middle"';
      const tx = L.text ? `<text x="${ax}" y="${L.y + 14}" ${an} class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.text)}</text>` : '';
      const sb = L.sub ? `<text x="${ax}" y="${L.y + 26}" ${an} class="e-sub" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.sub)}</text>` : '';
      s += `<g class="e-lab${L.tag ? ' ctag' : ''}${e.wk ? ' w-' + e.wk : ''}" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${Math.min(L.h / 2, 10)}" class="e-lbg"/>${st}${tx}${sb}</g>`;
    } else
    s += `<g class="e-lab" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="5" class="e-lbg"/><text x="${L.x + L.w / 2}" y="${L.y + 12.5}" text-anchor="middle" class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.text)}</text></g>`;
  });
  return s + '</g></svg>';
}

export { svgOf };
