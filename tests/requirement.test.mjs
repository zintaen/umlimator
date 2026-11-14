// The requirement diagram, sysml.requirement (work package M3.2, notes/milestone-3.md §6, §13): the type's definition, an inline
// copy of 16-requirement.json laid out clean down and right in its frame with each owner above (or left of) what it contains,
// a package subject as the frame and a package in it as a box, the requirement compartment's wrapped text, the derived
// containment lines and their crosshair, names, reading order, the legend, describe(), every rule of §6.3 with a passing
// and a failing fixture, the editing hooks (add, connect, rename, remove), the PDF's rows, words and texts, a 30-step session
// saved and reopened, and the common edits' times. tests/requirement.html draws it in a browser and edits it by pointer and
// keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { SHAPE } from '../src/draw/shapes.js';
import { textW } from '../src/core/text.js';
import { rqWrap } from '../src/sysml/requirement.js';

const T = diagramOf({ diagram: 'sysml.requirement' }), V = 'requirements';
const R = (id, label, parent, reqId, text, more = {}) => ({ id, type: 'sysml.Requirement', label, ...(parent ? { parent } : {}), props: { reqId, text }, ...more });
const L = (id, type, from, to) => ({ id, type: 'sysml.' + type, from, to });
const CUT = 'Assistance shall fall away progressively and stop when the bike reaches 25 km/h.';
// an inline copy of docs/diagrams/examples/16-requirement.json (M3.7 moves the file)
const M16 = { schemaVersion: 2, title: 'E-bike: requirements', root: V, nodes: [
  R('spec', 'E-bike specification', null, 'EB-1', 'The e-bike shall serve as a shared city bike that riders hire from a dock and return to a dock.'),
  R('assist', 'Pedal assistance', 'spec', 'EB-1.1', 'The motor shall assist the rider only while the rider is pedalling.'),
  R('cut-off', 'Assistance cut-off', 'assist', 'EB-1.1.1', CUT),
  R('range', 'Range', 'spec', 'EB-1.2', 'A full charge shall give at least 60 km of assisted riding.'),
  R('docking', 'Docking', 'spec', 'EB-1.3', 'The e-bike shall lock into a dock when it is returned and shall charge while it is docked.'),
  R('lock-time', 'Locking time', 'docking', 'EB-1.3.1', 'The dock shall lock the e-bike within 2 s of the bike being pushed in.'),
  R('capacity', 'Battery capacity', null, 'BAT-1', 'The battery shall store at least 500 Wh.'),
  R('assist-curve', 'Assistance curve', null, 'CTL-1', 'Assistance shall follow pedal torque and shall not exceed 250 W of continuous power.'),
  R('legal-speed', 'Maximum assisted speed', null, 'REG-3', CUT),
  R('availability', 'All-day availability', null, 'CITY-4', 'A bike shall last a full day of hires on one charge.'),
  { id: 'battery', type: 'sysml.Block', label: 'Battery' }, { id: 'controller', type: 'sysml.Block', label: 'Controller' }, { id: 'dock', type: 'sysml.Block', label: 'Dock' },
  { id: 'range-ride', type: 'sysml.TestCase', label: 'Range ride on the test circuit' }, { id: 'roller-test', type: 'sysml.TestCase', label: 'Cut-off speed on the rollers' },
  { id: 'why-500', type: 'uml.Comment', label: '60 km at 7 Wh/km takes 420 Wh; 500 Wh keeps 15 % in reserve', props: { stereotypes: ['rationale'] } }],
edges: [L('capacity-from-range', 'DeriveReqt', 'capacity', 'range'), L('curve-refines-assist', 'Refine', 'assist-curve', 'assist'), L('range-traces-availability', 'Trace', 'range', 'availability'),
  L('cut-off-copies-legal-speed', 'Copy', 'cut-off', 'legal-speed'), L('battery-satisfies-capacity', 'Satisfy', 'battery', 'capacity'), L('controller-satisfies-cut-off', 'Satisfy', 'controller', 'cut-off'),
  L('dock-satisfies-lock-time', 'Satisfy', 'dock', 'lock-time'), L('ride-verifies-range', 'Verify', 'range-ride', 'range'), L('rollers-verify-cut-off', 'Verify', 'roller-test', 'cut-off'),
  { id: 'why-500-link', type: 'uml.CommentLink', from: 'why-500', to: 'capacity' }],
views: [{ id: V, diagram: 'sysml.requirement', title: 'E-bike requirements', parent: null, direction: 'down',
  nodeIds: ['spec', 'assist', 'cut-off', 'range', 'docking', 'lock-time', 'capacity', 'assist-curve', 'legal-speed', 'availability', 'battery', 'controller', 'dock', 'range-ride', 'roller-test', 'why-500'] }] };
const OWNED = [['spec', 'assist'], ['assist', 'cut-off'], ['spec', 'range'], ['spec', 'docking'], ['docking', 'lock-time']];
const look = (m, direction) => { const c = structuredClone(m); c.views.forEach(v => { v.direction = direction; }); return c; };
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const unid = s => s.replace(/\bg\d+-/g, 'g-');
// a package subject's model: E-bike holds A (holding B), a block, and the package Regulation (holding C, holding D)
const N = (id, type, label, more = {}) => ({ id, type, label, ...more });
const PKG = { schemaVersion: 2, title: 'T', nodes: [N('eb', 'uml.Package', 'E-bike'), N('reg', 'uml.Package', 'Regulation', { parent: 'eb' }),
  R('a', 'A', 'eb', 'A-1', 'a'), R('b', 'B', 'a', 'B-1', 'b'), R('c', 'C', 'reg', 'C-1', 'c'), R('d', 'D', 'c', 'D-1', 'd'), N('blk', 'sysml.Block', 'Blk', { parent: 'eb' })],
edges: [L('s', 'Satisfy', 'blk', 'b'), L('t', 'Trace', 'd', 'a')],
views: [{ id: 'v', diagram: 'sysml.requirement', subject: 'eb', title: 'Reqs', nodeIds: ['eb', 'reg', 'a', 'b', 'c', 'd', 'blk'] }] };

test('the definition: sysml.requirement is registered with its palette, its lines (Containment first), its fields, its hooks and the twenty rules of §6.3', () => {
  assert.equal(T.name, 'sysml.requirement');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['sysml.Requirement', 'Requirement'], ['sysml.TestCase', 'Test case'], ['sysml.Block', 'Block'], ['uml.Package', 'Package'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => e.label), ['Containment', 'Derive', 'Satisfy', 'Verify', 'Refine', 'Trace', 'Copy', 'Comment link']);
  assert.deepEqual(T.props['sysml.Requirement'].map(f => [f.key, f.kind, f.options]), [['reqId', 'text', undefined], ['text', 'text', undefined], ['risk', 'enum', ['low', 'medium', 'high']],
    ['verifyMethod', 'enum', ['analysis', 'inspection', 'test', 'demonstration']], ['stereotypes', 'list', undefined]]);
  assert.equal(T.layout.rank, false, 'the type ranks itself, containment among its links (§6.1)');
  for (const k of ['layout', 'boxes', 'validate', 'describe', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'remove', 'rename']);
  assert.deepEqual(Object.keys(T.rules).sort(), ['copy-ends', 'copy-text', 'derive-cycle', 'derive-ends', 'refine-ends', 'requirement-association', 'requirement-general', 'requirement-id',
    'requirement-members', 'requirement-nested', 'requirement-owner', 'requirement-text', 'requirement-typing', 'risk-value', 'satisfy-ends', 'satisfy-from', 'trace-ends', 'verify-ends', 'verify-from', 'verify-method']);
  assert.ok(!validate(M16).some(p => /not drawn by this release/.test(p.message)), 'the view is drawn by this release');
});

test('16-requirement.json lays out clean down and right in its frame, each owner above (down) or left of (right) what it contains', () => {
  assert.deepEqual(validate(M16), []);
  for (const direction of ['down', 'right']) {
    const m = look(M16, direction), g = layout(m, V), [F] = g.families;
    assert.deepEqual(check(m, V).map(p => p.message), [], direction);
    assert.equal(g.families.length, 1); assert.deepEqual([F.id, F.shape, F.title], ['requirements->frame', 'sysml-frame', 'req [Model] E-bike: requirements [E-bike requirements]']);
    assert.equal(g.nodes.length, 16); g.nodes.forEach(n => assert.ok(inside(n, F), `${direction}: ${n.id} in the frame`));
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${direction}: ${p.id} and ${q.id} overlap`);
    for (const [o, c] of OWNED) { const a = g.byId[o], b = g.byId[c]; assert.ok(direction === 'down' ? a.y + a.h < b.y : a.x + a.w < b.x, `${direction}: ${o} before ${c}`); }
    // the relationships' suppliers first too: what satisfies, verifies, derives, refines or is traced comes after
    for (const e of M16.edges.filter(x => x.type !== 'uml.CommentLink')) { const s = g.byId[e.to], c = g.byId[e.from]; assert.ok(direction === 'down' ? s.y < c.y : s.x < c.x, `${direction}: ${e.id}`); }
    console.log(`# 16-requirement.json, ${direction}: ${g.nodes.length} nodes, ${g.edges.length} lines, frame ${Math.round(F.w)} × ${Math.round(F.h)}`);
  }
  assert.equal(layout(look(M16, undefined), V).byId.spec.y < layout(look(M16, undefined), V).byId.assist.y, true, 'down by default (§6.1)');
});

test('a package subject is the frame, not a box or a card; a package it holds is a box in it, holding its requirements and what they contain', () => {
  for (const direction of ['down', 'right']) {
    const m = look(PKG, direction), g = layout(m, 'v'), F = g.families.find(f => f.id === 'eb'), B = g.families.find(f => f.id === 'reg');
    assert.deepEqual(check(m, 'v').map(p => p.message), [], direction);
    assert.deepEqual([F.shape, F.title, F.parent, B.shape, B.parent, B.title], ['sysml-frame', 'req [Package] E-bike [Reqs]', undefined, 'package', 'eb', 'Regulation']);
    assert.deepEqual(g.nodes.map(n => n.id), ['a', 'b', 'c', 'd', 'blk'], 'no card for either package');
    assert.ok(inside(B, F) && ['c', 'd'].every(id => inside(g.byId[id], B)) && ['a', 'b', 'blk'].every(id => inside(g.byId[id], F) && !meets(g.byId[id], B)), direction);
    assert.deepEqual(g.edges.map(e => [e.id, e.end.to]), [['s', 'open'], ['t', 'open'], ['a->b', 'crosshair'], ['c->d', 'crosshair']]);
  }
  assert.deepEqual(T.boxes(PKG, PKG.views[0]).map(b => [b.id, b.parent ?? null]), [['eb', null], ['reg', 'eb']], 'the canvas drops into the frame and the box');
  assert.deepEqual(validate(PKG), []);
  assert.match(svgOf(layout(PKG, 'v')), /<g class="family" data-family="eb" role="img" aria-label="Requirement diagram of package E-bike: Reqs">/);
});

test('a requirement: «requirement» over its name, one compartment of its id, its text wrapped at 224 px, its risk and verify method; capped by present.rows, hidden by collapsed', () => {
  const g = layout(M16, V), n = g.byId.spec;
  assert.deepEqual([n.shape, n.stereotypes, n.compartments.map(c => c.name)], ['classifier', ['requirement'], ['requirement']]);
  assert.deepEqual(n.compartments[0].members.map(r => r.label), ['id = "EB-1"', 'text = "The e-bike shall serve as', 'a shared city bike that riders', 'hire from a dock and return to a', 'dock."']);
  const long = 'word '.repeat(120).trim(), rows = rqWrap(`text = "${long}"`);
  assert.ok(rows.length > 10 && rows.every(r => textW(r, 11) <= 224), 'every row within 224 px');
  assert.equal(rows.join(' '), `text = "${long}"`, 'nothing lost');
  const wide = rqWrap('x'.repeat(80)); assert.ok(wide.length === 1 && textW(wide[0], 11) <= 224 && wide[0].endsWith('…'), 'a word wider than 224 px is cut there');
  const m = structuredClone(M16); Object.assign(m.nodes[0].props, { text: long, risk: 'high', verifyMethod: 'test' }); m.nodes[0].props.stereotypes = ['functionalRequirement'];
  const big = layout(m, V).byId.spec, members = big.compartments[0].members.map(r => r.label);
  assert.deepEqual([members.at(-2), members.at(-1)], ['risk = high', 'verifyMethod = test']);
  assert.deepEqual(big.stereotypes, ['requirement', 'functionalRequirement']);
  assert.ok(big.h > n.h + 100 && big.w <= 320, 'a long text makes a tall box, no wider than the classifier allows');
  m.views[0].present = { spec: { rows: 3 } };
  const capped = layout(m, V).byId.spec, s = svgOf({ nodes: [capped], edges: [], groups: [], bounds: { x: 0, y: 0, w: 400, h: 400 }, byId: { spec: capped } });
  assert.match(s, />\+\d+ more<\/text>/); assert.ok(capped.h < big.h);
  m.views[0].present = { spec: { collapsed: ['requirement'] } };
  const shut = layout(m, V).byId.spec; assert.ok(!svgOf({ nodes: [shut], edges: [], groups: [], bounds: { x: 0, y: 0, w: 400, h: 400 }, byId: { spec: shut } }).includes('c-comp'), 'collapsed: no compartment');
  // a test case, a block, a comment's stereotypes first
  assert.deepEqual([g.byId['range-ride'].stereotypes, g.byId['range-ride'].compartments, g.byId.battery.stereotypes, g.byId.battery.compartments], [['testCase'], [], ['block'], []]);
  assert.deepEqual([g.byId['why-500'].shape, g.byId['why-500'].label], ['note', '«rationale» 60 km at 7 Wh/km takes 420 Wh; 500 Wh keeps 15 % in reserve']);
  assert.equal(SHAPE.classifier.size(g.byId.spec).h, n.h);
});

test('containment (§6.2): a requirement owned by a shown requirement is joined to it by a derived line, crosshair at the owner, never stored; none when the owner is hidden', () => {
  const g = layout(M16, V), c = g.edges.filter(e => e.type === 'containment');
  assert.deepEqual(c.map(e => [e.id, e.from, e.to, e.end]), OWNED.map(([o, k]) => [`${o}->${k}`, k, o, { from: 'none', to: 'crosshair' }]));
  assert.equal(c[0].aria, 'Containment of requirement Pedal assistance in requirement E-bike specification');
  assert.match(svgOf(g), /marker-end="url\(#g\d+-crosshair-d\)"/);
  const hid = apply(M16, [{ op: 'hide', id: 'assist', view: V }]);
  assert.deepEqual(layout(hid, V).edges.filter(e => e.type === 'containment').map(e => e.id), ['spec->range', 'spec->docking', 'docking->lock-time'], 'cut-off\'s owner hidden: no line');
  assert.equal(JSON.stringify(M16.edges).includes('->'), false);
});

test('Delete and Shift + Delete on a containment line re-home the child to its owner\'s owner, said; one in a package stays in it; any other selection is the canvas\'s', () => {
  for (const fromModel of [false, true]) {
    const r = T.edits.remove(M16, M16.views[0], ['assist->cut-off'], fromModel);
    assert.deepEqual(r, { commands: [{ op: 'reparent', id: 'cut-off', parent: 'spec' }], say: 'Assistance cut-off is no longer contained in Pedal assistance' });
    const m = apply(M16, r.commands); assert.equal(m.nodes.find(n => n.id === 'cut-off').parent, 'spec');
    assert.ok(layout(m, V).edges.some(e => e.id === 'spec->cut-off'), 'now contained in the owner\'s owner');
  }
  assert.deepEqual(T.edits.remove(M16, M16.views[0], ['spec->range'], false).commands, [{ op: 'reparent', id: 'range', parent: null }]);
  assert.deepEqual(T.edits.remove(PKG, PKG.views[0], ['a->b'], false).commands, [{ op: 'reparent', id: 'b', parent: 'eb' }], 'into the package');
  for (const ids of [['spec'], ['assist->range'], ['assist->cut-off', 'spec'], []]) assert.equal(T.edits.remove(M16, M16.views[0], ids, false), null, String(ids));
  for (const ids of [['battery'], ['battery', 'why-500'], ['availability']]) assert.deepEqual(T.edits.remove(M16, M16.views[0], ids, true), ids.includes('availability') ? { commands: [{ op: 'delete', id: 'availability' }], say: null } : null, String(ids));
});
test('Shift + Delete on a requirement or a package deletes it and moves what it holds to its nearest owner left (§6.4); the core alone would take it along', () => {
  const v = M16.views[0], r = T.edits.remove(M16, v, ['assist'], true);
  assert.deepEqual(r, { commands: [{ op: 'reparent', id: 'cut-off', parent: 'spec' }, { op: 'delete', id: 'assist' }], say: '1 element kept, moved to the owner' });
  const m = apply(M16, r.commands); assert.equal(m.nodes.find(n => n.id === 'cut-off').parent, 'spec'); assert.ok(!m.nodes.some(n => n.id === 'assist'));
  assert.ok(!apply(M16, [{ op: 'delete', id: 'assist' }]).nodes.some(n => n.id === 'cut-off'), 'the core\'s delete takes it along');
  assert.deepEqual(T.edits.remove(M16, v, ['spec', 'assist'], true).commands, [{ op: 'reparent', id: 'cut-off', parent: null }, { op: 'reparent', id: 'range', parent: null }, { op: 'reparent', id: 'docking', parent: null },
    { op: 'delete', id: 'spec' }, { op: 'delete', id: 'assist' }]);
  assert.deepEqual(T.edits.remove(PKG, PKG.views[0], ['reg'], true).commands, [{ op: 'reparent', id: 'c', parent: 'eb' }, { op: 'delete', id: 'reg' }], 'a package\'s requirements stay in its owner');
  assert.deepEqual(T.edits.remove(M16, v, ['assist->cut-off', 'docking'], true).commands, [{ op: 'reparent', id: 'cut-off', parent: 'spec' }, { op: 'reparent', id: 'lock-time', parent: 'spec' }, { op: 'delete', id: 'docking' }]);
});

test('names, reading order, legend and describe() (§13): the frame named, each requirement by its id and text, lines by their kind and ends', () => {
  const g = layout(M16, V), s = svgOf(g);
  assert.equal(g.byId.assist.aria, 'Requirement Pedal assistance, EB-1.1: The motor shall assist the rider only while the rider is pedalling.');
  assert.match(s, /data-shape="classifier" tabindex="-1" role="img" aria-label="Requirement Pedal assistance, EB-1.1: The motor shall assist the rider only while the rider is pedalling."/);
  assert.equal(g.byId['range-ride'].aria, 'Test case Range ride on the test circuit');
  assert.equal(g.byId['why-500'].aria, 'Comment (rationale): 60 km at 7 Wh/km takes 420 Wh; 500 Wh keeps 15 % in reserve');
  assert.equal(g.edges.find(e => e.id === 'controller-satisfies-cut-off').aria, 'Satisfy from block Controller to requirement Assistance cut-off');
  assert.equal(g.edges.find(e => e.id === 'controller-satisfies-cut-off').label, '«satisfy»');
  assert.match(s, /aria-label="Requirement diagram of model E-bike: requirements: E-bike requirements"/);
  // reading order: the cards by their places, top to bottom (down: rank by rank), then left to right, then the lines
  const ys = g.order.slice(0, 16).map(id => g.byId[id]); assert.ok(ys.every((n, i) => !i || ys[i - 1].col < n.col || (ys[i - 1].col === n.col && ys[i - 1].row <= n.row) && ys[i - 1].x < n.x));
  const r = layout(look(M16, 'right'), V), rs = r.order.slice(0, 16).map(id => r.byId[id]); assert.ok(rs.every((n, i) => !i || rs[i - 1].row < n.row || (rs[i - 1].row === n.row && rs[i - 1].x < n.x)), 'right: row by row');
  assert.deepEqual(g.order.slice(16), g.edges.map(e => e.id)); assert.equal(g.byId[g.order[0]].col, 0);
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Derive «deriveReqt»', 'Satisfy «satisfy»', 'Verify «verify»', 'Refine «refine»', 'Trace «trace»', 'Copy «copy»', 'Containment', 'Comment link']);
  assert.match(g.legend[6], /<path d="M14 8A6 6 0 1 0 26 8/);
  const d = describe(M16, V).split('\n');
  assert.equal(d[0], 'E-bike requirements: a requirement diagram (req [Model] E-bike: requirements [E-bike requirements]) of 16 elements and 15 lines.');
  assert.equal(d[3], 'Requirement Assistance cut-off, EB-1.1.1: Assistance shall fall away progressively and stop when the bike reaches 25 km/h.; contained in Pedal assistance; copies Maximum assisted speed; satisfied by Controller; verified by Cut-off speed on the rollers.');
  assert.equal(d.length, 17);
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (§2.4)', () => {
  const memos = {}, first = mapContext(M16, { memos }).buildView(V), second = mapContext(M16, { memos }).buildView(V);
  assert.equal(memos[V].runs, 1); assert.equal(unid(second.markup), unid(first.markup));
});

test('a pin wins: a card pinned keeps its cell, and one ranked onto it goes down a row', () => {
  const m = structuredClone(M16); m.views[0].layout = { battery: [0, 0] };
  const g = layout(m, V); assert.deepEqual([g.byId.battery.col, g.byId.battery.row], [0, 0]);
  assert.ok(!g.nodes.some(n => n.id !== 'battery' && n.col === 0 && n.row === 0));
  assert.deepEqual(check(m, V).filter(p => /overlap/.test(p.message)), []);
});

// ---- §6.3: every rule, a passing and a failing fixture; a failure names its rule and its elements, at its level
const find = (m, id) => m.nodes.find(n => n.id === id);
const BREAKS = {
  'requirement-owner': [m => { find(m, 'capacity').parent = 'battery'; }, ['capacity', 'battery'], 'warning'],
  'requirement-nested': [m => { find(m, 'battery').parent = 'range'; }, ['battery', 'range'], 'error'],
  'requirement-members': [m => { find(m, 'range').members = [{ id: 'range.x', type: 'uml.Property', label: 'x' }]; }, ['range'], 'error'],
  'requirement-general': [m => { m.edges.push({ id: 'g', type: 'uml.Generalization', from: 'capacity', to: 'range' }); }, ['g', 'capacity', 'range'], 'error'],
  'requirement-association': [m => { m.edges.push({ id: 'as', type: 'uml.Association', from: 'battery', to: 'range' }); }, ['as', 'battery', 'range'], 'error'],
  'requirement-typing': [m => { find(m, 'battery').members = [{ id: 'battery.r', type: 'sysml.ValueProperty', label: 'r', props: { valueType: '~Range' } }]; }, ['battery.r', 'range'], 'error'],
  'requirement-id': [m => { find(m, 'availability').props.reqId = 'BAT-1'; }, ['capacity', 'availability'], 'warning'],
  'requirement-text': [m => { delete find(m, 'availability').props.text; }, ['availability'], 'warning'],
  'derive-ends': [m => { m.edges.push(L('x', 'DeriveReqt', 'battery', 'range')); }, ['x', 'battery', 'range'], 'error'],
  'derive-cycle': [m => { m.edges.push(L('x', 'DeriveReqt', 'range', 'capacity')); }, ['range', 'capacity', 'x'], 'warning'],
  'copy-ends': [m => { m.edges.push(L('x', 'Copy', 'battery', 'legal-speed')); }, ['x', 'battery', 'legal-speed'], 'error'],
  'copy-text': [m => { find(m, 'legal-speed').props.text = 'Assistance shall stop at 25 km/h.'; }, ['cut-off-copies-legal-speed', 'cut-off', 'legal-speed'], 'error'],
  'satisfy-ends': [m => { m.edges.push(L('x', 'Satisfy', 'battery', 'dock')); }, ['x', 'battery', 'dock'], 'error'],
  'verify-ends': [m => { m.edges.push(L('x', 'Verify', 'range-ride', 'dock')); }, ['x', 'range-ride', 'dock'], 'error'],
  'satisfy-from': [m => { m.edges.push(L('x', 'Satisfy', 'assist-curve', 'assist')); }, ['x', 'assist-curve', 'assist'], 'warning'],
  'verify-from': [m => { m.edges.push(L('x', 'Verify', 'battery', 'range')); }, ['x', 'battery', 'range'], 'warning'],
  'refine-ends': [m => { m.edges.push(L('x', 'Refine', 'battery', 'dock')); }, ['x', 'battery', 'dock'], 'warning'],
  'trace-ends': [m => { m.edges.push(L('x', 'Trace', 'range-ride', 'dock')); }, ['x', 'range-ride', 'dock'], 'warning'],
  'risk-value': [m => { find(m, 'range').props.risk = 'severe'; }, ['range'], 'warning'],
  'verify-method': [m => { find(m, 'range').props.verifyMethod = 'guess'; }, ['range'], 'warning'],
};
test('validators: 16 breaks no rule (copy-text passes on it); each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(M16), []);
  assert.deepEqual(Object.keys(BREAKS).sort(), Object.keys(T.rules).sort());
  for (const [rule, [broke, ids, level]] of Object.entries(BREAKS)) {
    const m = structuredClone(M16); broke(m); const got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    assert.match(got[0].message, new RegExp('^' + rule + ': ')); assert.equal(got[0].level, level, rule);
    assert.deepEqual([...got[0].ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === got[0].path), `${rule}: in validate()`);
  }
  // the passing side of the conditional rules: what SysML allows
  const ok = structuredClone(M16);
  Object.assign(find(ok, 'range').props, { risk: 'high', verifyMethod: 'test' }); find(ok, 'capacity').parent = 'assist'; // a requirement in a requirement
  ok.nodes.push(N('pk', 'uml.Package', 'Specs'), N('w', 'uml.Comment', 'about it', { parent: 'range' })); find(ok, 'availability').parent = 'pk'; // in a package; a comment in a requirement
  find(ok, 'battery').members = [{ id: 'battery.c', type: 'sysml.ValueProperty', label: 'c', props: { valueType: 'Energy' } }];
  ok.edges.push(L('r2', 'Refine', 'battery', 'range'), L('t2', 'Trace', 'range', 'dock'), { id: 'g2', type: 'uml.Generalization', from: 'battery', to: 'dock' });
  assert.deepEqual(T.validate(ok), []);
  // a derive to itself is warned once; a missing end is the core's
  const self = structuredClone(M16); self.edges.push(L('x', 'DeriveReqt', 'range', 'range'));
  assert.deepEqual(T.validate(self).map(p => p.message), ['derive-cycle: requirement "Range" → requirement "Range" derives a requirement from itself (x)']);
  const gone = structuredClone(M16); gone.edges.push(L('x', 'Satisfy', 'battery', 'nowhere')); assert.deepEqual(T.validate(gone), []);
  const sat = structuredClone(M16); BREAKS['satisfy-ends'][0](sat);
  assert.equal(T.validate(sat)[0].message, 'satisfy-ends: x runs from block "Battery" to block "Dock": a satisfy runs to a requirement');
});

// ---- §6.4: editing hooks (tests/requirement.html drives each by pointer and key)
test('add: a requirement goes into the requirement or package selected, else the frame\'s package, else none, with no id, said; the rest is the canvas\'s', () => {
  const add = (m, sel, label = 'Brakes') => T.edits.add(m, m.views[0], { type: 'sysml.Requirement' }, label, sel && { sel });
  assert.deepEqual(add(M16, ['range']), { commands: [{ op: 'add', element: { id: 'requirement1', type: 'sysml.Requirement', label: 'Brakes', parent: 'range' }, view: V }],
    say: 'Requirement added in Range with no id: F2 with "EB-2 Brakes" sets its id and name' });
  assert.deepEqual(add(M16, ['battery']).commands[0].element, { id: 'requirement1', type: 'sysml.Requirement', label: 'Brakes' });
  assert.deepEqual(add(M16, null).commands[0].element.parent, undefined);
  assert.equal(add(PKG, ['reg']).commands[0].element.parent, 'reg');
  assert.equal(add(PKG, ['blk']).commands[0].element.parent, 'eb', 'the frame\'s package');
  assert.equal(add(PKG, null, '').commands[0].element.label, undefined);
  const m = apply(M16, add(M16, ['range']).commands);
  assert.ok(layout(m, V).edges.some(e => e.id === 'range->requirement1')); assert.deepEqual(T.validate(m).map(p => p.rule), ['requirement-text']);
  for (const t of ['sysml.Block', 'sysml.TestCase', 'uml.Package', 'uml.Comment']) assert.equal(T.edits.add(M16, M16.views[0], { type: t }, 'x', null), null, t);
});

test('connect: Containment re-owns; a relationship breaking §6.3\'s errors is refused in the rule\'s words; a copy takes its supplier\'s text in one transaction', () => {
  const v = M16.views[0], c = (from, to, type) => T.edits.connect(M16, v, from, to, null, { type, label: type });
  assert.deepEqual(c('capacity', 'range', 'containment'), [{ op: 'reparent', id: 'capacity', parent: 'range' }]);
  assert.deepEqual(c('availability', 'pk', 'containment'), { error: 'Containment runs from a requirement to the requirement or package that holds it' });
  assert.deepEqual(c('spec', 'cut-off', 'containment'), { error: 'Assistance cut-off is inside E-bike specification: it cannot hold it' });
  assert.deepEqual(c('battery', 'range', 'containment'), { error: 'Containment runs from a requirement to the requirement or package that holds it' });
  assert.deepEqual(c('dock', 'docking', 'sysml.Satisfy'), [{ op: 'add', element: { id: 'satisfy1', type: 'sysml.Satisfy', from: 'dock', to: 'docking' }, view: V }]);
  assert.deepEqual(c('battery', 'dock', 'sysml.Satisfy'), { error: 'satisfy-ends: a satisfy runs to a requirement' });
  assert.deepEqual(c('battery', 'range', 'sysml.DeriveReqt'), { error: 'derive-ends: a deriveReqt runs from a requirement to a requirement' });
  assert.deepEqual(c('range-ride', 'battery', 'sysml.Verify'), { error: 'verify-ends: a verify runs to a requirement' });
  assert.deepEqual(c('battery', 'legal-speed', 'sysml.Copy'), { error: 'copy-ends: a copy runs from a requirement to a requirement' });
  const cp = c('availability', 'range', 'sysml.Copy');
  assert.deepEqual(cp, [{ op: 'add', element: { id: 'copy1', type: 'sysml.Copy', from: 'availability', to: 'range' }, view: V }, { op: 'set', id: 'availability', path: 'props.text', value: 'A full charge shall give at least 60 km of assisted riding.' }]);
  assert.deepEqual(T.validate(apply(M16, cp)), [], 'copy-text holds by construction');
  assert.deepEqual(T.validate(apply(M16, c('battery', 'dock', 'sysml.Trace'))).map(p => p.rule), ['trace-ends'], 'a warning is not refused');
  assert.equal(c('why-500', 'range', 'uml.CommentLink'), null, 'the canvas\'s');
  assert.equal(apply(M16, c('capacity', 'range', 'containment')).nodes.find(n => n.id === 'capacity').parent, 'range');
});

test('F2: "EB-1.2 Range" sets a requirement\'s id and name together; plain text, or another element, the canvas\'s; on a frame that is no element, the view\'s title', () => {
  const v = M16.views[0];
  assert.deepEqual(T.edits.rename(M16, v, 'range', 'EB-1.4 Full range'), [{ op: 'set', id: 'range', path: 'label', value: 'Full range' }, { op: 'set', id: 'range', path: 'props.reqId', value: 'EB-1.4' }]);
  for (const [id, t] of [['range', 'Full range'], ['range', 'EB-1.4'], ['battery', 'B-2 Battery pack'], ['range', 'v2']]) assert.equal(T.edits.rename(M16, v, id, t), null, `${id} ${t}`);
  assert.deepEqual(T.edits.rename(M16, v, 'requirements->frame', 'All of it'), [{ op: 'set', view: V, path: 'title', value: 'All of it' }]);
  assert.equal(apply(M16, T.edits.rename(M16, v, 'requirements->frame', 'All of it')).views[0].title, 'All of it');
  assert.equal(layout(apply(M16, T.edits.rename(M16, v, 'requirements->frame', 'All of it')), V).families[0].title, 'req [Model] E-bike: requirements [All of it]');
});

test('the PDF\'s tables (§13): a requirement\'s id, text whole, risk, verify method and relations; a test case\'s; each word; a line\'s keyword', () => {
  const m = structuredClone(M16); Object.assign(find(m, 'range').props, { risk: 'high', verifyMethod: 'test' });
  assert.deepEqual(T.rows(m, m.views[0], 'range'), ['id: EB-1.2', 'text: A full charge shall give at least 60 km of assisted riding.', 'risk: high', 'verify method: test',
    'contained in E-bike specification', 'derives Battery capacity', 'traced to All-day availability', 'verified by Range ride on the test circuit']);
  assert.deepEqual(T.rows(M16, V, 'range-ride'), ['verifies Range']);
  assert.deepEqual(T.rows(M16, V, 'controller'), ['satisfies Assistance cut-off']);
  assert.equal(T.rows(M16, V, 'why-500'), null);
  assert.deepEqual(['spec', 'range-ride', 'dock', 'why-500', 'nowhere', 'capacity-from-range'].map(id => T.word(M16, id)), ['Requirement', 'Test case', 'Block', null, null, null]);
  assert.deepEqual(M16.edges.map(e => T.text(M16, V, e.id)), ['«deriveReqt»', '«refine»', '«trace»', '«copy»', '«satisfy»', '«satisfy»', '«satisfy»', '«verify»', '«verify»', null]);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const v = M16.views[0], steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    T.edits.add(M16, v, { type: 'sysml.Requirement' }, `Need ${i}`, { sel: ['range'] }).commands.map(c => ({ ...c, element: { ...c.element, id: `n${i}` } })),
    T.edits.rename(M16, v, 'range', `EB-9.${i} Range ${i}`),
    [{ op: 'set', id: `n${i}`, path: 'props.text', value: `The bike shall do thing ${i}.` }],
    [{ op: 'add', element: L(`s${i}`, 'Satisfy', 'battery', `n${i}`), view: V }],
    [[{ op: 'reparent', id: `n${i}`, parent: 'spec' }], [{ op: 'set', id: `n${i}`, path: 'props.risk', value: 'low' }], [{ op: 'set', view: V, path: 'direction', value: i % 2 ? 'down' : 'right' }]][i % 3],
    [[{ op: 'hide', id: `n${i}`, view: V }], [{ op: 'delete', id: `s${i}` }], [{ op: 'reparent', id: `n${i}`, parent: null }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(M16), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}; let session; for (let i = 1; i <= 30; i++) session = unid(mapContext(JSON.parse(seen[i]), { memos }).buildView(V).markup);
  assert.equal(session, unid(mapContext(reopened).buildView(V).markup)); assert.equal(describe(reopened, V), describe(JSON.parse(seen[30]), V));
  assert.ok(memos[V].runs > 1);
});

test('P1 (S18): on 50 requirements and 60 relationships, a full layout under 1 s; a text edited, a satisfy added and a containment line deleted, each laid out and drawn (CPU, best of seven) (timed)', () => {
  const nodes = [], edges = [];
  for (let i = 0; i < 50; i++) nodes.push(R(`r${i}`, `Requirement ${i}`, i % 5 ? `r${i - 1 - (i % 5 > 2 ? 1 : 0)}` : null, `R-${i}`, `The system shall meet need number ${i} in full, every day of the year.`));
  for (let i = 0; i < 6; i++) nodes.push({ id: `b${i}`, type: 'sysml.Block', label: `Block ${i}` }, { id: `t${i}`, type: 'sysml.TestCase', label: `Test ${i}` });
  for (let i = 0; i < 20; i++) edges.push(L(`s${i}`, 'Satisfy', `b${i % 6}`, `r${(i * 7) % 50}`), L(`v${i}`, 'Verify', `t${i % 6}`, `r${(i * 11 + 3) % 50}`));
  for (let i = 0; i < 20; i++) edges.push(L(`d${i}`, i % 2 ? 'Trace' : 'DeriveReqt', `r${(i * 5 + 1) % 50}`, `r${(i * 5 + 13) % 50}`));
  const M = { schemaVersion: 2, title: 'stress', nodes, edges, views: [{ id: 'all', diagram: 'sysml.requirement', nodeIds: nodes.map(n => n.id) }] };
  assert.equal(nodes.filter(n => n.type === 'sysml.Requirement').length, 50); assert.equal(edges.length, 60); assert.deepEqual(validate(M).filter(p => p.level === 'error'), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(M);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(M).buildView('all')),
    text: timed(() => draw(apply(M, [{ op: 'set', id: 'r12', path: 'props.text', value: 'The system shall '.repeat(4 + k) }]))),
    satisfy: timed(() => draw(apply(M, [{ op: 'add', element: L(`sx${k}`, 'Satisfy', 'b0', `r${k + 20}`), view: 'all' }]))),
    unown: timed(() => draw(apply(M, T.edits.remove(M, M.views[0], [`r${5 * k}->r${5 * k + 1}`], false).commands))) }));
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  for (const k of ['text', 'satisfy', 'unown']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 target 100 ms: a text edited ${best('text')} ms, a satisfy added ${best('satisfy')} ms, a containment line deleted ${best('unown')} ms; full layout ${best('full')} ms`);
});
