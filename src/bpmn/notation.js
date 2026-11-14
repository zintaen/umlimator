import { esc, fit, textW } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { flowWrap } from '../uml/flow.js';
import '../uml/activity.js'; // SHAPE.partition, the pools' and lanes' header look

/* ---------- BPMN's notation (work package 4b.2, notes/milestone-4b.md §9) ----------
   Nine shapes, each with size(n), out(n, d), inset(n, side, t), face, ports and draw(n), as src/uml/flow.js's are; a
   node's look is read from its drawing input: n.type (the model's, 'bpmn.Task' …), n.label, and per type n.taskType
   ('user', 'service'), n.definition ('none', 'message', 'timer', 'terminate'), n.cancelActivity (false: non-interrupting).
   Strokes are --um-muted, fills the stage's background, glyphs --um-text; every text is cut with fit, so none overflows.
   A node's accessible name is n.aria, which the type writes, else bpmnName's.
   - bpmn-task: a task, a collapsed sub-process or a call activity. SHAPE.rounded's outline (10 px corners), 100 × 64 px at
     least, its name centred on up to three lines of 180 px; a user task's figure or a service task's gear 14 px at the top
     left, a collapsed sub-process's + in a 12 px square at the bottom centre, a call activity's border 3 px;
   - bpmn-frame: an expanded sub-process, a box (frame(f)): a rounded rectangle, its name at the top left;
   - bpmn-event: a 32 px circle; a start event 1.5 px, an intermediate or boundary event a double ring (dashed when
     non-interrupting), an end event 3.5 px; markers 16 px: an envelope (filled when it throws), a clock, a filled circle;
   - bpmn-gateway: SHAPE.diamond's outline at a fixed 40 px, an X (exclusive) or a + (parallel);
   - bpmn-data: BPMN's page, 36 × 50 px, square corners, its top right folded 10 px (not the map's document: §9.1, S10);
   - bpmn-store: the map's cylinder outline and inset, 50 × 50 px, in the typed look's paint (no kind colour);
   - bpmn-note: a text annotation, an open bracket on its left, its text beside it on up to five lines of 160 px;
   - bpmn-pool, bpmn-lane: SHAPE.partition's header, read only;
   - bpmn-group: a dashed and dotted rounded rectangle (bpmnGroupFrame places it), its name at its top left; it is hit on its
     border and title only, so a click inside it reaches what it surrounds.
   Events, gateways, data objects and stores carry their name outside the shape: bpmnLabels places each, under it first,
   stepping outwards up to 200 px until clear of lines, nodes and the labels placed before (§9.2: endLabels' loop, for a node's two
   lines of 120 px). Ships in lib/umlimator-all.js only. */

const BP = { line: 'var(--um-muted)', ink: 'var(--um-text)', bg: 'var(--um-stage-bg)', name: 12, nlh: 16, nmax: 180, pad: 10, minW: 100, maxW: 320, minH: 64,
  lab: 11, llh: 14, lmax: 120, note: 12, nomax: 160 };
const BP_WORD = { 'bpmn.Task': 'Task', 'bpmn.SubProcess': 'Sub-process', 'bpmn.CallActivity': 'Call activity', 'bpmn.StartEvent': 'start event', 'bpmn.EndEvent': 'end event',
  'bpmn.IntermediateCatchEvent': 'intermediate catch event', 'bpmn.IntermediateThrowEvent': 'intermediate throw event', 'bpmn.BoundaryEvent': 'boundary event',
  'bpmn.ExclusiveGateway': 'Exclusive gateway', 'bpmn.ParallelGateway': 'Parallel gateway', 'bpmn.DataObject': 'Data object', 'bpmn.DataStoreReference': 'Data store',
  'bpmn.TextAnnotation': 'Text annotation', 'bpmn.Group': 'Group', 'bpmn.Participant': 'Pool', 'bpmn.Lane': 'Lane' };
// a shape's type when its node names none
const BP_TYPE = { 'bpmn-task': 'bpmn.Task', 'bpmn-frame': 'bpmn.SubProcess', 'bpmn-event': 'bpmn.StartEvent', 'bpmn-gateway': 'bpmn.ExclusiveGateway', 'bpmn-data': 'bpmn.DataObject',
  'bpmn-store': 'bpmn.DataStoreReference', 'bpmn-note': 'bpmn.TextAnnotation', 'bpmn-pool': 'bpmn.Participant', 'bpmn-lane': 'bpmn.Lane', 'bpmn-group': 'bpmn.Group' };
const bpType = n => (Object.hasOwn(BP_WORD, n.type) ? n.type : BP_TYPE[n.shape] || 'bpmn.Task');
const bpDef = n => (['message', 'timer', 'terminate'].includes(n.definition) ? n.definition : 'none');
const bpThrows = n => ['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(bpType(n));

// an element's accessible name: "User task Check stock", "Message start event Order placed", "Timer boundary event
// (non-interrupting) Wait", "Sub-process Pack (expanded)"
function bpmnName(n) {
  const t = bpType(n), label = String(n.label ?? '').trim(), d = bpDef(n);
  let w = BP_WORD[t];
  if (t === 'bpmn.Task' && ['user', 'service'].includes(n.taskType)) w = n.taskType === 'user' ? 'User task' : 'Service task';
  if (/Event$/.test(t)) { w = d === 'none' ? w[0].toUpperCase() + w.slice(1) : `${d[0].toUpperCase() + d.slice(1)} ${w}`; if (t === 'bpmn.BoundaryEvent' && n.cancelActivity === false) w += ' (non-interrupting)'; }
  const how = t === 'bpmn.SubProcess' ? (n.shape === 'bpmn-frame' ? ' (expanded)' : ' (collapsed)') : '';
  return `${w}${label ? ' ' + label : ''}${how}`;
}

const bpNode = (n, shape, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || bpmnName({ ...n, shape }))}">${inner}</g>`;
const bpBody = (d, more = '') => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${BP.bg}" stroke="${BP.line}"${more}/>`;
const bpText = (x, y, t, px, wt, anchor = 'middle') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" class="c-name" fill="${BP.ink}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
const bpMark = (d, fill = 'none', more = '') => `<path d="${d}" class="bp-mark" fill="${fill}" stroke="${fill === BP.ink ? BP.ink : BP.line}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"${more}/>`;
const bpCircle = (cx, cy, r) => `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`;

/* ---- the activity: its name on up to three lines between its markers' rows ---- */
const bpTaskParts = n => { const t = bpType(n), mark = t === 'bpmn.Task' && ['user', 'service'].includes(n.taskType), plus = t === 'bpmn.SubProcess', ls = flowWrap(n.label, BP.name, BP.nmax, 3);
  const top = mark ? 22 : 8, bottom = plus ? 20 : 8;
  return { t, mark, plus, ls, top, bottom, w: Math.ceil(Math.min(BP.maxW, Math.max(BP.minW, ...ls.map(l => textW(l, BP.name) + 2 * BP.pad)))), h: Math.max(BP.minH, top + bottom + Math.max(1, ls.length) * BP.nlh) }; };
const bpUser = (x, y) => bpMark(`M${x} ${y + 14}V${y + 12}Q${x} ${y + 8} ${x + 7} ${y + 8}Q${x + 14} ${y + 8} ${x + 14} ${y + 12}V${y + 14}Z`, BP.bg) + bpMark(bpCircle(x + 7, y + 4, 3.5), BP.bg, ' data-mark="user"');
const bpGear = (x, y) => { const cx = x + 7, cy = y + 7, teeth = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `M${r2(cx + 4.5 * Math.cos(a))} ${r2(cy + 4.5 * Math.sin(a))}L${r2(cx + 7 * Math.cos(a))} ${r2(cy + 7 * Math.sin(a))}`; }).join('');
  return bpMark(teeth, 'none', ' stroke-width="2.5"') + bpMark(bpCircle(cx, cy, 4.5), BP.bg, ' data-mark="service"') + bpMark(bpCircle(cx, cy, 1.8)); };
SHAPE['bpmn-task'] = {
  size: n => { const p = bpTaskParts(n); return { w: p.w, h: p.h }; },
  out: SHAPE.rounded.out, inset: SHAPE.rounded.inset,
  draw(n) { const { t, mark, plus, ls, top, bottom } = bpTaskParts(n), cx = n.x + n.w / 2, max = n.w - 2 * BP.pad;
    let y = n.y + top + (n.h - top - bottom - Math.max(1, ls.length) * BP.nlh) / 2;
    const tx = ls.map(l => { const s = bpText(cx, y + 12, fit(l, BP.name, max), BP.name, 600); y += BP.nlh; return s; }).join('');
    const marks = (mark ? (n.taskType === 'user' ? bpUser : bpGear)(n.x + 6, n.y + 6) : '')
      + (plus ? `<rect x="${r2(cx - 6)}" y="${r2(n.y + n.h - 16)}" width="12" height="12" class="bp-mark" fill="${BP.bg}" stroke="${BP.line}" stroke-width="1.2"/>` + bpMark(`M${r2(cx - 3.5)} ${r2(n.y + n.h - 10)}H${r2(cx + 3.5)}M${r2(cx)} ${r2(n.y + n.h - 13.5)}V${r2(n.y + n.h - 6.5)}`, 'none', ' data-mark="collapsed"') : '');
    return bpNode(n, 'bpmn-task', bpBody(SHAPE.rounded.out(n), t === 'bpmn.CallActivity' ? ' style="stroke-width:3"' : '') + marks + tx); },
};

/* ---- the expanded sub-process: a box's frame, its name in the title room at the top left ---- */
SHAPE['bpmn-frame'] = {
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="10" stroke="${BP.line}"/>`
    + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 17)}" fill="${BP.ink}" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 24))}</text>`,
};

/* ---- events: the ring by kind, the marker by definition ---- */
const bpEnvelope = (cx, cy, filled) => bpMark(`M${r2(cx - 8)} ${r2(cy - 5.5)}H${r2(cx + 8)}V${r2(cy + 5.5)}H${r2(cx - 8)}Z`, filled ? BP.ink : BP.bg, ' data-mark="message"')
  + `<path d="M${r2(cx - 8)} ${r2(cy - 5.5)}L${r2(cx)} ${r2(cy + .5)}L${r2(cx + 8)} ${r2(cy - 5.5)}" class="bp-mark" fill="none" stroke="${filled ? BP.bg : BP.line}" stroke-width="1.2" stroke-linejoin="round"/>`;
const bpClock = (cx, cy) => bpMark(bpCircle(cx, cy, 7.5), BP.bg, ' data-mark="timer"') + bpMark(`M${r2(cx)} ${r2(cy - 7.5)}v2M${r2(cx + 7.5)} ${r2(cy)}h-2M${r2(cx)} ${r2(cy + 7.5)}v-2M${r2(cx - 7.5)} ${r2(cy)}h2M${r2(cx)} ${r2(cy - 4.5)}V${r2(cy)}L${r2(cx + 3.5)} ${r2(cy + 2)}`, 'none', ' stroke-width="1.2"');
SHAPE['bpmn-event'] = {
  size: () => ({ w: 32, h: 32 }), out: SHAPE.final.out, inset: SHAPE.final.inset,
  draw(n) { const t = bpType(n), d = bpDef(n), cx = n.x + n.w / 2, cy = n.y + n.h / 2, dash = t === 'bpmn.BoundaryEvent' && n.cancelActivity === false ? ' stroke-dasharray="4 3"' : '';
    const ring = ['bpmn.IntermediateCatchEvent', 'bpmn.IntermediateThrowEvent', 'bpmn.BoundaryEvent'].includes(t);
    const body = bpBody(SHAPE.final.out(n), t === 'bpmn.EndEvent' ? ' style="stroke-width:3.5"' : dash) + (ring ? `<path d="${bpCircle(cx, cy, n.w / 2 - 3)}" class="bp-ring" fill="none" stroke="${BP.line}" stroke-width="1.2"${dash}/>` : '');
    const mark = d === 'message' ? bpEnvelope(cx, cy, bpThrows(n)) : d === 'timer' ? bpClock(cx, cy) : d === 'terminate' ? bpMark(bpCircle(cx, cy, 8), BP.ink, ' data-mark="terminate"') : '';
    return bpNode(n, 'bpmn-event', body + mark); },
};

/* ---- gateways: the diamond at 40 px, an X or a + ---- */
SHAPE['bpmn-gateway'] = {
  size: () => ({ w: 40, h: 40 }), out: SHAPE.diamond.out, inset: SHAPE.diamond.inset,
  draw(n) { const cx = n.x + n.w / 2, cy = n.y + n.h / 2, par = bpType(n) === 'bpmn.ParallelGateway';
    const d = par ? `M${r2(cx - 9)} ${r2(cy)}H${r2(cx + 9)}M${r2(cx)} ${r2(cy - 9)}V${r2(cy + 9)}` : `M${r2(cx - 6)} ${r2(cy - 6)}L${r2(cx + 6)} ${r2(cy + 6)}M${r2(cx + 6)} ${r2(cy - 6)}L${r2(cx - 6)} ${r2(cy + 6)}`;
    return bpNode(n, 'bpmn-gateway', bpBody(SHAPE.diamond.out(n)) + `<path d="${d}" class="bp-mark" data-mark="${par ? 'parallel' : 'exclusive'}" fill="none" stroke="${BP.ink}" stroke-width="3.5" stroke-linecap="square"/>`); },
};

/* ---- data: BPMN's page and the map's cylinder ---- */
// grown by d, the fold's edge moves d out too: its run along each side grows by d(2 - √2)
const bpPageOut = (n, d = 0) => { const x = n.x - d, y = n.y - d, w = n.w + 2 * d, h = n.h + 2 * d, f = 10 + d * (2 - Math.SQRT2);
  return `M${r2(x)} ${r2(y)}H${r2(x + w - f)}L${r2(x + w)} ${r2(y + f)}V${r2(y + h)}H${r2(x)}Z`; };
SHAPE['bpmn-data'] = {
  size: () => ({ w: 36, h: 50 }), out: bpPageOut,
  inset: (n, s, t) => (s === 'R' && t < n.y + 10 ? 10 - (t - n.y) : s === 'T' && t > n.x + n.w - 10 ? t - (n.x + n.w - 10) : 0),
  draw: n => bpNode(n, 'bpmn-data', bpBody(bpPageOut(n)) + `<path d="M${r2(n.x + n.w - 10)} ${r2(n.y)}V${r2(n.y + 10)}H${r2(n.x + n.w)}" class="bp-mark" fill="none" stroke="${BP.line}" stroke-width="1.2" stroke-linejoin="round"/>`),
};
SHAPE['bpmn-store'] = {
  size: () => ({ w: 50, h: 50 }), out: (n, d) => SHAPE.cylinder.out(n, d), inset: (n, s, t) => SHAPE.cylinder.inset(n, s, t),
  draw(n) { const ry = SHAPE.cylinder.ry(n), { x, y, w } = n, lid = k => `M${x} ${r2(y + ry + k)}A${r2(w / 2)} ${ry} 0 0 0 ${r2(x + w)} ${r2(y + ry + k)}`;
    return bpNode(n, 'bpmn-store', bpBody(SHAPE.cylinder.out(n)) + `<path d="${lid(0)}${lid(4)}${lid(8)}" class="bp-mark" fill="none" stroke="${BP.line}" stroke-width="1.2"/>`); },
};

/* ---- the text annotation: an open bracket and its text ---- */
const bpNoteLines = n => flowWrap(n.label, BP.note, BP.nomax, 5);
SHAPE['bpmn-note'] = {
  size: n => { const ls = bpNoteLines(n); return { w: Math.ceil(Math.max(40, ...ls.map(l => textW(l, BP.note) + 16))), h: Math.max(30, ls.length * BP.nlh + 12) }; },
  out: boxOut(0), inset: () => 0,
  draw(n) { const ls = bpNoteLines(n), y0 = n.y + (n.h - ls.length * BP.nlh) / 2;
    return bpNode(n, 'bpmn-note', `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="bp-hit" fill="transparent"/>`
      + `<path d="M${r2(n.x + 12)} ${n.y}H${n.x}V${r2(n.y + n.h)}H${r2(n.x + 12)}" class="n-body" fill="none" stroke="${BP.line}"/>`
      + ls.map((l, i) => bpText(n.x + 8, y0 + i * BP.nlh + 12, fit(l, BP.note, n.w - 12), BP.note, 400, 'start')).join('')); },
};
for (const k of ['bpmn-task', 'bpmn-event', 'bpmn-gateway', 'bpmn-data', 'bpmn-store', 'bpmn-note']) { const S = SHAPE[k]; S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }

/* ---- pools and lanes: the partition's header strip under their own shape and name ---- */
for (const k of ['bpmn-pool', 'bpmn-lane']) SHAPE[k] = { draw: n => SHAPE.partition.draw({ ...n, aria: n.aria || bpmnName({ ...n, shape: k }) }).replace('class="node partition"', `class="node ${k}"`).replace('data-shape="partition"', `data-shape="${k}"`) };

/* ---- groups: drawn round their members after the layout (§9.3) ---- */
const bpMeets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// the group's frame round the members' boxes, 16 px out, and tx, its title's left: 12 px in, moved along the top 4 px at a
// time until clear of others (the nodes that are not its members); where no place is clear, 12 px in and clash: true.
// Null with no member
function bpmnGroupFrame(label, members, others) {
  if (!members || !members.length) return null;
  const x = Math.min(...members.map(m => m.x)) - 16, y = Math.min(...members.map(m => m.y)) - 16, w = Math.max(...members.map(m => m.x + m.w)) + 16 - x, h = Math.max(...members.map(m => m.y + m.h)) + 16 - y;
  const tw = textW(fit(String(label ?? ''), BP.lab, w - 24), BP.lab) + 4;
  for (let tx = x + 12; tx === x + 12 || tx + tw <= x + w - 10; tx += 4) if (!(others || []).some(o => bpMeets({ x: tx - 2, y: y + 1, w: tw, h: 14 }, o))) return { x, y, w, h, tx };
  return { x, y, w, h, tx: x + 12, clash: true };
}
SHAPE['bpmn-group'] = {
  out: boxOut(10), inset: () => 0,
  // hit on a band 24 px wide along its border and a 24 px box round its title (§9.1); every node is drawn over it
  draw(n) { const d = boxOut(10)(n), t = fit(String(n.label ?? ''), BP.lab, n.w - 24), tx = n.tx ?? n.x + 12;
    return bpNode(n, 'bpmn-group', `<path d="${d}" class="bp-hit" fill="none" stroke="transparent" stroke-width="24"/>`
      + (t ? `<rect x="${r2(tx - 2)}" y="${r2(n.y - 4)}" width="${r2(Math.max(24, textW(t, BP.lab) + 4))}" height="24" class="bp-hit" fill="transparent"/>` : '')
      + `<path d="${d}" class="n-body" fill="none" stroke="${BP.line}" stroke-dasharray="8 3 2 3"/>` + (t ? bpText(tx, n.y + 12, t, BP.lab, 600, 'start') : '')); },
};

/* ---- labels outside (§9.2): each item's name on up to two lines of 120 px, under its shape; where that box meets a line
   (4 px round it), a node or a label placed before, it steps outwards 4 px at a time, under, over, right and left in turn.
   items: [{ id, x, y, w, h, label }]; lines: each line's points as drawn; also: other boxes to keep clear of (every node
   the view draws). The items' own boxes are kept clear of too. Where nothing is clear within 200 px, the label goes 4 px
   under its shape with clash: true, for describe() and the tests ---- */
function bpmnLabels(items, lines, also) {
  const keep = [...(lines || []).flatMap(p => (p || []).slice(1).map((q, k) => ({ x: Math.min(p[k][0], q[0]) - 4, y: Math.min(p[k][1], q[1]) - 4, w: Math.abs(q[0] - p[k][0]) + 8, h: Math.abs(q[1] - p[k][1]) + 8 }))),
    ...items.map(n => ({ x: n.x - 2, y: n.y - 2, w: n.w + 4, h: n.h + 4 })), ...(also || [])], out = [];
  items.forEach(n => { const ls = flowWrap(n.label, BP.lab, BP.lmax, 2); if (!ls.length) return;
    const w = r2(Math.max(...ls.map(l => textW(l, BP.lab))) + 4), h = ls.length * BP.llh + 2, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const at = (s, o) => ({ id: n.id, lines: ls, w, h, x: r2(s === 'R' ? n.x + n.w + o : s === 'L' ? n.x - o - w : cx - w / 2), y: r2(s === 'B' ? n.y + n.h + o : s === 'T' ? n.y - o - h : cy - h / 2) });
    // only the boxes within the search's reach are tried: one pass over keep per item, so a view's cost grows with its
    // items times its boxes (ponytail: a grid of buckets if a view passes a thousand items)
    const near = [...keep, ...out].filter(k => bpMeets(k, { x: n.x - 200 - w, y: n.y - 200 - h, w: n.w + 400 + 2 * w, h: n.h + 400 + 2 * h }));
    let b = null;
    for (let o = 4; !b && o <= 200; o += 4) for (const s of ['B', 'T', 'R', 'L']) { const c = at(s, o); if (!b && !near.some(k => bpMeets(c, k))) b = c; }
    out.push(b || { ...at('B', 4), clash: true }); });
  return out;
}
const bpmnLabelSvg = b => `<g class="bp-label" data-o="${esc(b.id)}" data-box="${b.x} ${b.y} ${b.w} ${b.h}">${b.lines.map((l, i) => bpText(b.x + b.w / 2, b.y + 11 + i * BP.llh, l, BP.lab, 500)).join('')}</g>`;

export { bpmnName, bpmnLabels, bpmnLabelSvg, bpmnGroupFrame };
