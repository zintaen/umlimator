import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, portsOn, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import '../typed/edit.js'; // TYPED.edit, which asks edits.member for the activity rows below
import './class.js'; // SHAPE.note, a comment's look
import { flowWrap } from './flow.js'; // SHAPE.initial, final, diamond and bar too
import { ownersOn, readingOrder } from './owners.js';
import { parseTransition, printTransition, transitionText } from './transition.js';

/* ---------- the state machine diagram, uml.state-machine (work package 4.6, notes/stage-4.md §6, §10) ----------
   States (a rounded box, its name, then one compartment of rows: entry, do and exit, then each internal transition), a
   composite state with a shown substate as a box (src/uml/owners.js's look) and closed with UML's decomposition
   indicator, its regions nested boxes with no border when it has two or more (a dashed divider in the gap before each but
   the first, the regions stretched across their state after the layout, on a copy); pseudostates by kind (initial, choice,
   junction, fork, join, shallow and deep history, terminate) and the final state; transitions as lines with an open arrow,
   their label the printed `trigger [guard] / effect` (src/uml/transition.js) cut at 280 px; comments. Laid out by
   layoutTyped from the host's ranking, repair and reroute off (§17). Ships in lib/umlimator-all.js only. */

const ST_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), ST_ARR = x => (Array.isArray(x) ? x : []);
const ST_HAS = x => x != null && String(x).trim() !== '';
const ST_PROPS = x => (ST_OBJ(x && x.props) ? x.props : {});
const ST_OWN = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined);
const stName = x => String(x.label ?? x.id);
const stStereo = x => ST_ARR(ST_PROPS(x).stereotypes).filter(ST_HAS).map(String);
const stPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const ST_VERTEX = ['uml.State', 'uml.Pseudostate', 'uml.FinalState'];
const ST_LINES = ['uml.Transition', 'uml.CommentLink'];
const ST_ACTS = ['entry', 'do', 'exit'];
const ST_KINDS = ['initial', 'choice', 'junction', 'fork', 'join', 'shallowHistory', 'deepHistory', 'terminate'];
const ST_KIND_WORD = { initial: 'Initial pseudostate', choice: 'Choice', junction: 'Junction', fork: 'Fork', join: 'Join', shallowHistory: 'Shallow history', deepHistory: 'Deep history', terminate: 'Terminate' };
const ST_KIND_SHAPE = { initial: 'initial', choice: 'diamond', junction: 'junction', fork: 'bar', join: 'bar', shallowHistory: 'history', deepHistory: 'history', terminate: 'terminate' };
const stKind = x => { const k = ST_PROPS(x).kind; return ST_KINDS.includes(k) ? k : null; };
const stMembers = (x, t) => ST_ARR(x && x.members).filter(m => ST_OBJ(m) && m.type === t);
// a transition's parts as text (§7): the printed form, or the parts joined when they would not read back
const stPartsText = x => { const p = ST_PROPS(x); return printTransition(p) ?? transitionText(p); };

/* ---- the shapes (§4.1): junction, history, terminate, and the state's look and frames ---- */
const ST = { line: 'var(--um-muted)', ink: 'var(--um-text)', bg: 'var(--um-stage-bg)', hit: 12, name: 12, nlh: 16, nmax: 180, st: 11, sth: 14, row: 11, rl: 15, padX: 10, padY: 8, minW: 96, maxW: 320, minH: 36, dec: 12 };
const stNode = (n, shape, said, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || said)}">${inner}</g>`;
// ponytail: flow.js's circle helpers, which it does not export
const stCircle = (n, d = 0) => { const r = n.w / 2 + d, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`; };
const stCircleIn = (n, s, t) => { const r = n.w / 2, u = t - (s === 'L' || s === 'R' ? n.y + n.h / 2 : n.x + n.w / 2); return r * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); };
const stHit = n => `<circle cx="${r2(n.x + n.w / 2)}" cy="${r2(n.y + n.h / 2)}" r="${ST.hit}" class="fl-hit" fill="transparent"/>`;
const stBody = (d, fill, stroke = ST.line) => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${fill}" stroke="${stroke}"/>`;
SHAPE.junction = { size: () => ({ w: 12, h: 12 }), out: stCircle, inset: stCircleIn, draw: n => stNode(n, 'junction', 'Junction', stHit(n) + stBody(stCircle(n), ST.ink, ST.ink)) };
SHAPE.history = { size: () => ({ w: 24, h: 24 }), out: stCircle, inset: stCircleIn,
  draw: n => stNode(n, 'history', n.deep ? 'Deep history' : 'Shallow history', stBody(stCircle(n), ST.bg)
    + `<text x="${r2(n.x + n.w / 2)}" y="${r2(n.y + n.h / 2 + 4)}" text-anchor="middle" class="c-name" fill="${ST.ink}" style="font:600 11px var(--um-sans)">${n.deep ? 'H*' : 'H'}</text>`) };
SHAPE.terminate = { size: () => ({ w: 20, h: 20 }), out: (n, d = 0) => `M${r2(n.x - d)} ${r2(n.y - d)}H${r2(n.x + n.w + d)}V${r2(n.y + n.h + d)}H${r2(n.x - d)}Z`, inset: () => 0,
  draw: n => stNode(n, 'terminate', 'Terminate', stHit(n) + `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="n-mask" style="fill:transparent"/>`
    + `<path d="M${n.x} ${n.y}L${n.x + n.w} ${n.y + n.h}M${n.x + n.w} ${n.y}L${n.x} ${n.y + n.h}" class="n-body" fill="none" stroke="${ST.ink}" stroke-width="2"/>`) };

// a state's texts: stereotypes, its name on up to three lines, then its compartment's rows (n.rows: [text]; n.collapsed holds
// 'activities' to hide it; n.cap: at most that many, then "+k more"), and the decomposition indicator's strip (n.composite)
function stParts(n) {
  const st = ST_ARR(n.stereotypes).filter(ST_HAS).map(t => `«${t}»`), ls = flowWrap(n.label, ST.name, ST.nmax, 3);
  const all = ST_ARR(n.acts), shown = ST_ARR(n.collapsed).includes('activities') ? null : all, cap = Number.isFinite(n.cap) ? Math.max(0, Math.floor(n.cap)) : Infinity;
  const rows = shown ? [...shown.slice(0, cap), ...(shown.length > cap ? [`+${shown.length - cap} more`] : [])] : [];
  const head = 2 * ST.padY + st.length * ST.sth + Math.max(1, ls.length) * ST.nlh, comp = rows.length ? 8 + rows.length * ST.rl : 0, dec = n.composite ? ST.dec : 0;
  const w = Math.ceil(Math.min(ST.maxW, Math.max(ST.minW, ...st.map(t => textW(t, ST.st) + 2 * ST.padX), ...ls.map(l => textW(l, ST.name) + 2 * ST.padX), ...rows.map(r => textW(r, ST.row) + 2 * ST.padX))));
  return { st, ls, rows, head, comp, dec, w, h: Math.max(ST.minH, head + comp + dec) };
}
SHAPE.state = {
  size: n => { const p = stParts(n); return { w: p.w, h: p.h }; },
  out: SHAPE.box.out, inset: SHAPE.box.inset,
  draw(n) {
    const p = stParts(n), { x, y, w, h } = n, cx = x + w / 2, max = w - 2 * ST.padX, text = (tx, ty, t, px, wt, fill, cls, more = '') => `<text x="${r2(tx)}" y="${r2(ty)}"${more} class="${cls}" fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(fit(t, px, max))}</text>`;
    const hh = p.comp || p.dec ? p.head : h; let ty = y + (hh - p.st.length * ST.sth - Math.max(1, p.ls.length) * ST.nlh) / 2; const hd = [];
    p.st.forEach(t => { hd.push(text(cx, ty + 11, t, ST.st, 400, ST.line, 'c-st', ' text-anchor="middle"')); ty += ST.sth; });
    p.ls.forEach(l => { hd.push(text(cx, ty + 12, l, ST.name, 600, ST.ink, 'c-name', ` text-anchor="middle" data-o="${esc(n.id)}"`)); ty += ST.nlh; });
    const out = [stBody(SHAPE.box.out(n), ST.bg), `<g class="c-head" data-band="${r2(y)} ${r2(y + hh)}">${hd.join('')}</g>`];
    if (p.comp) { const top = y + p.head;
      out.push(`<g class="c-comp" data-comp="activities" data-band="${r2(top)} ${r2(top + p.comp)}"><path d="M${x} ${r2(top)}H${x + w}" class="n-det" stroke="${ST.line}"/>`
        + p.rows.map((r, j) => text(x + ST.padX, top + 4 + j * ST.rl + 11, r, ST.row, 400, j >= (n.cap ?? Infinity) ? ST.line : ST.ink, j >= (n.cap ?? Infinity) ? 'c-more' : 'c-row')).join('') + '</g>'); }
    // UML's decomposition indicator: two small rounded rectangles joined, at the bottom right
    if (p.dec) { const by = y + h - 9, bx = x + w - 27;
      out.push(`<g class="st-dec" fill="none" stroke="${ST.line}" stroke-width="1.2"><rect x="${r2(bx)}" y="${r2(by - 2.5)}" width="7" height="5" rx="2"/><rect x="${r2(bx + 12)}" y="${r2(by - 2.5)}" width="7" height="5" rx="2"/><path d="M${r2(bx + 7)} ${r2(by)}H${r2(bx + 12)}"/></g>`); }
    return stNode(n, 'state', `State ${n.label ?? ''}`, out.join(''));
  },
  // open: a rectangle with 10 px corners on the box's border, the name centred in the 24 px header room, a line under it
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="10" stroke="var(--um-muted)"/>`
    + `<text class="family-title" x="${r2(f.x + f.w / 2)}" y="${r2(f.y + 16)}" text-anchor="middle" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 24))}</text>`
    + `<path d="M${f.x} ${r2(f.y + 24)}H${f.x + f.w}" class="st-head" stroke="var(--um-muted)"/>`,
};
// a region: no border (its box is there to select, drop into and outline), its name at its top left in 10 px, and the
// dashed divider before it (f.div: [x1, y1, x2, y2]) when it is not its state's first
SHAPE.region = {
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" stroke="transparent" style="fill-opacity:0"/>`
    + (f.div ? `<path d="M${r2(f.div[0])} ${r2(f.div[1])}L${r2(f.div[2])} ${r2(f.div[3])}" class="st-div" fill="none" stroke="var(--um-muted)" stroke-dasharray="6 4"/>` : '')
    + (ST_HAS(f.label) ? `<text class="family-title" x="${r2(f.x + 8)}" y="${r2(f.y + 14)}" fill="var(--um-muted)" style="font:400 10px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.label, 10, f.w - 16))}</text>` : ''),
};
for (const k of ['junction', 'history', 'terminate', 'state']) { const S = SHAPE[k]; S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }

/* ---- the view read: its owners (§6.1, §8.2), its lines, and every element's words ---- */
const ST_LOOK = { boxTypes: ['uml.State'], qualify: false, members: ['uml.Region'], shape: x => (x.type === 'uml.Region' ? 'region' : 'state'), word: x => (x.type === 'uml.Region' ? 'Region' : 'Composite state') };
// every node by id, every member with its owner
function stIndex(model) {
  const N = new Map(), M = new Map();
  ST_ARR(model && model.nodes).forEach((n, i) => { if (!ST_OBJ(n) || typeof n.id !== 'string' || N.has(n.id)) return; N.set(n.id, { x: n, path: `nodes[${i}]` });
    ST_ARR(n.members).forEach((m, j) => { if (ST_OBJ(m) && typeof m.id === 'string' && !M.has(m.id)) M.set(m.id, { x: m, owner: n, path: `nodes[${i}].members[${j}]` }); }); });
  const kids = new Map(); N.forEach(({ x }) => { if (x.parent != null) kids.set(x.parent, [...(kids.get(x.parent) || []), x]); });
  // a state's substates in the model: those it owns, directly or through its regions
  const subs = id => [...(kids.get(id) || []), ...stMembers((N.get(id) || {}).x, 'uml.Region').flatMap(r => kids.get(r.id) || [])];
  return { N, M, kids, subs };
}
// an element's owner (a region's is its state), and whether id is anc or lies under it
const stUp = (I, id) => { const r = I.M.get(id); return r ? r.owner.id : (I.N.get(id) || { x: {} }).x.parent; };
const stWithin = (I, id, anc) => { for (let p = id, seen = new Set(); p != null && !seen.has(p); p = stUp(I, p)) { if (p === anc) return true; seen.add(p); } return false; };
// the words of an element as its accessible name says them: "Initial pseudostate", "Final state", "Placed"
const stWord = x => (x.type === 'uml.Pseudostate' ? (ST_OWN(ST_KIND_WORD, stKind(x)) || 'Pseudostate') + (ST_HAS(x.label) ? ' ' + x.label : '') : x.type === 'uml.FinalState' ? 'Final state' + (ST_HAS(x.label) ? ' ' + x.label : '') : stName(x));
// a state's activities as its compartment and its name say them
const stActs = x => ST_ACTS.filter(k => ST_HAS(ST_PROPS(x)[k])).map(k => [k, String(ST_PROPS(x)[k])]);
const stRows = x => [...stActs(x).map(([k, t]) => `${k} / ${t}`), ...stMembers(x, 'uml.InternalTransition').map(stPartsText)];
function stPic(model, view) {
  const pic = ownersOn(model, view, ST_LOOK), I = stIndex(model);
  const boxes = pic.boxes.map(b => { const x = pic.at.get(b.id);
    if (x.type === 'uml.Region') { const s = pic.at.get(b.parent), rs = stMembers(s, 'uml.Region'), k = rs.indexOf(x) + 1; // s: none when ownersOn broke a cycle
      return { ...b, aria: `Region ${ST_HAS(x.label) ? x.label : k} of ${s ? stName(s) : String(b.parent ?? '')}, ${stPlural(pic.holds(b.id).length, 'state')}` }; }
    return { ...b, aria: stNodeName(x, pic, I, true) }; });
  return { ...pic, I, boxes };
}
// accessible names (§14): "State Placed, entry reserve the books, …, 1 internal transition"; "Composite state Fulfilling,
// 2 regions"; "Initial pseudostate in Parcel"; "Final state"
function stNodeName(x, pic, I, open) {
  if (x.type === 'uml.Comment') return 'Comment: ' + stName(x);
  const st = stStereo(x), why = st.length ? ` (${st.join(', ')})` : '', up = x.parent != null && pic.at.get(x.parent), within = up && !open && x.type !== 'uml.State' ? ` in ${stName(up)}` : '';
  if (x.type !== 'uml.State') return stWord(x) + why + within;
  const it = stMembers(x, 'uml.InternalTransition').length, rs = stMembers(x, 'uml.Region').length, subs = I.subs(x.id).length;
  const parts = [...stActs(x).map(([k, t]) => `${k} ${t}`), ...(it ? [stPlural(it, 'internal transition')] : [])];
  if (!subs && !rs) return [`State ${stName(x)}${why}`, ...parts].join(', ');
  return [`Composite state ${stName(x)}${why}`, ...parts, rs ? stPlural(rs, 'region') : stPlural(subs, 'state'), ...(open ? [] : ['closed'])].join(', ');
}
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two elements it shows
function stLines(model, view, pic) {
  const E = new Map(); ST_ARR(model && model.edges).forEach(e => { if (ST_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const shown = new Set(pic.ids), list = Array.isArray(view.edges) ? [...new Set(view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)))] : [...E.values()];
  return list.filter(e => ST_OBJ(e) && typeof e.id === 'string' && ST_LINES.includes(e.type) && shown.has(e.from) && shown.has(e.to));
}
const stLineLabel = e => (e.type === 'uml.Transition' ? [...stStereo(e).map(t => `«${t}»`), stPartsText(e)].filter(ST_HAS).join(' ') : stStereo(e).map(t => `«${t}»`).join(' '));
// "Transition from Capturing payment to itself: capture failed [attempts < 3] / count the attempt"
function stLineName(e, pic) {
  const nm = id => stWord(pic.at.get(id)), said = stLineLabel(e), word = e.type === 'uml.CommentLink' ? 'Comment link' : 'Transition';
  return `${word} from ${nm(e.from)} to ${e.from === e.to ? 'itself' : nm(e.to)}${said ? ': ' + said : ''}`;
}
// reading order (§14): readingOrder (a box, then what it holds, depth first), the top initial pseudostates first; then the lines
function stOrder(pic, lines) {
  const ids = readingOrder(pic), first = ids.filter(id => pic.owner(id) == null && stKind(pic.at.get(id)) === 'initial');
  return [...first, ...ids.filter(id => !first.includes(id)), ...lines.map(e => e.id)];
}

/* ---- the legend: each line kind drawn, then each glyph ---- */
const stLegendItem = (svg, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const ST_LEGEND = [
  ['uml.Transition', 'Transition', 'trigger [guard] / effect: from one state to the next', '<g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none"><path d="M2 8H26"/><path d="M17 4L26 8L17 12"/></g>'],
  ['uml.CommentLink', 'Comment link', 'what a comment is about', '<path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4" stroke-dasharray="3 2"/>'],
  ['initial', 'Initial', 'where a region starts', '<circle cx="14" cy="8" r="5" fill="var(--um-text)"/>'],
  ['final', 'Final state', 'where a region ends', '<circle cx="14" cy="8" r="6" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/><circle cx="14" cy="8" r="3.5" fill="var(--um-text)"/>'],
  ['diamond', 'Choice', 'one exit, by the guards', '<path d="M14 2L20 8L14 14L8 8Z" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/>'],
  ['junction', 'Junction', 'transitions joined or split', '<circle cx="14" cy="8" r="3.5" fill="var(--um-text)"/>'],
  ['bar', 'Fork or join', 'into or out of regions at once', '<rect x="12.5" y="1" width="3" height="14" fill="var(--um-text)"/>'],
  ['history', 'History', 'H back to the last substate, H* at any depth', '<circle cx="14" cy="8" r="6.5" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/><text x="14" y="11" text-anchor="middle" fill="var(--um-text)" style="font:600 8px var(--um-sans)">H</text>'],
  ['terminate', 'Terminate', 'the machine stops', '<path d="M9 3L19 13M19 3L9 13" stroke="var(--um-text)" stroke-width="1.6"/>'],
];
const stLegend = (nodes, edges) => { const has = new Set([...edges.map(e => e.type), ...nodes.map(n => n.shape)]); return ST_LEGEND.filter(([k]) => has.has(k)).map(([, name, says, svg]) => stLegendItem(svg, name, says)); };

/* ---- the view laid out (§10.1) ---- */
// after the layout, on a copy (§2.4): each state's regions stretched across it when they are stacked on one axis, and a
// dashed divider in the gap before each but the first; regions that part on both axes (a line between them ranked one
// before the other, region-cross) get a divider across the two only where they part on one
function stRegions(g, pic) {
  const by = new Map((g.families || []).map(f => [f.id, f])), out = new Map();
  pic.boxes.filter(b => pic.at.get(b.id).type === 'uml.State').forEach(b => {
    const S = by.get(b.id), rs = pic.boxes.filter(r => r.parent === b.id && pic.at.get(r.id).type === 'uml.Region').map(r => by.get(r.id)).filter(Boolean);
    if (!S || rs.length < 2) return;
    const parts = (a, c, v) => (v ? c.y >= a.y + a.h : c.x >= a.x + a.w), meets = (a, c, v) => (v ? a.x < c.x + c.w && c.x < a.x + a.w : a.y < c.y + c.h && c.y < a.y + a.h);
    const along = v => { const s = rs.slice().sort((a, c) => (v ? a.y - c.y || a.x - c.x : a.x - c.x || a.y - c.y)); return s.slice(1).every((c, i) => parts(s[i], c, v) && meets(s[i], c, v)) ? s : null; };
    const V = along(true), H = !V && along(false), s = V || H;
    if (s) s.forEach((r, i) => { const p = s[i - 1], mid = p && (V ? (p.y + p.h + r.y) / 2 : (p.x + p.w + r.x) / 2);
      out.set(r.id, { ...r, ...(V ? { x: S.x + 6, w: S.w - 12 } : { y: S.y + 30, h: S.h - 36 }), ...(p ? { div: V ? [S.x, mid, S.x + S.w, mid] : [mid, S.y + 24, mid, S.y + S.h] } : {}) }); });
    else rs.slice().sort((a, c) => a.y - c.y || a.x - c.x).forEach((r, i, l) => { const p = l[i - 1]; if (!p) return;
      const v = parts(p, r, true) && meets(p, r, true), h = parts(p, r, false) && meets(p, r, false); if (!v && !h) return;
      const m = v ? (p.y + p.h + r.y) / 2 : (p.x + p.w + r.x) / 2;
      out.set(r.id, { ...r, div: v ? [Math.min(p.x, r.x), m, Math.max(p.x + p.w, r.x + r.w), m] : [m, Math.min(p.y, r.y), m, Math.max(p.y + p.h, r.y + r.h)] }); });
  });
  return out.size ? (g.families || []).map(f => out.get(f.id) || f) : g.families;
}
function stGeo({ model, view, pos, memo }) {
  const pic = stPic(model, view), I = pic.I, lines = stLines(model, view, pic), down = view.direction === 'down', present = ST_OBJ(view.present) ? view.present : {};
  const P = id => (ST_OWN(pos, id) || [0, 0]), bars = new Set(), busy = new Map();
  lines.forEach(e => { if (e.type !== 'uml.Transition') return; [['out', e.from], ['in', e.to]].forEach(([w, id]) => { const b = busy.get(id) || { in: 0, out: 0 }; b[w]++; busy.set(id, b); }); });
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const x = pic.at.get(id), st = stStereo(x), pr = ST_OBJ(ST_OWN(present, id)) ? present[id] : {};
    let look;
    if (x.type === 'uml.State') look = { shape: 'state', label: stName(x), stereotypes: st, acts: stRows(x), collapsed: ST_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { cap: pr.rows } : {}), composite: I.subs(id).length > 0 || stMembers(x, 'uml.Region').length > 0 };
    else if (x.type === 'uml.Pseudostate') { const k = stKind(x); look = { shape: k ? ST_KIND_SHAPE[k] : 'junction', label: '' };
      if (look.shape === 'bar') { const b = busy.get(id) || { in: 0, out: 0 }; bars.add(id); Object.assign(look, { busy: Math.max(b.in, b.out), down }); }
      if (k === 'deepHistory') look.deep = true; }
    else if (x.type === 'uml.FinalState') look = { shape: 'final', label: '' };
    else if (x.type === 'uml.Comment') look = { shape: 'note', label: stName(x) };
    else look = { shape: 'classifier', label: stName(x), stereotypes: st, compartments: [] };
    const d = { id, type: x.type || 'uml.State', kind: 'file', ...look, aria: stNodeName(x, pic, I, false), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.map(e => { const label = stLineLabel(e), T = e.type === 'uml.Transition';
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: label || undefined, end: T ? { from: 'none', to: 'open' } : { from: 'none', to: 'none', dashed: true }, aria: stLineName(e, pic),
      ...(T ? { cut: 280 } : {}), ...(bars.has(e.from) ? { fromSide: 'right' } : {}), ...(bars.has(e.to) ? { toSide: 'left' } : {}), // a bar's long sides, in the layout's own axes
      ...(ST_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  // the columns are not spread by the widest label as a class view's are (class.js typeGeo): with transitions cut at 280 px
  // that made 10-state-machine.json 6,700 px wide; a label with no room between two boxes is left to its tooltip and name.
  // Gaps of 48 and 40 px: the router's grid is the picture's area, and on 50 states three composites deep they route a fifth
  // faster than 64 and 56 (P1), with fewer crossings and every label drawn in 10-state-machine.json laid out right
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: down ? 'down' : 'right',
    gap: 48, rgap: 40, repair: false, reroute: false }, memo);
  const families = stRegions(g, pic);
  // a slot on each node and box: src/typed/edit.js hands the add hook its `at`, with the ids selected (sel), only where the
  // geometry has slots; the Region entry reads the state selected there. No default gesture of this type reads a slot
  const slots = [...g.nodes, ...(families || [])].map(n => ({ after: n.id, parent: null, x: n.x + n.w / 2, y: n.y + n.h / 2 }));
  return { ...g, families, slots, legend: stLegend(g.nodes, g.edges), order: stOrder(pic, lines) }; // a new object: what layoutTyped returned is never edited (§2.4)
}

/* ---- validators (§10.2). Each problem: { level, rule, path, message, ids } ---- */
const ST_RULES = {
  'transition-ends': 'a transition joins states, pseudostates or final states, never a region, a comment or a line',
  'owner-kinds': 'a substate\'s or pseudostate\'s owner is a state or a region of one; a region is a member of a state',
  'initial-one': 'a region, a state with no regions, or the top has at most one initial pseudostate',
  'initial-out': 'an initial pseudostate has no incoming transition and one outgoing, with no trigger or guard',
  'final-out': 'a final state and a terminate pseudostate have no outgoing transition',
  'final-kind': 'a final state has no regions, no entry, do or exit, and no internal transitions',
  'choice-guards': 'each transition out of a choice has a guard, and at most one is else',
  'fork-join': 'a fork has one incoming transition and two or more outgoing into different regions of one state; a join the reverse; none with a trigger or a guard',
  'history-owner': 'a history pseudostate\'s owner is a state or a region',
  'history-one': 'a region or a state has at most one shallow and one deep history, and a history at most one outgoing transition',
  'composite-entry': 'a transition onto a composite state\'s border finds an initial pseudostate in each of its regions',
  'reserved-trigger': 'no internal transition\'s trigger is entry, do or exit',
  'region-mixed': 'a state does not hold both regions and direct substates',
  'region-cross': 'no transition joins the contents of two regions of one state',
  'internal-trigger': 'an internal transition has a trigger',
  'pseudo-kind': 'a pseudostate\'s kind is one of initial, choice, junction, fork, join, shallowHistory, deepHistory, terminate',
  'label-syntax': 'a transition\'s trigger, guard and effect print as text that reads back as them',
};
function stProblems(model) {
  const out = [], I = stIndex(ST_OBJ(model) ? model : {}), { N, M } = I, say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const el = id => (N.get(id) || M.get(id) || {}).x, q = id => { const x = el(id); return x ? JSON.stringify(x.type === 'uml.State' ? stName(x) : `${stWord(x)} ${id}`.trim()) : JSON.stringify(String(id)); };
  const ty = id => (el(id) || {}).type, vertex = id => N.has(id) && ST_VERTEX.includes(ty(id)), kind = id => (N.has(id) && ty(id) === 'uml.Pseudostate' ? stKind(el(id)) : null);
  // where an element sits, up through regions and states: [[state, region or null], …], nearest first
  const ups = id => { const out2 = [], seen = new Set(); let p = (el(id) || {}).parent;
    while (p != null && !seen.has(p)) { seen.add(p); const r = M.get(p);
      if (r && r.x.type === 'uml.Region') { out2.push([r.owner.id, p]); p = r.owner.parent; } else if (N.has(p)) { out2.push([p, null]); p = N.get(p).x.parent; } else break; }
    return out2; };
  const ts = ST_ARR(model && model.edges).map((e, i) => [e, `edges[${i}]`]).filter(([e]) => ST_OBJ(e) && e.type === 'uml.Transition');
  const ins = new Map(), outs = new Map(), add = (m, id, x) => m.set(id, [...(m.get(id) || []), x]);
  ts.forEach(([e, path]) => { add(outs, e.from, [e, path]); add(ins, e.to, [e, path]);
    const bad = [e.from, e.to].filter(id => !vertex(id));
    if (bad.length) say('error', 'transition-ends', path, [e.id, ...bad], `${e.id} ends on ${bad.map(id => `${q(id)}${el(id) ? `, a ${String(ty(id)).split('.').pop()}` : ', which is no element'}`).join(' and ')}: a transition joins states, pseudostates or final states`);
    if (printTransition(ST_PROPS(e)) == null) say('warning', 'label-syntax', `${path}.props`, [e.id], `${e.id}'s parts do not read back as "${transitionText(ST_PROPS(e))}": edit them in the properties panel`); });
  const has = (e, k) => ST_HAS(ST_PROPS(e)[k]), list = es => es.map(([e]) => e.id).join(', ');
  // nodes: owners, kinds, and the pseudostates' and final states' lines; a member's path by its place (one with no id is in no index)
  const inits = new Map(), hist = new Map();
  N.forEach(({ x, path }, id) => {
    if (ST_VERTEX.includes(x.type) && x.parent != null) { const r = M.get(x.parent), p = N.get(x.parent);
      if (!(r && r.x.type === 'uml.Region' && r.owner.type === 'uml.State') && !(p && p.x.type === 'uml.State')) say('error', 'owner-kinds', `${path}.parent`, [id, x.parent], `${q(id)} is owned by ${q(x.parent)}, which is not a state or a region of one`); }
    stMembers(x, 'uml.Region').forEach(m => { if (x.type !== 'uml.State') say('error', 'owner-kinds', `${path}.members[${x.members.indexOf(m)}]`, [id, m.id], `region ${m.id} is a member of ${q(id)}, which is not a state`); });
    const i = ins.get(id) || [], o = outs.get(id) || [], ids = es => [id, ...es.map(([e]) => e.id)];
    if (x.type === 'uml.FinalState') {
      if (o.length) say('error', 'final-out', path, ids(o), `${q(id)} has ${stPlural(o.length, 'outgoing transition')} (${list(o)}); a final state has none`);
      const bad = [...stMembers(x, 'uml.Region'), ...stMembers(x, 'uml.InternalTransition')], acts = stActs(x).map(([k]) => k);
      if (bad.length || acts.length) say('error', 'final-kind', path, [id, ...bad.map(m => m.id)], `${q(id)} has ${[...(bad.length ? [stPlural(bad.length, 'region or internal transition')] : []), ...acts].join(', ')}; a final state has none`); }
    if (x.type === 'uml.State') { const rs = stMembers(x, 'uml.Region'), direct = I.kids.get(id) || [];
      if (rs.length && direct.length) say('warning', 'region-mixed', path, [id, ...direct.map(d => d.id)], `${q(id)} holds regions and also ${direct.map(d => q(d.id)).join(', ')} directly`);
      stMembers(x, 'uml.InternalTransition').forEach(m => { const t = ST_PROPS(m).trigger, mp = `${path}.members[${x.members.indexOf(m)}]`;
        if (ST_ACTS.includes(String(t ?? '').trim())) say('error', 'reserved-trigger', `${mp}.props.trigger`, [id, m.id], `internal transition ${m.id} of ${q(id)} has the trigger "${String(t).trim()}", which names the state's ${String(t).trim()} activity`);
        else if (!ST_HAS(t)) say('warning', 'internal-trigger', mp, [id, m.id], `internal transition ${m.id} of ${q(id)} has no trigger`);
        if (printTransition(ST_PROPS(m)) == null) say('warning', 'label-syntax', `${mp}.props`, [m.id], `internal transition ${m.id}'s parts do not read back as "${transitionText(ST_PROPS(m))}"`); }); }
    if (x.type !== 'uml.Pseudostate') return;
    const k = stKind(x), where = x.parent ?? null;
    if (!k) say('warning', 'pseudo-kind', `${path}.props.kind`, [id], `${q(id)}'s kind is ${JSON.stringify(ST_PROPS(x).kind ?? null)}, not one of ${ST_KINDS.join(', ')}; drawn as a junction`);
    const guarded = es => es.filter(([e]) => has(e, 'trigger') || has(e, 'guard'));
    if (k === 'initial') { add(inits, where, id);
      if (i.length) say('error', 'initial-out', path, ids(i), `${q(id)} has ${stPlural(i.length, 'incoming transition')} (${list(i)}); it may have none`);
      if (o.length > 1) say('error', 'initial-out', path, ids(o), `${q(id)} has ${o.length} outgoing transitions (${list(o)}); it may have one`);
      if (guarded(o).length) say('error', 'initial-out', path, ids(guarded(o)), `the transition out of ${q(id)} (${list(guarded(o))}) has a trigger or a guard`);
      if (!o.length) say('warning', 'initial-out', path, [id], `${q(id)} has no outgoing transition yet`); }
    if (k === 'terminate' && o.length) say('error', 'final-out', path, ids(o), `${q(id)} has ${stPlural(o.length, 'outgoing transition')} (${list(o)}); a terminate pseudostate has none`);
    if (k === 'choice') { const g = ([e]) => String(ST_PROPS(e).guard ?? '').trim(), bare = o.filter(t => !g(t)), elses = o.filter(t => g(t) === 'else');
      if (bare.length) say('warning', 'choice-guards', path, ids(bare), `${stPlural(bare.length, 'transition')} out of ${q(id)} ${bare.length === 1 ? 'has' : 'have'} no guard (${list(bare)})`);
      if (elses.length > 1) say('warning', 'choice-guards', path, ids(elses), `${q(id)} has ${elses.length} exits guarded else (${list(elses)}); at most one may be`); }
    if (k === 'fork' || k === 'join') { const [one, many, w1, w2] = k === 'fork' ? [i, o, 'incoming', 'outgoing'] : [o, i, 'outgoing', 'incoming'];
      if (one.length > 1) say('error', 'fork-join', path, ids(one), `${q(id)} has ${one.length} ${w1} transitions (${list(one)}); it may have one`);
      if (guarded(many).length) say('error', 'fork-join', path, ids(guarded(many)), `the transitions ${k === 'fork' ? 'out of' : 'into'} ${q(id)} (${list(guarded(many))}) have a trigger or a guard`);
      if (many.length < 2) say('warning', 'fork-join', path, ids(many), `${q(id)} has ${stPlural(many.length, w2 + ' transition')}; it wants two or more`);
      else { // each end in a different region of one orthogonal state, at any depth inside those regions
        const far = many.map(([e]) => (k === 'fork' ? e.to : e.from)), maps = far.map(f => new Map(ups(f).filter(([, r]) => r).map(([s, r]) => [s, r])));
        const ok = [...maps[0].keys()].some(s => maps.every(m => m.has(s)) && new Set(maps.map(m => m.get(s))).size === far.length);
        if (!ok) say('error', 'fork-join', path, [id, ...far], `the ${k === 'fork' ? 'targets' : 'sources'} of ${q(id)} (${far.map(q).join(', ')}) do not lie in different regions of one state`); } }
    if (k === 'shallowHistory' || k === 'deepHistory') { add(hist, JSON.stringify([where, k]), id);
      if (where == null) say('error', 'history-owner', path, [id], `${q(id)} is at the top; a history is owned by a state or a region`);
      if (o.length > 1) say('error', 'history-one', path, ids(o), `${q(id)} has ${o.length} outgoing transitions (${list(o)}); a history has one default at most`); }
  });
  inits.forEach((ids, where) => { if (ids.length > 1) say('error', 'initial-one', N.has(ids[1]) ? N.get(ids[1]).path : 'nodes', [...ids, where], `${where == null ? 'the top' : q(where)} has ${ids.length} initial pseudostates (${ids.join(', ')})`); });
  hist.forEach((ids, k) => { if (ids.length > 1) { const [where, kind] = JSON.parse(k);
    say('error', 'history-one', N.get(ids[1]).path, [...ids, where], `${where == null ? 'the top' : q(where)} has ${ids.length} ${ST_KIND_WORD[kind].toLowerCase()} pseudostates (${ids.join(', ')})`); } });
  ts.forEach(([e, path]) => {
    // onto a composite's border: an initial pseudostate in each region (or in the state, with none)
    const to = N.get(e.to); if (to && to.x.type === 'uml.State' && I.subs(e.to).length) {
      const rs = stMembers(to.x, 'uml.Region'), places = rs.length ? rs.map(r => r.id) : [e.to], none = places.filter(p => !(I.kids.get(p) || []).some(c => kind(c.id) === 'initial'));
      if (none.length) say('warning', 'composite-entry', path, [e.id, e.to, ...(rs.length ? none : [])], `${e.id} ends on ${q(e.to)}'s border, and ${rs.length ? `${none.map(q).join(', ')} ${none.length === 1 ? 'has' : 'have'}` : 'it has'} no initial pseudostate`); }
    // between two regions of one state
    const a = new Map(ups(e.from).filter(([, r]) => r)), b = new Map(ups(e.to).filter(([, r]) => r)), s = [...a.keys()].find(k => b.has(k) && a.get(k) !== b.get(k));
    if (s != null) say('warning', 'region-cross', path, [e.id, a.get(s), b.get(s)], `${e.id} joins ${q(e.from)} in ${q(a.get(s))} and ${q(e.to)} in ${q(b.get(s))}, two regions of ${q(s)}`);
  });
  return out;
}

/* ---- describe(): the view in sentences, starting at the top initial pseudostate, each element in reading order by its
   accessible name, then each transition ---- */
function stDescribe(model, viewId) {
  const v = ST_ARR(model && model.views).find(x => ST_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = stPic(model, v), lines = stLines(model, v, pic), by = new Map(lines.map(e => [e.id, e])), box = new Map(pic.boxes.map(b => [b.id, b]));
  return [`${v.title || v.id}: a state machine diagram of ${stPlural(pic.ids.length, 'element')} and ${stPlural(lines.filter(e => e.type === 'uml.Transition').length, 'transition')}.`,
    ...stOrder(pic, lines).map(id => (by.has(id) ? stLineName(by.get(id), pic) : box.has(id) ? box.get(id).aria : stNodeName(pic.at.get(id), pic, pic.I, false)) + '.')].join('\n');
}

/* ---- editing (§10.3): each hook returns commands, { commands, say }, null for the default, or { error } ---- */
const stFresh = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; };
// add: a pseudostate with its entry's kind; a region into the state selected
function stAdd(model, view, entry, label, at) {
  if (!ST_OBJ(entry)) return null;
  if (entry.type === 'uml.Pseudostate') { const k = ST_KINDS.includes(ST_PROPS(entry).kind) ? entry.props.kind : 'junction';
    return [{ op: 'add', element: { id: stFresh(model, k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())), type: 'uml.Pseudostate', ...(ST_HAS(label) ? { label: String(label) } : {}), props: { kind: k } }, view: view.id }]; }
  if (entry.type !== 'uml.Region') return null;
  const s = ST_ARR(at && at.sel).map(id => ST_ARR(model.nodes).find(n => ST_OBJ(n) && n.id === id)).find(n => n && n.type === 'uml.State');
  if (!s) return { error: 'Select a state to add a region to' };
  return [{ op: 'add', element: { id: stFresh(model, `${s.id}.region`), type: 'uml.Region', ...(ST_HAS(label) ? { label: String(label) } : {}) }, owner: s.id }];
}
// the commands that give an element of `e`'s the parts `text` reads as, one set per part that changed (undefined clears one)
const stSetParts = (x, r) => ['trigger', 'guard', 'effect'].filter(k => (ST_PROPS(x)[k] ?? undefined) !== r[k]).map(k => ({ op: 'set', id: x.id, path: 'props.' + k, value: r[k] }));
// rename: F2 on a transition parses its text (§7.2)
function stRename(model, view, id, text) {
  const e = ST_ARR(model && model.edges).find(x => ST_OBJ(x) && x.id === id); if (!e || e.type !== 'uml.Transition') return null;
  if (printTransition(ST_PROPS(e)) == null) return { error: `${id}'s text does not read back: edit its trigger, guard and effect in the properties panel` };
  // the text F2 opens is the drawn label, its «stereotypes» first: they are not parts
  const pre = stStereo(e).map(t => `«${t}»`).join(' '), t = String(text ?? '').trimStart(), r = parseTransition(pre && t.startsWith(pre) ? t.slice(pre.length) : t);
  return r.error ? r : stSetParts(e, r);
}
// a compartment row typed on a state: `entry / …`, `do / …` and `exit / …` set that activity (a second one replaces the
// first, said); null for any other row, which is an internal transition or a region (member below). member: the row's id
// when it edits one, which then goes; a region's row is never one (null: member.edit names the region)
function stActivityRow(model, stateId, text, member) {
  const s = ST_ARR(model && model.nodes).find(n => ST_OBJ(n) && n.id === stateId), r = parseTransition(text);
  if (!s || s.type !== 'uml.State' || r.error || !ST_ACTS.includes(r.trigger)) return null;
  if (member != null && !stMembers(s, 'uml.InternalTransition').some(m => m.id === member)) return null;
  const k = r.trigger, was = ST_PROPS(s)[k];
  if (r.guard != null) return { error: `${k} / … is the state's ${k} activity: it takes no guard` };
  if (r.effect == null) return { error: `${k} / … is the state's ${k} activity: write it after the /` };
  const commands = [{ op: 'set', id: stateId, path: 'props.' + k, value: r.effect }, ...(member != null ? [{ op: 'delete', id: member }] : [])];
  return ST_HAS(was) && was !== r.effect ? { commands, say: `${k} / ${r.effect} replaces ${k} / ${was}` } : commands;
}
// the member rows (§10.3): an internal transition by its printed text; a region as `region <name>`
const stRegionRow = t => { const m = /^\s*region\b\s*(.*)$/s.exec(String(t ?? '')); return m ? m[1].trim() : null; };
const ST_MEMBER = {
  print: m => (m.type === 'uml.Region' ? `region ${m.label ?? ''}`.trim() : stPartsText(m)),
  // `region x / y` and `region x [y]` are internal transitions
  add(text) { const nm = stRegionRow(text); if (nm != null && !/[/[]/.test(nm)) return { type: 'uml.Region', label: nm || undefined, props: {} };
    const r = parseTransition(text, 'an internal transition is trigger [guard] / effect'); if (r.error) return r;
    if (ST_ACTS.includes(r.trigger)) return { error: `${r.trigger} / … is the state's ${r.trigger} activity: select the state and type it again` };
    return { type: 'uml.InternalTransition', props: Object.fromEntries(['trigger', 'guard', 'effect'].filter(k => r[k] != null).map(k => [k, r[k]])) }; },
  edit(m, text) {
    if (m.type === 'uml.Region') { const nm = stRegionRow(text) ?? String(text ?? '').trim(); return { commands: [{ op: 'set', id: m.id, path: 'label', value: nm || undefined }] }; }
    const r = parseTransition(text, 'an internal transition is trigger [guard] / effect'); if (r.error) return r;
    if (ST_ACTS.includes(r.trigger)) return { error: `${r.trigger} / … is the state's ${r.trigger} activity` };
    return { commands: stSetParts(m, r) }; },
  holds: n => n.type === 'uml.State',
};
/* moveTo: a node dropped into the box of a state with exactly one region goes to that region (§6.1, 3): the box is the
   state's, since a lone region is not drawn. Anything else: null, the default (a pin, or a drop into a box) */
function stMoveTo(model, view, id, at) {
  if (!ST_OBJ(at) || !Array.isArray(at.pt) || !ST_OBJ(at.geo)) return null;
  const [x, y] = at.pt, f = ST_ARR(at.geo.families).filter(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const s = f && ST_ARR(model.nodes).find(n => ST_OBJ(n) && n.id === f.id), rs = s && s.type === 'uml.State' ? stMembers(s, 'uml.Region') : [], n = ST_ARR(model.nodes).find(m => ST_OBJ(m) && m.id === id);
  if (rs.length !== 1 || !n || n.parent === rs[0].id || stWithin(stIndex(model), s.id, id)) return null; // into itself: the default refuses it
  const L = view.layout; return [{ op: 'reparent', id, parent: rs[0].id }, ...(ST_OBJ(L) && Object.hasOwn(L, id) ? [{ op: 'set', view: view.id, path: ['layout', id], value: undefined }] : [])];
}
// the Owner field (its path stops at an owner that is no element): every state and region of the model by its name from the top ("Fulfilling", "Fulfilling / Parcel"),
// but the element itself and what lies under it
function stOwners(model, x) {
  if (!ST_OBJ(x) || x.from != null || !ST_VERTEX.includes(x.type) && x.type !== 'uml.Comment') return null;
  const I = stIndex(model);
  const full = id => { const out = [], seen = new Set(); for (let p = id; (I.N.has(p) || I.M.has(p)) && !seen.has(p); p = stUp(I, p)) { seen.add(p); const e = (I.N.get(p) || I.M.get(p)).x; out.unshift(ST_HAS(e.label) ? e.label : p); } return out.join(' / '); };
  return [...I.N.values()].filter(({ x: n }) => n.type === 'uml.State').flatMap(({ x: n }) => [{ id: n.id, label: full(n.id) }, ...stMembers(n, 'uml.Region').map(r => ({ id: r.id, label: full(r.id) }))])
    .filter(o => !stWithin(I, o.id, x.id));
}
// remove: a region deleted from the model (Shift + Delete on its box, the member list's ✕) says how many elements it held (§10.3)
function stRemove(model, view, ids, fromModel) {
  const I = stIndex(model), rs = fromModel ? ids.filter(id => I.M.has(id) && I.M.get(id).x.type === 'uml.Region') : [];
  if (!rs.length) return null;
  const held = [...I.N.keys()].filter(n => rs.some(r => stWithin(I, n, r))).length, x = I.M.get(rs[0]).x;
  return { commands: ids.map(id => ({ op: 'delete', id })), say: `Deleted ${rs.length === 1 ? 'region ' + (ST_HAS(x.label) ? x.label : x.id) : stPlural(rs.length, 'region')} and the ${stPlural(held, 'element')} ${rs.length === 1 ? 'it' : 'they'} held` };
}

/* the panel's member rows (edits.member, src/typed/edit.js; notes/stage-5.md §12.1): a row `entry / …` typed on a selected
   state is read here first, before the panel commits it (§7.2, §10.3); any other row is the panel's (ST_MEMBER) */
const stMemberRow = (model, view, owner, id, text) => stActivityRow(model, owner, text, id);

/* ---- the type ---- */
const ST_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const ST_PARTS = [['trigger', 'Trigger'], ['guard', 'Guard'], ['effect', 'Effect']].map(([key, label]) => ({ key, label, kind: 'text' }));
const ST_TYPE = registerDiagramType('uml.state-machine', {
  title: 'state machine diagram',
  elements: [{ type: 'uml.State', label: 'State' },
    ...[['initial', 'Initial'], ['finalState', 'Final state'], ['choice', 'Choice'], ['junction', 'Junction'], ['fork', 'Fork'], ['join', 'Join'], ['shallowHistory', 'Shallow history'], ['deepHistory', 'Deep history'], ['terminate', 'Terminate']]
      .map(([kind, label]) => (kind === 'finalState' ? { type: 'uml.FinalState', label, name: false } : { type: 'uml.Pseudostate', label, props: { kind }, name: false })),
    { type: 'uml.Region', label: 'Region', name: false }, { type: 'uml.Comment', label: 'Comment' }],
  lines: [{ type: 'uml.Transition', label: 'Transition' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: {
    'uml.State': [...ST_ACTS.map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1), kind: 'text' })), ST_STEREO],
    'uml.Pseudostate': [{ key: 'kind', label: 'Kind', kind: 'enum', options: ST_KINDS }, ST_STEREO],
    'uml.FinalState': [ST_STEREO], 'uml.Region': [ST_STEREO],
    'uml.Transition': [...ST_PARTS, ST_STEREO], 'uml.InternalTransition': ST_PARTS, 'uml.CommentLink': [],
  },
  layout: stGeo,
  boxes: (model, view) => stPic(model, view).boxes,
  owners: stOwners,
  member: ST_MEMBER,
  validate: stProblems,
  rules: ST_RULES,
  describe: stDescribe,
  // the PDF's tables (§15, decision 18): an element's kind, and a state's rows: entry, do and exit, then its members as the
  // panel prints them (each internal transition's `trigger [guard] / effect`, each region); null: its members as before
  word: (model, id) => { const I = stIndex(model), x = (I.N.get(id) || {}).x; if (!x) return null;
    return x.type === 'uml.Pseudostate' ? ST_OWN(ST_KIND_WORD, stKind(x)) || 'Pseudostate' : x.type === 'uml.FinalState' ? 'Final state'
      : x.type === 'uml.State' ? (I.subs(id).length || stMembers(x, 'uml.Region').length ? 'Composite state' : 'State') : null; },
  rows: (model, view, id) => { const x = (stIndex(model).N.get(id) || {}).x;
    return x && x.type === 'uml.State' ? [...stActs(x).map(([k, t]) => `${k} / ${t}`), ...ST_ARR(x.members).filter(ST_OBJ).map(ST_MEMBER.print)] : null; },
  // member is not enumerable: Object.keys(edits) stays 4.6's four (tests/state.test.mjs), as notes/stage-5.md §12.1 (as built) says
  edits: Object.defineProperty({ add: stAdd, rename: stRename, moveTo: stMoveTo, remove: stRemove }, 'member', { value: stMemberRow }),
});

export { ST_TYPE, ST_RULES, stGeo, stProblems, stDescribe, stAdd, stRename, stMoveTo, stActivityRow, stOwners, stRemove, ST_MEMBER };
