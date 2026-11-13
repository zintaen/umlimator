// The Structurizr JSON reader (notes/milestone-2.md §8.3, M2.10): tests/import/structurizr.json's two workspaces, the
// clinic written in the export's form from examples/clinic.dsl and one holding every view kind, read into typed C4 that docs/diagrams/
// examples/check.mjs passes, with their reports pinned (risks.md R1, R4); ids from the DSL's identifiers and names, the
// same across two reads and across a regenerated workspace's new numeric ids (R3); §8's limits on hostile input, each by
// a test: a deep nest, a count over the limit, a __proto__ name, text over 1 MiB, never a throw (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readStructurizr as read } from '../src/readers/structurizr.js';
import { check } from '../docs/diagrams/examples/check.mjs';

const both = JSON.parse(readFileSync(new URL('import/structurizr.json', import.meta.url), 'utf8'));
const lines = r => r.report.map(x => [x.path, x.status, x.message]);
const nodeLines = m => m.nodes.map(n => [n.id, n.type, n.parent ?? null, n.props?.shape ?? null]);

test('the clinic, written in the export\'s form from examples/clinic.dsl, reads into typed C4 that check.mjs passes; its report pinned', () => {
  const { model, report } = read(both.clinic);
  assert.deepEqual(check(model, 'c4'), []);
  assert.deepEqual(lines({ report }), [
    ['model.people[1].group', 'skipped', 'group Clinic staff: groups are not read'],
    ['model', 'skipped', '9 implied relationships are not read: the C4 type works them out when it draws'],
    ['views.configuration.themes', 'skipped', "themes are not read: shapes come from the workspace's own styles"],
    ['views.systemContextViews[0].elements', 'skipped', 'view context: element positions are not read; the view is laid out'],
    ['views.containerViews[0].elements', 'skipped', 'view containers: element positions are not read; the view is laid out'],
    ['views.componentViews[0].elements', 'skipped', 'view api: element positions are not read; the view is laid out']]);
  assert.equal(model.title, 'Clinic bookings');
  assert.equal(model.root, 'context');
  // the DSL's hierarchical identifiers are the ids; the deployment node's made-up UUID is not, its name is
  assert.deepEqual(nodeLines(model), [
    ['patient', 'c4.Person', null, null], ['reception', 'c4.Person', null, null], ['bookings', 'c4.SoftwareSystem', null, null],
    ['bookings.web', 'c4.Container', 'bookings', null], ['bookings.desk', 'c4.Container', 'bookings', null], ['bookings.api', 'c4.Container', 'bookings', null],
    ['bookings.api.slots', 'c4.Component', 'bookings.api', null], ['bookings.api.book', 'c4.Component', 'bookings.api', null],
    ['bookings.api.remind', 'c4.Component', 'bookings.api', null], ['bookings.api.store', 'c4.Component', 'bookings.api', null],
    ['bookings.db', 'c4.Container', 'bookings', 'cylinder'], ['bookings.jobs', 'c4.Container', 'bookings', null], ['bookings.sender', 'c4.Container', 'bookings', null],
    ['sms', 'c4.SoftwareSystem', null, null], ['records', 'c4.SoftwareSystem', null, null],
    ['cloud', 'c4.DeploymentNode', null, null], ['bookings.api-1', 'c4.ContainerInstance', 'cloud', null]]);
  const at = id => model.nodes.find(n => n.id === id);
  assert.deepEqual(at('bookings.api.store').props, { description: 'Reads and writes bookings.', technology: 'Go, pgx' });
  assert.deepEqual(at('sms').props, { description: 'Delivers text messages.', external: true });
  assert.deepEqual(at('bookings.api-1'), { id: 'bookings.api-1', type: 'c4.ContainerInstance', label: 'Booking API', parent: 'cloud', props: { container: 'bookings.api' } });
  // the 14 relationships the DSL writes, none of the 9 it implies
  assert.equal(model.edges.length, 14);
  assert.deepEqual(model.edges.find(e => e.id === 'bookings.api.book-records'),
    { id: 'bookings.api.book-records', type: 'c4.Relationship', from: 'bookings.api.book', to: 'records', label: 'Checks the patient', props: { technology: 'FHIR' } });
  assert.deepEqual(model.edges.find(e => e.id === 'sms-patient'), { id: 'sms-patient', type: 'c4.Relationship', from: 'sms', to: 'patient', label: 'Texts a reminder' });
  // a container or component view lists its subject, which Structurizr draws as its boundary
  assert.deepEqual(model.views.map(v => [v.id, v.diagram, v.title, v.subject, v.direction, v.nodeIds.length, v.nodeIds[0]]), [
    ['context', 'c4.context', 'Clinic bookings: system context', 'bookings', 'right', 5, 'patient'],
    ['containers', 'c4.container', 'Clinic bookings: containers', 'bookings', 'right', 11, 'bookings'],
    ['api', 'c4.component', 'Booking API: components', 'bookings.api', 'right', 10, 'bookings.api']]);
});

test('a workspace with every view kind and every shape reads into typed C4 that check.mjs passes; its report pinned', () => {
  const { model, report } = read(both.every);
  assert.deepEqual(check(model, 'c4'), []);
  assert.deepEqual(lines({ report }), [
    ['model.softwareSystems[0].documentation', 'skipped', 'Shop: documentation and decisions are not read'],
    ['model.softwareSystems[0].containers[2].group', 'skipped', 'group Staff tools: groups are not read'],
    ['model.softwareSystems[0].containers[5].properties', 'skipped', 'Database: properties owner are not read'],
    ['model.softwareSystems[0].containers[5].perspectives', 'skipped', 'Database: perspectives are not read'],
    ['model.deploymentNodes[0].children[0].instances', 'approximated', 'deployment node Server stands for 3 instances: it is drawn once'],
    ['model.deploymentNodes[0].children[0].infrastructureNodes[0]', 'skipped', 'an infrastructure node Load balancer is not read, nor its relationships'],
    ['model.deploymentNodes[1].softwareSystemInstances[0]', 'skipped', 'a software system instance is not read, nor its relationships'],
    ['model', 'skipped', '4 implied relationships are not read: the C4 type works them out when it draws'],
    ['views.configuration.styles.elements', 'skipped', 'element styles: only shape is read, not background, color'],
    ['model.softwareSystems[0].containers[6].components[1]', 'approximated', 'Order store: shape Ellipse is drawn as a box'],
    ['model.softwareSystems[0].containers[6].components[2]', 'approximated', 'Search: shape Component is drawn as a box'],
    ['model.softwareSystems[2]', 'approximated', 'Warehouse: shape Circle is drawn as a box'],
    ['views.systemLandscapeViews[0].animations', 'skipped', 'view landscape: animations are not read'],
    ['views.componentViews[0].automaticLayout', 'approximated', 'view components: BottomTop is drawn top to bottom'],
    ['views.dynamicViews[0].relationships[2]', 'approximated', 'view placing-an-order: step 2 is an implied relationship: the relationship it is implied by, shop.web-shop.api.orders, is the step'],
    ['views.dynamicViews[0].relationships[3]', 'approximated', 'view placing-an-order: step 3 is an implied relationship: the relationship it is implied by, shop.api.store-shop.db, is the step'],
    ['views.dynamicViews[0].relationships[3]', 'approximated', 'view placing-an-order: step shop.api.store-shop.db says "Saves the order in": the relationship\'s own description is drawn'],
    ['views.dynamicViews[0].relationships[4]', 'approximated', 'view placing-an-order: step 4 is an implied relationship: the relationship it is implied by, shop.api.orders-payments, is the step'],
    ['views.dynamicViews[0].relationships[5]', 'approximated', 'view placing-an-order: step 5 is an implied relationship: the relationship it is implied by, shop.web-shop.api.orders, is the step'],
    ['views.dynamicViews[0].relationships[5]', 'approximated', 'view placing-an-order: shop.web-shop.api.orders is a step twice: the first is kept (each relationship is one step)'],
    ['views.dynamicViews[0].relationships[6]', 'approximated', 'view placing-an-order: shop.web-shop.api.orders is a step twice: the first is kept (each relationship is one step)'],
    ['views.dynamicViews[0].relationships[7]', 'skipped', 'view placing-an-order: a step whose relationship is not read'],
    ['views.deploymentViews[0].elements', 'skipped', 'view live: 2 elements not read are not shown'],
    ['views.filteredViews[0]', 'skipped', 'a filtered view internal-only is not read'],
    ['views.customViews[0]', 'skipped', 'a custom view sketch is not read'],
    ['views.imageViews[0]', 'skipped', 'an image view photo is not read'],
    ['documentation', 'skipped', 'documentation and decisions are not read']]);
  // every shape of the map that Structurizr names; a later tag's style wins over an earlier one (Warehouse: Circle)
  assert.deepEqual(nodeLines(model), [
    ['customer', 'c4.Person', null, null], ['robot', 'c4.Person', null, 'robot'], ['shop', 'c4.SoftwareSystem', null, null],
    ['shop.web', 'c4.Container', 'shop', 'browser'], ['shop.mobile', 'c4.Container', 'shop', 'mobile'], ['shop.office', 'c4.Container', 'shop', 'window'],
    ['shop.shell', 'c4.Container', 'shop', 'terminal'], ['shop.media', 'c4.Container', 'shop', 'folder'], ['shop.db', 'c4.Container', 'shop', 'cylinder'],
    ['shop.api', 'c4.Container', 'shop', 'hexagon'], ['shop.api.orders', 'c4.Component', 'shop.api', null], ['shop.api.store', 'c4.Component', 'shop.api', null],
    ['shop.api.search', 'c4.Component', 'shop.api', null], ['shop.bus', 'c4.Container', 'shop', 'pipe'],
    ['payments', 'c4.SoftwareSystem', null, null], ['warehouse', 'c4.SoftwareSystem', null, null],
    ['live.dc', 'c4.DeploymentNode', null, null], ['live.dc.server', 'c4.DeploymentNode', 'live.dc', null],
    ['shop.api-1', 'c4.ContainerInstance', 'live.dc.server', null], ['shop.api-2', 'c4.ContainerInstance', 'live.dc.server', null],
    ['live.dc.dbs', 'c4.DeploymentNode', 'live.dc', null], ['shop.db-1', 'c4.ContainerInstance', 'live.dc.dbs', null],
    ['payments-cloud', 'c4.DeploymentNode', null, null]]);
  const at = id => model.nodes.find(n => n.id === id);
  assert.equal(at('customer').props.external, true); // location: External
  assert.equal(at('payments').props.external, true); // the tag External
  assert.equal(at('warehouse').props.external, undefined); // location: Internal
  // a relationship's DSL identifier is its id; an instance's relationship, replicated from its container's, is read
  assert.deepEqual(model.edges.map(e => e.id), ['shops', 'robot-shop.db', 'shop.web-shop.api.orders', 'shop.api-shop.bus', 'shop.api.orders-shop.api.store',
    'shop.api.orders-payments', 'shop.api.store-shop.db', 'shop.api-1-shop.db-1']);
  assert.deepEqual(model.views.map(v => [v.id, v.diagram, v.title, v.subject ?? null, v.direction ?? null]), [
    ['landscape', 'c4.landscape', 'Shop: everything at once', null, null],
    ['context', 'c4.context', 'Shop: system context', 'shop', null],
    ['containers', 'c4.container', 'Shop: containers', 'shop', 'down'],
    ['components', 'c4.component', 'API: components', 'shop.api', 'down'],
    ['placing-an-order', 'c4.dynamic', 'Shop: dynamic', 'shop', null],
    ['live', 'c4.deployment', 'Shop: deployment, Live', 'shop', null]]);
  const view = id => model.views.find(v => v.id === id);
  assert.deepEqual(view('components').nodeIds, ['shop.api', 'shop.web', 'shop.db', 'shop.api.orders', 'shop.api.store', 'shop.api.search', 'payments']);
  assert.deepEqual(view('context').nodeIds, ['customer', 'robot', 'shop', 'payments']); // a context view draws no boundary
  // steps by `order`, 10 after 4; each relationship once; an implied step as the relationship it is implied by
  assert.deepEqual(view('placing-an-order').edges, ['shops', 'shop.web-shop.api.orders', 'shop.api.store-shop.db', 'shop.api.orders-payments', 'shop.api-shop.bus']);
  assert.deepEqual(view('placing-an-order').nodeIds[0], 'shop'); // a dynamic view draws its scope's boundary too
  assert.deepEqual(view('live').nodeIds, ['live.dc', 'live.dc.server', 'shop.api-1', 'shop.api-2', 'live.dc.dbs', 'shop.db-1', 'payments-cloud']);
});

// Structurizr's numeric ids, as a regenerated workspace may number them: every id field moved by k
function renumber(x, k) {
  if (Array.isArray(x)) return x.map(y => renumber(y, k));
  if (!x || typeof x !== 'object') return x;
  return Object.fromEntries(Object.entries(x).map(([key, v]) => [key,
    /^(id|sourceId|destinationId|containerId|softwareSystemId|elementId|linkedRelationshipId)$/.test(key) && /^\d+$/.test(v) ? String(Number(v) + k) : renumber(v, k)]));
}

test('ids are stable: two reads give one model, and so does the workspace with new numeric ids (R3)', () => {
  for (const w of [both.clinic, both.every]) {
    const a = read(w), b = read(structuredClone(w)), c = read(renumber(w, 1000));
    assert.deepEqual(b, a);
    assert.deepEqual(c.model, a.model);
    assert.notDeepEqual(renumber(w, 1000), w);
  }
  // with no identifier, a name: slugged, the next free when taken, an instance after its container
  const { model } = read({ name: 'W', model: { people: [{ id: '1', name: 'Shop Staff' }, { id: '2', name: 'shop staff' }, { id: '3', name: '★' }, { id: '4', name: 'Ünïcode Name' }],
    softwareSystems: [{ id: '5', name: 'X', containers: [{ id: '6', name: 'Web -> App' }] }],
    deploymentNodes: [{ id: '7', name: 'Box', containerInstances: [{ id: '8', containerId: '6', instanceId: 2 }, { id: '9', containerId: '6' }] }] } });
  assert.deepEqual(model.nodes.map(n => n.id), ['shop-staff', 'shop-staff-2', 'person', 'ünïcode-name', 'x', 'web-app', 'box', 'web-app-2', 'web-app-1']);
  assert.ok(model.nodes.every(n => !n.id.includes('->')));
  assert.deepEqual(check(model, 'c4'), []);
});

test('a name or key that is __proto__ or constructor is an ordinary name, and nothing is polluted', () => {
  const text = JSON.stringify({ name: '__proto__', model: {
    people: [{ id: '__proto__', name: '__proto__', tags: 'Element,Person,__proto__', properties: { 'structurizr.dsl.identifier': '__proto__', ['__proto__']: 'x' },
      relationships: [{ id: 'constructor', sourceId: '__proto__', destinationId: 'toString', description: 'hasOwnProperty' }] },
    { id: 'toString', name: 'constructor', properties: { 'structurizr.dsl.identifier': 'constructor' } }, { id: 'valueOf', name: 'toString' }] },
  views: { systemLandscapeViews: [{ key: 'constructor', elements: [{ id: '__proto__' }, { id: 'toString' }, { id: 'hasOwnProperty' }] }],
    dynamicViews: [{ key: '__proto__', relationships: [{ id: 'constructor', order: '1' }, { id: 'valueOf' }] }],
    configuration: { styles: { elements: [{ tag: '__proto__', shape: 'Robot' }, { tag: 'constructor', shape: 'constructor' }] } } } })
    .replace('"__proto__":"x"', '"__proto__":{"polluted":true}');
  const { model, report } = read(text);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(model.nodes.map(n => [n.id, n.label, n.props?.shape ?? null]), [['__proto__', '__proto__', 'robot'], ['constructor', 'constructor', null], ['tostring', 'toString', null]]);
  assert.deepEqual(model.edges, [{ id: '__proto__-constructor', type: 'c4.Relationship', from: '__proto__', to: 'constructor', label: 'hasOwnProperty' }]);
  assert.deepEqual(model.views.map(v => [v.id, v.nodeIds, v.edges ?? null]), [['constructor', ['__proto__', 'constructor'], null], ['__proto__', [], ['__proto__-constructor']]]);
  assert.deepEqual(lines({ report }), [
    ['model.people[0].properties', 'skipped', '__proto__: properties __proto__ are not read'],
    ['views.systemLandscapeViews[0].elements', 'skipped', 'view constructor: 1 element not read is not shown'],
    ['views.dynamicViews[0].relationships[1]', 'skipped', 'view __proto__: a step whose relationship is not read']]);
  assert.deepEqual(check(model, 'c4'), []);
});

// deployment nodes nested `depth` deep, each holding one instance of container 2
const nest = depth => {
  const top = { id: 'n1', name: 'Node 1', containerInstances: [{ id: 'i1', containerId: '2', instanceId: 1 }] };
  let at = top;
  for (let k = 2; k <= depth; k++) { const c = { id: `n${k}`, name: `Node ${k}`, containerInstances: [{ id: `i${k}`, containerId: '2', instanceId: k }] }; at.children = [c]; at = c; }
  return { model: { softwareSystems: [{ id: '1', name: 'S', containers: [{ id: '2', name: 'C' }] }], deploymentNodes: [top] } };
};

test('deployment nodes are read 64 deep, deeper nodes read flat from there, and reported once (R2)', () => {
  const { model, report } = read(nest(70)), parent = id => model.nodes.find(n => n.id === id).parent;
  assert.deepEqual(['node-2', 'node-63', 'node-64', 'node-65', 'node-70'].map(parent), ['node-1', 'node-62', 'node-63', 'node-63', 'node-63']);
  assert.deepEqual(['c-1', 'c-63', 'c-64', 'c-65'].map(parent), ['node-1', 'node-63', 'node-64', 'node-65']); // an instance stays in its node
  assert.deepEqual(lines({ report }), [['model.deploymentNodes[0]' + '.children[0]'.repeat(63), 'approximated', 'deployment node Node 64 is nested 64 deep: the nodes it holds are read flat from there'], ['views', 'approximated', 'the workspace has no view that is read: a landscape view shows its people and software systems']]);
  let depth = 0;
  for (let id = 'node-70'; id; id = parent(id)) depth++;
  assert.equal(depth, 64);
  assert.deepEqual(check(model, 'c4'), []);
});

test('at most 10,000 elements and 10,000 relationships are read, the rest reported once (R2)', () => {
  const people = Array.from({ length: 10050 }, (_, k) => ({ id: `p${k}`, name: `P${k}`, relationships: k ? [] : Array.from({ length: 10050 }, (_, j) => ({ id: `r${j}`, sourceId: 'p0', destinationId: `p${j % 9000}` })) }));
  const { model, report } = read({ model: { people, deploymentNodes: [{ id: 'd', name: 'D' }] } });
  assert.equal(model.nodes.length, 10000);
  assert.equal(model.edges.length, 10000);
  assert.deepEqual(lines({ report }), [
    ['model.people[10000]', 'skipped', 'over 10000 elements: this and the rest are not read'],
    ['model.people[0].relationships[10000]', 'skipped', 'over 10000 relationships: this and the rest are not read'], ['views', 'approximated', 'the workspace has no view that is read: a landscape view shows its people and software systems']]);
  assert.deepEqual(check(model, 'c4'), []);
});

test('text over 1 MiB is refused; malformed input and fields of the wrong kind are reported, never thrown (R2)', () => {
  const big = read(JSON.stringify({ model: { people: [{ id: '1', name: 'x'.repeat(1 << 20) }] } }));
  assert.deepEqual([big.model.nodes, lines(big)], [[], [['', 'skipped', `the input is ${(1 << 20) + 43} characters, over the limit of 1048576: nothing read`]]]);
  assert.deepEqual(lines(read('{ "model": ')), [['', 'skipped', 'the input is not JSON (Unexpected end of JSON input): nothing read']]);
  for (const x of [undefined, null, 42, 'null', [], {}, { model: [] }, { model: 'x' }, { model: null }])
    assert.deepEqual(lines(read(x)), [['', 'skipped', 'not a Structurizr workspace (no model): nothing read']], String(x));
  const odd = read({ name: 7, model: { people: { id: '1' }, softwareSystems: [null, 3, [], { id: '1', name: 5 }, { id: '2', name: 'S', tags: 9, description: [], containers: 'x' }],
    deploymentNodes: [{ id: '3', name: 'D', children: [7], containerInstances: [{ containerId: '2' }, null] }] }, views: { systemContextViews: [{ key: 'c', softwareSystemId: '3' }, 5], containerViews: {} } });
  assert.deepEqual(lines(odd), [
    ['name', 'skipped', 'name is not text: not read'],
    ['model.people', 'skipped', 'people is not a list: not read'],
    ['model.softwareSystems[0]', 'skipped', 'not an element: not read'],
    ['model.softwareSystems[1]', 'skipped', 'not an element: not read'],
    ['model.softwareSystems[2]', 'skipped', 'not an element: not read'],
    ['model.softwareSystems[3].name', 'skipped', 'name is not text: not read'],
    ['model.softwareSystems[3]', 'skipped', 'an element with no name: it and what it holds are not read'],
    ['model.softwareSystems[4].tags', 'skipped', 'tags is not text: not read'],
    ['model.softwareSystems[4].description', 'skipped', 'description is not text: not read'],
    ['model.softwareSystems[4].containers', 'skipped', 'containers is not a list: not read'],
    ['model.deploymentNodes[0].containerInstances[0]', 'skipped', 'a container instance whose container is not read: not read'],
    ['model.deploymentNodes[0].containerInstances[1]', 'skipped', 'a container instance whose container is not read: not read'],
    ['model.deploymentNodes[0].children[0]', 'skipped', 'not an element: not read'],
    ['views.systemContextViews[0].softwareSystemId', 'skipped', 'view c: D is not what a system context view is scoped to'],
    ['views.systemContextViews[1]', 'skipped', 'not a view: not read'],
    ['views.containerViews', 'skipped', 'containerViews is not a list: not read']]);
  assert.deepEqual(check(odd.model, 'c4'), []);
  // a workspace with no view gets a landscape view of its people and software systems
  const bare = read({ name: 'Bare', model: { people: [{ id: '1', name: 'P' }], softwareSystems: [{ id: '2', name: 'S', containers: [{ id: '3', name: 'C' }] }] } });
  assert.deepEqual(bare.model.views, [{ id: 'landscape', diagram: 'c4.landscape', title: 'Bare: system landscape', nodeIds: ['p', 's'] }]);
  assert.deepEqual(lines(bare), [['views', 'approximated', 'the workspace has no view that is read: a landscape view shows its people and software systems']]);
});

test('what a host builds in code never throws, and what the model has no place for is reported (R1, R2)', () => {
  const odd = Object.create(null);
  for (const bad of [odd, Symbol('s')]) {
    const out = read({ model: { softwareSystems: [{ id: '1', name: 'S', containers: [{ id: '2', name: 'C' }] }],
      deploymentNodes: [{ id: '3', name: 'D', instances: bad, containerInstances: [{ id: '4', containerId: '2' }] }] },
    views: { dynamicViews: [{ key: 'd', relationships: [{ id: '9', order: bad }] }], systemLandscapeViews: [{ key: 'l', automaticLayout: { rankDirection: bad } }] } });
    assert.equal(out.model.nodes.length, 4);
    assert.deepEqual(check(out.model, 'c4'), []);
  }
  const thrown = read({ model: { get people() { throw new Error('no'); } } });
  assert.deepEqual([thrown.model.nodes, lines(thrown)], [[], [['', 'skipped', 'the input threw when it was read: nothing read']]]);
  assert.deepEqual(check(thrown.model, 'c4'), []);
  const { model, report } = read({ model: {
    people: [{ id: '1', name: 'P', url: 'https://p', relationships: [{ id: '5', destinationId: '2', interactionStyle: 'Asynchronous' }] }],
    softwareSystems: [{ id: '2', name: 'S', containers: [{ id: '3', name: 'C' }] }], customElements: [{ id: '6', name: 'Custom' }],
    deploymentNodes: [{ id: '4', name: 'D', tags: 'Element,Deployment Node,Rack', containerInstances: [{ id: '7', containerId: '3', tags: 'Container Instance,External' }] }] },
  views: { systemLandscapeViews: [{ key: 'l', automaticLayout: { rankDirection: 'Diagonal' } }],
    configuration: { styles: { elements: [{ tag: 'Rack', shape: 'Box' }], relationships: [{ tag: 'Relationship', dashed: true }] } } } });
  assert.deepEqual(lines({ report }), [
    ['model.people[0].url', 'skipped', 'P: its url is not read'],
    ['model.deploymentNodes[0].containerInstances[0].tags', 'skipped', 'instance 1 of C: its own tags are not read (its container\'s are)'],
    ['model.customElements', 'skipped', 'a custom element is not read'],
    ['model.people[0].relationships[0].interactionStyle', 'approximated', 'relationship P → S is asynchronous: it is drawn as any other'],
    ['views.configuration.styles.relationships', 'skipped', 'relationship styles are not read'],
    ['model.deploymentNodes[0]', 'skipped', 'D: a deployment node\'s shape Box is not read'],
    ['views.systemLandscapeViews[0].automaticLayout.rankDirection', 'skipped', 'view l: rank direction Diagonal is not one Structurizr has: not read']]);
  assert.equal(model.views[0].direction, undefined);
});

// a seeded generator: the fixtures with one field after another replaced by something of the wrong kind
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ODD = [null, 7, '', 'x', [], {}, [null], { id: '1' }, '__proto__', true, -1, '1'];
function spoil(w, r) {
  const spots = [], walk = (x, depth) => { if (x && typeof x === 'object') for (const k of Object.keys(x)) { spots.push([x, k]); if (depth < 12) walk(x[k], depth + 1); } };
  walk(w, 0);
  for (let n = 0; n < 6; n++) { const [o, k] = spots[Math.floor(r() * spots.length)]; o[k] = structuredClone(ODD[Math.floor(r() * ODD.length)]); }
  return w;
}

test('300 spoilt workspaces each read, never throwing, into a model check.mjs passes', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed), w = spoil(structuredClone(seed % 2 ? both.clinic : both.every), r), out = read(w);
    assert.deepEqual(check(out.model, 'c4'), [], `seed ${seed}`);
    assert.ok(out.report.every(x => typeof x.path === 'string' && /^(skipped|approximated)$/.test(x.status) && typeof x.message === 'string'), `seed ${seed}`);
  }
});

test('hostile workspaces each read in under a second of CPU time (R2) (timed)', t => {
  const many = n => Array.from({ length: n }, (_, k) => ({ id: `${k}`, name: `N${k % 7}` }));
  const loop = { id: 'n', name: 'Loop' };
  loop.children = [loop, loop]; // an object a host built, not JSON: read until the count stops it
  // parsed JSON can share nothing, but a host's object can: one list reached from many places, counted each time
  const shared = { id: 's', name: 'Shared' };
  shared.children = Array(2000).fill(shared);
  const rels2k = Array.from({ length: 2000 }, (_, k) => ({ id: `r${k}`, sourceId: '0', destinationId: `${k}` }));
  const els10k = Array.from({ length: 10000 }, (_, k) => ({ id: `${k}` }));
  const hostile = [
    ['a node that holds itself', { model: { deploymentNodes: [loop] } }],
    ['a nest 100,000 deep', nest(100000)],
    ['200,000 people', { model: { people: many(200000) } }],
    ['one name for 10,000 elements', { model: { people: Array.from({ length: 10000 }, (_, k) => ({ id: `${k}`, name: 'Same' })) } }],
    ['200,000 relationships', { model: { people: [{ id: '0', name: 'A', relationships: Array.from({ length: 200000 }, (_, k) => ({ id: `r${k}`, sourceId: '0', destinationId: '0' })) }] } }],
    ['implied steps', { model: { people: [{ id: '0', name: 'A', relationships: [{ id: 'r', sourceId: '0', destinationId: '0' }, ...Array.from({ length: 50000 }, (_, k) => ({ id: `i${k}`, sourceId: '0', destinationId: '0', linkedRelationshipId: 'r' }))] }] },
      views: { dynamicViews: [{ key: 'd', relationships: Array.from({ length: 200000 }, (_, k) => ({ id: `i${k % 50000}`, order: `${k}` })) }] } }],
    ['10,000 views of 10,000 elements', { model: { people: many(10000) }, views: { systemLandscapeViews: Array.from({ length: 10000 }, () => ({ key: 'v', elements: [{ id: '1' }] })) } }],
    ['a view listing 300,000 elements', { model: { people: many(10000) }, views: { systemLandscapeViews: [{ key: 'v', elements: Array.from({ length: 300000 }, (_, k) => ({ id: `${k % 20000}`, x: 1 })) }] } }],
    ['one deployment node holding itself 2,000 times', { model: { deploymentNodes: [shared] } }],
    ['10,000 people sharing 2,000 relationships', { model: { people: Array.from({ length: 10000 }, (_, k) => ({ id: `${k}`, name: `P${k}`, relationships: rels2k })) } }],
    ['2,000 views sharing 10,000 elements', { model: { people: many(10000) }, views: { systemLandscapeViews: Array.from({ length: 2000 }, (_, k) => ({ key: `v${k}`, elements: els10k })) } }],
    ['10,000 people sharing a name of a million characters', { model: { people: Array.from({ length: 10000 }, (_, k) => ({ id: `${k}`, name: 'N'.repeat(1 << 20), tags: 'T,'.repeat(1 << 19) })) } }],
    ['50,000 styles', { model: { people: many(2000).map(p => ({ ...p, tags: 'A,B,C,D,E' })) }, views: { configuration: { styles: { elements: Array.from({ length: 50000 }, (_, k) => ({ tag: 'Q' + k, shape: 'Robot' })) } } } }],
  ];
  // in this process's CPU time, a slow run tried twice more and its best kept, as the Mermaid readers' timed tests do
  const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
  const best = f => { let [out, ms] = cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };
  for (const [what, w] of hostile) {
    const [out, ms] = best(() => read(w));
    t.diagnostic(`${what}: ${ms.toFixed(0)} ms (target and ceiling 1000 ms)`);
    assert.ok(ms < 1000, `${what}: ${ms} ms`);
    assert.ok(out.model.nodes.length <= 10000 && out.model.edges.length <= 10000, what);
  }
});
