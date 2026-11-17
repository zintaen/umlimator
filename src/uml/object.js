import { jsonText } from '../core/model.js';
import { registerDiagramType } from '../core/registry.js';
import { esc } from '../core/text.js';
import { SHAPE } from '../draw/shapes.js';
import { labelW } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import { RULES, classProblems, drawnLines, lineIn, lineItem, lineVerb, printMember } from './class.js';
import { OWN_BOXES, OWNER_RULES, holdsLine, ownerChoices, ownerProblems, ownersOn, placeTabs, readingOrder, viewLines } from './owners.js';

/* ---------- the object diagram, uml.object (work package 2.3, notes/stage-2.md §9) ----------
   Instance specifications drawn with the classifier shape, the head underlined, `name : Classifier` (or `: Classifier`
   for an anonymous one, or `name` with no classifier), and one compartment of slots, `feature = value`; links drawn as an
   association with no end marks, their name (or their association) on the line and each end's role by its end; comments.
   A package that owns a shown instance is a box, and names are qualified, as in the class view (src/uml/owners.js). A view
   with no `edges` list draws links and comment links only. Ships in lib/umlimator-all.js only. */

const OB_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), OB_ARR = x => (Array.isArray(x) ? x : []);
const OB_HAS = x => x != null && x !== '';
const OB_OWN = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined);
const OB_PROPS = x => (OB_OBJ(x.props) ? x.props : {});
const OBJECT_LINES = ['uml.Link', 'uml.CommentLink'];
const OB_CLASSIFIERS = ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType'];

/* ---- the slot micro-syntax (§9.2, risks.md E3): `feature = value`, or `feature`. The feature is a name as parseMember
   reads one, the value the rest of the line, trimmed; print(parse(x)) is stable ---- */
const SLOT_NAME = /^[\p{L}_$][\p{L}\p{M}\p{N}_$]*/u;
function parseSlot(text) {
  const s = String(text ?? '').trim(), fail = why => ({ error: `"${s}" is not a slot: ${why}` }), nm = SLOT_NAME.exec(s);
  if (!nm) return fail(s ? 'a feature\'s name comes first' : 'it is empty');
  const rest = s.slice(nm[0].length).trim();
  if (!rest) return { type: 'uml.Slot', label: nm[0], props: {} };
  if (rest[0] !== '=') return fail(`"${rest}" is left over: write feature = value`);
  const value = rest.slice(1).trim();
  return value ? { type: 'uml.Slot', label: nm[0], props: { value } } : fail('a value follows =');
}
const printSlot = m => String((m && m.label) ?? '') + (OB_HAS(OB_PROPS(m || {}).value) ? ' = ' + OB_PROPS(m).value : '');
// a slot edited as text: one transaction; props the syntax does not write are kept
function slotEdit(m, text) {
  const r = parseSlot(text); if (r.error) return r;
  const { value: _, ...keep } = OB_PROPS(m);
  return { commands: [{ op: 'set', id: m.id, path: 'label', value: r.label }, { op: 'set', id: m.id, path: 'props', value: { ...keep, ...r.props } }] };
}

/* ---- names ---- */
const slotsOf = n => OB_ARR(n.members).filter(m => OB_OBJ(m) && m.type === 'uml.Slot');
// an instance's head: "order1042 : Order", ": Order" (anonymous), "order1042" (no classifier); name: its drawn name (owners.js)
const headOf = (n, name) => { const c = OB_PROPS(n).classifier, named = OB_HAS(n.label) || !OB_HAS(c);
  return [named ? name : '', OB_HAS(c) ? ': ' + c : ''].filter(Boolean).join(' '); };
const obStereo = x => OB_ARR(OB_PROPS(x).stereotypes).filter(OB_HAS).map(String);
/* a classifier the view shows (the outline's Show adds any model node) is drawn and named as the class view draws it: its name
   not underlined, its keyword over it, its compartments; "Class Order, 1 attribute, 0 operations".
   ponytail: mirrors class.js compartmentsOf/nodeName/IMPLIED, which it does not export; share them when class.js is next opened */
const OB_IMPLIED = { 'uml.Interface': 'interface', 'uml.Enumeration': 'enumeration', 'uml.DataType': 'dataType', 'uml.PrimitiveType': 'primitive' };
const OB_KINDS = { attributes: 'uml.Property', operations: 'uml.Operation', literals: 'uml.EnumerationLiteral' };
// an instance specification, or an element of no UML kind, as before; any other uml.* element is drawn as its kind (audit 14)
// a type that is not a string (["uml.Class"], 42) is no UML kind: an instance, as validate() says it is drawn (audit 28)
const isInstance = n => n.type === 'uml.InstanceSpecification' || typeof n.type !== 'string' || !n.type.startsWith('uml.');
function classifierBoxes(n) {
  const c = name => ({ name, members: OB_ARR(n.members).filter(m => OB_OBJ(m) && m.type === OB_KINDS[name]) });
  return n.type === 'uml.Enumeration' ? [c('literals'), ...[c('attributes'), c('operations')].filter(x => x.members.length)] : [c('attributes'), c('operations')];
}
const obWord = t => String(t ?? '').split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase());
// an element's accessible name, as the classifier shape writes it: "Instance specification order1042 : Order, 2 slots"
function obNodeName(n, pic) {
  if (n.type === 'uml.Comment') return 'Comment: ' + String(n.label ?? n.id);
  const st = obStereo(n), why = st.length ? ` (${st.join(', ')})` : '';
  if (OWN_BOXES.includes(n.type)) { const b = pic.boxes.find(x => x.id === n.id); return b ? b.aria : `${obWord(n.type)} ${pic.name(n.id)} (${[...st, 'closed'].join(', ')})`; }
  if (!isInstance(n)) { const w = [...st, ...(OB_PROPS(n).isAbstract ? ['abstract'] : [])];
    return [`${obWord(n.type)} ${pic.name(n.id)}${w.length ? ` (${w.join(', ')})` : ''}`, ...classifierBoxes(n).map(c => { const k = c.members.length; return `${k} ${c.name.replace(/s$/, '')}${k === 1 ? '' : 's'}`; })].join(', '); }
  const k = slotsOf(n).length;
  return `Instance specification ${headOf(n, pic.name(n.id))}${why}${k ? `, ${k} slot${k === 1 ? '' : 's'}` : ''}`;
}
const linkText = e => [obStereo(e).map(t => `«${t}»`).join(' '), OB_HAS(e.label) ? e.label : OB_PROPS(e).association].filter(OB_HAS).join(' ');
const roleOf = (e, w) => { const E = OB_PROPS(e).ends, r = OB_OBJ(E) && OB_OBJ(E[w]) ? E[w].role : null; return OB_HAS(r) ? String(r) : null; };

/* ---- the view laid out (layoutTyped) ---- */
// a kind the view lists that it does not draw as its own (audit 26): "Line", its arrow with its head, as every structural
// view's legend has it (class.js lineItem, audit 27)
const OB_LEGEND = [['uml.Link', false, 'Link', 'joins two instances, an instance of an association'], ['uml.CommentLink', true, 'Comment link', 'what a comment is about']];
const obLegend = edges => [...OB_LEGEND.filter(([t]) => edges.some(e => e.type === t)).map(([, dashed, name, says]) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4"><path d="M2 8H26"${dashed ? ' stroke-dasharray="3 2"' : ''}/></g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`),
  ...(edges.some(e => e.type !== 'uml.Link' && e.type !== 'uml.CommentLink') ? [lineItem()] : [])];
function objectGeo({ model, view, pos, memo }) {
  const { at, pic, lines } = drawnLines(model, view, OBJECT_LINES), present = OB_OBJ(view.present) ? view.present : {}, head = id => (at.get(id).x.type === 'uml.InstanceSpecification' ? headOf(at.get(id).x, pic.name(id)) : pic.name(id));
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = at.get(id).x, pr = OB_OBJ(OB_OWN(present, id)) ? present[id] : {}, slots = slotsOf(n);
    const shape = n.type === 'uml.Comment' ? { shape: 'note' } : OWN_BOXES.includes(n.type) ? { shape: 'package', stereotypes: [...(n.type === 'uml.Profile' ? ['profile'] : []), ...obStereo(n)] }
      : !isInstance(n) ? { shape: 'classifier', stereotypes: [...(OB_OWN(OB_IMPLIED, n.type) ? [OB_IMPLIED[n.type]] : []), ...obStereo(n)], abstract: !!OB_PROPS(n).isAbstract, compartments: classifierBoxes(n),
        collapsed: OB_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}) }
      // memberText draws props.default after " = ": a slot passed as { label: feature, props: { default: value } } (§9.1)
      : { shape: 'classifier', underline: true, stereotypes: obStereo(n), compartments: slots.length ? [{ name: 'slots', members: slots.map(m => ({ id: m.id, type: 'uml.Slot', label: m.label, props: { default: OB_PROPS(m).value } })) }] : [],
        collapsed: OB_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}) };
    const d = { id, label: n.type === 'uml.Comment' ? String(n.label ?? n.id) : head(id), type: n.type || 'uml.InstanceSpecification', kind: 'file', ...shape, aria: obNodeName(n, pic), col: (OB_OWN(pos, id) || [0, 0])[0], row: (OB_OWN(pos, id) || [0, 0])[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.filter(({ from, to }) => !holdsLine(pic, from, to)).map(({ e, from, to }) => { const said = linkText(e), r = w => roleOf(e, w), end = w => (r(w) ? ` (${r(w)})` : '');
    // a kind the view lists that it does not draw (the outline's Show): an arrow named "Line", as the class view's (audit 14)
    const look = e.type === 'uml.CommentLink' ? { from: 'none', to: 'none', dashed: true } : e.type === 'uml.Link' ? { from: 'none', to: 'none', labels: { from: { role: r('from') }, to: { role: r('to') } } } : { from: 'none', to: 'arrow' };
    return { id: e.id, _id: e.id, type: e.type, from, to, label: said || undefined, end: look, aria: `${e.type === 'uml.CommentLink' ? 'Comment link' : e.type === 'uml.Link' ? 'Link' : 'Line'} from ${head(from)}${end('from')} to ${head(to)}${end('to')}${said ? ': ' + said : ''}`,
      ...(OB_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  // as the class view (class.js typeGeo): laid out right with boxes, the columns spread by the widest label
  const down = view.direction === 'down', wide = !down && pic.boxes.length ? Math.max(0, ...edges.filter(e => e.label).map(labelW)) : 0;
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: down ? 'down' : 'right', gap: 96 + (wide ? Math.ceil(wide) + 40 : 0), rgap: 56 }, memo);
  g.legend = obLegend(g.edges); g.order = [...readingOrder(pic), ...edges.map(e => e.id)]; // Tab: the elements, then the lines
  return placeTabs(g);
}

/* ---- validators (§9.3). Each problem: { level, rule, path, message, ids } ---- */
const OBJECT_RULES = {
  'slot-kinds': 'an instance holds slots only; a slot belongs to an instance',
  'link-ends': 'a link joins two instance specifications',
  'instance-of': 'an instance\'s slots name attributes of its classifier, when the classifier is in the model',
};
function objectProblems(model, view) {
  const out = [], nodes = OB_ARR(model.nodes), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const at = new Map(); nodes.forEach(n => { if (OB_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const q = id => JSON.stringify(String((at.get(id) || {}).label ?? id)), isInst = id => at.has(id) && isInstance(at.get(id)); // as drawn: an element of no UML kind is an instance (audit 28)
  // the model's classifiers by name and by qualified name; a classifier's attributes, with its generals' (a cycle is walked once)
  const full = ownersOn(model, null).full, named = new Map(), add = (k, id) => named.set(k, [...(named.get(k) || []), id]);
  at.forEach(n => { if (OB_CLASSIFIERS.includes(n.type)) { add(String(n.label ?? n.id), n.id); const f = full(n.id); if (f !== String(n.label ?? n.id)) add(f, n.id); } });
  const up = new Map(); OB_ARR(model.edges).forEach(e => { if (OB_OBJ(e) && e.type === 'uml.Generalization') up.set(e.from, [...(up.get(e.from) || []), e.to]); });
  const attrs = id => { const seen = new Set(), names = new Set(); // a stack, not recursion: a chain of any length
    for (const q = [id]; q.length;) { const c = q.pop(); if (seen.has(c) || !at.has(c)) continue; seen.add(c);
      OB_ARR(at.get(c).members).forEach(m => { if (OB_OBJ(m) && m.type === 'uml.Property') names.add(String(m.label)); }); q.push(...(up.get(c) || [])); }
    return names; };
  nodes.forEach((n, i) => { if (!OB_OBJ(n)) return; const ms = OB_ARR(n.members);
    if (n.type === 'uml.Slot') say('error', 'slot-kinds', `nodes[${i}]`, [n.id], `slot ${q(n.id)} is a node: a slot belongs to an instance`);
    // an instance specification holds slots only; a slot is in one, or in an element of no UML kind, drawn as one with its slots (audit 28)
    ms.forEach((m, j) => { if (!OB_OBJ(m)) return; const inst = n.type === 'uml.InstanceSpecification';
      if (inst ? m.type !== 'uml.Slot' : m.type === 'uml.Slot' && !isInstance(n)) say('error', 'slot-kinds', `nodes[${i}].members[${j}]`, [n.id, m.id], inst ? `${q(n.id)} holds ${m.id}, a ${String(m.type).split('.').pop()}: an instance holds slots only` : `slot "${m.label ?? m.id}" is in ${q(n.id)}, which is not an instance`); });
    const c = OB_PROPS(n).classifier, hits = isInstance(n) && OB_HAS(c) ? [...new Set(named.get(String(c)) || [])] : [];
    if (hits.length !== 1) return; // no classifier, or one the model does not hold once: types are text (M8)
    const has = attrs(hits[0]);
    ms.forEach((m, j) => { if (OB_OBJ(m) && m.type === 'uml.Slot' && !has.has(String(m.label))) say('warning', 'instance-of', `nodes[${i}].members[${j}]`, [n.id, m.id, hits[0]], `${q(n.id)} is an instance of ${q(hits[0])}, which has no attribute "${m.label}" (${m.id})`); }); });
  viewLines(model, view).forEach(([e, path]) => { if (OB_OBJ(e) && e.type === 'uml.Link' && !(isInst(e.from) && isInst(e.to)))
    say('error', 'link-ends', path, [e.id, e.from, e.to], `${e.id} runs from ${q(e.from)} to ${q(e.to)}: a link joins two instance specifications`); });
  return out;
}

/* ---- describe(): the view in words, each box then what it holds: "Instance specification order1042 : Order, 2 slots:
   status = placed, total = 34.00 EUR; linked to line1 : OrderLine (lines)" ---- */
function objectDescribe(model, viewId) {
  const v = OB_ARR(model && model.views).find(x => OB_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const { at, pic, lines: all } = drawnLines(model, v, OBJECT_LINES), lines = all.filter(({ from, to }) => !holdsLine(pic, from, to));
  const nm = id => { const x = at.get(id).x; return x.type === 'uml.Comment' ? String(x.label ?? x.id) : x.type === 'uml.InstanceSpecification' ? headOf(x, pic.name(id)) : pic.name(id); };
  const k = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
  const out = [`${v.title || v.id}: an object diagram of ${k(pic.ids.length, 'element')} and ${k(lines.length, 'line')}.`];
  readingOrder(pic).forEach(id => { const x = at.get(id).x, said = [], slots = x.type === 'uml.InstanceSpecification' ? slotsOf(x).map(printSlot) : [];
    lines.forEach(({ e, from: f, to: t }) => {
      if (e.type === 'uml.CommentLink') { const l = linkText(e); if (f === id) said.push(`about ${nm(t)}${l ? ` ("${l}")` : ''}`); return; } // its drawn text too, as the class view says it (audit 22)
      if (f !== id && (t !== id || e.type !== 'uml.Link' && e.type !== 'uml.Association')) return; const far = f === id ? 'to' : 'from', r = roleOf(e, far), l = linkText(e);
      // a link is "linked to"; a kind the view lists that it does not draw as its own (the outline's Show), by the class view's
      // verb ("depends on", "a kind of"), else a line, as its accessible name says it (audit 26)
      const verb = e.type === 'uml.Link' ? 'linked to' : e.type === 'uml.Association' ? 'associated with' : lineVerb(e) || 'a line to';
      said.push(`${verb} ${nm(far === 'to' ? t : f)}${r ? ` (${r})` : ''}${l ? ` ("${l}")` : ''}`); });
    out.push(obNodeName(x, pic) + (slots.length ? ': ' + slots.join(', ') : '') + (said.length ? '; ' + said.join('; ') : '') + '.'); });
  return out.join('\n');
}

/* rename (F2): an instance's name alone, so a drawn ` : Classifier` (an anonymous one opens with `: Classifier`) is taken off;
   a link's label alone, so its drawn «stereotypes» are, and its association it draws with no label. Anything else: null */
function obRename(model, view, id, text) {
  const x = OB_ARR(model.nodes).find(y => OB_OBJ(y) && y.id === id) || lineIn(model, view, id), c = x && OB_PROPS(x).classifier;
  let t = String(text ?? '').trim();
  if (x && x.type === 'uml.InstanceSpecification') { if (OB_HAS(c) && (t === ': ' + c || t.endsWith(' : ' + c))) t = t.slice(0, -String(c).length - 2).trim(); }
  else if (x && x.type === 'uml.Link') { const pre = linkText({ ...x, label: undefined }), st = obStereo(x).map(s => `«${s}»`).join(' ');
    if (pre && t === pre) t = ''; else if (st && t.startsWith(st + ' ')) t = t.slice(st.length).trim(); }
  else return null;
  return t === String(x.label ?? '') ? [] : [{ op: 'set', id, path: 'label', value: t || undefined }];
}

/* ---- the type ---- */
const OB_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const obRole = w => ({ key: `ends.${w}.role`, path: ['ends', w, 'role'], label: `${w === 'from' ? 'From' : 'To'} role`, kind: 'text' });
const OBJECT_TYPE = registerDiagramType('uml.object', {
  title: 'object diagram',
  elements: [{ type: 'uml.InstanceSpecification', label: 'Instance' }, { type: 'uml.Comment', label: 'Comment' }],
  lines: [{ type: 'uml.Link', label: 'Link' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { 'uml.InstanceSpecification': [{ key: 'classifier', label: 'Classifier', kind: 'text' }, OB_STEREO], 'uml.Package': [OB_STEREO],
    'uml.Link': [{ key: 'association', label: 'Association', kind: 'text' }, obRole('from'), obRole('to'), OB_STEREO], 'uml.CommentLink': [] },
  layout: objectGeo,
  boxes: (model, view) => ownersOn(model, view).boxes,
  owners: ownerChoices,
  // a slot is a member row, `feature = value` (§9.2); a comment and a package hold none
  member: { print: m => (m.type === 'uml.Slot' ? printSlot(m) : printMember(m)), edit: slotEdit, add: parseSlot, holds: n => n.type === 'uml.InstanceSpecification' },
  validate: (model, view) => [...classProblems(model).filter(p => p.rule === 'member-names'), ...objectProblems(model, view), ...ownerProblems(model, view, drawnLines(model, view, OBJECT_LINES).lines)],
  rules: { 'member-names': RULES['member-names'], ...OBJECT_RULES, ...OWNER_RULES }, // of the class rules, member-names only: two slots for one feature (§9.3)
  describe: objectDescribe,
  // the PDF's Kind: an element of no UML kind is drawn and named an instance specification (audit 28); null: the type's word
  word: (model, id) => { const x = OB_ARR(model && model.nodes).find(n => OB_OBJ(n) && n.id === id); return x && isInstance(x) ? 'Instance specification' : null; },
  // a link's text as drawn, for the PDF's Lines table: its «stereotypes» and its name, else its association's (audit 21)
  text: (model, view, id) => { const e = lineIn(model, view, id); return e && e.type === 'uml.Link' ? linkText(e) || null : null; },
  edits: { rename: obRename },
});

export { OBJECT_TYPE, OBJECT_RULES, obRename, parseSlot, printSlot, slotEdit, objectProblems, objectDescribe };
