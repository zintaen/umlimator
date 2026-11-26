// Layout by business flow, step 14 (docs/diagrams/notes/layout-flow.md section 12, .evolve/decisions.md D13): the imported maps
// arranged. A longest-path main flow keeps off a two-way line and off lines into or out of the zones (mainFlow's pairs and
// avoid); an under card's flow lines keep it past the column they come from; a boxed arranged view keeps the way of laying out
// its stores and zones that draws the fewest problems; render's layout search keeps the main row. bench/models/a8.json holds
// the import fixtures' views, arranged, for the score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, check } from '../lib/umlimator-all.js';
import { mainFlow } from '../src/layout/layered.js';
import { mapContext } from '../src/map/context.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const cells = g => Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]]));

test('mainFlow: with pairs, the longest path keeps off a line whose pair the other way is a line too; with avoid, off the lines named', () => {
  const L = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'c' }, { from: 'b', to: 'e' }];
  const back = new Set([3]); // d -> c closes a loop (loopsOf's)
  assert.deepEqual(mainFlow(L, { back }).cards, ['a', 'b', 'c', 'd']);
  assert.deepEqual(mainFlow(L, { back, pairs: true }).cards, ['a', 'b', 'c']);
  assert.deepEqual(mainFlow(L, { back, pairs: true, avoid: new Set([1]) }).cards, ['a', 'b', 'e']);
  // a path it cannot keep off: the longest path over every flow line, as without the option
  assert.deepEqual(mainFlow([{ from: 'a', to: 'b' }], { avoid: new Set([0]) }).cards, ['a', 'b']);
  // marked lines and steps are the author's: avoid does not touch them
  assert.deepEqual(mainFlow([{ from: 'a', to: 'b', flow: 'main' }, { from: 'b', to: 'c', flow: 'main' }], { avoid: new Set([1]) }).cards, ['a', 'b', 'c']);
});

// a shop: the shopper, the web, the API, which writes the orders store and calls the payment provider
const SHOP = boxed => ({ nodes: [{ id: 'u', label: 'Shopper', kind: 'person', shape: 'person' }, { id: 'w', label: 'Web', kind: 'frontend' },
  { id: 'a', label: 'API', kind: 'backend' }, { id: 'db', label: 'Orders', kind: 'database' }, { id: 'p', label: 'Payments', kind: 'external' }],
  edges: [{ id: 'uw', from: 'u', to: 'w' }, { id: 'wa', from: 'w', to: 'a' }, { id: 'ad', from: 'a', to: 'db' }, { id: 'ap', from: 'a', to: 'p' }],
  views: [{ id: 'v', arrange: 'flow', nodeIds: ['u', 'w', 'a', 'db', 'p'], ...(boxed && { containers: [{ id: 'core', label: 'Core', nodeIds: ['a', 'db'] }] }) }] });

test('an arranged map view: the main flow runs to the external card, not on into the store, which its line reaches the reading way', () => {
  for (const boxed of [false, true]) {
    const m = SHOP(boxed), g = layout(m, 'v'), c = cells(g);
    assert.deepEqual(g.edges.filter(e => e.mainLine).map(e => e.from + '>' + e.to), ['u>w', 'w>a', 'a>p'], `boxed ${boxed}`);
    assert.ok(c.db[1] > c.a[1], `boxed ${boxed}: the store is under the flow (${JSON.stringify(c)})`);
    assert.deepEqual(check(m, 'v').map(x => x.message), [], `boxed ${boxed}`);
  }
});

test('an under card only written to sits a column past its writer, where the view has one, so its line does not run straight down', () => {
  const m = SHOP(false); m.nodes.push({ id: 'x', label: 'Mail', kind: 'backend' }); m.edges.push({ id: 'px', from: 'p', to: 'x' }); m.views[0].nodeIds.push('x');
  const c = cells(layout(m, 'v'));
  assert.ok(c.db[0] > c.a[0], JSON.stringify(c));
  assert.ok(!check(m, 'v').some(x => /right-to-left/.test(x.message)));
});

test('a8: the import fixtures\' views, arranged, draw no line against the reading way and none round the view', () => {
  const m = read('../bench/models/a8.json');
  assert.equal(m.views.length, 8);
  assert.ok(m.views.every(v => v.arrange === 'flow' && v.kindsFromLabels === true));
  for (const v of m.views) {
    const said = [...check(m, v.id), ...check({ ...m, views: m.views.map(w => ({ ...w, kindsFromLabels: false })) }, v.id)].map(x => x.message);
    assert.deepEqual(said.filter(s => /right-to-left|detour|runs round/.test(s)), [], v.id);
  }
});

test('render\'s layout search keeps an arranged view\'s main cards where the layout put them', () => {
  const m = read('../bench/models/a8.json');
  for (const vid of ['dsl-api-components', 'puml-components', 'checkout-flowchart']) {
    const main = new Set(layout(m, vid).edges.filter(e => e.mainLine).flatMap(e => [e.from, e.to])), auto = cells(layout(m, vid));
    const c = mapContext(m); c.planOf(vid); const { pos } = c.optimize(vid, 60);
    const at = id => auto[id];
    // rows may move as a whole (the search moves the main row down to make room); the main cards stay level with each other
    const rows = new Set([...main].map(i => pos[i][1]));
    assert.equal(rows.size, new Set([...main].map(i => at(i)[1])).size, vid);
    for (const i of main) assert.equal(pos[i][0], at(i)[0], `${vid}: ${i} keeps its column`);
  }
});
