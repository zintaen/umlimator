// validate() and check(): a model's own problems, and the layout check's geometry, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, check, layout } from '../lib/umlimator.js';
import { mapContext } from '../src/map/context.js';
import { fit } from '../src/core/text.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));

test('validate() finds nothing wrong in the examples and the benchmark models', () => {
  for (const f of ['bookshop', 'bike-share', 'weather', 'assistant']) assert.deepEqual(validate(read(`../examples/${f}.json`)), [], f);
  for (const f of ['b10', 'b26', 'b69', 'd24', 'm50']) assert.deepEqual(validate(read(`../bench/models/${f}.json`)), [], f);
});

test('validate() names each error and warning by where it is, and accepts what render() draws (lines to a box, a view loaded later)', () => {
  const bad = { root: 'nope',
    nodes: [{ id: 'a', kind: 'backend' }, { id: 'a' }, { label: 'no id' }, { id: 'b', kind: 'wizard', opensView: 'later' }],
    edges: [{ id: 'e1', from: 'a', to: 'ghost' }, { id: 'e1', from: 'a', to: 'box' }, { id: 'e3', from: 'a', to: 'b', kind: 'zaps', weight: 5, fromSide: 'up' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], tour: ['a', 'z'], stepIds: ['q'], browserOrder: ['w'], layout: { zz: [0, 0] },
      edges: ['e1', 'e9', { from: 'a', to: 'box' }, { from: 'a', to: 'far' }],
      containers: [{ id: 'box', nodeIds: ['a', 'x'], parent: 'inner' }, { id: 'inner', parent: 'box' }, { id: 'lost', parent: 'nowhere' }] }] };
  const got = validate(bad).map(p => `${p.level} ${p.path}`).sort();
  assert.deepEqual(got, [
    'error edges[0].to', 'error edges[1].id', 'error nodes[1].id', 'error nodes[2].id', 'error root',
    'error views[0].browserOrder[0]', 'error views[0].containers[0].nodeIds[1]', 'error views[0].containers[0].parent', 'error views[0].containers[1].parent',
    'error views[0].containers[2].parent', 'error views[0].edges[1]', 'error views[0].edges[3].to', 'error views[0].nodeIds[2]',
    'error views[0].stepIds[0]', 'error views[0].tour[1]',
    'warning edges[2].fromSide', 'warning edges[2].kind', 'warning edges[2].weight', 'warning nodes[3].kind', 'warning nodes[3].opensView', 'warning views[0].containers[2]', 'warning views[0].layout.zz',
  ]);
  assert.match(validate(bad).find(p => p.path === 'views[0].containers[0].parent').message, /inside itself/);
  assert.deepEqual(validate({ nodes: [] }).map(p => p.path), ['views']);
});

test('validate() warns of a line from a card or a box to itself, which no view draws (F1)', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: [{ from: 'box', to: 'box' }, { from: 'a', to: 'b' }], containers: [{ id: 'box', nodeIds: ['b'] }] }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path} ${p.message}`), [
    'warning edges[0] a line from "a" to itself: not drawn',
    'warning views[0].edges[0] a line from "box" to itself: not drawn',
  ]);
  assert.equal(layout(m, 'v').edges.length, 1); // the view's own lines: only a -> b is drawn
});

test('check() reports the layout check\'s geometry for a view, naming the lines it is about', () => {
  const cards = ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }));
  const clean = { nodes: cards, edges: [{ id: 'ab', from: 'a', to: 'b', label: 'calls' }, { id: 'bc', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  assert.deepEqual(check(clean, 'v'), []);
  const back = { nodes: cards, edges: [{ id: 'cb', from: 'c', to: 'b' }], views: [{ id: 'v', nodeIds: ['b', 'c'], layout: { b: [0, 0], c: [1, 0] } }] };
  assert.deepEqual(check(back, 'v'), [{ message: 'view v: edge C→B runs right-to-left', targets: [{ type: 'edge', ids: ['cb'], view: 'v' }] }]);
  assert.throws(() => check(clean, 'nope'), /no view/);
});

test('check() names exactly what an issue is about: of two lines that read the same, the one it means (#61)', () => {
  const m = { nodes: [{ id: 'a1', label: 'API', kind: 'backend' }, { id: 'a2', label: 'API', kind: 'backend' }, { id: 'db', label: 'DB', kind: 'database' }],
    edges: [{ id: 'a2db', from: 'a2', to: 'db' }, { id: 'a1db', from: 'a1', to: 'db' }],
    views: [{ id: 'v', nodeIds: ['a1', 'a2', 'db'], layout: { a2: [0, 0], db: [1, 0], a1: [2, 0] } }] };
  assert.deepEqual(check(m, 'v'), [{ message: 'view v: edge API→DB runs right-to-left', targets: [{ type: 'edge', ids: ['a1db'], view: 'v' }] }]);
});

// A deep parent chain (milestone 4a §2.4, work package 4a.2): the cycle check walks each chain once, so validate() of
// 20,000 levels is linear, and says "ends up inside itself" on each element of a cycle, where and in the order it did
const owners = (n, parentOf) => ({ schemaVersion: 2,
  nodes: Array.from({ length: n }, (_, i) => { const p = parentOf(i); return { id: 't' + i, type: 'uml.Package', ...(p != null ? { parent: 't' + p } : {}) }; }),
  views: [{ id: 'v', diagram: 'uml.package', nodeIds: Array.from({ length: n }, (_, i) => 't' + i) }] });
const cycles = m => validate(m).filter(p => /inside itself/.test(p.message)).map(p => p.path);

test('validate() says a cycle on each element of it, in model order, and nothing on a chain that only leads into one (4a.2)', () => {
  // t0 t1 t2 a cycle; t3 hangs from it; t4 its own parent; t5 t6 a chain to t7 t8, a cycle listed after them; t9 apart
  const m = owners(10, i => [2, 0, 1, 0, 4, 6, 7, 8, 7, null][i]);
  assert.deepEqual(cycles(m), ['nodes[0].parent', 'nodes[1].parent', 'nodes[2].parent', 'nodes[4].parent', 'nodes[7].parent', 'nodes[8].parent']);
  assert.deepEqual(cycles(owners(5, i => (i ? i - 1 : null))), []);
  // a cycle through a member and its owner: the node that names the member is said, the member (no parent) is not
  const mem = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.State', members: [{ id: 'r', type: 'uml.Region' }], parent: 'r' }], views: [] };
  assert.deepEqual(cycles(mem), ['nodes[0].parent']);
});

test('validate() of a 20,000-topic chain, a chain into a cycle and a ring of 20,000 under CI\'s 1 s, printed against 100 ms (CPU, best of five, after a warm-up) (timed)', () => {
  const N = 20000, chain = owners(N, i => (i ? i - 1 : null)), tail = owners(N, i => (i ? i - 1 : 1)), ring = owners(N, i => (i + N - 1) % N);
  assert.deepEqual(cycles(chain), []);
  assert.deepEqual(cycles(tail), ['nodes[0].parent', 'nodes[1].parent']);
  assert.equal(cycles(ring).length, N);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = m => Math.min(...Array.from({ length: 5 }, () => timed(() => validate(m))));
  const [c, t, r] = [chain, tail, ring].map(best); // each walk to the top was 9.5 s at 20,000
  for (const ms of [c, t, r]) assert.ok(ms < 1000, `${ms} ms`);
  console.log(`# P1 target 100 ms: validate() of a 20,000 chain ${c} ms, a chain into a cycle ${t} ms, a ring of 20,000 ${r} ms`);
});

test('a map view with a box lays out a line to a listed id that is no card: the line is left out, as without the box (backlog M3.3)', () => {
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'ghost' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'ghost'], containers: [{ id: 'box', label: 'Box', nodeIds: ['a'] }] }] };
  assert.ok(validate(m).some(p => p.level === 'error' && /ghost/.test(p.message)));
  assert.equal(layout(m, 'v').edges.length, 1);
});

test('a field that must be a list and is not: validate() says so, and the map draws without it (audit 1)', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  for (const [set, path, level] of [[m => { m.nodes[0].verbs = 'GET /orders'; }, 'nodes[0].verbs', 'warning'], [m => { m.views[0].nodeIds = 'a'; }, 'views[0].nodeIds', 'error'],
    [m => { m.views[0].containers = 'box'; }, 'views[0].containers', 'warning'], [m => { m.views[0].intake = 'feed'; }, 'views[0].intake', 'warning']]) {
    const m = base(); set(m);
    assert.ok(validate(m).some(p => p.path === path && p.level === level), path);
    assert.doesNotThrow(() => layout(m, 'v'), path);
  }
});

test('an icon\'s src and an author\'s avatar are escaped in href: an SVG data URL draws, and a model adds no attributes (audit 1)', () => {
  const src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>';
  const m = { icons: { logo: { src }, bad: { src: 'x" onerror="alert(1)' } }, authors: { ann: { avatar: 'y" onload="alert(2)' } },
    nodes: [{ id: 'a', label: 'A', icon: 'logo' }, { id: 'b', label: 'B', icon: 'bad', author: 'ann' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const s = mapContext(m).buildView('v').markup;
  assert.ok(s.includes('href="data:image/svg+xml;utf8,&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot;/&gt;"'));
  assert.ok(!/ on(error|load)="/.test(s));
});

test('a cut label ends on whole characters: never half an emoji (audit 1)', () => {
  const t = fit('\u{1F600}'.repeat(40), 13, 100, true);
  assert.ok(t.endsWith('…') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(t), JSON.stringify(t));
});

test('edges that is no list, a view that is no object, a box\'s nodeIds that is no list: validate() says so, and the map draws without it (audit 2)', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'box', label: 'Box', nodeIds: ['b'] }] }] });
  for (const [set, path] of [[m => { m.views[0].containers[0].nodeIds = 'b'; }, 'views[0].containers[0].nodeIds'], [m => { m.edges = { 0: m.edges[0] }; }, 'edges'], [m => { m.views.push(null); }, 'views[1]']]) {
    const m = base(); set(m);
    assert.ok(validate(m).some(p => p.path === path && p.level === 'error'), path);
    assert.doesNotThrow(() => layout(m, 'v'), path);
  }
});

test('a card\'s author tag ends on whole characters: initials and a long name never cut an emoji in half (audit 2)', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const author of ['\u{1F680} rocket team', 'team-' + '\u{1F680}'.repeat(30)]) {
    const s = mapContext({ nodes: [{ id: 'a', label: 'Orders', author }], views: [{ id: 'v', nodeIds: ['a'] }] }).buildView('v').markup;
    assert.ok(!lone.test(s), author);
  }
});
