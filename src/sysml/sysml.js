import { esc } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { ENDS } from '../typed/draw.js';
import { frameTag } from '../uml/frame.js';
import { LEGEND_ENDS } from '../uml/class.js';
import { STY_FREE, UML_META_AS, styKey } from '../uml/stereotypes.js';
import { csProblems } from '../uml/composite.js';

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
// the element a frame may name (§17: req and bdd a package, ibd a block, par a block or a constraint block); none: [Model]
const SYS_EL = { 'uml.Package': 'Package', 'sysml.Block': 'Block', 'sysml.ConstraintBlock': 'ConstraintBlock' };
// the header and the frame's accessible name: "bdd [Package] E-bike [E-bike blocks]", "Block definition diagram of package
// E-bike: E-bike blocks"; with no subject, [Model] and the model's title (§5.2). A title equal to the name is left out
function SYS_HEAD(model, view) {
  const [k, word] = SYS_KIND[view.diagram] || ['', 'Diagram'], s = SYS_ARR(model && model.nodes).find(n => SYS_OBJ(n) && n.id === view.subject && Object.hasOwn(SYS_EL, n.type));
  const el = s ? SYS_EL[s.type] : 'Model', name = String(s ? s.label ?? s.id : (model && model.title) ?? ''), t = view.title == null || String(view.title) === name ? '' : String(view.title);
  return { el: s || null, title: [k, `[${el}]`, name, t && `[${t}]`].filter(Boolean).join(' '),
    aria: `${word} of ${el.replace(/(.)([A-Z])/g, '$1 $2').toLowerCase()} ${name}${t ? ': ' + t : ''}`.replace(/ +/g, ' ').trim() };
}
// a req or bdd view's frame, a box of the layout holding nodeIds (§5.1): the subject's id when it names one (selecting the frame
// selects the package), else `<view>->frame`, which no element has (the canvas maps it to the view's subject or none); 38 px
// above its cards (head 14 over the 24 a box has), room for the 17 px tag
function SYS_FRAME(model, view, nodeIds) {
  const h = SYS_HEAD(model, view);
  return { id: h.el ? h.el.id : `${view.id}->frame`, label: h.title, title: h.title, nodeIds, shape: 'sysml-frame', head: 14, aria: h.aria };
}
// its shape: a rectangle and the tag, cut to the frame's width (src/uml/frame.js)
SHAPE['sysml-frame'] = {
  frame: f => `<rect class="family-box" x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(f.h)}" stroke="var(--um-muted)"/>`
    + frameTag(f.x, f.y, String(f.title ?? f.label ?? f.id), f.w).replace('<text ', `<text class="family-title" data-t="ft" data-o="${esc(f.id)}" `),
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
      if (Object.hasOwn(SYS_KINDWORD, p.kind)) y.label = SYS_KINDWORD[p.kind] + (x.label ?? ''); }
    if (SYS_OBJ(p.itemFlow) && p.itemFlow.item != null && p.itemFlow.item !== '') y.label = String(p.itemFlow.item); // an item flow's label wins (§8.1)
    return y; };
  const nodes = SYS_ARR(model.nodes).map(n => { const y = as(n); return SYS_OBJ(n) && Array.isArray(n.members) ? { ...y, members: n.members.map(m => as(m, n.id !== sid || keep.has(m && m.type))) } : y; });
  const V = { ...view, diagram: 'uml.composite-structure' };
  return { model: { ...model, nodes, edges: SYS_ARR(model.edges).map(e => as(e)), views: SYS_ARR(model.views).map(v => (v === view ? V : v)) }, view: V };
}

/* ---- what the composite type's hooks return on the projection, mapped back (§8.1): an element they add takes its SysML type,
   a name loses «proxy» or «full» (no command writes them into the model). A list, { commands, say }, { pick, then }, { error } ---- */
const SYS_PRIM = ['Real', 'Integer', 'Boolean', 'String'];
const SYS_UNKIND = v => (typeof v === 'string' ? v.replace(/^«(proxy|full)» /, '') : v);
function SYS_BACK(r, model, view) {
  if (Array.isArray(r)) return r.map(c => SYS_BACK_ONE(c, model, view));
  if (!SYS_OBJ(r)) return r;
  if (Array.isArray(r.commands)) return { ...r, commands: SYS_BACK(r.commands, model, view) };
  if (typeof r.then === 'function') return { ...r, then: i => SYS_BACK(r.then(i), model, view) };
  return r;
}
function SYS_BACK_ONE(c, model, view) {
  if (!SYS_OBJ(c)) return c;
  if (c.op === 'set' && String(c.path) === 'label') return { ...c, value: SYS_UNKIND(c.value) };
  const x = c.element; if (c.op !== 'add' || !SYS_OBJ(x)) return c;
  const p = SYS_PROPS(x), named = t => SYS_ARR(model.nodes).some(n => SYS_OBJ(n) && n.type === t && n.label === p.valueType), owner = SYS_ARR(model.nodes).find(n => SYS_OBJ(n) && n.id === c.owner);
  const type = x.type === 'uml.Connector' ? SYS_LINE[view.diagram] : x.type === 'uml.Port' ? (owner && owner.type === 'sysml.ConstraintBlock' ? 'sysml.ConstraintParameter' : 'sysml.Port')
    : x.type !== 'uml.Property' ? null : view.diagram === 'sysml.parametric' ? (named('sysml.ConstraintBlock') ? 'sysml.ConstraintProperty' : 'sysml.ValueProperty')
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
function SYS_DRESS(g, model, view, names) {
  const h = SYS_HEAD(model, view), said = x => (names && names(x.id)) || x.aria, map = new Map(), sid = view.subject;
  const card = g.byId && Object.hasOwn(g.byId, sid) ? g.byId[sid] : null, frame = { shape: 'sysml-frame', title: h.title, label: h.title, aria: h.aria };
  const nodes = SYS_ARR(g.nodes).filter(n => n !== card).map(n => { const y = names ? { ...n, aria: said(n) } : n; map.set(n, y); return y; });
  const byId = Object.fromEntries(Object.entries(g.byId || {}).filter(([k]) => k !== sid || !card).map(([k, n]) => [k, map.get(n) || n]));
  return { ...g, nodes, byId, edges: names ? SYS_ARR(g.edges).map(e => ({ ...e, aria: said(e) })) : g.edges,
    families: [...(card ? [{ id: sid, x: card.x, y: card.y, w: card.w, h: card.h, nodeIds: [], ...frame }] : []), ...SYS_ARR(g.families).map(f => (f.id === sid ? { ...f, ...frame } : f))] };
}

export { SYS_TABLE, SYS_KIND, SYS_HEAD, SYS_FRAME, SYS_AS_UML, SYS_BACK, SYS_CS_PROBLEMS, SYS_DRESS };
