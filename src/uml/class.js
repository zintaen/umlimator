import { jsonText, labelOr, elName, labelProblem, propTextProblems, usedIds } from '../core/model.js';
import { aWord, kindWord, registerDiagramType } from '../core/registry.js';
import { brLines, esc, fit, textW, widest, wrapLines } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import '../typed/draw.js'; // SHAPE.classifier, which the note's outline and ports take
import { labelW } from '../layout/layered.js';
import { layoutTyped } from '../typed/layout.js';
import { OWN_BOXES, OWNER_RULES, defOwner, holdsLine, ownerChoices, ownerProblems, ownersOn, placeTabs, readingOrder } from './owners.js';
import { snKindWord } from './structure.js';

/* ---------- the class diagram, uml.class (work package 1.9) ----------
   The subset of proposal.md §8.2: class, interface, enumeration with literals, data type, primitive type; attributes and
   operations in UML's text form; stereotypes as text; packages as owners, a package holding what it owns that the view
   shows as a box, and names qualified by the owners it does not show (2.2, notes/stage-2.md §4 to §7, src/uml/owners.js);
   association with both ends, generalization, interface realization, dependency; comments. A view whose `diagram` is
   'uml.class' is laid out by layoutTyped (src/typed/layout.js) and drawn with the classifier shape and the line-end table
   (src/typed/draw.js). Ships in lib/umlimator-all.js only (stage 1 note §2.5). */

const UML_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), UML_ARR = x => (Array.isArray(x) ? x : []);
const UML_HAS = x => x != null && x !== '';
const UML_OWN = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined); // a lookup by a model's id or type: 'constructor' is not Object's (risks.md M3)

/* ---- the member micro-syntax (risks.md E3, E4) ----
   A property:  [visibility] [{static}] [/]name [: Type] [[multiplicity]] [= default]      + {static} /total: Money [1] = 0
   An operation: [visibility] [{static}] [{abstract}] name([direction] name: Type, …) [: Type]   + place(at: Date, in qty: Int): Order
   A literal:   name
   A name is letters of any script, digits, _ and $; a type may end in [] (String[]). Visibility is + - # ~. A multiplicity is n, *, n..m or n..*, its text kept as written. parseMember() returns
   { type, label, props } or { error }; printMember() writes a member back, and print(parse(x)) is stable. */
const MEMBER_SIGN = { public: '+', private: '-', protected: '#', package: '~' }, SIGN_VIS = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const MEMBER_NAME = /^[\p{L}_$][\p{L}\p{M}\p{N}_$]*/u; // a name in any script: Größe, 名前
const SYNTAX_KEYS = ['stereotypes', 'visibility', 'valueType', 'multiplicity', 'default', 'isStatic', 'isDerived', 'isAbstract', 'parameters', 'returnType'];

/* a multiplicity's bounds: '1', '*', '0..1', '1..*', '2..5' → { lower, upper } (upper Infinity for *); null for anything else */
function multBounds(t) {
  const m = /^\s*(\d+|\*)\s*(?:\.\.\s*(\d+|\*)\s*)?$/.exec(String(t ?? ''));
  if (!m || (m[2] != null && m[1] === '*')) return null;
  const n = x => (x === '*' ? Infinity : +x);
  return m[2] == null ? (m[1] === '*' ? { lower: 0, upper: Infinity } : { lower: +m[1], upper: +m[1] }) : { lower: +m[1], upper: n(m[2]) };
}

// the multiplicity rule's problem for text t drawn as [t] (what: whose, `"Order".lines`), or null: a malformed multiplicity or one
// whose lower bound is above its upper, an error, as the class view and every view drawing a classifier's rows say it (audit 45)
function multProblem(t, path, ids, what) { const b = multBounds(t), say = msg => ({ level: 'error', rule: 'multiplicity', path, ids: ids.filter(x => x != null), message: `multiplicity: ${what}: [${t}] ${msg}` });
  return !b ? say('is not a multiplicity (1, *, 0..1, 1..*)') : b.lower > b.upper ? say('has its lower bound above its upper') : null; }
// s split at each `sep` outside brackets of any kind: "a: Map<K, V>, b" → ["a: Map<K, V>", " b"]
function splitTop(s, sep) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if ('<([{'.includes(c)) depth++; else if ('>)]}'.includes(c)) { if (!(c === '>' && (s[i - 1] === '=' || s[i - 1] === '-'))) depth = Math.max(0, depth - 1); } // '=>', '->' close nothing
    else if (c === sep && depth === 0) { out.push(s.slice(from, i)); from = i + 1; } }
  out.push(s.slice(from));
  return out;
}

/* text: a member's line; kind: the member type wanted ('uml.Property', 'uml.Operation', 'uml.EnumerationLiteral'), or
   none to read it from the text (an operation has brackets). Hand-written and linear (risks.md R2) */
function parseMember(text, kind) {
  let s = String(text ?? '').trim();
  const fail = why => ({ error: `"${String(text ?? '').trim()}" is not a member: ${why}` });
  if (!s) return fail('it is empty');
  const props = {}; // its «stereotypes» first, as printMember writes them (audit 16)
  for (let m; (m = /^«([^«»]*)»\s*/.exec(s));) { const t = m[1].trim(); if (t) (props.stereotypes ||= []).push(t); s = s.slice(m[0].length); }
  if (kind === 'uml.EnumerationLiteral') return MEMBER_NAME.test(s) && MEMBER_NAME.exec(s)[0] === s ? { type: kind, label: s, props } : fail('a literal is a name');
  if (SIGN_VIS[s[0]]) { props.visibility = SIGN_VIS[s[0]]; s = s.slice(1).trim(); }
  for (let m; (m = /^\{\s*(static|abstract)\s*\}\s*/.exec(s));) { props[m[1] === 'static' ? 'isStatic' : 'isAbstract'] = true; s = s.slice(m[0].length); }
  if (s[0] === '{') return fail('a modifier is {static} or {abstract}');
  if (s[0] === '/') { props.isDerived = true; s = s.slice(1).trim(); }
  const nm = MEMBER_NAME.exec(s); if (!nm) return fail('a name comes first, after the visibility (+ - # ~)');
  const label = nm[0]; s = s.slice(label.length).trim();
  const op = kind === 'uml.Operation' || (kind == null && s[0] === '(');
  if (op) {
    if (s[0] !== '(') return fail('an operation\'s name is followed by its parameters in brackets');
    if (props.isDerived) return fail('an operation is not derived (/)');
    let depth = 0, end = -1;
    for (let i = 0; i < s.length && end < 0; i++) { if (s[i] === '(') depth++; else if (s[i] === ')' && --depth === 0) end = i; }
    if (end < 0) return fail('a bracket is not closed');
    const inner = s.slice(1, end).trim(), rest = s.slice(end + 1).trim(), params = [];
    for (const part of inner ? splitTop(inner, ',') : []) {
      let p = part.trim(); const a = {}, d = /^(in|out|inout|return)\s+/.exec(p);
      if (d) { a.direction = d[1]; p = p.slice(d[0].length); }
      const pn = MEMBER_NAME.exec(p); if (!pn) return fail(`parameter "${part.trim()}" has no name`);
      a.name = pn[0]; p = p.slice(pn[0].length).trim();
      if (p) { if (p[0] !== ':' || !p.slice(1).trim()) return fail(`parameter "${part.trim()}" is name: Type`); a.valueType = p.slice(1).trim(); }
      params.push({ name: a.name, ...(a.valueType != null ? { valueType: a.valueType } : {}), ...(a.direction ? { direction: a.direction } : {}) });
    }
    if (params.length) props.parameters = params;
    if (rest) { if (rest[0] !== ':' || !rest.slice(1).trim()) return fail('after the parameters comes : ReturnType'); props.returnType = rest.slice(1).trim(); }
    return { type: 'uml.Operation', label, props };
  }
  if (props.isAbstract) return fail('a property is not {abstract}');
  if (s[0] === ':') { // the type: up to a multiplicity or a default outside brackets
    let i = 1, depth = 0;
    for (; i < s.length; i++) { const c = s[i]; if ((c === '=' || c === '-') && s[i + 1] === '>') i++; else if (c === '<' || c === '(') depth++; else if (c === '>' || c === ')') depth = Math.max(0, depth - 1); else if (depth === 0 && c === '=') break;
      else if (depth === 0 && c === '[') { let j = i, d = 0; for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && !--d) break; }
        const after = s.slice(j + 1).trim(); if (j >= s.length || (multBounds(s.slice(i + 1, j)) && (!after || after[0] === '='))) break; i = j; } } // String[], list[str]: a bracket that is not a closing multiplicity is the type's, as the Mermaid reader's mcMult
    const t = s.slice(1, i).trim(); if (!t) return fail('a type follows the colon');
    props.valueType = t; s = s.slice(i).trim();
  }
  if (s[0] === '[') {
    const end = s.indexOf(']'); if (end < 0) return fail('a multiplicity is closed by ]');
    const mult = s.slice(1, end).trim(); if (!multBounds(mult)) return fail(`[${mult}] is not a multiplicity (1, *, 0..1, 1..*)`);
    props.multiplicity = mult; s = s.slice(end + 1).trim();
  }
  if (s[0] === '=') { const d = s.slice(1).trim(); if (!d) return fail('a default follows ='); props.default = d; s = ''; }
  if (s) return fail(`"${s}" is left over: write name: Type [multiplicity] = default`);
  return { type: 'uml.Property', label, props };
}

// an operation's parameters, each drawn in its row as `direction name: Type` (printMember): each of those not text, said at its
// own path as propTextProblems says a member's type (audit 41), here and by SysML's block rows
const paramTextProblems = (m, at) => (UML_OBJ(m) && m.type === 'uml.Operation' && UML_OBJ(m.props) ? UML_ARR(m.props.parameters) : [])
  .flatMap((a, k) => (UML_OBJ(a) ? ['direction', 'name', 'valueType'].map(key => labelProblem(a, `${at}.props.parameters[${k}]`, key)).filter(Boolean) : []));
/* a member back in its text form: the inverse of parseMember */
function printMember(m) {
  const p = UML_OBJ(m && m.props) ? m.props : {}, label = String((m && m.label) ?? ''), st = UML_ARR(p.stereotypes).filter(UML_HAS).map(t => `«${t}» `).join('');
  if (m && m.type === 'uml.EnumerationLiteral') return st + label;
  const head = st + (Object.hasOwn(MEMBER_SIGN, p.visibility) ? MEMBER_SIGN[p.visibility] + ' ' : '') + (p.isStatic ? '{static} ' : '') + (p.isAbstract ? '{abstract} ' : '');
  if (m && m.type === 'uml.Operation') return head + label + '(' + UML_ARR(p.parameters).filter(UML_OBJ).map(a => (UML_HAS(a.direction) ? a.direction + ' ' : '') + (a.name ?? '') + (UML_HAS(a.valueType) ? ': ' + a.valueType : '')).join(', ') + ')' + (UML_HAS(p.returnType) ? ': ' + p.returnType : '');
  return head + (p.isDerived ? '/' : '') + label + (UML_HAS(p.valueType) ? ': ' + p.valueType : '') + (UML_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : '') + (UML_HAS(p.default) ? ' = ' + p.default : '');
}

// a member as its box draws it, for the PDF's Members: printMember's text with a parameter's in, UML's default, left out, as
// the classifier draws it (typed/draw.js memberText, audit 64)
const rowMember = m => printMember(UML_OBJ(m) && m.type === 'uml.Operation' && UML_OBJ(m.props) && UML_ARR(m.props.parameters).some(a => UML_OBJ(a) && a.direction === 'in')
  ? { ...m, props: { ...m.props, parameters: m.props.parameters.map(a => (UML_OBJ(a) && a.direction === 'in' ? { ...a, direction: undefined } : a)) } } : m);

/* a member edited as text: the commands that set it, one transaction; { error } when the text does not parse, and then
   nothing is applied (E3). Props the syntax does not write (stereotypes, a host's own) are kept */
function memberEdit(m, text, owner) {
  const r = parseMember(text, m.type === 'uml.Property' || m.type === 'uml.Operation' || m.type === 'uml.EnumerationLiteral' ? m.type : undefined);
  if (r.error) return r;
  const no = memberClash(owner, m, r); if (no) return no;
  const keep = Object.fromEntries(Object.entries(UML_OBJ(m.props) ? m.props : {}).filter(([k]) => !SYNTAX_KEYS.includes(k)));
  return { commands: [{ op: 'set', id: m.id, path: 'label', value: r.label }, { op: 'set', id: m.id, path: 'props', value: { ...keep, ...r.props } }] };
}

/* a line typed into an owner's "New member": on an enumeration a bare name is a literal, anything else a property or an operation */
function memberAdd(text, owner) {
  // a bare name after its «stereotypes», as printMember writes a literal (audit 17)
  const t = String(text ?? '').trim(), b = t.replace(/^(?:«[^«»]*»\s*)+/, ''), nm = MEMBER_NAME.exec(b);
  const r = parseMember(t, owner && owner.type === 'uml.Enumeration' && nm && nm[0] === b ? 'uml.EnumerationLiteral' : undefined);
  return r.error ? r : memberClash(owner, {}, r) || r;
}

/* a member added, or edited, to a name another member of its owner holds: refused in member-names' words, before it is applied,
   as the SysML block rows refuse one (SYS_CLASH, audits 37 to 39). Judged by member-names' own key (memberKey): an operation
   by its parameters' types too, so an overload is no clash. m: the member as it was, {} for one being added; r: as parsed.
   A key the edit keeps is no rename (a model that already holds two is validate()'s to say). Null: no clash (audit 40) */
const memberKey = (type, label, P) => (type === 'uml.Operation' ? `${label}(${UML_ARR(UML_OBJ(P) ? P.parameters : null).map(a => (UML_OBJ(a) ? a.valueType ?? '' : '')).join(',')})` : `${label}`);
function memberClash(owner, m, r, why = RULES['member-names']) {
  if (!UML_OBJ(owner) || !UML_OBJ(m) || !UML_OBJ(r) || !UML_HAS(r.label)) return null;
  const k = memberKey(r.type, r.label, r.props); if (UML_HAS(m.label) && k === memberKey(m.type, m.label, m.props)) return null;
  const o = UML_ARR(owner.members).find(x => UML_OBJ(x) && x !== m && x.id !== m.id && UML_HAS(x.label) && memberKey(x.type, x.label, x.props) === k);
  return o ? { error: `member-names: ${JSON.stringify(elName(owner))} has a member named ${JSON.stringify(String(r.label))} already (${o.id}): ${why}` } : null;
}

/* ---- the vocabulary (model.md, uml.class) ---- */
const CLASSIFIERS = ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.Stereotype']; // a stereotype specializes a stereotype (notes/stage-6.md §4.2)
const IMPLIED = { 'uml.Interface': 'interface', 'uml.Enumeration': 'enumeration', 'uml.DataType': 'dataType', 'uml.PrimitiveType': 'primitive', 'uml.Stereotype': 'stereotype', 'uml.MetaclassReference': 'metaclass', 'uml.Profile': 'profile' }; // shown «…» over the name
const STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const endFields = w => [['role', 'text'], ['multiplicity', 'text'], ['aggregation', 'enum', ['none', 'shared', 'composite']], ['navigable', 'bool']]
  .map(([k, kind, options]) => ({ key: `ends.${w}.${k}`, path: ['ends', w, k], label: `${w === 'from' ? 'From' : 'To'} ${k}`, kind, ...(options ? { options } : {}) }));
const CLASS_DEF = {
  title: 'class diagram',
  elements: [['Class', 'Class'], ['Interface', 'Interface'], ['Enumeration', 'Enumeration'], ['DataType', 'Data type'], ['PrimitiveType', 'Primitive type'], ['Package', 'Package'], ['Comment', 'Comment']]
    .map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['Association', 'Association'], ['Generalization', 'Generalization'], ['InterfaceRealization', 'Realization'], ['Dependency', 'Dependency'], ['CommentLink', 'Comment link']]
    .map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: {
    'uml.Class': [{ key: 'isAbstract', label: 'Abstract', kind: 'bool' }, STEREO],
    'uml.Interface': [STEREO], 'uml.Enumeration': [STEREO], 'uml.DataType': [STEREO], 'uml.PrimitiveType': [STEREO], 'uml.Package': [STEREO],
    'uml.Association': [...endFields('from'), ...endFields('to'), STEREO],
    'uml.Dependency': [STEREO], 'uml.Generalization': [], 'uml.InterfaceRealization': [], 'uml.CommentLink': [],
  },
};

/* ---- drawing input: the classifier's (src/typed/draw.js draws it) and the note's ---- */
const COMPARTMENTS = { attributes: 'uml.Property', operations: 'uml.Operation', literals: 'uml.EnumerationLiteral' };
function compartmentsOf(n) { // a class's attributes and operations; an enumeration's literals, then the others it has
  const c = name => ({ name, members: UML_ARR(n.members).filter(m => UML_OBJ(m) && m.type === COMPARTMENTS[name]) });
  if (OWN_BOXES.includes(n.type) || n.type === 'uml.Comment' || n.type === 'uml.MetaclassReference') return []; // a package or a profile; a metaclass has no compartment (notes/stage-6.md §4.1)
  return n.type === 'uml.Enumeration' ? [c('literals'), ...[c('attributes'), c('operations')].filter(x => x.members.length)] : [c('attributes'), c('operations')];
}

// a comment: a note with a folded corner, its text wrapped at 220 px; a line break the author put in (a Mermaid <br>, F2's
// Shift+Enter) starts a new line there, and an empty part is kept as an empty line, so a blank line between paragraphs stays
// (audit 26)
const NOTE = { pad: 8, px: 11, lh: 15, max: 220, fold: 10 };
function noteLines(t) {
  const out = [], parts = brLines(String(t ?? '').trim());
  parts.forEach(part => { const ls = wrapLines(part, NOTE.px, NOTE.max); out.push(...(ls.length ? ls.map(l => l[0]) : [''])); }); // breaks as mmSize's (audit 58)
  return out;
}
SHAPE.note = {
  size: n => { const ls = noteLines(n.label); return { w: Math.ceil(Math.max(60, widest(ls, l => Math.min(NOTE.max, textW(l, NOTE.px)))) + 2 * NOTE.pad + NOTE.fold), h: ls.length * NOTE.lh + 2 * NOTE.pad }; },
  out: SHAPE.classifier.out, face: n => [n.y, n.y + n.h], inset: () => 0, ports: SHAPE.classifier.ports,
  draw(n, c, f) {
    const { x, y, w, h } = n, k = NOTE.fold, ls = noteLines(n.label), max = w - 2 * NOTE.pad - k;
    return `<g class="node note" data-id="${esc(n.id)}" data-shape="note" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Comment: ' + (n.label ?? ''))}">`
      + `<path d="M${x} ${y}H${x + w - k}L${x + w} ${y + k}V${y + h}H${x}Z" class="n-mask"/><path d="M${x} ${y}H${x + w - k}L${x + w} ${y + k}V${y + h}H${x}Z" class="n-body" fill="${f}" stroke="${c}"/>`
      + `<path d="M${x + w - k} ${y}V${y + k}H${x + w}" class="n-det" stroke="${c}"/>`
      + `<g class="c-head" data-band="${r2(y)} ${r2(y + h)}">${ls.map((l, i) => `<text x="${r2(x + NOTE.pad)}" y="${r2(y + NOTE.pad + i * NOTE.lh + 11)}" class="c-row" fill="var(--um-text)" style="font:400 ${NOTE.px}px var(--um-sans)">${esc(fit(l, NOTE.px, max))}</text>`).join('')}</g></g>`;
  },
};

/* ---- lines: how each kind is drawn (src/typed/draw.js's ENDS), and its words ---- */
// an association class's tie (below, typeGeo): a layout line of its own, no model element, so of no uml.* type (the profile's metaclass table names those)
const TIE = 'association-class:', TIE_T = 'tie.AssociationClass';
const endOfLine = (e, w) => { const at = ((UML_OBJ(e.props) && UML_OBJ(e.props.ends) ? e.props.ends : {})[w]) || {};
  return at.aggregation === 'composite' ? 'filled-diamond' : at.aggregation === 'shared' ? 'diamond' : at.navigable ? 'open' : 'none'; };
const endsOf = e => (UML_OBJ(e.props) && UML_OBJ(e.props.ends) ? e.props.ends : {});
function lineLook(e) {
  switch (e.type) {
    case 'uml.Generalization': return { from: 'none', to: 'triangle' };
    case 'uml.InterfaceRealization': case 'uml.Realization': case 'uml.ComponentRealization': return { from: 'none', to: 'triangle', dashed: true };
    case 'uml.Dependency': case 'uml.Usage': case 'uml.Abstraction': return { from: 'none', to: 'open', dashed: true };
    case 'uml.Connector': return { from: 'none', to: 'none' };
    case 'uml.CommentLink': case TIE_T: return { from: 'none', to: 'none', dashed: true }; // TIE_T: an association class's tie
    case 'uml.PackageImport': case 'uml.PackageMerge': case 'uml.ProfileApplication': return { from: 'none', to: 'open', dashed: true };
    case 'uml.Extension': return { from: 'none', to: 'filled-triangle' }; // to the metaclass (notes/stage-6.md §4.1)
    case 'uml.Association': { const E = endsOf(e), lab = w => ({ role: (E[w] || {}).role, mult: (E[w] || {}).multiplicity });
      return { from: endOfLine(e, 'from'), to: endOfLine(e, 'to'), labels: { from: lab('from'), to: lab('to') } }; }
    default: return { from: 'none', to: 'arrow' };
  }
}
const stereoText = x => UML_ARR(UML_OBJ(x.props) ? x.props.stereotypes : null).filter(UML_HAS).map(t => `«${t}»`).join(' ');
// a package import says «import», or «access» when private; a merge «merge» (notes/stage-2.md §10.2)
// a profile application «apply», a required extension {required} (notes/stage-6.md §4.1)
const keyword = e => e.type === 'uml.PackageImport' ? ((UML_OBJ(e.props) ? e.props.visibility : null) === 'private' ? '«access»' : '«import»') : e.type === 'uml.PackageMerge' ? '«merge»'
  : e.type === 'uml.ProfileApplication' ? '«apply»' : e.type === 'uml.Usage' ? '«use»' : e.type === 'uml.Abstraction' ? '«abstraction»' : e.type === 'uml.Extension' && UML_OBJ(e.props) && e.props.isRequired === true ? '{required}' : '';
const lineLabel = e => [keyword(e), stereoText(e), e.label].filter(UML_HAS).join(' ');
/* rename (F2) on a line: the field holds its drawn text, `drawn(e, model, view)`, the keyword and «stereotypes» before the
   label; that prefix is the line's kind and props, so it is taken off and the rest set as the label. Anything else: null.
   Shared by the class, package, profile, component and deployment types, each with its own drawn text */
// a line by id: the model's, else one the view owns (an object in view.edges, audit 15)
const lineIn = (model, view, id) => [...UML_ARR(model && model.edges), ...UML_ARR(view && view.edges)].find(x => UML_OBJ(x) && x.id === id);
const lineRename = drawn => (model, view, id, text) => {
  const e = lineIn(model, view, id); if (!e) return null;
  const pre = drawn({ ...e, label: undefined }, model, view); let t = String(text ?? '').trim();
  if (pre && (t === pre || t.startsWith(pre + ' '))) t = t.slice(pre.length).trim();
  return t === String(e.label ?? '') ? [] : [{ op: 'set', id, path: 'label', value: t || undefined }];
};
const LINE_WORDS = { 'uml.Association': ['Association', 'a link between instances'], 'uml.Generalization': ['Generalization', 'is a kind of the one it points to'],
  'uml.InterfaceRealization': ['Realization', 'implements the interface it points to'], 'uml.Dependency': ['Dependency', 'uses the one it points to'],
  'uml.CommentLink': ['Comment link', 'what a comment is about'], 'uml.PackageImport': ['Package import', 'sees the names of the one it points to: «import», or «access» kept private'],
  'uml.PackageMerge': ['Package merge', 'takes in what the one it points to holds'], 'uml.Extension': ['Extension', 'the stereotype extends the metaclass it points to'],
  'uml.ProfileApplication': ['Profile application', '«apply»: the package may use the profile\'s stereotypes'],
  'uml.Usage': ['Usage', '«use»: needs the one it points to'], 'uml.Realization': ['Realization', 'realizes the one it points to'],
  'uml.ComponentRealization': ['Component realization', 'realizes the component it points to'], 'uml.Abstraction': ['Abstraction', '«abstraction»: a more abstract view of the one it points to'],
  'uml.Connector': ['Connector', 'a link between parts'], [TIE_T]: ['Association class', 'the class that details the association it meets'] };
const LEGEND_ENDS = { // small copies of src/typed/draw.js's ends, pointing right with the tip at x 26
  none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>', triangle: '<path d="M16 3L26 8L16 13Z" fill="var(--um-panel)"/>',
  diamond: '<path d="M12 8L19 4L26 8L19 12Z" fill="var(--um-panel)"/>', 'filled-diamond': '<path d="M12 8L19 4L26 8L19 12Z" fill="var(--um-muted)"/>',
  'filled-triangle': '<path d="M16 3L26 8L16 13Z" fill="var(--um-muted)"/>', arrow: '<path d="M16 4L26 8L16 12Z" fill="var(--um-muted)"/>' };
const legendItem = (end, dashed, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${end === 'none' ? 26 : end.includes('diamond') ? 12 : 17}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${LEGEND_ENDS[end]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
// the legend of a view's lines (pieces.js shows it): each kind drawn, then the association's ends it shows
function legendOf(edges) {
  const types = new Set(edges.map(e => e.type)), ends = new Set(edges.filter(e => e.type === 'uml.Association').flatMap(e => [e.end.from, e.end.to]));
  return [...Object.keys(LINE_WORDS).filter(t => types.has(t)).map(t => { const L = lineLook({ type: t }), [name, says] = LINE_WORDS[t];
    return legendItem(t === 'uml.Association' ? 'none' : L.to, !!L.dashed, name, says); }),
    ...[['filled-diamond', 'Composition', 'the whole owns its parts'], ['diamond', 'Aggregation', 'the whole holds its parts'], ['open', 'Navigable end', 'reachable from the other end']]
      .filter(([k]) => ends.has(k)).map(([k, name, says]) => legendItem(k, false, name, says)),
    ...(edges.some(e => !UML_OWN(LINE_WORDS, e.type)) ? [lineItem()] : [])];
}
// a kind a view lists that it does not draw as its own: its plain arrow, "Line", in every structural view's legend (audit 27)
const LINE_SAYS = 'a kind of line this view does not draw as its own', lineItem = () => legendItem('arrow', false, 'Line', LINE_SAYS);

/* ---- the view laid out: the model's elements as layoutTyped's input ---- */
// every element by id, with its owner for a member
function classIndex(model) {
  const at = new Map(), put = (x0, kind0, owner0, path0) => { for (const s = [[x0, kind0, owner0, path0]]; s.length;) { const [x, kind, owner, path] = s.pop(); // a stack: thousands deep (audit 35)
    if (!UML_OBJ(x) || typeof x.id !== 'string' || at.has(x.id)) continue;
    at.set(x.id, { x, kind, owner, path }); const ms = UML_ARR(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], 'member', x, `${path}.members[${j}]`]); } };
  UML_ARR(model.nodes).forEach((n, i) => put(n, 'node', null, `nodes[${i}]`));
  UML_ARR(model.edges).forEach((e, i) => put(e, 'edge', null, `edges[${i}]`));
  return at;
}
// an interface realization's source (realization-target): a classifier but an interface, a component, or a port a component
// or a class owns, as the component view's provided-ends takes one (audit 49: a class view in the model called an error); an
// owner of type "" is a class, as the class view draws it (audit 53)
const realizer = (at, id) => { const r = at.get(id), t = !r ? undefined : r.kind === 'node' && !r.x.type ? 'uml.Class' : r.x.type;
  return t === 'uml.Port' ? r.kind === 'member' && ['uml.Component', 'uml.Class'].includes(r.owner.type || 'uml.Class') : t !== 'uml.Interface' && (t === 'uml.Component' || CLASSIFIERS.includes(t)); };
const typeWord = t => kindWord(t || 'uml.Class'); // 'uml.DataType': "Data type"; of no notation, as written (registry.js, audit 30)
const nameOfEl = elName;
const plural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
/* A type's look (notes/stage-2.md §10.2): the class, package and object views share classGeo's code. members: whether a
   classifier shows its compartments; kinds: whether another UML kind (a component, an actor, a node) shown here is drawn
   with its kind's keyword, as its accessible name says it (audit 19); own: the line types a view with no `edges` list draws (none: every type); word: the
   diagram's name in describe(). The class view's own: its row's lines (model.md); another diagram's (a usage, a connector) only when listed */
const CLASS_LINES = ['uml.Association', 'uml.Generalization', 'uml.InterfaceRealization', 'uml.Dependency', 'uml.CommentLink'];
// dg.shutBoxes: a line through a package that holds neither of its ends is routed again round it (layered.js's box pass), as a
// state machine's is: laid out right, the example's «use» line from Payable to Money ran inside the card package, under its title
const CLASS_LOOK = { members: true, own: CLASS_LINES, word: 'class diagram', kinds: true, assocClass: true, dg: { shutBoxes: true } };
// an element's accessible name: "Class Order (entity, abstract), 5 attributes, 3 operations", by its drawn name (pic: the
// view's owners, owners.js); "Package sales, holding 4 elements"; "Package payments (closed)"
function nodeName(n, pic, look = CLASS_LOOK) {
  if (n.type === 'uml.Comment') return 'Comment: ' + nameOfEl(n);
  const p = UML_OBJ(n.props) ? n.props : {}, why = [...UML_ARR(p.stereotypes).filter(UML_HAS), ...(p.isAbstract ? ['abstract'] : [])], nm = pic ? pic.name(n.id) : nameOfEl(n);
  if (OWN_BOXES.includes(n.type)) { const b = pic && pic.boxes.find(x => x.id === n.id); return b ? b.aria : `${typeWord(n.type)} ${nm} (${[...why, 'closed'].join(', ')})`; }
  const counts = look.members ? compartmentsOf(n).map(c => plural(c.members.length, c.name.replace(/s$/, ''))) : [];
  return [`${typeWord(n.type)} ${nm}${why.length ? ` (${why.join(', ')})` : ''}`, ...counts].join(', ');
}
function lineName(e, at, pic) {
  const drawn = x => (pic && pic.at.get(x.id) === x ? pic.name(x.id) : nameOfEl(x)); // a node's drawn name; a member's owner's too
  const nm = id => { const r = at.get(id); return !r ? id : r.owner ? drawn(r.owner) + '.' + nameOfEl(r.x) : r.kind === 'node' ? drawn(r.x) : nameOfEl(r.x); };
  const [word] = UML_OWN(LINE_WORDS, e.type) || ['Line'], said = lineLabel(e), E = endsOf(e);
  const end = w => { const t = [(E[w] || {}).role, (E[w] || {}).multiplicity].filter(UML_HAS); return t.length ? ` (${t.join(', ')})` : ''; };
  return `${word} from ${nm(e.from)}${end('from')} to ${nm(e.to)}${end('to')}${said ? ': ' + said : ''}`;
}

/* a view's lines: { at, pic, lines: [{ e, from, to }] }, each line the view lists (or, with no list, each model line of the
   look's own types) whose ends, a member's taken to its owner, the view both shows. A line between a package and something it
   holds is among them: it is drawn by none (holdsLine), and rule line-inside warns of it */
function drawnLines(model, view, own) {
  const at = classIndex(model), pic = ownersOn(model, view), shown = new Set(pic.ids), top = id => { let c = id; for (let r = at.get(c); r && r.owner; r = at.get(c)) c = r.owner.id; return c; }; // a loop: members thousands deep (audit 62)
  const list = Array.isArray(view.edges) ? [...new Set(view.edges.map(e => (typeof e === 'string' ? (at.get(e) || {}).x : e)))] : UML_ARR(model.edges).filter(e => !own || (UML_OBJ(e) && own.includes(e.type)));
  const lines = list.map(e => (typeof e === 'string' ? (at.get(e) || {}).x : e)).filter(e => UML_OBJ(e) && typeof e.id === 'string')
    .map(e => ({ e, from: top(e.from), to: top(e.to) })).filter(({ e, from, to }) => shown.has(from) && shown.has(to) && !(from === to && e.from !== e.to)); // two members of one owner: no loop on it
  return { at, pic, lines };
}

/* the view's geometry, for a type's look: { model, view, pos (col, row by id, the layered layout's ranking or the view's
   pins), memo, direction }. A line that ends on a member is drawn to the member's owner; a line between two nodes the view
   does not both show is not drawn. An open package is a box (its id takes no slot), passed to layoutTyped as a container.
   A look may also give node(d, n, model, pic, view), a node's drawing input before it is sized (the profile's tag compartments), and
   dg, more of layoutTyped's input (repair, reroute: notes/stage-6.md §4.1), and box(b, model, pic), a box as drawn (its title
   and accessible name) */
const typeGeo = look => ({ model, view, pos, memo }) => {
  const { at, pic, lines } = drawnLines(model, view, look.own), present = UML_OBJ(view.present) ? view.present : {}, boxes = look.box ? pic.boxes.map(b => look.box(b, model, pic)) : pic.boxes;
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = at.get(id).x, pr = UML_OBJ(UML_OWN(present, id)) ? present[id] : {}, p = UML_OBJ(n.props) ? n.props : {};
    const st = UML_ARR(p.stereotypes).filter(UML_HAS), kind = typeof n.type === 'string' && n.type.startsWith('uml.') && n.type !== 'uml.Class' && !UML_OWN(IMPLIED, n.type);
    const shape = n.type === 'uml.Comment' ? { shape: 'note' } : OWN_BOXES.includes(n.type) ? { shape: 'package', stereotypes: [...(UML_OWN(IMPLIED, n.type) ? [IMPLIED[n.type]] : []), ...st] }
      : { shape: 'classifier', stereotypes: [...(UML_OWN(IMPLIED, n.type) ? [IMPLIED[n.type]] : look.kinds && kind ? [snKindWord(n.type)] : []), ...st], abstract: !!p.isAbstract, compartments: look.members ? compartmentsOf(n) : [],
        collapsed: UML_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}) };
    const rd = n.type === 'uml.Comment' ? [] : pic.via(id); // the owners its name is written through: what diff() marks it by (audit 48)
    const d0 = { id, label: n.type === 'uml.Comment' ? nameOfEl(n) : pic.name(id), type: n.type || 'uml.Class', kind: 'file', ...shape, ...(rd.length ? { reads: rd } : {}), aria: nodeName(n, pic, look), col: (UML_OWN(pos, id) || [0, 0])[0], row: (UML_OWN(pos, id) || [0, 0])[1] };
    const d = look.node ? look.node(d0, n, model, pic, view) : d0;
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.filter(({ from, to }) => !holdsLine(pic, from, to))
    .map(({ e, from, to }) => ({ id: e.id, _id: e.id, type: e.type, from, to, label: lineLabel(e) || undefined, end: lineLook(e), aria: lineName(e, at, pic), ...(UML_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }));
  // a box's border and padding take 48 px of each side of the gap between columns, so a line from box to box has none left for
  // its label, which is then not drawn: laid out left to right, a view with boxes and labelled lines spreads its columns by its
  // widest label and 40 px for its stubs (laid out down, a label sits across its line, in the gap between rows)
  const down = view.direction === 'down', wide = !down && boxes.length ? Math.max(0, ...edges.filter(e => e.label).map(labelW)) : 0;
  // the association classes it draws (look.assocClass, the class view): each class's accessible name says its association
  const tied = look.assocClass ? tiesIn(at, nodes.map(d => d.id), lines.filter(({ from, to }) => !holdsLine(pic, from, to))) : new Map(), ties = tiesOf(tied, edges, nodes);
  ties.forEach(t => { const d = nodes.find(x => x.id === t.to); d.aria += `, the association class of the ${edges.find(x => x.id === t.tie).aria}`; });
  const g = layoutTyped({ nodes, edges: [...edges, ...ties], ...(boxes.length ? { containers: boxes } : {}), direction: down ? 'down' : 'right', gap: 96 + (wide ? Math.ceil(wide) + 40 : 0), rgap: 56, ...look.dg }, memo);
  if (ties.length) tieDraw(g);
  g.legend = legendOf(g.edges); g.order = [...readingOrder(pic), ...edges.map(e => e.id)]; // Tab: the elements, then the lines
  return placeTabs(g);
};

/* ---- association classes (UML 2.5.1 §11.5.4): a class whose props.associationClass is an association's id is that
   association's class, drawn as a class box joined to the middle of the association's line by a dashed line (the tie).
   tiesIn: the ties a view draws, association id -> class id: each association the view draws with the first class it shows
   that names it, the class at neither end of it (UML's cannot_be_defined, said by rule association-class), the line no loop
   (its middle is far round the box: drawn without the tie, a warning). tiesOf: a layout
   line for each, from the association's source end to the class, so the layout puts the class by the line (TIE_T, no model
   element: its id TIE + the class's id, no _id, so no Ref names it and Tab skips it); tieDraw: each tie, once laid out,
   redrawn from the class box to the middle of its association's line as drawn, or round what that meets (tieRoute) ---- */
const assocOf = x => (UML_OBJ(x) && UML_OBJ(x.props) && typeof x.props.associationClass === 'string' && x.props.associationClass ? x.props.associationClass : null);
// lines: the view's drawn lines ({ e, from, to }, a member's end at its owner); ids: the elements it shows as cards
function tiesIn(at, ids, lines) {
  const byId = new Map(lines.map(l => [l.e.id, l])), out = new Map(), taken = new Set();
  ids.forEach(id => { const r = at.get(id), a = r && r.kind === 'node' && (r.x.type || 'uml.Class') === 'uml.Class' ? assocOf(r.x) : null, l = a && byId.get(a);
    if (!l || l.e.type !== 'uml.Association' || l.from === l.to || out.has(a) || taken.has(id) || l.from === id || l.to === id) return; // a loop's middle is far round it: no tie
    out.set(a, id); taken.add(id); });
  return out;
}
function tiesOf(ties, edges, nodes) {
  const byId = new Map(edges.map(e => [e.id, e])), card = new Map(nodes.map(d => [d.id, d]));
  return [...ties].map(([a, c]) => { const e = byId.get(a), d = card.get(c);
    return { id: TIE + c, type: TIE_T, from: e.from, to: c, tie: a, end: lineLook({ type: TIE_T }), aria: `Association class ${d.label} of the ${e.aria}` }; });
}
// the middle of a line by its length, and which way the segment there runs
function midOf(pts) {
  const segs = pts.slice(1).map((q, i) => [pts[i], q, Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])]), half = segs.reduce((s, x) => s + x[2], 0) / 2;
  let run = 0; for (const [p, q, L] of segs) { if (run + L >= half && L > 0) { const t = (half - run) / L; return { at: [r2(p[0] + (q[0] - p[0]) * t), r2(p[1] + (q[1] - p[1]) * t)], flat: Math.abs(q[1] - p[1]) < Math.abs(q[0] - p[0]), seg: [p, q] }; } run += L; }
  return { at: pts[0], flat: true, seg: [pts[0], pts[0]] };
}
// the middle moved along its segment past the line's label when the label sits on it, 6 px clear, to the side nearer the class
// (toward(flat): the class's middle across the segment's run); left where it is when the segment has no room past the label
function offLabel(m, L, toward) {
  if (!L || !Number.isFinite(L.x)) return m;
  const [x, y] = m.at, k = m.flat ? 0 : 1, [p, q] = m.seg, lo = Math.min(p[k], q[k]), hi = Math.max(p[k], q[k]);
  const on = m.flat ? y >= L.y - 6 && y <= L.y + L.h + 6 : x >= L.x - 6 && x <= L.x + L.w + 6, a = m.flat ? L.x - 6 : L.y - 6, b = m.flat ? L.x + L.w + 6 : L.y + L.h + 6;
  if (!on || m.at[k] < a || m.at[k] > b) return m;
  const ok = [a, b].filter(v => v > lo + 2 && v < hi - 2).sort((u, w) => Math.abs(u - toward(m.flat)) - Math.abs(w - toward(m.flat)));
  if (!ok.length) return m;
  const at = m.flat ? [r2(ok[0]), y] : [x, r2(ok[0])];
  return { ...m, at };
}
// the tie's path from box c to the point [mx, my] on a segment that runs flat or upright, as drawn before audit 65: straight
// from the box's side that faces the point when the point is across from it, else one turn, meeting the line square
function tiePath(c, [mx, my], flat) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2, side = mx < cx ? c.x : c.x + c.w, end = my < cy ? c.y : c.y + c.h;
  return mx > c.x + 4 && mx < c.x + c.w - 4 ? [[mx, end], [mx, my]] : my > c.y + 4 && my < c.y + c.h - 4 ? [[side, my], [mx, my]]
    : flat ? [[side, r2(cy)], [mx, r2(cy)], [mx, my]] : [[r2(cx), end], [r2(cx), my], [mx, my]];
}
// the points along an association's line a tie may meet, each 10 px clear of a turn and of the line's label: [{ at, flat, far }],
// far its distance along the line from the middle
function tieSpots(a) {
  const P = a.pts, L = a.lbl, half = P.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0) / 2, out = [];
  const free = ([x, y]) => !L || !Number.isFinite(L.x) || x < L.x - 6 || x > L.x + L.w + 6 || y < L.y - 6 || y > L.y + L.h + 6;
  let run = 0; P.slice(1).forEach((q, i) => { const p = P[i], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d >= 24 && (p[0] === q[0] || p[1] === q[1])) for (let s = 10, k = Math.max(6, (d - 20) / 10); s <= d - 10 + 1e-9; s += k) { const at = [r2(p[0] + (q[0] - p[0]) * s / d), r2(p[1] + (q[1] - p[1]) * s / d)];
      if (free(at)) out.push({ at, flat: p[1] === q[1], far: Math.abs(run + s - half) }); }
    run += d; });
  return out;
}
// a tie's obstacles round box c and line a: { hard: rects no tie enters (each card but c, grown by pad: 2 px, as a check
// counts it, or 10 px for the way round; each line's label; each box's title), walls: each box's border, which no tie runs
// along; lines: [[p, q]] of every other line (and tie drawn), which a tie should not cross or run along; own: a's segments,
// which it meets at its end alone }
function tieWorld(g, c, a, ties, pad = 2) {
  const hard = [], lines = [], walls = [];
  g.nodes.forEach(d => { if (d !== c) hard.push({ x: d.x - pad, y: d.y - pad, w: d.w + 2 * pad, h: d.h + 2 * pad }); });
  g.edges.forEach(e => { if (e.lbl && Number.isFinite(e.lbl.x)) hard.push(e.lbl);
    if (e !== a && e.pts && (e.type !== TIE_T || ties.has(e))) e.pts.slice(1).forEach((q, i) => lines.push([e.pts[i], q])); });
  (g.families || []).forEach(f => { hard.push({ x: f.x + 8, y: f.y + 3, w: Math.max(0, f.w - 16), h: 22 });
    walls.push([[f.x, f.y], [f.x + f.w, f.y]], [[f.x, f.y + f.h], [f.x + f.w, f.y + f.h]], [[f.x, f.y], [f.x, f.y + f.h]], [[f.x + f.w, f.y], [f.x + f.w, f.y + f.h]]); });
  return { hard, lines, walls, own: a.pts.slice(1).map((q, i) => [a.pts[i], q]) };
}
const tieIn = ([p, q], r) => Math.max(p[0], q[0]) > r.x && Math.min(p[0], q[0]) < r.x + r.w && Math.max(p[1], q[1]) > r.y && Math.min(p[1], q[1]) < r.y + r.h;
// two axis-aligned segments: 'run' when they lie along each other within `near` px for more than 1 px, 'cross' when they meet
// across (ends included), else null
function tieMeet([p, q], [u, v], near) {
  const pv = p[0] === q[0], uv = u[0] === v[0], lo = (s, t, k) => Math.min(s[k], t[k]), hi = (s, t, k) => Math.max(s[k], t[k]);
  if (pv === uv) { const k = pv ? 0 : 1, j = 1 - k; return Math.abs(p[k] - u[k]) < near && Math.min(hi(p, q, j), hi(u, v, j)) - Math.max(lo(p, q, j), lo(u, v, j)) > 1 ? 'run' : null; }
  const [s, t] = pv ? [[p, q], [u, v]] : [[u, v], [p, q]], x = s[0][0], y = t[0][1];
  return x >= lo(t[0], t[1], 0) - 0.5 && x <= hi(t[0], t[1], 0) + 0.5 && y >= lo(s[0], s[1], 1) - 0.5 && y <= hi(s[0], s[1], 1) + 0.5 ? 'cross' : null;
}
// what path P from box c meets that it should not, counted: a hard rect entered, a line crossed or run along, a box's border run
// along, box c entered, its own line met before its end or along it
function tieClash(W, P, c) {
  const segs = P.slice(1).map((q, i) => [P[i], q]), last = segs.length - 1; let n = 0;
  segs.forEach((s, i) => { n += W.hard.filter(r => tieIn(s, r)).length + W.lines.filter(u => tieMeet(s, u, 4)).length + W.walls.filter(u => tieMeet(s, u, 8) === 'run').length;
    if (tieIn(s, { x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2 })) n++;
    n += W.own.filter(u => { const k = tieMeet(s, u, 4); return k && (i < last || k === 'run'); }).length; });
  return n;
}
// the way round (audit 65: a second association class on one class ran through a card, across lines and over a label; one in a
// package along the package's border): a shortest path on a grid of the coordinates round the obstacles near box c and line
// a, from a side of c out square to a point along a (spots) in square, by length, 16 per turn, half its distance from the
// line's middle, 1000 per line crossed; never into a hard rect, along a line, a border or its own line. Null when none, or
// when the grid passes TIE_CELLS or the layout's work (budget.left, each obstacle weighed, each grid cell made and each step
// taken one) runs out: the tie is then drawn its fixed way (tiePath), as a large or hostile view would otherwise hold
// hundreds of MB or hang the page (audit 65 review)
const TIE_CELLS = 250000, TIE_WORK = 2e7;
function tieRoute(g, c, a, W, spots, budget) {
  const B = g.bounds || { x: -50, y: -50, w: 1e9, h: 1e9 }, box = [c.x, c.y, c.x + c.w, c.y + c.h], X = new Set(), Y = new Set();
  a.pts.forEach(([x, y]) => { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); });
  const lo = [Math.max(B.x + 12, box[0] - 160), Math.max(B.y + 12, box[1] - 160)], hi = [Math.min(B.x + B.w - 12, box[2] + 160), Math.min(B.y + B.h - 12, box[3] + 160)];
  const put = (S, k, v) => { if (v >= lo[k] && v <= hi[k]) S.add(r2(v)); }, near = r => r.x < hi[0] + 24 && r.x + r.w > lo[0] - 24 && r.y < hi[1] + 24 && r.y + r.h > lo[1] - 24;
  const seg = ([p, q]) => near({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) });
  W = { hard: W.hard.filter(near), lines: W.lines.filter(seg), walls: W.walls.filter(seg), own: W.own }; // what lies in the window alone
  W.hard.forEach(r => { [r.x - 10, r.x + r.w + 10].forEach(v => put(X, 0, v)); [r.y - 10, r.y + r.h + 10].forEach(v => put(Y, 1, v)); });
  [...W.lines, ...W.walls].forEach(([p, q]) => { if (p[0] === q[0]) [p[0] - 12, p[0] + 12].forEach(v => put(X, 0, v)); else [p[1] - 12, p[1] + 12].forEach(v => put(Y, 1, v)); });
  [lo[0], hi[0]].forEach(v => X.add(r2(v))); [lo[1], hi[1]].forEach(v => Y.add(r2(v)));
  const starts = [];
  [0.5, 0.25, 0.75].forEach(t => { const x = r2(c.x + c.w * t), y = r2(c.y + c.h * t); X.add(x); Y.add(y);
    starts.push([[x, c.y], 1, -1], [[x, c.y + c.h], 1, 1], [[c.x, y], 0, -1], [[c.x + c.w, y], 0, 1]); });
  starts.forEach(([[x, y]]) => { X.add(r2(x)); Y.add(r2(y)); });
  const goal = new Map(); spots.forEach(s => { X.add(s.at[0]); Y.add(s.at[1]); goal.set(s.at[0] + ',' + s.at[1], s); });
  const xs = [...X].sort((u, v) => u - v), ys = [...Y].sort((u, v) => u - v), xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i])), nx = xs.length, ny = ys.length;
  if (nx * ny * 2 > TIE_CELLS || (budget.left -= nx * ny * 2) <= 0) return null; // the grid's cells, each made once
  const cIn = { x: c.x - 1, y: c.y - 1, w: c.w + 2, h: c.h + 2 }, cost = new Float64Array(nx * ny * 2).fill(Infinity), from = new Int32Array(nx * ny * 2).fill(-1);
  // what lies within 9 px of a grid row (k 1) or column (k 0): all a step along it may meet, each row and column's found once
  const bands = [new Map(), new Map()], band = (k, v) => { const M = bands[k]; if (M.has(v)) return M.get(v);
    const by = ([p, q]) => Math.min(p[k], q[k]) <= v + 9 && Math.max(p[k], q[k]) >= v - 9, b = { hard: W.hard.filter(r => (k ? r.y : r.x) <= v + 9 && (k ? r.y + r.h : r.x + r.w) >= v - 9), walls: W.walls.filter(by), own: W.own.filter(by), lines: W.lines.filter(by) };
    budget.left -= W.hard.length + W.walls.length + W.own.length + W.lines.length; M.set(v, b); return b; };
  // a step from grid point p to q: its cost past its length, Infinity when barred; out: a first step out of box c, square
  const step = (p, q, out, arrive) => { const s = [p, q], W = p[1] === q[1] ? band(1, p[1]) : band(0, p[0]);
    budget.left -= 1 + W.hard.length + W.walls.length + W.own.length + W.lines.length;
    if (!out && tieIn(s, cIn)) return Infinity;
    if (W.hard.some(r => tieIn(s, r)) || W.walls.some(u => tieMeet(s, u, 8) === 'run') || W.own.some(u => { const k = tieMeet(s, u, 4); return k && !(arrive && k === 'cross'); })) return Infinity;
    let n = 0; for (const u of W.lines) { const k = tieMeet(s, u, 4); if (k === 'run') return Infinity; if (k && !(u[0][0] === u[1][0] ? u[0][0] === p[0] && p[0] === q[0] : u[0][1] === p[1] && p[1] === q[1])) { const at = u[0][0] === u[1][0] ? [u[0][0], p[1]] : [p[0], u[0][1]]; if (at[0] !== p[0] || at[1] !== p[1]) n++; } }
    return n * 1000; };
  const heap = [], push = (k, d) => { if (d >= cost[k]) return; cost[k] = d; heap.push([d, k]); for (let i = heap.length - 1; i;) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const id = (i, j, d) => (i * ny + j) * 2 + d, startAt = new Map();
  starts.forEach(([[x, y], d, sg]) => { const k = id(xi.get(r2(x)), yi.get(r2(y)), d); startAt.set(k, sg); push(k, 0); });
  let best = null;
  const memo = new Float64Array(nx * ny * 2).fill(-1); // a step's cost by its lower grid point and its axis: each weighed once
  while (heap.length) { if (--budget.left <= 0) return null; const [d0, k] = pop(); if (best && d0 >= best.cost) break; if (d0 > cost[k]) continue;
    const dir = k & 1, j = (k >> 1) % ny, i = Math.floor((k >> 1) / ny), p = [xs[i], ys[j]], sg = startAt.get(k);
    for (const nd of [0, 1]) for (const sgn of [-1, 1]) { if (sg != null && (nd !== dir || sgn !== sg)) continue; // out of the box square
      const i2 = nd === 0 ? i + sgn : i, j2 = nd === 1 ? j + sgn : j; if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
      const q = [xs[i2], ys[j2]], s = goal.get(q[0] + ',' + q[1]), arrive = !!s && s.flat === (nd === 1), m = id(Math.min(i, i2), Math.min(j, j2), nd);
      const extra = sg != null || arrive ? step(p, q, sg != null, arrive) : memo[m] >= 0 ? memo[m] : (memo[m] = step(p, q, false, false)); if (extra === Infinity) continue;
      const d = d0 + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + (nd !== dir ? 16 : 0) + extra, k2 = id(i2, j2, nd);
      if (arrive) { const total = d + s.far / 2; if (!best || total < best.cost) { best = { cost: total, k: k2, prev: k }; } continue; }
      if (d < cost[k2]) { from[k2] = k; push(k2, d); } } }
  if (!best) return null;
  const pts = []; const at = k => [xs[Math.floor((k >> 1) / ny)], ys[(k >> 1) % ny]];
  pts.push(at(best.k)); for (let k = best.prev; k >= 0; k = from[k]) pts.unshift(at(k));
  return pts.filter((p, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1][0] === p[0] && p[0] === pts[i + 1][0]) || (pts[i - 1][1] === p[1] && p[1] === pts[i + 1][1])));
}
function tieDraw(g, budget = { left: TIE_WORK }) {
  const byId = new Map(g.edges.map(e => [e.id, e])), done = new Set(), world = (g.nodes.length + g.edges.length + (g.families || []).length) * 2;
  g.edges = g.edges.map(e => { if (e.type !== TIE_T) return e; const a = byId.get(e.tie), c = e.t;
    if (!a || !a.pts || a.pts.length < 2 || !c) return null;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, m = offLabel(midOf(a.pts), a.lbl, flat0 => (flat0 ? cx : cy));
    // as before when that meets nothing it should not; else the way round, when there is one that meets less, and the layout's
    // work left to look for it (each tie's obstacles weighed against it): once that runs out, each tie left is drawn as before
    let pts = tiePath(c, m.at, m.flat);
    if (budget.left > 0 && (budget.left -= 2 * world) > 0) { const W = tieWorld(g, c, a, done);
      if (tieClash(W, pts, c)) { const r = tieRoute(g, c, a, tieWorld(g, c, a, done, 10), tieSpots(a), budget); if (r && tieClash(W, r, c) < tieClash(W, pts, c)) pts = r; } }
    const t = { ...e, pts, p1: pts[0], p2: pts[pts.length - 1], stubs: [], lbl: null, how: 'tie', fixed: pts }; done.add(t); return t;
  }).filter(Boolean);
}
const classGeo = typeGeo(CLASS_LOOK);

/* ---- validators (proposal.md §8.3). Each problem: { level, rule, path, message, ids }; the message names the rule and
   the elements. Ownership cycles and references that do not resolve are the core's checks (src/core/model.js) ---- */
const RULES = {
  'member-names': 'a classifier\'s members have different names',
  'classifier-names': 'classifiers in one owner have different names',
  multiplicity: 'a multiplicity is n, *, n..m or n..*, its lower bound not above its upper',
  'generalization-cycle': 'nothing is its own ancestor',
  'generalization-kinds': 'a generalization joins two classifiers of one kind (not a package, a comment or a member)',
  'realization-target': 'an interface realization runs from a classifier (not an interface) or a port to an interface',
  'interface-composite': 'an interface owns no part by composition',
  'composite-multiplicity': 'a composite end\'s multiplicity is at most 1',
  'member-kinds': 'literals belong to enumerations; packages, profiles, metaclass references and comments have no members',
  'comment-link': 'a comment link runs from a comment',
};
function classProblems(model, view) {
  const out = [], at = classIndex(UML_OBJ(model) ? model : {}), q = id => JSON.stringify(nameOfEl((at.get(id) || { x: { id } }).x));
  const say = (rule, path, ids, msg, level = 'error') => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` }); // a line with no end names what it has
  // a node with no type the view shows is drawn and named a class (typeWord), so every rule judges it as one (audits 28, 29):
  // its members' names and kinds, its name among its owner's classifiers. One no class view shows (a map's) is not judged
  const inView = new Set(UML_OBJ(view) ? UML_ARR(view.nodeIds) : []), tyOf = x => (!x.type && inView.has(x.id) ? 'uml.Class' : x.type);
  const els = [...at.values()], nodes = els.filter(r => r.kind === 'node' && String(tyOf(r.x) || '').startsWith('uml.')), lines = els.filter(r => r.kind === 'edge' && String(r.x.type || '').startsWith('uml.'));
  // and the view's own lines (view.edges objects), which drawnLines draws, at their own paths; one a model element's id (or an
  // earlier own line's) takes is that one. That view's alone: validate() asks once a view (audit 23, as ucProblems since audit 20)
  const vi = UML_OBJ(view) ? UML_ARR(model && model.views).indexOf(view) : -1, taken = new Set(at.keys());
  if (vi >= 0) UML_ARR(view.edges).forEach((e, j) => { if (UML_OBJ(e) && typeof e.id === 'string' && !taken.has(e.id) && String(e.type || '').startsWith('uml.')) { taken.add(e.id); lines.push({ x: e, kind: 'edge', owner: null, path: `views[${vi}].edges[${j}]` }); } });
  // and as a line's end (audit 28)
  const typeOfId = id => { const r = at.get(id); return !r ? undefined : r.kind === 'node' && !r.x.type ? 'uml.Class' : r.x.type; }, isCls = id => CLASSIFIERS.includes(typeOfId(id));
  nodes.forEach(({ x, path }) => {
    const ms = UML_ARR(x.members).filter(UML_OBJ), seen = new Map(), ty = tyOf(x);
    // member-names judges a classifier's or an instance's members, each with a name: a state's unnamed regions are not "named
    // twice" (audit 11)
    const named = CLASSIFIERS.includes(ty) || ty === 'uml.InstanceSpecification';
    ms.forEach((m, j) => { // an operation is told apart by its parameters' types too (overloading)
      const k = memberKey(m.type, m.label, m.props);
      if (named && UML_HAS(m.label)) { if (seen.has(k)) say('member-names', `${path}.members[${j}]`, [x.id, seen.get(k), m.id], `${q(x.id)} has two members named "${m.label}" (${seen.get(k)}, ${m.id})`); else seen.set(k, m.id); }
      if (m.type === 'uml.EnumerationLiteral' && ty !== 'uml.Enumeration') say('member-kinds', `${path}.members[${j}]`, [x.id, m.id], `literal "${m.label}" is in ${q(x.id)}, which is not an enumeration`);
      const mult = (m.props || {}).multiplicity; if (UML_HAS(mult)) multRule(String(mult), `${path}.members[${j}].props.multiplicity`, [m.id], `${q(x.id)}.${m.label}`);
      out.push(...propTextProblems(m, `${path}.members[${j}]`, ['valueType', 'default', 'returnType'])); // drawn in its row as text (audit 40)
      out.push(...paramTextProblems(m, `${path}.members[${j}]`)); }); // and an operation's parameters (audit 41)
    if ((OWN_BOXES.includes(x.type) || x.type === 'uml.Comment' || x.type === 'uml.MetaclassReference') && ms.length) say('member-kinds', `${path}.members`, [x.id], `${q(x.id)} is a ${typeWord(x.type).toLowerCase()}, which has no members`);
  });
  function multRule(t, path, ids, what) { const p = multProblem(t, path, ids, what); if (p) out.push(p); return multBounds(t); }
  const byOwner = new Map(); nodes.filter(r => CLASSIFIERS.includes(tyOf(r.x))).forEach(({ x, path }) => { const k = (x.parent ?? '') + '\u0000' + nameOfEl(x), was = byOwner.get(k);
    if (was) say('classifier-names', path, [was, x.id], `${q(x.id)} is named twice in ${x.parent != null ? q(x.parent) : 'the model'} (${was}, ${x.id})`); else byOwner.set(k, x.id); });
  const parents = new Map();
  lines.forEach(({ x: e, path }) => {
    const E = endsOf(e), ends = [e.from, e.to];
    if (e.type === 'uml.Association') ['from', 'to'].forEach(w => { const at2 = UML_OBJ(E[w]) ? E[w] : {}, who = e[w];
      const role = labelProblem(at2, `${path}.props.ends.${w}`, 'role'); if (role) out.push(role); // drawn at its end as text (audit 43)
      const b = UML_HAS(at2.multiplicity) ? multRule(String(at2.multiplicity), `${path}.props.ends.${w}.multiplicity`, [e.id], `the ${w} end of ${lineName(e, at)}`) : null;
      if (at2.aggregation === 'composite') {
        if (typeOfId(who) === 'uml.Interface') say('interface-composite', `${path}.props.ends.${w}.aggregation`, [e.id, who], `interface ${q(who)} owns a part by composition (${e.id})`);
        if (b && b.upper > 1) say('composite-multiplicity', `${path}.props.ends.${w}.multiplicity`, [e.id, who], `the composite end${who != null ? ' at ' + q(who) : ''} has multiplicity [${at2.multiplicity}], more than 1 (${e.id})`); } });
    if (e.type === 'uml.Generalization') {
      // an end of another notation (a SysML block) is that notation's to judge (notes/milestone-3.md §7.3); one untyped or of no notation still is the class rule's
      if (at.has(e.from) && at.has(e.to) && ![e.from, e.to].some(id => /^(?!uml\.)[^.]+\./.test(String(typeOfId(id)))) && (!isCls(e.from) || !isCls(e.to) || typeOfId(e.from) !== typeOfId(e.to))) say('generalization-kinds', path, [e.id, ...ends], `${typeWord(typeOfId(e.from)).toLowerCase()} ${q(e.from)} specializes ${typeWord(typeOfId(e.to)).toLowerCase()} ${q(e.to)} (${e.id})`);
      if (!parents.has(e.from)) parents.set(e.from, []); parents.get(e.from).push([e.to, path, e.id]); }
    if (e.type === 'uml.InterfaceRealization' && (typeOfId(e.to) !== 'uml.Interface' || !realizer(at, e.from)))
      say('realization-target', path, [e.id, ...ends], `${e.id} runs from ${q(e.from)} to ${q(e.to)}: from a class, component, port, enumeration or data type to an interface`);
    if (e.type === 'uml.CommentLink' && typeOfId(e.from) !== 'uml.Comment') say('comment-link', path, [e.id, e.from], `${e.id} runs from ${q(e.from)}, which is not a comment`);
  });
  // a generalization cycle: said once, at the line that closes it, naming every element on it
  const state = new Map(), stack = [];
  const walk = id => { const at = [0]; state.set(id, 1); stack.push(id); // a stack of frames, not recursion: a chain of any depth
    while (at.length) { const top = stack[stack.length - 1], ps = parents.get(top) || [];
      if (at[at.length - 1] === ps.length) { at.pop(); stack.pop(); state.set(top, 2); continue; }
      const [p, path, eid] = ps[at[at.length - 1]++];
      if (state.get(p) === 1) { const loop = stack.slice(stack.indexOf(p)); say('generalization-cycle', path, [...loop, eid], `${loop.map(q).join(' → ')} → ${q(p)} is its own ancestor (${eid})`); }
      else if (!state.has(p)) { state.set(p, 1); stack.push(p); at.push(0); } } };
  [...parents.keys()].forEach(id => { if (!state.has(id)) walk(id); });
  return out;
}

/* ---- association-class (the class view's alone): a class's props.associationClass is the id of a uml.Association that
   no other class names, with the class at neither of its ends (UML 2.5.1 §11.8.2, cannot_be_defined), errors; and in each
   class view, the class shown with its association not drawn, or the association drawn with its class not shown, a warning:
   the view draws neither the box's tie nor the line's class ---- */
const ASSOC_RULE = { 'association-class': 'an association class names one association, at neither of its ends, and is drawn with it' };
function assocClassProblems(model, view) {
  const out = [], at = classIndex(UML_OBJ(model) ? model : {}), q = id => JSON.stringify(nameOfEl((at.get(id) || { x: { id } }).x)), first = new Map();
  const say = (level, path, ids, msg) => out.push({ level, rule: 'association-class', path, ids: ids.filter(x => x != null), message: `association-class: ${msg}` });
  const named = [...at.values()].filter(r => r.kind === 'node' && UML_OBJ(r.x.props) && r.x.props.associationClass != null);
  // a view's own line (an object in its edges), which the view draws and ties a class to, is in the model too (audit 65)
  const own = new Map(); UML_ARR(UML_OBJ(model) && model.views).forEach(v => UML_ARR(UML_OBJ(v) && v.edges).forEach(e => { if (UML_OBJ(e) && typeof e.id === 'string' && !at.has(e.id) && !own.has(e.id)) own.set(e.id, { x: e, kind: 'edge' }); }));
  named.forEach(({ x, path }) => { const a = x.props.associationClass, p = `${path}.props.associationClass`, e = typeof a === 'string' && (at.get(a) || own.get(a));
    if (typeof a !== 'string' || !a) return say('error', p, [x.id], `${q(x.id)} names ${jsonText(a)}, which is not an association's id`);
    if ((x.type || 'uml.Class') !== 'uml.Class') return say('error', p, [x.id], `${q(x.id)} is ${aWord(typeWord(x.type).toLowerCase())}: only a class is an association class`);
    if (!e || e.kind !== 'edge' || e.x.type !== 'uml.Association') return say('error', p, [x.id, a], `${q(x.id)} names ${q(a)}, which is ${!e ? 'not in the model' : `${aWord(typeWord(e.x.type).toLowerCase())}, not an association`}`);
    if (e.x.from === x.id || e.x.to === x.id) return say('error', p, [x.id, a], `${q(x.id)} is an end of its own association ${a}`);
    if (first.has(a)) return say('error', p, [x.id, first.get(a), a], `${q(x.id)} and ${q(first.get(a))} both name association ${a}, which has one class`);
    first.set(a, x.id); });
  if (!UML_OBJ(view)) return out;
  const { pic, lines } = drawnLines(model, view, CLASS_LINES), cards = new Set(pic.ids.filter(id => !pic.open.has(id))), drawn = new Set(lines.filter(({ from, to }) => !holdsLine(pic, from, to)).map(l => l.e.id));
  first.forEach((c, a) => { const r = at.get(c), vi = UML_ARR(model.views).indexOf(view), where = `view ${jsonText(view.id)}`;
    const l = lines.find(x => x.e.id === a);
    if (cards.has(c) && l && l.from === l.to) say('warning', `${r.path}.props.associationClass`, [c, a], `${where} draws ${a}, a loop, with no tie to its class ${q(c)}`);
    else if (cards.has(c) && !drawn.has(a)) say('warning', `${r.path}.props.associationClass`, [c, a], `${where} shows ${q(c)} but does not draw its association ${a}`);
    else if (!cards.has(c) && drawn.has(a)) say('warning', vi >= 0 ? `views[${vi}].nodeIds` : `${r.path}.props.associationClass`, [a, c], `${where} draws association ${a} but does not show its class ${q(c)}`); });
  return out;
}
// the panel's "Association class of" field (edits.field): an association's id, or the name of one, as an id; anything else
// refused in the rule's words. Null: another field, or the field emptied
function classField(model, view, id, path, value) {
  if (String(path) !== 'props.associationClass' || value == null) return null;
  // the model's associations, and the view's own (an object in its edges), which it draws (audit 65)
  const t = String(value).trim(), es = [...UML_ARR(model && model.edges), ...UML_ARR(UML_OBJ(view) && view.edges)].filter(e => UML_OBJ(e) && e.type === 'uml.Association');
  const e = es.find(x => x.id === t) || (es.filter(x => String(x.label ?? '') === t).length === 1 ? es.find(x => String(x.label ?? '') === t) : null);
  if (!e) return { error: `association-class: no association has the id or the one name ${JSON.stringify(t)}` };
  if (e.from === id || e.to === id) return { error: 'association-class: a class is not the association class of an association it is an end of' };
  return [{ op: 'set', id, path: 'props.associationClass', value: e.id }];
}
/* ---- a line that would close a cycle (connect, audit 36): a generalization from `from` to `to` closes one when `from` is
   `to` or an ancestor of it already, through the model's lines and the view's own (each id's first, as classProblems and
   ucProblems weigh them). A walk on a stack from `to`, each element once. The words: { error } naming every element on the
   cycle, as generalization-cycle says it ("CargoBike" → "DeliveryVehicle" → "CargoBike" is its own ancestor); null when none closes ---- */
function closesCycle(model, view, type, from, to, word = 'a generalization', said = 'be its own ancestor') {
  const at = classIndex(UML_OBJ(model) ? model : {}), next = new Map(), add = e => { if (UML_OBJ(e) && e.type === type) { if (!next.has(e.from)) next.set(e.from, []); next.get(e.from).push(e.to); } };
  at.forEach(r => { if (r.kind === 'edge') add(r.x); });
  const taken = new Set(at.keys()); if (UML_OBJ(view)) UML_ARR(view.edges).forEach(e => { if (UML_OBJ(e) && typeof e.id === 'string' && !taken.has(e.id)) { taken.add(e.id); add(e); } });
  let path = from === to ? [to] : null;
  for (const came = new Map([[to, null]]), stack = [to]; !path && stack.length;) { const x = stack.pop();
    for (const y of next.get(x) || []) { if (came.has(y)) continue; came.set(y, x); if (y === from) { path = []; for (let z = y; z != null; z = came.get(z)) path.unshift(z); break; } stack.push(y); } }
  if (!path) return null;
  const q = id => JSON.stringify(nameOfEl((at.get(id) || { x: { id } }).x));
  return { error: `${word[0].toUpperCase()}${word.slice(1)} may not close a cycle: ${[from, ...path].map(q).join(' → ')} would ${said}` };
}
// connect on a class view: a generalization that would close a cycle is refused (generalization-cycle), and a realization
// realization-target calls an error, in its words, as the component view's (audit 38); else the default
// a comment link (comment-link) on the class, package, profile, object, component, deployment and composite views (and every view
// whose palette offers one, audit 46): drawn from an element to a comment, added from the
// comment, as the deployment view turns a deploy drawn the wrong way round; with no comment at either end, refused in the rule's
// words, as the block view's (audit 44). Null: not a comment link, or drawn from a comment
function commentConnect(model, view, from, to, line) {
  if (!UML_OBJ(line) || line.type !== 'uml.CommentLink') return null;
  // a comment the model holds, or the view's own (view.nodes), as the object, component, deployment and composite views draw one (audit 45)
  const I = classIndex(UML_OBJ(model) ? model : {}), own = UML_ARR(UML_OBJ(view) && view.nodes);
  const isNote = id => { const r = I.get(id), x = r ? r.x : own.find(n => UML_OBJ(n) && n.id === id); return !!x && x.type === 'uml.Comment'; };
  if (isNote(from)) return null;
  if (!isNote(to)) return { error: 'A comment link runs from a comment' };
  const used = new Set(); usedIds(model, used); let k = 1; while (used.has('commentlink' + k)) k++;
  return [{ op: 'add', element: { id: 'commentlink' + k, type: line.type, from: to, to: from }, view: view.id }];
}
// comment-link, on a view that refuses a comment link with no comment at either end (commentConnect) but has no class view's
// rule on its lines: lines, [[line, path]]; ty(id), an end's type; q(id), its quoted name. A warning, as the interaction
// overview's (the state machine and use case views, audit 46)
const commentLinkProblems = (lines, ty, q) => lines.filter(([e]) => UML_OBJ(e) && e.type === 'uml.CommentLink' && ty(e.from) !== 'uml.Comment' && ty(e.to) !== 'uml.Comment')
  .map(([e, path]) => ({ level: 'warning', rule: 'comment-link', path, ids: [e.id, e.from, e.to].filter(x => x != null), message: `comment-link: ${e.id} joins ${q(e.from)} and ${q(e.to)}, neither a comment` }));
// connect on a class view: a generalization that would close a cycle is refused (generalization-cycle), and a realization
// realization-target calls an error, in its words, as the component view's (audit 38); a generalization generalization-kinds
// calls an error (two kinds, a package, a comment, a member; an end of another notation is that notation's) and a comment
// link drawn to a comment (commentConnect), audit 44; else the default
function classConnect(model, view, from, to, at, line) {
  const t = UML_OBJ(line) ? line.type : null, I = classIndex(UML_OBJ(model) ? model : {}), ty = id => { const r = I.get(id); return !r ? undefined : r.kind === 'node' && !r.x.type ? 'uml.Class' : r.x.type; };
  if (t === 'uml.InterfaceRealization' && (ty(to) !== 'uml.Interface' || !realizer(I, from))) return { error: 'A realization runs from a class, a component, a port, an enumeration or a data type to an interface' };
  if (t === 'uml.Generalization' && I.has(from) && I.has(to) && ![from, to].some(id => /^(?!uml\.)[^.]+\./.test(String(ty(id)))) && (!CLASSIFIERS.includes(ty(from)) || !CLASSIFIERS.includes(ty(to)) || ty(from) !== ty(to)))
    return { error: `A generalization joins two classifiers of one kind, not ${aWord(typeWord(ty(from)).toLowerCase())} and ${aWord(typeWord(ty(to)).toLowerCase())}` };
  return t === 'uml.Generalization' ? closesCycle(model, view, t, from, to) : commentConnect(model, view, from, to, line);
}

/* ---- describe(): the view in words, per element, each box then what it holds: "Class Order (entity), 5 attributes, 3
   operations; associated with OrderLine (lines, 1..*)"; "Package sales, holding 4 elements; imports catalog" ---- */
// the verb describe() says a line by, from its source end; null for a kind it has none for (the object view says that one a
// line, audit 26)
const lineVerb = e => ({ __proto__: null, 'uml.Generalization': 'a kind of', 'uml.InterfaceRealization': 'realizes', 'uml.Dependency': 'depends on', 'uml.PackageMerge': 'merges', 'uml.ProfileApplication': 'applies', 'uml.CommentLink': 'about',
  'uml.Usage': 'uses', 'uml.Realization': 'realizes', 'uml.Abstraction': 'abstracts', 'uml.Extension': 'extends',
  'uml.PackageImport': keyword(e) === '«access»' ? 'accesses' : 'imports' }[e.type] || null);
const describeAs = look => (model, viewId) => {
  const v = UML_ARR(model && model.views).find(x => UML_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const { at, pic, lines: all } = drawnLines(model, v, look.own), lines = all.filter(({ from, to }) => !holdsLine(pic, from, to));
  const nm = id => (at.get(id).x.type === 'uml.Comment' ? nameOfEl(at.get(id).x) : pic.name(id));
  const end = (e, w) => { const E = endsOf(e)[w] || {}, t = [E.role, E.multiplicity].filter(UML_HAS); return t.length ? ` (${t.join(', ')})` : ''; };
  const out = [`${labelOr(v.title, v.id)}: a ${look.word} of ${plural(pic.ids.length, 'element')} and ${plural(lines.length, 'line')}.`];
  // an association class (the class view's): its association said with it, and the association's class said with the line
  const tied = look.assocClass ? tiesIn(at, pic.ids.filter(x => !pic.open.has(x)), lines) : new Map(), tieOf = new Map([...tied].map(([a, c]) => [c, a]));
  const through = e => (tied.has(e.id) ? ` through ${nm(tied.get(e.id))}` : '');
  readingOrder(pic).forEach(id => { const said = [];
    if (tieOf.has(id)) { const { e, from: f, to: t } = lines.find(l => l.e.id === tieOf.get(id));
      said.push(`the association class of the association between ${nm(f)} and ${nm(t)}${UML_HAS(e.label) ? ` ("${e.label}")` : ''}`); }
    lines.forEach(({ e, from: f, to: t }) => { const E = endsOf(e);
      if (e.type === 'uml.Association' && (f === id || t === id)) { const [me, far] = f === id ? ['from', 'to'] : ['to', 'from'], agg = (E[me] || {}).aggregation, whole = (E[far] || {}).aggregation;
        const verb = agg === 'composite' ? 'composed of' : agg === 'shared' ? 'aggregates' : whole === 'composite' ? 'part of' : whole === 'shared' ? 'held by' : 'associated with';
        said.push(`${verb} ${nm(far === 'to' ? t : f)}${end(e, far)}${stereoText(e) ? ' ' + stereoText(e) : ''}${UML_HAS(e.label) ? ` ("${e.label}")` : ''}${through(e)}`); }
      else if (f !== id) return;
      else { const verb = lineVerb(e) || 'linked to'; // and the stereotypes and label the line draws (audit 5); any other kind it draws too (audit 6)
        said.push(`${verb} ${nm(t)}${stereoText(e) ? ' ' + stereoText(e) : ''}${UML_HAS(e.label) ? ` ("${e.label}")` : ''}`); } });
    // each said once: two lines alike, one from the box and one from its port to one interface, read as one (audit 64)
    const once = [...new Set(said)]; out.push(nodeName(at.get(id).x, pic, look) + (once.length ? '; ' + once.join('; ') : '') + '.'); });
  return out.join('\n');
};
const classDescribe = describeAs(CLASS_LOOK);

/* ---- the type ---- */
const CLASS_TYPE = registerDiagramType('uml.class', {
  untyped: 'Class', untypedAs: 'uml.Class', // an element of no type (or ""): a class, as drawn, named, edited and judged (audit 30)
  ...CLASS_DEF,
  // a class's "Association class of": an association's id or name (classField), on the class view's form alone, as it alone draws one
  props: { ...CLASS_DEF.props, 'uml.Class': [...CLASS_DEF.props['uml.Class'], { key: 'associationClass', label: 'Association class of', kind: 'text' }] },
  // the layered layout ranks the view's lines as maps are ranked, a generalization and a realization turned round so the
  // general one comes first: above its specializations in a view laid out down (risks.md L6)
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.InterfaceRealization',
  layout: classGeo,
  // the view's open packages, the boxes the layout draws (notes/stage-2.md §4), and the Owner field's packages (§8)
  boxes: (model, view) => ownersOn(model, view).boxes,
  owners: ownerChoices,
  member: { print: printMember, edit: memberEdit, add: memberAdd, holds: n => compartmentsOf(n).length > 0 }, // holds: the panel offers members (not on a comment or a package)
  validate: (model, view) => [...classProblems(model, view), ...assocClassProblems(model, view), ...ownerProblems(model, view, drawnLines(model, view, CLASS_LINES).lines)],
  rules: { ...RULES, ...ASSOC_RULE, ...OWNER_RULES },
  describe: classDescribe,
  // the PDF's Members: what the box draws, its compartments' rows, so a port or a reception it does not draw is not listed as if
  // it were (audit 31, as the object type's since audit 30); null (a comment, a package): its members
  rows: (model, view, id) => { const x = UML_ARR(model && model.nodes).find(n => UML_OBJ(n) && n.id === id); if (!x || x.type === 'uml.Comment' || OWN_BOXES.includes(x.type)) return null;
    return compartmentsOf(x).flatMap(c => c.members.map(rowMember)); },
  // the PDF's Kind (asked with no view): a class that is an association's class, rule association-class kept, is "Association
  // class"; null: the element's kind
  word: (model, id) => (assocClassProblems(model).some(p => p.ids[0] === id) || !UML_ARR(model && model.nodes).some(n => UML_OBJ(n) && n.id === id && assocOf(n)) ? null : 'Association class'),
  edits: { connect: classConnect, rename: lineRename(lineLabel), owner: defOwner, field: classField },
  // a deleted association leaves its class a plain class: apply()'s delete takes props.associationClass out of the class that
  // names it, of no type ('', a class here) too (audit 65: left naming a gone id, an error of rule association-class)
  refs: { 'uml.Class': { 'props.associationClass': 'drop' }, '': { 'props.associationClass': 'drop' } },
});

export { CLASSIFIERS, compartmentsOf, LINE_WORDS, lineVerb, lineIn, lineRename, CLASS_LINES, CLASS_TYPE, CLASS_DEF, RULES, lineName, lineLook, lineLabel, legendOf, legendItem, lineItem, LINE_SAYS, LEGEND_ENDS, multBounds, multProblem, parseMember, printMember, rowMember, memberEdit, memberClash, paramTextProblems, classProblems, closesCycle, commentConnect, commentLinkProblems, classDescribe, classGeo, typeGeo, describeAs, drawnLines, tieDraw, tiePath, TIE_CELLS, TIE_WORK };
