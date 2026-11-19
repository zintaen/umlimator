// The bike share model, examples/bike-share.json: the one test and bench model, built by tools/bike-share.mjs from its
// part files in tools/bike-share/. The committed model is what the build writes, byte for byte, and so is each part
// file, so neither can drift from the other. The build stops on an id used twice, an unknown key, a view whose id is a
// card's (but trips and fleet), a new view id starting with "f", and a new view that lists accounts, flags or payments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, files, format, KEYS, INNER } from '../tools/bike-share.mjs';
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

test('the key order of every object of a known kind comes from the build, not from how a part file is written', () => {
  const { model } = build();
  // reverses the keys of each object of a known kind, every level down; a map (layout, props, nodeOverrides' ids) keeps its order
  const shuffle = (x, kind) => Array.isArray(x) ? x.map(y => shuffle(y, kind))
    : !x || typeof x !== 'object' ? x
    : kind === 'overrides' ? Object.fromEntries(Object.entries(x).map(([id, o]) => [id, shuffle(o, 'node')]))
    : KEYS[kind] ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, INNER[kind]?.[k] ? shuffle(v, INNER[kind][k]) : v])) : x;
  const shuffled = shuffle(model, 'file');
  assert.notDeepEqual(Object.keys(shuffled.nodes[0]), Object.keys(model.nodes[0]));
  assert.equal(format(shuffled), build().text);
  const props = format({ nodes: [{ props: { b: 1, a: 2 }, id: 'x' }] });
  assert.match(props, /"id": "x", "props": \{ "b": 1, "a": 2 \}/, 'a props map keeps its order');
  assert.throws(() => format({ ...model, nodes: [{ id: 'x', colour: 'red' }] }), /the model\.nodes\[x\] has colour, which KEYS\.node does not place/);
});

test('the build stops on what would break a pin without an error', () => {
  const load = (change, part = 'fleet') => name => { const x = read(name); if (name === part) change(x); return x; };
  const stops = (change, msg, part) => assert.throws(() => build(load(change, part)), msg);
  stops(x => x.nodes.push({ id: 'trips', label: 'Again' }), /trips is a card in system and a card in fleet/);
  stops(x => x.edges.push({ id: 's1', from: 'fleet', to: 'trips' }), /s1 is a line in system and a line in fleet/);
  stops(x => x.views.push({ id: 'ops', title: 'Ops', nodeIds: ['ops'] }), /view ops in fleet has a card's id; only trips and fleet may/);
  stops(x => { x.nodes.find(n => n.id === 'ops').opensView = 'ops'; x.views.push({ id: 'ops', title: 'Ops', nodeIds: ['ops'] }); },
    /view ops in context has a card's id; only trips and fleet may/, 'context'); // a card that opens it is no way out: trace still refuses the id
  stops(x => x.views.push({ id: 'gateway', title: 'G', nodeIds: [] }, { id: 'feed', title: 'Feed', nodes: [{ id: 'gateway', label: 'Gateway' }] }),
    /view gateway in fleet has a card's id/); // a view's own card counts
  stops(x => x.views.push({ id: 'dock', title: 'D', nodes: [{ id: 'gw', label: 'Gateway', colour: 'red' }] }), /part fleet\.views\[dock\]\.nodes\[gw\] has colour/);
  stops(x => x.views.push({ id: 'shop', title: 'Shop', nodeIds: ['riders', 'payments', 'accounts'] }), /view shop in fleet lists payments, accounts, which diff's views == \["system"\] pin/);
  stops(x => x.views.push({ id: 'flow', title: 'Flow', nodeIds: ['ops'] }), /view flow in fleet starts with "f"/);
  stops(x => x.views.push({ id: 'trips', title: 'Again', nodeIds: ['ops'] }), /view trips is in two parts/);
  stops(x => x.views.push({ id: 'boxes', title: 'Boxes', nodeIds: ['ops'], containers: [{ id: 'fleet-db', nodeIds: ['ops'] }] }), /box fleet-db of view boxes in fleet has a card's id/);
  stops(x => x.views.push({ id: 'bx', title: 'B', nodeIds: [], containers: [{ id: 'b1', nodeIds: [] }, { id: 'b1', nodeIds: [] }] }), /box b1 is in view bx twice \(fleet\)/);
  stops(x => { x.nodes[0].members = [{ id: 'm1' }, { id: 'm1' }]; }, /m1 is a member of .* and a member of/);
  stops(x => x.views.push({ id: 'vv', title: 'V', nodeIds: [], edges: [{ id: 's1', from: 'a', to: 'b' }] }), /s1 is a line in system and a line of view vv in fleet/);
  stops(x => x.views.push({ id: 'vv', title: 'V', nodeIds: [], containers: [{ id: 's1', nodeIds: [] }] }), /box s1 of view vv in fleet is a line in system too/);
  stops(x => { x.nodes[0].colour = 'red'; }, /part fleet\.nodes\[.*\] has colour, which KEYS\.node does not place/);
  stops(x => { x.extra = 1; }, /part fleet has extra/);
  const head = change => name => { const x = read(name); if (name === 'model') change(x); return x; };
  assert.throws(() => build(head(x => { x.nodes = []; })), /holds nodes: they belong in a part file/);
  assert.throws(() => build(head(x => { x.parts = []; })), /names no parts/);
});
