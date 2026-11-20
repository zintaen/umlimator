// The reading aids (0.15.0) with no browser: a box's tone and a line's step in the model, validate() and describe() on them,
// and the room layout() gives a step's mark. tests/aids.html draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, check, validate, describe } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const cards = ids => ids.map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }));

test('validate() takes a step on a line and a tone on a box, and warns when they are not what they draw', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'e1', from: 'a', to: 'b', step: 2.1 }, { id: 'e2', from: 'b', to: 'a', step: '2ab' }, { id: 'e3', from: 'a', to: 'b', step: -1 },
    { id: 'e4', from: 'a', to: 'b', step: '2abc' }, { id: 'e5', from: 'a', to: 'b', step: '' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: ['e1', { from: 'a', to: 'b', step: 3 }, { from: 'b', to: 'a', step: null }],
      containers: [{ id: 'x', nodeIds: ['a'], tone: 'orange' }, { id: 'y', nodeIds: ['b'], tone: 5 }, { id: 'z', tone: false }] }] };
  const no = 'is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written';
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}: ${p.message}`), [
    `warning edges[2].step: step -1 ${no}`, `warning edges[3].step: step "2abc" ${no}`, `warning edges[4].step: step "" ${no}`,
    'warning views[0].containers[1].tone: tone 5 is not a palette name (green, amber, ...): drawn in slate',
    'warning views[0].containers[2].tone: tone false is not a palette name (green, amber, ...): ignored',
    'warning views[0].containers[2]: box "z" holds no cards: it is not drawn, nor its lines', // audit 4
  ]);
});

test('a box keeps its tone in the geometry, for the picture to tint its region', () => {
  const g = layout({ nodes: cards(['a', 'b']), edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'x', nodeIds: ['b'], tone: 'green' }, { id: 'y', nodeIds: ['a'] }] }] }, 'v');
  assert.deepEqual(g.families.map(f => [f.id, f.tone]), [['x', 'green'], ['y', undefined]]);
});

test('a step is drawn on its line in any view, before the label; a numbered view numbers in run order whatever the step', () => {
  const m = { nodes: cards(['a', 'b', 'c']), edges: [{ id: 'ab', from: 'a', to: 'b', label: 'calls', step: 2 }, { id: 'bc', from: 'b', to: 'c', step: 1.5 }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }, { id: 's', nodeIds: ['a', 'b', 'c'], render: 'sequence' }] };
  const g = layout(m, 'v'), at = id => g.edges.find(e => e.ids.includes(id)).lbl;
  assert.deepEqual([at('ab').step, at('ab').text, at('bc').step, at('bc').text], [2, 'calls', 1.5, '']); // a mark alone on a line with no label
  assert.ok(at('ab').w > 16 + 4 + 20 && at('bc').sw > 16, 'the mark is in the pill, and 1.5 is a pill of its own'); // as #82 draws 4.1
  assert.deepEqual(check(m, 'v'), []);
  assert.deepEqual(layout(m, 's').edges.map(e => e.lbl.step), [1, 2]);
});

test('a step may be short text: drawn as written, a circle for one character and a pill for two or three', () => {
  const m = { nodes: cards(['a', 'b', 'c', 'd']), edges: [{ id: 'ab', from: 'a', to: 'b', label: 'asks', step: '2a' }, { id: 'bc', from: 'b', to: 'c', step: 'b' },
    { id: 'cd', from: 'c', to: 'd', label: 'pays', step: 12 }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }] };
  const g = layout(m, 'v'), at = id => g.edges.find(e => e.ids.includes(id)).lbl;
  assert.deepEqual([at('ab').step, at('ab').text, at('bc').step, at('cd').step], ['2a', 'asks', 'b', 12]);
  assert.ok(at('bc').sw === 16 && at('ab').sw >= 20 && at('cd').sw >= 20, JSON.stringify([at('ab').sw, at('bc').sw, at('cd').sw])); // 16: the circle
  assert.deepEqual(validate(m), []);
  assert.deepEqual(check(m, 'v'), []);
  assert.match(describe(m, 'v'), /\nA calls B \("asks", step 2a\)\.\n/);
});

test('lines drawn as one show the first one\'s step, and their title lists each; keepPairs numbers each line', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'x', from: 'a', to: 'b', label: 'asks', step: 1 }, { id: 'y', from: 'a', to: 'b', label: 'pays', step: 4 }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }, { id: 'k', nodeIds: ['a', 'b'], keepPairs: true }] };
  const [one] = layout(m, 'v').edges;
  assert.deepEqual([one.step, one.when], [1, '1. asks\n4. pays']);
  assert.deepEqual(layout(m, 'k').edges.map(e => e.lbl.step), [1, 4]);
});

test('a numbered line with no label gets room for its mark between neighbouring columns, as a labelled line does', () => {
  const m = step => ({ nodes: cards(['a', 'b']), edges: [{ from: 'a', to: 'b', ...(step ? { step } : {}) }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  const gap = g => g.nodes[1].x - (g.nodes[0].x + g.nodes[0].w);
  assert.equal(gap(layout(m(0), 'v')), 66); // no label, no step: the map's own gap
  const g = layout(m(7), 'v'), L = g.edges[0].lbl;
  assert.equal(gap(g), 76); // the 22 px mark and 27 px of line on each side, as a label gets
  assert.ok(L.x - (g.nodes[0].x + g.nodes[0].w) >= 16 && g.nodes[1].x - (L.x + L.w) >= 16, JSON.stringify(L));
});

test('describe() says a line\'s step in any view, and a numbered view keeps its run order', () => {
  const shop = read('./fixtures/integration.json'); // its rider shop's views
  assert.match(describe(shop, 'checkout'), /\nStorefront calls Shop API \("checkout", JSON over HTTPS, step 2\)\.\n/);
  assert.match(describe(shop, 'api'), /\nStep 1: Shoppers calls Shop API \("checks out"\)\.\n/);
  assert.doesNotMatch(describe(shop, 'overview'), /step \d/);
});

test("the rider shop's checkout reads as the blend: six steps with their labels whole, two boxes with a tone, a clean check", () => {
  const shop = read('./fixtures/integration.json'), g = layout(shop, 'checkout');
  assert.deepEqual(g.edges.map(e => [e.lbl.step, e.lbl.text, e.weight]).sort((p, q) => p[0] - q[0]), [[1, 'browse, buy', 2], [2, 'checkout', 2], [3, 'charge the card', 1],
    [4, 'paid order', 2], [5, 'next order', 2], [6, 'confirmation', 2]]);
  assert.deepEqual(g.families.map(f => [f.id, f.tone]), [['web', 'cyan'], ['orders', 'orange']]);
  assert.deepEqual(check(shop, 'checkout'), []);
});

test('A→B and B→A drawn as one: the first one\'s step on the line, and its title lists each with its own', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'x', from: 'a', to: 'b', label: 'asks', step: 1 }, { id: 'y', from: 'b', to: 'a', label: 'answers', step: 2 }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const [one] = layout(m, 'v').edges;
  assert.deepEqual([one.both, one.step, one.label, one.when], [true, 1, 'asks / answers', '1. asks\n2. answers']);
  delete m.edges[0].step; // only B→A has a step: it is still in the title
  assert.equal(layout(m, 'v').edges[0].when, 'asks\n2. answers');
});

test('validate() warns of a card source that is not a path or a list of paths (audit 14)', () => {
  const said = validate({ nodes: [{ id: 'a', source: 42 }, { id: 'b', source: ['src/b.js', 7] }, { id: 'c', source: ['src/c.js'] }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] });
  assert.deepEqual(said.filter(p => /source/.test(p.path)).map(p => p.path), ['nodes[0].source', 'nodes[1].source']);
});

test('audit 37: the gap defaults lib/umlimator.d.ts states are the ones layout() uses, a process view\'s 38 px too', () => {
  const dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8'), doc = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*gap\?: number; rgap\?: number;/.exec(dts);
  assert.ok(doc, 'the MapView gap comment'); const text = doc[1].replace(/\s*\*\s*/g, ' ');
  const [, col, row] = /default (\d+) and (\d+)/.exec(text) || [], [, proc] = /with no boxes: (\d+) between columns/.exec(text) || [];
  const m = (v = {}) => ({ nodes: cards(['a', 'b', 'c']), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], ...v }] });
  const colGap = g => g.nodes[1].x - (g.nodes[0].x + g.nodes[0].w);
  assert.equal(colGap(layout(m(), 'v')), Number(col));
  assert.equal(colGap(layout(m({ render: 'process' }), 'v')), Number(proc), text);
  assert.equal(colGap(layout(m({ mainSteps: ['a', 'b', 'c'] }), 'v')), Number(proc), text);
  assert.equal(colGap(layout(m({ render: 'process', gap: Number(col) }), 'v')), Number(col), 'the stated default, set, widens a process view');
  assert.equal(Number(row), 44);
});

test('audit 38: a process view with containers: [] has no boxes, so it keeps the d.ts\'s 38 px between columns', () => {
  const m = (v = {}) => ({ nodes: cards(['a', 'b', 'c', 'd']), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'], ...v }] });
  const gaps = g => { const ns = [...g.nodes].sort((p, q) => p.x - q.x); return ns.slice(1).map((n, i) => n.x - (ns[i].x + ns[i].w)); };
  for (const v of [{ render: 'process' }, { mainSteps: ['a', 'b', 'c', 'd'] }]) {
    assert.deepEqual(gaps(layout(m({ ...v, containers: [] }), 'v')), [38, 38, 38], JSON.stringify(v));
    assert.deepEqual(gaps(layout(m({ ...v, containers: [] }), 'v')), gaps(layout(m(v), 'v')), 'an empty list draws as no list');
  }
  // a box held keeps the wider gap
  assert.ok(gaps(layout(m({ render: 'process', containers: [{ id: 'x', label: 'X', nodeIds: ['a', 'b'] }] }), 'v')).some(x => x >= 66));
});

test('audit 39: a view with containers: [] keeps its hub (lanes) plan, as with no list; a box held, or a list that is no list, keeps the plain flow', () => {
  const nodes = [{ id: 'h', label: 'Hub', kind: 'public' }, ...['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }))];
  const m = (v = {}) => ({ nodes, edges: ['a', 'b', 'c', 'd'].map(t => ({ from: 'h', to: t })), views: [{ id: 'v', nodeIds: nodes.map(n => n.id), ...v }] });
  const at = g => g.nodes.map(n => [n.id, n.x, n.y, n.w]), none = layout(m(), 'v');
  assert.ok((none.lanes || []).length >= 1, 'no list: a hub plan, with its lane');
  assert.deepEqual(at(layout(m({ containers: [] }), 'v')), at(none), 'an empty list draws as no list');
  assert.deepEqual(layout(m({ containers: [] }), 'v').lanes, none.lanes);
  assert.ok(!(layout(m({ containers: [{ id: 'x', label: 'X', nodeIds: ['a', 'b'] }] }), 'v').lanes || []).length, 'a box held: the plain flow');
  for (const odd of [{}, 'ab', 0, null]) assert.deepEqual(at(layout(m({ containers: odd }), 'v')), at(none), `containers ${JSON.stringify(odd)} holds no box`);
});

test('audit 38: the page\'s element count counts an untyped element a flowchart or C4 view draws, and not a SysML diagram frame', async () => {
  const { elementCount } = await import('../src/canvas/pieces.js'), all = await import('../lib/umlimator-all.js');
  const two = (diagram, a, extra = []) => { const nodes = [a, { id: 'u', label: 'Untyped' }, ...extra]; return { schemaVersion: 2, title: 'T', root: 'v', nodes, edges: [], views: [{ id: 'v', title: 'V', diagram, nodeIds: nodes.map(n => n.id) }] }; };
  for (const [m, n] of [[two('flowchart', { id: 's', type: 'flow.Terminator', label: 'Start' }, [{ id: 'e', type: 'flow.Terminator', label: 'End' }]), 3], [two('flowchart', { id: 's', type: 'flow.Process', label: 'P' }), 2],
    [two('c4.context', { id: 'x', type: 'c4.Person', label: 'Customer' }), 2], [two('c4.container', { id: 'x', type: 'c4.Person', label: 'Customer' }), 2],
    [two('dfd', { id: 'x', type: 'dfd.ExternalEntity', label: 'Customer' }), 2], [two('er', { id: 'x', type: 'er.Entity', label: 'T' }), 2]]) {
    const g = all.layout(m, 'v'); assert.equal(g.nodes.length, n, m.views[0].diagram);
    assert.equal(elementCount(m.views[0], g), n, `${m.views[0].diagram}: every element drawn counted`); }
  // a view's id with "->" in a node it lists is no element (model.js refuses such an id), so it is not counted as one
  const hostile = two('flowchart', { id: 's', type: 'flow.Process', label: 'P' }); hostile.views[0].nodeIds.push('a->b');
  assert.equal(elementCount(hostile.views[0], { nodes: [...all.layout(hostile, 'v').nodes, { id: 'a->b', shape: 'process' }], families: [{ id: 'v->frame' }] }), 2);
  // a bdd or requirement view's frame names no element: its count is its describe()'s
  for (const [f, vid, n] of [['./fixtures/integration.json', 'blocks', 12], ['./fixtures/integration.json', 'requirements', 16], ['../examples/ebike-blocks.json', 'blocks', 15], ['../examples/ebike-requirements.json', 'requirements', 16]]) {
    const m = read(f), v = m.views.find(x => x.id === vid), g = all.layout(m, vid), said = /(\d+) elements? and/.exec(all.describe(m, vid));
    assert.deepEqual(g.families.map(x => x.id), [`${vid}->frame`], `${f} ${vid}: its one box is the frame`);
    assert.equal(Number(said && said[1]), n); assert.equal(elementCount(v, g), n, `${f} ${vid}: ${all.describe(m, vid).split('\n')[0]}`); }
});

test('audit 39: a card that opens a typed view counts what that view draws, as its pill does; one that cannot be laid out, its cards', async () => {
  const { elementCount } = await import('../src/canvas/pieces.js'), all = await import('../lib/umlimator-all.js');
  const m = read('../examples/order-service-structure.json'), inner = m.views[0].id;
  m.nodes.push({ id: 'svc', label: 'Service', opensView: inner }, { id: 'db', label: 'DB', kind: 'db' });
  m.views.push({ id: 'top', title: 'Top', nodeIds: ['svc', 'db'], edges: [] });
  const drawn = elementCount(m.views[0], all.layout(m, inner)), card = all.layout(m, 'top').nodes.find(n => n.id === 'svc');
  assert.ok(drawn > m.views[0].nodeIds.length, `the view draws more than it lists: ${drawn}`);
  assert.equal(card.kids, drawn);
  // hostile: a typed view its type cannot lay out still gives the card a count, and the map draws
  const bad = structuredClone(m); bad.views[0].nodeIds = ['order-service', { toString: 1 }, null, '__proto__'];
  const g = all.layout(bad, 'top'); assert.equal(g.nodes.find(n => n.id === 'svc').opens, true);
  assert.ok(Number.isFinite(g.nodes.find(n => n.id === 'svc').kids));
});
