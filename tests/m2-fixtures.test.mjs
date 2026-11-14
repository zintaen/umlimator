// Milestone 2's fixtures (work package M2.14, notes/milestone-2.md §10): tests/<type>-minimal.json and <type>-stress.json for
// the ER diagram, the flowchart, the data flow diagram, the information flow diagram and C4. A stress file's view
// edge-cases (and the views beside it: IDEF1X's copy, a DFD's levels, C4's six kinds) holds each case §10 lists; its view
// all is §11's P1 view, the generator each type's own test times, written out. Each view is laid out right and down with
// no line through a node but its own two ends, every line end within 1 px of its node's box, no line label over a node,
// and what check() finds pinned: the crossings that repair and reroute off leave (§11, S19) and the few other findings,
// each stated in its type's conformance note (docs/conformance/). Then §11's budgets in CPU time, best of seven after a
// warm-up: a full layout and its SVG under 1 s; the common edit and an edit that moves nothing under CI's 1 s ceiling,
// their time printed against the 100 ms target, the edit that moves nothing checked to lay nothing out; an ER notation switch
// lays nothing out. tests/m2.html draws every view in Chrome under three fonts and both themes, with the same three line
// checks on every view but C4's all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import '../src/er/er.js';
import '../src/flowchart/flowchart.js';
import '../src/dfd/dfd.js';
import '../src/uml/information.js';
import '../src/c4/c4.js';
import '../src/c4/views.js';
import { readMermaidEr } from '../src/readers/mermaid-er.js';
import { readMermaidFlowchart } from '../src/readers/mermaid-flowchart.js';
import { readStructurizr } from '../src/readers/structurizr.js';
import { readDbml } from '../src/readers/dbml.js';
import { diagramOf } from '../src/core/registry.js';

const read = f => JSON.parse(readFileSync(new URL(`./${f}.json`, import.meta.url), 'utf8'));
const TYPES = ['er', 'flowchart', 'dfd', 'information-flow', 'c4'];
const FIX = Object.fromEntries(TYPES.flatMap(t => ['minimal', 'stress'].map(k => [`${t}-${k}`, read(`${t}-${k}`)])));
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segs = pts => pts.slice(1).map((q, k) => { const p = pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });
const off = (n, [x, y]) => Math.max(n.x - x, x - n.x - n.w, n.y - y, y - n.y - n.h, 0);
// the layout's own complaints (a line it found no route for) go to console.warn: gathered, not printed
const quiet = f => { const was = console.warn, got = []; console.warn = (...a) => got.push(a.join(' ')); try { return [f(), got]; } finally { console.warn = was; } };

// DoD 3 in Node, on one view laid out one way: [crossings, check()'s other findings, what is wrong]
function clean(m, vid) {
  const [g] = quiet(() => layout(m, vid)), bad = [], by = id => g.byId[id];
  g.edges.forEach(e => {
    segs(e.pts).forEach(s => g.nodes.forEach(n => { if (![e.from, e.to].includes(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }));
    [[e.from, e.pts[0]], [e.to, e.pts.at(-1)]].forEach(([id, p]) => { const n = by(id); if (n && off(n, p) > 1) bad.push(`${e.id} ends ${off(n, p).toFixed(1)} px off ${id}`); });
    if (e.lbl) g.nodes.forEach(n => { if (meets(e.lbl, n)) bad.push(`${e.id}'s label is over ${n.id}`); });
  });
  const [found] = quiet(() => check(m, vid).map(p => p.message));
  return [found.filter(p => / cross$/.test(p)).length, found.filter(p => !/ cross$/.test(p)), [...new Set(bad)]];
}

// what each view keeps, laid out right and down, counted: [crossings, check()'s other findings, what clean() calls wrong]. The
// edge-cases views and the minimal ones are clean but for the crossings counted here. The generated views all crowd 60 to 70 lines with repair and reroute off (§11): there the information
// flow view's labels lie on lines and C4's container view's lines share lines, and some run through cards they do not join
// (the router found no way round). Each is stated in its type's conformance note.
const PINNED = {
  'er-minimal': { 'v': { right: [0, 0, 0], down: [0, 0, 0] } },
  'er-stress': { 'edge-cases': { right: [0, 0, 0], down: [0, 0, 0] }, 'edge-cases-idef1x': { right: [0, 0, 0], down: [0, 0, 0] }, 'all': { right: [18, 0, 0], down: [25, 0, 0] } },
  'flowchart-minimal': { 'v': { right: [0, 0, 0], down: [0, 0, 0] } },
  'flowchart-stress': { 'edge-cases': { right: [0, 0, 0], down: [0, 0, 0] }, 'all': { right: [4, 0, 0], down: [4, 0, 0] } },
  'dfd-minimal': { 'v': { right: [0, 0, 0], down: [0, 0, 0] } },
  'dfd-stress': {
    'edge-cases': { right: [0, 0, 0], down: [0, 0, 0] }, 'ec-level-2': { right: [2, 0, 0], down: [1, 0, 0] }, 'ec-level-2-gs': { right: [2, 0, 0], down: [1, 0, 0] }, 'ec-level-3': { right: [0, 0, 0], down: [0, 0, 0] }, 'ec-pay-level': { right: [0, 0, 0], down: [0, 0, 0] }, 'all': { right: [0, 0, 0], down: [0, 0, 0] } },
  'information-flow-minimal': { 'v': { right: [0, 0, 0], down: [0, 0, 0] } },
  'information-flow-stress': { 'edge-cases': { right: [2, 0, 0], down: [0, 0, 0] }, 'all': { right: [149, 1, 0], down: [121, 18, 0] } },
  'c4-minimal': { 'v': { right: [0, 0, 0], down: [0, 0, 0] } },
  'c4-stress': {
    'ec-landscape': { right: [0, 0, 0], down: [0, 0, 0] }, 'ec-context': { right: [0, 0, 0], down: [0, 0, 0] }, 'edge-cases': { right: [0, 0, 0], down: [1, 0, 0] }, 'ec-component': { right: [0, 0, 0], down: [0, 0, 0] }, 'ec-dynamic': { right: [0, 0, 0], down: [0, 0, 0] }, 'ec-deployment': { right: [0, 0, 0], down: [0, 0, 0] }, 'all': { right: [94, 132, 237], down: [98, 228, 202] } },
};

test('every view of the ten fixtures, right and down: a line through a node, an end off its node, a label over a node and check()\'s findings, each only as pinned (the stated limits)', () => {
  const seen = {};
  for (const [f, m] of Object.entries(FIX)) for (const v of m.views) for (const d of ['right', 'down']) ((seen[f] ||= {})[v.id] ||= {})[d] = clean(turned(m, v.id, d), v.id);
  const counts = {}, other = [];
  for (const [f, vs] of Object.entries(seen)) for (const [vid, ds] of Object.entries(vs)) for (const [d, [c, o, bad]] of Object.entries(ds)) {
    ((counts[f] ||= {})[vid] ||= {})[d] = [c, o.length, bad.length];
    if (vid !== 'all') other.push(...o, ...bad); }
  if (process.env.PIN) console.log(JSON.stringify(counts));
  assert.deepEqual(counts, PINNED);
  // outside the generated views, no finding but crossings
  assert.deepEqual(other, []);
});

test('the minimal fixtures: what §10 says each holds, and no problem', () => {
  for (const t of TYPES) assert.deepEqual(said(FIX[`${t}-minimal`]), [], t);
  const er = FIX['er-minimal'];
  assert.deepEqual([er.nodes.map(n => [n.id, n.members.filter(c => c.props.primaryKey).length]), er.edges.map(e => [e.props.identifying, e.props.ends.from.multiplicity, e.props.ends.to.multiplicity])],
    [[['customer', 1], ['orders', 1]], [[false, '1', '0..*']]], 'two entities, one key each, one non-identifying relationship');
  assert.deepEqual(FIX['flowchart-minimal'].nodes.map(n => n.type), ['flow.Terminator', 'flow.Process', 'flow.Terminator'], 'a start, a process, an end');
  assert.deepEqual([FIX['dfd-minimal'].nodes.map(n => n.type), FIX['dfd-minimal'].edges.length], [['dfd.ExternalEntity', 'dfd.Process', 'dfd.DataStore'], 2], 'an entity, a process, a store, two flows');
  const inf = FIX['information-flow-minimal'];
  assert.deepEqual([inf.nodes.map(n => n.type), inf.edges.map(e => e.props.conveyed)], [['uml.Actor', 'uml.Component', 'uml.InformationItem'], [['order']]], 'an actor, a component, one flow conveying one item');
  assert.deepEqual([FIX['c4-minimal'].nodes.map(n => n.type), FIX['c4-minimal'].edges.map(e => e.type)], [['c4.Person', 'c4.SoftwareSystem'], ['c4.Relationship']], 'a person, a software system, a relationship');
});

test('er-stress.json, edge-cases: each case of §10, and what the rules say of it', () => {
  const m = FIX['er-stress'], col = (e, c) => node(m, e).members.find(x => x.id === `${e}.${c}`).props;
  assert.deepEqual(said(m), [
    ['warning', 'relationship-fk', ['ec-post-tags', 'ec-post', 'ec-tag']], // a many-to-many drawn directly: no column carries it
    ['error', 'identifying-parent', ['ec-shelf-slots', 'ec-shelf']], // identifying with an optional parent
    ['warning', 'relationship-ends', ['ec-team-players']], // 2..5: drawn as the nearest end, with its text
    ['error', 'relationship-ends', ['ec-odd']], // an unreadable multiplicity
  ], 'nothing else: the composite key, the self-reference, the junction, the nullable key, the two lines of one pair and the wide table are fine');
  assert.deepEqual(node(m, 'ec-line').members.filter(c => c.props.primaryKey).map(c => c.label), ['order_id', 'line_no'], 'a composite key, a foreign key in it');
  const self = m.edges.find(e => e.id === 'ec-manages'); assert.equal(self.from, self.to, 'a self-reference');
  assert.deepEqual(['ec-student-enrolments', 'ec-course-enrolments'].map(id => m.edges.find(e => e.id === id).props.identifying), [true, true], 'a junction, both identifying');
  assert.equal(col('ec-order', 'customer_id').nullable, true, 'a nullable foreign key');
  assert.deepEqual([...new Set(m.edges.filter(e => e.id.startsWith('ec-')).flatMap(e => [e.props.ends.from.multiplicity, e.props.ends.to.multiplicity]))].sort(), ['0..*', '0..1', '1', '1..*', '2..5', 'lots']);
  assert.equal(m.edges.filter(e => e.from === 'ec-address' && e.to === 'ec-person').length, 2, 'two relationships between one pair');
  const g = layout(m, 'edge-cases'), wide = g.byId['ec-wide'];
  assert.deepEqual([node(m, 'ec-wide').members.length, V(m, 'edge-cases').present['ec-wide'].rows], [41, 8], 'an entity of 40 columns (and its key to customer) with rows: 8');
  assert.ok(wide.h < g.byId['ec-line'].h * 4, 'drawn eight rows and "+n more" tall, not 41');
  // the second view is the same in IDEF1X: one geometry, a repaint (§4.3)
  const at = x => x.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), i = layout(m, 'edge-cases-idef1x');
  assert.deepEqual(at(i), at(g)); assert.deepEqual(i.edges.map(e => e.pts), g.edges.map(e => e.pts));
  assert.match(describe(m, 'edge-cases'), /^Edge cases, crow's foot: an entity-relationship diagram of 18 elements and 12 lines\./);
});

test('flowchart-stress.json, edge-cases: each case of §10, and what the rules say of it', () => {
  const m = FIX['flowchart-stress'], v = V(m, 'edge-cases'), shown = v.nodeIds.map(id => node(m, id));
  assert.deepEqual(said(m), [
    ['warning', 'start-end', ['edge-cases', 'ec-start', 'ec-start-2']], // two starts
    ['warning', 'reachable', ['ec-island']], // a node no start reaches
  ]);
  assert.deepEqual([...new Set(shown.map(n => n.type))].sort(), ['flow.Connector', 'flow.Database', 'flow.Decision', 'flow.Delay', 'flow.Document', 'flow.InputOutput',
    'flow.ManualInput', 'flow.PredefinedProcess', 'flow.Process', 'flow.Terminator'], 'every symbol');
  assert.deepEqual(m.edges.filter(e => e.from === 'ec-check').map(e => e.label), ['a', 'b', 'c'], 'a decision with three exits');
  assert.ok(m.edges.some(e => e.from === 'ec-again' && e.to === 'ec-read'), 'a loop back to an earlier node');
  assert.deepEqual([m.edges.filter(e => e.to === 'ec-join').length, m.edges.filter(e => e.from === 'ec-join').length], [3, 1], 'a connector as a junction');
  assert.ok(node(m, 'ec-long').label.length >= 120, 'a 120-character label');
});

test('dfd-stress.json, edge-cases: three levels, the second balanced and the third not (naming the missing flow), a level made by D, both notations, and the warnings §10 lists', () => {
  const m = FIX['dfd-stress'];
  assert.deepEqual(said(m), [
    ['warning', 'dfd-flow-process', ['ec-copy', 'ec-stock', 'ec-archive']], // a flow between two stores
    ['warning', 'dfd-process-io', ['ec-idle']], // a process with no flow out
    ['warning', 'dfd-process-io', ['p29']], // the generated chain's last process (all)
    ['warning', 'dfd-numbers', ['ec-stray', 'ec-sell']], // a process numbered outside its parent's
    ['error', 'dfd-balance', ['ec-price', 'ec-receipt-2']], // level 3 lacks the receipt
  ], 'level 2, with its local store Cart, balances; so does the level D made');
  assert.match(validate(m).find(p => p.rule === 'dfd-balance').message, /receipt/);
  assert.deepEqual(['edge-cases', 'ec-level-2', 'ec-level-3'].map(id => V(m, id).parent ?? null), [null, 'edge-cases', 'ec-level-2'], 'three levels');
  assert.ok(V(m, 'ec-level-2').nodeIds.includes('ec-cart') && !V(m, 'edge-cases').nodeIds.includes('ec-cart'), 'a local store at the second level');
  const made = V(m, 'ec-pay-level');
  assert.deepEqual([node(m, 'ec-pay').opensView, made.parent, node(m, 'ec-pay-2.1').props.number], ['ec-pay-level', 'edge-cases', '2.1'], 'a level made by D, balanced by construction');
  // D made it: strip the level and press D again, and the same view, process and two flows come back
  const made2 = ['ec-charge-2.1', 'ec-auth-2.1'], bare = { ...m, nodes: m.nodes.filter(n => n.id !== 'ec-pay-2.1').map(n => (n.id === 'ec-pay' ? (({ opensView, ...r }) => r)(n) : n)),
    edges: m.edges.filter(e => !made2.includes(e.id)), views: m.views.filter(v => v.id !== 'ec-pay-level') };
  const again = apply(bare, diagramOf({ diagram: 'dfd' }).edits.key(bare, V(bare, 'edge-cases'), ['ec-pay'], 'D').commands);
  const level = x => [V(x, 'ec-pay-level'), node(x, 'ec-pay'), node(x, 'ec-pay-2.1'), ...made2.map(id => x.edges.find(e => e.id === id))];
  assert.deepEqual(level(again), level(m), 'the fixture\'s level is D\'s output');
  assert.equal(V(m, 'ec-level-2-gs').notation, 'gane-sarson', 'both notations of one level');
  const at = x => x.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]);
  assert.deepEqual(at(layout(m, 'ec-level-2-gs')), at(layout(m, 'ec-level-2')), 'one geometry for both skins');
});

test('information-flow-stress.json, edge-cases: each case of §10, and what the rules say of it', () => {
  const m = FIX['information-flow-stress'], g = layout(m, 'edge-cases'), e = id => m.edges.find(x => x.id === id);
  assert.deepEqual(said(m), [['error', 'conveyed-kind', ['ec-gone', 'ec-no-such-item']]], 'a conveyed id that is gone: nothing else');
  assert.equal(e('ec-six').props.conveyed.length, 6);
  // every label placed but the flow to a gone id's, which finds no room beside the class flow into the same box (a limit,
  // stated in docs/conformance/uml-information-flow.md); right and down alike
  for (const d of ['right', 'down']) assert.deepEqual(layout(turned(m, 'edge-cases', d), 'edge-cases').edges.filter(x => !x.lbl).map(x => x.id), ['ec-gone'], d);
  const six = g.edges.find(x => x.id === 'ec-six').lbl; assert.ok(six && /…/.test(six.text ?? JSON.stringify(six)), 'six conveyed: the label cut');
  assert.deepEqual([['ec-app', 'ec-api'], ['ec-api', 'ec-app']].map(([a, b]) => m.edges.filter(x => x.from === a && x.to === b).length), [2, 2], 'two flows each way between one pair');
  assert.ok(!V(m, 'edge-cases').nodeIds.includes('ec-hidden') && e('ec-not-shown').props.conveyed.includes('ec-hidden'), 'an item conveyed and not shown');
  assert.equal(node(m, e('ec-class').props.conveyed[0]).type, 'uml.Class', 'a flow conveying a class');
});

test('c4-stress.json, its views: each of the six kinds, an implied line and one hidden by a direct one, another container\'s component (an error), five deep, twelve steps, 300 characters, every shape', () => {
  const m = FIX['c4-stress'];
  assert.deepEqual(said(m), [['error', 'c4-level', ['ec-k3']]], 'a container view showing another container\'s component: nothing else');
  assert.deepEqual(m.views.filter(v => v.id !== 'all').map(v => v.diagram), ['c4.landscape', 'c4.context', 'c4.container', 'c4.component', 'c4.dynamic', 'c4.deployment']);
  const ctx = layout(m, 'ec-context'), line = (a, b) => ctx.edges.filter(e => e.from === a && e.to === b);
  assert.equal(line('ec-sys', 'ec-other').length, 1, 'Router → Partner drawn as an implied Shop → Partner');
  assert.deepEqual(line('ec-sys', 'ec-mail').map(e => e.id), ['ec-sys-mail'], 'Store → Mailer hidden by Shop → Mailer, the direct one');
  let d = 'ec-d5', depth = 0; while (d) { depth++; d = node(m, d).parent; } assert.equal(depth, 5, 'deployment nodes five deep');
  assert.deepEqual(['ec-i3', 'ec-i4'].map(id => node(m, id).props.container), ['ec-c3', 'ec-c4'], 'with instances');
  assert.equal(V(m, 'ec-dynamic').edges.length, 12, 'a dynamic view of 12 steps');
  assert.match(describe(m, 'ec-dynamic'), /Step 12: /);
  assert.equal(node(m, 'ec-user').props.description.length, 300, 'a description of 300 characters');
  assert.deepEqual(m.nodes.filter(n => n.id.startsWith('ec-c') && n.type === 'c4.Container').map(n => n.props.shape), ['person', 'robot', 'browser', 'window', 'terminal', 'mobile', 'cylinder', 'pipe', 'folder', 'document', 'hexagon', 'box'], 'every shape');
});

test('the stress views all are §11\'s P1 sizes', () => {
  const size = (f, k) => { const v = V(FIX[f], 'all'), on = new Set(v.nodeIds); return [v.nodeIds.length, FIX[f].edges.filter(e => on.has(e.from) && on.has(e.to)).length]; };
  assert.deepEqual(TYPES.map(t => size(`${t}-stress`)), [[50, 60], [60, 70], [50, 60], [40, 60], [50, 70]]);
});

// §11: per type, the common edit and, where §11 names one, an edit that moves nothing
const EDITS = {
  er: { common: k => [{ op: 'add', element: { id: `e9.c${k}`, type: 'er.Column', label: `c_${k}`, props: { dataType: 'int' } }, owner: 'e9' }], still: k => [{ op: 'set', id: 'e7.name', path: 'props.dataType', value: `varchar(${k + 1}0)` }] },
  flowchart: { common: k => [{ op: 'set', id: 'n27', path: 'label', value: `Is it ${'x'.repeat(4 + 3 * k)}?` }] },
  dfd: { common: k => [{ op: 'set', id: 'c7', path: 'label', value: `step ${'x'.repeat(4 + 3 * k)}` }] },
  'information-flow': { common: k => [{ op: 'set', id: 'f7', path: 'props.conveyed', value: ['i7', 'i12', `i${k}`] }] }, // a third item conveyed, a different one each run
  c4: { common: k => [{ op: 'set', id: 'c5', path: 'props.description', value: `Handles part 5 of the work, and ${'more '.repeat(8 + 4 * k)}` }], still: k => [{ op: 'set', id: 'c5', path: 'props.technology', value: 'Rust' }] },
};
test('§11\'s budgets on each stress view all: a full layout and its SVG under 1 s; the common edit and an edit that moves nothing, laid out and drawn, under CI\'s 1 s ceiling, the 100 ms target printed; an ER notation switch lays nothing out (CPU, best of seven after a warm-up) (timed)', () => {
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const said = [];
  quiet(() => { for (const t of TYPES) {
    const M = FIX[`${t}-stress`], memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
    draw(M);
    const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(M).buildView('all')), common: timed(() => draw(apply(M, EDITS[t].common(k)))),
      ...(EDITS[t].still ? { still: timed(() => draw(apply(M, EDITS[t].still(k)))) } : {}) }));
    const best = k => Math.min(...runs.map(r => r[k]));
    for (const k of Object.keys(runs[0])) assert.ok(best(k) < 1000, `${t} ${k} ${best(k)} ms`);
    if (EDITS[t].still) { draw(M); const before = memos.all.runs; draw(apply(M, EDITS[t].still(0))); assert.equal(memos.all.runs, before, `${t}: the edit that moves nothing lays nothing out`); }
    if (t === 'er') { draw(M); const before = memos.all.runs; const sw = timed(() => draw(apply(M, [{ op: 'set', view: 'all', path: 'notation', value: 'idef1x' }])));
      assert.equal(memos.all.runs, before, 'the switch repaints'); assert.ok(sw < 1000); said.push(`er notation switch ${sw.toFixed(1)} ms`); }
    said.push(`${t}: common edit ${best('common').toFixed(1)} ms${runs[0].still != null ? `, an edit that moves nothing ${best('still').toFixed(1)} ms` : ''}, full layout and SVG ${best('full').toFixed(1)} ms`);
  } });
  console.log(`# P1 target 100 ms (milestone 2's fixtures): ${said.join('; ')}`);
});

// DoD 2's reader half: each reader's construct file, M2.10's two workspaces and M2.11's captured Database read into models
// their types' validate passes (warnings counted by rule; a construct file holds odd input on purpose), the reports pinned
// by length here and line by line in each reader's own test
test('the readers\' construct files read into models their types\' validate passes, the reports pinned', () => {
  const at = f => readFileSync(new URL(`./import/${f}`, import.meta.url), 'utf8'), S = JSON.parse(at('structurizr.json'));
  const runs = { 'er.mmd': readMermaidEr(at('er.mmd')), 'flowchart.mmd': readMermaidFlowchart(at('flowchart.mmd')), 'structurizr.json clinic': readStructurizr(S.clinic),
    'structurizr.json every': readStructurizr(S.every), 'dbml.json': readDbml(JSON.parse(at('dbml.json')).database) };
  const seen = Object.fromEntries(Object.entries(runs).map(([k, { model, report }]) => { const by = {};
    validate(model).forEach(p => { const r = `${p.level} ${p.rule}`; by[r] = (by[r] || 0) + 1; });
    return [k, [report.length, [...new Set(model.views.map(v => v.diagram))], by]]; }));
  assert.deepEqual(seen, {
    // Mermaid's ER page leaves keys and foreign keys unsaid, so most entities have none; one line, DOCK }o--|| HARBOUR,
    // is identifying with its many end first: the type names it (identifying-parent), as Mermaid draws it without a word
    'er.mmd': [29, ['er'], { 'warning pk-exists': 25, 'warning fk-flag': 2, 'warning relationship-fk': 20, 'error identifying-parent': 1 }],
    // the shapes page's nodes stand alone: no start reaches them
    'flowchart.mmd': [61, ['flowchart'], { 'warning start-end': 1, 'warning reachable': 101, 'warning terminator-flows': 4, 'warning decision-exits': 2 }],
    'structurizr.json clinic': [6, ['c4.context', 'c4.container', 'c4.component'], {}],
    // a dynamic view's three steps with an end that view does not show, not drawn
    'structurizr.json every': [27, ['c4.landscape', 'c4.context', 'c4.container', 'c4.component', 'c4.dynamic', 'c4.deployment'], { 'warning c4-steps': 3 }],
    'dbml.json': [20, ['er'], { 'warning pk-exists': 1, 'warning relationship-fk': 1 }],
  });
});

test('DoD 1: the registry holds the five types (C4 under its six names), and the JSON Schema and the types name their vocabulary', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema).$defs, np = S.node.properties.props.anyOf[0].properties, ep = S.edge.properties.props.anyOf[0].properties;
  for (const name of ['er', 'flowchart', 'dfd', 'uml.information-flow', 'c4.landscape', 'c4.context', 'c4.container', 'c4.component', 'c4.dynamic', 'c4.deployment']) {
    const T = diagramOf({ diagram: name });
    assert.equal(T && T.name, name);
    assert.ok(S.view.properties.diagram.examples.includes(name) && (dts.includes(`'${name}'`) || dts.includes(`\`${name}\``)), `the schema's view.diagram and the types name ${name}`);
    for (const t of [...T.elements, ...T.lines].map(x => x.type)) assert.ok(schema.includes(`"${t}"`) && dts.includes(`'${t}'`), `${name}: ${t}`);
    for (const [t, fields] of Object.entries(T.props || {})) for (const f of fields) { const k = f.key.split('.').at(-1);
      assert.ok(np[k] || ep[k] || ep[f.key.split('.')[0]], `${name}: ${t}'s ${f.key} in the schema`); }
  }
  assert.ok(['ErColumnProps', 'ErRelationshipProps', 'FlowchartElementType', 'DfdNumberProps', 'UmlInformationFlowProps', 'C4ElementProps', 'C4RelationshipProps', 'C4ViewType'].every(k => new RegExp(`export (type|interface) ${k} `).test(dts)));
  assert.match(dts, /op: 'addView'; view: MapView; index\?: number/);
  assert.match(S.view.properties.notation.description, /idef1x.*gane-sarson/);
  assert.match(S.edge.properties.props.anyOf[0].properties.ends.description, /er\.Relationship.*multiplicity/, 'the ER relationship\'s multiplicity under ends');
  assert.match(dts, /export interface ErRelationshipProps [^}]*multiplicity/);
});
