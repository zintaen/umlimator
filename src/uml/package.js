import { registerDiagramType } from '../core/registry.js';
import { CLASS_DEF, RULES, classProblems, describeAs, drawnLines, typeGeo } from './class.js';
import { OWNER_RULES, ownerChoices, ownerProblems, ownersOn } from './owners.js';

/* ---------- the package diagram, uml.package (work package 2.2, notes/stage-2.md §10.2, §10.3) ----------
   Packages and the classifiers of the class diagram, drawn by the class view's code with their names only: a package holding
   what it owns that the view shows is a box (src/uml/owners.js); package imports («import», or «access» when private),
   merges («merge») and dependencies, dashed with an open arrow; comments. A view with no `edges` list draws these line
   types only. Ships in lib/umlimator-all.js only. */

// a profile application too, drawn where a view shows a package and a profile (notes/stage-6.md §14); its palette is the profile view's
const PACKAGE_LINES = ['uml.PackageImport', 'uml.PackageMerge', 'uml.Dependency', 'uml.CommentLink', 'uml.ProfileApplication'];
const PACKAGE_LOOK = { members: false, own: PACKAGE_LINES, word: 'package diagram' };
const PACKAGE_RULES = {
  'import-ends': 'a package import or a package merge runs from a package to another package',
  'package-names': 'packages in one owner have different names',
};

// the package type's own rules (the class type's and the owners' run too): each problem { level, rule, path, message, ids }
function packageProblems(model) {
  const out = [], nodes = (Array.isArray(model.nodes) ? model.nodes : []).filter(n => n && typeof n === 'object' && typeof n.id === 'string');
  const at = new Map(nodes.map(n => [n.id, n])), q = id => JSON.stringify(String((at.get(id) || {}).label ?? id));
  const say = (rule, path, ids, msg) => out.push({ level: 'error', rule, path, ids, message: `${rule}: ${msg}` });
  (Array.isArray(model.edges) ? model.edges : []).forEach((e, i) => { if (!e || typeof e !== 'object' || (e.type !== 'uml.PackageImport' && e.type !== 'uml.PackageMerge')) return;
    const pk = id => (at.get(id) || {}).type === 'uml.Package';
    if (!pk(e.from) || !pk(e.to) || e.from === e.to) say('import-ends', `edges[${i}]`, [e.id, e.from, e.to].filter(x => x != null), `${e.id} runs from ${q(e.from)} to ${q(e.to)}: from a package to another package`); });
  const seen = new Map();
  (Array.isArray(model.nodes) ? model.nodes : []).forEach((n, i) => { if (!nodes.includes(n) || n.type !== 'uml.Package') return; const k = (n.parent ?? '') + '\u0000' + String(n.label ?? n.id), was = seen.get(k);
    if (was) say('package-names', `nodes[${i}]`, [was, n.id], `${q(n.id)} is named twice in ${n.parent != null ? q(n.parent) : 'the model'} (${was}, ${n.id})`); else seen.set(k, n.id); });
  return out;
}

const PACKAGE_TYPE = registerDiagramType('uml.package', {
  title: 'package diagram',
  elements: [['Package', 'Package'], ['Class', 'Class'], ['Interface', 'Interface'], ['Enumeration', 'Enumeration'], ['DataType', 'Data type'], ['PrimitiveType', 'Primitive type'], ['Comment', 'Comment']]
    .map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['PackageImport', 'Import'], ['PackageMerge', 'Merge'], ['Dependency', 'Dependency'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: { ...CLASS_DEF.props, 'uml.PackageImport': [{ key: 'visibility', label: 'Visibility', kind: 'enum', options: ['public', 'private'] }], 'uml.PackageMerge': [] },
  rankFlip: e => e.type === 'uml.Generalization' || e.type === 'uml.InterfaceRealization',
  layout: typeGeo(PACKAGE_LOOK),
  boxes: (model, view) => ownersOn(model, view).boxes,
  owners: ownerChoices,
  member: { holds: () => false }, // a classifier is drawn by its name here; its members are edited in a class view
  validate: (model, view) => [...classProblems(model), ...packageProblems(model), ...ownerProblems(model, view, drawnLines(model, view, PACKAGE_LINES).lines)],
  rules: { ...RULES, ...OWNER_RULES, ...PACKAGE_RULES },
  describe: describeAs(PACKAGE_LOOK),
});

export { PACKAGE_TYPE, PACKAGE_RULES, packageProblems };
