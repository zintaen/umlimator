// Milestone 4b's fixtures (work package 4b.5, notes/milestone-4b.md §13, §14): tests/bpmn-minimal.json and
// tests/bpmn-stress.json. The stress file's view edge-cases holds each case §13 lists and every row of Table 2.1 with
// the extras (S1, decision 21); ec-closed shows its expanded sub-process closed, ec-inside is that sub-process's own view;
// its view all is §14's P1 view, the generator tests/bpmn.test.mjs times, written out. Each view, and the example
// examples/bookshop-order-to-shipment.json's two, is laid out right and down with no overlap, no line through a node but
// its own ends, no sequence flow outside its pool's band, every line end within 1 px of its node (a pool's band for a
// message flow to a pool), every boundary circle on its activity's border, and what check() finds pinned: the crossings
// that repair and reroute off leave (S16) and nothing else. Then §14's budgets in CPU time, best of five after a warm-up,
// held to CI's 1 s with the 100 ms target printed. And DoD 1 (the registry, the JSON Schema and the types), the PDF's
// words and rows, the renamed example's references and problems (§13). tests/m4b.html draws every view in Chrome under
// three fonts and both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { diagramOf } from '../src/core/registry.js';
import { bzMoveTo } from '../src/bpmn/process.js';
import { check as checkTarget, targets } from '../docs/diagrams/examples/check.mjs';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const FIX = { 'bpmn-minimal': read('./bpmn-minimal.json'), 'bpmn-stress': read('./bpmn-stress.json'), example: read('../examples/bookshop-order-to-shipment.json') };
const T = diagramOf({ diagram: 'bpmn' }), V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segs = pts => pts.slice(1).map((q, k) => { const p = pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });
const off = (n, [x, y]) => Math.max(n.x - x, x - n.x - n.w, n.y - y, y - n.y - n.h, 0);
const quiet = f => { const was = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = was; } };

// where a node sits in the model: its innermost lane, else its pool (test-side, not the type's)
function homes(m) {
  const lanes = new Map(); m.nodes.forEach(n => (n.members || []).forEach(l => lanes.set(l.id, { l, pool: n.id })));
  const up = id => (lanes.has(id) ? lanes.get(id).l.parent ?? lanes.get(id).pool : (node(m, id) || {}).parent);
  const chain = id => { const out = []; for (let p = up(id), k = 0; p != null && k < 64; p = up(p), k++) out.push(p); return out; };
  return { chain, pool: id => chain(id).find(p => (node(m, p) || {}).type === 'bpmn.Participant') ?? null };
}

// DoD 3 in Node, on one view laid out one way: [crossings, check()'s other findings, what is wrong]
function clean(m, vid) {
  const g = quiet(() => layout(m, vid)), bad = [], H = homes(m), band = new Map(g.bands.map(b => [b.id, b]));
  const drawn = g.nodes.filter(n => !n.aside), box = id => band.get(id) || g.byId[id];
  drawn.forEach((a, i) => drawn.slice(i + 1).forEach(b => { if (meets(a, b) && a.owner !== b.id && b.owner !== a.id && !/Group$/.test(a.type + b.type)) bad.push(`${a.id} and ${b.id} overlap`); }));
  g.edges.forEach(e => {
    const E = new Set([e.from, e.to, e.s && e.s.owner, e.t && e.t.owner].filter(Boolean));
    segs(e.pts).forEach(s => [...drawn, ...g.families.map(f => ({ ...f, fam: true }))].forEach(n => {
      if (E.has(n.id) || /Group$/.test(n.type) || (n.fam && [...E].some(x => H.chain(x).includes(n.id)))) return;
      if (!n.fam && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }));
    [[e.from, e.pts[0]], [e.to, e.pts.at(-1)]].forEach(([id, p]) => { const n = box(id) || g.families.find(f => f.id === id); if (n && off(n, p) > 1) bad.push(`${e.id} ends ${off(n, p).toFixed(1)} px off ${id}`); });
  });
  const [A, S] = V(m, vid).direction === 'down' ? [0, 'x'] : [1, 'y'], W = S === 'x' ? 'w' : 'h';
  g.edges.filter(e => e.type === 'bpmn.SequenceFlow' && H.pool(e.from) === H.pool(e.to)).forEach(e => { const b = band.get(H.pool(e.from));
    if (b && e.pts.some(p => p[A] < b[S] - .5 || p[A] > b[S] + b[W] + .5)) bad.push(`${e.id} leaves its pool`); });
  drawn.filter(n => n.type === 'bpmn.BoundaryEvent' && n.owner).forEach(c => { const o = g.byId[c.owner] || g.families.find(f => f.id === c.owner), cx = c.x + 16, cy = c.y + 16;
    const on = { B: cy - (o.y + o.h), T: cy - o.y, R: cx - (o.x + o.w), L: cx - o.x }[c.side]; if (Math.abs(on) > .01) bad.push(`${c.id} is ${on} px off ${c.owner}'s border`); });
  const found = quiet(() => check(m, vid).map(p => p.message));
  return [found.filter(p => / cross$/.test(p)).length, found.filter(p => !/ cross$/.test(p)), [...new Set(bad)]];
}

// what each view keeps, right and down: [crossings, check()'s other findings, what clean() calls wrong]. Every view is clean
// but for its crossings (S16: repair and reroute off), stated in docs/conformance/bpmn.md; edge-cases' cross-pool sequence
// flow (an error in the JSON, refused by connect) is drawn, and left out of the band check, which is for flows in one pool
const PINNED = {
  'bpmn-minimal': { v: { right: [0, 0, 0], down: [0, 0, 0] } },
  'bpmn-stress': { 'edge-cases': { right: [12, 0, 0], down: [12, 0, 0] }, 'ec-closed': { right: [14, 0, 0], down: [15, 0, 0] }, 'ec-inside': { right: [0, 0, 0], down: [0, 0, 0] },
    all: { right: [30, 0, 0], down: [29, 0, 0] } },
  example: { 'order-to-shipment': { right: [5, 0, 0], down: [6, 0, 0] }, 'pick-and-pack': { right: [0, 0, 0], down: [0, 0, 0] } },
};

test('every view of the two fixtures and the example, right and down: no overlap, no line through a node, no end off its node, no sequence flow outside its pool, boundary circles on borders, check()\'s findings only as pinned', () => {
  const counts = {}, other = [];
  for (const [f, m] of Object.entries(FIX)) for (const v of m.views) for (const d of ['right', 'down']) {
    const [c, o, bad] = clean(turned(m, v.id, d), v.id); ((counts[f] ||= {})[v.id] ||= {})[d] = [c, o.length, bad.length]; other.push(...o.map(x => `${v.id} ${d}: ${x}`), ...bad.map(x => `${v.id} ${d}: ${x}`)); }
  if (process.env.PIN) console.log(JSON.stringify(counts), other);
  assert.deepEqual(counts, PINNED);
  assert.deepEqual(other, []);
});

test('the minimal fixture: one pool, a start event, a task, an end event, and no problem', () => {
  const m = FIX['bpmn-minimal'];
  assert.deepEqual(said(m), []);
  assert.deepEqual([m.nodes.map(n => n.type), m.edges.map(e => e.type)], [['bpmn.Participant', 'bpmn.StartEvent', 'bpmn.Task', 'bpmn.EndEvent'], ['bpmn.SequenceFlow', 'bpmn.SequenceFlow']]);
});

test('bpmn-stress.json, edge-cases: each case of §13, and what the rules say of it', () => {
  const m = FIX['bpmn-stress'], g = layout(m, 'edge-cases'), p = id => node(m, id).props || {};
  assert.deepEqual(said(m), [
    ['error', 'sequence-scope', ['ec-cross', 'ec-c-task', 'ec-loose']], // a sequence flow across pools
    ['warning', 'gateway-flows', ['ec-one']], // a gateway with one exit
    ['warning', 'in-lane', ['ec-loose', 'ec-shop']], // a flow node in a pool with lanes but in none
  ], 'nothing else: the stress view all is clean');
  // connect never draws what the JSON holds: between two pools it picks a message flow (§7.1)
  assert.deepEqual(T.edits.connect(m, V(m, 'edge-cases'), 'ec-c-task', 'ec-loose').map(c => c.element.type), ['bpmn.MessageFlow']);
  // two boundary events on one side, timer interrupting and message non-interrupting; one on an expanded sub-process
  const be = id => g.byId[id];
  assert.deepEqual(['ec-late', 'ec-ping'].map(id => [be(id).owner, be(id).side, p(id).definition, p(id).cancelActivity]), [['ec-check', 'B', 'timer', true], ['ec-check', 'B', 'message', false]]);
  assert.ok(Math.abs(be('ec-late').x - be('ec-ping').x) >= 32 + 8, 'the two circles keep apart');
  assert.deepEqual([be('ec-sub-late').owner, g.families.map(f => f.id)], ['ec-sub', ['ec-sub']], 'a boundary event on the expanded sub-process');
  // a message flow to and from the black-box pool, two from one column, the anchors gone
  const end = id => g.edges.find(e => e.id === id), bank = g.bands.find(b => b.id === 'ec-bank');
  assert.deepEqual([end('ec-m1').to, end('ec-m2').to, end('ec-m3').from], ['ec-bank', 'ec-bank', 'ec-bank']);
  assert.ok([end('ec-m1').pts.at(-1)[1], end('ec-m2').pts.at(-1)[1], end('ec-m3').pts[0][1]].every(y => y === bank.y), 'on the bank\'s border');
  assert.notDeepEqual(end('ec-m1').pts.at(-1), end('ec-m2').pts.at(-1), 'two from one column keep apart');
  assert.ok(!g.nodes.some(n => n.id.startsWith('\u0000')));
  // the sub-process open here, closed in ec-closed (its + marker), its own view ec-inside
  const closed = layout(m, 'ec-closed');
  assert.deepEqual([closed.families.length, closed.byId['ec-sub'].shape, V(m, 'ec-inside').subject, node(m, 'ec-sub').opensView], [0, 'bpmn-task', 'ec-sub', 'ec-inside']);
  assert.match(mapContext(m).buildView('ec-closed').markup, /data-mark="collapsed"/);
  // lanes three deep and an empty lane, each a band
  assert.deepEqual(g.bands.filter(b => b.id.startsWith('ec-') && node(m, 'ec-shop').members.some(l => l.id === b.id)).map(b => [b.id, b.depth]),
    [['ec-front', 1], ['ec-back', 1], ['ec-back-a', 2], ['ec-back-a1', 3], ['ec-empty', 1]]);
  // a group across two pools; an annotation with an association; a data object and a store with associations both ways
  const grp = g.byId['ec-grp'], inside = id => { const n = g.byId[id]; return n.x >= grp.x && n.y >= grp.y && n.x + n.w <= grp.x + grp.w && n.y + n.h <= grp.y + grp.h; };
  assert.ok(inside('ec-check') && inside('ec-c-task'), 'the group round its members in two pools');
  assert.deepEqual(m.edges.filter(e => e.type === 'bpmn.Association').map(e => [e.from, e.to, e.props.direction]), [['ec-note', 'ec-check', 'one']]);
  assert.deepEqual(m.edges.filter(e => e.type === 'bpmn.DataAssociation').map(e => [e.from, e.to]), [['ec-check', 'ec-doc'], ['ec-doc', 'ec-pay'], ['ec-pay', 'ec-db'], ['ec-db', 'ec-call']]);
  // 40-character labels on an event and a gateway, outside their shapes
  assert.deepEqual(['ec-gw', 'ec-throw'].map(id => node(m, id).label.length), [41, 40]);
  assert.ok(['ec-gw', 'ec-throw'].every(id => g.labels.some(l => l.id === id && !l.clash)), 'both labels placed clear');
  assert.match(describe(m, 'edge-cases'), /^Edge cases: a BPMN diagram of /);
});

// Table 2.1, row by row (docs/conformance/bpmn.md), and the extras S1 and decision 21 name: each in edge-cases, drawn
const TABLE = {
  'participant (pool)': m => node(m, 'ec-shop').type === 'bpmn.Participant' && node(m, 'ec-shop').props.processRef === 'shop-orders',
  laneSet: m => node(m, 'ec-shop').members.length === 5,
  'sequenceFlow (unconditional)': m => m.edges.some(e => e.id === 'ec-f3' && e.type === 'bpmn.SequenceFlow' && e.label === 'yes'),
  messageFlow: m => m.edges.some(e => e.id === 'ec-m1' && e.type === 'bpmn.MessageFlow' && e.label === 'Charge'),
  'exclusiveGateway, parallelGateway': m => node(m, 'ec-gw').type === 'bpmn.ExclusiveGateway' && node(m, 'ec-fork').type === 'bpmn.ParallelGateway',
  'task (None), userTask, serviceTask': m => ['ec-sub-task', 'ec-check', 'ec-pay'].map(id => node(m, id).props.taskType).join() === 'none,user,service',
  'subProcess (expanded), (collapsed)': m => layout(m, 'edge-cases').families[0].id === 'ec-sub' && layout(m, 'ec-closed').byId['ec-sub'].shape === 'bpmn-task',
  CallActivity: m => node(m, 'ec-call').props.calledElement === 'Reserve',
  DataObject: m => node(m, 'ec-doc').type === 'bpmn.DataObject',
  TextAnnotation: m => node(m, 'ec-note').label === 'Checked before ten every day',
  'association/dataAssociation': m => ['bpmn.Association', 'bpmn.DataAssociation'].every(t => m.edges.some(e => e.type === t)),
  dataStoreReference: m => node(m, 'ec-db').props.dataStoreRef === 'stock-db',
  'startEvent (None), endEvent (None)': m => node(m, 'ec-sub-start').props.definition === 'none' && node(m, 'ec-c-end').props.definition === 'none',
  'messageStartEvent, messageEndEvent': m => node(m, 'ec-c-start').props.definition === 'message' && node(m, 'ec-end').props.definition === 'message',
  timerStartEvent: m => node(m, 'ec-start').props.definition === 'timer',
  terminateEndEvent: m => node(m, 'ec-stop').props.definition === 'terminate',
  documentation: m => /stock list/.test(describe(m, 'edge-cases')),
  Group: m => node(m, 'ec-grp').type === 'bpmn.Group' && layout(m, 'edge-cases').byId['ec-grp'] != null,
  // Table 2.2's rows the claim adds (S1), and the none intermediate throw event (decision 21)
  'Message Intermediate Catch Event': m => node(m, 'ec-reply').props.definition === 'message',
  'Message Intermediate Throw Event': m => node(m, 'ec-throw').props.definition === 'message',
  'Timer Intermediate Catch Event': m => node(m, 'ec-wait').props.definition === 'timer',
  'Message Boundary Event (interrupting, non-interrupting)': m => node(m, 'ec-ping').props.definition === 'message' && node(m, 'ec-ping').props.cancelActivity === false,
  'Timer Boundary Event (interrupting, non-interrupting)': m => node(m, 'ec-late').props.cancelActivity === true && m.nodes.some(n => n.type === 'bpmn.BoundaryEvent' && n.props.definition === 'timer' && n.props.cancelActivity === false),
  'None Intermediate Throw Event (decision 21)': m => node(m, 'ec-milestone').props.definition === 'none',
};
test('Table 2.1, row by row, and the six extras: each in edge-cases, drawn there with its marker', () => {
  const m = FIX['bpmn-stress'];
  for (const [row, has] of Object.entries(TABLE)) assert.ok(has(m), row);
  assert.equal(Object.keys(TABLE).length, 18 + 6, 'Table 2.1\'s 24 rows in 18 lines of docs/conformance/bpmn.md, and six extras');
  const marks = [...mapContext(m).buildView('edge-cases').markup.matchAll(/data-mark="([a-z]+)"/g)].map(x => x[1]);
  for (const k of ['user', 'service', 'message', 'timer', 'terminate', 'exclusive', 'parallel']) assert.ok(marks.includes(k), k);
  // each row the conformance note claims names its line here
  const note = readFileSync(new URL('../docs/conformance/bpmn.md', import.meta.url), 'utf8');
  for (const row of Object.keys(TABLE)) assert.ok(note.includes(`| ${row} |`), `docs/conformance/bpmn.md's row ${row}`);
  assert.match(note, /Descriptive conformance sub-class \(BPMN 2\.0\.2, 2\.2\.2, Table 2\.1\)/);
  assert.doesNotMatch(note, /claims? (the )?Analytic/);
});

test('the stress view all is §14\'s P1 size, the generator tests/bpmn.test.mjs times written out', () => {
  const m = FIX['bpmn-stress'], v = V(m, 'all'), on = new Set(v.nodeIds), shown = m.nodes.filter(n => on.has(n.id));
  const kinds = t => shown.filter(n => n.type === 'bpmn.' + t).length;
  assert.deepEqual([shown.filter(n => /Event$|Gateway$|Task$|SubProcess$/.test(n.type)).length, kinds('Participant'), shown.flatMap(n => n.members || []).length, kinds('BoundaryEvent'),
    m.edges.filter(e => e.type === 'bpmn.MessageFlow' && on.has(e.from) && on.has(e.to)).length, layout(m, 'all').families.length], [67, 3, 6, 10, 10, 2]);
});

// §14: the stress view's full layout and SVG, an edit that moves nothing (documentation), and the common edits
test('§14\'s budgets on bpmn-stress.json\'s all: a full layout and its SVG under 1 s; documentation and the four common edits, laid out and drawn, under CI\'s 1 s ceiling, the 100 ms target printed; documentation lays nothing out (CPU, best of five after a warm-up) (timed)', () => {
  const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const M = FIX['bpmn-stress'], g0 = layout(M, 'all'), band = id => g0.bands.find(b => b.id === id), v = V(M, 'all');
  const edits = { documentation: [{ op: 'set', id: 'P0n1', path: 'props.documentation', value: 'Checked twice.' }],
    'a task renamed': [{ op: 'set', id: 'P1n7', path: 'label', value: 'Check the order against the stock ledger' }],
    'a sequence flow\'s name': [{ op: 'set', id: 's-P0n3', path: 'label', value: 'when the stock is short' }],
    'a flow node moved to another lane': bzMoveTo(M, v, 'P0n13', { pt: [band('c').x + band('c').w / 2, band('c').y + band('c').h / 2], geo: g0 }),
    'a boundary event\'s side': bzMoveTo(M, v, 'be0', { by: [0, -1], geo: g0 }) };
  const draw = (m, memos) => mapContext(m, { memos }).buildView('all').markup;
  const memos = {}; draw(M, memos); Object.values(edits).forEach(c => { draw(apply(M, c), memos); draw(M, memos); });
  const best = { 'full layout and SVG': Math.min(...[0, 1, 2, 3, 4].map(() => cpu(() => draw(M, {})))) };
  for (const [name, c] of Object.entries(edits)) { const m = apply(M, c), t = []; for (let k = 0; k < 5; k++) { draw(M, memos); t.push(cpu(() => draw(m, memos))); } best[name] = Math.min(...t); }
  console.log('# P1 (milestone 4b\'s fixtures): ' + Object.entries(best).map(([k, ms]) => `${k} ${ms.toFixed(1)} ms (target ${k.startsWith('full') ? 1000 : 100} ms)`).join(', '));
  for (const [k, ms] of Object.entries(best)) assert.ok(ms < 1000, `${k} ${ms} ms`);
  draw(M, memos); const runs = memos.all.runs; draw(apply(M, edits.documentation), memos);
  assert.equal(memos.all.runs, runs, 'documentation lays nothing out');
});

test('the PDF\'s tables: each element\'s word and rows (DoD 7)', () => {
  const m = FIX.example, ctx = mapContext(m), rows = tablesOf(ctx, ctx.V['order-to-shipment'], ctx.buildGeo('order-to-shipment'));
  const txt = JSON.stringify(rows);
  for (const w of ['Service task', 'Timer boundary event', 'Exclusive gateway', 'Pool', 'Sub-process (collapsed)', 'on Take payment', 'in Sales', 'Nothing to refund: no payment was taken.']) assert.ok(txt.includes(w), w);
  assert.deepEqual(rows.map(t => t.title.replace(/ <span>.*/, '')), ['Elements', 'Lines', 'Boxes']);
  assert.ok(txt.includes('Take payment → Payment provider</td><td>Charge request</td><td>Message flow'), 'a line\'s ends, name and kind');
});

test('the example moved and renamed (§13): every reference with its id, check.mjs clean, its problems as before (none), its view in the atlas', () => {
  const m = FIX.example, R = ['shopper', 'bookshop', 'sales', 'warehouse', 'take-payment', 'join', 'ship', 'payment-provider', 'order', 'stock', 'f-charged', 'f-paid', 'f-declined',
    'f-to-pick', 'f-packed', 'f-wait', 'f-done', 'm-charge'];
  const ids = [...m.nodes.flatMap(n => [n, ...(n.members || [])]), ...m.edges].map(x => x.id);
  assert.deepEqual(R.filter(id => ids.includes(id)), [], 'no old id left');
  assert.ok(R.every(id => ids.includes('bp-' + id)), 'each renamed with bp-');
  const refs = [...m.nodes.flatMap(n => [n.parent, n.opensView, n.props?.attachedTo, ...(n.props?.categoryValueRef || [])]), ...m.edges.flatMap(e => [e.from, e.to]), ...m.views.flatMap(v => [...v.nodeIds, v.subject, v.parent])].filter(x => x != null);
  assert.deepEqual(refs.filter(r => !ids.includes(r) && !m.views.some(v => v.id === r)), [], 'every reference names an element or a view');
  assert.equal(node(m, 'payment-timeout').props.attachedTo, 'bp-take-payment');
  assert.deepEqual(said(m), [], 'no problem, as 24-bpmn.json had none');
  const [f, url] = targets().find(([x]) => x === '24-bpmn.json');
  assert.ok(url.href.endsWith('/examples/bookshop-order-to-shipment.json'), f);
  assert.deepEqual(checkTarget(m, 'bpmn'), []);
  assert.deepEqual(m.nodes.filter(n => n.props?.documentation).map(n => n.id), ['cancel-order', 'send-invoice'], 'documentation on two elements (§3.1)');
  const atlas = read('../examples/bookshop-atlas.json');
  assert.equal(atlas.nodes.find(n => n.id === 'track').opensView, 'order-to-shipment', 'Track an order opens the process (S17)');
});

test('DoD 1: the registry holds bpmn, and the JSON Schema and the types name its vocabulary', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema).$defs, np = S.node.properties.props.anyOf[0].properties, ep = S.edge.properties.props.anyOf[0].properties;
  assert.ok(S.view.properties.diagram.examples.includes('bpmn') && dts.includes("'bpmn'"));
  for (const t of [...T.elements, ...T.lines].map(x => x.type).concat(['bpmn.SequenceFlow', 'bpmn.MessageFlow', 'bpmn.Association', 'bpmn.DataAssociation']))
    assert.ok(schema.includes(`"${t}"`) && dts.includes(`'${t}'`), t);
  for (const [t, fields] of Object.entries(T.props)) for (const f of fields) { const k = f.key.split('.').at(-1); assert.ok(np[k] || ep[k], `${t}'s ${f.key} in the schema`); }
  assert.ok(['BpmnElementType', 'BpmnLineType', 'BpmnElementProps'].every(k => new RegExp(`export (type|interface) ${k} `).test(dts)));
  assert.match(np.definition.description, /terminate/);
});
