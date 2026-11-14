// Stereotypes applied across the model (work package 6.2, notes/stage-6.md §5): scope by ownership, names, the metaclass
// table, required extensions, tags keyed by stereotype, the rules of §5.3 to §5.6, appliedOf, and the two slots of the core
// it fills (TYPED.across, TYPED.fields). Imports src/ to reach the internals; lib/umlimator-all.js holds the same code. The
// case that runs through validate() needs 6.1's slot in the core: it is skipped until it merges. The panel's fields are
// tested through their path and apply(), as the panel commits them; 6.1's tests/typed-edit.html renders the slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TYPED, diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { validate } from '../src/map/validate.js';
import { targets, MOVED } from '../docs/diagrams/examples/check.mjs';
import { STY_RULES, UML_META, UML_AS, metaOf, metaUp, stereoProblems, appliedOf, tagFields } from '../src/uml/stereotypes.js';

const here = new URL('./', import.meta.url), read = url => JSON.parse(readFileSync(url));
const N = (id, type, label, parent, more = {}) => ({ id, type: 'uml.' + type, label, ...(parent ? { parent } : {}), ...more });
const E = (id, type, from, to, more = {}) => ({ id, type: 'uml.' + type, from, to, ...more });
const P = (id, label, valueType, more = {}) => N(id, 'Property', label, null, { props: { valueType, ...more } });
const by = (m, id) => m.nodes.find(n => n.id === id);

/* A profile Conv applied to sales: «entity» (a required tag) and «column» (Property) on Class and Property, «tracked» on
   Classifier, «audited» with an enumeration tag; Order sits two packages deep under sales; catalog applies nothing */
function base() {
  return { schemaVersion: 2,
    nodes: [
      N('conv', 'Profile', 'Conv'),
      N('mc-class', 'MetaclassReference', 'Class', 'conv'), N('mc-property', 'MetaclassReference', 'Property', 'conv'), N('mc-classifier', 'MetaclassReference', 'Classifier', 'conv'),
      N('level', 'Enumeration', 'Level', 'conv', { members: [N('level.low', 'EnumerationLiteral', 'low'), N('level.high', 'EnumerationLiteral', 'high')] }),
      N('entity', 'Stereotype', 'entity', 'conv', { members: [P('entity.table', 'table', 'String')] }),
      N('column', 'Stereotype', 'column', 'conv', { members: [P('column.name', 'name', 'String', { multiplicity: '0..1' }), P('column.indexed', 'indexed', 'Boolean', { default: 'false' })] }),
      N('tracked', 'Stereotype', 'tracked', 'conv', { members: [P('tracked.level', 'level', 'Level', { multiplicity: '0..1' }), P('tracked.size', 'size', 'Integer', { multiplicity: '0..1' }),
        P('tracked.ratio', 'ratio', 'Real', { multiplicity: '0..1' }), P('tracked.max', 'max', 'UnlimitedNatural', { multiplicity: '0..1' })] }),
      N('sales', 'Package', 'sales'), N('orders', 'Package', 'orders', 'sales'), N('inner', 'Package', 'inner', 'orders'),
      N('order', 'Class', 'Order', 'inner', { props: { stereotypes: ['entity'], tags: { entity: { table: 'orders' } } },
        members: [N('order.placedAt', 'Property', 'placedAt', null, { props: { stereotypes: ['column'], tags: { column: { name: 'placed_at', indexed: 'true' } } } })] }),
      N('billing', 'Component', 'Billing', 'sales', { props: { stereotypes: ['tracked', 'utility'], tags: { tracked: { level: 'high', size: '-3', ratio: '2.5e3', max: '*' } } } }),
      N('catalog', 'Package', 'catalog'),
      N('book', 'Class', 'Book', 'catalog', { props: { stereotypes: ['entity', 'service'] } }), // standard names outside every profile: keywords
      N('shopper', 'Actor', 'Shopper', null, { props: { stereotypes: ['actor'] } }),
    ],
    edges: [
      E('entity-class', 'Extension', 'entity', 'mc-class'), E('column-property', 'Extension', 'column', 'mc-property'), E('tracked-classifier', 'Extension', 'tracked', 'mc-classifier'),
      E('sales-conv', 'ProfileApplication', 'sales', 'conv'),
      E('order-billing', 'Dependency', 'order', 'billing', { props: { stereotypes: ['use'] } }), // a keyword in scope (§5.3, 3)
    ],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['order', 'book'] }] };
}

// each rule broken once on the base: the ids it names
const BREAKS = {
  'stereotype-unknown': m => { by(m, 'order').props.stereotypes.push('entitty'); return ['order']; },
  'stereotype-applied': m => { by(m, 'book').props.stereotypes.push('tracked'); return ['book', 'conv']; },
  'stereotype-ambiguous': m => { m.nodes.push(N('other', 'Profile', 'Other'), N('entity2', 'Stereotype', 'Entity', 'other'));
    m.edges.push(E('orders-other', 'ProfileApplication', 'orders', 'other'), E('entity2-class', 'Extension', 'entity2', 'mc-class')); delete by(m, 'order').props.tags; return ['order', 'conv', 'other']; },
  'stereotype-extends': m => { by(m, 'billing').props.stereotypes.push('column'); return ['billing', 'column']; },
  'stereotype-abstract': m => { m.nodes.push(N('base', 'Stereotype', 'base', 'conv', { props: { isAbstract: true } })); m.edges.push(E('base-class', 'Extension', 'base', 'mc-class'));
    by(m, 'order').props.stereotypes.push('base'); return ['order', 'base']; },
  // an abstract required stereotype, met on Order by a specialization; Billing, a Component and so a Class, applies none (decision 22)
  'stereotype-required': m => { m.nodes.push(N('owned', 'Stereotype', 'owned', 'conv', { props: { isAbstract: true } }), N('team-owned', 'Stereotype', 'teamOwned', 'conv'));
    m.edges.push(E('owned-class', 'Extension', 'owned', 'mc-class', { props: { isRequired: true } }), E('team-is-owned', 'Generalization', 'team-owned', 'owned'));
    by(m, 'order').props.stereotypes.push('teamOwned'); return ['billing', 'owned']; },
  'tag-defined': m => { by(m, 'order').props.tags.entity.tabel = 'x'; return ['order', 'entity']; },
  'tag-value': m => { by(m, 'order').members[0].props.tags.column.indexed = 'yes'; return ['order.placedAt', 'column.indexed']; },
  'tag-required': m => { delete by(m, 'order').props.tags.entity.table; return ['order', 'entity.table']; },
};

test('each rule of §5.3 to §5.6 passes on a model that keeps it and fails on one that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(stereoProblems(base()), []);
  assert.deepEqual(Object.keys(BREAKS).sort(), Object.keys(STY_RULES).sort(), 'a case for every rule');
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = base(), ids = broke(m), got = stereoProblems(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, rule === 'stereotype-abstract' ? 'error' : 'warning', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.match(p.path, /^nodes\[\d+\]/, rule);
  }
});

test('names (§5.3): first letter either case, Profile::name picks one of two, standard names and keywords free in scope, a stereotype of a profile not applied here warned', () => {
  const keys = (m, id) => appliedOf(m, id).map(e => [e.key, e.stereotype.id, e.profile.id]);
  let m = base(); by(m, 'order').props = { stereotypes: ['Entity', 'utility'], tags: { Entity: { table: 'orders' } } };
  assert.deepEqual(stereoProblems(m), []); assert.deepEqual(keys(m, 'order'), [['Entity', 'entity', 'conv']]);
  m = base(); BREAKS['stereotype-ambiguous'](m); by(m, 'order').props = { stereotypes: ['Conv::entity', 'Other::entity'], tags: { 'Conv::entity': { table: 'orders' } } };
  assert.deepEqual(stereoProblems(m), []); assert.deepEqual(keys(m, 'order'), [['Conv::entity', 'entity', 'conv'], ['Other::entity', 'entity2', 'other']]);
  m = base(); by(m, 'order').props.stereotypes.push('Nope::entity', 'Conv::nope');
  assert.deepEqual(stereoProblems(m).map(p => p.message), ['stereotype-unknown: «Nope::entity» on "Order": no profile is named Nope', 'stereotype-unknown: «Conv::nope» on "Order": profile Conv defines no stereotype nope']);
  m = base(); by(m, 'book').props.stereotypes = ['Conv::entity']; // qualified, outside the profile's scope
  assert.deepEqual(stereoProblems(m).map(p => p.message), ['stereotype-applied: «Conv::entity» is a stereotype of Conv, which is not applied to catalog or its owners']);
  // «entity» outside sales stays the standard keyword; «tracked» there is Conv's, not applied
  m = base(); by(m, 'book').props.stereotypes.push('tracked');
  assert.deepEqual(stereoProblems(m).map(p => p.message), ['stereotype-applied: «tracked» is a stereotype of Conv, which is not applied to catalog or its owners']);
  assert.deepEqual(appliedOf(m, 'book'), []);
});

test('scope (§5.2): by ownership at any depth; a member by its element, a line by its parent or its from end\'s owner; a view\'s own element and one no package owns have none', () => {
  const m = base();
  m.nodes.push(N('loose', 'Class', 'Loose', null, { props: { stereotypes: ['tracked'] } }), N('mine', 'Class', 'Mine', 'catalog'));
  m.edges.push(E('via-from', 'Dependency', 'order.placedAt', 'book', { props: { stereotypes: ['tracked'] } }), E('via-parent', 'Dependency', 'book', 'mine', { parent: 'orders', props: { stereotypes: ['nope'] } }),
    E('outside', 'Dependency', 'book', 'mine', { props: { stereotypes: ['nope'] } }));
  m.views[0].edges = [E('own', 'Dependency', 'order', 'book', { props: { stereotypes: ['tracked'] } })];
  const got = stereoProblems(m).map(p => [p.rule, p.path]);
  assert.deepEqual(got, [
    ['stereotype-applied', 'nodes[16].props.stereotypes[0]'], // Loose: no owner
    ['stereotype-extends', 'edges[5].props.stereotypes[0]'], // in scope by its from end, a member of Order: «tracked» is on Classifier, a Dependency is none
    ['stereotype-unknown', 'edges[6].props.stereotypes[0]'], // in scope by its parent
    ['stereotype-applied', 'views[0].edges[0].props.stereotypes[0]'], // a view's own line: no scope
  ]); // `outside`, owned by catalog's Book, says nothing of «nope»: a keyword
});

test('metaclasses (§5.4): a stereotype on Classifier fits a component, a general\'s extension counts, the five registry types that are no metaclass map as stated, a sysml. element is not checked', () => {
  assert.ok(metaUp('Component').has('Classifier') && metaUp('DataStoreNode').has('ActivityNode') && metaUp('Port').has('Property') && metaUp('Profile').has('Package'));
  assert.ok(!metaUp('Interface').has('Class') && !metaUp('Dependency').has('Classifier'));
  // generals OMG's UML.xmi (20161101) lists beyond the first
  for (const [a, g] of [['Node', 'DeploymentTarget'], ['Device', 'DeploymentTarget'], ['Artifact', 'DeployedArtifact'], ['Operation', 'TemplateableElement'], ['Operation', 'ParameterableElement'],
    ['InformationFlow', 'PackageableElement'], ['ObjectNode', 'TypedElement'], ['Class', 'ParameterableElement'], ['Pseudostate', 'RedefinableElement']]) assert.ok(metaUp(a).has(g), `${a} ${g}`);
  assert.equal(metaOf({ type: 'uml.CommentLink' }), null); assert.equal(metaOf({ type: 'uml.InternalTransition' }), 'Transition'); assert.equal(metaOf({ type: 'sysml.Block' }), undefined);
  const m = base(); m.nodes.push(N('sub', 'Stereotype', 'sub', 'conv'), N('blk', 'sysml.Block', 'Blk', 'sales'), N('weird', 'MetaclassReference', 'Gizmo', 'conv'), N('gz', 'Stereotype', 'gz', 'conv'));
  m.nodes.find(n => n.id === 'blk').type = 'sysml.Block';
  const sub = { sub: { table: 't' } };
  m.edges.push(E('sub-entity', 'Generalization', 'sub', 'entity'), E('gz-gizmo', 'Extension', 'gz', 'weird'), E('note', 'CommentLink', 'order', 'billing', { props: { stereotypes: ['sub'], tags: sub } }));
  by(m, 'order').props.stereotypes.push('sub'); Object.assign(by(m, 'order').props.tags, sub); // a general's extension: Class
  by(m, 'billing').props.stereotypes.push('sub', 'gz'); Object.assign(by(m, 'billing').props.tags, sub); // a Component is a Class
  m.nodes.find(n => n.id === 'blk').props = { stereotypes: ['column'] };
  assert.deepEqual(stereoProblems(m).map(p => p.message), [
    'stereotype-extends: «gz» on "Billing" extends Gizmo, which a Component is not', // a name in no row fits only itself
    'stereotype-extends: «sub» on "note" extends Class, which a CommentLink is not']);
});

test('the metaclass table has a row or a stated mapping for every uml.* type every registered type uses, and its generals are rows too', async () => {
  const files = readdirSync(new URL('../src/uml/', here)).filter(f => f.endsWith('.js'));
  for (const f of files) await import(`../src/uml/${f}`);
  const names = files.flatMap(f => [...readFileSync(new URL(`../src/uml/${f}`, here), 'utf8').matchAll(/registerDiagramType\('([^']+)'/g)].map(x => x[1]));
  assert.ok(names.length >= 12, names.join());
  const used = new Set();
  for (const n of names) { const T = diagramOf({ diagram: n }); [...(T.elements || []), ...(T.lines || [])].forEach(e => used.add(e.type)); (T.items || []).forEach(t => used.add(t)); Object.keys(T.props || {}).forEach(t => used.add(t)); }
  // and every type a registered type's source names (members: a literal, an operation, a slot, an operand, an extension point)
  files.filter(f => f !== 'stereotypes.js').forEach(f => [...readFileSync(new URL(`../src/uml/${f}`, here), 'utf8').matchAll(/'uml\.([A-Z]\w+)'/g)].forEach(x => used.add('uml.' + x[1])));
  ['Profile', 'Stereotype', 'MetaclassReference', 'Extension', 'ProfileApplication', 'Lifeline', 'Message', 'DurationConstraint', 'TimeConstraint'].forEach(t => used.add('uml.' + t)); // stage 6's
  const missing = [...used].filter(t => t.startsWith('uml.') && !Object.hasOwn(UML_META, t.slice(4)) && !Object.hasOwn(UML_AS, t.slice(4)));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 70, `${used.size} types`);
  Object.values(UML_META).flat().forEach(g => assert.ok(Object.hasOwn(UML_META, g), `${g} is a row`));
  Object.values(UML_AS).forEach(t => assert.ok(t === null || Object.hasOwn(UML_META, t), t));
});

test('required extensions (§5.5): supplied to every element of the metaclass in scope, at any depth, with no warning; their tags are the element\'s', () => {
  const m = base();
  m.nodes.push(N('owned', 'Stereotype', 'owned', 'conv', { members: [P('owned.team', 'team', 'String')] }));
  m.edges.push(E('owned-class', 'Extension', 'owned', 'mc-class', { props: { isRequired: true } }));
  by(m, 'order').props.tags.owned = { team: 'checkout' };
  const got = stereoProblems(m);
  assert.deepEqual(got.map(p => p.message), ['tag-required: «owned» team on "Billing" has no value and no default']); // Billing is a Component, so a Class
  assert.deepEqual(appliedOf(m, 'order').map(e => [e.key, e.required, e.tags.map(t => `${t.name}=${t.value}`).join()]), [['entity', false, 'table=orders'], ['owned', true, 'team=checkout']]);
  assert.deepEqual(appliedOf(m, 'billing').map(e => [e.key, e.required]), [['tracked', false], ['owned', true]]);
  assert.deepEqual(appliedOf(m, 'book'), []); // catalog applies no profile
  assert.deepEqual(appliedOf(m, 'order.placedAt').map(e => e.key), ['column']); // a Property is no Class
  // stored too, it is the stored one, marked required; a concrete specialization meets it
  by(m, 'order').props.stereotypes.push('owned'); stereoProblems(m); // the model read again after the edit
  assert.deepEqual(appliedOf(m, 'order').map(e => [e.key, e.required]), [['entity', false], ['owned', true]]);
});

test('tags (§5.6): keyed by stereotype, two stereotypes\' `name` keep two values, inherited tags under the stereotype applied, every type\'s values checked, a redefinition of another type said on the profile', () => {
  const m = base();
  m.nodes.push(N('named', 'Stereotype', 'named', 'conv', { members: [P('named.name', 'name', 'String')] }), N('root', 'Stereotype', 'root', 'conv', { members: [P('root.table', 'table', 'Integer'), P('root.ctx', 'ctx', 'String', { default: 'sales' })] }));
  m.edges.push(E('named-property', 'Extension', 'named', 'mc-property'), E('root-entity', 'Generalization', 'root', 'entity'));
  const pa = by(m, 'order').members[0].props; pa.stereotypes.push('named'); pa.tags.named = { name: 'other' };
  by(m, 'order').props = { stereotypes: ['root'], tags: { root: { table: '12' } } };
  assert.deepEqual(stereoProblems(m).map(p => [p.rule, p.path, p.message]), [['tag-defined', 'nodes[17].members[0]', 'tag-defined: «root» redefines tag "table" of «entity» as Integer, not String']]);
  assert.deepEqual(appliedOf(m, 'order.placedAt').map(e => [e.key, e.tags.find(t => t.name === 'name').value]), [['column', 'placed_at'], ['named', 'other']]);
  assert.deepEqual(appliedOf(m, 'order')[0].tags.map(t => [t.name, t.value, t.def.id]), [['table', '12', 'root.table'], ['ctx', undefined, 'root.ctx']]);
  // each checked type, right and wrong
  const bad = { level: 'mid', size: '3.5', ratio: 'x', max: '-1' }, say = { level: 'one of low, high', size: 'a whole number', ratio: 'a number', max: 'a whole number or *' };
  for (const [k, v] of Object.entries(bad)) { const b = base(); by(b, 'billing').props.tags.tracked[k] = v;
    assert.deepEqual(stereoProblems(b).map(p => p.message), [`tag-value: «tracked» ${k} = ${JSON.stringify(v)} on "Billing" is not ${say[k]}`], k); }
  const b = base(); by(b, 'billing').props.tags = 'level=high'; by(b, 'order').props.tags.entity = 'orders';
  assert.deepEqual(stereoProblems(b).map(p => p.message), ['tag-defined: the tags of "Order" under «entity» are a map from each tag to its value', 'tag-required: «entity» table on "Order" has no value and no default', 'tag-defined: the tags of "Billing" are a map from each stereotype to its tags']);
});

test('fields (§5.7): one per tag of each stereotype an element has, the key carrying the stereotype; a Boolean or an enumeration a choice; set through the panel\'s path, made on the way and removed when empty', () => {
  const m = base(), pa = by(m, 'order').members[0];
  assert.equal(TYPED.across, stereoProblems); assert.equal(TYPED.fields, tagFields);
  assert.deepEqual(tagFields(m, pa), [
    { key: 'p:column:name', path: ['tags', 'column', 'name'], label: '«column» name', kind: 'text' },
    { key: 'p:column:indexed', path: ['tags', 'column', 'indexed'], label: '«column» indexed', kind: 'enum', options: ['true', 'false'] }]);
  assert.deepEqual(tagFields(m, by(m, 'billing'))[0], { key: 'p:tracked:level', path: ['tags', 'tracked', 'level'], label: '«tracked» level', kind: 'enum', options: ['low', 'high'] });
  assert.deepEqual(tagFields(m, by(m, 'book')), []); assert.deepEqual(tagFields({ schemaVersion: 2, nodes: [N('a', 'Class', 'A')] }, N('a', 'Class', 'A')), []);
  // the panel commits a field as set of ['props', ...path] (src/canvas/edit.js): on an element with no tags yet
  const field = tagFields(m, pa)[1], set = (mm, id, value) => apply(mm, [{ op: 'set', id, path: ['props', ...field.path], value }]);
  delete pa.props.tags;
  const got = set(m, 'order.placedAt', 'true'); assert.deepEqual(by(got, 'order').members[0].props.tags, { column: { indexed: 'true' } });
  assert.deepEqual(stereoProblems(got), []);
  assert.deepEqual(by(set(got, 'order.placedAt', undefined), 'order').members[0].props.tags, { column: {} });
});

test('no example, target or fixture without a uml.Profile gets a problem from the check, and none is touched by it', () => {
  const urls = [...readdirSync(new URL('../examples/', here)).filter(f => f.endsWith('.json')).map(f => new URL(`../examples/${f}`, here)), ...targets().map(([, u]) => u),
    ...readdirSync(here).filter(f => /^[a-z]+-(minimal|stress)\.json$/.test(f)).map(f => new URL(f, here))];
  assert.ok(urls.length > 50, `${urls.length} files`);
  let some = 0;
  for (const u of urls) { const m = read(u); if (m.schemaVersion !== 2) continue; const before = JSON.stringify(m);
    if ((m.nodes || []).some(n => n && n.type === 'uml.Profile')) continue;
    some++; assert.deepEqual(stereoProblems(m), [], String(u)); assert.equal(JSON.stringify(m), before, String(u));
    (m.nodes || []).forEach(n => assert.deepEqual(tagFields(m, n), [], `${u} ${n.id}`)); }
  assert.ok(some > 40, `${some} models`);
});

// once 6.6 moves and revises it (check.mjs's MOVED), the revised one gets none
test('the current 07-profile.json gets only the problems its present form earns: its flat tags (decision 21 keys them by stereotype) and the required tags it leaves unset', () => {
  const [[, url]] = targets().filter(([f]) => f === '07-profile.json'), m = read(url);
  if (Object.hasOwn(MOVED, '07-profile.json')) return assert.deepEqual(stereoProblems(m), []);
  const at = id => { const i = m.nodes.findIndex(n => n.label === id); return `nodes[${i}]`; }, o = at('Order');
  assert.deepEqual(stereoProblems(m).map(p => [p.rule, p.path, p.message]), [
    ...['table', 'boundedContext', 'team'].map(k => ['tag-defined', `${o}.props.tags`, `tag-defined: "Order" keeps tags under "${k}", which is no stereotype it has`]),
    ['tag-required', `${o}.props.tags`, 'tag-required: «aggregateRoot» table on "Order" has no value and no default'], // inherited from «entity»
    ['tag-required', `${o}.props.tags`, 'tag-required: «aggregateRoot» boundedContext on "Order" has no value and no default'],
    ['tag-required', `${o}.props.tags`, 'tag-required: «owned» team on "Order" has no value and no default'],
    ...['name', 'indexed'].map(k => ['tag-defined', `${o}.members[0].props.tags`, `tag-defined: "placedAt" keeps tags under "${k}", which is no stereotype it has`]),
  ]);
  const id = m.nodes.find(n => n.label === 'Order').id;
  assert.deepEqual(appliedOf(m, id).map(e => [e.stereotype.label, e.profile.label, e.required]), [['aggregateRoot', 'BookshopConventions', false], ['owned', 'BookshopConventions', true]]);
});

test('the check reads the model and leaves it as it was; appliedOf answers from one reading of a model', () => {
  const m = base(), before = JSON.stringify(m);
  BREAKS['tag-value'](m); const once = JSON.stringify(m); stereoProblems(m); appliedOf(m, 'order'); tagFields(m, by(m, 'order'));
  assert.equal(JSON.stringify(m), once); assert.notEqual(once, before);
  assert.equal(appliedOf(m, 'order'), appliedOf(m, 'order'));
  assert.deepEqual(stereoProblems(null), []); assert.deepEqual(stereoProblems({ schemaVersion: 2, nodes: 'x', edges: {}, views: [null] }), []);
});

test('edge cases: the applying package and a profile\'s own definitions, two profiles in scope with one required name, redefinitions said once, values that are no text, keywords of Annex C', () => {
  const msgs = m => stereoProblems(m).map(p => p.message);
  // the package that applies a profile is in its scope; Annex C's flow, substitute, bind and two-word keywords are free
  let m = base(); m.nodes.push(N('mc-package', 'MetaclassReference', 'Package', 'conv'), N('bc', 'Stereotype', 'boundedContext', 'conv'));
  m.edges.push(E('bc-package', 'Extension', 'bc', 'mc-package'));
  by(m, 'sales').props = { stereotypes: ['boundedContext'] }; by(m, 'billing').props.stereotypes.push('flow', 'substitute', 'bind', 'element import');
  assert.deepEqual(msgs(m), []);
  // a profile inside the package applying it: its required stereotype does not reach the profile's own definitions
  m = base(); by(m, 'conv').parent = 'sales'; m.nodes.push(N('owned', 'Stereotype', 'owned', 'conv', { members: [P('owned.team', 'team', 'String', { default: 'core' })] }));
  m.edges.push(E('owned-class', 'Extension', 'owned', 'mc-class', { props: { isRequired: true } }));
  assert.deepEqual(msgs(m), []); assert.deepEqual(appliedOf(m, 'entity'), []); assert.deepEqual(appliedOf(m, 'order').map(e => e.key), ['entity', 'owned']);
  // two profiles in scope, each with a required «owned»: keyed Profile::owned, each checked against its own tags
  m = base(); m.nodes.push(N('q', 'Profile', 'Q'), N('q-class', 'MetaclassReference', 'Class', 'q'), N('owned', 'Stereotype', 'owned', 'conv', { members: [P('owned.team', 'team', 'String', { default: 'core' })] }),
    N('q-owned', 'Stereotype', 'owned', 'q', { members: [P('q-owned.team', 'team', 'Integer', { default: '0' })] }));
  m.edges.push(E('owned-class', 'Extension', 'owned', 'mc-class', { props: { isRequired: true } }), E('q-owned-class', 'Extension', 'q-owned', 'q-class', { props: { isRequired: true } }), E('sales-q', 'ProfileApplication', 'sales', 'q'));
  by(m, 'order').props.tags['Q::owned'] = { team: 'x' };
  assert.deepEqual(msgs(m), ['tag-value: «Q::owned» team = "x" on "Order" is not a whole number']);
  assert.deepEqual(tagFields(m, by(m, 'order')).map(f => f.key), ['p:entity:table', 'p:Conv::owned:team', 'p:Q::owned:team']);
  // two profiles of one label: Profile::name is the applied one's
  m = base(); m.nodes.push(N('conv2', 'Profile', 'Conv'), N('extra', 'Stereotype', 'extra', 'conv2'), N('c2-class', 'MetaclassReference', 'Class', 'conv2'));
  m.edges.push(E('extra-class', 'Extension', 'extra', 'c2-class'), E('sales-conv2', 'ProfileApplication', 'sales', 'conv2')); by(m, 'order').props.stereotypes.push('Conv::extra');
  assert.deepEqual(msgs(m), []);
  // a chain a -> b -> c -> d, b redefining t: said once; c of two unrelated generals with t of two types: said on c
  m = base(); m.nodes.push(N('sa', 'Stereotype', 'sa', 'conv', { members: [P('sa.t', 't', 'String')] }), N('sb', 'Stereotype', 'sb', 'conv', { members: [P('sb.t', 't', 'Integer')] }),
    N('sc', 'Stereotype', 'sc', 'conv'), N('sd', 'Stereotype', 'sd', 'conv'), N('sx', 'Stereotype', 'sx', 'conv', { members: [P('sx.t', 't', 'Boolean')] }), N('sy', 'Stereotype', 'sy', 'conv'));
  m.edges.push(E('g1', 'Generalization', 'sb', 'sa'), E('g2', 'Generalization', 'sc', 'sb'), E('g3', 'Generalization', 'sd', 'sc'), E('g4', 'Generalization', 'sy', 'sa'), E('g5', 'Generalization', 'sy', 'sx'));
  assert.deepEqual(msgs(m), ['tag-defined: «sb» redefines tag "t" of «sa» as Integer, not String', 'tag-defined: «sy» inherits tag "t" from «sa» as String and from «sx» as Boolean: redefine it']);
  // a tag named after an Object.prototype member reads only what is stored; a list or a map is no value
  m = base(); by(m, 'entity').members.push(P('entity.ts', 'toString', 'String'));
  assert.deepEqual(msgs(m), ['tag-required: «entity» toString on "Order" has no value and no default']);
  assert.equal(appliedOf(m, 'order')[0].tags.find(t => t.name === 'toString').value, undefined);
  m = base(); by(m, 'billing').props.tags.tracked.size = [1]; by(m, 'order').props.tags.entity.table = { x: 1 };
  assert.deepEqual(msgs(m), ['tag-value: «entity» table = {"x":1} on "Order" is not text', 'tag-value: «tracked» size = [1] on "Billing" is not a whole number']);
  // a stereotype applied twice: its tags under the second name are pointed to the first
  m = base(); by(m, 'order').props.stereotypes.push('Conv::entity'); by(m, 'order').props.tags['Conv::entity'] = { table: 'x' };
  assert.deepEqual(msgs(m), ['tag-defined: "Order" keeps tags under "Conv::entity", which is no stereotype it has: it names «entity» again, whose tags are under "entity"']);
});

// 6.1's slots in the core: these run once validate() calls TYPED.across and the panel TYPED.fields (notes/stage-6.md §2.3)
const wired = readFileSync(new URL('../src/map/validate.js', here), 'utf8').includes('TYPED.across');
test('end to end, once 6.1 merges: validate() says each problem of the check once, on a model with no profile view; a model with no profile validates as before', { skip: !wired && 'waits for 6.1 (TYPED.across in validate())' }, () => {
  const m = base(); BREAKS['stereotype-unknown'](m);
  const got = validate(m).filter(p => Object.hasOwn(STY_RULES, p.rule));
  assert.deepEqual(got.map(p => p.rule), ['stereotype-unknown']);
  const plain = base(); plain.nodes = plain.nodes.filter(n => n.parent !== 'conv' && n.id !== 'conv'); plain.edges = plain.edges.filter(e => e.type !== 'uml.Extension' && e.type !== 'uml.ProfileApplication');
  assert.ok(!validate(plain).some(p => Object.hasOwn(STY_RULES, p.rule)));
});

/* §12: 2,000 elements under 3 applied profiles. Chains of seven packages, the first applying one of three profiles, each
   holding classes that apply a stereotype with a tag, a member with one, and a line between two of them */
function big(n) {
  const nodes = [], edges = [];
  for (let k = 0; k < 3; k++) { nodes.push(N(`p${k}`, 'Profile', `P${k}`), N(`p${k}.mc`, 'MetaclassReference', 'Classifier', `p${k}`), N(`p${k}.mp`, 'MetaclassReference', 'Property', `p${k}`));
    // s0 required on Classifier, met by s8 through eight generals; each sN redefines t
    for (let s = 0; s < 10; s++) { nodes.push(N(`p${k}.s${s}`, 'Stereotype', `s${s}`, `p${k}`, { members: [P(`p${k}.s${s}.t`, 't', 'Integer', { default: '0' })] })); edges.push(E(`p${k}.e${s}`, 'Extension', `p${k}.s${s}`, s % 2 ? `p${k}.mp` : `p${k}.mc`, s ? {} : { props: { isRequired: true } })); }
    for (let s = 1; s < 10; s++) edges.push(E(`p${k}.g${s}`, 'Generalization', `p${k}.s${s}`, `p${k}.s${s - 1}`)); }
  for (let i = 0; nodes.length < n; i++) { const pk = `k${i}`; nodes.push(N(pk, 'Package', pk, i % 7 ? `k${i - 1}` : null)); if (i % 7 === 0) edges.push(E(`a${i}`, 'ProfileApplication', pk, `p${(i / 7) % 3}`)); // seven deep under each applying one
    for (let j = 0; j < 6; j++) { const id = `c${i}_${j}`; nodes.push(N(id, 'Class', 'C' + j, pk, { props: { stereotypes: ['s8', 'utility'], tags: { s8: { t: String(j) } } },
      members: [N(id + '.a', 'Property', 'a', null, { props: { stereotypes: ['s9'], tags: { s9: { t: '1' } } } })] }));
      if (j) edges.push(E(`d${i}_${j}`, 'Dependency', id, `c${i}_${j - 1}`, { props: { stereotypes: ['use'] } })); } }
  return { schemaVersion: 2, nodes, edges, views: [] };
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('P1 (§12): TYPED.across on 2,000 elements under 3 applied profiles held to 1 s in CI, its time against the 10 ms target printed; 4x the model in under 10x the time (CPU, best of five after a warm-up) (timed)', () => {
  const [small, large] = [big(2000), big(8000)];
  assert.deepEqual(stereoProblems(small), []);
  const best = m => { stereoProblems(m); return Math.min(...Array.from({ length: 5 }, () => cpu(() => stereoProblems(m)))); };
  const [a, b] = [best(small), best(large)];
  assert.ok(a < 1000, `${a} ms`);
  assert.ok(b < 10 * Math.max(2, a), `4x the elements: ${a.toFixed(1)} ms, then ${b.toFixed(1)} ms`);
  console.log(`# P1 stereotypes: TYPED.across on ${small.nodes.length} nodes and ${small.edges.length} lines ${a.toFixed(1)} ms (target 10 ms); 4x ${b.toFixed(1)} ms`);
});

test('the check ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', here), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', here), 'utf8');
  for (const k of ['function styResolve(', 'TYPED.across = stereoProblems', 'TYPED.fields = tagFields']) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});

test('a stereotype specializing one a plain package owns: its tags checked as text, no throw from validate() or the fields (audit 1)', () => {
  const m = base();
  m.nodes.push(N('lib', 'Package', 'lib'), N('gen', 'Stereotype', 'gen', 'lib', { members: [P('gen.k', 'k', 'Kind', { multiplicity: '0..1' })] }));
  m.edges.push(E('entity-gen', 'Generalization', 'entity', 'gen'));
  by(m, 'order').props.tags.entity.k = 'x';
  assert.deepEqual(validate(m), []);
  assert.equal(tagFields(m, by(m, 'order')).find(f => f.label === '«entity» k').kind, 'text');
});

test('packages nested 20,000 deep, listed deepest first: the scope and profile walks need no recursion (audit 1)', () => {
  const n = 20000, nodes = [N('prof', 'Profile', 'P'), ...Array.from({ length: n }, (_, i) => N('p' + i, 'Package', 'p' + i, i ? 'p' + (i - 1) : null)),
    N('c', 'Class', 'C', 'p' + (n - 1), { props: { stereotypes: ['x'] } })].reverse();
  assert.deepEqual(stereoProblems({ schemaVersion: 2, nodes, edges: [] }), []);
});
