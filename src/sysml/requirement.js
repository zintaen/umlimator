import { registerDiagramType } from '../core/registry.js';
import { fit, textW } from '../core/text.js';
import { SHAPE } from '../draw/shapes.js';
import { labelW, rowsFor, untangle } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import { drawnLines, legendItem } from '../uml/class.js'; // and SHAPE.note, a comment's look
import { holdsLine, ownersOn, placeTabs } from '../uml/owners.js';
import { SYS_FRAME, SYS_HEAD, SYS_TABLE } from './sysml.js';

/* ---------- the requirement diagram, sysml.requirement (work package M3.2, notes/milestone-3.md §6, §13) ----------
   Requirements, test cases, blocks, packages and comments in a SysML frame (§5): a requirement is the classifier with
   «requirement» over its name and one compartment, `requirement`, of its id, its text wrapped at 224 px, its risk and verify
   method; a requirement owned by a shown requirement is joined to it by a derived line with a crosshair at the owner, never
   stored (§6.2); one owned by a package is drawn in the package's box. The six relationships are dashed lines with an open
   arrow at the supplier and their keyword (§6.3). The type ranks itself (layout.rank false): a relationship's supplier and a
   containment's owner first, each box a block of its own in the box holding it. Laid out by layoutTyped, repair and reroute
   off. Top-level names carry RQ_ (one scope in lib/umlimator-all.js). Ships in lib/umlimator-all.js only. */

const RQ_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), RQ_ARR = x => (Array.isArray(x) ? x : []);
const RQ_HAS = x => x != null && String(x).trim() !== '';
const RQ_PROPS = x => (RQ_OBJ(x && x.props) ? x.props : {});
const RQ = 'sysml.Requirement', RQ_TC = 'sysml.TestCase', RQ_PKG = 'uml.Package', RQ_LINK = 'uml.CommentLink';
// the six relationships (§6.3), each with its word, how a supplier and a client name each other, and the legend's words
const RQ_REL = {
  'sysml.DeriveReqt': ['Derive', 'derives', 'derived from', 'derived from the requirement it points to'],
  'sysml.Satisfy': ['Satisfy', 'satisfied by', 'satisfies', 'meets the requirement it points to'],
  'sysml.Verify': ['Verify', 'verified by', 'verifies', 'checks the requirement it points to'],
  'sysml.Refine': ['Refine', 'refined by', 'refines', 'makes the one it points to more precise'],
  'sysml.Trace': ['Trace', 'traced from', 'traced to', 'is related to the one it points to'],
  'sysml.Copy': ['Copy', 'copied by', 'copies', 'a read-only copy of the requirement it points to'] };
const RQ_LINES = [...Object.keys(RQ_REL), RQ_LINK];
const RQ_WORD = { [RQ]: 'Requirement', [RQ_TC]: 'Test case', 'sysml.Block': 'Block', [RQ_PKG]: 'Package', 'uml.Comment': 'Comment' };
const RQ_RISK = ['low', 'medium', 'high'], RQ_METHOD = ['analysis', 'inspection', 'test', 'demonstration'];
const rqName = x => String(x.label ?? x.id);
const rqStereo = x => RQ_ARR(RQ_PROPS(x).stereotypes).filter(RQ_HAS).map(String);
const rqPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
// a containment line's geometry id, <owner>-><child>: no element id holds '->' (model.md rule 5)
const rqCid = (owner, child) => `${owner}->${child}`;

/* ---- the model read ---- */
function rqIndex(model) {
  const at = new Map(), path = new Map(), put = (x, p) => { if (RQ_OBJ(x) && typeof x.id === 'string' && !at.has(x.id)) { at.set(x.id, x); path.set(x.id, p); } };
  RQ_ARR(model && model.nodes).forEach((n, i) => put(n, `nodes[${i}]`));
  RQ_ARR(model && model.edges).forEach((e, i) => put(e, `edges[${i}]`));
  const ty = id => (at.get(id) || {}).type, is = (id, t) => at.has(id) && ty(id) === t;
  const q = id => (at.has(id) ? `${(RQ_WORD[ty(id)] || 'element').toLowerCase()} ${JSON.stringify(rqName(at.get(id)))}` : JSON.stringify(String(id)));
  const rels = RQ_ARR(model && model.edges).filter(e => RQ_OBJ(e) && Object.hasOwn(RQ_REL, e.type) && at.has(e.from) && at.has(e.to));
  return { at, path, ty, is, q, rels };
}
// what an element's relations say of it (§13): its containment, then each relationship, as its rows and describe() read them
function rqSays(I, id) {
  const x = I.at.get(id), out = [], nm = k => rqName(I.at.get(k));
  if (x.type === RQ && I.is(x.parent, RQ)) out.push(`contained in ${nm(x.parent)}`);
  I.at.forEach(y => { if (y.type === RQ && y.parent === id && x.type === RQ && y.from == null) out.push(`contains ${nm(y.id)}`); });
  I.rels.forEach(e => { const [, sup, cli] = RQ_REL[e.type]; if (e.to === id) out.push(`${sup} ${nm(e.from)}`); if (e.from === id) out.push(`${cli} ${nm(e.to)}`); });
  return out;
}

/* ---- the classifier's drawing input (§6.1): the requirement compartment's rows, its text wrapped at 224 px ---- */
const RQ_WRAP = 224, RQ_PX = 11; // the classifier's row font
function rqWrap(t) {
  const out = []; let line = '';
  String(t).split(/\s+/).filter(Boolean).map(w => (textW(w, RQ_PX) > RQ_WRAP ? fit(w, RQ_PX, RQ_WRAP) : w)).forEach(w => { const next = line ? line + ' ' + w : w; // a word wider than 224 px is cut there
    if (line && textW(next, RQ_PX) > RQ_WRAP) { out.push(line); line = w; } else line = next; });
  if (line) out.push(line);
  return out;
}
const rqRows = x => { const p = RQ_PROPS(x);
  return [...(RQ_HAS(p.reqId) ? [`id = "${p.reqId}"`] : []), ...(RQ_HAS(p.text) ? rqWrap(`text = "${p.text}"`) : []), ...(RQ_HAS(p.risk) ? [`risk = ${p.risk}`] : []), ...(RQ_HAS(p.verifyMethod) ? [`verifyMethod = ${p.verifyMethod}`] : [])]
    .map(label => ({ type: 'sysml.row', label })); };
// an element's accessible name (§13): "Requirement Pedal assistance, EB-1.1: The motor shall assist the rider only while the rider is pedalling"
function rqAria(x) {
  if (x.type === 'uml.Comment') { const st = rqStereo(x); return `Comment${st.length ? ` (${st.join(', ')})` : ''}: ${rqName(x)}`; }
  const p = RQ_PROPS(x), st = rqStereo(x);
  return `${RQ_WORD[x.type] || String(x.type || 'Element').split('.').pop()} ${rqName(x)}${st.length ? ` (${st.join(', ')})` : ''}${x.type === RQ ? `${RQ_HAS(p.reqId) ? ', ' + p.reqId : ''}${RQ_HAS(p.text) ? ': ' + p.text : ''}` : ''}`;
}
const rqKind = (I, id) => `${(RQ_WORD[I.ty(id)] || 'element').toLowerCase()} ${rqName(I.at.get(id) || { id })}`;
const rqLabel = e => [Object.hasOwn(RQ_REL, e.type) ? `«${SYS_TABLE[e.type].st}»` : '', ...rqStereo(e).map(t => `«${t}»`), e.label].filter(RQ_HAS).join(' ');
const rqLineName = (I, e) => `${(RQ_REL[e.type] || ['Comment link'])[0]} from ${rqKind(I, e.from)} to ${rqKind(I, e.to)}`;

/* ---- the frame and its boxes (§5.1): every node in the frame; a package that holds something shown a box in it; a package
   subject is the frame, not a box or a card of its own ---- */
function rqBoxes(model, view) {
  const pic = ownersOn(model, view, { qualify: false }), h = SYS_HEAD(model, view), sid = h.el ? h.el.id : null;
  const ids = pic.ids.filter(id => !pic.open.has(id) && id !== sid), frame = SYS_FRAME(model, view, ids.filter(id => pic.owner(id) == null || pic.owner(id) === sid));
  const boxes = pic.boxes.filter(b => b.id !== sid).map(b => ({ ...b, parent: b.parent == null || b.parent === sid ? frame.id : b.parent }));
  return { pic, frame, boxes, ids, sid };
}

/* ---- the ranking (§6.1): in each box (the frame first), its cards and the boxes it holds, each box a block as many columns
   and rows as it needs, are ranked by the links between them (a box by what it holds), then ordered and given rows as the
   layered layout's own (untangle, rowsFor); what no link reaches goes in rows under the rest. links: [first, then] ---- */
function rqRank(frame, boxes, links) {
  const kids = new Map(), cards = new Map([[frame.id, frame.nodeIds], ...boxes.map(b => [b.id, b.nodeIds])]), home = new Map(), up = new Map(boxes.map(b => [b.id, b.parent]));
  boxes.forEach(b => kids.set(b.parent, [...(kids.get(b.parent) || []), b.id]));
  cards.forEach((ids, g) => ids.forEach(id => home.set(id, g)));
  const itemIn = (x, g) => { for (let y = x, k = 0; y != null && k < 64; k++) { const u = home.has(y) ? home.get(y) : up.get(y); if (u === g) return y; y = u; } return null; };
  const place = g => {
    const subs = new Map((kids.get(g) || []).map(b => [b, place(b)])), items = [...(cards.get(g) || []), ...subs.keys()], sz = id => subs.get(id) || { w: 1, h: 1, at: null };
    const ls = links.map(([a, b]) => [itemIn(a, g), itemIn(b, g)]).filter(([a, b]) => a != null && b != null && a !== b);
    const outs = new Map(items.map(id => [id, []])), st = new Map(), back = new Set(), rank = new Map(items.map(id => [id, 0]));
    ls.forEach((l, k) => outs.get(l[0]).push(k));
    const dfs = u => { st.set(u, 1); outs.get(u).forEach(k => { const v = ls[k][1]; if (st.get(v) === 1) back.add(k); else if (!st.has(v)) dfs(v); }); st.set(u, 2); }; // ponytail: recursion as deep as a chain of links, as csRank's
    items.forEach(id => { if (!st.has(id)) dfs(id); });
    const fwd = ls.filter((l, k) => !back.has(k));
    for (let i = 0, more = true; more && i <= items.length; i++) { more = false; fwd.forEach(([a, b]) => { if (rank.get(b) < rank.get(a) + 1) { rank.set(b, rank.get(a) + 1); more = true; } }); }
    const lined = new Set(ls.flat()), cols = []; items.filter(id => lined.has(id)).forEach(id => (cols[rank.get(id)] ||= []).push(id));
    const mains = cols.filter(Boolean), h = id => sz(id).h; untangle(mains, fwd, h); const row = rowsFor(mains, fwd, h), at = new Map();
    let x = 0; mains.forEach(c => { c.forEach(id => at.set(id, [x, row[id]])); x += Math.max(...c.map(id => sz(id).w)); });
    let under = Math.max(0, ...[...at].map(([id, [, r]]) => r + h(id))), cx = 0, band = 0; const W = Math.max(2, x);
    items.filter(id => !lined.has(id)).forEach(id => { const { w, h: hh } = sz(id); if (cx && cx + w > W) { under += band; cx = 0; band = 0; } at.set(id, [cx, under]); cx += w; band = Math.max(band, hh); });
    return { w: Math.max(1, ...[...at].map(([id, [c]]) => c + sz(id).w)), h: Math.max(1, ...[...at].map(([id, [, r]]) => r + h(id))), at, subs };
  };
  const pos = Object.create(null), flat = (P, c0, r0) => P.at.forEach(([c, r], id) => { if (P.subs.has(id)) flat(P.subs.get(id), c0 + c, r0 + r); else pos[id] = [c0 + c, r0 + r]; });
  flat(place(frame.id), 0, 0);
  return pos;
}

/* ---- the view laid out ---- */
const RQ_LOOK = { open: { from: 'none', to: 'open', dashed: true }, link: { from: 'none', to: 'none', dashed: true }, contain: { from: 'none', to: 'crosshair' } };
function rqGeo({ model, view, pos: pins, memo }) {
  const I = rqIndex(model), { pic, frame, boxes, ids, sid } = rqBoxes(model, view), shown = new Set(ids), present = RQ_OBJ(view.present) ? view.present : {};
  // the lines: the view's relationships and comment links whose ends it shows (not the frame's package), then each containment
  const lines = drawnLines(model, view, RQ_LINES).lines.filter(({ from, to }) => shown.has(from) && shown.has(to) && !holdsLine(pic, from, to));
  const owned = ids.filter(id => I.is(id, RQ) && I.is(I.at.get(id).parent, RQ) && shown.has(I.at.get(id).parent));
  const nodes = ids.map(id => { const x = I.at.get(id), pr = RQ_OBJ(present[id]) && Object.hasOwn(present, id) ? present[id] : {}, st = rqStereo(x);
    const kw = { [RQ]: 'requirement', [RQ_TC]: 'testCase', 'sysml.Block': 'block' }[x.type];
    const shape = x.type === 'uml.Comment' ? { shape: 'note', label: [...st.map(t => `«${t}»`), rqName(x)].join(' ') } : x.type === RQ_PKG ? { shape: 'package', stereotypes: st }
      : { shape: 'classifier', stereotypes: [...(kw ? [kw] : []), ...st], compartments: x.type === RQ ? [{ name: 'requirement', members: rqRows(x) }] : [], collapsed: RQ_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}), ariaOwn: rqAria(x) };
    const d = { id, label: rqName(x), type: x.type || 'sysml.Block', kind: 'file', aria: rqAria(x), ...shape };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = [...lines.map(({ e, from, to }) => ({ id: e.id, _id: e.id, type: e.type, from, to, label: rqLabel(e) || undefined, end: RQ_LOOK[e.type === RQ_LINK ? 'link' : 'open'], aria: rqLineName(I, e), ...(RQ_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) })),
    ...owned.map(id => { const o = I.at.get(id).parent; return { id: rqCid(o, id), _id: rqCid(o, id), type: 'containment', from: id, to: o, end: RQ_LOOK.contain, aria: `Containment of ${rqKind(I, id)} in ${rqKind(I, o)}` }; })];
  // ranked: a relationship's supplier, a containment's owner and what a comment is about first; a pin wins, and a card on its cell goes down a row
  const at = rqRank(frame, boxes, [...lines.map(({ e, from, to }) => [to, from]), ...owned.map(id => [I.at.get(id).parent, id])]);
  const pinOf = id => (RQ_OBJ(pins) && Object.hasOwn(pins, id) && Array.isArray(pins[id]) && pins[id].length === 2 && pins[id].every(Number.isFinite) ? pins[id] : null), taken = [];
  [...ids.filter(pinOf), ...ids.filter(id => !pinOf(id))].forEach(id => { let [c, r] = pinOf(id) || at[id]; while (taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1)) r++; at[id] = [c, r]; taken.push([c, r]); });
  nodes.forEach(n => { [n.col, n.row] = at[n.id]; });
  const down = view.direction !== 'right', wide = down ? 0 : Math.max(0, ...edges.filter(e => e.label).map(labelW)); // down by default (§6.1); laid out right, the class type's room for labels
  const g = placeTabs(layoutTyped({ nodes, edges, containers: [frame, ...boxes], direction: down ? 'down' : 'right', gap: 96 + (wide ? Math.ceil(wide) + 40 : 0), rgap: 56, repair: false, reroute: false }, memo));
  // a new object: what layoutTyped returned is not edited (§2.4; a closed package's tab is placed once, as the class type's).
  // The reading order: the cards by their places, top to bottom, then left to right, then the lines. Slots at each card and box, so the palette's add hears what is selected
  const order = [...g.nodes].sort((a, b) => (down ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col)).map(n => n.id);
  return { ...g, legend: rqLegend(g.edges), order: [...order, ...g.edges.map(e => e.id)], slots: [...g.nodes, ...RQ_ARR(g.families)].map(n => ({ after: n.id, parent: null, x: n.x + n.w / 2, y: n.y + n.h / 2 })) };
}
// the legend: each relationship drawn, then containment and the comment link
const rqLegend = edges => [...Object.keys(RQ_REL).filter(t => edges.some(e => e.type === t)).map(t => legendItem('open', true, `${RQ_REL[t][0]} «${SYS_TABLE[t].st}»`, RQ_REL[t][3])),
  ...(edges.some(e => e.type === 'containment') ? [legendItem('crosshair', false, 'Containment', 'the requirement at the crosshair holds the other')] : []),
  ...(edges.some(e => e.type === RQ_LINK) ? [legendItem('none', true, 'Comment link', 'what a comment is about')] : [])];

/* ---- validators (§6.3): SysML's constraints errors, what is usual a warning. Each problem: { level, rule, path, message, ids } ---- */
const RQ_RULES = {
  'requirement-owner': 'a requirement\'s owner is a requirement or a package',
  'requirement-nested': 'what a requirement owns is a requirement',
  'requirement-members': 'a requirement has no members: no attributes, operations or ports',
  'requirement-general': 'no generalization touches a requirement',
  'requirement-association': 'no association has a requirement at an end',
  'requirement-typing': 'no property, port or parameter is typed by a requirement',
  'requirement-id': 'no two requirements share an id',
  'requirement-text': 'a requirement has a text',
  'derive-ends': 'a deriveReqt runs from a requirement to a requirement',
  'derive-cycle': 'no requirement is derived from itself through a chain',
  'copy-ends': 'a copy runs from a requirement to a requirement',
  'copy-text': 'a copy\'s client has its supplier\'s text',
  'satisfy-ends': 'a satisfy runs to a requirement',
  'verify-ends': 'a verify runs to a requirement',
  'satisfy-from': 'a satisfy runs from an element that is not a requirement',
  'verify-from': 'a verify runs from a test case',
  'refine-ends': 'one end of a refine is a requirement',
  'trace-ends': 'one end of a trace is a requirement',
  'risk-value': 'a requirement\'s risk is low, medium or high',
  'verify-method': 'a requirement\'s verify method is analysis, inspection, test or demonstration',
};
// a relationship's ends broken (§6.3's errors): the rule, or null. The connect gesture refuses what this refuses
const rqEnds = (I, t, from, to) => (t === 'sysml.DeriveReqt' && !(I.is(from, RQ) && I.is(to, RQ)) ? 'derive-ends' : t === 'sysml.Copy' && !(I.is(from, RQ) && I.is(to, RQ)) ? 'copy-ends'
  : t === 'sysml.Satisfy' && !I.is(to, RQ) ? 'satisfy-ends' : t === 'sysml.Verify' && !I.is(to, RQ) ? 'verify-ends' : null);
function rqProblems(model) {
  const I = rqIndex(model), out = [], say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: [...new Set(ids.filter(x => x != null))], message: `${rule}: ${msg}` });
  const reqs = [...I.at.values()].filter(x => x.type === RQ && x.from == null), byName = new Map(reqs.map(r => [rqName(r), r.id])), ids = new Map();
  RQ_ARR(model && model.nodes).forEach((x, i) => { if (!RQ_OBJ(x) || I.at.get(x.id) !== x) return; const path = `nodes[${i}]`, p = RQ_PROPS(x);
    if (x.type === RQ && x.parent != null && I.at.has(x.parent) && !I.is(x.parent, RQ) && !I.is(x.parent, RQ_PKG)) say('warning', 'requirement-owner', `${path}.parent`, [x.id, x.parent], `${I.q(x.id)} is owned by ${I.q(x.parent)}, not a requirement or a package`);
    if (x.type !== RQ && x.type !== 'uml.Comment' && I.is(x.parent, RQ)) say('error', 'requirement-nested', `${path}.parent`, [x.id, x.parent], `${I.q(x.id)} is owned by ${I.q(x.parent)}: what a requirement owns is a requirement`);
    RQ_ARR(x.members).forEach((m, j) => { const t = RQ_PROPS(m).valueType, k = typeof t === 'string' ? t.replace(/^~/, '').trim() : null;
      if (k != null && byName.has(k)) say('error', 'requirement-typing', `${path}.members[${j}].props.valueType`, [m.id, byName.get(k)], `${JSON.stringify(rqName(m))} of ${I.q(x.id)} is typed by ${I.q(byName.get(k))}: a requirement types nothing`); });
    if (x.type !== RQ) return;
    if (RQ_ARR(x.members).length) say('error', 'requirement-members', `${path}.members`, [x.id], `${I.q(x.id)} has ${rqPlural(x.members.length, 'member')}: a requirement has none`);
    if (RQ_HAS(p.reqId)) { const k = String(p.reqId).trim(); if (ids.has(k)) say('warning', 'requirement-id', `${path}.props.reqId`, [ids.get(k), x.id], `${I.q(ids.get(k))} and ${I.q(x.id)} share the id ${k}`); else ids.set(k, x.id); }
    if (!RQ_HAS(p.text)) say('warning', 'requirement-text', path, [x.id], `${I.q(x.id)} has no text`);
    if (RQ_HAS(p.risk) && !RQ_RISK.includes(p.risk)) say('warning', 'risk-value', `${path}.props.risk`, [x.id], `${I.q(x.id)}'s risk is ${JSON.stringify(p.risk)}, not low, medium or high`);
    if (RQ_HAS(p.verifyMethod) && !RQ_METHOD.includes(p.verifyMethod)) say('warning', 'verify-method', `${path}.props.verifyMethod`, [x.id], `${I.q(x.id)}'s verify method is ${JSON.stringify(p.verifyMethod)}, not analysis, inspection, test or demonstration`); });
  const derives = new Map();
  RQ_ARR(model && model.edges).forEach(e => { if (!RQ_OBJ(e) || I.at.get(e.id) !== e || !I.at.has(e.from) || !I.at.has(e.to)) return; const path = I.path.get(e.id), ends = [e.id, e.from, e.to], runs = `${e.id} runs from ${I.q(e.from)} to ${I.q(e.to)}`;
    if ((e.type === 'uml.Generalization' || e.type === 'uml.Association') && (I.is(e.from, RQ) || I.is(e.to, RQ))) say('error', e.type === 'uml.Generalization' ? 'requirement-general' : 'requirement-association', path, ends, `${runs}: a requirement takes part in no ${e.type === 'uml.Generalization' ? 'generalization' : 'association'}`);
    if (!Object.hasOwn(RQ_REL, e.type)) return;
    const bad = rqEnds(I, e.type, e.from, e.to);
    if (bad) say('error', bad, path, ends, `${runs}: ${RQ_RULES[bad]}`);
    if (e.type === 'sysml.Copy' && !bad && String(RQ_PROPS(I.at.get(e.from)).text ?? '') !== String(RQ_PROPS(I.at.get(e.to)).text ?? '')) say('error', 'copy-text', path, ends, `${I.q(e.from)} copies ${I.q(e.to)} with another text: a copy's text is its supplier's`);
    if (e.type === 'sysml.Satisfy' && I.is(e.from, RQ)) say('warning', 'satisfy-from', path, ends, `${runs}: what satisfies a requirement is usually a block, not a requirement`);
    if (e.type === 'sysml.Verify' && !I.is(e.from, RQ_TC)) say('warning', 'verify-from', path, ends, `${runs}: what verifies a requirement is usually a test case`);
    if ((e.type === 'sysml.Refine' || e.type === 'sysml.Trace') && !I.is(e.from, RQ) && !I.is(e.to, RQ)) say('warning', e.type === 'sysml.Refine' ? 'refine-ends' : 'trace-ends', path, ends, `${runs}: neither end is a requirement`);
    if (e.type === 'sysml.DeriveReqt' && !bad) derives.set(e.from, [...(derives.get(e.from) || []), [e.to, e.id, path]]); });
  // a derive cycle: said once, at the line that closes it, naming every requirement on it
  const st = new Map(), stack = [];
  const walk = id => { st.set(id, 1); stack.push(id); // ponytail: recursion as deep as a derive chain
    for (const [to, eid, path] of derives.get(id) || []) { if (st.get(to) === 1) { const loop = stack.slice(stack.indexOf(to)); say('warning', 'derive-cycle', path, [...loop, eid], `${[...loop, to].map(I.q).join(' → ')} derives a requirement from itself (${eid})`); } else if (!st.has(to)) walk(to); }
    stack.pop(); st.set(id, 2); };
  [...derives.keys()].forEach(id => { if (!st.has(id)) walk(id); });
  return out;
}

/* ---- describe(): the view in sentences, the frame first, each element in reading order with what its relations say ---- */
function rqDescribe(model, viewId) {
  const v = RQ_ARR(model && model.views).find(x => RQ_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = rqIndex(model), { ids, pic } = rqBoxes(model, v), shown = new Set(ids), h = SYS_HEAD(model, v);
  const lines = drawnLines(model, v, RQ_LINES).lines.filter(({ from, to }) => shown.has(from) && shown.has(to) && !holdsLine(pic, from, to)).length;
  const owned = ids.filter(id => I.is(id, RQ) && I.is(I.at.get(id).parent, RQ) && shown.has(I.at.get(id).parent)).length;
  return [`${v.title || v.id}: a requirement diagram (${h.title}) of ${rqPlural(ids.length, 'element')} and ${rqPlural(lines + owned, 'line')}.`,
    ...ids.map(id => { const s = rqSays(I, id); return rqAria(I.at.get(id)) + (s.length ? '; ' + s.join('; ') : '') + '.'; })].join('\n');
}

/* ---- editing (§6.4) ---- */
const rqNewId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; };
// add: a requirement into the requirement or package selected, else the frame's package, else none; the rest the canvas's
function rqAdd(model, view, entry, label, at) {
  if (entry.type !== RQ) return null;
  const I = rqIndex(model), into = RQ_ARR(at && at.sel).find(id => I.is(id, RQ) || I.is(id, RQ_PKG)) ?? (SYS_HEAD(model, view).el || {}).id;
  return { commands: [{ op: 'add', element: { id: rqNewId(model, 'requirement'), type: RQ, ...(label ? { label } : {}), ...(into != null ? { parent: into } : {}) }, view: view.id }],
    say: `Requirement added${into != null ? ` in ${rqName(I.at.get(into))}` : ''} with no id: F2 with "EB-2 ${label || 'Name'}" sets its id and name` };
}
// connect: Containment re-owns the first in the second; a relationship whose ends break §6.3's errors is refused in the rule's
// words; a copy takes its supplier's text in the same transaction; anything else the canvas's
function rqConnect(model, view, from, to, at, line) {
  const I = rqIndex(model), t = RQ_OBJ(line) ? line.type : null;
  if (t === 'containment') { if (!I.is(from, RQ) || !(I.is(to, RQ) || I.is(to, RQ_PKG))) return { error: 'Containment runs from a requirement to the requirement or package that holds it' };
    for (let p = to, k = 0; p != null && k < 1e4; p = (I.at.get(p) || {}).parent, k++) if (p === from) return { error: `${rqName(I.at.get(to))} is inside ${rqName(I.at.get(from))}: it cannot hold it` };
    return [{ op: 'reparent', id: from, parent: to }]; }
  if (!Object.hasOwn(RQ_REL, t)) return null;
  const bad = rqEnds(I, t, from, to); if (bad) return { error: `${bad}: ${RQ_RULES[bad]}` };
  return [{ op: 'add', element: { id: rqNewId(model, t.split('.').pop().toLowerCase()), type: t, from, to }, view: view.id },
    ...(t === 'sysml.Copy' ? [{ op: 'set', id: from, path: 'props.text', value: RQ_PROPS(I.at.get(to)).text }] : [])];
}
// F2: on a requirement, "EB-1.2 Range" sets its id and name together (a first word holding a digit and no space); on a frame
// that is no element, the view's title (§5.1); anything else the canvas's
function rqRename(model, view, id, text) {
  if (id === `${view.id}->frame`) return [{ op: 'set', view: view.id, path: 'title', value: String(text) }];
  const m = /^(\S*\d\S*)\s+(\S[\s\S]*)$/.exec(String(text).trim());
  return rqIndex(model).is(id, RQ) && m ? [{ op: 'set', id, path: 'label', value: m[2].trim() }, { op: 'set', id, path: 'props.reqId', value: m[1] }] : null;
}
// Delete or Shift + Delete on a containment line (§6.2): the child goes to its owner's own owner, so one in a package stays in
// it. Shift + Delete on a requirement or a package (§6.4): what it holds goes to its nearest owner left, then it is deleted (the
// core's delete would take it along). Anything else, and Delete on a card, the canvas's
function rqRemove(model, view, ids, fromModel) {
  const I = rqIndex(model), cut = [], rest = [];
  ids.forEach(id => { const k = String(id).indexOf('->'), o = String(id).slice(0, k), c = String(id).slice(k + 2);
    if (k > 0 && I.is(c, RQ) && I.at.get(c).parent === o) cut.push([c, o]); else rest.push(id); });
  if (!ids.length || (rest.length && !fromModel) || (!cut.length && !rest.some(id => I.is(id, RQ) || I.is(id, RQ_PKG)))) return null;
  const gone = new Set(rest), left = id => { let p = id; for (let k = 0; p != null && gone.has(p) && k < 1e4; k++) p = (I.at.get(p) || {}).parent; return p ?? null; };
  const kept = [...I.at.values()].filter(x => x.from == null && !gone.has(x.id) && gone.has(x.parent) && (I.is(x.parent, RQ) || I.is(x.parent, RQ_PKG)));
  return { commands: [...cut.map(([c, o]) => ({ op: 'reparent', id: c, parent: I.at.get(o).parent ?? null })), ...kept.map(x => ({ op: 'reparent', id: x.id, parent: left(x.parent) })), ...rest.map(id => ({ op: 'delete', id }))],
    say: [...cut.map(([c, o]) => `${rqName(I.at.get(c))} is no longer contained in ${rqName(I.at.get(o))}`), ...(kept.length ? [`${rqPlural(kept.length, 'element')} kept, moved to the owner`] : [])].join('; ') || null };
}

const RQ_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const RQ_TYPE = registerDiagramType('sysml.requirement', {
  title: 'requirement diagram',
  elements: [[RQ, 'Requirement'], [RQ_TC, 'Test case'], ['sysml.Block', 'Block'], [RQ_PKG, 'Package'], ['uml.Comment', 'Comment']].map(([type, label]) => ({ type, label })),
  // Containment is no model element: the connect gesture re-owns (its type names no element type)
  lines: [{ type: 'containment', label: 'Containment' }, ...Object.entries(RQ_REL).map(([type, [label]]) => ({ type, label })), { type: RQ_LINK, label: 'Comment link' }],
  props: { [RQ]: [{ key: 'reqId', label: 'Id', kind: 'text' }, { key: 'text', label: 'Text', kind: 'text' }, { key: 'risk', label: 'Risk', kind: 'enum', options: RQ_RISK },
    { key: 'verifyMethod', label: 'Verify method', kind: 'enum', options: RQ_METHOD }, RQ_STEREO],
  [RQ_TC]: [RQ_STEREO], 'sysml.Block': [RQ_STEREO], [RQ_PKG]: [RQ_STEREO], 'uml.Comment': [RQ_STEREO], ...Object.fromEntries(Object.keys(RQ_REL).map(t => [t, [RQ_STEREO]])), [RQ_LINK]: [] },
  layout: Object.assign(rqGeo, { rank: false }), // rqGeo ranks the view itself, containment among its links: the host passes only the pins
  boxes: (model, view) => { const B = rqBoxes(model, view); return [B.frame, ...B.boxes]; },
  validate: rqProblems,
  rules: RQ_RULES,
  describe: rqDescribe,
  edits: { add: rqAdd, connect: rqConnect, rename: rqRename, remove: rqRemove },
  // the PDF's tables (§13): an element's kind; a requirement's id, text whole, risk, verify method and relations; a test case's and a block's relations; a line's keyword
  word: (model, id) => { const x = rqIndex(model).at.get(id); return x && x.from == null && Object.hasOwn(RQ_WORD, x.type) && x.type !== 'uml.Comment' ? RQ_WORD[x.type] : null; },
  rows: (model, view, id) => { const I = rqIndex(model), x = I.at.get(id); if (!x || ![RQ, RQ_TC, 'sysml.Block'].includes(x.type)) return null; const p = RQ_PROPS(x);
    return [...[['id', p.reqId], ['text', p.text], ['risk', p.risk], ['verify method', p.verifyMethod]].filter(([, v]) => RQ_HAS(v)).map(([k, v]) => `${k}: ${v}`), ...rqSays(I, id)]; },
  text: (model, view, id) => { const e = rqIndex(model).at.get(id); return e && Object.hasOwn(RQ_REL, e.type) ? rqLabel(e) : null; },
});

export { RQ_TYPE, RQ_RULES, rqGeo, rqProblems, rqDescribe, rqAdd, rqConnect, rqRename, rqRemove, rqWrap, rqRank };
