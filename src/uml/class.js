import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import '../typed/draw.js'; // SHAPE.classifier, which the note's outline and ports take
import { layoutTyped } from '../typed/layout.js';

/* ---------- the class diagram, uml.class (work package 1.9) ----------
   The subset of proposal.md §8.2: class, interface, enumeration with literals, data type, primitive type; attributes and
   operations in UML's text form; stereotypes as text; packages as owners (drawn as a node until stage 2 draws ownership);
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
const SYNTAX_KEYS = ['visibility', 'valueType', 'multiplicity', 'default', 'isStatic', 'isDerived', 'isAbstract', 'parameters', 'returnType'];

/* a multiplicity's bounds: '1', '*', '0..1', '1..*', '2..5' → { lower, upper } (upper Infinity for *); null for anything else */
function multBounds(t) {
  const m = /^\s*(\d+|\*)\s*(?:\.\.\s*(\d+|\*)\s*)?$/.exec(String(t ?? ''));
  if (!m || (m[2] != null && m[1] === '*')) return null;
  const n = x => (x === '*' ? Infinity : +x);
  return m[2] == null ? (m[1] === '*' ? { lower: 0, upper: Infinity } : { lower: +m[1], upper: +m[1] }) : { lower: +m[1], upper: n(m[2]) };
}

// s split at each `sep` outside brackets of any kind: "a: Map<K, V>, b" → ["a: Map<K, V>", " b"]
function splitTop(s, sep) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if ('<([{'.includes(c)) depth++; else if ('>)]}'.includes(c)) depth--;
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
  if (kind === 'uml.EnumerationLiteral') return MEMBER_NAME.test(s) && MEMBER_NAME.exec(s)[0] === s ? { type: kind, label: s, props: {} } : fail('a literal is a name');
  const props = {};
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
    for (; i < s.length; i++) { const c = s[i]; if (c === '<' || c === '(') depth++; else if (c === '>' || c === ')') depth--; else if (depth === 0 && c === '[' && s[i + 1] === ']') i++; else if (depth === 0 && (c === '[' || c === '=')) break; } // String[]: an array type, not a multiplicity
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

/* a member back in its text form: the inverse of parseMember */
function printMember(m) {
  const p = UML_OBJ(m && m.props) ? m.props : {}, label = String((m && m.label) ?? '');
  if (m && m.type === 'uml.EnumerationLiteral') return label;
  const head = (Object.hasOwn(MEMBER_SIGN, p.visibility) ? MEMBER_SIGN[p.visibility] + ' ' : '') + (p.isStatic ? '{static} ' : '') + (p.isAbstract ? '{abstract} ' : '');
  if (m && m.type === 'uml.Operation') return head + label + '(' + UML_ARR(p.parameters).filter(UML_OBJ).map(a => (UML_HAS(a.direction) ? a.direction + ' ' : '') + (a.name ?? '') + (UML_HAS(a.valueType) ? ': ' + a.valueType : '')).join(', ') + ')' + (UML_HAS(p.returnType) ? ': ' + p.returnType : '');
  return head + (p.isDerived ? '/' : '') + label + (UML_HAS(p.valueType) ? ': ' + p.valueType : '') + (UML_HAS(p.multiplicity) ? ` [${p.multiplicity}]` : '') + (UML_HAS(p.default) ? ' = ' + p.default : '');
}

/* a member edited as text: the commands that set it, one transaction; { error } when the text does not parse, and then
   nothing is applied (E3). Props the syntax does not write (stereotypes, a host's own) are kept */
function memberEdit(m, text) {
  const r = parseMember(text, m.type === 'uml.Property' || m.type === 'uml.Operation' || m.type === 'uml.EnumerationLiteral' ? m.type : undefined);
  if (r.error) return r;
  const keep = Object.fromEntries(Object.entries(UML_OBJ(m.props) ? m.props : {}).filter(([k]) => !SYNTAX_KEYS.includes(k)));
  return { commands: [{ op: 'set', id: m.id, path: 'label', value: r.label }, { op: 'set', id: m.id, path: 'props', value: { ...keep, ...r.props } }] };
}

/* a line typed into an owner's "New member": on an enumeration a bare name is a literal, anything else a property or an operation */
function memberAdd(text, owner) {
  const t = String(text ?? '').trim(), nm = MEMBER_NAME.exec(t);
  return parseMember(t, owner && owner.type === 'uml.Enumeration' && nm && nm[0] === t ? 'uml.EnumerationLiteral' : undefined);
}

/* ---- the vocabulary (model.md, uml.class) ---- */
const CLASSIFIERS = ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType'];
const IMPLIED = { 'uml.Interface': 'interface', 'uml.Enumeration': 'enumeration', 'uml.DataType': 'dataType', 'uml.PrimitiveType': 'primitive' }; // shown «…» over the name
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
  if (n.type === 'uml.Package' || n.type === 'uml.Comment') return [];
  return n.type === 'uml.Enumeration' ? [c('literals'), ...[c('attributes'), c('operations')].filter(x => x.members.length)] : [c('attributes'), c('operations')];
}

// a comment: a note with a folded corner, its text wrapped at 220 px
const NOTE = { pad: 8, px: 11, lh: 15, max: 220, fold: 10 };
function noteLines(t) {
  const out = []; let line = '';
  String(t ?? '').split(/\s+/).filter(Boolean).forEach(w => { const next = line ? line + ' ' + w : w;
    if (line && textW(next, NOTE.px) > NOTE.max) { out.push(line); line = w; } else line = next; });
  if (line) out.push(line);
  return out.length ? out : [''];
}
SHAPE.note = {
  size: n => { const ls = noteLines(n.label); return { w: Math.ceil(Math.max(60, ...ls.map(l => Math.min(NOTE.max, textW(l, NOTE.px)))) + 2 * NOTE.pad + NOTE.fold), h: ls.length * NOTE.lh + 2 * NOTE.pad }; },
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
const endOfLine = (e, w) => { const at = ((UML_OBJ(e.props) && UML_OBJ(e.props.ends) ? e.props.ends : {})[w]) || {};
  return at.aggregation === 'composite' ? 'filled-diamond' : at.aggregation === 'shared' ? 'diamond' : at.navigable ? 'open' : 'none'; };
const endsOf = e => (UML_OBJ(e.props) && UML_OBJ(e.props.ends) ? e.props.ends : {});
function lineLook(e) {
  switch (e.type) {
    case 'uml.Generalization': return { from: 'none', to: 'triangle' };
    case 'uml.InterfaceRealization': return { from: 'none', to: 'triangle', dashed: true };
    case 'uml.Dependency': return { from: 'none', to: 'open', dashed: true };
    case 'uml.CommentLink': return { from: 'none', to: 'none', dashed: true };
    case 'uml.Association': { const E = endsOf(e), lab = w => ({ role: (E[w] || {}).role, mult: (E[w] || {}).multiplicity });
      return { from: endOfLine(e, 'from'), to: endOfLine(e, 'to'), labels: { from: lab('from'), to: lab('to') } }; }
    default: return { from: 'none', to: 'arrow' };
  }
}
const stereoText = x => UML_ARR(UML_OBJ(x.props) ? x.props.stereotypes : null).filter(UML_HAS).map(t => `«${t}»`).join(' ');
const lineLabel = e => [stereoText(e), e.label].filter(UML_HAS).join(' ');
const LINE_WORDS = { 'uml.Association': ['Association', 'a link between instances'], 'uml.Generalization': ['Generalization', 'is a kind of the one it points to'],
  'uml.InterfaceRealization': ['Realization', 'implements the interface it points to'], 'uml.Dependency': ['Dependency', 'uses the one it points to'],
  'uml.CommentLink': ['Comment link', 'what a comment is about'] };
const LEGEND_ENDS = { // small copies of src/typed/draw.js's ends, pointing right with the tip at x 26
  none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>', triangle: '<path d="M16 3L26 8L16 13Z" fill="var(--um-panel)"/>',
  diamond: '<path d="M12 8L19 4L26 8L19 12Z" fill="var(--um-panel)"/>', 'filled-diamond': '<path d="M12 8L19 4L26 8L19 12Z" fill="var(--um-muted)"/>' };
const legendItem = (end, dashed, name, says) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${end === 'none' ? 26 : end.includes('diamond') ? 12 : 17}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${LEGEND_ENDS[end]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
// the legend of a view's lines (pieces.js shows it): each kind drawn, then the association's ends it shows
function legendOf(edges) {
  const types = new Set(edges.map(e => e.type)), ends = new Set(edges.filter(e => e.type === 'uml.Association').flatMap(e => [e.end.from, e.end.to]));
  return [...Object.keys(LINE_WORDS).filter(t => types.has(t)).map(t => { const L = lineLook({ type: t }), [name, says] = LINE_WORDS[t];
    return legendItem(t === 'uml.Association' ? 'none' : L.to, !!L.dashed, name, says); }),
    ...[['filled-diamond', 'Composition', 'the whole owns its parts'], ['diamond', 'Aggregation', 'the whole holds its parts'], ['open', 'Navigable end', 'reachable from the other end']]
      .filter(([k]) => ends.has(k)).map(([k, name, says]) => legendItem(k, false, name, says))];
}

/* ---- the view laid out: the model's elements as layoutTyped's input ---- */
// every element by id, with its owner for a member
function classIndex(model) {
  const at = new Map(), put = (x, kind, owner, path) => { if (!UML_OBJ(x) || typeof x.id !== 'string' || at.has(x.id)) return;
    at.set(x.id, { x, kind, owner, path }); UML_ARR(x.members).forEach((y, j) => put(y, 'member', x, `${path}.members[${j}]`)); };
  UML_ARR(model.nodes).forEach((n, i) => put(n, 'node', null, `nodes[${i}]`));
  UML_ARR(model.edges).forEach((e, i) => put(e, 'edge', null, `edges[${i}]`));
  return at;
}
const typeWord = t => String(t || 'uml.Class').split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'uml.DataType': "Data type"
const nameOfEl = x => String(x.label ?? x.id);
const plural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
// an element's accessible name: "Class Order (entity, abstract), 5 attributes, 3 operations"
function nodeName(n) {
  if (n.type === 'uml.Comment') return 'Comment: ' + nameOfEl(n);
  const p = UML_OBJ(n.props) ? n.props : {}, why = [...UML_ARR(p.stereotypes).filter(UML_HAS), ...(p.isAbstract ? ['abstract'] : [])];
  const counts = compartmentsOf(n).map(c => plural(c.members.length, c.name.replace(/s$/, '')));
  return [`${typeWord(n.type)} ${nameOfEl(n)}${why.length ? ` (${why.join(', ')})` : ''}`, ...counts].join(', ');
}
function lineName(e, at) {
  const nm = id => { const r = at.get(id); return r ? nameOfEl(r.owner || r.x) + (r.owner ? '.' + nameOfEl(r.x) : '') : id; };
  const [word] = UML_OWN(LINE_WORDS, e.type) || ['Line'], said = lineLabel(e), E = endsOf(e);
  const end = w => { const t = [(E[w] || {}).role, (E[w] || {}).multiplicity].filter(UML_HAS); return t.length ? ` (${t.join(', ')})` : ''; };
  return `${word} from ${nm(e.from)}${end('from')} to ${nm(e.to)}${end('to')}${said ? ': ' + said : ''}`;
}

/* the class view's geometry: { model, view, pos (col, row by id, the layered layout's ranking or the view's pins), memo,
   direction }. A line that ends on a member is drawn to the member's owner; a line between two nodes the view does not
   both show is not drawn */
function classGeo({ model, view, pos, memo }) {
  const at = classIndex(model), present = UML_OBJ(view.present) ? view.present : {}, ids = UML_ARR(view.nodeIds).filter(id => (at.get(id) || {}).kind === 'node');
  const shown = new Set(ids), top = id => { const r = at.get(id); return r && r.owner ? top(r.owner.id) : id; };
  const nodes = ids.map(id => { const n = at.get(id).x, pr = UML_OBJ(UML_OWN(present, id)) ? present[id] : {}, p = UML_OBJ(n.props) ? n.props : {};
    const look = n.type === 'uml.Comment' ? { shape: 'note' } : { shape: 'classifier', stereotypes: [...(UML_OWN(IMPLIED, n.type) ? [IMPLIED[n.type]] : []), ...UML_ARR(p.stereotypes).filter(UML_HAS)],
      abstract: !!p.isAbstract, compartments: compartmentsOf(n), collapsed: UML_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}) };
    const d = { id, label: nameOfEl(n), type: n.type || 'uml.Class', kind: 'file', ...look, aria: nodeName(n), col: (UML_OWN(pos, id) || [0, 0])[0], row: (UML_OWN(pos, id) || [0, 0])[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const list = Array.isArray(view.edges) ? view.edges : UML_ARR(model.edges);
  const edges = list.map(e => (typeof e === 'string' ? (at.get(e) || {}).x : e)).filter(e => UML_OBJ(e) && typeof e.id === 'string')
    .map(e => ({ e, from: top(e.from), to: top(e.to) })).filter(({ from, to }) => shown.has(from) && shown.has(to))
    .map(({ e, from, to }) => ({ id: e.id, _id: e.id, type: e.type, from, to, label: lineLabel(e) || undefined, end: lineLook(e), aria: lineName(e, at), ...(UML_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }));
  const g = layoutTyped({ nodes, edges, direction: view.direction === 'down' ? 'down' : 'right', gap: 96, rgap: 56 }, memo);
  g.legend = legendOf(g.edges);
  return g;
}

/* ---- validators (proposal.md §8.3). Each problem: { level, rule, path, message, ids }; the message names the rule and
   the elements. Ownership cycles and references that do not resolve are the core's checks (src/core/model.js) ---- */
const RULES = {
  'member-names': 'a classifier\'s members have different names',
  'classifier-names': 'classifiers in one owner have different names',
  multiplicity: 'a multiplicity is n, *, n..m or n..*, its lower bound not above its upper',
  'generalization-cycle': 'nothing is its own ancestor',
  'generalization-kinds': 'a generalization joins two classifiers of one kind (not a package, a comment or a member)',
  'realization-target': 'an interface realization runs from a classifier to an interface',
  'interface-composite': 'an interface owns no part by composition',
  'composite-multiplicity': 'a composite end\'s multiplicity is at most 1',
  'member-kinds': 'literals belong to enumerations; packages and comments have no members',
  'comment-link': 'a comment link runs from a comment',
};
function classProblems(model) {
  const out = [], at = classIndex(UML_OBJ(model) ? model : {}), q = id => JSON.stringify(nameOfEl((at.get(id) || { x: { id } }).x));
  const say = (rule, path, ids, msg, level = 'error') => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` }); // a line with no end names what it has
  const els = [...at.values()], nodes = els.filter(r => r.kind === 'node' && String(r.x.type || '').startsWith('uml.')), lines = els.filter(r => r.kind === 'edge' && String(r.x.type || '').startsWith('uml.'));
  const typeOfId = id => (at.get(id) || { x: {} }).x.type, isCls = id => CLASSIFIERS.includes(typeOfId(id));
  nodes.forEach(({ x, path }) => {
    const ms = UML_ARR(x.members).filter(UML_OBJ), seen = new Map();
    ms.forEach((m, j) => { // an operation is told apart by its parameters' types too (overloading)
      const k = m.type === 'uml.Operation' ? `${m.label}(${UML_ARR((m.props || {}).parameters).map(a => UML_OBJ(a) ? a.valueType ?? '' : '').join(',')})` : `${m.label}`;
      if (seen.has(k)) say('member-names', `${path}.members[${j}]`, [x.id, seen.get(k), m.id], `${q(x.id)} has two members named "${m.label}" (${seen.get(k)}, ${m.id})`); else seen.set(k, m.id);
      if (m.type === 'uml.EnumerationLiteral' && x.type !== 'uml.Enumeration') say('member-kinds', `${path}.members[${j}]`, [x.id, m.id], `literal "${m.label}" is in ${q(x.id)}, which is not an enumeration`);
      const mult = (m.props || {}).multiplicity; if (UML_HAS(mult)) multRule(String(mult), `${path}.members[${j}].props.multiplicity`, [m.id], `${q(x.id)}.${m.label}`); });
    if ((x.type === 'uml.Package' || x.type === 'uml.Comment') && ms.length) say('member-kinds', `${path}.members`, [x.id], `${q(x.id)} is a ${typeWord(x.type).toLowerCase()}, which has no members`);
  });
  function multRule(t, path, ids, what) { const b = multBounds(t);
    if (!b) say('multiplicity', path, ids, `${what}: [${t}] is not a multiplicity (1, *, 0..1, 1..*)`);
    else if (b.lower > b.upper) say('multiplicity', path, ids, `${what}: [${t}] has its lower bound above its upper`);
    return b; }
  const byOwner = new Map(); nodes.filter(r => CLASSIFIERS.includes(r.x.type)).forEach(({ x, path }) => { const k = (x.parent ?? '') + '\u0000' + nameOfEl(x), was = byOwner.get(k);
    if (was) say('classifier-names', path, [was, x.id], `${q(x.id)} is named twice in ${x.parent != null ? q(x.parent) : 'the model'} (${was}, ${x.id})`); else byOwner.set(k, x.id); });
  const parents = new Map();
  lines.forEach(({ x: e, path }) => {
    const E = endsOf(e), ends = [e.from, e.to];
    if (e.type === 'uml.Association') ['from', 'to'].forEach(w => { const at2 = UML_OBJ(E[w]) ? E[w] : {}, who = e[w];
      const b = UML_HAS(at2.multiplicity) ? multRule(String(at2.multiplicity), `${path}.props.ends.${w}.multiplicity`, [e.id], `the ${w} end of ${lineName(e, at)}`) : null;
      if (at2.aggregation === 'composite') {
        if (typeOfId(who) === 'uml.Interface') say('interface-composite', `${path}.props.ends.${w}.aggregation`, [e.id, who], `interface ${q(who)} owns a part by composition (${e.id})`);
        if (b && b.upper > 1) say('composite-multiplicity', `${path}.props.ends.${w}.multiplicity`, [e.id, who], `the composite end${who != null ? ' at ' + q(who) : ''} has multiplicity [${at2.multiplicity}], more than 1 (${e.id})`); } });
    if (e.type === 'uml.Generalization') {
      if (at.has(e.from) && at.has(e.to) && (!isCls(e.from) || !isCls(e.to) || typeOfId(e.from) !== typeOfId(e.to))) say('generalization-kinds', path, [e.id, ...ends], `${typeWord(typeOfId(e.from)).toLowerCase()} ${q(e.from)} specializes ${typeWord(typeOfId(e.to)).toLowerCase()} ${q(e.to)} (${e.id})`);
      if (!parents.has(e.from)) parents.set(e.from, []); parents.get(e.from).push([e.to, path, e.id]); }
    if (e.type === 'uml.InterfaceRealization' && (typeOfId(e.to) !== 'uml.Interface' || !isCls(e.from) || typeOfId(e.from) === 'uml.Interface'))
      say('realization-target', path, [e.id, ...ends], `${e.id} runs from ${q(e.from)} to ${q(e.to)}: from a class, enumeration or data type to an interface`);
    if (e.type === 'uml.CommentLink' && typeOfId(e.from) !== 'uml.Comment') say('comment-link', path, [e.id, e.from], `${e.id} runs from ${q(e.from)}, which is not a comment`);
  });
  // a generalization cycle: said once, at the line that closes it, naming every element on it
  const state = new Map(), stack = [];
  const walk = id => { state.set(id, 1); stack.push(id);
    for (const [p, path, eid] of parents.get(id) || []) {
      if (state.get(p) === 1) { const loop = stack.slice(stack.indexOf(p)); say('generalization-cycle', path, [...loop, eid], `${loop.map(q).join(' → ')} → ${q(p)} is its own ancestor (${eid})`); }
      else if (!state.has(p)) walk(p); }
    stack.pop(); state.set(id, 2); };
  [...parents.keys()].forEach(id => { if (!state.has(id)) walk(id); });
  return out;
}

/* ---- describe(): the view in words, per element: "Class Order (entity), 5 attributes, 3 operations; associated with
   OrderLine (lines, 1..*)" ---- */
function classDescribe(model, viewId) {
  const v = UML_ARR(model && model.views).find(x => UML_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const at = classIndex(model), top = id => { const r = at.get(id); return r && r.owner ? top(r.owner.id) : id; };
  const ids = UML_ARR(v.nodeIds).filter(id => (at.get(id) || {}).kind === 'node'), shown = new Set(ids), nm = id => nameOfEl(at.get(id).x);
  const lines = (Array.isArray(v.edges) ? v.edges : UML_ARR(model.edges)).map(e => (typeof e === 'string' ? (at.get(e) || {}).x : e))
    .filter(e => UML_OBJ(e) && shown.has(top(e.from)) && shown.has(top(e.to)));
  const end = (e, w) => { const E = endsOf(e)[w] || {}, t = [E.role, E.multiplicity].filter(UML_HAS); return t.length ? ` (${t.join(', ')})` : ''; };
  const out = [`${v.title || v.id}: a class diagram of ${plural(ids.length, 'element')} and ${plural(lines.length, 'line')}.`];
  ids.forEach(id => { const said = [];
    lines.forEach(e => { const f = top(e.from), t = top(e.to), E = endsOf(e);
      if (e.type === 'uml.Association' && (f === id || t === id)) { const [me, far] = f === id ? ['from', 'to'] : ['to', 'from'], agg = (E[me] || {}).aggregation, whole = (E[far] || {}).aggregation;
        const verb = agg === 'composite' ? 'composed of' : agg === 'shared' ? 'aggregates' : whole === 'composite' ? 'part of' : whole === 'shared' ? 'held by' : 'associated with';
        said.push(`${verb} ${nm(far === 'to' ? t : f)}${end(e, far)}${UML_HAS(e.label) ? ` ("${e.label}")` : ''}`); }
      else if (f === id && e.type === 'uml.Generalization') said.push(`a kind of ${nm(t)}`);
      else if (f === id && e.type === 'uml.InterfaceRealization') said.push(`realizes ${nm(t)}`);
      else if (f === id && e.type === 'uml.Dependency') said.push(`depends on ${nm(t)}${stereoText(e) ? ' ' + stereoText(e) : ''}`);
      else if (f === id && e.type === 'uml.CommentLink') said.push(`about ${nm(t)}`); });
    out.push(nodeName(at.get(id).x) + (said.length ? '; ' + said.join('; ') : '') + '.'); });
  return out.join('\n');
}

/* ---- the type ---- */
const CLASS_TYPE = registerDiagramType('uml.class', {
  ...CLASS_DEF,
  // the layered layout ranks the view's lines as maps are ranked, a generalization and a realization turned round so the
  // general one comes first: above its specializations in a view laid out down (risks.md L6)
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.InterfaceRealization',
  layout: classGeo,
  member: { print: printMember, edit: memberEdit, add: memberAdd, holds: n => compartmentsOf(n).length > 0 }, // holds: the panel offers members (not on a comment or a package)
  validate: classProblems,
  rules: RULES,
  describe: classDescribe,
});

export { CLASS_TYPE, multBounds, parseMember, printMember, memberEdit, classProblems, classDescribe, classGeo };
