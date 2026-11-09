// paths(), reach(), describe() and otlpSpans(): a view's lines walked and put in words, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paths, reach, describe, otlpSpans } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const bike = read('../examples/bike-share.json');
const brief = refs => refs.map(r => (r.type === 'node' ? r.id : r.ids.join('+')) + (r.distance != null ? '@' + r.distance : ''));

test('paths() lights every card and line on a way from one card to another, forward only', () => {
  assert.deepEqual(brief(paths(bike, 'trips', 'rider-app', 'payments')), ['rider-app', 'trip-api', 'lifecycle', 'fare', 'payments', 't1', 't4', 't5', 't11']);
  assert.deepEqual(paths(bike, 'trips', 'payments', 'rider-app'), [], 'against the lines: none');
  assert.deepEqual(paths(bike, 'trips', 'rider-app', 'nowhere'), []);
  // two ways from a to d, and a branch off the way that leads nowhere near d
  const m = { nodes: ['a', 'b', 'c', 'd', 'x'].map(id => ({ id })), edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'b', to: 'x' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd', 'x'] }] };
  assert.deepEqual(brief(paths(m, 'v', 'a', 'd')), ['a', 'b', 'c', 'd', 'a->b#0', 'a->c#0', 'b->d#0', 'c->d#0'], 'an edge without an id is named as Refs name it');
  assert.throws(() => paths(m, 'nope', 'a', 'd'), /no view/);
});

test('reach() walks forward or backward with each card\'s distance, and stops at depth', () => {
  assert.deepEqual(brief(reach(bike, 'trips', 'pricing', { backward: true })), ['pricing@0', 'fare@1', 'lifecycle@2', 'trip-api@3', 'rider-app@4', 't6@1', 't5@2', 't4@3', 't1@4']);
  assert.deepEqual(brief(reach(bike, 'trips', 'pricing', { backward: true, depth: 1 })), ['pricing@0', 'fare@1', 't6@1']);
  assert.deepEqual(brief(reach(bike, 'trips', 'lifecycle', { depth: 1 })), ['lifecycle@0', 'fare@1', 'trip-repo@1', 'trip-events@1', 't5@1', 't7@1', 't9@1']);
  assert.deepEqual(brief(reach(bike, 'trips', 'payments')), ['payments@0'], 'a card no line leaves');
  assert.deepEqual(reach(bike, 'trips', 'ghost'), []);
});

test('describe() puts a view in sentences, the same each time: cards, boxes, what lines do, steps, cards alone', () => {
  const trips = describe(bike, 'trips');
  assert.equal(trips, describe(structuredClone(bike), 'trips'));
  assert.match(trips, /^Trip service: 12 cards and 11 lines\.\n/);
  assert.match(trips, /\nFare calculator calls Pricing \("price rules", gRPC\) and Payment provider \("charges", REST\)\.\n/);
  assert.match(trips, /\nTrip lifecycle calls Fare calculator \("ride ended"\); reads or writes Trip repository \("saves"\); triggers Event publisher \("each change"\)\./);
  const system = describe(bike, 'system');
  assert.match(system, /\nRides holds Accounts, Trip service, Pricing and Trips database\.\n/);
  assert.match(system, /\nMonitoring reads or writes Rides \("scrapes metrics"\)\./, 'a line to a box names the box');
  assert.match(system, /\nNot connected here: Status page and Feature flags\.$/);
  assert.match(describe(read('../examples/bookshop.json'), 'api'), /\nStep 1: Shoppers calls Shop API \("checks out"\)\.\n/);
});

test('otlpSpans() reads an OTLP JSON trace into spans, in milliseconds', () => {
  const at = ms => String(1700000000000n * 1000000n + BigInt(ms) * 1000000n);
  const otlp = { resourceSpans: [
    { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'trip-api' } }] },
      scopeSpans: [{ spans: [{ spanId: 'a1', parentSpanId: '', name: 'end ride', startTimeUnixNano: at(5), endTimeUnixNano: at(175) }] }] },
    { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'pricing' } }] },
      instrumentationLibrarySpans: [{ spans: [{ spanId: 'b2', parentSpanId: 'a1', name: 'GetPrice', startTimeUnixNano: at(25), endTimeUnixNano: at(60) }] }] }] };
  const spans = otlpSpans(otlp);
  assert.deepEqual(spans.map(s => [s.id, s.parent, s.service, s.name, s.end - s.start]), [['a1', null, 'trip-api', 'end ride', 170], ['b2', 'a1', 'pricing', 'GetPrice', 35]]);
  assert.deepEqual(otlpSpans(null), []);
});
