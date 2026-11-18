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
import { tablesOf } from '../src/page/print.js';
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
  assert.deepEqual(Object.keys(T.edits), ['add', 'connect', 'rename', 'field']); // field: the Name field's clash check (audit 40)
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
  assert.match(g.legend[1], /<path d="M16 3L26 8L16 13Z" fill="var\(--um-muted\)"\/><\/g><\/svg><b>Extension</, 'the extension\'s glyph, a filled triangle');
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

test('an open package\'s and an enumeration\'s stereotypes and tags (§4.1, §4.4): a box\'s title over its name, the required ones too, its tags in its name and describe(); an enumeration\'s tag compartments over its literals, drawn as said', () => {
  const m = structuredClone(PROFILE);
  m.nodes.push(N('layer', 'Stereotype', 'layer', 'conventions', { members: [P('layer.tier', 'tier', 'String')] }), N('mc-package', 'MetaclassReference', 'Package', 'conventions'),
    N('coded', 'Stereotype', 'coded', 'conventions', { members: [P('coded.code', 'code', 'String')] }), N('mc-enum', 'MetaclassReference', 'Enumeration', 'conventions'),
    N('tier', 'Enumeration', 'Tier', 'sales', { props: { stereotypes: ['coded'], tags: { coded: { code: 'T' } } }, members: [N('tier.a', 'EnumerationLiteral', 'A')] }));
  m.edges.push(L('layer-ext', 'Extension', 'layer', 'mc-package', { props: { isRequired: true } }), L('coded-ext', 'Extension', 'coded', 'mc-enum'));
  by(m, 'sales').props = { tags: { layer: { tier: 'web' } } }; m.views[0].nodeIds.push('layer', 'mc-package', 'coded', 'mc-enum', 'tier');
  const g = layout(m, 'profile'), sales = g.families.find(f => f.id === 'sales'), want = 'Package sales, holding 2 elements: «layer» required tier = web';
  assert.equal(sales.title, '«layer» sales', 'the required «layer», supplied, over the name'); assert.equal(sales.aria, want);
  assert.equal(T.boxes(m, m.views[0]).find(b => b.id === 'sales').aria, want);
  assert.ok(describe(m, 'profile').split('\n').includes(want + '.'));
  assert.deepEqual(g.byId.tier.compartments.map(c => c.members.map(x => x.label)), [['«coded»', 'code = T'], ['A']]);
  assert.equal(g.byId.tier.aria, 'Enumeration Tier: «coded» code = T; A', 'its tags, then the literal drawn under them (audit 27)');
  assert.match(svgOf(g), /class="c-row"[^>]*>code = T<\/text>/, 'the compartment the name says is drawn');
  assert.deepEqual(validate(m), []);
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
  const lost = structuredClone(PROFILE); delete by(lost, 'mc-property').parent; lost.nodes.push(N('p2', 'Profile', 'Other')); lost.edges.push(L('pp', 'ProfileApplication', 'p2', 'conventions'), L('x', 'Extension', 'entity', 'gone'));
  assert.deepEqual(prProblems(lost).map(p => p.message), ['profile-owns: metaclass "Property" is owned by no profile', 'extension-ends: x runs from "entity" (stereotype) to "gone" (nothing): from a stereotype to a metaclass']);
  // a profile applying itself
  const self = structuredClone(PROFILE); self.edges.push(L('pp', 'ProfileApplication', 'conventions', 'conventions'));
  assert.deepEqual(prProblems(self).map(p => [p.message, p.ids]), [['application-ends: pp runs from "BookshopConventions" (profile) to "BookshopConventions" (profile): from a package to a profile other than itself', ['pp', 'conventions']]]);
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
  for (const no of [undefined, '']) assert.deepEqual(T.edits.add(m, m.views[0], E('MetaclassReference'), no, null), [{ op: 'add', element: { id: 'metaclass1', type: 'uml.MetaclassReference', parent: 'conventions' }, view: 'profile' }], 'no name: added unnamed');
  const none = { schemaVersion: 2, nodes: [N('s', 'Package', 's')], edges: [], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['s'] }] };
  assert.deepEqual(T.edits.add(none, none.views[0], E('Stereotype'), 'x', null), { error: 'Add a profile first' });
  // what add gives applies and validates, and is drawn in the profile's box
  const n = apply(m, T.edits.add(m, m.views[0], E('Stereotype'), 'audited', at(['conventions'])));
  assert.deepEqual(validate(n), []); assert.ok(layout(n, 'profile').families.find(f => f.id === 'conventions').nodeIds.includes('stereotype1'));
});

test('connect (§4.3): an extension from a stereotype to a metaclass, an application from a package to a profile, a generalization between stereotypes; any other is refused in the rule\'s words', () => {
  const c = (from, to, t) => T.edits.connect(PROFILE, V, from, to, null, { type: 'uml.' + t });
  assert.equal(c('column', 'mc-class', 'Extension'), null); assert.equal(c('sales', 'conventions', 'ProfileApplication'), null);
  assert.deepEqual(c('conventions', 'conventions', 'ProfileApplication'), { error: 'A profile application runs from a package to a profile other than itself' });
  const two = structuredClone(PROFILE); two.nodes.push(N('p2', 'Profile', 'Other'));
  assert.equal(T.edits.connect(two, V, 'p2', 'conventions', null, { type: 'uml.ProfileApplication' }), null, 'a profile is a package');
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

test('validate() of a 3,000-deep stereotype chain listed most specialized first: tag definitions gathered without recursion (audit 2)', () => {
  const nodes = [{ id: 'P', type: 'uml.Profile', label: 'P' }, { id: 'pk', type: 'uml.Package', label: 'pk' }, { id: 'mc', type: 'uml.MetaclassReference', label: 'Class', parent: 'P' }];
  const edges = [{ id: 'app', type: 'uml.ProfileApplication', from: 'pk', to: 'P' }, { id: 'ex', type: 'uml.Extension', from: 's0', to: 'mc' }];
  for (let i = 2999; i >= 0; i--) nodes.push({ id: 's' + i, type: 'uml.Stereotype', label: 'S' + i, parent: 'P' });
  for (let i = 1; i < 3000; i++) edges.push({ id: 'g' + i, type: 'uml.Generalization', from: 's' + i, to: 's' + (i - 1) });
  assert.deepEqual(validate({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['P'] }] }), []);
});
test('audit 9: a closed package on a profile view draws the required stereotype its profile supplies', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'P', type: 'uml.Profile', label: 'Arch' },
    { id: 'mod', type: 'uml.Stereotype', label: 'module', parent: 'P', members: [{ id: 'team', type: 'uml.Property', label: 'team', props: { valueType: 'String', default: 'core' } }] },
    { id: 'pk', type: 'uml.MetaclassReference', label: 'Package', parent: 'P' }, { id: 'app', type: 'uml.Package', label: 'app' }, { id: 'cat', type: 'uml.Package', label: 'catalog', parent: 'app' }],
  edges: [{ id: 'ext', type: 'uml.Extension', from: 'mod', to: 'pk', props: { isRequired: true } }, { id: 'ap', type: 'uml.ProfileApplication', from: 'app', to: 'P' }],
  views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['P', 'mod', 'pk', 'cat'] }] };
  const n = layout(m, 'v').nodes.find(x => x.id === 'cat');
  assert.equal(n.shape, 'package'); assert.deepEqual(n.stereotypes, ['module']); assert.match(n.aria, /«module» required team = core/);
});
test('audit 9: member-kinds: a profile and a metaclass reference hold no members, as a package', () => {
  for (const t of ['uml.Profile', 'uml.MetaclassReference']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'P', type: t, label: 'Arch', members: [{ id: 'P.a', type: 'uml.Property', label: 'version' }] }], edges: [] };
    assert.deepEqual(classProblems(m).map(p => p.rule), ['member-kinds'], t);
  }
});

test('audit 17: a member\'s standard or unresolved stereotypes stay in its row and its PDF row; its profile ones are written once', () => {
  const m = structuredClone(PROFILE), x = by(m, 'order').members[0];
  x.props.stereotypes = ['document', 'column', 'BookshopConventions::column', 'nowhere'];
  const g = layout(m, 'profile'), rows = g.byId.order.compartments.at(-1).members.map(r => r.label);
  assert.deepEqual(rows, ['«column» «document» «nowhere» - placedAt: Instant {name = placed_at, indexed = true}']);
  assert.match(T.rows(m, m.views[0], 'order').at(-1), /^«document» «nowhere» - placedAt: Instant: «column» name = placed_at/);
  assert.match(describe(m, 'profile'), /«document» «nowhere» - placedAt/);
});

test('audit 19: New member on a stereotype refuses an operation, which the profile view never draws; a tag and an enumeration\'s rows are read as before', async () => {
  const { readFileSync } = await import('node:fs');
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-profile.json', import.meta.url))), T = diagramOf(m.views[0]);
  const st = m.nodes.find(n => n.type === 'uml.Stereotype');
  const r = T.member.add('validate(): Boolean', st);
  assert.ok(r.error && /a stereotype's row is a tag/.test(r.error), JSON.stringify(r));
  assert.deepEqual(T.member.add('sla: Integer [0..1]', st), { type: 'uml.Property', label: 'sla', props: { valueType: 'Integer', multiplicity: '0..1' } });
  const en = { id: 'e', type: 'uml.Enumeration' };
  assert.equal(T.member.add('LOW', en).type, 'uml.EnumerationLiteral');
  assert.equal(T.member.add('rank(): Integer', en).type, 'uml.Operation', 'an enumeration keeps the class type\'s rows');
});

test('audit 20: the palette refuses a stereotype or an enumeration named as one the profile has (stereotype-names, classifier-names); another profile, a new name and no name are added', async () => {
  const { readFileSync } = await import('node:fs');
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-profile.json', import.meta.url))), v = m.views[0], E = t => T.elements.find(e => e.type === 'uml.' + t), at = { sel: ['conventions'] };
  for (const name of ['Entity', 'entity', 'AggregateRoot'])
    assert.deepEqual(T.edits.add(m, v, E('Stereotype'), name, at), { error: `BookshopConventions has a stereotype ${name.charAt(0).toLowerCase() + name.slice(1)} already: names meet with the first letter in either case` });
  assert.deepEqual(T.edits.add(m, v, E('Enumeration'), 'entity', at), { error: 'BookshopConventions has a classifier named entity already' });
  const m2 = apply(m, T.edits.add(m, v, E('Enumeration'), 'Level', at)), v2 = m2.views[0];
  assert.deepEqual(T.edits.add(m2, v2, E('Enumeration'), 'Level', at), { error: 'BookshopConventions has a classifier named Level already' });
  assert.ok(Array.isArray(T.edits.add(m2, v2, E('Stereotype'), 'level', at)), 'a stereotype named as an enumeration in another case: no rule meets');
  for (const [type, name] of [['Stereotype', 'audited'], ['Stereotype', ''], ['Enumeration', ''], ['MetaclassReference', 'Class']]) {
    const c = T.edits.add(m, v, E(type), name, at); assert.ok(Array.isArray(c), `${type} ${JSON.stringify(name)}`);
    assert.deepEqual(validate(apply(m, c)).filter(p => p.level === 'error'), [], `${type} ${JSON.stringify(name)}`); }
});

test('audit 25: an extension and a profile application the view draws as its own lines mean what model lines do: no problem, the same names and rows', async () => {
  const { readFileSync } = await import('node:fs');
  const base = JSON.parse(readFileSync(new URL('./profile-minimal.json', import.meta.url)));
  const own = structuredClone(base); own.views[0].edges = own.edges; own.edges = [];
  const said = m => ({ problems: validate(m), describe: describe(m, 'v'), aria: layout(m, 'v').nodes.map(n => [n.id, n.aria]),
    rows: m.nodes.map(n => [n.id, T.rows(m, m.views[0], n.id)]) });
  assert.deepEqual(said(own), said(base));
  assert.deepEqual(said(own).problems, []);
  assert.ok(said(own).describe.includes('extended by «entity»') && said(own).describe.includes('table = orders'), said(own).describe);
  // only the extension as the view's own: the stereotype still extends Class
  const ext = structuredClone(base); ext.views[0].edges = [ext.edges.shift()];
  assert.deepEqual(validate(ext), []);
});

test('audit 26: an extension or an application one profile view draws as its own line is said by every profile view\'s rows and names, as the compartments and validate() take it', async () => {
  const { readFileSync } = await import('node:fs');
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-profile.json', import.meta.url)));
  const ext = m.edges.find(e => e.id === 'owned-extends-class'), app = m.edges.find(e => e.id === 'sales-applies-conventions');
  m.edges = m.edges.filter(e => e !== ext && e !== app);
  const A = m.views[0]; A.edges = [...m.edges.map(e => e.id), ext, app];
  const B = { ...A, id: 'b', title: 'B' }; delete B.edges; m.views.push(B);
  assert.deepEqual(validate(m), []);
  const owned = m.nodes.find(n => n.type === 'uml.Stereotype' && n.label === 'owned').id, prof = app.to;
  for (const v of [A, B]) {
    const d = describe(m, v.id).split('\n');
    assert.match(d.find(l => l.startsWith('Stereotype owned')), /extends Class \{required\}/, v.id);
    assert.match(d.find(l => l.startsWith('Class Order')), /«owned» required/, `${v.id}: the compartment, as before`);
    assert.ok(T.rows(m, v, owned).includes('extends Class {required}'), `${v.id}: the stereotype's row`);
    assert.ok(T.rows(m, v, prof).some(r => /applied to sales/.test(r)), `${v.id}: the profile's row`);
  }
});

// audit 27: the PDF's rows fell back to the class rows when an element had no stereotype, listing a plain class's members,
// which the view does not draw; and a stereotyped enumeration's row dropped the literals the view draws
test('audit 27: the PDF rows and describe() say what the profile view draws: a plain class no members, an enumeration its literals', () => {
  const m = structuredClone(PROFILE), cls = (id, label, extra) => N(id, 'Class', label, 'sales', { ...extra, members: [P(id + '.total', 'total', 'Money'), N(id + '.pay', 'Operation', 'pay')] });
  m.nodes.push(cls('invoice', 'Invoice'), N('coded', 'Stereotype', 'coded', 'conventions'), N('mc-enum', 'MetaclassReference', 'Enumeration', 'conventions'),
    N('kind', 'Enumeration', 'Kind', 'sales', { props: { stereotypes: ['coded'] }, members: [N('kind.a', 'EnumerationLiteral', 'RETAIL'), N('kind.b', 'EnumerationLiteral', 'TRADE')] }),
    N('plain', 'Enumeration', 'Plain', 'sales', { members: [N('plain.a', 'EnumerationLiteral', 'ONE')] }));
  m.edges.push(L('coded-ext', 'Extension', 'coded', 'mc-enum')); m.views[0].nodeIds.push('invoice', 'coded', 'mc-enum', 'kind', 'plain');
  const g = layout(m, 'profile'), drawn = svgOf(g);
  assert.doesNotMatch(drawn, />total: Money<|>\+? ?pay\(\)</, 'the plain class\'s members are not drawn');
  assert.deepEqual(T.rows(m, V, 'invoice'), ['«owned» required team = ?'], 'so the PDF lists none, only the required «owned» it draws');
  assert.ok(describe(m, 'profile').split('\n').includes('Class Invoice: «owned» required team = ?.'));
  const iface = structuredClone(m); by(iface, 'invoice').type = 'uml.Interface'; // no stereotype at all: an empty row, not the class rows
  assert.deepEqual(T.rows(iface, V, 'invoice'), []);
  for (const t of ['RETAIL', 'TRADE', 'ONE']) assert.match(drawn, new RegExp(`>${t}</`), t);
  assert.deepEqual(T.rows(m, V, 'kind'), ['«coded»', 'RETAIL', 'TRADE']);
  assert.deepEqual(T.rows(m, V, 'plain'), ['ONE']);
  assert.ok(describe(m, 'profile').split('\n').includes('Enumeration Kind: «coded»; RETAIL; TRADE.'));
  assert.equal(T.rows(m, V, 'sales'), null, 'a closed package with no stereotype keeps its own rows');
});

test('audit 29: another UML kind in a profile view is drawn with its kind\'s keyword, as it is named and as the class view draws it', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Component', label: 'Billing' }, { id: 'a', type: 'uml.Actor', label: 'Clerk' }, { id: 'k', type: 'uml.Class', label: 'Plain' }],
    edges: [], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['c', 'a', 'k'] }] };
  const g = layout(m, 'v'), st = id => g.nodes.find(n => n.id === id).stereotypes;
  assert.deepEqual([st('c'), st('a'), st('k')], [['component'], ['actor'], []]);
  assert.match(svgOf(g), /«component»/);
});

test('audit 31: a tag value JSON cannot write (a BigInt inside, or a cycle) is drawn and said as jsonText() writes it, not a throw', () => {
  const mk = v => ({ schemaVersion: 2, nodes: [N('p', 'Profile', 'Orm'), N('st', 'Stereotype', 'entity', 'p', { members: [N('st.t', 'Property', 'table', null, { props: { valueType: 'String' } })] }),
    N('mc', 'MetaclassReference', 'Class', 'p'), N('pk', 'Package', 'shop'), N('o', 'Class', 'Order', 'pk', { props: { stereotypes: ['entity'], tags: { entity: { table: v } } } })],
  edges: [L('x', 'Extension', 'st', 'mc'), L('ap', 'ProfileApplication', 'pk', 'p')], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['p', 'st', 'mc', 'pk', 'o'] }] });
  const cyc = { a: 1 }; cyc.self = cyc;
  for (const [v, text] of [[{ n: 10n }, 'table = {"n":10n}'], [cyc, 'table = {"a":1,"self":"[cycle]"}'], [{ a: 1 }, 'table = {"a":1}']]) {
    const m = mk(v);
    assert.ok(layout(m, 'v').nodes.some(n => n.id === 'o'), text);
    assert.ok(describe(m, 'v').split('\n').includes(`Class Order: «entity» ${text}.`), text);
    assert.ok(T.rows(m, m.views[0], 'o').includes(`«entity» ${text}`), text);
  }
});

test('audit 32: an enumeration\'s accessible name, describe() and PDF Members list what its box draws, in drawn order: the literals first, no port or member of no type', () => {
  const m = { schemaVersion: 2, title: 't', nodes: [{ id: 'k', type: 'uml.Enumeration', label: 'Shop', members: [{ id: 'k.a', type: 'uml.Property', label: 'name', props: { valueType: 'String' } },
    { id: 'k.o', type: 'uml.Operation', label: 'run' }, { id: 'k.l', type: 'uml.EnumerationLiteral', label: 'RED' }, { id: 'k.p', type: 'uml.Port', label: 'api' }, { id: 'k.x', label: 'untyped' }] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['k'] }] };
  const n = layout(m, 'v').nodes.find(x => x.id === 'k'), drawn = n.compartments.flatMap(c => c.members.map(x => x.label));
  assert.deepEqual(drawn, ['RED', 'name', 'run']);
  assert.equal(n.aria, 'Enumeration Shop: RED; name: String; run()');
  assert.match(describe(m, 'v'), /Enumeration Shop: RED; name: String; run\(\)/);
  const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v')), row = els.rows.find(r => r.includes('<b>Shop</b>'));
  assert.match(row, /<p>RED<\/p><p>name: String<\/p><p>run\(\)<\/p><\/td>/); assert.doesNotMatch(row, /api|untyped/);
});

// audit 40: the palette refused a stereotype named as one its profile has (audit 20), but F2 and the Name field renamed one to
// it, and validate() then said stereotype-names and classifier-names, errors; both are refused in the add's words now
test('audit 40: F2 and the Name field refuse renaming a stereotype or a classifier to a name its owner has, as the add does', async () => {
  const { readFileSync } = await import('node:fs');
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-profile.json', import.meta.url))), v = m.views[0];
  m.nodes.push(N('line', 'Class', 'Line', 'sales'));
  const errs = x => validate(x).filter(p => p.level === 'error').map(p => p.message);
  assert.deepEqual(errs(m), []);
  const st = { error: 'BookshopConventions has a stereotype entity already: names meet with the first letter in either case' };
  assert.deepEqual(T.edits.add(m, v, { type: 'uml.Stereotype' }, 'entity', { sel: ['entity'] }), st, 'the add, as before');
  assert.deepEqual(T.edits.rename(m, v, 'aggregate-root', 'entity'), st);
  assert.deepEqual(T.edits.rename(m, v, 'aggregate-root', 'Entity'), st, 'the first letter in either case');
  assert.deepEqual(T.edits.field(m, v, 'aggregate-root', 'label', 'entity'), st);
  assert.deepEqual(T.edits.rename(m, v, 'line', 'Order'), { error: 'sales has a classifier named Order already' });
  assert.deepEqual(T.edits.field(m, v, 'line', 'label', 'Order'), { error: 'sales has a classifier named Order already' });
  // let through, each leaving validate() clean: a new name, a stereotype's own name in the other case, another field
  for (const [id, name] of [['aggregate-root', 'aggregate'], ['entity', 'Entity'], ['line', 'OrderLine'], ['conventions', 'Shop']]) {
    assert.equal(T.edits.rename(m, v, id, name), null, `${id} -> ${name}`); assert.equal(T.edits.field(m, v, id, 'label', name), null);
    assert.deepEqual(errs(apply(m, [{ op: 'set', id, path: 'label', value: name }])), [], `${id} -> ${name}`); }
  assert.equal(T.edits.field(m, v, 'aggregate-root', 'props.isAbstract', true), null);
});
