/* ---------- interaction semantics, shared by uml.sequence and uml.communication (work package 3.1) ----------
   What a view's messages mean, with no layout and no DOM (notes/stage-3.md §3.2, §5.2, §6.3; model.md rows 11 and 12):
   the occurrences in time order with the operands they lie in, the activation bars by the five rules of
   notes/spike-sequence.md §2.3, the message numbers (S8), the call a new reply answers, and the rules both types check.
   A sequence view's `edges` holds its occurrences inline; a communication view's names model edges, connectors first,
   which the walk passes over. Ships in lib/umlimator-all.js only. */

const IA_ARR = x => (Array.isArray(x) ? x : []), IA_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const SORTS = ['call', 'async', 'reply', 'create', 'delete'];

/* The occurrence walk: { occ, ops }. occ, in time order: { id, i, r, path, el, message, from, to, sort, replyTo, parent },
   where i is the entry's index in view.edges (a slot's index), r its row among the occurrences, path where validate()
   finds it, sort one of SORTS (any other is a call) and null on an interaction use. ops: operand id → { id, el, fragment } */
function interactionWalk(model, view) {
  const views = IA_ARR(model && model.views), vi = views.includes(view) ? views.indexOf(view) : views.findIndex(v => IA_OBJ(v) && IA_OBJ(view) && v.id === view.id);
  const byId = new Map(), ops = new Map(), occ = [], seen = new Set();
  IA_ARR(model && model.edges).forEach((e, k) => { if (IA_OBJ(e) && !byId.has(e.id)) byId.set(e.id, [e, `edges[${k}]`]); });
  IA_ARR(view && view.fragments).forEach(f => { if (IA_OBJ(f)) IA_ARR(f.members).forEach(o => { if (IA_OBJ(o) && !ops.has(o.id)) ops.set(o.id, { id: o.id, el: o, fragment: f }); }); });
  IA_ARR(view && view.edges).forEach((x, i) => {
    const [el, path] = typeof x === 'string' ? byId.get(x) || [] : [x, `views[${vi}].edges[${i}]`];
    const message = IA_OBJ(el) && el.type === 'uml.Message'; // one with no id, or a message with no ends, is the core's error (src/core/model.js)
    if (!IA_OBJ(el) || seen.has(el) || !seen.add(el) || el.id == null || (message ? el.from == null || el.to == null : el.type !== 'uml.InteractionUse')) return;
    const p = IA_OBJ(el.props) ? el.props : {};
    occ.push({ id: el.id, i, r: occ.length, path, el, message, from: el.from, to: el.to,
      sort: message ? (SORTS.includes(p.sort) ? p.sort : 'call') : null, replyTo: p.replyTo ?? null, parent: el.parent ?? null });
  });
  return { occ, ops };
}

// an operand and every operand around it, innermost first (a cycle in `parent` stops the walk)
function operandChain(w, id) {
  const out = []; while (id != null && w.ops.has(id) && !out.includes(id)) { out.push(id); id = w.ops.get(id).fragment.parent; }
  return out;
}
// whether what lies in operand p and what lies in operand q are in different operands of one alt (null: the top level)
const apartInAlt = (w, p, q) => { const cq = operandChain(w, q);
  return operandChain(w, p).some(a => { const F = w.ops.get(a).fragment; return IA_OBJ(F.props) && F.props.operator === 'alt' && cq.some(b => b !== a && w.ops.get(b).fragment === F); }); };

/* Activations, derived by intervals (notes/spike-sequence.md §2.3): { head, call, to, a, b, depth }, a and b the rows of
   the call that opens it and the message that closes it */
function barsOf(w) {
  const ms = w.occ.filter(o => o.message), bars = [];
  ms.forEach(c => { if (c.sort !== 'call') return; // 1: a call opens one on its receiver at its row; 4: nothing else opens one
    let end = ms.filter(m => m.r > c.r && m.sort === 'reply' && m.replyTo === c.id).pop(); // 2: the last reply naming it, in any operand
    if (!end && c.from !== c.to) { // 3: back when its caller next sends, after the receiver's own last message before that; a self-call at once
      const next = ms.find(m => m.r > c.r && m.from === c.from), until = next ? next.r : Infinity;
      end = ms.filter(m => m.r > c.r && m.r < until && (m.from === c.to || m.to === c.to)).pop(); }
    end = end || c; bars.push({ head: c.to, call: c.id, to: end.id, a: c.r, b: end.r, self: c.from === c.to }); });
  /* 5: one level deeper for each bar of its lifeline it starts inside (for bars that nest, the ones that contain it). A bar
     that opens on the row another closes on (rule 3 closes one on an incoming call) only touches it, unless it is a
     self-call: that one is sent from inside the bar and comes back into it */
  bars.forEach(x => { x.depth = 1 + bars.filter(o => o !== x && o.head === x.head && o.a < x.a && (x.a < o.b || (x.a === o.b && x.self))).length; });
  return bars;
}

/* The bars of a view, time-axis input (notes/stage-3.md §3.2): [{ head, from, to, depth }], from and to occurrence ids,
   depth 1 for a bar inside no other */
const activationBars = (model, view) => barsOf(interactionWalk(model, view)).map(({ head, call, to, depth }) => ({ head, from: call, to, depth }));

/* Message numbers (S8): a message's place among the messages sent in the activation it is sent from, replies included,
   after that activation's call's number; 1, 2 … at the top level. Map: message id → '1.1.2' */
function messageNumbers(model, view) {
  const w = interactionWalk(model, view), bars = barsOf(w), num = new Map(), count = new Map();
  w.occ.forEach(m => { if (!m.message) return;
    const act = bars.filter(x => x.head === m.from && x.call !== m.id && x.a <= m.r && m.r <= x.b).reduce((a, x) => (!a || x.a > a.a ? x : a), null);
    const k = act ? act.call : null, n = (count.get(k) || 0) + 1; count.set(k, n);
    num.set(m.id, act ? `${num.get(act.call)}.${n}` : `${n}`); });
  return num;
}

/* The call a new reply from `from` to `to` answers (§5.2): the latest call from its receiver to its sender before the
   slot `at` ({ index, parent }; absent: the end) that no reply answers, where a reply, or a call, in another operand of
   an alt than the slot's does not count. Its id, or null */
function replyCallFor(model, view, from, to, at) {
  const w = interactionWalk(model, view), ms = w.occ.filter(o => o.message), idx = at && at.index != null ? at.index : Infinity, where = at ? at.parent ?? null : null;
  for (let k = ms.length - 1; k >= 0; k--) { const c = ms[k];
    if (c.i < idx && c.sort === 'call' && c.from === to && c.to === from && !apartInAlt(w, c.parent, where)
      && !ms.some(r => r.r > c.r && r.sort === 'reply' && r.replyTo === c.id && !apartInAlt(w, r.parent, where))) return c.id; }
  return null;
}

/* ---- the shared validators (notes/stage-3.md §4.3, §6.4). Each problem: { level, rule, path, message, ids }, as in
   src/uml/class.js. In a communication view there are no operands, so reply-once holds a call to one reply ---- */
const INTERACTION_RULES = {
  'reply-call': 'a reply names an earlier call of the view in replyTo, and goes back along it',
  'reply-once': 'two replies to one call lie in different operands of one alt',
  'create-once': 'a lifeline is created at most once, by the first message to or from it',
  'delete-once': 'a lifeline is deleted at most once, by the last message to or from it',
  sort: 'a message\'s sort is call, async, reply, create or delete; any other is drawn as a call',
};
function interactionProblems(model, view) {
  const w = interactionWalk(model, view), ms = w.occ.filter(o => o.message), byId = new Map(ms.map(m => [m.id, m])), replies = new Map(), out = [];
  const nm = m => `${m.id}${m.el.label != null && m.el.label !== '' ? ` ("${m.el.label}")` : ''}`, touches = (m, t) => m.from === t || m.to === t;
  const say = (rule, m, at, ids, msg, level = 'error') => out.push({ level, rule, path: m.path + at, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  ms.forEach(m => {
    const raw = IA_OBJ(m.el.props) ? m.el.props.sort : undefined, c = byId.get(m.replyTo);
    if (!SORTS.includes(raw)) say('sort', m, '.props.sort', [m.id], `${nm(m)} has ${raw === undefined ? 'no sort' : `sort ${JSON.stringify(raw)}`}, not one of ${SORTS.join(', ')}: it is drawn as a call`, 'warning');
    if (m.sort === 'reply') {
      if (m.replyTo == null) say('reply-call', m, '.props', [m.id], `${nm(m)} names no call in replyTo`, 'warning');
      else if (!c || c.r > m.r || c.sort !== 'call') say('reply-call', m, '.props.replyTo', [m.id, c && c.id], `${nm(m)} answers ${JSON.stringify(m.replyTo)}, which is not an earlier call of this view`);
      else if (m.from !== c.to || m.to !== c.from) say('reply-call', m, '', [m.id, c.id], `${nm(m)} runs from ${m.from} to ${m.to}, not back along ${nm(c)} (${c.from} to ${c.to})`);
      if (c && c.sort === 'call' && c.r < m.r) { const was = replies.get(c.id) || [], e = was.find(o => !apartInAlt(w, o.parent, m.parent));
        if (e) say('reply-once', m, '.props.replyTo', [c.id, e.id, m.id], `${nm(e)} and ${nm(m)} both answer ${nm(c)}, and do not lie in different operands of one alt`);
        replies.set(c.id, [...was, m]); } }
    if (m.sort === 'create' && m.to != null) { const e = ms.find(o => o.r < m.r && touches(o, m.to));
      if (e) say('create-once', m, '', [m.id, m.to, e.id], e.sort === 'create' && e.to === m.to ? `${m.to} is created twice, by ${nm(e)} and ${nm(m)}` : `${nm(m)} creates ${m.to}, but ${nm(e)} reaches it first`); }
    if (m.sort === 'delete' && m.to != null) { const e = ms.find(o => o.r > m.r && touches(o, m.to));
      if (e) say('delete-once', m, '', [m.id, m.to, e.id], e.sort === 'delete' && e.to === m.to ? `${m.to} is deleted twice, by ${nm(m)} and ${nm(e)}` : `${nm(m)} deletes ${m.to}, but ${nm(e)} reaches it later`); }
  });
  return out;
}

export { interactionWalk, activationBars, messageNumbers, replyCallFor, INTERACTION_RULES, interactionProblems };
