// Stories (#69): validate() checks each step against its view, with no browser. Playing them: tests/stories.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../lib/umlimator.js';
// bike-share holds typed views since step 3 of the one-model plan: the full bundle validates them, as the page draws them
import { validate as validateAll } from '../lib/umlimator-all.js';

const bike = JSON.parse(readFileSync(new URL('../examples/bike-share.json', import.meta.url)));

test("bike-share's story is valid: steps on its views, naming their cards and lines", () => {
  assert.ok(bike.stories.length && bike.stories[0].steps.length === 5);
  assert.deepEqual(validateAll(bike), []);
});

test('validate() names what a story gets wrong, step by step: missing views, cards and lines are errors; a camera or duration it cannot use, warnings', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }, { id: 'w', nodeIds: ['c'] }],
    stories: [
      { id: 's', steps: [
        { view: 'v', select: 'ab', highlight: ['a', 'ab', 'a->b#0', { type: 'node', id: 'zz' }], tour: ['a', 'b'], camera: { card: 'b', zoom: 2 } },
        { view: 'nope' },
        { view: 'w', select: 'a', highlight: ['ghost'], tour: ['c', 'b'], camera: { card: 'a' }, duration: -1 },
        { view: 'v', camera: 'close' }] },
      { id: 's', steps: [] }, { title: 'no id' }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`), [
    'warning stories[0].steps[0].highlight[2]', // "a->b#0": the line from a to b has an id, so no line has that name (audit 11)
    'error stories[0].steps[0].highlight[3]', // a Ref is checked as an id is (audit 10)
    'error stories[0].steps[1].view',
    'error stories[0].steps[2].select',
    'error stories[0].steps[2].highlight[0]',
    'error stories[0].steps[2].tour[1]',
    'warning stories[0].steps[2].camera.card',
    'warning stories[0].steps[2].duration',
    'warning stories[0].steps[3].camera',
    'error stories[1].id',
    'error stories[1].steps',
    'error stories[2].id',
  ]);
  assert.match(validate(m)[3].message, /"a" is neither one of view "w"'s cards nor a line/);
  assert.deepEqual(validate({ ...m, stories: {} }).map(p => p.path), ['stories']);
});

test('audit 39: a step on a line its typed view does not draw is said for every type, as layout() draws it (not DFD and C4 alone)', async () => {
  const all = await import('../lib/umlimator-all.js'), said = m => all.validate(m).filter(p => p.path.startsWith('stories')).map(p => p.message);
  const two = (diagram, ty, lineTy, extra = {}) => ({ schemaVersion: 2, title: 'T', nodes: [{ id: 'a', type: ty, label: 'A', ...extra }, { id: 'b', type: ty, label: 'B', ...extra }],
    edges: [{ id: 'u', type: lineTy, from: 'a', to: 'b' }, { id: 'n', from: 'b', to: 'a' }], views: [{ id: 'v', diagram, nodeIds: ['a', 'b'] }],
    stories: [{ id: 's', title: 'S', steps: [{ view: 'v', select: 'u', highlight: ['n'] }] }] });
  const not = id => `"${id}" is no line of view "v": the view does not draw it`;
  for (const m of [two('uml.class', 'uml.Class', 'uml.Usage'), two('uml.package', 'uml.Package', 'uml.Association'), two('uml.object', 'uml.InstanceSpecification', 'uml.Dependency'),
    two('uml.profile', 'uml.Stereotype', 'uml.Usage'), two('er', 'er.Entity', 'uml.Association'), two('flowchart', 'flow.Process', 'uml.Association'),
    two('uml.information-flow', 'uml.Class', 'uml.Association'), two('mindmap', 'mindmap.Topic', 'uml.Dependency'), two('gcp', 'gcp.Product', 'uml.Dependency', { props: { icon: 'Cloud-Run' } })]) {
    const g = all.layout(m, 'v'), drew = new Set(g.edges.flatMap(e => (e.all || [e]).map(x => x._id)));
    assert.ok(!drew.has('u') && !drew.has('n'), `${m.views[0].diagram} draws neither`);
    assert.deepEqual(said(m), [not('u'), not('n')], m.views[0].diagram); }
  // a line the view does draw is fine: the type's own kind
  for (const m of [two('uml.class', 'uml.Class', 'uml.Association'), two('er', 'er.Entity', 'er.Relationship'), two('sysml.block-definition', 'sysml.Block', 'uml.Dependency')]) {
    m.stories[0].steps[0].highlight = []; assert.ok(all.layout(m, 'v').edges.some(e => e._id === 'u'), m.views[0].diagram); assert.deepEqual(said(m), [], m.views[0].diagram); }
  const bz = { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'P' }, { id: 's', type: 'bpmn.StartEvent', label: 'S', parent: 'pool' }, { id: 'a', type: 'bpmn.Task', label: 'A', parent: 'pool' }, { id: 'e', type: 'bpmn.EndEvent', label: 'E', parent: 'pool' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 'a' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 'a', to: 'e' }, { id: 'u', type: 'uml.Dependency', from: 's', to: 'e' }],
    views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['pool', 's', 'a', 'e'] }], stories: [{ id: 's', title: 'S', steps: [{ view: 'v', select: 'f1', highlight: ['u'] }] }] };
  assert.deepEqual(said(bz), [not('u')]);
  // every line of every typed view of the examples: said not drawn exactly when layout() does not draw it (by its id, as a step selects it)
  for (const f of ['bike-share', 'bookshop-schema', 'bookshop-gcp', 'fulfil-activity']) { // bike-share holds the atlases' typed views since step 3 of the one-model plan
    const x = JSON.parse(readFileSync(new URL(`../examples/${f}.json`, import.meta.url), 'utf8')), ids = x.edges.map(e => e.id).filter(id => typeof id === 'string');
    for (const v of x.views.filter(v => v.diagram && v.diagram !== 'map')) {
      const g = all.layout(x, v.id), drew = new Set([...g.edges.flatMap(e => (e.all || [e]).map(r => r._id)), ...Object.keys(g.byId)]), y = { ...x, stories: [{ id: 's', title: 'S', steps: ids.map(id => ({ view: v.id, select: id })) }] };
      const by = new Map(all.validate(y).filter(p => p.path.startsWith('stories[0]')).map(p => [ids[+/steps\[(\d+)\]/.exec(p.path)[1]], p.message]));
      ids.forEach(id => { if (drew.has(id)) assert.ok(!by.has(id), `${f} ${v.id} ${id} is drawn: ${by.get(id)}`); else if (v.nodeIds.includes(x.edges.find(e => e.id === id).from) && v.nodeIds.includes(x.edges.find(e => e.id === id).to)) assert.ok(by.has(id), `${f} ${v.id} ${id} is not drawn`); }); } }
  // hostile: a model whose view cannot be laid out, odd ids and steps throw nothing
  const h = two('uml.class', 'uml.Class', 'uml.Usage'); h.edges.push(null, 7, { id: '__proto__', type: 'uml.Usage', from: 'a', to: 'b' }, { id: 'constructor', from: { x: 1 }, to: [] });
  h.views[0].nodeIds.push({ toString: 1 }, 'ghost'); h.stories[0].steps.push({ view: 'v', select: '__proto__', highlight: [null, 3, 'constructor', { type: 'edge', ids: ['toString'] }] });
  assert.ok(said(h).includes(not('__proto__')), said(h).join('\n'));
});

test('audit 40: a step on a communication view\'s message is fine: the view draws it as a row the page selects by its id', async () => {
  const all = await import('../lib/umlimator-all.js'), said = m => all.validate(m).filter(p => p.path.startsWith('stories'));
  const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
  const m = read('./communication-minimal.json'), v = m.views[0].id, msgs = m.edges.filter(e => all.layout(m, v).byId[e.id]).map(e => e.id);
  assert.ok(msgs.length >= 2, 'the minimal model draws its messages as rows');
  m.stories = [{ id: 's', title: 'Walk', steps: [{ view: v, select: msgs[0] }, { view: v, highlight: msgs.slice(1) }] }];
  assert.deepEqual(said(m), []);
  // every message of the shipped communication views, selected and highlighted
  for (const f of ['../examples/checkout-communication.json', '../examples/bike-share.json', './communication-stress.json']) {
    const x = read(f);
    for (const cv of x.views.filter(w => w.diagram === 'uml.communication')) {
      const g = all.layout(x, cv.id), ids = x.edges.map(e => e.id).filter(id => typeof id === 'string' && g.byId[id]);
      assert.ok(ids.length, `${f} ${cv.id} draws messages`);
      x.stories = [{ id: 's', title: 'S', steps: ids.map(id => ({ view: cv.id, select: id, highlight: [id] })) }];
      assert.deepEqual(said(x), [], `${f} ${cv.id}`); } }
  // hostile: a message id that names an Object.prototype key, and a line the view does not draw, still said
  const h = read('./communication-minimal.json'), e0 = h.edges.find(e => all.layout(h, v).byId[e.id]);
  h.edges.push({ id: 'toString', type: 'uml.Dependency', from: e0.from, to: e0.to });
  h.stories = [{ id: 's', title: 'S', steps: [{ view: v, select: e0.id, highlight: ['toString', '__proto__', 'constructor'] }] }];
  h.views[0].edges.push('toString'); // listed, but a dependency a communication view does not draw
  const got = said(h);
  assert.ok(!got.some(p => p.path.endsWith('.select')), JSON.stringify(got));
  assert.ok(got.some(p => p.path.endsWith('highlight[0]') && /"toString" is no line of view "v": the view does not draw it/.test(p.message)), JSON.stringify(got));
  assert.ok(got.every(p => p.level === 'error' && !/__proto__|constructor/.test(p.message) || /is neither one of view/.test(p.message) || /toString/.test(p.message)), JSON.stringify(got));
});

test('audit 39: a step names a line written in another view: no line of its own view, which does not draw it', async () => {
  const all = await import('../lib/umlimator-all.js');
  for (const [diagram, ty] of [[null, null], ['er', 'er.Entity'], ['dfd', 'dfd.Process'], ['flowchart', 'flow.Process'], ['c4.container', 'c4.Container']]) {
    const t = ty ? { type: ty } : {}, m = { schemaVersion: ty ? 2 : 1, nodes: [{ id: 'x', label: 'X', ...t }, { id: 'y', label: 'Y', ...t }], edges: [],
      views: [{ id: 'a', ...(diagram && { diagram }), nodeIds: ['x', 'y'] }, { id: 'b', ...(diagram && { diagram }), nodeIds: ['x', 'y'], edges: [{ id: 'only-in-b', from: 'x', to: 'y', ...(ty && { type: { er: 'er.Relationship', dfd: 'dfd.DataFlow', flowchart: 'flow.Flow', 'c4.container': 'c4.Relationship' }[diagram] }) }] }],
      stories: [{ id: 's', title: 'S', steps: [{ view: 'a', select: 'only-in-b' }, { view: 'b', select: 'only-in-b' }] }] };
    assert.ok(!all.layout(m, 'a').edges.some(e => e._id === 'only-in-b') && all.layout(m, 'b').edges.some(e => e._id === 'only-in-b'), String(diagram));
    assert.deepEqual(all.validate(m).filter(p => p.path.startsWith('stories')).map(p => `${p.path}: ${p.message}`),
      ['stories[0].steps[0].select: "only-in-b" is no line of view "a": it is written in view "b"'], String(diagram)); }
  // an id an inline line and a model line share stays the model's; an id written in no view or model is still an unknown one
  const m = { nodes: [{ id: 'x' }, { id: 'y' }], edges: [{ id: 'e', from: 'x', to: 'y' }], views: [{ id: 'a', nodeIds: ['x', 'y'] }, { id: 'b', nodeIds: ['x', 'y'], edges: [{ id: '__proto__', from: 'x', to: 'y' }] }],
    stories: [{ id: 's', title: 'S', steps: [{ view: 'a', select: 'e', highlight: ['__proto__', 'constructor', 'toString'] }] }] };
  assert.deepEqual(validate(m).filter(p => p.path.startsWith('stories')).map(p => p.message), ['"__proto__" is no line of view "a": it is written in view "b"',
    '"constructor" is neither one of view "a"\'s cards nor a line', '"toString" is neither one of view "a"\'s cards nor a line']);
});
