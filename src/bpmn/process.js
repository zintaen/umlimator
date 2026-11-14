import { apply } from '../core/apply.js';
import { registerDiagramType } from '../core/registry.js';
import { esc } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { laneBands, laneOrder } from '../layout/lanes.js';
import { layoutTyped } from '../typed/layout.js';
import { cpPlace } from '../uml/component.js';
import { bpmnGroupFrame, bpmnLabelSvg, bpmnLabels, bpmnName } from './notation.js';

/* ---------- the BPMN diagram, bpmn (work package 4b.3, notes/milestone-4b.md §3 to §8, §11) ----------
   model.md row 24 with the note's §3.1: pools (bpmn.Participant) and their lanes (bpmn.Lane members, nested by parent),
   activities, events, gateways, data, annotations and groups; sequence flows, message flows, associations and data
   associations. Drawn with src/bpmn/notation.js's shapes. Laid out by layoutTyped from the type's own ranking: cpPlace
   (src/uml/component.js) over the sequence flows, a boundary event's from its activity, and the message flows that close
   no cycle, an expanded sub-process a block (a box); then a lane pass of the type's own (§8.1) gives each lane its run of
   rows, a block and a pin kept whole, data in the lane of the first flow node it is associated with (decision 23), pools
   apart by an empty row: runs for laneBands (src/layout/lanes.js). A message flow to a pool goes to an invisible 2 px
   anchor in the empty row beside it (§7.2), its end slid onto the pool's border on the copy. A boundary event leaves the
   layout: its lines are its activity's, with fromPort (toPort), its side and portMin 32, the activity grown 16 px on each
   side that holds one (§6.2); on the copy the activity is drawn at its own size and the event a 32 px circle centred on its
   border, a node with its activity as owner. Pools, lanes and groups are left out of the layout and added back on the
   copy, as are the labels of events, gateways and data, outside their shapes (bpmnLabels). Nothing layoutTyped returned
   is changed (stage 4 §2.4). Laid out with repair: false and reroute: false (S16). Ships in lib/umlimator-all.js only. */

const BZ_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), BZ_ARR = x => (Array.isArray(x) ? x : []);
const BZ_HAS = x => x != null && String(x).trim() !== '', BZ_OWN = (o, k) => (BZ_OBJ(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const BZ = { gap: 48, rgap: 64, cut: 200, ring: 16, grow: 24 };
const BZ_POOL = 'bpmn.Participant', BZ_LANE = 'bpmn.Lane', BZ_SUB = 'bpmn.SubProcess', BZ_BE = 'bpmn.BoundaryEvent', BZ_GROUP = 'bpmn.Group', BZ_NOTE = 'bpmn.TextAnnotation';
const BZ_SEQ = 'bpmn.SequenceFlow', BZ_MSG = 'bpmn.MessageFlow', BZ_ASSOC = 'bpmn.Association', BZ_DATA_ASSOC = 'bpmn.DataAssociation', BZ_LINES = [BZ_SEQ, BZ_MSG, BZ_ASSOC, BZ_DATA_ASSOC];
const BZ_ACT = ['bpmn.Task', BZ_SUB, 'bpmn.CallActivity'], BZ_GATE = ['bpmn.ExclusiveGateway', 'bpmn.ParallelGateway'], BZ_DATA = ['bpmn.DataObject', 'bpmn.DataStoreReference'];
const BZ_DEFS = { 'bpmn.StartEvent': ['none', 'message', 'timer'], 'bpmn.EndEvent': ['none', 'message', 'terminate'], 'bpmn.IntermediateCatchEvent': ['message', 'timer'],
  'bpmn.IntermediateThrowEvent': ['none', 'message'], [BZ_BE]: ['message', 'timer'] }; // §3.2, decision 21: a none throw event
const BZ_EVENTS = Object.keys(BZ_DEFS), BZ_FLOW = [...BZ_ACT, ...BZ_EVENTS, ...BZ_GATE], BZ_CATCH = ['bpmn.StartEvent', 'bpmn.IntermediateCatchEvent', BZ_BE];
const BZ_SHAPE = t => (BZ_EVENTS.includes(t) ? 'bpmn-event' : BZ_GATE.includes(t) ? 'bpmn-gateway' : t === 'bpmn.DataObject' ? 'bpmn-data' : t === 'bpmn.DataStoreReference' ? 'bpmn-store' : t === BZ_NOTE ? 'bpmn-note' : 'bpmn-task');
const BZ_OUT = ['bpmn-event', 'bpmn-gateway', 'bpmn-data', 'bpmn-store']; // their names drawn outside (§9.2)
const BZ_PIN = { left: 'L', right: 'R', top: 'T', bottom: 'B' }, BZ_NAME = { L: 'left', R: 'right', T: 'top', B: 'bottom' }, BZ_TURN = { L: 'T', T: 'L', R: 'B', B: 'R' };
const BZ_V = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
const bzProps = x => (BZ_OBJ(x && x.props) ? x.props : {});
const bzLabel = x => String((x && x.label) ?? (x && x.id) ?? '');
const bzPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const bzDef = x => (BZ_HAS(bzProps(x).definition) ? String(bzProps(x).definition) : 'none');
const bzRefs = x => BZ_ARR(bzProps(x).categoryValueRef).filter(BZ_HAS).map(String);
// a node's drawing input (notation.js §9.4): its type, name and the props its look reads
const bzLook = (x, open) => { const p = bzProps(x); return { type: x.type, label: x.label ?? '', shape: open ? 'bpmn-frame' : BZ_SHAPE(x.type),
  ...(BZ_HAS(p.taskType) ? { taskType: p.taskType } : {}), ...(BZ_EVENTS.includes(x.type) ? { definition: bzDef(x) } : {}), ...(x.type === BZ_BE ? { cancelActivity: p.cancelActivity !== false } : {}) }; };
const bzWord = x => bpmnName({ ...bzLook(x), label: '' }).trim();
const bzA = (w, cap) => `${/^[aeiou]/i.test(w) ? (cap ? 'An' : 'an') : cap ? 'A' : 'a'} ${w}`; // "a start event", "an end event"

/* ---- the model read: nodes, lanes (members of a pool), lines; each element's owner up to its pool ---- */
function bzIndex(model) {
  const N = new Map(), L = new Map(), E = new Map(), path = new Map();
  BZ_ARR(model && model.nodes).forEach((n, i) => { if (!BZ_OBJ(n) || typeof n.id !== 'string' || N.has(n.id)) return; N.set(n.id, n); path.set(n.id, `nodes[${i}]`);
    if (n.type === BZ_POOL) BZ_ARR(n.members).forEach((m, j) => { if (BZ_OBJ(m) && m.type === BZ_LANE && typeof m.id === 'string' && !L.has(m.id) && !N.has(m.id)) { L.set(m.id, { x: m, pool: n.id }); path.set(m.id, `nodes[${i}].members[${j}]`); } }); });
  BZ_ARR(model && model.edges).forEach((e, i) => { if (BZ_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) { E.set(e.id, e); path.set(e.id, `edges[${i}]`); } });
  const el = id => N.get(id) || (L.get(id) || {}).x, ty = id => (el(id) || {}).type;
  // a lane's owner: its parent lane of the same pool, else its pool; a node's: its parent
  const up = id => { if (L.has(id)) { const { x, pool } = L.get(id); return L.has(x.parent) && L.get(x.parent).pool === pool && x.parent !== id ? x.parent : pool; } return (N.get(id) || {}).parent; };
  const chain = id => { const out = [], seen = new Set([id]); for (let p = up(id); p != null && el(p) && !seen.has(p); p = up(p)) { seen.add(p); out.push(p); } return out; };
  const poolOf = id => (L.has(id) ? L.get(id).pool : ty(id) === BZ_POOL ? id : chain(id).find(p => ty(p) === BZ_POOL) ?? null);
  const laneIn = id => chain(id).find(p => L.has(p)) ?? null;
  // a flow node's process level (sequence-scope): its nearest sub-process, else its pool, else none
  const level = id => chain(id).find(p => ty(p) === BZ_SUB || ty(p) === BZ_POOL) ?? null;
  // an owner whose parents lead back to it (validate's "ends up inside itself"): never drawn open, so nothing nests in a loop
  const looped = id => up(chain(id).at(-1) ?? id) === id;
  const called = id => { const x = el(id); return x ? (BZ_HAS(x.label) ? String(x.label) : bzWord(x).toLowerCase()) : String(id); };
  return { N, L, E, path, el, ty, up, chain, poolOf, laneIn, level, looped, called, lanesOf: p => [...L].filter(([, v]) => v.pool === p).map(([id]) => id) };
}

/* ---- the view read: its pools and lanes (the bands), boundary events and their activities, expanded sub-processes (boxes),
   the items laid out, the lines and their ends, each item's lane ---- */
function bzPic(model, view) {
  const I = bzIndex(model), ids = [...new Set(BZ_ARR(view && view.nodeIds).filter(id => I.N.has(id)))], shown = new Set(ids);
  const pools = ids.filter(id => I.ty(id) === BZ_POOL), groups = ids.filter(id => I.ty(id) === BZ_GROUP);
  const lanes = pools.flatMap((p, k) => [{ id: p, order: k }, ...I.lanesOf(p).map((id, j) => ({ id, parent: I.up(id), order: j }))]), band = new Set(lanes.map(l => l.id));
  const be = new Map(); ids.forEach(id => { const h = bzProps(I.N.get(id)).attachedTo; if (I.ty(id) === BZ_BE && shown.has(h) && BZ_ACT.includes(I.ty(h))) be.set(id, h); });
  // each owner looked at once: one already walked had its own owners walked with it
  const open = new Set(), went = new Set(); ids.forEach(id => { if (I.ty(id) !== BZ_POOL && I.ty(id) !== BZ_GROUP && !be.has(id)) for (const p of I.chain(id)) { if (went.has(p)) break; went.add(p); if (shown.has(p) && I.ty(p) === BZ_SUB && !I.looped(p)) open.add(p); } });
  // the expanded sub-process it is drawn in: the first open one up its chain, kept for each id walked (an open one is in no loop)
  const own = new Map(), owner = id => { if (own.has(id)) return own.get(id); const path = [id]; let p = I.up(id), o = null;
    for (const seen = new Set(path); p != null && I.el(p) && !seen.has(p); p = I.up(p)) { if (open.has(p) || own.has(p)) { o = open.has(p) ? p : own.get(p); break; } seen.add(p); path.push(p); }
    path.forEach(x => own.set(x, o)); return o; };
  const items = ids.filter(id => I.ty(id) !== BZ_POOL && I.ty(id) !== BZ_GROUP && !be.has(id) && !open.has(id)), laid = new Set([...items, ...open]);
  const list = Array.isArray(view && view.edges) ? view.edges.map(x => (typeof x === 'string' ? I.E.get(x) : x)) : [...I.E.values()].filter(e => BZ_LINES.includes(e.type));
  const both = id => shown.has(id) || (I.L.has(id) && shown.has(I.L.get(id).pool)), said = list.filter(e => BZ_OBJ(e) && BZ_LINES.includes(e.type) && both(e.from) && both(e.to));
  const end = (id, msg) => (laid.has(id) ? { at: id } : be.has(id) ? { at: be.get(id), port: id } : msg && pools.includes(id) ? { pool: id } : null);
  // ponytail: a line between two pools, or from a boundary event to its own activity, is not drawn (a rework loop); drawing
  // either needs a route of the type's own
  const lines = list.filter(e => BZ_OBJ(e) && typeof e.id === 'string').map(e => ({ e, f: end(e.from, e.type === BZ_MSG), t: end(e.to, e.type === BZ_MSG) }))
    .filter(l => l.f && l.t && !(l.f.pool && l.t.pool) && !(l.f.at != null && l.f.at === l.t.at && (l.f.port || l.t.port)));
  const bandOf = id => { const l = I.laneIn(id); if (l != null && band.has(l)) return l; const p = I.poolOf(id); return p != null && band.has(p) ? p : null; };
  // decision 23: data and annotations in the lane of the first flow node they are associated with, else their pool's own run
  const dataLane = new Map();
  items.forEach(id => { if (!BZ_DATA.includes(I.ty(id)) && I.ty(id) !== BZ_NOTE) return; const p = I.poolOf(id);
    const by = lines.filter(l => l.e.type === BZ_ASSOC || l.e.type === BZ_DATA_ASSOC).map(l => (l.f.at === id && !l.f.port ? l.t : l.t.at === id && !l.t.port ? l.f : null))
      .map(o => o && o.at).find(o => o != null && BZ_FLOW.includes(I.ty(o)) && bandOf(o) != null && ((p == null && I.ty(id) === BZ_NOTE) || I.poolOf(o) === p));
    dataLane.set(id, by != null ? { lane: bandOf(by), by } : { lane: p != null && band.has(p) ? p : null }); });
  const lo = new Map(), laneOf = id => (lo.has(id) ? lo.get(id) : lo.set(id, dataLane.has(id) ? dataLane.get(id).lane : bandOf(id)).get(id));
  const inLane = new Map(); [...items, ...open].forEach(i => I.chain(i).forEach(p => { if (I.L.has(p)) inLane.set(p, (inLane.get(p) || 0) + 1); })); // each lane's element count
  const held = new Map(); [...items, ...open].forEach(x => { const o = owner(x); held.has(o) ? held.get(o).push(x) : held.set(o, [x]); });
  const holds = o => held.get(o) || [];
  const boxes = ids.filter(id => open.has(id)).map(id => { const x = I.N.get(id), o = owner(id);
    return { id, label: bzLabel(x), title: bzLabel(x), nodeIds: holds(id).filter(k => !open.has(k)), ...(o != null ? { parent: o } : {}), shape: 'bpmn-frame', aria: bpmnName(bzLook(x, true)) }; });
  return { I, ids, shown, pools, groups, lanes, band, be, open, owner, items, lines, said, laneOf, dataLane, holds, boxes, inLane };
}

// accessible names (§9.4): "Service task Take payment, in Sales"; "Timer boundary event No answer, on Take payment"; "Pool
// Bookshop, 2 lanes, 16 elements"; "Lane Sales of Bookshop, 11 elements"; "Group Dispatch, round 3 elements"
function bzNodeName(P, id) {
  const { I } = P, x = I.el(id); if (!x) return String(id);
  const inPool = p => P.items.concat([...P.open]).filter(i => I.poolOf(i) === p).length;
  if (x.type === BZ_POOL) { const ls = I.lanesOf(id).length, k = inPool(id);
    return `Pool ${bzLabel(x)}${ls ? ', ' + bzPlural(ls, 'lane') : ''}${!ls && !k ? ', a black box' : ', ' + bzPlural(k, 'element')}`; }
  if (I.L.has(id)) return `Lane ${bzLabel(x)} of ${bzLabel(I.el(I.L.get(id).pool))}, ${bzPlural(P.inLane.get(id) || 0, 'element')}`;
  if (x.type === BZ_GROUP) return `Group ${bzLabel(x)}, round ${bzPlural(P.ids.filter(i => bzRefs(I.el(i)).includes(id)).length, 'element')}`;
  const name = bpmnName(bzLook(x, P.open.has(id))), lane = P.laneOf(id);
  if (P.be.has(id)) return `${name}, on ${I.called(P.be.get(id))}`;
  return name + (lane != null ? `, in ${bzLabel(I.el(lane))}` : '');
}
const BZ_LINE_WORD = { [BZ_SEQ]: 'Sequence flow', [BZ_MSG]: 'Message flow', [BZ_ASSOC]: 'Association', [BZ_DATA_ASSOC]: 'Data association' };
const bzLineName = (I, e) => `${BZ_LINE_WORD[e.type] || 'Line'} from ${I.called(e.from)} to ${I.called(e.to)}${BZ_HAS(e.label) ? `, named ${String(e.label).trim()}` : ''}`;
// each line kind's ends (§7.1): a sequence flow's filled arrow; a message flow dashed, an open circle at its source and a
// hollow triangle at its target; an association dotted, open arrowheads by its direction; a data association dotted
const bzEnds = e => { if (e.type === BZ_MSG) return { from: 'circle', to: 'triangle', dashed: true };
  if (e.type === BZ_ASSOC) { const d = bzProps(e).direction; return { from: d === 'both' ? 'open' : 'none', to: d === 'one' || d === 'both' ? 'open' : 'none', dashed: 'dot' }; }
  return e.type === BZ_DATA_ASSOC ? { from: 'none', to: 'open', dashed: 'dot' } : { from: 'none', to: 'arrow' }; };

/* ---- the legend: each line kind drawn ---- */
const BZ_KEYS = [[BZ_SEQ, '<path d="M2 8H17"/><path d="M17 4L26 8L17 12Z" fill="var(--um-muted)"/>', 'the order of steps in one pool'],
  [BZ_MSG, '<circle cx="5" cy="8" r="3" fill="var(--um-stage-bg)"/><path d="M8 8H16" stroke-dasharray="3 2"/><path d="M16 3L26 8L16 13Z" fill="var(--um-stage-bg)"/>', 'a message between pools'],
  [BZ_ASSOC, '<path d="M2 8H26" stroke-dasharray="1 2"/>', 'a note or link to an element'], [BZ_DATA_ASSOC, '<path d="M2 8H25" stroke-dasharray="1 2"/><path d="M17 4L26 8L17 12" fill="none"/>', 'data read or written']];
const bzLegend = types => BZ_KEYS.filter(([t]) => types.has(t)).map(([t, svg, says]) => `<span class="lgi" title="${esc(BZ_LINE_WORD[t] + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none">${svg}</g></svg><b>${esc(BZ_LINE_WORD[t])}</b><span>${esc(says)}</span></span>`);

/* ---- the view laid out: { model, view, pos, memo } (§5, §6, §7.2, §8) ---- */
function bzGeo({ model, view, pos: pins, memo }) {
  const P = bzPic(model, view), { I, items, open, lines, be } = P, down = view.direction === 'down', present = BZ_OBJ(view.present) ? view.present : {};
  const pic = { open, holds: P.holds, owner: P.owner }, leaves = x => (open.has(x) ? P.holds(x).flatMap(leaves) : [x]);
  // ranked: the sequence flows (a boundary event's from its activity), then each message flow between laid-out items that closes no cycle
  const links = lines.filter(l => l.e.type === BZ_SEQ && l.f.at != null && l.t.at != null).map(l => [l.f.at, l.t.at]);
  const reach = (a, b) => { const seen = new Set([a]), q = [a]; while (q.length) { const u = q.pop(); if (u === b) return true; links.forEach(([s, t]) => { if (s === u && !seen.has(t)) { seen.add(t); q.push(t); } }); } return false; };
  lines.forEach(l => { if (l.e.type === BZ_MSG && l.f.at != null && l.t.at != null && !reach(l.t.at, l.f.at)) links.push([l.f.at, l.t.at]); });
  const placed = cpPlace(pic, links.map(([a, b]) => ({ f: { at: a }, t: { at: b } })), pins);
  // the lane pass (§8.1): each lane's top-level items in cpPlace's order, stacked in their columns from the lane's first row,
  // a block whole; data beside the flow node it is associated with; a pool's own items after its lanes; pools apart by an
  // empty row; what is in no pool after them all
  let at = placed, runs = null; const spans = {};
  if (P.lanes.length) { at = {}; runs = {}; let base = 0;
    const span = x => { const ps = leaves(x).map(id => placed[id]), c = ps.map(q => q[0]), r = ps.map(q => q[1]); return { c0: Math.min(...c), c1: Math.max(...c), r0: Math.min(...r), h: Math.max(...r) - Math.min(...r) + 1 }; };
    const by = new Map(); P.holds(null).forEach(x => { const l = P.laneOf(x) ?? '\u0000none'; if (!by.has(l)) by.set(l, []); by.get(l).push(x); });
    const beside = x => (P.dataLane.get(x) || {}).by;
    const stack = (l, least) => { const next = {}, mine = by.get(l) || [];
      mine.filter(x => beside(x) == null).map(x => ({ x, ...span(x) })).sort((u, v) => u.r0 - v.r0 || u.c0 - v.c0).forEach(it => { let r = 0;
        for (let c = it.c0; c <= it.c1; c++) r = Math.max(r, next[c] ?? 0); for (let c = it.c0; c <= it.c1; c++) next[c] = r + it.h;
        leaves(it.x).forEach(id => { at[id] = [placed[id][0], base + r + placed[id][1] - it.r0]; }); });
      mine.filter(x => beside(x) != null).forEach(x => { const c = span(beside(x)).c0, r = next[c] ?? 0; next[c] = r + 1; at[x] = [c, base + r]; });
      const n = Math.max(least, 0, ...Object.values(next)); if (n) { runs[l] = [base, base + n - 1]; base += n; } };
    const ord = laneOrder(P.lanes), kids = new Map(); ord.forEach(l => kids.has(l.parent) ? kids.get(l.parent).push(l) : kids.set(l.parent, [l]));
    // a lane stacked before its lanes, a pool after them; an explicit stack, as lanes from an import can nest deep
    const visit = top => { const q = [[top, 1]]; while (q.length) { const [l, pool] = q.pop(), ks = kids.get(l.id) || [];
      if (pool !== 1) stack(l.id, ks.length ? 0 : 1); if (pool !== 2) { if (pool) q.push([l, 2]); q.push(...ks.map(k => [k, 0]).reverse()); } } };
    ord.filter(l => l.depth === 0).forEach((p, k) => { if (k) { runs['\u0000gap' + k] = [base, base]; base++; } const b0 = base; visit(p); spans[p.id] = [b0, base - 1]; });
    if (by.has('\u0000none')) { runs['\u0000gap'] = [base, base]; base++; stack('\u0000none', 0); } }
  const rowOf = x => Math.min(...leaves(x).map(id => at[id][1])), colOf = x => Math.min(...leaves(x).map(id => at[id][0]));
  const toward = (me, other) => (other.pool ? (spans[other.pool] || [0])[0] : rowOf(other.at)) < (me.pool ? spans[me.pool][0] : rowOf(me.at));
  // anchors (§7.2): a message flow to or from a pool ends at a 2 px node in the empty row beside it, on the other end's side
  const anchors = new Map();
  lines.forEach(l => { if (!(l.f.pool || l.t.pool)) return; const [me, other, w] = l.f.pool ? [l.f, l.t, 'from'] : [l.t, l.f, 'to'], s = spans[me.pool]; if (!s) return;
    const above = rowOf(other.at) < s[0], row = above ? s[0] - 1 : s[1] + 1, col = colOf(other.at), id = `\u0000${row}|${col}`;
    const k = (anchors.has(id) ? anchors.get(id).k : 0) + 1, len = 2 + 24 * (k - 1); // 24 px along the flow for each line more, so two keep apart (F2)
    anchors.set(id, { id, label: '', k, col, row, w: down ? 2 : len, h: down ? len : 2 }); l.anchor = { id, w, side: above ? 'top' : 'bottom', pool: me.pool, above }; });
  // each boundary event's side (§6.2): pinned, else facing its message flow's pool, else across the flow from its start
  const side = new Map(), far = down ? 'R' : 'B', near = down ? 'L' : 'T';
  be.forEach((h, b) => { const pin = BZ_PIN[BZ_OWN(BZ_OWN(present, b), 'side')]; if (pin) return side.set(b, pin);
    const m = lines.find(l => l.e.type === BZ_MSG && (l.f.port === b || l.t.port === b)); side.set(b, m && toward(m.f.port === b ? m.f : m.t, m.f.port === b ? m.t : m.f) ? near : far); });
  const grown = new Map(); be.forEach((h, b) => { if (!grown.has(h)) grown.set(h, new Set()); grown.get(h).add(side.get(b)); });
  // an activity is long enough on each side for its circles: 32 + 8 px each; one with no line takes 96, as the circles with lines are centred on the side and it goes beside them
  const lined = new Set(lines.flatMap(l => [l.f.port, l.t.port]).filter(Boolean));
  const onSide = (h, s) => [...be].filter(([b, x]) => x === h && side.get(b) === s).map(([b]) => b);
  // and grown 16 px on each side that holds one; on the left or right 16 px more of its own, so its centred name keeps clear of the circles
  const nodes = [...items.map(id => { const x = I.N.get(id), look = bzLook(x, false), d = { id, ...look, kind: 'file', aria: bzNodeName(P, id), col: at[id][0], row: at[id][1] };
    let { w, h } = SHAPE[look.shape].size(d); const G = grown.get(id);
    if (G) { const need = s => 16 + onSide(id, s).reduce((a, b) => a + (lined.has(b) ? 40 : 96), 0); w = Math.max(w, need('T'), need('B')); h = Math.max(h, need('L'), need('R')); G.forEach(s => { if (s === 'L' || s === 'R') w += 2 * BZ.ring; else h += BZ.ring; }); }
    return { ...d, w, h }; }), ...[...anchors.values()].map(({ k, ...n }) => n)];
  const lay = s => BZ_NAME[down ? BZ_TURN[s] : s]; // a picture's side as layoutTyped takes it: laid out down, turned
  const edges = lines.map(l => { const e = l.e, label = BZ_HAS(e.label) ? String(e.label).trim() : '', o = { id: e.id, _id: e.id, type: e.type, from: l.f.at ?? l.anchor.id, to: l.t.at ?? l.anchor.id,
    ...(label ? { label, cut: BZ.cut } : {}), end: bzEnds(e), aria: bzLineName(I, e), ...(BZ_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) };
    const rank = [l.f, l.t].map(me => (me.port ? onSide(me.at, side.get(me.port)).indexOf(me.port) : null));
    [['from', l.f], ['to', l.t]].forEach(([w, me]) => { if (me.port) Object.assign(o, { [w + 'Port']: me.port, [w + 'Side']: lay(side.get(me.port)) }); });
    if (l.f.port || l.t.port) Object.assign(o, l.f.port && l.t.port ? { portRank: rank, portMin: [32, 32] } : { portRank: rank[l.f.port ? 0 : 1], portMin: 32 });
    if (l.anchor) o[l.anchor.w + 'Side'] = l.anchor.side;
    // a message flow between activities leaves and enters on the sides toward the other pool (§7.3)
    else if (e.type === BZ_MSG && P.lanes.length && I.poolOf(l.f.at) !== I.poolOf(l.t.at)) { const dn = toward(l.f, l.t); if (!l.f.port) o.fromSide = dn ? 'top' : 'bottom'; if (!l.t.port) o.toSide = dn ? 'bottom' : 'top'; }
    return o; });
  const boxes = P.boxes.map(b => (grown.has(b.id) ? { ...b, pad: 28 } : b));
  const g = layoutTyped({ nodes, edges, ...(boxes.length ? { containers: boxes } : {}), direction: down ? 'down' : 'right', gap: BZ.gap, rgap: BZ.rgap, repair: false, reroute: false }, memo);
  return bzFinish(P, g, { runs, anchors, grown, side, down });
}

/* The laid-out graph as it is drawn, a new object: the bands; the activities at their own size and the boundary circles on
   their borders; the anchors gone and their lines' ends on the pools' borders; the headers, groups and labels outside */
function bzFinish(P, g, { runs, anchors, grown, side, down }) {
  const { I } = P, [A, S] = down ? ['x', 'w'] : ['y', 'h'];
  let bands = [];
  if (P.lanes.length) { const L = laneBands(g, P.lanes, P.laneOf, down, BZ.rgap, runs), back = b => ({ ...b, x: r2(b.x - L.shift.x), y: r2(b.y - L.shift.y) });
    bands = L.bands.map(b => ({ ...back(b), head: back(b.head) }));
    // a pool's outer edges 24 px out, 12 px outside the router's line in the gap beside it, and its lanes' on them (§5.2a)
    // where the empty row between two pools is narrower, each takes half of it less 4 px
    const ps = bands.filter(b => I.ty(b.id) === BZ_POOL).sort((a, b) => a[A] - b[A]), ends = ps.map(p => [p[A], p[A] + p[S]]);
    ps.forEach((p, k) => { const [lo, hi] = ends[k], g0 = k ? Math.min(BZ.grow, (lo - ends[k - 1][1]) / 2 - 4) : BZ.grow, g1 = k < ps.length - 1 ? Math.min(BZ.grow, (ends[k + 1][0] - hi) / 2 - 4) : BZ.grow;
      bands.filter(b => b === p || I.poolOf(b.id) === p.id).forEach(b => { const b0 = b[A], b1 = b[A] + b[S];
        [b, b.head].forEach(r => { if (Math.abs(b0 - lo) < .5) { r[A] -= Math.max(0, g0); r[S] += Math.max(0, g0); } if (Math.abs(b1 - hi) < .5) r[S] += Math.max(0, g1); }); }); }); }
  const band = new Map(bands.map(b => [b.id, b]));
  // each activity grown for its boundary events drawn at its own size, a box's frame 16 px in on each side that holds one
  const shrink = n => { if (!grown.has(n.id)) return n; const c = { ...n }; grown.get(n.id).forEach(s => { if (s === 'R' || s === 'L') c.w -= BZ.ring; else c.h -= BZ.ring; if (s === 'L') c.x += BZ.ring; if (s === 'T') c.y += BZ.ring; }); return c; };
  const laid = g.nodes.filter(n => !anchors.has(n.id)).map(shrink), families = (g.families || []).map(shrink), byId = Object.fromEntries(laid.map(n => [n.id, n]));
  const host = id => byId[id] || families.find(f => f.id === id);
  // each boundary event a 32 px circle centred on its activity's border: 16 px in from its port's box (§6.2)
  const centre = new Map();
  g.edges.forEach(e => [[e.fromPort, e.fs, e.fpb], [e.toPort, e.ts, e.tpb]].forEach(([p, s, b]) => { if (p != null && b && !centre.has(p) && BZ_V[s]) centre.set(p, [b.x + b.w / 2 - BZ.ring * BZ_V[s][0], b.y + b.h / 2 - BZ.ring * BZ_V[s][1]]); }));
  // one with no line: on its side's free span. ponytail: the activity is sized for the circles, not for the ends of the lines that
  // name no port on that side, which the layout places; where they leave no room it is held at the span's end, marked over
  const over = new Set();
  // one with no line: on its side's free span, 8 px clear of the others, in its order among its activity's
  P.be.forEach((h, b) => { if (centre.has(b) || !host(h)) return; const n = host(h), s = side.get(b), v = s === 'L' || s === 'R', a0 = (v ? n.y : n.x) + 32, a1 = (v ? n.y + n.h : n.x + n.w) - 32;
    // clear of the circles with lines (40 px centre to centre) and of the other lines' ends on that side (24 px)
    const taken = [...[...centre].filter(([o]) => P.be.get(o) === h && side.get(o) === s).map(([, c]) => [c[v ? 1 : 0], 40]),
      ...g.edges.flatMap(e => [[e.from, e.fs, e.fromPort, e.pts[0]], [e.to, e.ts, e.toPort, e.pts.at(-1)]]).filter(([id, es, p]) => id === h && es === s && p == null).map(x => [x[3][v ? 1 : 0], 24])];
    let t = a0; while (t < a1 && taken.some(([c, k]) => Math.abs(c - t) < k)) t += 4;
    const edge = s === 'L' ? n.x : s === 'R' ? n.x + n.w : s === 'T' ? n.y : n.y + n.h; centre.set(b, v ? [edge, Math.min(t, a1)] : [Math.min(t, a1), edge]); if (t >= a1) over.add(b); });
  const circles = [...P.be.keys()].filter(b => centre.has(b)).map(b => { const x = I.N.get(b), [cx, cy] = centre.get(b), o = host(P.be.get(b));
    return { id: b, ...bzLook(x), k: 'file', kind: 'file', owner: P.be.get(b), side: side.get(b), x: r2(cx - 16), y: r2(cy - 16), w: 32, h: 32, col: o.col ?? 0, row: o.row ?? 0, aria: bzNodeName(P, b), ...(over.has(b) ? { over: true } : {}) }; });
  circles.forEach(c => { byId[c.id] = c; });
  // the headers, aside, at the first node's column and row (activity.js's acFinish)
  const { col = 0, row = 0 } = laid[0] || {};
  const heads = bands.map(b => { const x = I.el(b.id), pool = x.type === BZ_POOL;
    return (byId[b.id] = { id: b.id, label: bzLabel(x), type: x.type, kind: 'file', k: 'file', shape: pool ? 'bpmn-pool' : 'bpmn-lane', aside: true, col, row, aria: bzNodeName(P, b.id), ...b.head }); });
  // the lines: a port's end on its circle, an anchor's slid onto its pool's border
  const lineOf = new Map(P.lines.map(l => [l.e.id, l]));
  // a line that ends on a side grown for boundary events, not at one of them, ends on the activity's own border: 16 px in
  const sunk = (e, w) => { const id = w === 'from' ? e.from : e.to, s = w === 'from' ? e.fs : e.ts; return !e[w + 'Port'] && grown.has(id) && grown.get(id).has(s) ? s : null; };
  const edges = g.edges.map(e => { const l = lineOf.get(e.id), ins = ['from', 'to'].map(w => sunk(e, w)); if (!e.fromPort && !e.toPort && !l.anchor && !ins[0] && !ins[1]) return e;
    const c = { ...e, pts: e.pts.map(p => p.slice()) };
    ins.forEach((s, i) => { if (!s) return; const p = c.pts[i ? c.pts.length - 1 : 0]; p[0] = r2(p[0] - BZ.ring * BZ_V[s][0]); p[1] = r2(p[1] - BZ.ring * BZ_V[s][1]); });
    if (e.fromPort && byId[e.fromPort]) Object.assign(c, { s: byId[e.fromPort], from: e.fromPort }); if (e.toPort && byId[e.toPort]) Object.assign(c, { t: byId[e.toPort], to: e.toPort });
    const b = l.anchor && band.get(l.anchor.pool);
    if (b) { const k = l.anchor.w === 'from' ? 0 : c.pts.length - 1; c.pts[k][down ? 0 : 1] = l.anchor.above ? b[A] : b[A] + b[S]; Object.assign(c, { [l.anchor.w === 'from' ? 's' : 't']: byId[l.anchor.pool], [l.anchor.w]: l.anchor.pool }); }
    return c; });
  // the reading order (§13): each pool, its lanes, each lane's items by rank (a box's contents after it, an activity's
  // boundary events after it), what is in no pool, the groups, then the lines
  const order = [];
  const put = id => { if (!byId[id] && !families.some(f => f.id === id)) return; order.push(id); circles.filter(c => c.owner === id).forEach(c => order.push(c.id)); if (P.open.has(id)) P.holds(id).sort(rankOf).forEach(put); };
  const rankOf = (a, b) => { const p = x => (byId[x] ? [byId[x].col, byId[x].row] : P.open.has(x) ? [Math.min(...P.holds(x).map(y => p(y)[0])), Math.min(...P.holds(x).map(y => p(y)[1]))] : [0, 0]); const u = p(a), v = p(b); return u[0] - v[0] || u[1] - v[1]; };
  laneOrder(P.lanes).forEach(l => { order.push(l.id); P.holds(null).filter(x => P.laneOf(x) === l.id).sort(rankOf).forEach(put); });
  P.holds(null).filter(x => P.laneOf(x) == null).sort(rankOf).forEach(put);
  // the groups (§9.3), round their members drawn, under everything; one round nothing drawn is not drawn
  const drawn = [...laid, ...circles], memberOf = (gid, n) => bzRefs(I.el(n.id)).includes(gid);
  const groups = P.groups.map(gid => { const ms = [...drawn, ...families].filter(n => memberOf(gid, n)), f = bpmnGroupFrame(bzLabel(I.el(gid)), ms, drawn.filter(n => !memberOf(gid, n)));
    return f && (byId[gid] = { id: gid, label: bzLabel(I.el(gid)), type: BZ_GROUP, kind: 'file', k: 'file', shape: 'bpmn-group', holder: true, aside: true, col, row, ...f, aria: bzNodeName(P, gid) }); }).filter(Boolean);
  order.push(...groups.map(n => n.id), ...edges.map(e => e.id));
  // the names of events, gateways and data, outside their shapes (§9.2)
  const outs = drawn.filter(n => BZ_OUT.includes(n.shape) && BZ_HAS(n.label)).map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, label: n.label }));
  const labels = bpmnLabels(outs, edges.map(e => e.pts), [...drawn.filter(n => !BZ_OUT.includes(n.shape)), ...heads, ...edges.filter(e => e.lbl).map(e => e.lbl), ...families.map(f => ({ x: f.x, y: f.y, w: f.w, h: 26 })),
    ...bands.flatMap(b => [{ x: b.x, y: b.y, w: b.w, h: 1 }, { x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 }, { x: b.x, y: b.y, w: 1, h: b.h }, { x: b.x + b.w - 1, y: b.y, w: 1, h: b.h }])]); // off the pools' and lanes' borders too
  const all = [g.bounds, ...drawn, ...heads, ...groups, ...labels, ...bands].filter(Boolean), x0 = Math.min(...all.map(r => r.x)) - 16, y0 = Math.min(...all.map(r => r.y)) - 16;
  const bounds = { x: r2(x0), y: r2(y0), w: r2(Math.max(...all.map(r => r.x + r.w)) + 16 - x0), h: r2(Math.max(...all.map(r => r.y + r.h)) + 16 - y0) };
  const nodes = [...groups, ...order.filter(id => byId[id] && !groups.includes(byId[id]) && !heads.includes(byId[id])).map(id => byId[id]), ...heads];
  const mid = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  return { ...g, nodes, byId, edges, families, bounds, bands, labels, order: order.filter(id => byId[id] || families.some(f => f.id === id) || edges.some(e => e.id === id)),
    // the slots (src/typed/edit.js): one per node, header and box, so the palette's add hears what is selected
    slots: [...drawn.map(n => ({ after: n.id, parent: P.laneOf(P.be.get(n.id) ?? n.id), ...mid(n) })), ...heads.map(h => ({ after: h.id, parent: h.id, ...mid(h) })), ...families.map(f => ({ after: f.id, parent: f.id, ...mid(f) }))],
    legend: bzLegend(new Set(edges.map(e => e.type))) };
}

/* the pools and lanes (§5.3), under the lines: a pool's outline 1.5 px, a lane's 1 px, each closing its header strip; the
   labels outside, over them */
function bzDraw(g) {
  const under = BZ_ARR(g.bands).map(b => { const h = b.head, flat = h.w >= h.h, w = b.depth ? 1 : 1.5;
    return `<rect class="bz-${b.depth ? 'lane' : 'pool'}" data-o="${esc(b.id)}" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="var(--um-muted)" stroke-width="${w}"/>`
      + `<path d="${flat ? `M${r2(h.x)} ${r2(h.y + h.h)}H${r2(h.x + h.w)}` : `M${r2(h.x + h.w)} ${r2(h.y)}V${r2(h.y + h.h)}`}" stroke="var(--um-muted)" stroke-width="${w}"/>`; }).join('');
  return { under: under ? `<g class="bz-pools">${under}</g>` : '', over: BZ_ARR(g.labels).map(bpmnLabelSvg).join('') };
}

/* ---- validators (§4). Each problem: { level, rule, path, message, ids }. With a view, what it shows ---- */
const BZ_RULES = {
  'sequence-scope': 'a sequence flow joins two flow nodes of one pool and one level',
  'sequence-ends': 'a sequence flow joins flow nodes; nothing flows into a start or boundary event, nor out of an end event',
  'message-scope': 'a message flow joins two different pools',
  'message-ends': 'a message flow leaves a pool, an activity or a message throw or end event, and arrives at a pool, an activity or a message start, catch or boundary event',
  'event-definition': 'an event\'s definition is one its kind may take; cancelActivity is a boundary event\'s',
  'boundary-host': 'a boundary event is attached to an activity, and lies where it does',
  'boundary-out': 'a boundary event has a sequence flow out',
  'flow-start': 'a process with flow nodes has a start and an end event; each activity has a sequence flow in',
  'gateway-flows': 'a gateway splits or joins; a diverging exclusive gateway names each way out',
  'lane-owner': 'a lane is in a lane of its pool or none; a flow node in a lane, pool or sub-process; data in a pool or none',
  'in-lane': 'in a pool with lanes, every flow node is in one',
  'data-ends': 'a data association joins data with an activity or event in BPMN\'s direction; an association has a text annotation at one end',
  'group-ref': 'every categoryValueRef names a group',
  'opens-view': 'a collapsed sub-process or a call activity opens a BPMN view, the sub-process\'s own',
};
function bzProblems(model, view) {
  const I = bzIndex(model), out = [], shown = new Set(BZ_ARR(view && view.nodeIds));
  const seen = id => !view || shown.has(id) || (I.L.has(id) && shown.has(I.L.get(id).pool));
  const say = (level, rule, id, ids, msg, at = '') => out.push({ level, rule, path: (I.path.get(id) || '') + at, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const q = id => { const x = I.el(id); return x && BZ_HAS(x.label) ? `${id} ("${x.label}")` : String(id); }, ty = I.ty, flow = id => BZ_FLOW.includes(ty(id));
  const seqs = [...I.E.values()].filter(e => e.type === BZ_SEQ), outs = id => seqs.filter(e => e.from === id), ins = id => seqs.filter(e => e.to === id);
  const msgDef = id => bzDef(I.el(id)) === 'message';
  I.E.forEach((e, id) => { if (!BZ_LINES.includes(e.type) || !(seen(e.from) || seen(e.to))) return; const ids = [id, e.from, e.to];
    if (e.type === BZ_SEQ) {
      if (!flow(e.from) || !flow(e.to)) say('error', 'sequence-ends', id, ids, `${id} joins ${q(e.from)} and ${q(e.to)}: a sequence flow joins activities, events and gateways`);
      else { if (I.level(e.from) !== I.level(e.to)) say('error', 'sequence-scope', id, ids, `${id} joins ${q(e.from)} and ${q(e.to)}, in ${I.poolOf(e.from) !== I.poolOf(e.to) ? 'different pools: use a message flow' : 'different sub-processes'}`);
        if (ty(e.to) === 'bpmn.StartEvent' || ty(e.to) === BZ_BE) say('error', 'sequence-ends', id, ids, `${id} flows into ${q(e.to)}, a ${bzWord(I.el(e.to)).toLowerCase()}: nothing flows into one`);
        if (ty(e.from) === 'bpmn.EndEvent') say('error', 'sequence-ends', id, ids, `${id} flows out of ${q(e.from)}, an end event: nothing flows out of one`); } }
    if (e.type === BZ_MSG) { const a = I.poolOf(e.from), b = I.poolOf(e.to);
      if (a == null || b == null || a === b) say('error', 'message-scope', id, ids, `${id} joins ${q(e.from)} and ${q(e.to)}, ${a == null || b == null ? 'not both in a pool' : 'in one pool: use a sequence flow'}`);
      const src = [BZ_POOL, ...BZ_ACT].includes(ty(e.from)) || (['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(ty(e.from)) && msgDef(e.from));
      const dst = [BZ_POOL, ...BZ_ACT].includes(ty(e.to)) || (BZ_CATCH.includes(ty(e.to)) && msgDef(e.to));
      if (!src) say('error', 'message-ends', id, ids, `${id} leaves ${q(e.from)}: a message flow leaves a pool, an activity or a message throw or end event`);
      if (!dst) say('error', 'message-ends', id, ids, `${id} arrives at ${q(e.to)}: a message flow arrives at a pool, an activity or a message start, catch or boundary event`); }
    if (e.type === BZ_DATA_ASSOC) { const d = [e.from, e.to].filter(x => BZ_DATA.includes(ty(x))), o = [e.from, e.to].find(x => !BZ_DATA.includes(ty(x)));
      if (d.length !== 1 || !(BZ_ACT.includes(ty(o)) || BZ_EVENTS.includes(ty(o)))) say('error', 'data-ends', id, ids, `${id} joins ${q(e.from)} and ${q(e.to)}: a data association joins a data object or store with an activity or an event`);
      else if (BZ_CATCH.includes(ty(o)) && o === e.to) say('error', 'data-ends', id, ids, `${id} runs from ${q(e.from)} to ${q(o)}, a catch event, which only gives data: draw it from the event to the data`);
      else if (['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(ty(o)) && o === e.from) say('error', 'data-ends', id, ids, `${id} runs from ${q(o)}, a throw event, which only takes data: draw it from the data to the event`); }
    if (e.type === BZ_ASSOC && ty(e.from) !== BZ_NOTE && ty(e.to) !== BZ_NOTE) say('error', 'data-ends', id, ids, `${id} joins ${q(e.from)} and ${q(e.to)}: an association has a text annotation at one end`); });
  I.L.forEach(({ x, pool }, id) => { if (seen(id) && x.parent != null && !(I.L.has(x.parent) && I.L.get(x.parent).pool === pool && x.parent !== id))
    say('error', 'lane-owner', id, [id, x.parent], `lane ${q(id)}'s parent ${q(x.parent)} is not a lane of its pool`, '.parent'); });
  // the processes: each pool's flow, each sub-process's, and what is in no pool
  const procs = new Map();
  I.N.forEach((x, id) => { if (!seen(id)) return; const t = x.type, p = bzProps(x);
    if (flow(id)) { const k = I.level(id); if (!procs.has(k)) procs.set(k, []); procs.get(k).push(id); }
    if (BZ_EVENTS.includes(t) && !BZ_DEFS[t].includes(bzDef(x))) say('error', 'event-definition', id, [id], `${q(id)} is a ${bzWord({ type: t }).toLowerCase()} with definition "${bzDef(x)}": it takes ${BZ_DEFS[t].join(', ')}`, '.props.definition');
    if (Object.hasOwn(p, 'cancelActivity') && t !== BZ_BE) say('error', 'event-definition', id, [id], `${q(id)} has cancelActivity: only a boundary event has it`, '.props.cancelActivity');
    if (t === BZ_BE) { const h = p.attachedTo;
      if (!BZ_ACT.includes(ty(h))) say('error', 'boundary-host', id, [id, h], `${q(id)} is attached to ${h == null ? 'nothing' : q(h)}: a boundary event is attached to a task, sub-process or call activity`, '.props.attachedTo');
      else if ((x.parent ?? null) !== (I.N.get(h).parent ?? null)) say('warning', 'boundary-host', id, [id, h], `${q(id)} lies in ${x.parent == null ? 'no owner' : q(x.parent)}, its activity ${q(h)} in ${I.N.get(h).parent == null ? 'none' : q(I.N.get(h).parent)}: it is drawn on the activity`, '.parent');
      if (!outs(id).length) say('warning', 'boundary-out', id, [id], `${q(id)} has no sequence flow out: where does the process go when it fires?`); }
    if (BZ_GATE.includes(t)) { const i = ins(id).length, o = outs(id);
      if (i === 1 && o.length === 1) say('warning', 'gateway-flows', id, [id], `${q(id)} has one flow in and one out: a gateway with one exit does nothing`);
      if (t === 'bpmn.ExclusiveGateway' && o.length > 1 && o.some(e => !BZ_HAS(e.label))) say('warning', 'gateway-flows', id, [id, ...o.filter(e => !BZ_HAS(e.label)).map(e => e.id)], `${q(id)} splits the flow: name each way out (${o.filter(e => !BZ_HAS(e.label)).map(e => e.id).join(', ')} has none)`); }
    if (BZ_ACT.includes(t) && !ins(id).length) say('warning', 'flow-start', id, [id], `${q(id)} has no sequence flow in: it never starts`);
    const pa = x.parent;
    if (pa != null && (flow(id) || BZ_DATA.includes(t))) { const ok = BZ_DATA.includes(t) ? ty(pa) === BZ_POOL : I.L.has(pa) || ty(pa) === BZ_POOL || ty(pa) === BZ_SUB;
      if (!ok) say('error', 'lane-owner', id, [id, pa], `${q(id)}'s parent ${q(pa)} is ${I.el(pa) ? `a ${bzWord(I.el(pa)).toLowerCase()}` : 'no element'}: ${BZ_DATA.includes(t) ? 'data sits in a pool or none' : 'a flow node sits in a lane, a pool or a sub-process'}`, '.parent'); }
    if (flow(id) && t !== BZ_BE) { const p0 = I.poolOf(id); if (p0 != null && I.level(id) === p0 && I.lanesOf(p0).length && I.laneIn(id) == null) say('warning', 'in-lane', id, [id, p0], `${q(id)} is in pool ${q(p0)}, which has lanes, but in none of them`); }
    bzRefs(x).forEach(r => { if (ty(r) !== BZ_GROUP) say('warning', 'group-ref', id, [id, r], `${q(id)} names ${q(r)} as its group, which is no group`, '.props.categoryValueRef'); });
    if ((t === BZ_SUB || t === 'bpmn.CallActivity') && (x.opensView != null || (t === BZ_SUB && view && !BZ_ARR(view.nodeIds).some(n => (I.N.get(n) || {}).parent === id) && [...I.N.values()].some(n => n.parent === id)))) {
      const v = BZ_ARR(model.views).find(w => BZ_OBJ(w) && w.id === x.opensView);
      if (!v || v.diagram !== 'bpmn' || (t === BZ_SUB && v.subject !== id)) say('warning', 'opens-view', id, [id], `${q(id)} ${x.opensView == null ? 'is collapsed and opens no view' : `opens ${JSON.stringify(x.opensView)}, ${!v ? 'no view of the model' : v.diagram !== 'bpmn' ? 'not a BPMN view' : 'whose subject is not it'}`}`, '.opensView'); } });
  procs.forEach((list, k) => { if (!list.some(id => ty(id) === 'bpmn.StartEvent')) say('warning', 'flow-start', k ?? list[0], [k, ...list.slice(0, 1)].filter(x => x != null), `${k == null ? 'the process in no pool' : q(k)} has no start event`);
    if (!list.some(id => ty(id) === 'bpmn.EndEvent')) say('warning', 'flow-start', k ?? list[0], [k, ...list.slice(0, 1)].filter(x => x != null), `${k == null ? 'the process in no pool' : q(k)} has no end event`); });
  return out;
}

/* ---- describe(): the view in words: its pools and lanes, then from each start event each flow node once with what leaves
   it, then the rest, then the groups ---- */
function bzDescribe(model, viewId) {
  const v = BZ_ARR(model && model.views).find(x => BZ_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const P = bzPic(model, v), { I } = P, drawn = [...P.items, ...P.open, ...P.be.keys()].filter(id => P.ids.includes(id)), seen = new Set(), walk = [];
  const drew = new Set(P.lines.map(l => l.e.id)), from = id => P.said.filter(e => e.from === id), flows = P.said.filter(e => e.type === BZ_SEQ || e.type === BZ_MSG).length;
  const visit = s => { const q = [s]; while (q.length) { const id = q.shift(); if (seen.has(id)) continue; seen.add(id); walk.push(id);
    [...P.be].filter(([, h]) => h === id).forEach(([b]) => q.push(b)); from(id).filter(e => e.type === BZ_SEQ).forEach(e => q.push(e.to)); } };
  drawn.filter(id => I.ty(id) === 'bpmn.StartEvent').forEach(visit); drawn.forEach(visit);
  const doc = x => (BZ_HAS(bzProps(x).documentation) ? ` (${String(bzProps(x).documentation).trim()})` : '');
  const out = [`${v.title || v.id}: a BPMN diagram of ${bzPlural(drawn.filter(id => BZ_FLOW.includes(I.ty(id))).length, 'flow node')}, ${bzPlural(flows, 'flow')} and ${bzPlural(P.pools.length, 'pool')}.`];
  const word = { [BZ_SEQ]: 'then', [BZ_MSG]: 'message to', [BZ_DATA_ASSOC]: 'data to', [BZ_ASSOC]: 'about' };
  // each element with what leaves it, a pool's message flows too; a line the picture leaves out said as not drawn
  const say = id => { const said = from(id).map(e => `${word[e.type]} ${I.called(e.to)}${BZ_HAS(e.label) ? ` (${String(e.label).trim()})` : ''}${drew.has(e.id) ? '' : ', not drawn'}`);
    out.push(bzNodeName(P, id) + doc(I.el(id)) + (said.length ? '; ' + said.join('; ') : '') + '.'); };
  laneOrder(P.lanes).forEach(l => say(l.id)); walk.forEach(say);
  P.groups.forEach(gid => { const ms = P.ids.filter(i => bzRefs(I.el(i)).includes(gid)).map(I.called); out.push(`Group ${bzLabel(I.el(gid))}${ms.length ? ': ' + ms.join(', ') : ', round nothing shown: not drawn'}.`); });
  return out.join('\n');
}

/* ---- editing (§11): each hook returns commands, null to leave the gesture to the default, { error } for the hint line, or
   { commands, say }; none emits a transaction that brings an error the model did not have ---- */
function bzFreshId(model, base) {
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const b = String(base).toLowerCase().replace(/->/g, '-').replace(/[^\p{L}\p{N}_$-]+/gu, '-').replace(/^-+|-+$/g, '') || 'element';
  let k = 1; while (used.has(k === 1 ? b : `${b}-${k}`)) k++;
  return k === 1 ? b : `${b}-${k}`;
}
const BZ_KEPT = ['boundary-host', 'in-lane']; // the warnings no gesture brings
function bzGuard(model, view, commands) {
  const key = p => p.rule + ' ' + p.ids.join(' '), errs = m => bzProblems(m, BZ_ARR(m.views).find(v => BZ_OBJ(v) && v.id === view.id)).filter(p => p.level === 'error' || BZ_KEPT.includes(p.rule));
  let now; try { now = apply(model, commands); } catch (e) { return { error: String(e.message) }; }
  const was = new Set(errs(model).map(key)), bad = errs(now).find(p => !was.has(key(p)));
  return bad ? { error: bad.message } : commands;
}
// connect (§7.1): the kind by the ends, no picker; a flow BPMN forbids refused with the rule's words
function bzConnect(model, view, from, to) {
  if (!BZ_OBJ(view)) return null;
  const I = bzIndex(model), a = I.ty(from), b = I.ty(to), w = id => bzWord(I.el(id)).toLowerCase(), add = type => bzGuard(model, view, [{ op: 'add', element: { id: bzFreshId(model, `${from}-${to}`), type, from, to }, view: view.id }]);
  // what the picture leaves out (§8.3) is refused, not drawn as nothing
  if (a === BZ_NOTE || b === BZ_NOTE) { const o = a === BZ_NOTE ? to : from;
    return from === to || I.L.has(o) || [BZ_POOL, BZ_GROUP].includes(I.ty(o)) ? { error: 'A text annotation is linked to an element in the flow: not a pool, a lane, a group or itself' } : add(BZ_ASSOC); }
  if (BZ_DATA.includes(a) || BZ_DATA.includes(b)) { const o = BZ_DATA.includes(a) ? to : from, t = I.ty(o);
    if (!(BZ_ACT.includes(t) || BZ_EVENTS.includes(t))) return { error: 'Data joins an activity or an event' };
    if (BZ_CATCH.includes(t) && o === to) return { error: `${bzA(w(o), true)} only gives data: draw the line from the event to the data` };
    if (['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(t) && o === from) return { error: `${bzA(w(o), true)} only takes data: draw the line from the data to the event` };
    return add(BZ_DATA_ASSOC); }
  const pa = I.poolOf(from), pb = I.poolOf(to);
  if (![...BZ_FLOW, BZ_POOL].includes(a) || ![...BZ_FLOW, BZ_POOL].includes(b)) return { error: `${bzA(!BZ_FLOW.includes(a) && a !== BZ_POOL ? w(from) : w(to), true)} joins no flow` };
  if (a === BZ_POOL && b === BZ_POOL) return { error: 'A message flow between two pools is not drawn: join an activity or event of one of them' };
  if (a === BZ_BE && bzProps(I.el(from)).attachedTo === to) return { error: 'A flow from a boundary event back to its own activity is not drawn: lead it through another step' };
  if (pa != null && pb != null && pa !== pb) { const msg = id => bzDef(I.el(id)) === 'message';
    if (!([BZ_POOL, ...BZ_ACT].includes(a) || (['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(a) && msg(from)))) return { error: `A message flow cannot start at ${bzA(w(from))}` };
    if (!([BZ_POOL, ...BZ_ACT].includes(b) || (BZ_CATCH.includes(b) && msg(to)))) return { error: `A message flow cannot end at ${bzA(w(to))}` };
    return add(BZ_MSG); }
  if (a === BZ_POOL || b === BZ_POOL) return { error: 'A sequence flow cannot leave its pool: a message flow joins two pools' };
  if (pa !== pb) return { error: `A sequence flow cannot leave its pool: ${I.called(pa == null ? from : to)} is in no pool` };
  if (I.level(from) !== I.level(to)) return { error: 'A sequence flow stays in its sub-process' };
  return add(BZ_SEQ);
}
// moveTo: a header or a group moves nothing; a boundary event's side by Alt + arrows, its activity by a drop on another's
// border (it goes to that activity's owner); a flow node or data dropped in another lane's band changes lane (its pin
// removed, its boundary events with it), into another pool only with no sequence flows, data only where what it is
// associated with is; within its lane, or by Alt + arrows, null: a pin, an order inside the lane; an annotation, in no
// pool, only pinned. All through bzGuard
const bzOwnerTo = (I, id, p) => ((I.N.get(id).parent ?? null) === (p ?? null) ? [] : [{ op: 'reparent', id, parent: p ?? null }]);
function bzMoveTo(model, view, id, at) {
  if (!BZ_OBJ(view)) return null;
  const I = bzIndex(model), x = I.el(id); if (!x) return null;
  if (I.L.has(id) || x.type === BZ_POOL || x.type === BZ_GROUP) return [];
  if (x.type === BZ_NOTE) return null;
  const geo = BZ_OBJ(at) && BZ_OBJ(at.geo) ? at.geo : {}, set = s => [{ op: 'set', view: view.id, path: ['present', id, 'side'], value: BZ_NAME[s] }];
  if (x.type === BZ_BE) { if (Array.isArray(at && at.by)) { const [dx, dy] = at.by, s = dx < 0 ? 'L' : dx > 0 ? 'R' : dy < 0 ? 'T' : dy > 0 ? 'B' : null; return s ? set(s) : null; }
    if (!Array.isArray(at && at.pt)) return null;
    const [px, py] = at.pt, near = [...BZ_ARR(geo.nodes), ...BZ_ARR(geo.families)].filter(n => BZ_OBJ(n) && BZ_ACT.includes(I.ty(n.id)) && px >= n.x - 24 && px <= n.x + n.w + 24 && py >= n.y - 24 && py <= n.y + n.h + 24)
      .map(n => { const d = { L: Math.abs(px - n.x), R: Math.abs(px - n.x - n.w), T: Math.abs(py - n.y), B: Math.abs(py - n.y - n.h) }, s = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a)); return { n, s, d: d[s] }; })
      .filter(o => o.d <= 24).sort((a, b) => a.d - b.d)[0];
    if (!near) return { error: 'Drop a boundary event on an activity\'s border' };
    return near.n.id === bzProps(x).attachedTo ? set(near.s) : bzGuard(model, view, [{ op: 'set', id, path: 'props.attachedTo', value: near.n.id }, ...bzOwnerTo(I, id, I.N.get(near.n.id).parent), ...set(near.s)]); }
  const bands = BZ_ARR(geo.bands);
  if (!Array.isArray(at && at.pt) || !bands.length || !BZ_ARR(view.nodeIds).includes(id) || I.ty(x.parent) === BZ_SUB) return null;
  const [px, py] = at.pt, hit = bands.filter(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h).sort((a, b) => b.depth - a.depth)[0];
  const to = hit ? hit.id : null, data = BZ_DATA.includes(x.type), pool = to == null ? null : I.poolOf(to), dest = data ? pool : to;
  if (dest === (x.parent ?? null) || (!data && to === I.laneIn(id))) return null;
  const bes = [...I.N.values()].filter(n => n.type === BZ_BE && bzProps(n).attachedTo === id).map(n => n.id), mine = [id, ...bes];
  if (pool !== I.poolOf(id) && [...I.E.values()].some(e => e.type === BZ_SEQ && (mine.includes(e.from) || mine.includes(e.to)))) return { error: 'Move its sequence flows first: a sequence flow stays in its pool' };
  if (data && [...I.E.values()].some(e => e.type === BZ_DATA_ASSOC && (e.from === id || e.to === id) && I.poolOf(e.from === id ? e.to : e.from) !== pool)) return { error: 'Data stays in the pool of what it is associated with' };
  const L = view.layout;
  return bzGuard(model, view, [{ op: 'reparent', id, parent: dest }, ...bes.flatMap(b => bzOwnerTo(I, b, dest)), ...(BZ_OBJ(L) && Object.hasOwn(L, id) ? [{ op: 'set', view: view.id, path: ['layout', id], value: undefined }] : [])]);
}
// add: into the lane, pool or expanded sub-process selected, else the selected node's owner; a lane into the pool selected
// (nested in the lane selected); a boundary event onto the activity selected; data in a pool, never a lane
function bzAdd(model, view, entry, label, at) {
  if (!BZ_OBJ(view) || !BZ_OBJ(entry) || !String(entry.type).startsWith('bpmn.')) return null;
  const I = bzIndex(model), sel = BZ_ARR(BZ_OBJ(at) ? at.sel : null), t = entry.type, name = BZ_HAS(label) ? String(label).trim() : '';
  const into = sel.map(id => (I.L.has(id) || I.ty(id) === BZ_POOL || I.ty(id) === BZ_SUB ? id : I.el(id) && BZ_FLOW.includes(I.ty(id)) ? I.el(id).parent : null)).find(p => p != null) ?? null;
  const el = { id: bzFreshId(model, name || entry.label || t.split('.').pop()), type: t, ...(name ? { label: name } : {}), ...(BZ_OBJ(entry.props) ? { props: structuredClone(entry.props) } : {}) };
  if (t === BZ_LANE) { const p = sel.map(id => (I.ty(id) === BZ_POOL ? id : I.L.has(id) ? I.L.get(id).pool : null)).find(Boolean);
    if (!p) return { error: 'Select a pool to add a lane to' };
    const parent = sel.find(id => I.L.has(id)); return [{ op: 'add', element: { ...el, ...(parent ? { parent } : {}) }, owner: p }]; }
  if (t === BZ_BE) { const h = sel.find(id => BZ_ACT.includes(I.ty(id)));
    if (!h) return { error: 'Select an activity to attach a boundary event to' };
    return [{ op: 'add', element: { ...el, ...(I.el(h).parent != null ? { parent: I.el(h).parent } : {}), props: { definition: 'timer', ...el.props, attachedTo: h } }, view: view.id }]; }
  const parent = t === BZ_POOL || t === BZ_NOTE || t === BZ_GROUP ? null : BZ_DATA.includes(t) ? (into == null ? null : I.poolOf(into)) : into;
  return [{ op: 'add', element: { ...el, ...(parent != null ? { parent } : {}) }, view: view.id }];
}
// remove: a lane is a member, never hidden: Delete and Shift + Delete delete it, what it held and its nested lanes moved to
// its own owner (S12); Shift + Delete on a pool deletes what it owns with it, said with the count
function bzRemove(model, view, ids, fromModel) {
  if (!BZ_OBJ(view)) return null;
  const I = bzIndex(model), gone = new Set(ids.filter(id => I.L.has(id))), pools = ids.filter(id => I.ty(id) === BZ_POOL);
  if (!gone.size && !(fromModel && pools.length)) return null;
  const cmds = [], rest = ids.filter(id => !gone.has(id)), own = new Set(BZ_ARR(view.nodes).filter(BZ_OBJ).map(x => x.id));
  // a lane's new owner: the nearest lane above it not deleted, else its pool
  const keep = id => { let p = I.up(id); for (let k = 0; p != null && gone.has(p) && k < 64; k++) p = I.up(p); return p; };
  // the lanes nested under a deleted one move up: apply() cannot reparent a member, so each is deleted and added again
  const moved = [...I.L.keys()].filter(id => !gone.has(id) && I.chain(id).some(p => gone.has(p))), shift = new Set([...gone, ...moved]);
  const held = [...I.N.values()].filter(n => shift.has(n.parent) && !rest.includes(n.id));
  held.forEach(n => cmds.push({ op: 'reparent', id: n.id, parent: I.L.get(n.parent).pool }));
  [...gone, ...moved].forEach(id => cmds.push({ op: 'delete', id }));
  // each added again where the outermost deleted lane above it was among its pool's members, so the lanes keep their order
  const top = id => I.chain(id).filter(p => gone.has(p)).at(-1), after = pool => BZ_ARR(I.el(pool).members).flatMap(m => (!BZ_OBJ(m) || !shift.has(m.id) ? [m] : moved.filter(id => top(id) === m.id)));
  moved.map(id => [after(I.L.get(id).pool).indexOf(id), id]).sort((a, b) => a[0] - b[0]).forEach(([index, id]) => { const { x, pool } = I.L.get(id), p = keep(id), c = structuredClone(x);
    delete c.parent; if (p !== pool) c.parent = p; cmds.push({ op: 'add', element: c, owner: pool, index }); });
  held.forEach(n => { const p = gone.has(n.parent) ? keep(n.parent) : n.parent; if (p !== I.L.get(n.parent).pool) cmds.push({ op: 'reparent', id: n.id, parent: p }); });
  const owned = p => [...I.N.values()].filter(n => I.chain(n.id).includes(p)).length;
  rest.forEach(id => cmds.push(fromModel || own.has(id) || I.L.has(id) ? { op: 'delete', id } : { op: 'hide', id, view: view.id }));
  const said = [...(gone.size ? [`Deleted ${gone.size === 1 ? 'lane ' + bzLabel(I.el([...gone][0])) : bzPlural(gone.size, 'lane')} from the model${fromModel ? '' : ': a lane is not hidden from a view'}, keeping what it held`] : []),
    ...(fromModel ? pools.map(p => `deleted pool ${bzLabel(I.el(p))} and the ${bzPlural(owned(p), 'element')} it holds`) : [])];
  return { commands: cmds, say: said.join('; ').replace(/^d/, 'D') };
}
// key (§11, decision 22): A on a boundary event, a picker of its pool's activities; X on a sub-process, expanded or collapsed in the view
function bzKey(model, view, ids, key) {
  if (!BZ_OBJ(view)) return null;
  const I = bzIndex(model), id = ids[ids.length - 1], x = I.el(id); if (!x) return null;
  if ((key === 'a' || key === 'A') && x.type === BZ_BE) { const p = I.poolOf(id), to = n => [{ op: 'set', id, path: 'props.attachedTo', value: n.id }, ...bzOwnerTo(I, id, n.parent)];
    // its pool's activities it can move to with its lines: the event goes to the activity's owner, and bzGuard keeps those that bring no problem
    const acts = [...I.N.values()].filter(n => BZ_ACT.includes(n.type) && I.poolOf(n.id) === p && n.id !== bzProps(x).attachedTo && Array.isArray(bzGuard(model, view, to(n))));
    return { pick: acts.map(n => bzLabel(n)), then: i => to(acts[i]) }; }
  if ((key === 'x' || key === 'X') && x.type === BZ_SUB) { const now = BZ_ARR(view.nodeIds), inside = n => I.chain(n).includes(id);
    const shownIn = now.filter(n => inside(n) || (I.ty(n) === BZ_BE && inside(bzProps(I.el(n)).attachedTo)));
    if (shownIn.length) return [{ op: 'set', view: view.id, path: 'nodeIds', value: now.filter(n => !shownIn.includes(n)) }];
    const kids = [...I.N.values()].filter(n => n.parent === id).map(n => n.id), bes = [...I.N.values()].filter(n => n.type === BZ_BE && kids.includes(bzProps(n).attachedTo)).map(n => n.id);
    if (!kids.length) return { error: 'This sub-process holds nothing to show' };
    const k = now.indexOf(id) + 1; return [{ op: 'set', view: view.id, path: 'nodeIds', value: [...now.slice(0, k), ...[...kids, ...bes].filter(n => !now.includes(n)), ...now.slice(k)] }]; }
  return null;
}
// the Owner field: a flow node's lanes, pools and sub-processes; data's pools. A lane's owner is not offered: a member moves by Delete
function bzOwners(model, x) {
  if (!BZ_OBJ(x) || x.from != null || !(BZ_FLOW.includes(x.type) || BZ_DATA.includes(x.type))) return null;
  const I = bzIndex(model), full = id => [...I.chain(id).reverse(), id].map(p => bzLabel(I.el(p))).join('::');
  const lanes = BZ_DATA.includes(x.type) ? [] : [...I.L.keys()].map(id => ({ id, label: full(id) }));
  return [...[...I.N.values()].filter(n => n.type === BZ_POOL || (!BZ_DATA.includes(x.type) && n.type === BZ_SUB && n.id !== x.id && !I.chain(n.id).includes(x.id))).map(n => ({ id: n.id, label: full(n.id) })), ...lanes];
}

/* ---- the type ---- */
const BZ_DOC = { key: 'documentation', label: 'Documentation', kind: 'text' }, BZ_GROUPS = { key: 'categoryValueRef', label: 'Groups', kind: 'list' };
const BZ_EV = t => [BZ_DOC, { key: 'definition', label: 'Definition', kind: 'enum', options: BZ_DEFS[t] }, BZ_GROUPS];
const BZ_TYPE = registerDiagramType('bpmn', {
  title: 'BPMN diagram',
  elements: [['Participant', 'Pool'], ['Lane', 'Lane'], ['Task', 'Task'], ['Task', 'User task', { taskType: 'user' }], ['Task', 'Service task', { taskType: 'service' }], ['SubProcess', 'Sub-process'],
    ['CallActivity', 'Call activity'], ['StartEvent', 'Start', { definition: 'none' }], ['StartEvent', 'Message start', { definition: 'message' }], ['StartEvent', 'Timer start', { definition: 'timer' }],
    ['IntermediateCatchEvent', 'Intermediate catch', { definition: 'message' }], ['IntermediateThrowEvent', 'Intermediate throw', { definition: 'message' }], ['BoundaryEvent', 'Boundary', { definition: 'timer' }],
    ['EndEvent', 'End', { definition: 'none' }], ['EndEvent', 'Message end', { definition: 'message' }], ['EndEvent', 'Terminate end', { definition: 'terminate' }], ['ExclusiveGateway', 'Exclusive gateway'],
    ['ParallelGateway', 'Parallel gateway'], ['DataObject', 'Data object'], ['DataStoreReference', 'Data store'], ['TextAnnotation', 'Text annotation'], ['Group', 'Group']]
    .map(([t, label, props]) => ({ type: 'bpmn.' + t, label, ...(props ? { props } : {}), ...(/Event$|Gateway$/.test(t) ? { name: false } : {}), ...(t === 'SubProcess' || t === 'CallActivity' ? { opens: 'bpmn' } : {}) })),
  // one entry, so the canvas opens no picker of kinds: connect picks the kind by the ends (§7.1, decision 8)
  lines: [{ type: BZ_SEQ, label: 'Flow (sequence, message, association or data association, by its ends)' }],
  props: { [BZ_POOL]: [BZ_DOC, { key: 'processRef', label: 'Process', kind: 'text' }], [BZ_LANE]: [BZ_DOC],
    'bpmn.Task': [BZ_DOC, { key: 'taskType', label: 'Task type', kind: 'enum', options: ['none', 'user', 'service'] }, BZ_GROUPS], [BZ_SUB]: [BZ_DOC, BZ_GROUPS],
    'bpmn.CallActivity': [BZ_DOC, { key: 'calledElement', label: 'Called element', kind: 'text' }, BZ_GROUPS],
    ...Object.fromEntries(BZ_EVENTS.map(t => [t, BZ_EV(t)])), [BZ_BE]: [...BZ_EV(BZ_BE), { key: 'cancelActivity', label: 'Interrupting', kind: 'bool' }],
    ...Object.fromEntries(BZ_GATE.map(t => [t, [BZ_DOC, BZ_GROUPS]])), 'bpmn.DataObject': [BZ_DOC, BZ_GROUPS], 'bpmn.DataStoreReference': [BZ_DOC, { key: 'dataStoreRef', label: 'Data store', kind: 'text' }, BZ_GROUPS],
    [BZ_NOTE]: [BZ_DOC, BZ_GROUPS], [BZ_GROUP]: [BZ_DOC], [BZ_SEQ]: [BZ_DOC], [BZ_MSG]: [BZ_DOC], [BZ_ASSOC]: [BZ_DOC, { key: 'direction', label: 'Direction', kind: 'enum', options: ['none', 'one', 'both'] }], [BZ_DATA_ASSOC]: [BZ_DOC] },
  // an activity deleted takes its boundary events with it; a group deleted leaves the elements that named it
  refs: Object.fromEntries([...BZ_FLOW, ...BZ_DATA, BZ_NOTE].map(t => [t, { 'props.categoryValueRef': 'drop', ...(t === BZ_BE ? { 'props.attachedTo': 'cascade' } : {}) }])),
  layout: Object.assign(bzGeo, { rank: false }), // bzGeo ranks the view itself (cpPlace): the host passes only the pins
  boxes: (model, view) => bzPic(model, view).boxes,
  draw: bzDraw,
  owners: bzOwners,
  validate: bzProblems,
  rules: BZ_RULES,
  describe: bzDescribe,
  edits: { connect: bzConnect, moveTo: bzMoveTo, add: bzAdd, remove: bzRemove, key: bzKey },
  // the PDF's tables: an element's kind; its lane or activity, and its documentation
  word: (model, id) => { const x = bzIndex(model).el(id); return x && String(x.type).startsWith('bpmn.') ? bzWord(x) : null; },
  rows: (model, view, id) => { const P = bzPic(model, view), x = P.I.el(id); if (!x) return null;
    const r = [...(P.be.has(id) ? [`on ${P.I.called(P.be.get(id))}`] : P.laneOf(id) != null ? [`in ${bzLabel(P.I.el(P.laneOf(id)))}`] : []), ...(BZ_HAS(bzProps(x).documentation) ? [String(bzProps(x).documentation).trim()] : [])];
    return r.length ? r : null; },
});

export { BZ_TYPE, BZ_RULES, bzGeo, bzProblems, bzDescribe, bzConnect, bzMoveTo, bzAdd, bzRemove, bzKey, bzOwners };
