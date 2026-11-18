import { elName, labelOr, propTextProblems } from '../core/model.js';
import { esc } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { ENDS } from '../typed/draw.js';
import { frameTag } from '../uml/frame.js';
import { LEGEND_ENDS, legendOf, paramTextProblems } from '../uml/class.js';
import { STY_FREE, UML_META_AS, styKey } from '../uml/stereotypes.js';
import { csProblems } from '../uml/composite.js';
import { idTable } from '../core/registry.js';

/* ---------- SysML's base (work package M3.1, notes/milestone-3.md §3, §5, §8.1) ----------
   SysML's types are types of their own (sysml.Block), each declared once below as a UML metaclass, the stereotype it implies
   and the UML type it is projected to (§3.2). Read by the stereotype check (UML_META_AS: a user profile extending Class fits a
   block), the keywords it knows, and SYS_AS_UML, the projection that lets the internal block and parametric types lay their
   views out with the composite structure type's geometry (§8.1). Also here: the frame every SysML view is drawn in, its shape
   and header (§5), the containment line's crosshair end (§6.2), the mapping back of what the composite type's hooks add, and
   the composite type's problems re-said in SysML's words. Top-level names carry SYS_ (one scope in lib/umlimator-all.js).
   Only lib/umlimator-all.js holds this file. */

const SYS_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), SYS_ARR = x => (Array.isArray(x) ? x : []);
const SYS_PROPS = x => (SYS_OBJ(x && x.props) ? x.props : {});

// the table (§3.2): type, UML metaclass, implied stereotype (- none: a property's kind follows from its type, a port's from
// props.kind), projected type (- none)
const SYS_TABLE = Object.create(null);
`Requirement Class requirement uml.Class
TestCase Behavior testCase uml.Class
Block Class block uml.Class
InterfaceBlock Class interfaceBlock uml.Class
ConstraintBlock Class constraintBlock uml.Class
ValueType DataType valueType uml.DataType
PartProperty Property - uml.Property
ReferenceProperty Property - uml.Property
ValueProperty Property - uml.Property
ConstraintProperty Property - uml.Property
FlowProperty Property flowProperty uml.Property
ConstraintParameter Property - uml.Port
Port Port - uml.Port
Connector Connector - uml.Connector
BindingConnector Connector bindingConnector uml.Connector
DeriveReqt Abstraction deriveReqt -
Satisfy Abstraction satisfy -
Verify Abstraction verify -
Refine Abstraction refine -
Trace Abstraction trace -
Copy Abstraction copy -`.split('\n').forEach(row => { const [t, meta, st, as] = row.split(' '), no = x => (x === '-' ? null : x);
  SYS_TABLE['sysml.' + t] = { meta, st: no(st), as: no(as) }; UML_META_AS['sysml.' + t] = meta; });
// SysML's stereotype names are known keywords (§3.3): the table's, the others SysML defines, and the five requirement kinds
// Mermaid writes (§12.2), so «rationale» in an applied profile's scope is not warned
[...Object.values(SYS_TABLE).map(r => r.st).filter(Boolean), ...('proxy full rationale problem allocate allocated equal nestedConnectorEnd participantProperty conform expose view viewpoint stakeholder overrides '
  + 'functionalRequirement interfaceRequirement performanceRequirement physicalRequirement designConstraint').split(' ')].forEach(s => STY_FREE.add(styKey(s)));

// a requirement's containment line ends at its owner in a crosshair (§6.2): a 14 px circle with a cross, hollow
ENDS.crosshair = [14, 7, 'M0 7A7 7 0 1 0 14 7A7 7 0 1 0 0 7ZM7 0V14M0 7H14', 'hollow'];
LEGEND_ENDS.crosshair = '<path d="M14 8A6 6 0 1 0 26 8A6 6 0 1 0 14 8ZM20 2V14M14 8H26" fill="var(--um-panel)"/>';

/* ---- the frame (§5): SysML's diagram frame, its header `kind [ElementType] name [view title]` in the pentagon tag ---- */
const SYS_KIND = { 'sysml.requirement': ['req', 'Requirement diagram'], 'sysml.block-definition': ['bdd', 'Block definition diagram'],
  'sysml.internal-block': ['ibd', 'Internal block diagram'], 'sysml.parametric': ['par', 'Parametric diagram'] };
// the element each kind's frame may name (§17: req and bdd a package, ibd a block, par a block or a constraint block); a
// subject of another type, or none: [Model]
const SYS_PKG = { 'uml.Package': 'Package' }, SYS_BLK = { 'sysml.Block': 'Block' };
const SYS_EL = { 'sysml.requirement': SYS_PKG, 'sysml.block-definition': SYS_PKG, 'sysml.internal-block': SYS_BLK, 'sysml.parametric': { ...SYS_BLK, 'sysml.ConstraintBlock': 'ConstraintBlock' } };
// the header and the frame's accessible name: "bdd [Package] E-bike [E-bike blocks]", "Block definition diagram of package
// E-bike: E-bike blocks"; with no subject, [Model] and the model's title (§5.2). A title equal to the name is left out
function SYS_HEAD(model, view) {
  const [k, word] = SYS_KIND[view.diagram] || ['', 'Diagram'], E = SYS_EL[view.diagram] || {};
  const s = view.subject == null ? null : SYS_ARR(model && model.nodes).find(n => SYS_OBJ(n) && n.id === view.subject && Object.hasOwn(E, n.type));
  const el = s ? E[s.type] : 'Model', name = s ? elName(s) : String((model && model.title) ?? ''), t = view.title == null || String(view.title) === name ? '' : String(view.title);
  return { el: s || null, title: [k, `[${el}]`, name, t && `[${t}]`].filter(Boolean).join(' '),
    // from its parts: no name (no subject, the model untitled) leaves no space before the colon (audit 33: "model : E-bike blocks")
    aria: ([word, 'of', el.replace(/(.)([A-Z])/g, '$1 $2').toLowerCase(), name].map(x => x.trim()).filter(Boolean).join(' ') + (t ? ': ' + t : '')).replace(/ +/g, ' ').trim() };
}
// a req or bdd view's frame, a box of the layout holding nodeIds (§5.1): the subject's id when it names one (selecting the frame
// selects the package), else `<view>->frame`, which no element has (the canvas maps it to the view's subject or none). Its
// header room is 38 px (head 14 over the 24 a box has), so 64 px lie between its top and its cards, down or right, room for the
// 17 px tag
function SYS_FRAME(model, view, nodeIds) {
  const h = SYS_HEAD(model, view);
  return { id: h.el ? h.el.id : `${view.id}->frame`, label: h.title, title: h.title, nodeIds, shape: 'sysml-frame', head: 14, aria: h.aria, edit: SYS_EDIT(view, h) };
}
// what F2 on a frame edits, its field filled with it (src/canvas/render.js): the subject's name, else the view's title. The
// header is label and title, drawn whole; F2 filled with it stored the whole header as the name or title (audit 20)
const SYS_EDIT = (view, h) => (h.el ? elName(h.el) : String(view.title ?? ''));
// F2 on a req or bdd frame that is no element (`<view>->frame`): the view's title (§5.1); else null (audit 19: bdd's too).
// An emptied field removes the title (audit 21): SYS_FRAME_EMPTY is the rename hooks' rename.empty, so F2 passes '' on
const SYS_FRAME_RENAME = (view, id, text) => (id === `${view.id}->frame` ? [{ op: 'set', view: view.id, path: 'title', value: String(text).trim() ? String(text) : undefined }] : null);
const SYS_FRAME_EMPTY = (model, view, id) => !!view && id === `${view.id}->frame`;
// its shape: a rectangle and the tag, cut to the frame's width (src/uml/frame.js)
SHAPE['sysml-frame'] = {
  frame: f => `<rect class="family-box" x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(f.h)}" stroke="var(--um-muted)"/>`
    + frameTag(f.x, f.y, String(f.title ?? f.label ?? f.id), f.w).replace('<text ', () => `<text class="family-title" data-t="ft" data-o="${esc(f.id)}" `),
};

/* ---- the projection (§8.1): an internal block or parametric view as a composite structure view, on a copy ---- */
// the subject's members each kind shows (a constraint block subject's parameters too, on its frame), and its line type
const SYS_KEEP = { 'sysml.internal-block': ['sysml.PartProperty', 'sysml.ReferenceProperty', 'sysml.ValueProperty', 'sysml.Port'], 'sysml.parametric': ['sysml.ConstraintProperty', 'sysml.ValueProperty'] };
const SYS_LINE = { 'sysml.internal-block': 'sysml.Connector', 'sysml.parametric': 'sysml.BindingConnector' };
const SYS_KINDWORD = { proxy: '«proxy» ', full: '«full» ' };
/* -> { model, view }: every SysML element the view kind draws takes its projected type (§3.2), ids unchanged; what it does not
   draw keeps its SysML type, which the composite type passes over (the subject's other members, the other kind's lines, a
   parameter on an ibd), so every node, member and line keeps its index and a problem's path names the original. Before the
   layout measures them: a reference property is shared, a port's type loses its ~ and its name takes «proxy» or «full», a
   connector's item flow is its label. The view: drawn by uml.composite-structure */
function SYS_AS_UML(model, view) {
  const par = view.diagram === 'sysml.parametric', sid = view.subject, line = SYS_LINE[view.diagram];
  const S = SYS_ARR(model.nodes).find(n => SYS_OBJ(n) && n.id === sid), keep = new Set([...SYS_ARR(SYS_KEEP[view.diagram]), ...(par && S && S.type === 'sysml.ConstraintBlock' ? ['sysml.ConstraintParameter'] : [])]);
  const as = (x, on = true) => { const r = on && SYS_OBJ(x) && typeof x.type === 'string' ? SYS_TABLE[x.type] : null;
    if (!r || !r.as || (x.type === 'sysml.ConstraintParameter' && !par) || (r.as === 'uml.Connector' && x.type !== line)) return x;
    const y = { ...x, type: r.as }, p = SYS_PROPS(x);
    if (x.type === 'sysml.ReferenceProperty') y.props = { ...p, aggregation: 'shared' };
    if (x.type === 'sysml.Port') { if (typeof p.valueType === 'string' && p.valueType.startsWith('~')) y.props = { ...p, valueType: p.valueType.slice(1).trim() };
      if (Object.hasOwn(SYS_KINDWORD, p.kind)) y.label = SYS_KINDWORD[p.kind] + String(labelOr(x.label, x.id) ?? ''); } // with no label, the id, as the composite type names it
    if (SYS_OBJ(p.itemFlow) && p.itemFlow.item != null && p.itemFlow.item !== '') y.label = String(p.itemFlow.item); // an item flow's label wins (§8.1)
    return y; };
  const nodes = SYS_ARR(model.nodes).map(n => { const y = as(n); return SYS_OBJ(n) && Array.isArray(n.members) ? { ...y, members: n.members.map(m => as(m, n.id !== sid || keep.has(m && m.type))) } : y; });
  // the view's own lines (view.edges objects) projected as the model's are: an own connector drawn, named and checked as one (audit 23)
  const V = { ...view, diagram: 'uml.composite-structure', ...(Array.isArray(view.edges) ? { edges: view.edges.map(x => (SYS_OBJ(x) ? as(x) : x)) } : {}) };
  return { model: { ...model, nodes, edges: SYS_ARR(model.edges).map(e => as(e)), views: SYS_ARR(model.views).map(v => (v === view ? V : v)) }, view: V };
}

// a view's lines with their paths: the model's, then the view's own (view.edges objects, drawn as the model's are); one a model
// line's id (or an earlier own line's) takes is that one (audit 23, as clOwnLines and stProblems)
function SYS_LINES(model, view) {
  const out = SYS_ARR(model && model.edges).map((e, i) => [e, `edges[${i}]`]), ids = new Set(out.filter(([e]) => SYS_OBJ(e)).map(([e]) => e.id)), vi = SYS_ARR(model && model.views).indexOf(view);
  SYS_ARR(view && view.edges).forEach((e, j) => { if (SYS_OBJ(e) && typeof e.id === 'string' && !ids.has(e.id)) { ids.add(e.id); out.push([e, `views[${vi}].edges[${j}]`]); } });
  return out;
}

/* ---- what the composite type's hooks return on the projection, mapped back (§8.1): an element they add takes its SysML type,
   a name loses «proxy» or «full» (no command writes them into the model). A list, { commands, say }, { pick, then }, { error } ---- */
const SYS_PRIM = ['Real', 'Integer', 'Boolean', 'String'];
// the keyword with any spacing round it, as F2 reads it (SYS_IB_RENAME), never stored in the name (audit 27); alone it stays
const SYS_UNKIND = v => (typeof v === 'string' ? v.replace(/^\s*«(proxy|full)»\s*(?=\S)/, '') : v);
function SYS_BACK(r, model, view) {
  if (Array.isArray(r)) { // a member renamed to a name another member of its owner holds: refused (SYS_CLASH, audit 37)
    for (const c of r) { const b = SYS_OBJ(c) && c.op === 'set' && String(c.path) === 'label' ? SYS_MEMBER(model, c.id) : null, no = b && SYS_CLASH(b.owner, b.m, SYS_UNKIND(c.value)); if (no) return no; }
    // a member row added with a name its owner (a block) holds already: refused in the same words as the rename (audit 39)
    for (const c of r) { if (!SYS_OBJ(c) || c.op !== 'add' || c.owner == null || !SYS_OBJ(c.element)) continue;
      const o = SYS_NODE(model, c.owner), x = SYS_BACK_ONE(c, model, view).element, no = o && SYS_CLS.includes(o.type) && SYS_CLASH(o, {}, x.label, x.type, x.props); if (no) return no; } }
  if (Array.isArray(r)) return r.flatMap(c => { const b = SYS_BACK_ONE(c, model, view), m = SYS_OBJ(b) && b.op === 'set' && String(b.path) === 'label' ? SYS_MEMBER(model, b.id) : null;
    return [b, ...(m ? SYS_ROLES(model, m.m, m.owner, b.value) : [])]; });
  if (!SYS_OBJ(r)) return r;
  if (Array.isArray(r.commands)) { const c = SYS_BACK(r.commands, model, view); return Array.isArray(c) ? { ...r, commands: c } : c; }
  if (typeof r.then === 'function') return { ...r, then: i => SYS_BACK(r.then(i), model, view) };
  return r;
}
// a member by id, the first of an id, and the node it is a member of
function SYS_MEMBER(model, id) {
  for (const n of SYS_ARR(model && model.nodes)) if (SYS_OBJ(n)) for (const m of SYS_ARR(n.members)) if (SYS_OBJ(m) && m.id === id) return { m, owner: n };
  return null;
}
/* a part (or constraint) property renamed: each composite association whose whole is its owner and whose part end's role was its
   name takes the new name, in the same transaction, as connect made the two together (part-unlisted reads the role as the
   part's name, §7.2; audit 36). Only a role that names this part without doubt: its part end the block the part is typed by
   (part-agrees reads it so), and no other part of the owner of that name (audit 37). The model's lines and every view's own,
   each id's first as apply finds it */
const SYS_PARTS = ['sysml.PartProperty', 'sysml.ConstraintProperty'];
const SYS_NODE = (model, id) => SYS_ARR(model && model.nodes).find(n => SYS_OBJ(n) && n.id === id);
// the part end of e (at f) is the block m is typed by, or m is typed by nothing
function SYS_FAR_OK(model, e, f, m) {
  const t = SYS_VT(m), far = t != null && SYS_NODE(model, e[f]); return t == null || (!!far && elName(far) === t);
}
// another part of the owner a role naming m could name as well: of m's name, and of its type (or either typed by nothing)
const SYS_VT = x => { const t = SYS_PROPS(x).valueType; return t == null || t === '' ? null : String(t); };
const SYS_TWIN = (owner, m) => SYS_ARR(owner.members).some(x => SYS_OBJ(x) && x !== m && x.id !== m.id && SYS_PARTS.includes(x.type) && x.label === m.label
  && (SYS_VT(x) == null || SYS_VT(m) == null || SYS_VT(x) === SYS_VT(m)));
function SYS_ROLES(model, m, owner, label) {
  if (!SYS_OBJ(m) || !SYS_OBJ(owner) || !SYS_PARTS.includes(m.type) || typeof m.label !== 'string' || m.label === '' || typeof label !== 'string' || label === '' || label === m.label) return [];
  if (SYS_TWIN(owner, m)) return []; // two parts of one name and type: which one a role names is not known
  const seen = new Set(SYS_ARR(model.nodes).map(n => SYS_OBJ(n) && n.id)), out = [];
  [...SYS_ARR(model.edges), ...SYS_ARR(model.views).flatMap(v => (SYS_OBJ(v) ? SYS_ARR(v.edges) : []))].forEach(e => {
    if (!SYS_OBJ(e) || typeof e.id !== 'string' || seen.has(e.id)) return; seen.add(e.id);
    const E = SYS_PROPS(e).ends; if (e.type !== 'uml.Association' || !SYS_OBJ(E)) return;
    [['from', 'to'], ['to', 'from']].forEach(([w, f]) => { if (e[w] === owner.id && SYS_OBJ(E[w]) && E[w].aggregation === 'composite' && SYS_OBJ(E[f]) && E[f].role === m.label && SYS_FAR_OK(model, e, f, m))
      out.push({ op: 'set', id: e.id, path: `props.ends.${f}.role`, value: label }); }); });
  return out;
}
// a member renamed to a name another member of its owner holds: refused, in member-names' words (audit 37). Judged by
// member-names' own key, of the member as edited (audit 38): its new type, label and parameters, an operation by its
// parameters' types too ("ecoRange(Real)"), so an operation and a value may share a name and two values may not
const SYS_KEY = (type, label, P) => (type === 'uml.Operation' ? `${label}(${SYS_ARR(SYS_OBJ(P) ? P.parameters : null).map(a => (SYS_OBJ(a) ? a.valueType ?? '' : '')).join(',')})` : `${label}`);
const SYS_CLS = ['sysml.Block', 'sysml.InterfaceBlock', 'sysml.ConstraintBlock', 'sysml.ValueType']; // member-names' owners (blocks.js BD_CLS)
// m: the member as it was, {} for one being added
function SYS_CLASH(owner, m, label, type = SYS_OBJ(m) ? m.type : undefined, props = SYS_OBJ(m) ? m.props : undefined) {
  if (!SYS_OBJ(owner) || !SYS_OBJ(m) || typeof label !== 'string' || label === '') return null;
  const k = SYS_KEY(type, label, props); if (m.label != null && m.label !== '' && k === SYS_KEY(m.type, m.label, m.props)) return null; // a key kept is no rename
  const o = SYS_ARR(owner.members).find(x => SYS_OBJ(x) && x !== m && x.id !== m.id && x.label != null && x.label !== '' && SYS_KEY(x.type, x.label, x.props) === k);
  return o ? { error: `member-names: ${JSON.stringify(elName(owner))} has a member named ${JSON.stringify(label)} already (${o.id}): a block's members have different names` } : null;
}
/* the properties panel's field set (edits.field, src/typed/edit.js): a part's Name renames its part association's role, as F2
   does (SYS_ROLES); a composite association's Role, when its old role named a part of the whole, renames that part (and its
   other associations) with it. A name another member holds is refused (SYS_CLASH). Null: the plain set (audit 37) */
function SYS_FIELD(model, view, id, path, value) {
  const P = typeof path === 'string' ? path.split('.') : SYS_ARR(path).map(String), set = { op: 'set', id, path, value };
  if (P.length === 1 && P[0] === 'label') {
    const h = SYS_MEMBER(model, id); if (!h || typeof value !== 'string') return null;
    const no = SYS_CLASH(h.owner, h.m, value); if (no) return no;
    const roles = SYS_ROLES(model, h.m, h.owner, value); return roles.length ? [set, ...roles] : null;
  }
  if (P.length !== 4 || P[0] !== 'props' || P[1] !== 'ends' || (P[2] !== 'from' && P[2] !== 'to') || P[3] !== 'role') return null;
  const hit = SYS_LINES(model, view).find(([x]) => SYS_OBJ(x) && x.id === id), e = hit && hit[0], E = e && SYS_PROPS(e).ends, f = P[2], w = f === 'from' ? 'to' : 'from';
  if (!e || e.type !== 'uml.Association' || !SYS_OBJ(E) || !SYS_OBJ(E[w]) || E[w].aggregation !== 'composite' || !SYS_OBJ(E[f])) return null;
  const old = E[f].role, owner = SYS_NODE(model, e[w]); if (typeof old !== 'string' || old === '' || !owner || typeof value !== 'string' || value === '' || value === old) return null;
  const part = SYS_ARR(owner.members).find(x => SYS_OBJ(x) && SYS_PARTS.includes(x.type) && x.label === old);
  if (!part || SYS_TWIN(owner, part) || !SYS_FAR_OK(model, e, f, part)) return null;
  const no = SYS_CLASH(owner, part, value); if (no) return no;
  return [set, { op: 'set', id: part.id, path: 'label', value }, ...SYS_ROLES(model, part, owner, value).filter(c => !(c.id === e.id && c.path === `props.ends.${f}.role`))];
}
function SYS_BACK_ONE(c, model, view) {
  if (!SYS_OBJ(c)) return c;
  if (c.op === 'set' && String(c.path) === 'label') return { ...c, value: SYS_UNKIND(c.value) };
  const x = c.element; if (c.op !== 'add' || !SYS_OBJ(x)) return c;
  const p = SYS_PROPS(x), named = t => SYS_ARR(model.nodes).some(n => SYS_OBJ(n) && n.type === t && elName(n) === p.valueType), owner = SYS_ARR(model.nodes).find(n => SYS_OBJ(n) && n.id === c.owner);
  const type = x.type === 'uml.Connector' ? SYS_LINE[view.diagram] : x.type === 'uml.Port' ? (owner && owner.type === 'sysml.ConstraintBlock' ? 'sysml.ConstraintParameter' : 'sysml.Port')
    : x.type !== 'uml.Property' ? null : view.diagram === 'sysml.parametric' ? (named('sysml.ConstraintBlock') ? 'sysml.ConstraintProperty' : owner && owner.type === 'sysml.ConstraintBlock' ? 'sysml.ConstraintParameter' : 'sysml.ValueProperty') // a constraint block holds no value property (§7.3)
      : p.aggregation === 'shared' ? 'sysml.ReferenceProperty' : named('sysml.ValueType') || SYS_PRIM.includes(p.valueType) ? 'sysml.ValueProperty' : 'sysml.PartProperty';
  if (!type) return c;
  const { aggregation, ...rest } = p, props = type === 'sysml.ReferenceProperty' ? rest : p; // a reference is one by its type, not its aggregation
  return { ...c, element: { ...x, type, ...(x.label != null ? { label: SYS_UNKIND(x.label) } : {}), ...(x.props ? { props } : {}) } };
}

/* ---- the composite type's problems, re-said (§8.1): connector-part, connector-scope, connector-drawn, and part-type for part
   and reference properties only (a value property is value-type's to judge, a constraint property §9's), in SysML's words ---- */
const SYS_CS_KEEP = ['connector-part', 'connector-scope', 'connector-drawn', 'part-type'];
const SYS_SAY = [[/, or one collaboration's roles/g, ''], [/class or component/g, 'block'], [/the box has no line/g, 'the frame has no line']];
const SYS_SAY_PAR = [[/a connector joins/g, 'a binding joins'], [/ports and parts/g, 'parameters and properties'], [/not a part of the subject/g, 'not a constraint property of the subject'], [/not a port of/g, 'not a parameter of'], [/two ports of/g, 'two parameters of']];
// the props SysML draws as text that are not text (audit 40): a constraint block's expression, a value type's unit and quantity
// kind, each member's type, multiplicity and default (bdd's rows, ibd's and par's part names, the PDF's rows), said once a model
function SYS_TEXT_PROBLEMS(model) {
  const out = [];
  SYS_ARR(model && model.nodes).forEach((n, i) => { if (!SYS_OBJ(n) || typeof n.type !== 'string' || !n.type.startsWith('sysml.')) return; const at = `nodes[${i}]`;
    out.push(...propTextProblems(n, at, n.type === 'sysml.ConstraintBlock' ? ['constraint'] : n.type === 'sysml.ValueType' ? ['unit', 'quantityKind'] : []));
    // an operation's return type and parameters too, drawn in its row as the class view's are (audit 41)
    SYS_ARR(n.members).forEach((m, j) => out.push(...propTextProblems(m, `${at}.members[${j}]`, ['valueType', 'multiplicity', 'default', 'returnType', 'direction']), // a flow property's direction too (audit 43)
      ...paramTextProblems(m, `${at}.members[${j}]`))); });
  return out;
}
function SYS_CS_PROBLEMS(model, view) {
  const P = SYS_AS_UML(model, view), kind = new Map(SYS_ARR(model.nodes).flatMap(n => SYS_OBJ(n) ? SYS_ARR(n.members).filter(SYS_OBJ).map(m => [m.id, m.type]) : []));
  const say = [...SYS_SAY, ...(view.diagram === 'sysml.parametric' ? SYS_SAY_PAR : [])];
  return csProblems(P.model, P.view).filter(p => SYS_CS_KEEP.includes(p.rule) && (p.rule !== 'part-type' || ['sysml.PartProperty', 'sysml.ReferenceProperty'].includes(kind.get(p.ids[0]))))
    .map(p => ({ ...p, message: say.reduce((t, [re, w]) => t.replace(re, w), p.message) }));
}

/* ---- the dressing shared by ibd and par (§8.1), on a copy of what the composite type laid out: the subject's box is the frame,
   its header the title. A subject holding no part is no box there (the layout makes no box round no card): its card, sized by
   the composite type for its ports, is taken out and the frame drawn at its bounds, its ports on the frame's border (§17).
   names(id), when given, an element's accessible name in SysML's words (the type's, §13) ---- */
// the internal block and parametric legends' keys for a listed line of another kind (a dependency): each as the composite type
// draws and keys it (class.js legendOf: "Dependency", "Line"), after the view's own connector or binding (audit 28)
const SYS_OTHER_KEYS = edges => legendOf(edges.filter(e => e.type !== 'uml.Connector' && e.type !== 'uml.CommentLink'));
function SYS_DRESS(g, model, view, names) {
  const h = SYS_HEAD(model, view), said = x => (names && names(x.id)) || x.aria, map = new Map(), sid = view.subject;
  const card = g.byId && Object.hasOwn(g.byId, sid) ? g.byId[sid] : null, frame = { shape: 'sysml-frame', title: h.title, label: h.title, aria: h.aria, ...(h.el ? { edit: SYS_EDIT(view, h) } : {}) };
  const nodes = SYS_ARR(g.nodes).filter(n => n !== card).map(n => { const y = names ? { ...n, aria: said(n) } : n; map.set(n, y); return y; });
  const byId = idTable(Object.fromEntries(Object.entries(g.byId || {}).filter(([k]) => k !== sid || !card).map(([k, n]) => [k, map.get(n) || n])));
  return { ...g, nodes, byId, edges: names ? SYS_ARR(g.edges).map(e => ({ ...e, aria: said(e) })) : g.edges,
    families: [...(card ? [{ id: sid, x: card.x, y: card.y, w: card.w, h: card.h, nodeIds: [], ...frame }] : []), ...SYS_ARR(g.families).map(f => (f.id === sid ? { ...f, ...frame } : f))] };
}

export { SYS_TABLE, SYS_KIND, SYS_HEAD, SYS_FRAME, SYS_FRAME_RENAME, SYS_FRAME_EMPTY, SYS_AS_UML, SYS_LINES, SYS_BACK, SYS_ROLES, SYS_CLASH, SYS_FIELD, SYS_PARTS, SYS_CS_PROBLEMS, SYS_TEXT_PROBLEMS, SYS_DRESS, SYS_OTHER_KEYS };
