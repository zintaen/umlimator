import { canon, isGone, jsonText, labelOr, unreadable } from '../core/model.js';
import { diagramOf } from '../core/registry.js';
import { mainFlow } from '../layout/layered.js';
import { mapContext } from './context.js';
import { diff } from './diff.js';
import { arrOf } from './validate.js';

/* ---------- storyFromFlow(): a story generated from a view's main flow (layout-flow note, section 10) ----------
   A main flow is a story already: one step per main card, in order. Each step selects its card, lights it and the main
   line into it, rides that line (a tour of the two cards, which the view draws a line between) and says what the line
   does: "2. Charges: Cart charges Payments; reads Orders". A dependency line is no step: the card it joins is named in
   the caption of the step that reads or writes it. A branch (a chain of flow lines off the main flow) is a chapter,
   offered at the step where it leaves. A sequence view tells its messages in order; a BPMN view its path from the start
   event (each gateway's or activity's default flow where it names one), a communication view its numbered messages in time order. The lines are read as the view draws them (its
   geometry), so every tour rides a drawn line. audience: who it is told to, kept on the story (and its chapters); for
   "business" the captions leave out the stores a step reads or writes. Pure: nothing is saved, the model is not changed. */
const STORY_ROLES = ['main', 'branch', 'dep'];
const STORY_START = /StartEvent$/, STORY_SEQ_FLOW = /SequenceFlow$/;
// storyPlain words from a field's Markdown: its first sentence, with no marks
const storyPlain = s => { const t = String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t); return (m ? m[1] : t).replace(/[.!?]+$/, ''); };
const storyUpper = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* the view as a story reads it: its lines as drawn, which of them are dependencies and which close a loop, its cards'
   names and what a line says (storyFromFlow and storyFromDiff) */
function storyView(model, viewId) {
  const ctx = mapContext(model), v = ctx.V[viewId];
  if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const T = model && model.schemaVersion === 2 && v.diagram != null && v.diagram !== 'map' ? diagramOf(v) : null;
  const g = ctx.buildGeo(viewId), mine = new Set(arrOf(v.nodeIds)), byId = g.byId || {};
  const modelLine = new Map(arrOf(ctx.D.edges).filter(e => e && e._id != null).map(e => [e._id, e]));
  arrOf(v.edges).forEach(e => { if (e && typeof e === 'object' && e._id != null && !modelLine.has(e._id)) modelLine.set(e._id, e); });
  const name = id => { const n = byId[id], c = ctx.nodeIn(id, viewId); return String(labelOr(c && c.label != null ? c.label : n && n.label, id)).replace(/\s+/g, ' ').trim(); };
  // the view's lines as drawn: a map's each model line a drawn line stands for, a typed view's each line between the cards it is drawn between
  const lines = [], gone = []; // gone: the lines drawn as removed (a diff's), which tell no flow
  g.edges.forEach(d => {
    (d.all && !T ? d.all.map(x => ({ ...x, from: x.from, to: x.to })) : [...new Set([d._id, ...arrOf(d.ids)].filter(x => x != null))].map(id => ({ ...(modelLine.get(id) || d), _id: id, from: d.from, to: d.to })))
      .forEach(x => { if (x.from != null && x.to != null && byId[x.from] && byId[x.to]) (isGone(d) || isGone(x) ? gone : lines).push({ ...x, drawn: d }); }); });
  const near = new Set(g.edges.flatMap(d => [d.from + '\u0000' + d.to, d.to + '\u0000' + d.from]));
  const joined = (a, b) => near.has(a + '\u0000' + b);
  // a dependency line, which is no step: its flow field says, else in BPMN any line but a sequence flow (a data association),
  // else a typed view's type as the layout reads it (its flowRole: a DFD flow to or from a store, a comment link), else a
  // map line's kind as drawn (state, guard)
  const bpmn = !!T && /^bpmn/.test(String(v.diagram)), TF = T ? ctx.storyFlow(viewId) : null;
  const dep = e => STORY_ROLES.includes(e.flow) ? e.flow === 'dep' : bpmn ? !STORY_SEQ_FLOW.test(String(e.type || '')) : TF ? TF.dep(e) : !T && ['state', 'guard'].includes(e.drawn.wk);
  const cards = [...arrOf(v.nodeIds), ...Object.keys(byId)].filter((id, i, a) => byId[id] && a.indexOf(id) === i);
  // the lines that close a loop: marked loop, else found depth-first from the cards no line comes into (as the layout reads them)
  const back = new Set(), st = new Map(); lines.forEach((e, k) => { if (e.loop) back.add(k); });
  const dfs = u => { const fr = [[u, 0]]; st.set(u, 1);
    while (fr.length) { const f = fr[fr.length - 1]; if (f[1] === lines.length) { fr.pop(); st.set(f[0], 2); continue; }
      const k = f[1]++, e = lines[k]; if (e.from !== f[0] || e.from === e.to || e.loop || dep(e)) continue; if (st.get(e.to) === 1) back.add(k); else if (!st.get(e.to)) { st.set(e.to, 1); fr.push([e.to, 0]); } } };
  [...cards.filter(c => !lines.some(e => e.to === c && e.from !== c && !e.loop && !dep(e))), ...cards].forEach(c => { if (!st.get(c)) dfs(c); });
  const idOf = e => e.id != null ? String(e.id) : e._id;
  // a line's words: a map line's or a relationship's label is a verb ("charges"); a flow's, a path's or a data flow's names
  // what goes along it or when ("yes", "HTTPS", "priced order"), as does a label that starts with a capitalised short word
  const words = e => e.label != null && String(e.label).trim() ? String(e.label).replace(/\s+/g, ' ').trim() : null;
  const verbal = e => { const w = words(e); return !!w && !/^[A-Z0-9]{2,}\b/.test(w) && !(T && /(Flow|Path|Transition|Message)$/.test(String(e.type || ''))); };
  const verb = w => /^[A-Z][a-z]/.test(w) ? w[0].toLowerCase() + w.slice(1) : w;
  const lineSays = e => { if (e.what != null && String(e.what).trim()) return storyPlain(e.what);
    const w = words(e); if (!w) return `${name(e.from)} leads to ${name(e.to)}`;
    return verbal(e) ? `${name(e.from)} ${verb(w)} ${name(e.to)}` : /DataFlow$/.test(String(e.type || '')) ? `${name(e.from)} sends ${w} to ${name(e.to)}` : `${name(e.from)} to ${name(e.to)} (${w})`; };
  return { ctx, v, T, TF, g, mine, byId, modelLine, name, lines, gone, joined, bpmn, dep, cards, back, idOf, words, verbal, verb, lineSays };
}

/** A story generated from the main flow of a view (#flow-stories): one step per main card, each with select, highlight,
 *  tour and caption; branches as chapters offered at the step they leave from. options: id, title, chapters (false: none),
 *  audience. Throws when the view has no main flow. */
export function storyFromFlow(model, viewId, options = {}) {
  const { ctx, v, T, TF, g, mine, byId, modelLine, name, lines, joined, bpmn, dep, cards, back, idOf, words, verbal, verb, lineSays } = storyView(model, viewId);
  const id = typeof options.id === 'string' && options.id ? options.id : `flow-${viewId}`;
  const title = typeof options.title === 'string' && options.title.trim() ? options.title : `${String(labelOr(v.title, viewId))}: the main flow`;
  const audience = typeof options.audience === 'string' && options.audience.trim() ? options.audience.trim() : null, brief = !!audience && /^business$/i.test(audience);
  const caption = (n, head, body, deps) => { let s = `${n}. ${head}: ${body}`; if (deps.length) s += '; ' + deps.join(', '); return /[.!?]$/.test(s) ? s : s + '.'; };
  const depsOf = c => brief ? [] : lines.filter(e => dep(e) && e.from !== e.to && (e.from === c || e.to === c)).map(e => { const w = words(e), x = name(e.from === c ? e.to : e.from);
    if (verbal(e)) return e.from === c ? `${verb(w)} ${x}` : `${verb(w)} from ${x}`;
    return e.from === c ? `${w ? w + ' to' : 'uses'} ${x}` : `${w ? w + ' from' : 'takes from'} ${x}`; }).filter((x, i, a) => a.indexOf(x) === i);
  // one step: card c, reached by line e from card p (none for the first)
  const stepOf = (n, c, e, p) => { const s = { view: viewId };
    if (mine.has(c)) s.select = c;
    s.highlight = [...(mine.has(c) ? [c] : []), ...(e ? [idOf(e)] : [])];
    if (e && p != null && mine.has(p) && mine.has(c) && joined(p, c)) s.tour = [p, c];
    const head = e && verbal(e) ? storyUpper(words(e)) : name(c);
    const body = e ? lineSays(e) : byId[c] && ctx.nodeIn(c, viewId).what ? storyPlain(ctx.nodeIn(c, viewId).what) : `${name(c)} starts the flow`;
    s.caption = caption(n, head, body, depsOf(c));
    if (!s.highlight.length) delete s.highlight;
    return s; };
  const out = { id, title, ...(audience ? { audience } : {}), steps: [], chapters: [] };
  // a sequence view: its messages in the order the view lists them
  if (T && /sequence$/.test(String(v.diagram))) {
    const msgs = lines.filter(e => e.from != null).sort((a, b) => order(a) - order(b));
    function order(e) { const k = arrOf(v.edges).findIndex(x => x && (x === e.id || x.id === e.id)); return k < 0 ? 1e9 : k; }
    msgs.forEach((e, k) => { const s = { view: viewId, select: idOf(e), highlight: [idOf(e)] };
      if (e.from !== e.to && mine.has(e.from) && mine.has(e.to) && joined(e.from, e.to)) s.tour = [e.from, e.to];
      const head = e.label != null && String(e.label).trim() ? String(e.label).replace(/\s+/g, ' ').trim() : 'Message';
      s.caption = caption(k + 1, head, e.what != null && String(e.what).trim() ? storyPlain(e.what) : e.from === e.to ? `${name(e.from)} to itself` : `${name(e.from)} to ${name(e.to)}`, []);
      out.steps.push(s); });
    if (!out.steps.length) throw new Error(`umlimator: view ${jsonText(viewId)} has no messages to tell`);
    return out;
  }
  // a communication view: its messages, each a row its picture draws with its number (1, 1.1, 1.1.2), in the time order the
  // view lists them; a step selects the message, lights it and the cards it joins, and rides the connector that carries it
  if (T && /communication$/.test(String(v.diagram))) {
    const listed = arrOf(v.edges).map(x => x && typeof x === 'object' ? x.id : x), rows = Object.values(byId).filter(n => n && n.shape === 'message-row' && n.id != null);
    const at = n => { const k = listed.indexOf(n.id); return k < 0 ? 1e9 : k; }, says = { call: 'calls', async: 'signals', reply: 'replies to', create: 'creates', delete: 'deletes' };
    rows.sort((a, b) => at(a) - at(b)).forEach(r => { const e = modelLine.get(r.id) || {}, f = e.from, t = e.to, self = f === t;
      const s = { view: viewId, select: r.id, highlight: [r.id, ...[f, t].filter((x, i, a) => mine.has(x) && a.indexOf(x) === i)] };
      if (!self && mine.has(f) && mine.has(t) && joined(f, t)) s.tour = [f, t];
      const head = e.label != null && String(e.label).trim() ? String(e.label).replace(/\s+/g, ' ').trim() : 'Message';
      const body = e.what != null && String(e.what).trim() ? storyPlain(e.what) : f == null ? head : `${name(f)} ${says[r.sort] || 'calls'} ${self ? 'itself' : name(t)}`;
      s.caption = caption(r.num != null && String(r.num) ? String(r.num) : out.steps.length + 1, head, body, []);
      out.steps.push(s); });
    if (!out.steps.length) throw new Error(`umlimator: view ${jsonText(viewId)} has no messages to tell`);
    return out;
  }
  let main = null;
  if (bpmn) { // the path from the start event, each node's default flow out (props.default) else its first, never coming back
    const node = id => ctx.N[id] || {}, start = cards.find(c => STORY_START.test(String(node(c).type || '')));
    const dflt = id => { const p = node(id).props; return p && typeof p === 'object' && typeof p.default === 'string' ? p.default : null; };
    if (start != null) { const flows = lines.map((e, k) => [e, k]).filter(([e, k]) => !back.has(k) && !dep(e) && e.from !== e.to && STORY_SEQ_FLOW.test(String(e.type || '')));
      const seen = new Set([start]), ks = []; let at = start;
      for (;;) { const d = dflt(at), out = flows.filter(([e]) => e.from === at && !seen.has(e.to)), nx = (d != null && out.find(([e]) => idOf(e) === d)) || out[0]; if (!nx) break; ks.push(nx[1]); seen.add(nx[0].to); at = nx[0].to; }
      if (ks.length) main = { cards: [start, ...ks.map(k => lines[k].to)], lines: ks }; }
  }
  if (!main && T) { // a typed view: the main flow its type reads (typedMain, which an arranged view's picture draws), each of
    // its lines the drawn line that stands for it; a type with no flowRole (a use case, a class view) reads none
    const M = TF && TF.main, ks = [];
    if (M && M.cards.length) M.lineIds.forEach((lid, i) => { const a = M.cards[i], b = M.cards[i + 1];
      const k = lines.findIndex(e => e.from === a && e.to === b && lid != null && idOf(e) === String(lid)), j = k >= 0 ? k : lines.findIndex(e => e.from === a && e.to === b && !dep(e));
      ks.push(j); });
    if (M && M.cards.length && ks.every(k => k >= 0)) main = { cards: M.cards, lines: ks };
  } else if (!main) { // mainFlow over the drawn lines, as the layout reads the view's lines (layered.js)
    main = mainFlow(lines, { back, dep, cards, run: v.render === 'sequence' });
  }
  if (!main || !main.cards.length) throw new Error(`umlimator: view ${jsonText(viewId)} has no main flow: ${T && !TF && !bpmn ? `a ${String(v.diagram)} view reads none` : 'no flow line joins two of its cards'}`);
  const onMain = new Set(main.cards), mainKs = new Set(main.lines);
  main.cards.forEach((c, i) => { const e = i ? lines[main.lines[i - 1]] : null; out.steps.push(stepOf(i + 1, c, e, i ? main.cards[i - 1] : null)); });
  // branches: from each main card, each flow line off the main flow to a card off it, followed while it stays off it
  if (options.chapters !== false) {
    const flowOut = (c, seen) => lines.map((e, k) => [e, k]).filter(([e, k]) => e.from === c && !mainKs.has(k) && !back.has(k) && !dep(e) && e.from !== e.to && !seen.has(e.to));
    const taken = new Set();
    main.cards.forEach((c, i) => flowOut(c, new Set()).forEach(([e0]) => { if (onMain.has(e0.to) || taken.has(e0.to)) return;
      const seen = new Set(main.cards), chain = []; let e = e0, p = c;
      while (e && !onMain.has(e.to) && !seen.has(e.to)) { chain.push([e, p]); seen.add(e.to); p = e.to; const nx = flowOut(p, seen)[0]; e = nx ? nx[0] : null; }
      if (!chain.length) return; chain.forEach(([x]) => taken.add(x.to));
      const n = out.chapters.length + 1;
      out.chapters.push({ id: `${id}-branch-${n}`, title: `Branch from ${name(c)} to ${name(chain[0][0].to)}`, ...(audience ? { audience } : {}), at: i,
        steps: chain.map(([x, q], j) => stepOf(`${i + 1}.${j + 1}`, x.to, x, q)) }); }));
  }
  return out;
}

/* ---------- storyFromDiff(): a story told from what a change does to a view (product item 4: a pull request's diff) ----------
   diff(before, after) marks each card and line added, changed or removed; the story gives a step per marked card and line
   the view draws, in the order of the view's main flow as it was and is (a card by its place on it, a card off it after the
   main card its lines reach first, a line just before the later of its two cards), else in the view's order. Each step says what
   happened: "2. Added: Cart asks Fraud check.", "3. Changed: Shipping svc, renamed from Shipping.", "4. Removed: Ledger,
   which was joined to Payments.". By default the story plays on the model after: a removed card or line is selected by no
   step (the model after has none), and the cards it was joined to are lit; on: 'diff' tells it on diff(before,
   after).model, which draws the removed ones too, and selects them. Pure: nothing is saved. */
const DIFF_MARKS = ['added', 'changed', 'removed'];
/** A story of what changed from `before` to `after` on one view (options: id, title, audience, on: 'after' | 'diff').
 *  Throws when the view is in neither model, or shows no change. */
export function storyFromDiff(before, after, viewId, options = {}) {
  const o = options && typeof options === 'object' ? options : {}, onDiff = o.on === 'diff';
  const B = unreadable(before).model || {}, A = unreadable(after).model || {}, D = diff(B, A).model;
  const { ctx, v, mine, byId, name, lines, gone, joined, dep, cards, back, idOf, lineSays } = storyView(D, viewId);
  const vAfter = arrOf(A.views).find(x => x && x.id === viewId);
  if (!onDiff && !vAfter) throw new Error(`umlimator: view ${jsonText(viewId)} is not in the model after the change: tell its story with on: 'diff'`);
  const markOf = x => DIFF_MARKS.includes(x && x.change) ? x.change : null;
  const idx = (m, k) => new Map(arrOf(m[k]).filter(x => x && typeof x === 'object' && x.id != null).map(x => [String(x.id), x]));
  const N0 = idx(B, 'nodes'), N1 = idx(A, 'nodes'), E0 = idx(B, 'edges'), E1 = idx(A, 'edges');
  const same = (a, b) => { try { return canon(a) === canon(b); } catch { return false; } };
  const fields = (was, now) => was && now ? [...new Set([...Object.keys(was), ...Object.keys(now)])].filter(k => !['change', 'edited', 'style'].includes(k) && !same(was[k], now[k])) : [];
  const plainName = x => x && x.label != null && typeof x.label !== 'object' ? String(x.label).replace(/\s+/g, ' ').trim() : null;
  // what changed: the cards the view draws marked, and its drawn lines marked (each model line once)
  const items = [];
  cards.forEach((c, i) => { const h = markOf(byId[c]) || markOf(ctx.nodeIn(c, viewId)); if (h) items.push({ card: c, h, i }); });
  const seenL = new Set();
  [...lines, ...gone].forEach((e, k) => { const h = markOf(e) || (gone.includes(e) ? 'removed' : null), key = idOf(e); if (!h || seenL.has(key)) return; seenL.add(key); items.push({ line: e, h, i: cards.length + k }); });
  if (!items.length) throw new Error(`umlimator: view ${jsonText(viewId)} shows no change`);
  // the order: along the main flow when the view has one, else the view's own
  let rank = null;
  const all = [...lines, ...gone]; // the flow as it was too: a removed line keeps its place in the order
  try { const main = mainFlow(all, { back, dep, cards, run: v.render === 'sequence' });
    if (main && main.cards.length > 1) { rank = new Map(main.cards.map((c, i) => [c, i]));
      const todo = [...main.cards]; // a card off the main flow: after the main card its lines reach first (either way), a store too
      while (todo.length) { const c = todo.shift(); all.forEach(e => { const x = e.from === c ? e.to : e.to === c ? e.from : null;
        if (x != null && !rank.has(x)) { rank.set(x, Math.floor(rank.get(c)) + 0.5 + (rank.get(c) % 1 ? 0.001 : 0)); todo.push(x); } }); } } } catch { rank = null; }
  const at = c => rank && rank.has(c) ? rank.get(c) : Infinity;
  const place = it => it.card != null ? at(it.card) : Math.max(at(it.line.from), at(it.line.to)) - 0.25;
  items.sort((a, b) => { const pa = place(a), pb = place(b); return pa === pb || (!Number.isFinite(pa) && !Number.isFinite(pb)) ? a.i - b.i : !Number.isFinite(pa) ? 1 : !Number.isFinite(pb) ? -1 : pa - pb; });
  // the cards a removed card or line was joined to, that the story's model still shows
  const shows = c => mine.has(c) && !(markOf(byId[c]) === 'removed') && (onDiff || arrOf(vAfter.nodeIds).includes(c));
  const word = { added: 'Added', changed: 'Changed', removed: 'Removed' };
  const id = typeof o.id === 'string' && o.id ? o.id : `diff-${viewId}`;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title : `${String(labelOr(v.title, viewId))}: what changed`;
  const audience = typeof o.audience === 'string' && o.audience.trim() ? o.audience.trim() : null;
  const steps = items.map((it, k) => { const s = { view: viewId }, n = k + 1, lost = it.h === 'removed' && !onDiff;
    let body;
    if (it.card != null) { const c = it.card, near = [...new Set([...lines, ...gone].filter(e => e.from === c || e.to === c).map(e => e.from === c ? e.to : e.from))].filter(x => x !== c && shows(x));
      if (lost) { if (near.length) s.highlight = near; body = `${name(c)}${near.length ? ', which was joined to ' + near.map(name).join(', ') : ''}`; }
      else { s.select = c; s.highlight = [c];
        const was = N0.get(String(c)), now = N1.get(String(c)), f = it.h === 'changed' ? fields(was, now) : [];
        body = name(c) + (f.includes('label') && plainName(was) ? `, renamed from ${plainName(was)}` : '') + (f.filter(x => x !== 'label').length ? ` (${f.filter(x => x !== 'label').join(', ')})` : '');
        const node = ctx.nodeIn(c, viewId); if (it.h === 'added' && node && node.what != null && String(node.what).trim()) body += `: ${storyPlain(node.what)}`; } }
    else { const e = it.line, lid = idOf(e), ends = [e.from, e.to].filter((x, i, a) => a.indexOf(x) === i);
      if (lost) { const lit = ends.filter(shows); if (lit.length) s.highlight = lit; }
      else { s.select = lid; s.highlight = [lid, ...ends.filter(x => mine.has(x) && (onDiff || shows(x)))];
        if (it.h !== 'removed' && e.from !== e.to && mine.has(e.from) && mine.has(e.to) && joined(e.from, e.to) && shows(e.from) && shows(e.to)) s.tour = [e.from, e.to]; }
      const f = it.h === 'changed' ? fields(E0.get(String(e.id)), E1.get(String(e.id))) : [];
      body = lineSays(e) + (f.length ? ` (${f.join(', ')})` : ''); }
    s.caption = `${n}. ${word[it.h]}: ${body}`; if (!/[.!?]$/.test(s.caption)) s.caption += '.';
    return s; });
  return { id, title, ...(audience ? { audience } : {}), steps };
}
