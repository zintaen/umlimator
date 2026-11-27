// Layout by business flow, step 3 (docs/diagrams/notes/layout-flow.md sections 3 and 12): the model fields arrange, zones,
// flow and zone, checked by validate(), described by the schema and lib/umlimator.d.ts, reported by diff(); from step 4 an
// arranged map view's dependency lines rank nothing (tests/flow-layout.test.mjs), and from step 10 the typed types' that read the flow. bench/models/f12.json is the fixed
// corpus's flow model: it validates clean, and its map views are in bench/expected.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, layout, diff } from '../lib/umlimator-all.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const quiet = f => { const keep = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = keep; } };
const at = (m, path) => validate(m).filter(p => p.path === path).map(p => `${p.level}: ${p.message}`);
const strip = m => { const c = structuredClone(m);
  c.nodes.forEach(n => { delete n.zone; }); c.edges.forEach(e => { delete e.flow; });
  c.views.forEach(v => { delete v.arrange; delete v.zones; Object.values(v.nodeOverrides || {}).forEach(o => { delete o.zone; }); }); return c; };

// what a picture is made of (a geometry's lines carry their model fields, flow among them): every node's box, every line's
// route and label spot, every box's frame, and the bounds
const drawn = g => JSON.stringify([g.bounds, g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null]),
  (g.families || []).map(f => [f.id, f.x, f.y, f.w, f.h])]);
const MAP = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'log', label: 'Log', kind: 'file' }],
  edges: [{ id: 'ab', from: 'a', to: 'b', flow: 'main' }, { id: 'bc', from: 'b', to: 'c', flow: 'main' },
    { id: 'al', from: 'a', to: 'log', kind: 'state', flow: 'dep' }, { id: 'bl', from: 'b', to: 'log', kind: 'state', flow: 'dep' }],
  views: [{ id: 'v', arrange: 'flow', nodeIds: ['a', 'b', 'c', 'log'] }] });

test('the four fields with their listed values validate clean, on a map and on a typed view', () => {
  const m = MAP(); m.nodes[3].zone = 'under'; m.views[0].zones = false; m.views[0].nodeOverrides = { a: { zone: 'first' } };
  assert.deepEqual(validate(m), []);
  const c = { schemaVersion: 2, nodes: [{ id: 'p', type: 'c4.Person', label: 'P', zone: 'first', props: { description: 'Buys.' } }, { id: 's', type: 'c4.SoftwareSystem', label: 'S', props: { description: 'Sells.' } }],
    edges: [{ id: 'r', type: 'c4.Relationship', from: 'p', to: 's', label: 'uses', flow: 'main' }], views: [{ id: 'c', diagram: 'c4.context', title: 'Context', arrange: 'flow', subject: 's', nodeIds: ['p', 's'] }] };
  assert.deepEqual(validate(c), []);
});

test('a value outside the lists is a warning at its path, never an error, and the model still draws', () => {
  const m = MAP(); m.views[0].arrange = 'grid'; m.views[0].zones = 'no'; m.edges[2].flow = 'deps'; m.nodes[0].zone = 'top';
  m.views[0].nodeOverrides = { b: { zone: 1 } }; m.views.push({ id: 'w', nodeIds: ['a', 'b'], edges: [{ from: 'a', to: 'b', flow: true }] });
  assert.deepEqual(at(m, 'views[0].arrange'), ['warning: arrange "grid" is not "flow": the view lays out as without it']);
  assert.deepEqual(at(m, 'views[0].zones'), ['warning: zones "no" is not false (or true, the default): ignored']);
  assert.deepEqual(at(m, 'edges[2].flow'), ['warning: flow "deps" is not "main", "branch" or "dep": read as not given, so the line\'s kind decides its part']);
  assert.deepEqual(at(m, 'views[1].edges[0].flow'), ['warning: flow true is not "main", "branch" or "dep": read as not given, so the line\'s kind decides its part']);
  assert.deepEqual(at(m, 'nodes[0].zone'), ['warning: zone "top" is not "first", "flow", "last" or "under": read as not given, so the type\'s default holds']);
  assert.deepEqual(at(m, 'views[0].nodeOverrides.b.zone'), ['warning: zone 1 is not "first", "flow", "last" or "under": read as not given, so the type\'s default holds']);
  assert.ok(validate(m).every(p => p.level === 'warning'));
  for (const v of m.views) assert.ok(quiet(() => layout(m, v.id)).nodes.length);
  // a typed line's flow and a typed node's zone too
  const t = { schemaVersion: 2, nodes: [{ id: 's', type: 'flow.Terminator', label: 'Start', zone: 'start' }, { id: 'e', type: 'flow.Terminator', label: 'End' }],
    edges: [{ id: 'f', type: 'flow.Flow', from: 's', to: 'e', flow: 'primary' }], views: [{ id: 'v', diagram: 'flowchart', nodeIds: ['s', 'e'] }] };
  assert.deepEqual(validate(t).map(p => p.path), ['nodes[0].zone', 'edges[0].flow']);
});

test('an arranged view\'s main-flow lines that are not one path are warned of: two out, two in, a line that closes a loop', () => {
  const two = MAP(); two.edges.push({ id: 'ac', from: 'a', to: 'c', flow: 'main' });
  assert.deepEqual(validate(two).map(p => `${p.path} ${p.message}`), ['views[0] "A" has 2 main-flow lines out (flow: "main"): a main flow is one path, so the longest path among them is taken',
    'views[0] "C" has 2 main-flow lines in (flow: "main"): a main flow is one path, so the longest path among them is taken']);
  const loop = MAP(); loop.edges.push({ id: 'ca', from: 'c', to: 'a', flow: 'main' });
  assert.deepEqual(validate(loop).map(p => `${p.path} ${p.message}`), ['edges[4] a main-flow line from "C" to "A" closes a loop (the line back ranks nothing): a main flow is one path, never a cycle, so it ends before this line']);
  const marked = MAP(); marked.edges[1].loop = true; // loop: true is the view's loop back, as loopsOf reads it
  assert.deepEqual(validate(marked).map(p => p.path), ['edges[1]']);
  // the same lines in a view that is not arranged: nothing said (the main flow means nothing there)
  const off = MAP(); delete off.views[0].arrange; off.edges.push({ id: 'ac', from: 'a', to: 'c', flow: 'main' }, { id: 'ca', from: 'c', to: 'a', flow: 'main' });
  assert.deepEqual(validate(off), []);
  // a view's own list: only the lines it draws count
  const own = MAP(); own.edges.push({ id: 'ac', from: 'a', to: 'c', flow: 'main' }); own.views[0].edges = ['ab', 'bc', 'al', 'bl'];
  assert.deepEqual(validate(own), []);
});

test('arrange on a type that lays out on its own axis (sequence, timing, mindmap) is a warning', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Lifeline', label: 'P' }], edges: [], views: [{ id: 's', diagram: 'uml.sequence', arrange: 'flow', nodeIds: ['p'], edges: [] }] };
  assert.deepEqual(at(m, 'views[0].arrange'), ['warning: a uml.sequence view lays out on its own axis and does not rank its elements: arrange "flow" changes nothing']);
  const mm = { schemaVersion: 2, nodes: [{ id: 'r', type: 'mindmap.Topic', label: 'Root' }], edges: [], views: [{ id: 'm', diagram: 'mindmap', arrange: 'flow', nodeIds: ['r'] }] };
  assert.ok(at(mm, 'views[0].arrange').some(s => /a mindmap view lays out on its own axis/.test(s)));
});

// audit 66: layout-flow.md section 5.1 says arrange on a structure type (class, ER, component ...) warns and does nothing new;
// validate() said nothing
test('arrange on a type that reads no flow (an ER, a class, an information flow view) is a warning; on one that does, none', () => {
  const er = { schemaVersion: 2, nodes: [{ id: 'a', type: 'er.Entity', label: 'A' }, { id: 'b', type: 'er.Entity', label: 'B' }], edges: [], views: [{ id: 'e', diagram: 'er', arrange: 'flow', nodeIds: ['a', 'b'] }] };
  assert.deepEqual(at(er, 'views[0].arrange'), ['warning: er draws structure, not a flow: arrange "flow" changes nothing']);
  const cl = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }], edges: [], views: [{ id: 'k', diagram: 'uml.class', arrange: 'flow', nodeIds: ['a'] }] };
  assert.deepEqual(at(cl, 'views[0].arrange'), ['warning: uml.class draws structure, not a flow: arrange "flow" changes nothing']);
  // a copy of the information flow example, kept in tests/fixtures/
  const ex = JSON.parse(readFileSync(new URL('./fixtures/order-information-flow.json', import.meta.url), 'utf8')); ex.views[0].arrange = 'flow';
  assert.ok(validate(ex).some(p => p.path === 'views[0].arrange' && /draws structure/.test(p.message)));
  const fc = { schemaVersion: 2, nodes: [{ id: 's', type: 'flow.Terminator', label: 'Start' }], edges: [], views: [{ id: 'f', diagram: 'flowchart', arrange: 'flow', nodeIds: ['s'] }] };
  assert.deepEqual(at(fc, 'views[0].arrange'), []);
});

// audit 68: a state machine and a communication view draw behaviour, not structure; arrange on them still warns that it
// changes nothing, in words that do not call them structure (copies of the examples, kept in tests/fixtures/)
test('arrange on a state machine or a communication view warns that it reads no main flow, not that it draws structure', () => {
  for (const [f, d] of [['order-states.json', 'uml.state-machine'], ['uml-communication.json', 'uml.communication']]) {
    const m = JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8')), i = m.views.findIndex(v => v.diagram === d); m.views[i].arrange = 'flow';
    assert.deepEqual(at(m, `views[${i}].arrange`), [`warning: ${d} draws behaviour with no main flow to read: arrange "flow" changes nothing`], f); }
});

// step 4 (section 5) gives arranged map views their dependency lines; tests/flow-layout.test.mjs holds what they do, and step
// 10 the typed types that read the flow (flowRole, zoneOf), each type's test file what its own do. The rest reads the fields
// still not: a view of a type with neither, and a map view with no dependency line, draw as with the fields taken out
test('a type that reads no flow (a class view), and a map view with no dependency line, draw as with the fields taken out', () => {
  const cl = (id, label) => ({ id, type: 'uml.Class', label, zone: 'first' });
  const k = { schemaVersion: 2, nodes: [cl('a', 'A'), cl('b', 'B'), cl('c', 'C')], edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b', flow: 'main' },
    { id: 'bc', type: 'uml.Association', from: 'b', to: 'c', flow: 'dep' }], views: [{ id: 'k', diagram: 'uml.class', arrange: 'flow', nodeIds: ['a', 'b', 'c'] }] };
  assert.deepEqual(drawn(quiet(() => layout(k, 'k'))), drawn(quiet(() => layout(strip(k), 'k'))));
  const s = MAP(); s.edges = s.edges.filter(e => e.flow !== 'dep'); s.nodes[2].zone = 'last';
  assert.deepEqual(drawn(layout(s, 'v')), drawn(layout(strip(s), 'v')));
});

test('bench/models/f12.json validates clean, holds the views the note lists, and its map views are in bench/expected.json', () => {
  const m = read('../bench/models/f12.json');
  assert.deepEqual(validate(m), []);
  assert.deepEqual(m.views.map(v => v.diagram || 'map').sort(), ['c4.container', 'dfd', 'flowchart', 'gcp', 'map', 'map', 'map', 'map', 'map', 'map', 'map', 'map', 'map', 'map']);
  assert.equal(m.views.filter(v => (v.containers || []).length).length, 5, 'five with boxes');
  const lines = new Map(m.edges.map(e => [e.id, e]));
  for (const v of m.views) assert.ok(m.edges.some(e => e.flow === 'main' && v.nodeIds.includes(e.from) && v.nodeIds.includes(e.to)), `${v.id}: a main flow`);
  assert.ok(lines.size === m.edges.length);
  const expected = read('../bench/expected.json').results;
  for (const v of m.views.filter(x => !x.diagram)) assert.ok(expected[`f12/${v.id}`], `f12/${v.id} in bench/expected.json`);
  assert.ok(!m.views.filter(x => x.diagram).some(v => expected[`f12/${v.id}`]), 'typed views are not timed by bench.py');
});

test('diff() reports a change of arrange, zones, flow and zone: the view, the line, the card, and a card in one view', () => {
  const A = MAP(), say = f => { const B = structuredClone(A); f(B); return diff(A, B); };
  let r = say(B => { delete B.views[0].arrange; });
  assert.deepEqual([r.summary, r.views], [['changes the view v (arrange)'], ['v']]);
  r = say(B => { B.views[0].zones = false; });
  assert.deepEqual([r.summary, r.views], [['changes the view v (zones)'], ['v']]);
  r = say(B => { B.edges[2].flow = 'branch'; });
  assert.deepEqual([r.summary, r.views], [['changes the line from A to Log (flow)'], ['v']]);
  r = say(B => { B.nodes[3].zone = 'last'; });
  assert.deepEqual([r.summary, r.views], [['changes Log (zone)'], ['v']]);
  r = say(B => { B.views[0].nodeOverrides = { log: { zone: 'under' } }; });
  assert.deepEqual([r.summary, r.views], [['changes Log (zone) in the view v'], ['v']]);
  // a typed model's too
  const C = { schemaVersion: 2, nodes: [{ id: 'p', type: 'c4.Person', label: 'P' }, { id: 's', type: 'c4.SoftwareSystem', label: 'S' }],
    edges: [{ id: 'r', type: 'c4.Relationship', from: 'p', to: 's', label: 'uses' }], views: [{ id: 'c', diagram: 'c4.context', subject: 's', nodeIds: ['p', 's'] }] };
  const D = structuredClone(C); D.views[0].arrange = 'flow'; D.edges[0].flow = 'main'; D.nodes[0].zone = 'first';
  assert.deepEqual(diff(C, D).summary.sort(), ['changes P (zone)', 'changes the line from P to S (flow)', 'changes the view c (arrange)']);
});

test('the schema and lib/umlimator.d.ts describe the four fields with the values validate() takes', () => {
  const s = read('../lib/umlimator.schema.json').$defs;
  assert.deepEqual(s.view.properties.arrange.enum, ['flow']);
  assert.equal(s.view.properties.zones.type, 'boolean');
  assert.deepEqual(s.edge.properties.flow.enum, ['main', 'branch', 'dep']);
  assert.deepEqual(s.node.properties.zone.enum, ['first', 'flow', 'last', 'under']);
  assert.deepEqual(s.nodeOverride.properties.zone.enum, ['first', 'flow', 'last', 'under']);
  const d = text('../lib/umlimator.d.ts');
  assert.match(d, /export type FlowRole = 'main' \| 'branch' \| 'dep';/);
  assert.match(d, /export type FlowZone = 'first' \| 'flow' \| 'last' \| 'under';/);
  for (const f of [/\n  zone\?: FlowZone;/, /\n  flow\?: FlowRole;/, /\n  arrange\?: 'flow';/, /\n  zones\?: boolean;/]) assert.match(d, f);
});
