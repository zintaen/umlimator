// The profile diagram, uml.profile (work package 6.3, notes/stage-6.md §4): the type's definition; the class type's look with
// the new keywords, the extension's filled triangle, «apply» and {required}; a profile as a package (a box, its title, the
// Owner field, owner-kinds, holdsLine) on the profile, class and package views; tag compartments from appliedOf; the
// validators, generalization-kinds with the stereotype kind among the classifiers; describe(), names, reading order, the
// legend, the PDF's rows and words; the editing hooks; a 30-step session saved and reopened; P1 (§12). tests/profile.html
// draws it in a browser and edits it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js
// holds the same code. The example is an inline copy of docs/diagrams/examples/07-profile.json with its tags keyed by
// stereotype (decision 21), so 6.6's move and revision break nothing here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { classProblems } from '../src/uml/class.js';
import { ownerChoices, ownerProblems } from '../src/uml/owners.js';
import '../src/uml/package.js';
import { STY_RULES } from '../src/uml/stereotypes.js';
import { PR_RULES, prProblems } from '../src/uml/profile.js';

const T = diagramOf({ diagram: 'uml.profile' });
const N = (id, type, label, parent, more = {}) => ({ id, type: 'uml.' + type, label, ...(parent ? { parent } : {}), ...more });
const L = (id, type, from, to, more = {}) => ({ id, type: 'uml.' + type, from, to, ...more });
const P = (id, label, valueType, more = {}) => N(id, 'Property', label, null, { props: { valueType, ...more } });
const by = (m, id) => m.nodes.find(n => n.id === id);
const unid = s => s.replace(/\bg\d+-/g, 'g-');
const PROFILE = { schemaVersion: 2, title: 'Bookshop: modelling conventions', root: 'profile',
  nodes: [
    N('conventions', 'Profile', 'BookshopConventions'),
    N('mc-class', 'MetaclassReference', 'Class', 'conventions'), N('mc-property', 'MetaclassReference', 'Property', 'conventions'),
    N('entity', 'Stereotype', 'entity', 'conventions', { members: [P('entity.table', 'table', 'String')] }),
    N('aggregate-root', 'Stereotype', 'aggregateRoot', 'conventions', { members: [P('aggregate-root.boundedContext', 'boundedContext', 'String')] }),
    N('owned', 'Stereotype', 'owned', 'conventions', { members: [P('owned.team', 'team', 'String')] }),
    N('column', 'Stereotype', 'column', 'conventions', { members: [P('column.name', 'name', 'String', { multiplicity: '0..1' }), P('column.indexed', 'indexed', 'Boolean', { default: 'false' })] }),
    N('sales', 'Package', 'sales'),
    N('order', 'Class', 'Order', 'sales', { props: { stereotypes: ['aggregateRoot', 'owned'], tags: { aggregateRoot: { table: 'orders', boundedContext: 'sales' }, owned: { team: 'checkout' } } },
      members: [N('order.placedAt', 'Property', 'placedAt', null, { props: { visibility: 'private', valueType: 'Instant', stereotypes: ['column'], tags: { column: { name: 'placed_at', indexed: 'true' } } } })] }),
  ],
  edges: [
    L('entity-extends-class', 'Extension', 'entity', 'mc-class'), L('owned-extends-class', 'Extension', 'owned', 'mc-class', { props: { isRequired: true } }),
    L('column-extends-property', 'Extension', 'column', 'mc-property'), L('root-is-entity', 'Generalization', 'aggregate-root', 'entity'),
    L('sales-applies-conventions', 'ProfileApplication', 'sales', 'conventions'),
  ],
  views: [{ id: 'profile', diagram: 'uml.profile', title: 'Bookshop conventions profile', parent: null, direction: 'down',
    nodeIds: ['conventions', 'mc-class', 'mc-property', 'entity', 'aggregate-root', 'owned', 'column', 'sales', 'order'] }] };
const V = PROFILE.views[0];
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };

test('the definition: uml.profile is registered with its palette, its four lines, its properties, its rules and its hooks', () => {
  assert.equal(T.name, 'uml.profile');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.Profile', 'Profile'], ['uml.Stereotype', 'Stereotype'], ['uml.MetaclassReference', 'Metaclass'], ['uml.Enumeration', 'Enumeration'], ['uml.Package', 'Package'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.Extension', 'Extension'], ['uml.Generalization', 'Generalization'], ['uml.ProfileApplication', 'Profile application'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.props['uml.Extension'], [{ key: 'isRequired', label: 'Required', kind: 'bool' }]);
  assert.deepEqual(T.props['uml.Stereotype'], [{ key: 'isAbstract', label: 'Abstract', kind: 'bool' }]);
  assert.deepEqual(T.props['uml.Profile'].map(f => f.key), ['stereotypes']);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows', 'rankFlip']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits), ['add', 'connect']);
  for (const r of [...Object.keys(PR_RULES), ...Object.keys(STY_RULES), 'generalization-kinds', 'owner-kinds']) assert.ok(Object.hasOwn(T.rules, r), r);
  assert.deepEqual(Object.keys(PR_RULES), ['profile-owns', 'stereotype-names', 'extension-ends', 'application-ends', 'metaclass-known']);
  assert.ok(T.rankFlip({ type: 'uml.Extension' }) && T.rankFlip({ type: 'uml.Generalization' }) && !T.rankFlip({ type: 'uml.ProfileApplication' }));
  assert.deepEqual(['uml.Stereotype', 'uml.Enumeration', 'uml.Class', 'uml.MetaclassReference', 'uml.Profile'].map(t => T.member.holds({ type: t })), [true, true, false, false, false]);
});

test('07-profile.json (inline, tags keyed by stereotype) validates clean and lays out clean, down and right; down when the view says nothing; drawn twice from one memo, the same markup', () => {
  assert.deepEqual(validate(PROFILE), []);
  for (const d of ['down', 'right']) { const m = withDir(PROFILE, d); assert.deepEqual(check(m, 'profile'), [], d); assert.equal(layout(m, 'profile').direction ?? d, d); }
  const plain = structuredClone(PROFILE); delete plain.views[0].direction;
  const g = layout(plain, 'profile'), at = id => g.byId[id];
  assert.ok(at('mc-class').y + at('mc-class').h < at('entity').y && at('entity').y + at('entity').h < at('aggregate-root').y, 'down: the metaclass above the stereotype, the general above its specialization');
  assert.equal(unid(svgOf(g)), unid(svgOf(layout(PROFILE, 'profile'))), 'down by default');
  const memos = {}, first = mapContext(PROFILE, { memos }).buildView('profile'), nodes = JSON.stringify(memos.profile.g.nodes);
  const second = mapContext(PROFILE, { memos }).buildView('profile');
  assert.equal(memos.profile.runs, 1); assert.equal(unid(second.markup), unid(first.markup)); assert.equal(JSON.stringify(memos.profile.g.nodes), nodes, 'the geometry is not edited after the layout');
});

test('drawing (§4.1): a profile a box with «profile»; stereotypes «stereotype» with their tag definitions; metaclasses «metaclass» with no compartment; an extension\'s filled triangle and {required}; «apply»; an element\'s tag compartments and its members that apply one', () => {
  const g = layout(PROFILE, 'profile'), s = svgOf(g), fam = id => g.families.find(f => f.id === id);
  assert.equal(fam('conventions').title, '«profile» BookshopConventions'); assert.equal(fam('conventions').aria, 'Profile BookshopConventions, holding 6 elements');
  assert.equal(fam('sales').title, 'sales');
  const n = id => g.byId[id];
  assert.deepEqual(n('entity').stereotypes, ['stereotype']); assert.deepEqual(n('entity').compartments.map(c => [c.name, c.members.map(m => m.label)]), [['attributes', ['table']]]);
  assert.deepEqual(n('mc-class').stereotypes, ['metaclass']); assert.deepEqual(n('mc-class').compartments, []);
  assert.deepEqual(n('order').compartments.map(c => c.members.map(m => m.label)), [['«aggregateRoot»', 'table = orders', 'boundedContext = sales'], ['«owned»', 'team = checkout'],
    ['«column» - placedAt: Instant {name = placed_at, indexed = true}']]);
  assert.match(s, /class="c-row"[^>]*>table = orders<\/text>/);
  const edge = id => g.edges.find(e => e.id === id);
  assert.deepEqual(edge('entity-extends-class').end, { from: 'none', to: 'filled-triangle' });
  assert.equal(edge('owned-extends-class').label, '{required}'); assert.equal(edge('entity-extends-class').label, undefined);
  assert.deepEqual(edge('sales-applies-conventions').end, { from: 'none', to: 'open', dashed: true }); assert.equal(edge('sales-applies-conventions').label, '«apply»');
  assert.match(s, /<marker id="[^"]*-filled-triangle-[^"]*"[^>]*><path d="M0 0L13 7L0 14Z" fill="(?!var\(--um-stage-bg\))/, 'the triangle filled with the line\'s colour');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Generalization', 'Extension', 'Profile application']);
  // a default drawn, a required tag missing as ?, an optional one unset left out; a required stereotype supplied by the tool gets a compartment
  const m = structuredClone(PROFILE); by(m, 'order').props.tags = { aggregateRoot: { boundedContext: 'sales' } }; delete by(m, 'order').members[0].props.tags;
  m.nodes.push(N('line', 'Class', 'OrderLine', 'sales')); m.views[0].nodeIds.push('line');
  const h = layout(m, 'profile');
  assert.deepEqual(h.byId.order.compartments.map(c => c.members.map(x => x.label)), [['«aggregateRoot»', 'table = ?', 'boundedContext = sales'], ['«owned»', 'team = ?'], ['«column» - placedAt: Instant {indexed = false}']]);
  assert.deepEqual(h.byId.line.compartments.map(c => c.members.map(x => x.label)), [['«owned»', 'team = ?']], 'the required «owned», supplied');
  assert.deepEqual(h.byId.line.stereotypes, [], 'drawn over the name: stored stereotypes only');
});

test('names (A1), the reading order and describe(): each stereotype\'s extensions and tags, each element\'s stereotypes, required ones too, and tags', () => {
  const g = layout(PROFILE, 'profile'), s = svgOf(g);
  assert.equal(g.byId.owned.aria, 'Stereotype owned, extends Class {required}, team: String');
  assert.equal(g.byId['aggregate-root'].aria, 'Stereotype aggregateRoot, a kind of «entity», boundedContext: String');
  assert.equal(g.byId['mc-class'].aria, 'Metaclass Class, extended by «entity», extended by «owned»');
  assert.equal(g.byId.order.aria, 'Class Order: «aggregateRoot» table = orders, boundedContext = sales; «owned» required team = checkout; - placedAt: Instant: «column» name = placed_at, indexed = true');
  assert.match(s, /data-shape="classifier" tabindex="-1" role="img" aria-label="Stereotype owned, extends Class \{required\}, team: String"/, 'the drawn node says it');
  assert.equal(g.edges.find(e => e.id === 'owned-extends-class').aria, 'Extension from owned to Class: {required}');
  assert.deepEqual(g.order, ['conventions', 'mc-class', 'mc-property', 'entity', 'aggregate-root', 'owned', 'column', 'sales', 'order', ...PROFILE.edges.map(e => e.id)]);
  const d = describe(PROFILE, 'profile').split('\n');
  assert.equal(d[0], 'Bookshop conventions profile: a profile diagram of 9 elements and 5 lines.');
  assert.equal(d[1], 'Profile BookshopConventions, holding 6 elements.');
  assert.equal(d[4], 'Stereotype entity, extends Class, table: String.');
  assert.equal(d.at(-1), 'Profile application from sales to BookshopConventions: «apply».');
  assert.equal(d.length, 1 + 9 + 5);
  const ab = structuredClone(PROFILE); by(ab, 'entity').props = { isAbstract: true }; delete ab.views[0].nodeIds.splice(ab.views[0].nodeIds.indexOf('order'), 1);
  assert.equal(layout(ab, 'profile').byId.entity.aria, 'Stereotype entity (abstract), extends Class, table: String');
});

test('the PDF\'s tables (§9): a profile\'s, a stereotype\'s and a metaclass\'s word and rows; any element\'s stereotypes and tags; null where the class rows serve', () => {
  assert.deepEqual(['conventions', 'entity', 'mc-class', 'order', 'sales', 'nowhere'].map(id => T.word(PROFILE, id)), ['Profile', 'Stereotype', 'Metaclass', null, null, null]);
  const ab = structuredClone(PROFILE); by(ab, 'entity').props = { isAbstract: true }; assert.equal(T.word(ab, 'entity'), 'Stereotype (abstract)');
  assert.deepEqual(T.rows(PROFILE, V, 'conventions'), ['metaclass Class', 'metaclass Property', '«entity»', '«aggregateRoot»', '«owned»', '«column»', 'applied to sales']);
  assert.deepEqual(T.rows(PROFILE, V, 'owned'), ['extends Class {required}', 'team: String']);
  assert.deepEqual(T.rows(PROFILE, V, 'aggregate-root'), ['a kind of «entity»', 'boundedContext: String']);
  assert.deepEqual(T.rows(PROFILE, V, 'mc-property'), ['extended by «column»']);
  assert.deepEqual(T.rows(PROFILE, V, 'order'), ['«aggregateRoot» table = orders, boundedContext = sales', '«owned» required team = checkout', '- placedAt: Instant: «column» name = placed_at, indexed = true']);
  assert.equal(T.rows(PROFILE, V, 'sales'), null); assert.equal(T.rows(PROFILE, V, 'nowhere'), null);
});

// ---- §4.2: validators, each with a passing and a failing case
const BREAKS = {
  'profile-owns': m => { by(m, 'column').parent = 'sales'; return ['column', 'sales']; },
  'stereotype-names': m => { m.nodes.push(N('entity2', 'Stereotype', 'Entity', 'conventions')); return ['entity', 'entity2']; },
  'extension-ends': m => { m.edges.push(L('bad', 'Extension', 'mc-class', 'entity')); return ['bad', 'mc-class', 'entity']; },
  'application-ends': m => { m.edges.push(L('bad', 'ProfileApplication', 'order', 'conventions')); return ['bad', 'order', 'conventions']; },
  'metaclass-known': m => { by(m, 'mc-property').label = 'Propertie'; by(m, 'order').members[0].props.stereotypes = []; delete by(m, 'order').members[0].props.tags; return ['mc-property']; },
};
test('validators (§4.2): the example breaks none; each rule fails on a model that breaks it, naming its rule and its elements, at its level, through validate() too', () => {
  assert.deepEqual(T.validate(PROFILE, V), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(PROFILE), ids = broke(m), got = prProblems(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, rule === 'metaclass-known' ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  assert.equal(prProblems(Object.assign(structuredClone(PROFILE), { nodes: [...PROFILE.nodes, N('entity2', 'Stereotype', 'Entity', 'conventions')] }))[0].message, 'stereotype-names: "Entity" and "entity" are one name in "BookshopConventions" (entity, entity2)');
  // two profiles of one label, which Profile::name could not tell apart; one name in two profiles is fine
  const two = structuredClone(PROFILE); two.nodes.push(N('p2', 'Profile', 'BookshopConventions'), N('e2', 'Stereotype', 'entity', 'p2'));
  assert.deepEqual(prProblems(two).map(p => [p.rule, p.ids]), [['stereotype-names', ['conventions', 'p2']]]);
  const ok = structuredClone(PROFILE); ok.nodes.push(N('p2', 'Profile', 'Other'), N('e2', 'Stereotype', 'entity', 'p2')); assert.deepEqual(prProblems(ok), []);
  // a metaclass reference with no owner; an application from a profile (a package) passes; extension-ends names "nothing" for a lost end
  const lost = structuredClone(PROFILE); delete by(lost, 'mc-property').parent; lost.edges.push(L('pp', 'ProfileApplication', 'conventions', 'conventions'), L('x', 'Extension', 'entity', 'gone'));
  assert.deepEqual(prProblems(lost).map(p => p.message), ['profile-owns: metaclass "Property" is owned by no profile', 'extension-ends: x runs from "entity" (stereotype) to "gone" (nothing): from a stereotype to a metaclass']);
  // the abstract metaclasses of the table are known
  for (const name of ['Classifier', 'Element', 'NamedElement', 'Component', 'Lifeline']) { const m = structuredClone(PROFILE); by(m, 'mc-property').label = name; by(m, 'order').members[0].props.stereotypes = []; delete by(m, 'order').members[0].props.tags;
    assert.deepEqual(prProblems(m), [], name); }
});

test('generalization-kinds (§4.2, Q2): a stereotype is a classifier kind of its own, so a stereotype specializes a stereotype, and no other kind', () => {
  assert.deepEqual(classProblems(PROFILE), []);
  for (const k of ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.MetaclassReference', 'uml.Package']) for (const [a, b] of [['uml.Stereotype', k], [k, 'uml.Stereotype']]) {
    const got = classProblems({ nodes: [{ id: 'x', type: a }, { id: 'y', type: b }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'x', to: 'y' }] });
    assert.deepEqual(got.map(p => [p.rule, p.ids]), [['generalization-kinds', ['g', 'x', 'y']]], a + ' → ' + b); }
  // in a class view of the same model, as the atlas will have (Q2)
  const m = structuredClone(PROFILE); m.views.push({ id: 'c', diagram: 'uml.class', nodeIds: ['order'] });
  assert.deepEqual(validate(m), []);
});

test('a profile is a package to the class, package and object views (§4.1): a box with «profile», its title and name, owner-kinds, holdsLine, the Owner field; the lines\' looks and words', () => {
  const m = structuredClone(PROFILE); m.nodes.push(N('level', 'Enumeration', 'Level', 'conventions'));
  m.views.push({ id: 'pk', diagram: 'uml.package', nodeIds: ['conventions', 'sales', 'level'] }, { id: 'pk2', diagram: 'uml.package', nodeIds: ['conventions', 'sales'] },
    { id: 'cl', diagram: 'uml.class', nodeIds: ['entity', 'mc-class', 'conventions', 'level'], edges: ['entity-extends-class', 'sales-applies-conventions'] });
  assert.deepEqual(ownerProblems(m), [], 'an enumeration owned by a profile is owned by a package');
  assert.deepEqual(validate(m).filter(p => !['line-inside'].includes(p.rule)), []);
  const g = layout(m, 'pk');
  assert.equal(g.families.find(f => f.id === 'conventions').title, '«profile» BookshopConventions');
  assert.equal(g.edges.find(e => e.id === 'sales-applies-conventions').label, '«apply»', 'a package view with no lines listed draws the application');
  assert.deepEqual(check(m, 'pk'), []);
  const closed = layout(m, 'pk2');
  assert.deepEqual(closed.byId.conventions.stereotypes, ['profile']); assert.equal(closed.byId.conventions.shape, 'package');
  assert.equal(closed.byId.conventions.aria, 'Profile BookshopConventions (closed)');
  assert.match(describe(m, 'pk2'), /^Package sales \(closed\); applies BookshopConventions\.$/m);
  const c = layout(m, 'cl');
  assert.deepEqual(c.byId.entity.stereotypes, ['stereotype']); assert.deepEqual(c.byId['mc-class'].compartments, []);
  assert.deepEqual(c.edges.map(e => [e.id, e.end.to]), [['entity-extends-class', 'filled-triangle']], 'a line from a box to what it holds is not drawn');
  // holdsLine: a line from a profile box to its stereotype is one the box holds
  const inside = structuredClone(m); inside.edges.push(L('dep', 'Dependency', 'conventions', 'entity')); inside.views.find(v => v.id === 'cl').edges.push('dep');
  assert.ok(validate(inside).some(p => p.rule === 'line-inside' && p.ids.includes('dep')));
  // the Owner field: packages and profiles for a class; profiles only for a stereotype or a metaclass
  assert.deepEqual(ownerChoices(m, by(m, 'order')).map(o => o.id), ['conventions', 'sales']);
  assert.deepEqual(ownerChoices(m, by(m, 'entity')).map(o => o.id), ['conventions']);
  assert.deepEqual(ownerChoices(m, by(m, 'mc-class')).map(o => o.label), ['BookshopConventions']);
  assert.equal(ownerChoices(m, m.edges[0]), null);
});

// ---- §4.3: editing
test('add (§4.3): a stereotype, a metaclass or an enumeration goes into the profile selected, or the one holding what is selected, else the view\'s first; none: said; a metaclass not in the table offers the nearest names', () => {
  const at = sel => ({ sel }), E = t => ({ type: 'uml.' + t });
  const m = structuredClone(PROFILE); m.nodes.push(N('p2', 'Profile', 'Other')); m.views[0].nodeIds.push('p2');
  assert.deepEqual(T.edits.add(m, m.views[0], E('Stereotype'), 'audited', at(['p2'])), [{ op: 'add', element: { id: 'stereotype1', type: 'uml.Stereotype', label: 'audited', parent: 'p2' }, view: 'profile' }]);
  assert.equal(T.edits.add(m, m.views[0], E('Stereotype'), 'x', at(['entity']))[0].element.parent, 'conventions', 'the profile holding the stereotype selected');
  assert.equal(T.edits.add(m, m.views[0], E('Enumeration'), 'Level', at(['order']))[0].element.parent, 'conventions', 'the view\'s first');
  assert.equal(T.edits.add(m, m.views[0], E('Enumeration'), 'Level', null)[0].element.parent, 'conventions');
  assert.deepEqual(T.edits.add(m, m.views[0], E('MetaclassReference'), 'Component', null), [{ op: 'add', element: { id: 'metaclass1', type: 'uml.MetaclassReference', label: 'Component', parent: 'conventions' }, view: 'profile' }]);
  const r = T.edits.add(m, m.views[0], E('MetaclassReference'), 'Clas', at(['p2']));
  assert.equal(r.pick[0], 'Class'); assert.equal(r.pick.length, 6);
  assert.deepEqual(r.then(0), [{ op: 'add', element: { id: 'metaclass1', type: 'uml.MetaclassReference', label: 'Class', parent: 'p2' }, view: 'profile' }]);
  assert.equal(T.edits.add(m, m.views[0], E('MetaclassReference'), 'operation', null).pick[0], 'Operation', 'either case');
  for (const t of ['Profile', 'Package', 'Comment']) assert.equal(T.edits.add(m, m.views[0], E(t), 'x', null), null, t);
  const none = { schemaVersion: 2, nodes: [N('s', 'Package', 's')], edges: [], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['s'] }] };
  assert.deepEqual(T.edits.add(none, none.views[0], E('Stereotype'), 'x', null), { error: 'Add a profile first' });
  // what add gives applies and validates, and is drawn in the profile's box
  const n = apply(m, T.edits.add(m, m.views[0], E('Stereotype'), 'audited', at(['conventions'])));
  assert.deepEqual(validate(n), []); assert.ok(layout(n, 'profile').families.find(f => f.id === 'conventions').nodeIds.includes('stereotype1'));
});

test('connect (§4.3): an extension from a stereotype to a metaclass, an application from a package to a profile, a generalization between stereotypes; any other is refused in the rule\'s words', () => {
  const c = (from, to, t) => T.edits.connect(PROFILE, V, from, to, null, { type: 'uml.' + t });
  assert.equal(c('column', 'mc-class', 'Extension'), null); assert.equal(c('sales', 'conventions', 'ProfileApplication'), null);
  assert.equal(c('conventions', 'conventions', 'ProfileApplication'), null, 'a profile is a package');
  assert.equal(c('owned', 'entity', 'Generalization'), null); assert.equal(c('order', 'entity', 'CommentLink'), null);
  assert.deepEqual(c('mc-class', 'column', 'Extension'), { error: 'An extension runs from a stereotype to a metaclass' });
  assert.deepEqual(c('column', 'order', 'Extension'), { error: 'An extension runs from a stereotype to a metaclass' });
  assert.deepEqual(c('order', 'conventions', 'ProfileApplication'), { error: 'A profile application runs from a package to a profile' });
  assert.deepEqual(c('sales', 'entity', 'ProfileApplication'), { error: 'A profile application runs from a package to a profile' });
  assert.deepEqual(c('order', 'entity', 'Generalization'), { error: 'A generalization here joins two stereotypes' });
  // the line the default then adds validates; isRequired and isAbstract are set as the panel's bool fields set them
  const m = apply(PROFILE, [{ op: 'add', element: L('ext1', 'Extension', 'column', 'mc-class'), view: 'profile' }, { op: 'set', id: 'ext1', path: 'props.isRequired', value: true }]);
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  assert.ok(layout(m, 'profile').byId.order.compartments.some(c => c.members[0].label === '«column»'), '«column», now required on Class, is supplied to Order');
  const a = apply(PROFILE, [{ op: 'set', id: 'entity', path: 'props.isAbstract', value: true }]);
  assert.deepEqual(validate(a), [], 'Order applies the specialization, not «entity»');
  assert.match(svgOf(layout(a, 'profile')), /class="c-name"[^>]*font:italic 600[^>]*data-o="entity"/, 'an abstract stereotype\'s name in italics');
});

test('members (§4.3): a stereotype\'s tag definitions in the class type\'s member syntax, through member.add and member.edit; an enumeration\'s literals', () => {
  const M = T.member, st = by(PROFILE, 'entity');
  assert.deepEqual(M.add('schema: String [0..1] = public', st), { type: 'uml.Property', label: 'schema', props: { valueType: 'String', multiplicity: '0..1', default: 'public' } });
  assert.equal(M.add('LOW', { type: 'uml.Enumeration' }).type, 'uml.EnumerationLiteral');
  assert.equal(M.print(st.members[0]), 'table: String');
  const m = apply(PROFILE, M.edit(st.members[0], 'table: String [0..1]').commands);
  assert.deepEqual(by(m, 'entity').members[0].props, { valueType: 'String', multiplicity: '0..1' });
  assert.deepEqual(validate(m), []);
  const n = apply(PROFILE, [{ op: 'add', element: { id: 'entity.schema', ...M.add('schema: Integer', st) }, owner: 'entity' }]);
  assert.deepEqual(validate(n).map(p => p.rule), ['tag-required'], 'Order\'s «aggregateRoot» inherits the new required tag, and sets none: warned');
  assert.deepEqual(M.edit(st.members[0], 'table String'), { error: '"table String" is not a member: "String" is left over: write name: Type [multiplicity] = default' });
});

test('tags edited (§5.7) redraw the compartment: a tag set through the panel\'s path, one emptied', () => {
  const m = apply(PROFILE, [{ op: 'set', id: 'order', path: ['props', 'tags', 'owned', 'team'], value: 'fulfilment' }]);
  assert.deepEqual(layout(m, 'profile').byId.order.compartments[1].members.map(x => x.label), ['«owned»', 'team = fulfilment']);
  const e = apply(PROFILE, [{ op: 'set', id: 'order', path: ['props', 'tags', 'owned', 'team'], value: undefined }]);
  assert.deepEqual(layout(e, 'profile').byId.order.compartments[1].members.map(x => x.label), ['«owned»', 'team = ?']);
  assert.deepEqual(validate(e).map(p => p.rule), ['tag-required']);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: N(`s${i}`, 'Stereotype', `audited${i}`, 'conventions', { members: [P(`s${i}.by`, 'by', 'String', { multiplicity: '0..1' })] }), view: 'profile' }],
    [{ op: 'add', element: N(`m${i}`, 'MetaclassReference', ['Component', 'Operation', 'Package', 'Interface', 'Association'][i], 'conventions'), view: 'profile' }],
    [{ op: 'add', element: L(`x${i}`, 'Extension', `s${i}`, `m${i}`), view: 'profile' }],
    [{ op: 'add', element: L(`g${i}`, 'Generalization', `s${i}`, 'entity'), view: 'profile' }],
    [[{ op: 'set', id: `x${i}`, path: 'props.isRequired', value: true }], [{ op: 'set', id: 'order', path: ['props', 'tags', 'owned', 'team'], value: `team ${i}` }], [{ op: 'set', id: `s${i}`, path: 'label', value: `renamed${i}` }]][i % 3],
    [[{ op: 'hide', id: `s${i}`, view: 'profile' }], [{ op: 'delete', id: `m${i}` }], [{ op: 'set', id: `s${i}`, path: 'props.isAbstract', value: true }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(PROFILE), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o) => unid(mapContext(m, o).buildView('profile').markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos.profile.runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, 'profile'), describe(JSON.parse(seen[30]), 'profile'));
});

// §11, §12: 3 profiles, 40 stereotypes, 50 metaclass references and applied elements, 60 lines: per profile 3 metaclasses and
// 13 or 14 stereotypes (a chain of generalizations), each extending one; 41 classes in 3 packages, each applying the profile
// of its package and one or two of its stereotypes with a tag
const STRESS = (() => {
  const nodes = [], edges = [], ids = [], metas = ['Class', 'Property', 'Classifier'];
  for (let p = 0; p < 3; p++) { nodes.push(N(`p${p}`, 'Profile', `Profile${p}`), N(`pk${p}`, 'Package', `package${p}`)); edges.push(L(`a${p}`, 'ProfileApplication', `pk${p}`, `p${p}`));
    metas.forEach((t, k) => nodes.push(N(`p${p}m${k}`, 'MetaclassReference', t, `p${p}`))); }
  for (let s = 0; s < 40; s++) { const p = s % 3, prev = s - 3;
    nodes.push(N(`s${s}`, 'Stereotype', `stereo${s}`, `p${p}`, { members: [P(`s${s}.t`, `tag${s}`, s % 2 ? 'Integer' : 'String', { multiplicity: '0..1' })] }));
    edges.push(L(`x${s}`, 'Extension', `s${s}`, `p${p}m${s % 2 ? 2 : 0}`));
    if (prev >= 0 && edges.filter(e => e.type === 'uml.Generalization').length < 17) edges.push(L(`g${s}`, 'Generalization', `s${s}`, `s${prev}`)); }
  for (let c = 0; c < 41; c++) { const p = c % 3, s = p + 3 * (c % 13);
    nodes.push(N(`c${c}`, 'Class', `Class${c}`, `pk${p}`, { props: { stereotypes: [`stereo${s}`], tags: { [`stereo${s}`]: { [`tag${s}`]: s % 2 ? String(c) : `value ${c}` } } } })); ids.push(`c${c}`); }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'uml.profile', nodeIds: nodes.map(n => n.id) }] };
})();
test('P1 (§12): on 3 profiles, 40 stereotypes, 50 metaclass references and applied elements and 60 lines, a full layout, a tag value set and a stereotype added, laid out and drawn under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven) (timed)', () => {
  assert.equal(STRESS.nodes.filter(n => n.type === 'uml.Stereotype').length, 40); assert.equal(STRESS.nodes.filter(n => ['uml.MetaclassReference', 'uml.Class'].includes(n.type)).length, 50);
  assert.equal(STRESS.edges.length, 60); assert.deepEqual(validate(STRESS), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(STRESS);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => { const r = { full: timed(() => mapContext(STRESS).buildView('all')),
    tag: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'c4', path: ['props', 'tags', 'stereo4', 'tag4'], value: 'x'.repeat(4 + k) }]))),
    stereo: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'c7', path: 'props.stereotypes', value: ['stereo7', `stereo${[1, 4, 10, 13, 16, 19, 22][k]}`] }]))) };
    return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('tag') < 1000, `a tag value ${best('tag')} ms`); assert.ok(best('stereo') < 1000, `a stereotype added ${best('stereo')} ms`);
  console.log(`# P1 target 100 ms: a tag value set ${best('tag').toFixed(1)} ms, a stereotype added ${best('stereo').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms`);
});
