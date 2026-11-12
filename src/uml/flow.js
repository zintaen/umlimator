import { esc, fit, textW, wrap2 } from '../core/text.js';
import { SHAPE, portsOn, r2 } from '../draw/shapes.js';
import { parseTransition, printTransition, transitionText } from './transition.js';

/* ---------- control nodes, actions and flows: what the activity, state machine and interaction overview share (work
   package 4.2, notes/stage-4.md §4.1, §7.2, §9.3) ----------
   Six shapes, each with size(n), out(n, d), inset(n, side, t), face(n), ports(n, side, k) and draw(n, c, f), as SHAPE.note
   is (src/uml/class.js). The router reads none of them (Q14): a line ends on the node's box, and the typed line drawer
   slides each end onto the outline by inset (§4.2). Strokes are --um-muted, fills the stage's background or --um-text (T2),
   whatever the kind's colours c and f; every text is cut with fit, so none overflows. A node's accessible name is n.aria,
   which its type writes, else the shape's own word. Hit areas are 24 px at least (E8).
   - initial: a filled 20 px circle (initial node, initial pseudostate);
   - final: a ring round a filled circle, 22 px (activity final, final state);
   - flow-final: a circle with an X, 22 px;
   - diamond: 28 px with no text; with n.label, grown to hold it on at most two lines of 11 px, each cut at 160 px (S8);
   - bar: 6 px thick across the flow and max(48, 16 × (n.busy + 1)) long (n.busy: the lines on its busiest side), lying
     across (L × 6) when n.down, the view being laid out down, else 6 × L; its type sets every line's fromSide or toSide;
   - rounded: a rectangle with 10 px corners, n.stereotypes «…» over n.label, which wraps to three lines of 180 px and
     is then cut, 96 to 320 px wide (action, state; their types draw their glyphs and compartments over it).
   Then the flow rules both the activity and the overview check (§9.3, at S21's levels) and a flow's label (§7.3).
   Ships in lib/umlimator-all.js only. */

const FL_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), FL_ARR = x => (Array.isArray(x) ? x : []);
const FL = { line: 'var(--um-muted)', ink: 'var(--um-text)', bg: 'var(--um-stage-bg)', hit: 12, px: 11, lh: 14, dmax: 160, name: 12, nlh: 16, nmax: 180, st: 11, sth: 14, padX: 10, padY: 8, minW: 96, maxW: 320, minH: 36 };

const flowNode = (n, shape, said, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || said)}">${inner}</g>`;
const flowSvgText = (x, y, t, px, wt, fill, cls) => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="middle" class="${cls}" fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
const flowBody = (d, fill) => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${fill}" stroke="${FL.line}"/>`;

// t wrapped at max px into at most k lines, the last holding the rest, each cut to max (a word longer than a line too)
function flowWrap(t, px, max, k) {
  const out = []; let line = '';
  String(t ?? '').split(/\s+/).filter(Boolean).forEach(w => { const next = line ? line + ' ' + w : w;
    if (line && textW(next, px) > max) { out.push(line); line = w; } else line = next; });
  if (line) out.push(line);
  if (out.length > k) out.splice(k - 1, out.length, out.slice(k - 1).join(' '));
  return out.map(l => fit(l, px, max, true));
}

/* ---- the circles: a filled one, a ring round a dot, one with an X ---- */
const circleOut = (n, d = 0) => { const r = n.w / 2 + d, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`; };
// how far inside the box's side the circle is at t (beyond its span, at its centre line)
const circleIn = (n, s, t) => { const r = n.w / 2, u = t - (s === 'L' || s === 'R' ? n.y + n.h / 2 : n.x + n.w / 2); return r * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); };
const circleHit = n => `<circle cx="${r2(n.x + n.w / 2)}" cy="${r2(n.y + n.h / 2)}" r="${FL.hit}" class="fl-hit" fill="transparent"/>`;
const circle = (shape, D, word, body) => ({ size: () => ({ w: D, h: D }), out: circleOut, inset: circleIn, draw: n => flowNode(n, shape, word, circleHit(n) + body(n)) });
const dot = (n, r) => `<circle cx="${r2(n.x + n.w / 2)}" cy="${r2(n.y + n.h / 2)}" r="${r2(r)}" class="fl-dot" fill="${FL.ink}"/>`;
SHAPE.initial = circle('initial', 20, 'Initial node', n => `<path d="${circleOut(n)}" class="n-mask"/><path d="${circleOut(n)}" class="n-body" fill="${FL.ink}" stroke="${FL.ink}"/>`);
SHAPE.final = circle('final', 22, 'Final node', n => flowBody(circleOut(n), FL.bg) + dot(n, n.w / 2 - 5));
SHAPE['flow-final'] = circle('flow-final', 22, 'Flow final', n => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2, k = n.w / 2 * Math.SQRT1_2;
  return flowBody(circleOut(n), FL.bg) + `<path d="M${r2(cx - k)} ${r2(cy - k)}L${r2(cx + k)} ${r2(cy + k)}M${r2(cx + k)} ${r2(cy - k)}L${r2(cx - k)} ${r2(cy + k)}" class="n-det" stroke="${FL.line}"/>`; });

/* ---- the diamond: its text on at most two lines, the diamond twice the text's box, so the box fits inside it ---- */
const diamondLines = n => { const t = String(n.label ?? '').trim(); return !t ? [] : textW(t, FL.px) <= 80 ? [fit(t, FL.px, FL.dmax)] : wrap2(t, FL.px, FL.dmax) || [fit(t, FL.px, FL.dmax)]; };
SHAPE.diamond = {
  size(n) { const ls = diamondLines(n), tw = Math.max(0, ...ls.map(l => textW(l, FL.px)));
    return ls.length ? { w: Math.max(28, Math.ceil(2 * tw + 12)), h: Math.max(28, Math.ceil(2 * ls.length * FL.lh + 4)) } : { w: 28, h: 28 }; },
  out(n, d = 0) { const cx = n.x + n.w / 2, cy = n.y + n.h / 2, a = n.w / 2 + d, b = n.h / 2 + d;
    return `M${r2(cx)} ${r2(cy - b)}L${r2(cx + a)} ${r2(cy)}L${r2(cx)} ${r2(cy + b)}L${r2(cx - a)} ${r2(cy)}Z`; },
  inset(n, s, t) { const a = n.w / 2, b = n.h / 2;
    return s === 'L' || s === 'R' ? a * Math.min(1, Math.abs(t - n.y - b) / b) : b * Math.min(1, Math.abs(t - n.x - a) / a); },
  draw(n) { const ls = diamondLines(n), cx = n.x + n.w / 2, y0 = n.y + n.h / 2 - ls.length * FL.lh / 2;
    return flowNode(n, 'diamond', ls.length ? `Decision ${ls.join(' ')}` : 'Decision', flowBody(SHAPE.diamond.out(n), FL.bg)
      + ls.map((l, i) => flowSvgText(cx, y0 + i * FL.lh + 10.5, l, FL.px, 500, FL.ink, 'c-name')).join('')); },
};

/* ---- the bar: a fork or a join, with a band 24 px thick to hit ---- */
SHAPE.bar = {
  size(n) { const L = Math.max(48, 16 * ((Number.isFinite(n.busy) ? n.busy : 0) + 1)); return n.down ? { w: L, h: 6 } : { w: 6, h: L }; },
  out: (n, d = 0) => `M${r2(n.x - d)} ${r2(n.y - d)}H${r2(n.x + n.w + d)}V${r2(n.y + n.h + d)}H${r2(n.x - d)}Z`,
  inset: () => 0,
  draw(n) { const flat = n.w >= n.h, hit = flat ? [n.x, n.y + n.h / 2 - FL.hit, n.w, 2 * FL.hit] : [n.x + n.w / 2 - FL.hit, n.y, 2 * FL.hit, n.h];
    return flowNode(n, 'bar', 'Fork or join', `<rect x="${r2(hit[0])}" y="${r2(hit[1])}" width="${r2(hit[2])}" height="${r2(hit[3])}" class="fl-hit" fill="transparent"/>`
      + `<path d="${SHAPE.bar.out(n)}" class="n-mask"/><path d="${SHAPE.bar.out(n)}" class="n-body" fill="${FL.ink}" stroke="${FL.ink}"/>`); },
};

/* ---- the rounded rectangle: stereotypes, then the name on up to three lines, centred ---- */
const roundedParts = n => { const st = FL_ARR(n.stereotypes).filter(t => t != null && t !== '').map(t => fit(`«${t}»`, FL.st, FL.maxW - 2 * FL.padX)), ls = flowWrap(n.label, FL.name, FL.nmax, 3);
  return { st, ls, w: Math.ceil(Math.min(FL.maxW, Math.max(FL.minW, ...st.map(t => textW(t, FL.st) + 2 * FL.padX), ...ls.map(l => textW(l, FL.name) + 2 * FL.padX)))),
    h: Math.max(FL.minH, 2 * FL.padY + st.length * FL.sth + Math.max(1, ls.length) * FL.nlh) }; };
SHAPE.rounded = {
  size: n => { const p = roundedParts(n); return { w: p.w, h: p.h }; },
  out: SHAPE.box.out, inset: SHAPE.box.inset,
  draw(n) { const { st, ls } = roundedParts(n), cx = n.x + n.w / 2, max = n.w - 2 * FL.padX;
    let y = n.y + (n.h - st.length * FL.sth - Math.max(1, ls.length) * FL.nlh) / 2;
    const tx = st.map(t => { const s = flowSvgText(cx, y + 11, fit(t, FL.st, max), FL.st, 400, FL.line, 'c-st'); y += FL.sth; return s; });
    ls.forEach(l => { tx.push(flowSvgText(cx, y + 12, fit(l, FL.name, max), FL.name, 600, FL.ink, 'c-name')); y += FL.nlh; });
    return flowNode(n, 'rounded', `Action ${n.label ?? ''}`, flowBody(SHAPE.rounded.out(n), FL.bg) + tx.join('')); },
};
for (const k of ['initial', 'final', 'flow-final', 'diamond', 'bar', 'rounded']) { const S = SHAPE[k]; S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }

/* ---- the flow rules (§9.3), at S21's levels: what UML forbids is an error, what is only unfinished a warning. Each
   problem is { level, rule, path, message, ids }, as in src/uml/class.js. flowProblems(model, view, ends) checks the
   model's flows that touch a node the view shows (all of them with no view), and the control nodes the view shows;
   ends: the node types a flow of the calling type may end on ---- */
const FLOW_LINES = ['uml.ControlFlow', 'uml.ObjectFlow'];
const FLOW_CONTROL = ['uml.InitialNode', 'uml.ActivityFinalNode', 'uml.FlowFinalNode', 'uml.DecisionNode', 'uml.MergeNode', 'uml.ForkNode', 'uml.JoinNode'];
const FLOW_RULES = {
  'flow-ends': 'a flow joins two of the diagram\'s control, action or object nodes, never a partition or a comment',
  'initial-flows': 'an initial node has no incoming flow and one outgoing',
  'final-flows': 'an activity final or a flow final has no outgoing flow',
  'fork-join': 'a fork has one incoming flow and two or more outgoing; a join two or more incoming and one outgoing',
  'decision-merge': 'a decision has one incoming flow and two or more outgoing; a merge two or more incoming and one outgoing',
  'decision-guards': 'each flow out of a decision has a guard, and at most one is else',
};
const flowWord = t => String(t ?? '').split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); // 'uml.ForkNode': "fork node"
function flowProblems(model, view, ends) {
  const at = new Map(), out = [], shown = new Set(FL_ARR(view && view.nodeIds)), seen = id => !view || shown.has(id);
  FL_ARR(model && model.nodes).forEach((x, k) => { if (FL_OBJ(x) && !at.has(x.id)) at.set(x.id, [x, `nodes[${k}]`]); });
  const el = id => (at.get(id) || [])[0], nm = id => { const x = el(id); return x && x.label != null && x.label !== '' ? `${flowWord(x.type)} ${id} ("${x.label}")` : `${x ? flowWord(x.type) + ' ' : ''}${id}`; };
  const say = (rule, path, ids, msg, level = 'error') => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const flows = FL_ARR(model && model.edges).map((e, k) => [e, `edges[${k}]`]).filter(([e]) => FL_OBJ(e) && FLOW_LINES.includes(e.type) && (seen(e.from) || seen(e.to)));
  const ins = new Map(), outs = new Map(), add = (m, id, e) => m.set(id, [...(m.get(id) || []), e]);
  flows.forEach(([e, path]) => { add(outs, e.from, e); add(ins, e.to, e);
    [e.from, e.to].forEach(id => { const x = el(id); if (x && !FL_ARR(ends).includes(x.type)) say('flow-ends', path, [e.id, id], `${e.id} ends on ${nm(id)}, which a flow may not end on`); }); });
  const list = es => es.map(e => e.id).join(', '), flowsN = (k, how) => `${k} ${how} flow${k === 1 ? '' : 's'}`;
  at.forEach(([x, path], id) => { if (!seen(id) || !FLOW_CONTROL.includes(x.type)) return;
    const i = ins.get(id) || [], o = outs.get(id) || [], ids = es => [id, ...es.map(e => e.id)];
    const many = (rule, es, how, most) => { if (es.length > most) say(rule, path, ids(es), `${nm(id)} has ${flowsN(es.length, how)} (${list(es)}); it may have ${most ? 'one' : 'none'}`); };
    const few = (rule, es, how) => { if (es.length < 2) say(rule, path, ids(es), `${nm(id)} has ${flowsN(es.length, how)}; it wants two or more`, 'warning'); };
    switch (x.type) {
      case 'uml.InitialNode': many('initial-flows', i, 'incoming', 0); many('initial-flows', o, 'outgoing', 1);
        if (!o.length) say('initial-flows', path, [id], `${nm(id)} has no outgoing flow yet`, 'warning'); break;
      case 'uml.ActivityFinalNode': case 'uml.FlowFinalNode': many('final-flows', o, 'outgoing', 0); break;
      case 'uml.ForkNode': many('fork-join', i, 'incoming', 1); few('fork-join', o, 'outgoing'); break;
      case 'uml.JoinNode': many('fork-join', o, 'outgoing', 1); few('fork-join', i, 'incoming'); break;
      case 'uml.MergeNode': many('decision-merge', o, 'outgoing', 1); few('decision-merge', i, 'incoming'); break;
      case 'uml.DecisionNode': { many('decision-merge', i, 'incoming', 1); few('decision-merge', o, 'outgoing');
        const g = e => (FL_OBJ(e.props) && e.props.guard != null ? String(e.props.guard).trim() : ''), bare = o.filter(e => !g(e)), elses = o.filter(e => g(e) === 'else');
        if (bare.length) say('decision-guards', path, ids(bare), `${flowsN(bare.length, 'outgoing')} of ${nm(id)} ${bare.length === 1 ? 'has' : 'have'} no guard (${list(bare)})`, 'warning');
        if (elses.length > 1) say('decision-guards', path, ids(elses), `${nm(id)} has ${elses.length} exits guarded else (${list(elses)}); at most one may be`, 'warning'); }
    }
  });
  return out;
}

/* ---- a flow's label (§7.2, §7.3): "name [guard]", the name in the trigger's place; a guard alone "[guard]". F2's text is
   read by parseFlow, which refuses an effect, so a name holding / or a [ outside brackets is written in the properties
   panel; printFlow is null for such a name (it would not read back), and the line is drawn by flowText ---- */
const flowText = (name, guard) => transitionText({ trigger: name, guard });
const printFlow = (name, guard) => printTransition({ trigger: name, guard });
function parseFlow(text) {
  const r = parseTransition(text, 'a flow is name [guard]');
  return r.error ? r : r.effect !== undefined ? { error: 'a flow has no effect: a name holding / is written in the properties panel' } : { name: r.trigger, guard: r.guard };
}

export { flowWrap, FLOW_LINES, FLOW_CONTROL, FLOW_RULES, flowProblems, flowText, printFlow, parseFlow };
