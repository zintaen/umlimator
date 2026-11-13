import { TYPED } from '../core/registry.js';
import { multBounds } from './class.js';

/* ---------- stereotypes applied across the model (work package 6.2, notes/stage-6.md §5) ----------
   A profile (uml.Profile) defines stereotypes (uml.Stereotype, their tag definitions uml.Property members) that extend
   metaclasses (uml.Extension to a uml.MetaclassReference); a uml.ProfileApplication from a package applies it to everything
   the package owns, at any depth (§5.2). Every element of the model that names a stereotype in props.stereotypes is checked
   here, whatever view draws it: the name (§5.3), the metaclass it fits (§5.4), required extensions (§5.5) and its tags,
   props.tags keyed by stereotype then tag (§5.6). Fills two slots of the core (src/core/registry.js's TYPED):
   - TYPED.across(model) -> problems, which validate() runs once on a version-2 model: [] at once when it holds no profile;
   - TYPED.fields(model, element) -> the panel's fields for the element's tags, after its type's own (§5.7).
   appliedOf(model, id) is what the profile type and the PDF read. Only lib/umlimator-all.js holds this file. */

const STY_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), STY_ARR = x => (Array.isArray(x) ? x : []);
const styKey = s => s.charAt(0).toLowerCase() + s.slice(1); // names meet with the first letter in either case (§5.3): Entity is «entity»
const styName = x => String(x.label ?? x.id), styQ = x => JSON.stringify(styName(x));

/* UML 2.5.1's metaclasses (§5.4), each with its generals, nearest first: a row "A B: C D" says A and B specialize C, then D.
   A row for every uml.* type a registered type uses (tests/stereotypes.test.mjs holds it), and the abstract ones between */
const UML_META = {};
`Element:
NamedElement MultiplicityElement TemplateableElement ParameterableElement Comment Slot Relationship: Element
Namespace RedefinableElement TypedElement PackageableElement DeploymentTarget DeployedArtifact Vertex ActivityGroup InteractionFragment Lifeline Message CollaborationUse: NamedElement
Type Constraint: PackageableElement
IntervalConstraint: Constraint
DurationConstraint TimeConstraint: IntervalConstraint
ConnectableElement: TypedElement ParameterableElement
Classifier: Namespace Type RedefinableElement TemplateableElement
StructuredClassifier BehavioredClassifier Interface DataType Artifact InformationItem Signal: Classifier
EncapsulatedClassifier: StructuredClassifier
Class: EncapsulatedClassifier BehavioredClassifier
Component Node Stereotype Behavior: Class
Activity StateMachine: Behavior
Interaction: Behavior InteractionFragment
Device ExecutionEnvironment: Node
Actor UseCase: BehavioredClassifier
Collaboration: StructuredClassifier BehavioredClassifier
Association: Relationship Classifier
Extension CommunicationPath: Association
Enumeration PrimitiveType: DataType
DeploymentSpecification: Artifact
Package: Namespace PackageableElement TemplateableElement
Profile Model: Package
Feature: RedefinableElement
StructuralFeature: TypedElement MultiplicityElement Feature
Property: StructuralFeature ConnectableElement DeploymentTarget
Port: Property
BehavioralFeature: Feature Namespace
Operation: BehavioralFeature
Connector: Feature
InstanceSpecification: PackageableElement DeploymentTarget DeployedArtifact
EnumerationLiteral: InstanceSpecification
DirectedRelationship: Relationship
Dependency: DirectedRelationship PackageableElement
Usage Abstraction Deployment: Dependency
Realization Manifestation: Abstraction
InterfaceRealization ComponentRealization: Realization
Generalization PackageImport PackageMerge ProfileApplication InformationFlow ElementImport: DirectedRelationship
Include Extend: DirectedRelationship NamedElement
MetaclassReference: ElementImport
ActivityNode ActivityEdge Region Transition ExtensionPoint: RedefinableElement
ExecutableNode ControlNode ObjectNode: ActivityNode
Action: ExecutableNode
InvocationAction AcceptEventAction: Action
CallAction SendSignalAction: InvocationAction
CallBehaviorAction: CallAction
InitialNode DecisionNode MergeNode ForkNode JoinNode FinalNode: ControlNode
ActivityFinalNode FlowFinalNode: FinalNode
CentralBufferNode: ObjectNode
DataStoreNode: CentralBufferNode
ControlFlow ObjectFlow: ActivityEdge
ActivityPartition: ActivityGroup
State: Namespace Vertex RedefinableElement
Pseudostate: Vertex
FinalState: State
CombinedFragment InteractionUse: InteractionFragment
InteractionOperand: InteractionFragment Namespace`.split('\n').forEach(row => { const [a, b] = row.split(':'), g = b.trim() ? b.trim().split(' ') : []; a.split(' ').forEach(n => { UML_META[n] = g; }); });
Object.assign(UML_META, { Region: ['Namespace', 'RedefinableElement'], Transition: ['Namespace', 'RedefinableElement'] }); // through Namespace too
// the registry's types that are no metaclass, and what they are (§5.4); null: no stereotype fits it
const UML_AS = { InternalTransition: 'Transition', Subject: 'Classifier', Link: 'InstanceSpecification', RoleBinding: 'Dependency', CommentLink: null };
// a uml.* element's metaclass, null for none, undefined for an element of no UML type (a sysml. one is not checked, §5.4)
const metaOf = x => typeof x.type !== 'string' || !x.type.startsWith('uml.') ? undefined : Object.hasOwn(UML_AS, x.type.slice(4)) ? UML_AS[x.type.slice(4)] : x.type.slice(4);
const META_UP = new Map();
// a metaclass and every metaclass it specializes; a name in no row is only itself
function metaUp(name) {
  if (!META_UP.has(name)) { const out = new Set([name]); META_UP.set(name, out); (Object.hasOwn(UML_META, name) ? UML_META[name] : []).forEach(g => metaUp(g).forEach(x => out.add(x))); }
  return META_UP.get(name);
}
const metaKnown = name => Object.hasOwn(UML_META, name);

// UML's standard profile (clause 22) and UML's keywords (Annex C): free keywords inside an applied profile (§5.3, 3)
const STY_FREE = new Set(('auxiliary buildComponent call create derive destroy document entity executable file focus framework implement implementationClass instantiate library metaclass '
  + 'modelLibrary process realization refine responsibility script send service source specification subsystem systemModel trace type utility '
  + 'access activity actor after all apply artifact at centralBuffer component dataStore datastore dataType decisionInput deploy deploymentSpec device else enumeration '
  + 'executionEnvironment extend external from import include information interface iterative localPostcondition localPrecondition manifest merge metamodel model '
  + 'multicast multireceive occurrence parallel postcondition precondition primitive profile representation selection signal statemachine stereotype stream structured '
  + 'transformation use when').split(' ').map(styKey));

const STY_RULES = {
  'stereotype-unknown': 'a stereotype applied inside an applied profile\'s scope is one of its stereotypes, a standard one or a UML keyword',
  'stereotype-applied': 'a stereotype of a profile is applied only where that profile is applied',
  'stereotype-ambiguous': 'a name two applied profiles define is written Profile::name',
  'stereotype-extends': 'an applied stereotype extends the element\'s metaclass or one it specializes',
  'stereotype-abstract': 'an abstract stereotype is not applied',
  'stereotype-required': 'an abstract required stereotype is met by a specialization the element applies',
  'tag-defined': 'each tag is under a stereotype the element has, and that stereotype or a general defines it; a redefined tag keeps its type',
  'tag-value': 'a tag\'s value fits its type',
  'tag-required': 'a tag of lower bound 1 with no default has a value',
};

/* The model read once (§12): its elements with their paths and the id whose scope they take, profiles, stereotypes by name,
   applications, generals, extensions; scopes memoised per owner. Kept per model object for appliedOf and fields */
// ponytail: kept per model object, so a model edited in place keeps its first reading until TYPED.across reads it again;
// apply() returns a new model, so the canvas never does. A version stamp per model is the upgrade if a host edits in place
const STY_SEEN = new WeakMap();
function styIndex(model) {
  const at = new Map(), up = new Map(), rec = new Map(), els = []; // up: an element's owner (§5.2); a view's own elements have none
  const put = (x, path, own, scoped) => { if (!STY_OBJ(x) || typeof x.id !== 'string') return; const r = { x, path, own: scoped ? own : undefined, line: scoped && (x.from != null || x.to != null) };
    if (!at.has(x.id)) { at.set(x.id, x); rec.set(x.id, r); if (scoped) up.set(x.id, own); }
    els.push(r); STY_ARR(x.members).forEach((m, j) => put(m, `${path}.members[${j}]`, x.id, scoped)); };
  STY_ARR(model.nodes).forEach((n, i) => put(n, `nodes[${i}]`, n && n.parent, true));
  // a line's owner: its parent, else its from end's owner (§5.2), read once every node and member is in
  STY_ARR(model.edges).forEach((e, i) => put(e, `edges[${i}]`, undefined, true));
  els.forEach(r => { if (r.line) { r.own = r.x.parent != null ? r.x.parent : up.get(r.x.from); if (rec.get(r.x.id) === r) up.set(r.x.id, r.own); } });
  STY_ARR(model.views).forEach((v, k) => { if (STY_OBJ(v)) ['nodes', 'edges', 'fragments'].forEach(f => STY_ARR(v[f]).forEach((x, j) => put(x, `views[${k}].${f}[${j}]`, undefined, false))); }); // a view's own: no scope
  const isT = (id, t) => (at.get(id) || {}).type === t, profiles = [...at.values()].filter(x => x.type === 'uml.Profile');
  const I = { at, rec, els, profiles, byProfile: new Map(), byName: new Map(), byLabel: new Map(), enums: new Map(), applied: new Map(), gens: new Map(), ext: new Map(), req: new Map(), memo: new Map(), cache: new Map(), defsOf: new Map(), upOf: new Map(), probs: [] };
  if (!profiles.length) return I;
  profiles.forEach(p => { I.byProfile.set(p.id, new Map()); I.enums.set(p.id, new Map()); if (!I.byLabel.has(styName(p))) I.byLabel.set(styName(p), p); });
  [...at.values()].forEach(x => { if (!I.byProfile.has(x.parent) || up.get(x.id) !== x.parent) return; const k = styKey(styName(x));
    if (x.type === 'uml.Stereotype' && !I.byProfile.get(x.parent).has(k)) { I.byProfile.get(x.parent).set(k, x); if (!I.byName.has(k)) I.byName.set(k, []); I.byName.get(k).push(at.get(x.parent)); }
    if (x.type === 'uml.Enumeration') I.enums.get(x.parent).set(styName(x), STY_ARR(x.members).filter(m => STY_OBJ(m) && m.type === 'uml.EnumerationLiteral').map(styName)); });
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  STY_ARR(model.edges).forEach(e => { if (!STY_OBJ(e)) return;
    if (e.type === 'uml.ProfileApplication' && isT(e.to, 'uml.Profile') && at.has(e.from)) add(I.applied, e.from, e.to);
    if (e.type === 'uml.Generalization' && isT(e.from, 'uml.Stereotype') && isT(e.to, 'uml.Stereotype')) add(I.gens, e.from, e.to);
    if (e.type === 'uml.Extension' && isT(e.from, 'uml.Stereotype') && isT(e.to, 'uml.MetaclassReference')) { const meta = styName(at.get(e.to)); add(I.ext, e.from, meta);
      const p = at.get(e.from).parent; if (STY_OBJ(e.props) && e.props.isRequired === true && I.byProfile.has(p)) add(I.req, p, { st: at.get(e.from), meta }); } });
  // the profiles applied to an owner and its owners: memoised per owner, so no element walks its chain on its own
  I.scope = id => { if (id == null || !at.has(id)) return []; if (I.memo.has(id)) return I.memo.get(id); I.memo.set(id, []); // a cycle (the core's error) ends here
    const above = I.scope(up.get(id)), mine = (I.applied.get(id) || []).filter(p => !above.includes(p)), s = mine.length ? [...above, ...mine] : above; I.memo.set(id, s); return s; };
  return I;
}
const styOf = model => { if (!STY_SEEN.has(model)) STY_SEEN.set(model, styIndex(model)); return STY_SEEN.get(model); };

// a stereotype's generals, nearest first, each once
function styGenerals(I, st) {
  if (I.upOf.has(st.id)) return I.upOf.get(st.id);
  const out = [], seen = new Set([st.id]);
  for (let i = 0, q = [st.id]; i < q.length; i++) STY_ARR(I.gens.get(q[i])).forEach(g => { if (!seen.has(g)) { seen.add(g); q.push(g); out.push(I.at.get(g)); } });
  I.upOf.set(st.id, out); return out;
}
// its tag definitions, its generals' first, a specialization's redefining a general's of one name (§5.6): name -> { def, st }
function styDefs(I, st) {
  if (I.defsOf.has(st.id)) return I.defsOf.get(st.id);
  const out = new Map(); I.defsOf.set(st.id, out);
  [...styGenerals(I, st)].reverse().concat(st).forEach(s => STY_ARR(s.members).forEach(d => { if (!STY_OBJ(d) || d.type !== 'uml.Property') return; const was = out.get(styName(d)), t = x => STY_OBJ(x.props) ? x.props.valueType ?? 'String' : 'String';
    if (was && was.st !== s && t(was.def) !== t(d)) I.probs.push(stySay('tag-defined', 'warning', styPath(I, d), [d.id, was.def.id], `«${styName(s)}» redefines tag "${styName(d)}" of «${styName(was.st)}» as ${t(d)}, not ${t(was.def)}`));
    out.set(styName(d), { def: d, st: s }); }));
  return out;
}
const styFits = (I, st, meta) => [st, ...styGenerals(I, st)].some(s => STY_ARR(I.ext.get(s.id)).some(m => metaUp(meta).has(m)));
const stySay = (rule, level, path, ids, msg) => ({ level, rule, path, ids, message: `${rule}: ${msg}` });
const styPath = (I, x) => I.rec.get(x.id).path;

// a tag's value against its type (§5.6): Boolean, Integer, Real, UnlimitedNatural, an enumeration of the profile, else any text
function styTagFits(I, def, prof, v) {
  const t = STY_OBJ(def.props) ? def.props.valueType : null, s = String(v);
  if (t === 'Boolean') return s === 'true' || s === 'false' || 'true or false';
  if (t === 'Integer') return /^-?\d+$/.test(s) || 'a whole number';
  if (t === 'Real') return /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) || 'a number';
  if (t === 'UnlimitedNatural') return /^(\d+|\*)$/.test(s) || 'a whole number or *';
  const lits = prof && I.enums.get(prof.id).get(t);
  return !lits || lits.includes(s) || `one of ${lits.join(', ')}`;
}

/* One element's stereotypes, resolved by §5.3, with the required ones its scope supplies (§5.5) and their tags (§5.6):
   [{ stereotype, profile, key, required, tags: [{ name, def, value }] }], key the name props.tags keys it by. say: problems */
function styResolve(I, r, say) {
  const { x, path } = r, P = STY_OBJ(x.props) ? x.props : {}, scope = I.scope(r.own), meta = metaOf(x);
  const names = p => p.map(styName).join(' and '), owner = I.at.get(r.own), out = [];
  STY_ARR(P.stereotypes).forEach((s, k) => { if (typeof s !== 'string' || !s) return; const at = `${path}.props.stereotypes[${k}]`, q = s.indexOf('::');
    let hit = null;
    if (q > 0) { const p = I.byLabel.get(s.slice(0, q)), st = p && I.byProfile.get(p.id).get(styKey(s.slice(q + 2)));
      if (!st) return say(stySay('stereotype-unknown', 'warning', at, [x.id], `«${s}» on ${styQ(x)}: ${p ? `profile ${styName(p)} defines no stereotype ${s.slice(q + 2)}` : `no profile is named ${s.slice(0, q)}`}`));
      hit = { st, p }; }
    else { const k2 = styKey(s), here = scope.map(id => I.at.get(id)).filter(p => I.byProfile.get(p.id).has(k2));
      if (here.length > 1) return say(stySay('stereotype-ambiguous', 'warning', at, [x.id, ...here.map(p => p.id)], `«${s}» on ${styQ(x)} is a stereotype of ${names(here)}, both applied: write ${here.map(p => `${styName(p)}::${s}`).join(' or ')}`));
      if (here.length) hit = { st: I.byProfile.get(here[0].id).get(k2), p: here[0] };
      else if (STY_FREE.has(k2)) return; // a standard stereotype or a keyword
      else if (scope.length) return say(stySay('stereotype-unknown', 'warning', at, [x.id], `«${s}» on ${styQ(x)} is no stereotype of ${names(scope.map(id => I.at.get(id)))}, applied here, and no standard one`));
      else if (I.byName.has(k2)) { const ps = I.byName.get(k2); return say(stySay('stereotype-applied', 'warning', at, [x.id, ...ps.map(p => p.id)], `«${s}» is a stereotype of ${names(ps)}, which is not applied to ${owner ? `${styName(owner)} or its owners` : `any owner of ${styQ(x)}`}`)); }
      else return; }
    if (out.some(e => e.stereotype === hit.st)) return;
    if (!scope.includes(hit.p.id)) return say(stySay('stereotype-applied', 'warning', at, [x.id, hit.p.id], `«${s}» is a stereotype of ${styName(hit.p)}, which is not applied to ${owner ? `${styName(owner)} or its owners` : `any owner of ${styQ(x)}`}`));
    if (meta !== undefined && !(meta && styFits(I, hit.st, meta))) say(stySay('stereotype-extends', 'warning', at, [x.id, hit.st.id], `«${s}» on ${styQ(x)} extends ${[...new Set([hit.st, ...styGenerals(I, hit.st)].flatMap(t => STY_ARR(I.ext.get(t.id))))].join(', ') || 'no metaclass'}, which a ${meta || String(x.type).slice(4)} is not`));
    if (STY_OBJ(hit.st.props) && hit.st.props.isAbstract === true) say(stySay('stereotype-abstract', 'error', at, [x.id, hit.st.id], `«${s}» on ${styQ(x)} is abstract: apply one of its specializations`));
    out.push({ stereotype: hit.st, profile: hit.p, key: s, required: false }); });
  // required extensions of the profiles in scope, on an element of their metaclass: met by the stereotype or a specialization the
  // element applies; else supplied by the tool, or warned when abstract (decision 22)
  if (meta) scope.forEach(pid => STY_ARR(I.req.get(pid)).forEach(({ st, meta: m }) => { if (!metaUp(meta).has(m)) return;
    const met = out.filter(e => e.stereotype === st || styGenerals(I, e.stereotype).includes(st)); if (met.length) return met.forEach(e => { e.required = true; });
    if (STY_OBJ(st.props) && st.props.isAbstract === true) return say(stySay('stereotype-required', 'warning', path, [x.id, st.id], `${styQ(x)} applies no specialization of «${styName(st)}», abstract and required on ${m} by ${styName(I.at.get(pid))}`));
    if (!out.some(e => e.stereotype === st)) out.push({ stereotype: st, profile: I.at.get(pid), key: styName(st), required: true }); }));
  // tags, keyed by stereotype then tag
  const T = P.tags, tp = `${path}.props.tags`;
  if (T != null && !STY_OBJ(T)) say(stySay('tag-defined', 'warning', tp, [x.id], `the tags of ${styQ(x)} are a map from each stereotype to its tags`));
  else if (T) Object.keys(T).forEach(k => { const e = out.find(o => o.key === k), inner = T[k];
    if (!e) return say(stySay('tag-defined', 'warning', tp, [x.id], `${styQ(x)} keeps tags under "${k}", which is no stereotype it has`));
    if (!STY_OBJ(inner)) return say(stySay('tag-defined', 'warning', tp, [x.id], `the tags of ${styQ(x)} under «${k}» are a map from each tag to its value`));
    const D = styDefs(I, e.stereotype);
    Object.keys(inner).forEach(n => { const d = D.get(n), v = inner[n];
      if (!d) return say(stySay('tag-defined', 'warning', tp, [x.id, e.stereotype.id], `«${k}» on ${styQ(x)} has no tag "${n}"`));
      const ok = v == null || styTagFits(I, d.def, I.at.get(d.st.parent), v);
      if (ok !== true) say(stySay('tag-value', 'warning', tp, [x.id, d.def.id], `«${k}» ${n} = ${JSON.stringify(String(v))} on ${styQ(x)} is not ${ok}`)); }); });
  out.forEach(e => { const inner = STY_OBJ(T) && STY_OBJ(T[e.key]) ? T[e.key] : {};
    e.tags = [...styDefs(I, e.stereotype)].map(([name, { def }]) => ({ name, def, value: inner[name] ?? undefined }));
    e.tags.forEach(({ name, def, value }) => { const dp = STY_OBJ(def.props) ? def.props : {};
      if ((value == null || value === '') && dp.default == null && (multBounds(dp.multiplicity ?? '1') || { lower: 1 }).lower >= 1) say(stySay('tag-required', 'warning', tp, [x.id, def.id], `«${e.key}» ${name} on ${styQ(x)} has no value and no default`)); }); });
  return out;
}

// every element's problems (§5.3 to §5.6), and the profiles' redefined tags: [] at once for a model with no profile
function stereoProblems(model) {
  const I = styIndex(STY_OBJ(model) ? model : {}); if (STY_OBJ(model)) STY_SEEN.set(model, I);
  if (!I.profiles.length) return [];
  const out = [];
  I.byProfile.forEach(sts => sts.forEach(st => styDefs(I, st)));
  I.els.forEach(r => { const e = styResolve(I, r, p => out.push(p)); if (!I.cache.has(r.x.id)) I.cache.set(r.x.id, e); });
  return [...I.probs, ...out];
}

// the stereotypes an element has, stored and required, with their tags (§5.5, §5.6): what 6.3 draws and the PDF lists
function appliedOf(model, id) {
  const I = styOf(model); if (!I.profiles.length) return [];
  if (!I.cache.has(id)) { const r = I.rec.get(id); I.cache.set(id, r ? styResolve(I, r, () => {}) : []); }
  return I.cache.get(id);
}

/* The panel's fields for an element's tags (§5.7): one per tag of each stereotype it has, its key carrying the stereotype so two
   stereotypes' `name` keep their own focus; a Boolean or an enumeration of the profile a choice, else text */
function tagFields(model, x) {
  if (!STY_OBJ(x) || typeof x.id !== 'string') return [];
  const I = styOf(model);
  return appliedOf(model, x.id).flatMap(e => e.tags.map(({ name, def }) => { const t = STY_OBJ(def.props) ? def.props.valueType : null, p = I.at.get(e.stereotype.parent);
    const lits = t === 'Boolean' ? ['true', 'false'] : p && I.enums.get(p.id).get(t);
    return { key: `p:${e.key}:${name}`, path: ['tags', e.key, name], label: `«${styName(e.stereotype)}» ${name}`, ...(lits ? { kind: 'enum', options: lits } : { kind: 'text' }) }; }));
}

TYPED.across = stereoProblems;
TYPED.fields = tagFields;

export { STY_RULES, UML_META, UML_AS, metaOf, metaUp, metaKnown, stereoProblems, appliedOf, tagFields };
