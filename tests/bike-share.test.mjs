// The bike share model, examples/bike-share.json: the one test and bench model, built by tools/bike-share.mjs from its
// part files in tools/bike-share/. The committed model is what the build writes, byte for byte, and so is each part
// file, so neither can drift from the other. The build stops on an id used twice, an unknown key, a view whose id is a
// card's that does not open it, and a new view id starting with "f".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, files, format } from '../tools/bike-share.mjs';
import { validate, rules } from '../lib/umlimator.js';

const read = name => JSON.parse(readFileSync(new URL(`../tools/bike-share/${name}.json`, import.meta.url), 'utf8'));

test('examples/bike-share.json is what tools/bike-share.mjs builds from its part files, byte for byte, and so is each part file', () => {
  const all = files();
  assert.deepEqual(all.filter(f => f.now !== f.text).map(f => f.path), [], 'run node tools/bike-share.mjs');
  assert.equal(all[0].now, build().text);
  assert.deepEqual(all.map(f => f.path).slice(0, 2), ['examples/bike-share.json', 'tools/bike-share/model.json']);
});

test('the built model validates and keeps its rules; the fleet card is battery-service, and no card is named battery', () => {
  const { model } = build();
  assert.deepEqual(validate(model), []);
  assert.deepEqual(rules(model), []);
  assert.deepEqual(model.views.slice(0, 5).map(v => v.id), ['context', 'system', 'trips', 'fleet', 'ride-end']);
  assert.ok(model.nodes.some(n => n.id === 'battery-service' && n.label === 'Battery monitor'));
  assert.ok(!model.nodes.some(n => n.id === 'battery'), 'the id battery is the e-bike block\'s');
});

test('the output is stable: key order and part order come from the build, not from how a part file is written', () => {
  const { model } = build();
  const shuffle = x => Array.isArray(x) ? x.map(shuffle) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, k === 'layout' ? v : shuffle(v)])) : x;
  assert.equal(format(shuffle(model)), build().text);
  assert.throws(() => format({ ...model, nodes: [{ id: 'x', colour: 'red' }] }), /the model\.nodes\[x\] has colour, which KEYS\.node does not place/);
});

test('the build stops on what would break a pin without an error', () => {
  const load = change => name => { const x = read(name); if (name === 'fleet') change(x); return x; };
  const stops = (change, msg) => assert.throws(() => build(load(change)), msg);
  stops(x => x.nodes.push({ id: 'trips', label: 'Again' }), /trips is a card in system and a card in fleet/);
  stops(x => x.edges.push({ id: 's1', from: 'fleet', to: 'trips' }), /s1 is a line in system and a line in fleet/);
  stops(x => x.views.push({ id: 'ops', title: 'Ops', nodeIds: ['ops'] }), /view ops in fleet has the id of a card that does not open it/);
  stops(x => x.views.push({ id: 'flow', title: 'Flow', nodeIds: ['ops'] }), /view flow in fleet starts with "f"/);
  stops(x => x.views.push({ id: 'trips', title: 'Again', nodeIds: ['ops'] }), /view trips is in two parts/);
  stops(x => x.views.push({ id: 'boxes', title: 'Boxes', nodeIds: ['ops'], containers: [{ id: 'fleet-db', nodeIds: ['ops'] }] }), /box fleet-db of view boxes in fleet has a card's id/);
  stops(x => { x.extra = 1; }, /part fleet has extra/);
});
