import { registerDiagramType } from '../core/registry.js';
import { esc } from '../core/text.js';
import { SHAPE } from '../draw/shapes.js';
import { CLASS_DEF, CLASS_TYPE, RULES, multBounds, printMember, classProblems, drawnLines, lineName, typeGeo } from './class.js';
import { OWN_BOXES, OWNER_RULES, holdsLine, ownerChoices, ownerProblems, ownersOn, readingOrder } from './owners.js';
import { STY_RULES, UML_META, appliedOf, metaKnown, styKey } from './stereotypes.js';

/* ---------- the profile diagram, uml.profile (work package 6.3, notes/stage-6.md §4) ----------
   A profile (a package with «profile») holding its stereotypes («stereotype», their tag definitions as attribute rows),
   metaclass references («metaclass») and enumerations; extensions (a solid line with a filled triangle at the metaclass,
   {required} when required), profile applications (dashed, «apply»), generalizations between stereotypes, comments. Drawn by
   the class type's look (typeGeo, src/uml/class.js), down by default, with repair and reroute off (§12). Any other element
   shown is its class or package look with a compartment per stereotype it has (src/uml/stereotypes.js's appliedOf, the
   required ones too), headed «name», each row `tag = value`, and its members that apply a stereotype, `«column» - placedAt:
   Instant {name = placed_at}`. Only lib/umlimator-all.js holds this file. */

const PR_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), PR_ARR = x => (Array.isArray(x) ? x : []);
const prName = x => String(x.label ?? x.id);
const prWord = t => t === 'uml.MetaclassReference' ? 'Metaclass' : String(t || 'uml.Class').split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'uml.DataType': "Data type"
const PR_DEFS = ['uml.Stereotype', 'uml.MetaclassReference', 'uml.Enumeration']; // what goes into a profile (§4.3)

// the model read once per call: nodes by id, every member by id, lines by kind
function prIndex(model) {
  const at = new Map(), mem = new Map();
  PR_ARR(model && model.nodes).forEach(n => { if (PR_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) { at.set(n.id, n); PR_ARR(n.members).forEach(m => { if (PR_OBJ(m) && typeof m.id === 'string') mem.set(m.id, m); }); } });
  const E = PR_ARR(model && model.edges).filter(e => PR_OBJ(e) && typeof e.id === 'string'), of = t => E.filter(e => e.type === t);
  return { at, mem, E, of, ty: id => (at.get(id) || {}).type };
}

// a stereotype as an element has it: «key», required, and its tags `name = value` (a default when unset; `?` for a value a
// tag of lower bound 1 needs; an optional one unset is left out)
function prTags(e) {
  return e.tags.flatMap(({ name, def, value }) => { const d = PR_OBJ(def.props) ? def.props : {}, need = (multBounds(d.multiplicity ?? '1') || { lower: 1 }).lower >= 1;
    const v = value != null && value !== '' ? value : d.default != null ? d.default : need ? '?' : null;
    return v == null ? [] : [`${name} = ${typeof v === 'object' ? JSON.stringify(v) : v}`]; });
}
const prSay = e => { const t = prTags(e); return `«${e.key}»${e.required ? ' required' : ''}${t.length ? ' ' + t.join(', ') : ''}`; };

/* ---- what each element says (§9): its PDF rows, and its accessible name after its kind and name ---- */
function prRows(model, x, I = prIndex(model)) {
  const nm = id => prName(I.at.get(id)), from = (t, id) => I.of(t).filter(e => e.from === id && I.at.has(e.to)), to = (t, id) => I.of(t).filter(e => e.to === id && I.at.has(e.from));
  if (x.type === 'uml.Profile') return [...[...I.at.values()].filter(n => n.parent === x.id && (n.type === 'uml.Stereotype' || n.type === 'uml.MetaclassReference')).map(n => (n.type === 'uml.Stereotype' ? `«${prName(n)}»` : `metaclass ${prName(n)}`)),
    ...to('uml.ProfileApplication', x.id).map(e => `applied to ${nm(e.from)}`)];
  if (x.type === 'uml.Stereotype') return [...from('uml.Extension', x.id).map(e => `extends ${nm(e.to)}${PR_OBJ(e.props) && e.props.isRequired === true ? ' {required}' : ''}`),
    ...from('uml.Generalization', x.id).map(e => `a kind of «${nm(e.to)}»`), ...PR_ARR(x.members).filter(m => PR_OBJ(m) && m.type === 'uml.Property').map(printMember)];
  if (x.type === 'uml.MetaclassReference') return to('uml.Extension', x.id).map(e => `extended by «${nm(e.from)}»`);
  return [...appliedOf(model, x.id).map(prSay), ...PR_ARR(x.members).filter(m => PR_OBJ(m) && appliedOf(model, m.id).length).map(m => `${printMember(m)}: ${appliedOf(model, m.id).map(prSay).join('; ')}`)];
}
// "Stereotype owned, extends Class {required}, team: String"; "Class Order: «entity» table = orders; «owned» required"
function prAria(model, x, drawn, I) {
  const why = [...(x.type === 'uml.Stereotype' && PR_OBJ(x.props) && x.props.isAbstract === true ? ['abstract'] : []), ...(OWN_BOXES.includes(x.type) ? ['closed'] : [])];
  const head = `${prWord(x.type)} ${drawn}${why.length ? ` (${why.join(', ')})` : ''}`, rows = prRows(model, x, I);
  return !rows.length ? head : PR_DEFS.slice(0, 2).includes(x.type) || x.type === 'uml.Profile' ? [head, ...rows].join(', ') : `${head}: ${rows.join('; ')}`;
}

/* ---- the look: the class type's, the classifiers drawn by SHAPE.profiled, which is the classifier with the node's own
   accessible name (the classifier writes one from its compartments, which here are a stereotype's tags) ---- */
SHAPE.profiled = { ...SHAPE.classifier, draw: (n, c, f) => SHAPE.classifier.draw(n, c, f).replace(/aria-label="[^"]*"/, () => `aria-label="${esc(n.aria)}"`) };
const row = text => ({ type: 'uml.Property', label: text }); // a compartment row as the classifier prints it: its text alone
function prNode(d, n, model, pic) {
  if (d.shape === 'note') return d;
  const I = prIndex(model), aria = prAria(model, n, pic.name(n.id), I);
  if (d.shape !== 'classifier') return { ...d, aria };
  if (n.type === 'uml.Stereotype') return { ...d, shape: 'profiled', aria, compartments: d.compartments.filter(c => c.name === 'attributes') };
  const tags = appliedOf(model, n.id).map(e => ({ name: `«${e.key}»`, members: [row(`«${e.key}»`), ...prTags(e).map(row)] })), has = m => PR_OBJ(m) && appliedOf(model, m.id).length > 0;
  const mrow = m => { const A = appliedOf(model, m.id), t = A.flatMap(prTags); return row(`${A.map(e => `«${e.key}»`).join(' ')} ${printMember(m)}${t.length ? ` {${t.join(', ')}}` : ''}`); };
  // a metaclass and an enumeration keep their own compartments (none; the literals), the tag compartments over them
  if (n.type === 'uml.MetaclassReference' || n.type === 'uml.Enumeration') return { ...d, shape: 'profiled', aria, compartments: [...tags, ...d.compartments.map(c => ({ ...c, members: c.members.map(m => (has(m) ? mrow(m) : m)) }))] };
  const ms = PR_ARR(n.members).filter(has).map(mrow);
  return { ...d, shape: 'profiled', aria, compartments: [...tags, ...(ms.length ? [{ name: 'members', members: ms }] : [])] };
}
// an open package's or profile's box: over its name the stereotypes it has, the required ones too; its tags in its accessible name
function prBox(b, model, pic) {
  const x = pic.at.get(b.id), A = appliedOf(model, b.id); if (!A.length) return b;
  const st = PR_ARR(PR_OBJ(x.props) ? x.props.stereotypes : null).filter(t => t != null && t !== '').map(String), all = [...st, ...A.map(e => e.key).filter(k => !st.includes(k))];
  return { ...b, title: [...(x.type === 'uml.Profile' ? ['«profile»'] : []), ...all.map(t => `«${t}»`), pic.name(b.id)].join(' '), aria: `${b.aria}: ${A.map(prSay).join('; ')}` };
}
const PR_LOOK = { members: true, own: null, word: 'profile diagram', node: prNode, box: prBox, dg: { repair: false, reroute: false } };
const prGeo0 = typeGeo(PR_LOOK);
// down unless the view says right; slots at each node and box, so the palette's add hears what is selected (composite.js's)
function prGeo(a) {
  const view = a.view.direction ? a.view : { ...a.view, direction: 'down' }, g = prGeo0({ ...a, view }), pic = ownersOn(a.model, a.view);
  const slots = [...g.nodes, ...PR_ARR(g.families)].map(n => ({ after: n.id, parent: null, x: n.x + n.w / 2, y: n.y + n.h / 2 }));
  return { ...g, slots, order: [...readingOrder(pic), ...g.edges.map(e => e.id)] }; // a new object: what typeGeo returned is not edited (§2.4)
}

/* ---- validators (§4.2): definitions are errors, a metaclass name a warning. Each problem: { level, rule, path, message, ids } ---- */
const PR_RULES = {
  'profile-owns': 'a stereotype\'s and a metaclass reference\'s owner is a profile',
  'stereotype-names': 'stereotypes in one profile have different names, the first letter in either case; profiles have different names',
  'extension-ends': 'an extension runs from a stereotype to a metaclass reference',
  'application-ends': 'a profile application runs from a package to a profile, not from a profile to itself',
  'metaclass-known': 'a metaclass reference names a UML metaclass',
};
function prProblems(model) {
  const out = [], I = prIndex(model), q = id => JSON.stringify(I.at.has(id) ? prName(I.at.get(id)) : String(id)), say = (rule, path, ids, msg, level = 'error') => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const seen = new Map(), names = (k, id, path, what) => { const was = seen.get(k); if (was) say('stereotype-names', path, [was, id], `${q(id)} and ${q(was)} are one name ${what} (${was}, ${id})`); else seen.set(k, id); };
  PR_ARR(model && model.nodes).forEach((n, i) => { if (!PR_OBJ(n) || I.at.get(n.id) !== n) return; const path = `nodes[${i}]`;
    if ((n.type === 'uml.Stereotype' || n.type === 'uml.MetaclassReference') && I.ty(n.parent) !== 'uml.Profile') say('profile-owns', path, [n.id, n.parent], `${prWord(n.type).toLowerCase()} ${q(n.id)} is owned by ${n.parent != null && I.at.has(n.parent) ? q(n.parent) + ', not a profile' : 'no profile'}`);
    if (n.type === 'uml.Stereotype' && I.ty(n.parent) === 'uml.Profile') names(`s\u0000${n.parent}\u0000${styKey(prName(n))}`, n.id, path, `in ${q(n.parent)}`);
    if (n.type === 'uml.Profile') names(`p\u0000${prName(n)}`, n.id, path, 'for two profiles');
    if (n.type === 'uml.MetaclassReference' && !metaKnown(prName(n))) say('metaclass-known', path, [n.id], `${q(n.id)} is no UML metaclass`, 'warning'); });
  PR_ARR(model && model.edges).forEach((e, i) => { if (!PR_OBJ(e)) return; const path = `edges[${i}]`, ends = [...new Set([e.id, e.from, e.to])], k = id => (I.at.has(id) ? prWord(I.ty(id)).toLowerCase() : 'nothing');
    if (e.type === 'uml.Extension' && (I.ty(e.from) !== 'uml.Stereotype' || I.ty(e.to) !== 'uml.MetaclassReference')) say('extension-ends', path, ends, `${e.id} runs from ${q(e.from)} (${k(e.from)}) to ${q(e.to)} (${k(e.to)}): from a stereotype to a metaclass`);
    if (e.type === 'uml.ProfileApplication' && (!OWN_BOXES.includes(I.ty(e.from)) || I.ty(e.to) !== 'uml.Profile' || e.from === e.to)) say('application-ends', path, ends, `${e.id} runs from ${q(e.from)} (${k(e.from)}) to ${q(e.to)} (${k(e.to)}): from a package to a profile${e.from === e.to ? ' other than itself' : ''}`); });
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function prDescribe(model, viewId) {
  const v = PR_ARR(model && model.views).find(x => PR_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const { at, pic, lines: all } = drawnLines(model, v, null), lines = all.filter(({ from, to }) => !holdsLine(pic, from, to)), I = prIndex(model), ids = readingOrder(pic);
  const pl = (k, w) => `${k} ${k === 1 ? w : w + 's'}`, box = new Map(pic.boxes.map(b => [b.id, prBox(b, model, pic).aria]));
  const said = id => { const x = at.get(id).x; return box.get(id) ?? (x.type === 'uml.Comment' ? 'Comment: ' + prName(x) : prAria(model, x, pic.name(id), I)); };
  return [`${v.title || v.id}: a profile diagram of ${pl(ids.length, 'element')} and ${pl(lines.length, 'line')}.`, ...ids.map(id => said(id) + '.'), ...lines.map(({ e }) => lineName(e, at, pic) + '.')].join('\n');
}

/* ---- editing (§4.3) ---- */
const prNewId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; };
// edit distance, for the metaclass names nearest one typed. ponytail: quadratic in the names' lengths, over about 90 names
function prDist(a, b) {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; }
  return row[b.length];
}
// add: a stereotype, a metaclass or an enumeration goes into the profile selected (or the one holding what is selected), else
// the view's first; a metaclass not in the table offers the nearest names; anything else is the default
function prAdd(model, view, entry, label, at) {
  if (!PR_DEFS.includes(entry.type)) return null;
  const I = prIndex(model), prof = id => (I.ty(id) === 'uml.Profile' ? id : I.ty((I.at.get(id) || {}).parent) === 'uml.Profile' ? I.at.get(id).parent : null);
  const p = PR_ARR(at && at.sel).map(prof).find(x => x) ?? PR_ARR(view.nodeIds).map(id => (I.ty(id) === 'uml.Profile' ? id : null)).find(x => x);
  if (!p) return { error: 'Add a profile first' };
  const add = name => [{ op: 'add', element: { id: prNewId(model, { 'uml.Stereotype': 'stereotype', 'uml.MetaclassReference': 'metaclass', 'uml.Enumeration': 'enumeration' }[entry.type]), type: entry.type, ...(name ? { label: name } : {}), parent: p }, view: view.id }];
  const nm = String(label ?? ''), lo = nm.toLowerCase(); // a metaclass with no name is added unnamed (metaclass-known then warns)
  if (entry.type !== 'uml.MetaclassReference' || !nm || metaKnown(nm)) return add(nm);
  const near = Object.keys(UML_META).sort((a, b) => prDist(lo, a.toLowerCase()) - prDist(lo, b.toLowerCase()) || a.localeCompare(b)).slice(0, 6);
  return { pick: near, then: i => add(near[i]) };
}
// connect: an extension from a stereotype to a metaclass, an application from a package to a profile, a generalization
// between stereotypes; else said, the rule's words
function prConnect(model, view, from, to, at, line) {
  const I = prIndex(model), t = PR_OBJ(line) ? line.type : null;
  if (t === 'uml.Extension' && (I.ty(from) !== 'uml.Stereotype' || I.ty(to) !== 'uml.MetaclassReference')) return { error: 'An extension runs from a stereotype to a metaclass' };
  if (t === 'uml.ProfileApplication' && (!OWN_BOXES.includes(I.ty(from)) || I.ty(to) !== 'uml.Profile' || from === to)) return { error: `A profile application runs from a package to a profile${from === to ? ' other than itself' : ''}` };
  if (t === 'uml.Generalization' && (I.ty(from) !== 'uml.Stereotype' || I.ty(to) !== 'uml.Stereotype')) return { error: 'A generalization here joins two stereotypes' };
  return null;
}

/* ---- the type ---- */
const PR_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const PR_TYPE = registerDiagramType('uml.profile', {
  title: 'profile diagram',
  elements: [['Profile', 'Profile'], ['Stereotype', 'Stereotype'], ['MetaclassReference', 'Metaclass'], ['Enumeration', 'Enumeration'], ['Package', 'Package'], ['Comment', 'Comment']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['Extension', 'Extension'], ['Generalization', 'Generalization'], ['ProfileApplication', 'Profile application'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: { ...CLASS_DEF.props, 'uml.Profile': [PR_STEREO], 'uml.Stereotype': [{ key: 'isAbstract', label: 'Abstract', kind: 'bool' }], 'uml.MetaclassReference': [],
    'uml.Extension': [{ key: 'isRequired', label: 'Required', kind: 'bool' }], 'uml.ProfileApplication': [] },
  // the metaclass ranks first, above the stereotypes that extend it, as a general is above its specializations (§4.1)
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.InterfaceRealization' || e.type === 'uml.Extension',
  layout: prGeo,
  boxes: (model, view) => { const pic = ownersOn(model, view); return pic.boxes.map(b => prBox(b, model, pic)); },
  owners: ownerChoices,
  // a stereotype's rows are its tag definitions, in the class type's member syntax; an enumeration's its literals
  member: { ...CLASS_TYPE.member, holds: n => n.type === 'uml.Stereotype' || n.type === 'uml.Enumeration' },
  validate: (model, view) => [...classProblems(model), ...prProblems(model), ...ownerProblems(model, view, drawnLines(model, view, null).lines)],
  rules: { ...RULES, ...OWNER_RULES, ...PR_RULES, ...STY_RULES },
  describe: prDescribe,
  // the PDF's tables (§9): a profile's, a stereotype's and a metaclass's kind; each element's stereotypes and tags
  word: (model, id) => { const x = prIndex(model).at.get(id);
    return !x ? null : x.type === 'uml.Stereotype' ? (PR_OBJ(x.props) && x.props.isAbstract === true ? 'Stereotype (abstract)' : 'Stereotype') : x.type === 'uml.MetaclassReference' ? 'Metaclass' : x.type === 'uml.Profile' ? 'Profile' : null; },
  rows: (model, view, id) => { const I = prIndex(model), x = I.at.get(id); if (!x) return null; const r = prRows(model, x, I); return r.length || PR_DEFS.slice(0, 2).includes(x.type) ? r : null; },
  edits: { add: prAdd, connect: prConnect },
});

export { PR_TYPE, PR_RULES, prGeo, prProblems, prDescribe, prAdd, prConnect, prRows };
