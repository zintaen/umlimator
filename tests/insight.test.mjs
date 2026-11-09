// critical(), whatIf() and sequenceFromTrace(), and validate() on lenses, owners and budgets (#94, #95, #96), with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { critical, whatIf, sequenceFromTrace, otlpSpans, validate, check, rules } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const bike = read('../examples/bike-share.json');
const brief = refs => refs.map(r => (r.type === 'node' ? r.id : r.ids.join('+')) + (r.distance != null ? '@' + r.distance : ''));

test('critical() finds the path with the highest total, by latency or cost, from a card, between two, or anywhere', () => {
  const slow = critical(bike, 'trips', { from: 'rider-app' });
  assert.deepEqual([brief(slow.refs), slow.total], [['rider-app', 'trip-api', 'lifecycle', 'fare', 'payments', 't1', 't4', 't5', 't11'], 585]);
  assert.deepEqual(critical(bike, 'trips', { from: 'rider-app', by: 'cost' }).total, 30);
  const dock = critical(bike, 'trips', { from: 'rider-app', to: 'stations' });
  assert.deepEqual([brief(dock.refs), dock.total], [['rider-app', 'trip-api', 'unlock', 'stations', 't1', 't2', 't3'], 535]);
  assert.equal(critical(bike, 'trips').total, 585, 'from and to left out: any card to any card');
  assert.deepEqual(critical(bike, 'trips', { from: 'payments' }), { refs: [], total: 0 }, 'a card no line leaves');
  assert.deepEqual(critical(bike, 'trips', { from: 'stations', to: 'rider-app' }), { refs: [], total: 0 }, 'against the lines');
  assert.deepEqual(critical(bike, 'trips', { from: 'ghost' }), { refs: [], total: 0 });
  assert.throws(() => critical(bike, 'nope'), /no view/);
});

test('critical() never comes back to a card, counts a line with no budget as 0, and takes the larger of two parallel lines', () => {
  const m = { nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })), views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }],
    edges: [{ id: 'ab', from: 'a', to: 'b', latency: 10 }, { id: 'bc', from: 'b', to: 'c', latency: 5 }, { id: 'ca', from: 'c', to: 'a', latency: 100 },
      { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd', latency: 1 }, { id: 'cd2', from: 'c', to: 'd', latency: 7, cost: 2 }, { id: 'aa', from: 'a', to: 'a', latency: 999 }] };
  const r = critical(m, 'v', { from: 'a', to: 'd' });
  assert.deepEqual([brief(r.refs), r.total], [['a', 'b', 'c', 'd', 'ab', 'bc', 'cd2'], 22], 'the loop back to a and the line from a to itself are never taken');
  assert.deepEqual(brief(critical(m, 'v', { from: 'b' }).refs), ['b', 'c', 'a', 'bc', 'ca'], 'from b, the loop to a is the slowest way out');
  assert.deepEqual([critical(m, 'v', { from: 'a', by: 'cost' }).total, critical({ ...m, edges: m.edges.map(({ latency, ...e }) => e) }, 'v', { from: 'a', to: 'd' }).total], [2, 0]);
  assert.equal(critical({ ...m, edges: [{ from: 'a', to: 'b', cost: 0.1 }, { from: 'b', to: 'c', cost: 0.2 }] }, 'v', { by: 'cost' }).total, 0.3, 'no float noise in the total');
});

test('whatIf() lights what loses its way to the cards taken out (backward, nearest first), and nothing else', () => {
  const before = structuredClone(bike), w = whatIf(bike, 'trips', { remove: ['pricing'] });
  assert.deepEqual(Object.keys(w), ['unreachable'], 'no broken rules: taking cards out never adds a line or a cycle');
  assert.deepEqual(brief(w.unreachable), ['pricing@0', 'fare@1', 'lifecycle@2', 'trip-api@3', 'rider-app@4', 't6@1', 't5@2', 't4@3', 't1@4']);
  assert.deepEqual(bike, before, 'the model is left as it is');
  assert.deepEqual(brief(whatIf(bike, 'trips', { remove: ['pricing', 'trip-repo'] }).unreachable),
    ['pricing@0', 'trip-repo@0', 'fare@1', 'lifecycle@1', 'trip-api@2', 'rider-app@3', 't6@1', 't7@1', 't5@2', 't4@2', 't1@3'], 'two cards: each thing at its distance from the nearest');
  assert.deepEqual(whatIf(bike, 'trips', { remove: ['ghost'] }), { unreachable: [] });
});

test("sequenceFromTrace(): the replay example's trace becomes bike-share's numbered view, which validates and checks clean", () => {
  const trace = read('../examples/traces/ride-end.json'), match = read('../examples/traces/match.json'), before = structuredClone(bike);
  const out = sequenceFromTrace(bike, otlpSpans(trace), { view: 'ride-end', match, title: 'A ride ends, from its trace' });
  assert.deepEqual(out.views.find(v => v.id === 'ride-end'), bike.views.find(v => v.id === 'ride-end'), 'umlimator.py trace wrote the view the example keeps');
  assert.deepEqual(out.views.map(v => v.id), bike.views.map(v => v.id), 'a view with that id is replaced where it is');
  assert.deepEqual(bike, before);
  assert.deepEqual(validate(out), []);
  assert.deepEqual(check(out, 'ride-end'), []);
  const fresh = sequenceFromTrace({ ...bike, views: bike.views.filter(v => v.id !== 'ride-end') }, otlpSpans(trace), { match });
  const v = fresh.views[fresh.views.length - 1];
  assert.deepEqual([v.id, v.title, v.parent, v.render, v.edges.length], ['trace', 'trace', 'trips', 'sequence', 8], 'a new view comes last, under the view that shows most of its cards');
});

test('sequenceFromTrace() matches services as replay() does, orders steps by time, and leaves out work inside one card', () => {
  const m = { nodes: [{ id: 'web', label: 'Web' }, { id: 'api', label: 'Orders API' }, { id: 'db', label: 'DB' }], views: [{ id: 'v', nodeIds: ['web', 'api', 'db'] }] };
  const spans = [{ id: '1', service: 'web', start: 0, end: 900, name: 'checkout' }, { id: '2', parent: '1', service: 'orders api', start: 5, end: 1500, name: 'POST /orders' },
    { id: '3', parent: '2', service: 'postgres', start: 30, end: 34.5 }, { id: '4', parent: '2', service: 'orders api', start: 10, end: 20, name: 'validate' },
    { id: '5', parent: '2', service: 'cache', start: 12, end: 13 }, { id: '6', parent: '5', service: 'db', start: 12, end: 13 }, { id: '0', service: 'web', start: 'x', end: 1 }];
  const v = sequenceFromTrace(m, spans, { view: 'checkout', match: { postgres: 'db' } }).views[1];
  assert.deepEqual(v.edges.map(e => [e.from, e.to, e.label, e.sublabel]), [['web', 'api', 'POST /orders', '1.5 s'], ['api', 'db', '4.5 ms', undefined]]);
  assert.deepEqual([v.nodeIds, v.parent, v.caption], [['web', 'api', 'db'], 'v', 'From a trace: 2 calls between cards, in time order, each with its duration. No card for cache.']);
  assert.deepEqual(sequenceFromTrace(m, [], { view: 'none' }).views[1].edges, [], 'no spans: a view with no steps');
});

test('validate() checks lenses, owners and budgets; owner works in rules too', () => {
  const m = { nodes: [{ id: 'a', kind: 'frontend', owner: 'web' }, { id: 'b', owner: 7 }],
    edges: [{ id: 'e', from: 'a', to: 'b', latency: -3, cost: '2' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }],
    rules: [{ id: 'r', from: { owner: 'web' }, to: { owner: 'nobody' } }],
    lenses: [{ id: 'l', title: 'Web', pick: { owner: 'web', line: ['feeds', 'wires'], not: { line: 'calls' } }, color: 'teams' }, { id: 'l' }, { title: 'no id' }, 'x'] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`).sort(), [
    'error lenses[1].id', 'error lenses[2].id', 'error lenses[3]',
    'warning edges[0].cost', 'warning edges[0].latency', 'warning lenses[0].color', 'warning lenses[0].pick.line[1]', 'warning lenses[0].pick.not.line',
    'warning nodes[1].owner', 'warning rules[0].to.owner',
  ]);
  assert.deepEqual(validate({ ...m, lenses: 'none' }).filter(p => p.path.startsWith('lenses')).map(p => p.path), ['lenses']);
  assert.deepEqual(rules({ ...m, rules: [{ id: 'r', from: { owner: 'web' } }] }).map(b => b.targets[0].ids), [['e']]);
  assert.deepEqual(validate(bike), []);
});
