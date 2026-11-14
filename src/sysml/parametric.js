import { registerDiagramType } from '../core/registry.js';
import { esc, fit } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { csAdd, csConnect, csGeo, csMember, csMoveTo, csRemove, csRename } from '../uml/composite.js';
import { SYS_AS_UML, SYS_BACK, SYS_CS_PROBLEMS, SYS_DRESS } from './sysml.js';

/* ---------- SysML's parametric diagram, sysml.parametric (work package M3.5, notes/milestone-3.md §9, §13) ----------
   The view's subject, a block or a constraint block, is drawn as the composite structure type draws a class
   (src/uml/composite.js), through M3.1's projection and dressing (src/sysml/sysml.js): its frame, its constraint and value
   properties as boxes, the parameters of the constraint block each constraint property's type names as that box's ports, a
   constraint block subject's own parameters on its frame, binding connectors as plain solid lines through their constraint
   properties (ends.<end>.part, §14 of the note: S14). This file adds what is SysML's own: a constraint property's rounded
   corners and its block's expression under its name, cut to its box (§17); SysML's names, legend, describe(), the PDF's
   words, rows and line text, the rules (§9) and the composite type's editing hooks on the projection, what they add mapped
   back to SysML's types. Only lib/umlimator-all.js holds this file. */

const SYS_PAR_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), SYS_PAR_ARR = x => (Array.isArray(x) ? x : []);
const SYS_PAR_PROPS = x => (SYS_PAR_OBJ(x && x.props) ? x.props : {}), SYS_PAR_HAS = x => x != null && x !== '';
const SYS_PAR_NAME = x => String(x.label ?? x.id);
const SYS_PAR_PLURAL = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const SYS_PAR_PROP = { 'sysml.ConstraintProperty': 'Constraint', 'sysml.ValueProperty': 'Value' };
const SYS_PAR_SUBJ = { 'sysml.Block': 'Block', 'sysml.ConstraintBlock': 'Constraint block' };

/* ---- the model read: elements and members by id (the first of an id), the subject, a constraint block by its label ---- */
function SYS_PAR_INDEX(model, view) {
  const at = new Map(), mem = new Map();
  SYS_PAR_ARR(model && model.nodes).forEach(n => { if (SYS_PAR_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  at.forEach(n => SYS_PAR_ARR(n.members).forEach(m => { if (SYS_PAR_OBJ(m) && typeof m.id === 'string' && !at.has(m.id) && !mem.has(m.id)) mem.set(m.id, { m, owner: n }); }));
  const E = new Map(); SYS_PAR_ARR(model && model.edges).forEach(e => { if (SYS_PAR_OBJ(e) && typeof e.id === 'string' && !E.has(e.id)) E.set(e.id, e); });
  const S = view && at.has(view.subject) ? at.get(view.subject) : null;
  // the constraint block a constraint property's type names (exactly one, by label, as the composite type finds a part's type)
  const block = m => { const t = SYS_PAR_PROPS(m).valueType, c = SYS_PAR_HAS(t) ? [...at.values()].filter(n => n.type === 'sysml.ConstraintBlock' && n.label === t) : []; return c.length === 1 ? c[0] : null; };
  const params = B => SYS_PAR_ARR(B && B.members).filter(m => SYS_PAR_OBJ(m) && m.type === 'sysml.ConstraintParameter');
  return { at, mem, E, S, block, params, el: id => at.get(id) || (mem.get(id) || {}).m || null, owner: id => (mem.get(id) || {}).owner || null };
}
// the subject's members this view draws: its constraint and value properties (§4 row 19)
const SYS_PAR_SHOWN = I => (I.S ? SYS_PAR_ARR(I.S.members).filter(m => SYS_PAR_OBJ(m) && Object.hasOwn(SYS_PAR_PROP, m.type)) : []);
const SYS_PAR_PART = (e, k) => { const p = (SYS_PAR_PROPS(e).ends || {})[k]; return SYS_PAR_OBJ(p) && p.part != null ? p.part : null; };
const SYS_PAR_EXPR = B => (B && SYS_PAR_HAS(SYS_PAR_PROPS(B).constraint) ? `{${SYS_PAR_PROPS(B).constraint}}` : '');

/* ---- a constraint property's shape: the part's box with 10 px rounded corners, its name over its block's expression, each cut
   to the box, the two centred; sized by the composite type from its name alone (§17) ---- */
SHAPE['sysml-constraint'] = { ...SHAPE.part,
  draw(n, c, f) { const { x, y, w, h } = n, e = n.expr ? fit(n.expr, 11, w - 20) : '';
    return `<g class="node part constraint" data-id="${esc(n.id)}" data-shape="part" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Constraint ' + (n.label ?? ''))}">`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="n-mask"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="n-body" fill="${f}" stroke="${c}"/>`
      + `<text x="${r2(x + w / 2)}" y="${r2(e ? y + h / 2 - 4 : y + h / 2 + 4)}" text-anchor="middle" class="c-name" fill="var(--um-text)" style="font:500 12px var(--um-sans)" data-o="${esc(n.id)}">${esc(fit(n.label ?? '', 12, w - 20))}</text>`
      + (e ? `<text x="${r2(x + w / 2)}" y="${r2(y + h / 2 + 12)}" text-anchor="middle" class="c-expr" fill="var(--um-text)" style="font:italic 11px var(--um-sans)">${esc(e)}</text>` : '') + '</g>'; },
};

/* ---- names (§13): the type's words for each property, parameter and binding; null leaves the composite type's ---- */
const SYS_PAR_TEXT = m => { const p = SYS_PAR_PROPS(m); return `${m.label ?? m.id}${SYS_PAR_HAS(p.valueType) ? ': ' + p.valueType : ''}${SYS_PAR_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : ''}`; };
const SYS_PAR_PARAM_SAY = (p, owner) => `Parameter ${SYS_PAR_TEXT(p)}${owner ? ' of ' + SYS_PAR_NAME(owner) : ''}`;
// a binding's end: "value ecoRange", "parameter range of eco" (through a constraint property), "parameter range of RangeEquation"
function SYS_PAR_END(I, e, k) {
  const x = I.el(e[k]), part = SYS_PAR_PART(e, k), nm = x ? SYS_PAR_NAME(x) : String(e[k]);
  if (x && x.type === 'sysml.ConstraintParameter') return `parameter ${nm} of ${part != null ? SYS_PAR_NAME(I.el(part) || { id: part }) : SYS_PAR_NAME(I.owner(x.id) || { id: '?' })}`;
  return x && x.type === 'sysml.ValueProperty' ? `value ${nm}` : nm;
}
const SYS_PAR_LINE_SAY = (I, e) => `Binding from ${SYS_PAR_END(I, e, 'from')} to ${SYS_PAR_END(I, e, 'to')}`;
function SYS_PAR_SAY(I, g, id) {
  const n = I.at.get(id); if (n && Object.hasOwn(SYS_PAR_SUBJ, n.type)) { const c = g.byId && g.byId[id]; return c && c.aria ? String(c.aria).replace(/^Class\b/, SYS_PAR_SUBJ[n.type]) : null; }
  const k = String(id).indexOf('->'), m = I.mem.get(k < 0 ? id : String(id).slice(k + 2));
  if (m && m.m.type === 'sysml.ConstraintParameter') return SYS_PAR_PARAM_SAY(m.m, k < 0 ? m.owner : I.el(String(id).slice(0, k)));
  if (m && I.S && m.owner === I.S && Object.hasOwn(SYS_PAR_PROP, m.m.type)) { const B = m.m.type === 'sysml.ConstraintProperty' ? I.block(m.m) : null, ports = SYS_PAR_ARR(g.nodes).filter(x => x.owner === id && x.shape === 'port').length;
    return `${SYS_PAR_PROP[m.m.type]} ${SYS_PAR_TEXT(m.m)}${SYS_PAR_EXPR(B) ? ' ' + SYS_PAR_EXPR(B) : ''}, in ${SYS_PAR_NAME(I.S)}${ports ? ', ' + SYS_PAR_PLURAL(ports, 'parameter') : ''}`; }
  const e = I.at.has(id) || m ? null : I.E.get(id);
  return e && e.type === 'sysml.BindingConnector' ? SYS_PAR_LINE_SAY(I, e) : null;
}

/* ---- the legend (§13): binding, comment link, as drawn ---- */
const SYS_PAR_LEGEND = [
  ['Binding', 'the two ends have equal values', g => g.edges.some(e => e.type === 'uml.Connector'), ''],
  ['Comment link', 'what a comment is about', g => g.edges.some(e => e.type === 'uml.CommentLink'), ' stroke-dasharray="3 2"'],
];

/* ---- the view laid out: the projection laid out by the composite type, dressed (src/sysml/sysml.js), then on a copy: each
   constraint property's shape and expression, SysML's legend ---- */
function SYS_PAR_GEO({ model, view, pos, memo }) {
  const I = SYS_PAR_INDEX(model, view), P = SYS_AS_UML(model, view);
  const raw = csGeo({ model: P.model, view: P.view, pos, memo });
  const d = SYS_DRESS(raw, model, view, id => SYS_PAR_SAY(I, raw, id));
  const nodes = d.nodes.map(n => { const m = I.mem.get(n.id); if (!m || m.owner !== I.S || m.m.type !== 'sysml.ConstraintProperty') return n;
    const x = SYS_PAR_EXPR(I.block(m.m)); return { ...n, shape: 'sysml-constraint', ...(x ? { expr: x } : {}) }; });
  const now = new Map(nodes.map(n => [n.id, n]));
  return { ...d, nodes, byId: Object.fromEntries(Object.entries(d.byId).map(([k, n]) => [k, now.get(k) || n])),
    legend: SYS_PAR_LEGEND.filter(([, , on]) => on(d)).map(([w, says, , dash]) => `<span class="lgi" title="${esc(w + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><path d="M2 8H26" stroke="var(--um-muted)" stroke-width="1.4"${dash}/></svg><b>${esc(w)}</b><span>${esc(says)}</span></span>`) };
}

/* ---- validators (§9). Each problem: { level, rule, path, message, ids } ---- */
const SYS_PAR_RULES = {
  'subject-kind': 'the view\'s subject is a block or a constraint block it lists in nodeIds (a view with none: a warning)',
  'binding-ends': 'each end of a binding is a value property of the subject, a parameter of the subject, or a parameter reached through a constraint property of the subject',
  'binding-parameter': 'a parameter reached through a constraint property is one of the constraint block its type names',
  'binding-types': 'the two ends\' types, when both are set and name elements, are equal or one specializes the other',
  'parameter-bound': 'each parameter of a constraint property shown has a binding',
  'connector-drawn': 'a binding between two parameters of the subject is not drawn: the frame has no line to itself',
};
function SYS_PAR_PROBLEMS(model, view) {
  if (!view) return [];
  const out = [], I = SYS_PAR_INDEX(model, view), S = I.S, vi = SYS_PAR_ARR(model.views).indexOf(view), q = id => JSON.stringify(I.el(id) ? SYS_PAR_NAME(I.el(id)) : String(id));
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  if (view.subject == null) say('warning', 'subject-kind', `views[${vi}]`, [view.id], `view ${JSON.stringify(view.id)} has no subject (deleted, or hidden from it): it draws no frame until one is set`);
  else if (!S || !Object.hasOwn(SYS_PAR_SUBJ, S.type) || !SYS_PAR_ARR(view.nodeIds).includes(S.id)) say('error', 'subject-kind', `views[${vi}].subject`, [view.id, view.subject], `view ${JSON.stringify(view.id)}'s subject ${JSON.stringify(view.subject)} is not a block or a constraint block it lists in nodeIds`);
  if (!S || !Object.hasOwn(SYS_PAR_SUBJ, S.type)) return out;
  out.push(...SYS_CS_PROBLEMS(model, view).filter(p => p.rule === 'connector-drawn'));
  const ofS = id => id != null && I.owner(id) === S, kind = id => (I.el(id) || {}).type;
  // a binding's type: its end's valueType, when it names an element of the model by label
  const named = new Map(); I.at.forEach(n => { if (SYS_PAR_HAS(n.label) && !named.has(n.label)) named.set(n.label, n); });
  const ups = n => { const seen = new Set(), go = [n]; while (go.length) { const x = go.pop(); if (seen.has(x)) continue; seen.add(x);
    I.E.forEach(e => { if (e.type === 'uml.Generalization' && e.from === x.id && I.at.has(e.to)) go.push(I.at.get(e.to)); }); } return seen; };
  const bound = new Set();
  SYS_PAR_ARR(model.edges).forEach((e, i) => { if (!SYS_PAR_OBJ(e) || e.type !== 'sysml.BindingConnector' || !['from', 'to'].some(k => ofS(SYS_PAR_PART(e, k) ?? e[k]))) return; // a binding is the view's whose end lies in the subject: through its property, else itself
    const path = `edges[${i}]`; let ok = true;
    ['from', 'to'].forEach(k => { const x = e[k], p = SYS_PAR_PART(e, k);
      bound.add(`${p ?? ''}|${x}`);
      if (p != null) {
        if (!ofS(p) || kind(p) !== 'sysml.ConstraintProperty') { ok = false; return say('error', 'binding-ends', `${path}.props.ends.${k}.part`, [e.id, p], `${e.id}'s ${k} end goes through ${q(p)}, not a constraint property of ${q(S.id)}: a binding reaches a parameter through a constraint property`); }
        if (kind(x) !== 'sysml.ConstraintParameter') { ok = false; return say('error', 'binding-ends', `${path}.${k}`, [e.id, x], `${e.id}'s ${k} end ${q(x)} is not a parameter: through ${q(p)} a binding reaches one of its parameters`); }
        const B = I.block(I.el(p));
        if (!B || I.owner(x) !== B) { ok = false; say('error', 'binding-parameter', `${path}.${k}`, [e.id, x, p], `${e.id}'s ${k} end ${q(x)} is not a parameter of ${B ? q(B.id) : JSON.stringify(SYS_PAR_PROPS(I.el(p)).valueType ?? null)}, the type of ${q(p)}`); }
      } else if (!(ofS(x) && (kind(x) === 'sysml.ValueProperty' || kind(x) === 'sysml.ConstraintParameter'))) { ok = false;
        say('error', 'binding-ends', `${path}.${k}`, [e.id, x], `${e.id}'s ${k} end ${q(x)} is not a value property or a parameter of ${q(S.id)}: a binding joins those, or a parameter through a constraint property`); } });
    const [ta, tb] = ['from', 'to'].map(k => SYS_PAR_PROPS(I.el(e[k])).valueType).map(t => (SYS_PAR_HAS(t) ? named.get(t) : null));
    if (ok && ta && tb && ta !== tb && !ups(ta).has(tb) && !ups(tb).has(ta))
      say('warning', 'binding-types', path, [e.id, e.from, e.to], `${e.id} binds ${q(e.from)} of type ${ta.label} to ${q(e.to)} of type ${tb.label}: the two ends' types are equal, or one specializes the other`); });
  const nodeAt = n => SYS_PAR_ARR(model.nodes).indexOf(n);
  SYS_PAR_SHOWN(I).filter(m => m.type === 'sysml.ConstraintProperty').forEach(m => { const B = I.block(m);
    I.params(B).forEach(x => { if (!bound.has(`${m.id}|${x.id}`)) say('warning', 'parameter-bound', `nodes[${nodeAt(B)}].members[${B.members.indexOf(x)}]`, [x.id, m.id],
      `parameter ${q(x.id)} of ${q(m.id)} has no binding: nothing gives it a value`); }); });
  return out;
}

/* ---- describe(): the frame, then what it holds in reading order, then the bindings, each by its name ---- */
function SYS_PAR_DESCRIBE(model, viewId) {
  const v = SYS_PAR_ARR(model && model.views).find(x => SYS_PAR_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const g = SYS_PAR_GEO({ model, view: v, pos: SYS_PAR_OBJ(v.layout) ? v.layout : {}, memo: {} }), lines = new Set(g.edges.map(e => e.id));
  const said = new Map([...SYS_PAR_ARR(g.families), ...g.nodes, ...g.edges].map(x => [x.id, x.aria])), ids = SYS_PAR_ARR(g.order).filter(id => said.has(id));
  return [`${v.title || v.id}: a parametric diagram of ${SYS_PAR_PLURAL(ids.filter(id => !lines.has(id)).length, 'element')} and ${SYS_PAR_PLURAL(ids.filter(id => lines.has(id)).length, 'line')}.`,
    ...ids.map(id => said.get(id) + '.')].join('\n');
}

/* ---- editing (§9): the composite type's hooks on the projection, what they return mapped back (SYS_BACK); a palette entry or
   a line of SysML's type asked as its projected one, and the kind it names kept. A binding drawn from a parameter to a value
   runs from the value, so the parameter's constraint property is ends.to.part. A member row `param name : Type` is a parameter ---- */
const SYS_PAR_AS = { 'sysml.ConstraintProperty': 'uml.Property', 'sysml.ValueProperty': 'uml.Property', 'sysml.BindingConnector': 'uml.Connector' };
const SYS_PAR_ENTRY = x => (SYS_PAR_OBJ(x) && Object.hasOwn(SYS_PAR_AS, x.type) ? { ...x, type: SYS_PAR_AS[x.type] } : x);
const SYS_PAR_MAP = (r, f) => (Array.isArray(r) ? f(r) : !SYS_PAR_OBJ(r) ? r : Array.isArray(r.commands) ? { ...r, commands: f(r.commands) } : r);
const SYS_PAR_ON = hook => (model, view, ...a) => { const P = SYS_AS_UML(model, view); return SYS_BACK(hook(P.model, P.view, ...a), model, view); };
const SYS_PAR_WORDS = [[/\bconnectors?\b/g, w => w.replace('connector', 'binding')], [/\bport\b/g, 'parameter'], [/\bpart (?=\S+ of )/g, 'property ']];
function SYS_PAR_CONNECT(model, view, from, to, at, line) {
  const box = [from, to].map(id => SYS_PAR_INDEX(model, view).el(id)).find(x => x && x.type === 'sysml.ConstraintProperty'); // a binding ends on a parameter of it, not its box
  if (box && SYS_PAR_OBJ(line) && line.type === 'sysml.BindingConnector') return { error: `A binding joins values and parameters: pick a parameter of ${SYS_PAR_NAME(box)}` };
  const turn = SYS_PAR_OBJ(line) && line.type === 'sysml.BindingConnector' && String(from).includes('->') && !String(to).includes('->');
  return SYS_PAR_ON(csConnect)(model, view, turn ? to : from, turn ? from : to, at, SYS_PAR_ENTRY(line));
}
function SYS_PAR_ADD(model, view, entry, label, at) {
  const t = SYS_PAR_OBJ(entry) ? entry.type : null, I = SYS_PAR_INDEX(model, view);
  if (t === 'sysml.ValueProperty' && I.S && I.S.type === 'sysml.ConstraintBlock') return { error: 'A constraint block holds no value property: add a parameter row (param name : Type)' };
  const r = SYS_PAR_ON(csAdd)(model, view, SYS_PAR_ENTRY(entry), label, at);
  return Object.hasOwn(SYS_PAR_PROP, t) ? SYS_PAR_MAP(r, cs => cs.map(c => (SYS_PAR_OBJ(c) && c.op === 'add' && SYS_PAR_OBJ(c.element) ? { ...c, element: { ...c.element, type: t } } : c))) : r;
}
function SYS_PAR_MEMBER(model, view, owner, id, text) {
  const param = /^param\s+/i.test(String(text)), t = String(text).replace(/^param\s+/i, 'port '), was = id == null ? null : SYS_PAR_INDEX(model, view).el(id);
  if (was && param !== (was.type === 'sysml.ConstraintParameter')) return { error: `A row keeps its member's kind: delete ${SYS_PAR_NAME(was)} and add a ${param ? 'param' : 'property'} row` };
  return SYS_PAR_ON(csMember)(model, view, owner, id, t);
}
const SYS_PAR_REMOVE = (model, view, ids, fromModel) => { const r = SYS_PAR_ON(csRemove)(model, view, ids, fromModel);
  const re = s => SYS_PAR_WORDS.reduce((x, [a, b]) => x.replace(a, b), s);
  return SYS_PAR_OBJ(r) && typeof r.say === 'string' ? { ...r, say: re(r.say) } : SYS_PAR_OBJ(r) && typeof r.error === 'string' ? { ...r, error: re(r.error) } : r; };
const SYS_PAR_MEMBERS = {
  print: m => (m.type === 'sysml.ConstraintParameter' ? `param ${m.label ?? ''}${SYS_PAR_HAS(SYS_PAR_PROPS(m).valueType) ? ' : ' + SYS_PAR_PROPS(m).valueType : ''}`
    : `${m.label ?? ''}${SYS_PAR_HAS(SYS_PAR_PROPS(m).valueType) ? ' : ' + SYS_PAR_PROPS(m).valueType : ''}${SYS_PAR_HAS(SYS_PAR_PROPS(m).multiplicity) ? ` [${SYS_PAR_PROPS(m).multiplicity}]` : ''}`),
  // what edits.member does not read is the block definition view's
  add: () => ({ error: 'A member here is a constraint or value property (name : Type) or a parameter (param name : Type)' }),
  edit: () => ({ error: 'This view edits constraint and value properties and parameters: the block definition view edits the rest' }),
  holds: n => Object.hasOwn(SYS_PAR_SUBJ, n.type),
};

/* ---- the PDF (§13): a word for each element, its rows, a binding's ends as its line text ---- */
function SYS_PAR_WORD(model, id) {
  const x = SYS_PAR_INDEX(model, null).el(id); if (!x) return null;
  return SYS_PAR_PROP[x.type] || SYS_PAR_SUBJ[x.type] || (x.type === 'sysml.ConstraintParameter' ? 'Parameter' : null);
}
function SYS_PAR_ROWS(model, view, id) {
  const I = SYS_PAR_INDEX(model, view), x = I.el(id); if (!x) return null;
  if (x.type === 'sysml.ConstraintProperty') { const e = SYS_PAR_EXPR(I.block(x)); return [SYS_PAR_TEXT(x), ...(e ? [e] : [])]; }
  if (x.type === 'sysml.ValueProperty') return [SYS_PAR_TEXT(x)];
  if (x.type === 'sysml.ConstraintParameter') return SYS_PAR_HAS(SYS_PAR_PROPS(x).valueType) ? [String(SYS_PAR_PROPS(x).valueType)] : [];
  if (x.type === 'sysml.ConstraintBlock' && x !== I.S) { const e = SYS_PAR_EXPR(x); return [...(e ? [e] : []), ...I.params(x).map(SYS_PAR_MEMBERS.print)]; }
  if (x !== I.S) return null;
  // the subject: what it shows, then its bindings (their ends are members, which the Lines table leaves out)
  const ofS = k => k != null && I.owner(k) === x;
  return [...SYS_PAR_ARR(x.members).filter(m => SYS_PAR_OBJ(m) && (Object.hasOwn(SYS_PAR_PROP, m.type) || m.type === 'sysml.ConstraintParameter')).map(SYS_PAR_MEMBERS.print),
    ...SYS_PAR_ARR(model.edges).filter(e => SYS_PAR_OBJ(e) && e.type === 'sysml.BindingConnector' && ['from', 'to'].some(k => ofS(SYS_PAR_PART(e, k) ?? e[k]))).map(e => SYS_PAR_LINE_SAY(I, e))];
}
// "ecoRange to range of eco"
function SYS_PAR_LINE_TEXT(model, view, id) {
  const e = SYS_PAR_ARR(model && model.edges).find(x => SYS_PAR_OBJ(x) && x.id === id); if (!e || e.type !== 'sysml.BindingConnector') return null;
  const I = SYS_PAR_INDEX(model, view), at = k => { const x = I.el(e[k]), p = SYS_PAR_PART(e, k); return `${x ? SYS_PAR_NAME(x) : String(e[k])}${p != null ? ' of ' + SYS_PAR_NAME(I.el(p) || { id: p }) : ''}`; };
  return `${at('from')} to ${at('to')}`;
}

const SYS_PAR_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const SYS_PAR_FIELDS = [{ key: 'valueType', label: 'Type', kind: 'text' }, { key: 'multiplicity', label: 'Multiplicity', kind: 'text' }, SYS_PAR_STEREO];
const SYS_PAR_TYPE = registerDiagramType('sysml.parametric', {
  title: 'parametric diagram',
  elements: [['sysml.ConstraintProperty', 'Constraint property'], ['sysml.ValueProperty', 'Value property'], ['uml.Comment', 'Comment']].map(([type, label]) => ({ type, label })),
  lines: [['sysml.BindingConnector', 'Binding'], ['uml.CommentLink', 'Comment link']].map(([type, label]) => ({ type, label })),
  props: {
    'sysml.ConstraintProperty': SYS_PAR_FIELDS, 'sysml.ValueProperty': SYS_PAR_FIELDS,
    'sysml.ConstraintParameter': [{ key: 'valueType', label: 'Type', kind: 'text' }, SYS_PAR_STEREO],
    'sysml.ConstraintBlock': [{ key: 'constraint', label: 'Constraint', kind: 'text' }, SYS_PAR_STEREO],
    'sysml.BindingConnector': [SYS_PAR_STEREO], 'sysml.Block': [SYS_PAR_STEREO], 'uml.Comment': [SYS_PAR_STEREO], 'uml.CommentLink': [],
  },
  refs: { 'sysml.BindingConnector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } }, // a deleted constraint property takes its bindings
  layout: Object.assign(SYS_PAR_GEO, { rank: false }), // the composite type ranks the properties itself: the host passes the pins alone
  member: SYS_PAR_MEMBERS,
  validate: SYS_PAR_PROBLEMS,
  rules: SYS_PAR_RULES,
  describe: SYS_PAR_DESCRIBE,
  word: SYS_PAR_WORD,
  rows: SYS_PAR_ROWS,
  text: SYS_PAR_LINE_TEXT,
  edits: { connect: SYS_PAR_CONNECT, moveTo: SYS_PAR_ON(csMoveTo), add: SYS_PAR_ADD, remove: SYS_PAR_REMOVE, rename: SYS_PAR_ON(csRename), member: SYS_PAR_MEMBER },
});

export { SYS_PAR_TYPE, SYS_PAR_GEO, SYS_PAR_PROBLEMS };
