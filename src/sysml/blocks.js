import { registerDiagramType } from '../core/registry.js';
import { CLASS_DEF, RULES, classProblems, drawnLines, lineLabel, lineName, parseMember, printMember, typeGeo } from '../uml/class.js';
import { OWNER_RULES, holdsLine, ownerChoices, ownerProblems, ownersOn, readingOrder } from '../uml/owners.js';
import { SYS_FRAME, SYS_TABLE } from './sysml.js';

/* ---------- the block definition diagram, sysml.block-definition (work package M3.3, notes/milestone-3.md §7) ----------
   Blocks, interface blocks, constraint blocks and value types drawn by the classifier with «block», «interfaceBlock»,
   «constraintBlock» or «valueType» over the name and SysML's named compartments (parts, references, values, constraints,
   operations, ports, flow properties, parameters; a value type's unit and quantity kind), each titled; packages as boxes and
   comments, as the class type draws them; the class type's lines. Every node in the frame (§5): a box of the layout, which is
   the package subject's own box when the view names one. Laid out by the class type's look (typeGeo, src/uml/class.js) with
   this file's node builder, down by default, repair and reroute off. Top-level names carry BD_ (one scope in
   lib/umlimator-all.js). Only lib/umlimator-all.js holds this file. */

const BD_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), BD_ARR = x => (Array.isArray(x) ? x : []);
const BD_HAS = x => x != null && x !== '', BD_PROPS = x => (BD_OBJ(x && x.props) ? x.props : {});
const BD_CLS = ['sysml.Block', 'sysml.InterfaceBlock', 'sysml.ConstraintBlock', 'sysml.ValueType']; // the classifiers drawn here
const BD_WORD = t => String(t).split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'sysml.InterfaceBlock': "Interface block"
const BD_PRIM = ['Real', 'Integer', 'Boolean', 'String'];

/* ---- the compartments (§7.1): [name, one, member type], each owner's own in its order, then any other it holds ---- */
const BD_COMPS = [['parts', 'part', 'sysml.PartProperty'], ['references', 'reference', 'sysml.ReferenceProperty'], ['values', 'value', 'sysml.ValueProperty'],
  ['constraints', 'constraint', 'sysml.ConstraintProperty'], ['operations', 'operation', 'uml.Operation'], ['ports', 'port', 'sysml.Port'],
  ['flow properties', 'flow property', 'sysml.FlowProperty'], ['parameters', 'parameter', 'sysml.ConstraintParameter']];
const BD_ORDER = { 'sysml.Block': [0, 1, 2, 3, 4, 5, 6], 'sysml.InterfaceBlock': [6, 5, 4], 'sysml.ConstraintBlock': [3, 7], 'sysml.ValueType': [] };
const BD_KIND = { proxy: '«proxy» ', full: '«full» ' };
// a member's row as drawn: the classifier prints `name: Type [mult] = default`; a port's kind and a flow property's direction go before its name
const bdRow = m => { const p = BD_PROPS(m);
  return m.type === 'sysml.Port' && Object.hasOwn(BD_KIND, p.kind) ? { ...m, label: BD_KIND[p.kind] + (m.label ?? '') }
    : m.type === 'sysml.FlowProperty' && BD_HAS(p.direction) ? { ...m, label: `${p.direction} ${m.label ?? ''}` } : m; };
// a node's compartments, the empty ones left out: a value type's `unit = Wh` and `quantityKind = energy` (quantity), a constraint
// block's expression in braces over its constraint properties
function bdComps(n) {
  const p = BD_PROPS(n), ms = BD_ARR(n.members).filter(BD_OBJ), own = BD_ORDER[n.type] || [];
  const out = [...own, ...BD_COMPS.map((_, i) => i).filter(i => !own.includes(i))].map(i => ({ name: BD_COMPS[i][0], title: true, members: ms.filter(m => m.type === BD_COMPS[i][2]).map(bdRow) }));
  if (n.type === 'sysml.ConstraintBlock' && BD_HAS(p.constraint)) out[0].members.unshift({ type: 'uml.Property', label: `{${p.constraint}}` });
  const q = n.type === 'sysml.ValueType' ? ['unit', 'quantityKind'].filter(k => BD_HAS(p[k])).map(k => ({ type: 'uml.Property', label: `${k} = ${p[k]}` })) : [];
  return [{ name: 'quantity', title: true, members: q }, ...out].filter(c => c.members.length);
}
// its accessible name (§13): "Block EBike, 4 parts, 1 reference, 1 constraint"; "Value type Energy, unit = Wh, quantityKind =
// energy"; "Constraint block RangeEquation, {range = energy / consumption}, 3 parameters". Stored stereotypes but the implied
// one in brackets
function bdName(n, drawn) {
  const imp = SYS_TABLE[n.type].st, st = BD_ARR(BD_PROPS(n).stereotypes).filter(BD_HAS).map(String).filter(s => s !== imp);
  const says = bdComps(n).flatMap(c => { const k = c.members.filter(m => m.id != null).length, one = (BD_COMPS.find(x => x[0] === c.name) || [])[1];
    return [...c.members.filter(m => m.id == null).map(m => m.label), ...(k ? [`${k} ${k === 1 ? one : c.name}`] : [])]; });
  return [`${BD_WORD(n.type)} ${drawn}${st.length ? ` (${st.join(', ')})` : ''}`, ...says].join(', ');
}
// the class look's node, made SysML's: the keyword first, the compartments, the name (ariaOwn: the classifier's own counts members)
function bdNode(d, n, model, pic) {
  if (!BD_CLS.includes(n.type)) return d;
  const imp = SYS_TABLE[n.type].st, aria = bdName(n, pic.name(n.id));
  return { ...d, stereotypes: [imp, ...d.stereotypes.filter(s => s !== imp)], compartments: bdComps(n), aria, ariaOwn: aria };
}

/* ---- the view (§5.1, §7.1): its frame, a box holding every node; a package subject is the frame, so it is no box of its own
   and what it owns is laid out in the frame. { v: the view without the subject, pic, frame, boxes: the frame, then the
   packages' boxes, the outermost in the frame } ---- */
function bdPic(model, view) {
  const f0 = SYS_FRAME(model, view, []), v = { ...view, nodeIds: BD_ARR(view.nodeIds).filter(id => id !== f0.id) }, pic = ownersOn(model, v);
  const frame = { ...f0, nodeIds: pic.holds(null).filter(id => !pic.open.has(id)) };
  return { v, pic, frame, boxes: [frame, ...pic.boxes.map(b => (b.parent == null ? { ...b, parent: frame.id } : b))] };
}
const BD_LOOK = { members: true, own: null, word: 'block definition diagram', node: bdNode };
function bdGeo({ model, view, pos, memo }) {
  const { v, pic, frame, boxes } = bdPic(model, view);
  const g = typeGeo({ ...BD_LOOK, dg: { repair: false, reroute: false, containers: boxes } })({ model, view: { ...v, direction: v.direction || 'down' }, pos, memo });
  return { ...g, order: [frame.id, ...readingOrder(pic), ...g.edges.map(e => e.id)] }; // a new object: what typeGeo returned is not edited
}

/* ---- validators (§7.3). Each problem: { level, rule, path, message, ids } ---- */
const BD_RULES = {
  'part-type': 'a part or reference property\'s type, when it names an element, names a block',
  'value-type': 'a value property\'s type, when it names an element, names a value type (Real, Integer, Boolean and String are fine)',
  'constraint-type': 'a constraint property\'s type names a constraint block',
  'flow-direction': 'a flow property\'s direction is in, out or inout',
  'port-kind': 'a port\'s kind is proxy, full or none; a proxy port is typed by an interface block, a full port is not',
  'member-kinds': 'a constraint block holds only parameters and constraint properties; an interface block only flow properties, ports that are not full and operations; a parameter is held by a constraint block; a flow property by no value type',
  'general-kinds': 'a generalization with a block, interface block, constraint block or value type at an end joins two of one kind',
  'part-agrees': 'a composite association\'s part end and the part property of its role have one type and one multiplicity',
  'part-unlisted': 'a composite association\'s part end names, by its role, a part property of the whole',
};
// what an owner may hold (member-kinds, and a member row typed in the panel)
const BD_HOLD = { 'sysml.ConstraintBlock': m => ['sysml.ConstraintParameter', 'sysml.ConstraintProperty'].includes(m.type),
  'sysml.InterfaceBlock': m => m.type === 'sysml.FlowProperty' || m.type === 'uml.Operation' || (m.type === 'sysml.Port' && BD_PROPS(m).kind !== 'full') };
const bdHolds = (owner, m) => (Object.hasOwn(BD_HOLD, owner) ? BD_HOLD[owner](m) : !(m.type === 'sysml.ConstraintParameter' || (m.type === 'sysml.FlowProperty' && owner === 'sysml.ValueType')));
const BD_MWORD = { 'sysml.PartProperty': 'part', 'sysml.ReferenceProperty': 'reference', 'sysml.ValueProperty': 'value', 'sysml.ConstraintProperty': 'constraint property',
  'sysml.FlowProperty': 'flow property', 'sysml.ConstraintParameter': 'parameter', 'sysml.Port': 'port', 'uml.Operation': 'operation' };
const bdMWord = m => (m.type === 'sysml.Port' && Object.hasOwn(BD_KIND, BD_PROPS(m).kind) ? BD_PROPS(m).kind + ' port' : BD_MWORD[m.type] || BD_WORD(m.type).toLowerCase());
// the types of the nodes a type name names by label, its ~ (conjugation) left off; none: undefined
function bdLabels(model) {
  const by = new Map(); BD_ARR(model && model.nodes).forEach(n => { if (BD_OBJ(n) && n.label != null) { const k = String(n.label); if (!by.has(k)) by.set(k, []); by.get(k).push(n.type); } });
  return t => (BD_HAS(t) ? by.get(String(t).replace(/^~\s*/, '')) : undefined);
}
function bdProblems(model) {
  const out = [], nodes = BD_ARR(model && model.nodes), at = new Map(), named = bdLabels(model);
  nodes.forEach(n => { if (BD_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const q = x => JSON.stringify(String(x.label ?? x.id)), say = (rule, path, ids, msg, level = 'error') => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const is = ts => (ts ? ts.map(t => BD_WORD(t).toLowerCase()).join(' and ') : 'nothing');
  nodes.forEach((n, i) => { if (!BD_OBJ(n)) return;
    BD_ARR(n.members).forEach((m, j) => { if (!BD_OBJ(m)) return;
      const path = `nodes[${i}].members[${j}]`, p = BD_PROPS(m), T = named(p.valueType), of = `${q(n)}.${String(m.label ?? m.id)}`, ids = [n.id, m.id], typed = `typed by ${JSON.stringify(String(p.valueType))}`;
      if ((m.type === 'sysml.PartProperty' || m.type === 'sysml.ReferenceProperty') && T && !T.includes('sysml.Block')) say('part-type', path, ids, `${bdMWord(m)} ${of} is ${typed}, a ${is(T)}, not a block`, 'warning');
      if (m.type === 'sysml.ValueProperty' && T && !T.includes('sysml.ValueType') && !BD_PRIM.includes(String(p.valueType))) say('value-type', path, ids, `value ${of} is ${typed}, a ${is(T)}, not a value type`, 'warning');
      if (m.type === 'sysml.ConstraintProperty' && !(T && T.includes('sysml.ConstraintBlock'))) say('constraint-type', path, ids, `constraint property ${of} is ${BD_HAS(p.valueType) ? `${typed}, ${T ? 'a ' + is(T) : 'which names nothing'}` : 'typed by nothing'}, not a constraint block`);
      if (m.type === 'sysml.FlowProperty' && !['in', 'out', 'inout'].includes(p.direction)) say('flow-direction', path, ids, `flow property ${of} has direction ${JSON.stringify(p.direction ?? null)}, not in, out or inout`);
      if (m.type === 'sysml.Port') { const ib = T && T.includes('sysml.InterfaceBlock');
        if (BD_HAS(p.kind) && !Object.hasOwn(BD_KIND, p.kind)) say('port-kind', path, ids, `port ${of} has kind ${JSON.stringify(p.kind)}, not proxy or full`);
        else if (p.kind === 'proxy' && !ib) say('port-kind', path, ids, `proxy port ${of} is ${BD_HAS(p.valueType) ? typed + ', not an interface block' : 'typed by nothing: a proxy port is typed by an interface block'}`);
        else if (p.kind === 'full' && ib) say('port-kind', path, ids, `full port ${of} is ${typed}, an interface block`); }
      if ((String(m.type).startsWith('sysml.') || BD_CLS.includes(n.type)) && !bdHolds(n.type, m)) say('member-kinds', path, ids, `${BD_WORD(n.type).toLowerCase()} ${q(n)} holds ${bdMWord(m)} ${q(m)}, which it may not`); }); });
  BD_ARR(model && model.edges).forEach((e, i) => { if (!BD_OBJ(e)) return; const path = `edges[${i}]`, a = at.get(e.from), b = at.get(e.to);
    if (e.type === 'uml.Generalization' && a && b && (BD_CLS.includes(a.type) || BD_CLS.includes(b.type)) && a.type !== b.type)
      say('general-kinds', path, [e.id, a.id, b.id], `${BD_WORD(a.type).toLowerCase()} ${q(a)} specializes ${BD_WORD(b.type).toLowerCase()} ${q(b)} (${e.id})`);
    if (e.type !== 'uml.Association') return;
    const E = BD_OBJ(BD_PROPS(e).ends) ? BD_PROPS(e).ends : {}, end = w => (BD_OBJ(E[w]) ? E[w] : {});
    [['from', 'to'], ['to', 'from']].forEach(([w, f]) => { const whole = at.get(e[w]), far = at.get(e[f]), role = end(f).role;
      if (end(w).aggregation !== 'composite' || !whole || !BD_CLS.includes(whole.type)) return;
      const part = BD_HAS(role) ? BD_ARR(whole.members).find(m => BD_OBJ(m) && m.type === 'sysml.PartProperty' && m.label === role) : null;
      if (!part) return say('part-unlisted', `${path}.props.ends.${f}`, [e.id, whole.id], `${e.id}'s part end ${BD_HAS(role) ? `${JSON.stringify(role)} names no part of ${q(whole)}` : `has no role: it names no part of ${q(whole)}`}, so no internal block view of it shows the part`, 'warning');
      const pp = BD_PROPS(part), ty = far ? String(far.label ?? far.id) : null, pm = String(pp.multiplicity ?? '1'), em = String(end(f).multiplicity ?? '1');
      if ((ty != null && pp.valueType !== ty) || pm !== em) say('part-agrees', `${path}.props.ends.${f}`, [e.id, part.id],
        `${e.id}'s part end (${ty ?? '?'} [${em}]) and part ${q(whole)}.${role} (${pp.valueType ?? '?'} [${pm}]) differ`, 'warning'); }); });
  return out;
}

/* ---- describe(), the PDF's rows and words, a line's text (§13) ---- */
function bdSaid(model, pic, id) {
  const b = pic.boxes.find(x => x.id === id); if (b) return b.aria;
  const x = pic.at.get(id), nm = pic.name(id);
  return x.type === 'uml.Comment' ? 'Comment: ' + String(x.label ?? x.id) : BD_CLS.includes(x.type) ? bdName(x, nm) : `${BD_WORD(x.type || 'uml.Class')} ${nm}${x.type === 'uml.Package' ? ' (closed)' : ''}`;
}
function bdDescribe(model, viewId) {
  const view = BD_ARR(model && model.views).find(x => BD_OBJ(x) && x.id === viewId); if (!view) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const { v, pic, frame } = bdPic(model, view), { at, lines: all } = drawnLines(model, v, null), lines = all.filter(({ from, to }) => !holdsLine(pic, from, to)), ids = readingOrder(pic);
  const pl = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
  return [`${view.title || view.id}: a block definition diagram of ${pl(ids.length, 'element')} and ${pl(lines.length, 'line')}.`, frame.aria + '.',
    ...ids.map(id => bdSaid(model, pic, id) + '.'), ...lines.map(({ e }) => lineName(e, at, pic) + '.')].join('\n');
}
const bdNodeOf = (model, id) => BD_ARR(model && model.nodes).find(n => BD_OBJ(n) && n.id === id);
// a node's rows: each compartment's, as drawn, after its name ("parts: battery: Battery [1]")
const bdRows = n => bdComps(n).flatMap(c => c.members.map(m => `${c.name}: ${m.id == null ? m.label : printMember({ ...m, type: m.type === 'uml.Operation' ? m.type : 'uml.Property' })}`));
// a line's text: its label, then each end's role and multiplicity
function bdText(model, view, id) {
  const e = BD_ARR(model && model.edges).find(x => BD_OBJ(x) && x.id === id); if (!e) return null;
  const E = BD_OBJ(BD_PROPS(e).ends) ? BD_PROPS(e).ends : {}, end = w => { const x = BD_OBJ(E[w]) ? E[w] : {}; return [x.role, BD_HAS(x.multiplicity) ? `[${x.multiplicity}]` : ''].filter(BD_HAS).join(' '); };
  return [lineLabel(e), ...(e.type === 'uml.Association' ? ['from', 'to'].map(end) : [])].filter(BD_HAS).join(' · ') || null;
}

/* ---- members as text (§7.4): a keyword picks the kind (part, ref, value, constraint, port, proxy port, full port, param, in,
   out, inout), then the class type's member syntax; with none, the type picks it (a block's name a part, a constraint block's
   a constraint property, else a value; brackets an operation). Printed back with the keyword: print(parse(x)) is stable ---- */
const BD_KEYS = [['proxy port', 'sysml.Port', { kind: 'proxy' }], ['full port', 'sysml.Port', { kind: 'full' }], ['port', 'sysml.Port'], ['part', 'sysml.PartProperty'],
  ['ref', 'sysml.ReferenceProperty'], ['value', 'sysml.ValueProperty'], ['constraint', 'sysml.ConstraintProperty'], ['param', 'sysml.ConstraintParameter'],
  ['inout', 'sysml.FlowProperty', { direction: 'inout' }], ['in', 'sysml.FlowProperty', { direction: 'in' }], ['out', 'sysml.FlowProperty', { direction: 'out' }]]
  .map(([w, type, props = {}]) => ({ re: new RegExp(`^${w.replace(' ', '\\s+')}\\s+`), w, type, props }));
const BD_WORDS = { 'sysml.PartProperty': 'part', 'sysml.ReferenceProperty': 'ref', 'sysml.ValueProperty': 'value', 'sysml.ConstraintProperty': 'constraint', 'sysml.ConstraintParameter': 'param' };
// text, owner (the node, or none) and model (or none: no name picks a kind) -> { type, label, props } or { error }
function bdParse(text, owner, model) {
  const s = String(text ?? '').trim(), k = BD_KEYS.find(x => x.re.test(s));
  const r = parseMember(k ? s.replace(k.re, '') : s, k ? 'uml.Property' : undefined); if (r.error) return r;
  const T = model ? bdLabels(model)(r.props.valueType) || [] : [];
  const type = k ? k.type : r.type === 'uml.Operation' ? r.type : T.includes('sysml.Block') ? 'sysml.PartProperty' : T.includes('sysml.ConstraintBlock') ? 'sysml.ConstraintProperty' : 'sysml.ValueProperty';
  const x = { type, label: r.label, props: { ...r.props, ...(k ? k.props : {}) } };
  return owner && !bdHolds(owner.type, x) ? { error: `member-kinds: ${BD_WORD(owner.type).toLowerCase()} ${String(owner.label ?? owner.id)} holds no ${bdMWord(x)}` } : x;
}
function bdPrint(m) {
  if (!BD_OBJ(m)) return ''; if (m.type === 'uml.Operation' || !String(m.type).startsWith('sysml.')) return printMember(m);
  const { kind, direction, ...p } = BD_PROPS(m);
  const w = m.type === 'sysml.Port' ? (Object.hasOwn(BD_KIND, kind) ? kind + ' port' : 'port') : m.type === 'sysml.FlowProperty' ? (['in', 'out'].includes(direction) ? direction : 'inout') : BD_WORDS[m.type] || 'value';
  return `${w} ${printMember({ type: 'uml.Property', label: m.label, props: p })}`;
}
const BD_SYNTAX = ['visibility', 'valueType', 'multiplicity', 'default', 'isStatic', 'isDerived', 'isAbstract', 'parameters', 'returnType', 'kind', 'direction'];
// a member row edited: one transaction, its kind too when the keyword changed it; props the syntax does not write are kept
function bdEdit(model, owner, m, text) {
  const r = bdParse(text, owner, model); if (r.error) return r;
  const keep = Object.fromEntries(Object.entries(BD_PROPS(m)).filter(([k]) => !BD_SYNTAX.includes(k)));
  return { commands: [...(r.type !== m.type ? [{ op: 'set', id: m.id, path: 'type', value: r.type }] : []), { op: 'set', id: m.id, path: 'label', value: r.label }, { op: 'set', id: m.id, path: 'props', value: { ...keep, ...r.props } }] };
}
const bdFresh = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  if (!used.has(base)) return base; let k = 2; while (used.has(base + k)) k++; return base + k; };
// the panel's member rows (edits.member): a row of a block, interface block, constraint block or value type, read with the model
function bdMember(model, view, ownerId, id, text) {
  const o = bdNodeOf(model, ownerId); if (!o || !BD_CLS.includes(o.type)) return null;
  if (id != null) { const m = BD_ARR(o.members).find(x => BD_OBJ(x) && x.id === id); return m ? bdEdit(model, o, m, text) : null; }
  const r = bdParse(text, o, model); if (r.error) return r;
  return [{ op: 'add', element: { id: bdFresh(model, `${o.id}.${r.label}`), type: r.type, label: r.label, ...(Object.keys(r.props).length ? { props: r.props } : {}) }, owner: o.id }];
}
/* connect (§7.4): a generalization joins two of one kind (general-kinds), a comment link runs from a comment; a part association
   from a block adds the part property it draws, named after the part's type, and the line naming it by its role (§7.2), one
   transaction. Else the default */
function bdConnect(model, view, from, to, at, line) {
  const a = bdNodeOf(model, from), b = bdNodeOf(model, to), t = BD_OBJ(line) ? line.type : null; if (!a || !b) return null;
  if (t === 'uml.Generalization' && (BD_CLS.includes(a.type) || BD_CLS.includes(b.type)) && a.type !== b.type) return { error: `A generalization joins two of one kind: ${BD_WORD(a.type).toLowerCase()} and ${BD_WORD(b.type).toLowerCase()} differ` };
  if (t === 'uml.CommentLink' && a.type !== 'uml.Comment') return { error: 'A comment link runs from a comment' };
  const E = BD_OBJ(BD_PROPS(line).ends) ? BD_PROPS(line).ends : {};
  if (t !== 'uml.Association' || !BD_OBJ(E.from) || E.from.aggregation !== 'composite' || !BD_CLS.includes(a.type)) return null;
  if (!bdHolds(a.type, { type: 'sysml.PartProperty' })) return { error: `A ${BD_WORD(a.type).toLowerCase()} holds no part` };
  const ty = String(b.label ?? b.id), base = (ty[0] || 'p').toLowerCase() + ty.slice(1).replace(/[^\p{L}\p{N}_$]/gu, ''), taken = new Set(BD_ARR(a.members).map(m => BD_OBJ(m) && m.label));
  let role = base, k = 2; while (taken.has(role)) role = base + k++;
  return [{ op: 'add', element: { id: bdFresh(model, `${a.id}.${role}`), type: 'sysml.PartProperty', label: role, props: { valueType: ty, multiplicity: '1' } }, owner: a.id },
    { op: 'add', element: { id: bdFresh(model, 'association1'), type: 'uml.Association', from, to, props: { ends: { from: { aggregation: 'composite' }, to: { role, multiplicity: '1' } } } }, view: view.id }];
}

/* ---- the type ---- */
const BD_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const BD_PROP_FIELDS = [{ key: 'multiplicity', label: 'Multiplicity', kind: 'text' }, BD_STEREO];
const BD_TYPE = registerDiagramType('sysml.block-definition', {
  title: 'block definition diagram',
  elements: [['sysml.Block', 'Block'], ['sysml.InterfaceBlock', 'Interface block'], ['sysml.ConstraintBlock', 'Constraint block'], ['sysml.ValueType', 'Value type'], ['uml.Package', 'Package'], ['uml.Comment', 'Comment']]
    .map(([type, label]) => ({ type, label })),
  lines: [{ type: 'uml.Association', label: 'Part association', props: { ends: { from: { aggregation: 'composite' } } } }, { type: 'uml.Association', label: 'Reference association' },
    { type: 'uml.Generalization', label: 'Generalization' }, { type: 'uml.Dependency', label: 'Dependency' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { ...CLASS_DEF.props, 'sysml.Block': [BD_STEREO], 'sysml.InterfaceBlock': [BD_STEREO], 'sysml.ConstraintBlock': [{ key: 'constraint', label: 'Constraint', kind: 'text' }, BD_STEREO],
    'sysml.ValueType': [{ key: 'unit', label: 'Unit', kind: 'text' }, { key: 'quantityKind', label: 'Quantity kind', kind: 'text' }, BD_STEREO],
    'sysml.PartProperty': BD_PROP_FIELDS, 'sysml.ReferenceProperty': BD_PROP_FIELDS, 'sysml.ValueProperty': [{ key: 'default', label: 'Default', kind: 'text' }, ...BD_PROP_FIELDS],
    'sysml.Port': [{ key: 'kind', label: 'Kind', kind: 'enum', options: ['proxy', 'full'] }, BD_STEREO], 'sysml.FlowProperty': [{ key: 'direction', label: 'Direction', kind: 'enum', options: ['in', 'out', 'inout'] }, BD_STEREO] },
  // the general above its specializations, as in the class type
  rankFlip: e => e.type === 'uml.Generalization',
  layout: bdGeo,
  boxes: (model, view) => bdPic(model, view).boxes,
  // a SysML classifier is owned by a package as a class is
  owners: (model, x) => ownerChoices(model, BD_OBJ(x) && BD_CLS.includes(x.type) ? { ...x, type: 'uml.Class' } : x),
  member: { print: bdPrint, add: (text, owner) => bdParse(text, owner, null), edit: (m, text) => bdEdit(null, null, m, text), holds: n => BD_CLS.includes(n.type) },
  validate: (model, view) => [...classProblems(model), ...bdProblems(model), ...ownerProblems(model, view, drawnLines(model, view, null).lines)],
  rules: { ...RULES, ...OWNER_RULES, ...BD_RULES, 'member-kinds': `${RULES['member-kinds']}; ${BD_RULES['member-kinds']}` },
  describe: bdDescribe,
  word: (model, id) => { const x = bdNodeOf(model, id); return x && BD_CLS.includes(x.type) ? BD_WORD(x.type) : null; },
  rows: (model, view, id) => { const x = bdNodeOf(model, id); return x && BD_CLS.includes(x.type) ? bdRows(x) : null; },
  text: bdText,
  edits: { connect: bdConnect, member: bdMember },
});

export { BD_TYPE, BD_RULES, bdGeo, bdProblems, bdDescribe, bdParse, bdPrint, bdConnect, bdMember };
