// The defaults of layout-flow.md section 12, step 14 (the maintainer's call, .evolve/decisions.md D12 and D13): diff() lays the
// model after out against the model before unless told stable: false; and umlimator.py import --arrange sets arrange "flow" on
// the views whose type reads the flow, a list (FLOW_TYPES in umlimator.py) held here to the registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { diff } from '../lib/umlimator-all.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const map = (labels, lines) => ({ nodes: labels.map(id => ({ id, label: id.toUpperCase() })), edges: lines.map(([from, to]) => ({ id: from + to, from, to })),
  views: [{ id: 'v', title: 'V', nodeIds: [...labels] }] });

test('diff() is stable by default: stableFrom is the model before, and stable: false leaves it out', () => {
  const a = map(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]), b = map(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']]);
  const d = diff(a, b), off = diff(a, b, { stable: false });
  assert.deepEqual(d.stableFrom, a, 'by default');
  assert.deepEqual(diff(a, b, { stable: true }), d, 'stable: true says the default');
  assert.ok(!('stableFrom' in off), 'stable: false');
  for (const o of [undefined, null, {}, 'x', { stable: 0 }, { stable: 'false' }]) assert.deepEqual(diff(a, b, o).stableFrom, a, `options ${JSON.stringify(o)}: only stable: false turns it off`);
  assert.deepEqual({ ...d, stableFrom: undefined }, { ...off, stableFrom: undefined }, 'the marks, summary and views do not depend on it');
  assert.notEqual(d.stableFrom, a, 'a copy: the input is not handed back');
});

test('umlimator.py import --arrange: FLOW_TYPES is the map and every registered type whose entry gives flowRole or zoneOf', async () => {
  const src = join => readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(f => f.endsWith('.js')).map(f => join(f));
  for (const f of src(f => f.replaceAll('\\', '/'))) if (!/^(page|canvas)\//.test(f)) await import(`../src/${f}`);
  const { diagramOf } = await import('../src/core/registry.js');
  const py = readFileSync(root + 'umlimator.py', 'utf8'), listed = py.match(/^FLOW_TYPES = \(([^)]*)\)/m);
  assert.ok(listed, 'umlimator.py has FLOW_TYPES');
  const names = [...listed[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const all = [...new Set(readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(f => f.endsWith('.js'))
    .flatMap(f => [...readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').matchAll(/registerDiagramType\('([^']+)'|\b(c4\.[a-z-]+)'/g)].map(m => m[1] || m[2])))]
    .filter(n => diagramOf({ diagram: n }));
  const reads = all.filter(n => { const T = diagramOf({ diagram: n }); return n === 'map' || typeof T.flowRole === 'function' || typeof T.zoneOf === 'function'; });
  assert.ok(reads.includes('c4.container') && reads.includes('bpmn') && !reads.includes('uml.class'), reads.join(', '));
  assert.deepEqual([...names].sort(), [...reads].sort());
});
