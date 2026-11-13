// The composite structure diagram, uml.composite-structure (work package 5.6, notes/stage-5.md §6, §10.2): the type's
// definition, the part, collaboration use and open collaboration shapes, the subject's box with its ports, ports on parts
// (`<part>-><port>`), inner connectors, the type's own ranking, accessible names, reading order, the legend, describe(),
// the validators, the editing hooks, deleting a part with its connectors, a 30-step session saved and reopened, the PDF's
// rows and the common edit's time. tests/composite.html draws it in a browser and edits it by pointer and keyboard.
// Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { csParse, csRow } from '../src/uml/composite.js';

const CS = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/04-composite-structure.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.composite-structure' }), V = CS.views[0];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x - .01 && o.y >= f.y - .01 && o.x + o.w <= f.x + f.w + .01 && o.y + o.h <= f.y + f.h + .01;
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
// the layout check, less what it says of a port on its own owner, which sits half inside it by design (§4.1; decision 22): a
// report is dropped only when no other pair of nodes with those labels overlaps (the check's own test, src/layout/audit.js)
const hit1 = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
const issues = (m, vid) => { const N = layout(m, vid).nodes, mine = (a, b) => a.owner === b.id || b.owner === a.id;
  return check(m, vid).map(x => x.message).filter(s => { const k = /nodes "(.*)" and "(.*)" overlap$/.exec(s);
    return !k || N.some(a => a.label === k[1] && N.some(b => b !== a && b.label === k[2] && hit1(a, b) && !mine(a, b))); }); };
const P = (id, label, more = {}) => ({ id, type: 'uml.Property', label, ...more });
const port = (id, label = id.split('.').pop(), props) => ({ id, type: 'uml.Port', label, ...(props ? { props } : {}) });
const con = (id, from, to, ends) => ({ id, type: 'uml.Connector', from, to, ...(ends ? { props: { ends } } : {}) });
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
const node = (m, id) => m.nodes.find(n => n.id === id);
const mem = (m, id) => m.nodes.flatMap(n => n.members || []).find(x => x.id === id);
// G2: two parts of one type, each with its own connector to the type's port
function twins() {
  return { schemaVersion: 2, nodes: [
    { id: 'shop', type: 'uml.Component', label: 'Shop', members: [port('shop.in'), P('shop.a', 'a', { props: { valueType: 'Worker' } }), P('shop.b', 'b', { props: { valueType: 'Worker' } }), P('shop.c', 'c', { props: { valueType: 'Store' } })] },
    { id: 'worker', type: 'uml.Class', label: 'Worker', members: [port('worker.job', 'job', { valueType: 'Jobs' }), port('worker.idle', 'idle')] },
    { id: 'store', type: 'uml.Class', label: 'Store', members: [port('store.put', 'put')] }],
  edges: [con('in-a', 'shop.in', 'worker.job', { to: { part: 'shop.a' } }), con('in-b', 'shop.in', 'worker.job', { to: { part: 'shop.b' } }),
    con('b-c', 'worker.idle', 'store.put', { from: { part: 'shop.b' }, to: { part: 'shop.c' } })],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'shop', nodeIds: ['shop'] }] };
}

test('the definition: uml.composite-structure with its palette, three lines, §12.2\'s properties, the cascade on a part and its hooks', () => {
  assert.equal(T.name, 'uml.composite-structure');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.Property', 'Part'], ['uml.Port', 'Port'], ['uml.Property', 'Role'], ['uml.CollaborationUse', 'Collaboration use'], ['uml.Collaboration', 'Collaboration'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => e.label), ['Connector', 'Role binding', 'Comment link']);
  assert.deepEqual(T.props['uml.Property'].map(f => [f.key, f.kind]), [['valueType', 'text'], ['multiplicity', 'text'], ['aggregation', 'enum'], ['stereotypes', 'list']]);
  assert.deepEqual(T.props['uml.Port'].map(f => f.key), ['valueType', 'stereotypes']); assert.deepEqual(T.props['uml.CollaborationUse'].map(f => f.key), ['collaboration', 'stereotypes']);
  assert.deepEqual(T.refs, { 'uml.Connector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } });
  assert.equal(T.layout.rank, false, 'the type ranks its parts: the host passes the pins alone');
  for (const k of ['layout', 'validate', 'describe', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'member', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(['uml.Class', 'uml.Component', 'uml.Collaboration', 'uml.Interface'].map(t => T.member.holds({ type: t })), [true, true, true, false]);
  assert.deepEqual(Object.keys(T.rules), ['subject-shown', 'part-type', 'connector-part', 'connector-scope', 'connector-drawn', 'binding-ends', 'binding-role', 'collaboration-named', 'port-owner', 'manifest-ends']);
});

test('the shapes: a part (dashed when shared), a collaboration use (a dashed ellipse), an open collaboration\'s frame', () => {
  const p = { id: 'p', label: 'checkout : Checkout [1]' }, s = SHAPE.part.size(p);
  assert.equal(s.h, 48); assert.ok(s.w >= 96 && s.w <= 320);
  assert.equal(SHAPE.part.size({ label: 'x'.repeat(200) }).w, 320, 'a long text is cut');
  const d = SHAPE.part.draw({ ...p, ...s, x: 0, y: 0, shared: true }, 'var(--um-muted)', 'var(--um-panel)');
  assert.match(d, /^<g class="node part" data-id="p" data-shape="part"[^>]*aria-label="Part checkout : Checkout \[1\]">/);
  assert.match(d, /class="n-body"[^>]*stroke-dasharray="6 4"/); assert.doesNotMatch(SHAPE.part.draw({ ...p, ...s, x: 0, y: 0 }, 'c', 'f'), /dasharray/);
  assert.match(d, /data-o="p">checkout : Checkout \[1\]</, 'renamed in place');
  const u = SHAPE['collab-use'].draw({ id: 'u', label: 'events : PubSub', x: 0, y: 0, ...SHAPE['collab-use'].size({ label: 'events : PubSub' }) }, 'c', 'f');
  assert.match(u, /^<g class="node collab-use"/); assert.match(u, /class="n-body" stroke-dasharray="6 4"/);
  const f = SHAPE.collaboration.frame({ id: 'c', title: 'PublishSubscribe', x: 0, y: 0, w: 400, h: 200 });
  assert.match(f, /^<ellipse class="family-box" cx="200" cy="100" rx="200" ry="100"[^>]*stroke-dasharray="6 4"\/><text class="family-title"[^>]*data-t="ft" data-o="c">PublishSubscribe<\/text><path d="M[\d.]+ [\d.]+H[\d.]+"/);
  const [, x0, y, x1] = f.match(/<path d="M([\d.]+) ([\d.]+)H([\d.]+)"/).map(Number);
  assert.ok(Math.abs(((x0 - 200) / 200) ** 2 + ((y - 100) / 100) ** 2 - 1) < .01 && Math.abs(x0 + x1 - 400) < .01, 'the rule under the name meets the ellipse at both ends');
});

test('a part\'s text, `name : Type [multiplicity]`, both ways; a member row is a port, a part or a role by its owner', () => {
  assert.deepEqual(csParse('checkout : Checkout [1]'), { label: 'checkout', valueType: 'Checkout', multiplicity: '1' });
  assert.deepEqual(csParse(' listeners:OrderListener[0..*] '), { label: 'listeners', valueType: 'OrderListener', multiplicity: '0..*' });
  assert.deepEqual(csParse('x'), { label: 'x', valueType: undefined, multiplicity: undefined });
  assert.ok(csParse(': T').error && csParse('a : b : c').error);
  assert.deepEqual(csRow({ type: 'uml.Class' }, 'port api : OrderApi'), { type: 'uml.Port', label: 'api', props: { valueType: 'OrderApi' } });
  assert.deepEqual(csRow({ type: 'uml.Collaboration' }, 'port x'), { type: 'uml.Property', label: 'port x', props: {} }, 'a collaboration owns no port: a role');
  assert.ok(csRow({ type: 'uml.Class' }, 'port api [2]').error, 'a port takes no multiplicity');
  assert.deepEqual(csRow({ type: 'uml.Class' }, 'pricing : PriceCalculator [1]'), { type: 'uml.Property', label: 'pricing', props: { valueType: 'PriceCalculator', multiplicity: '1' } });
  assert.deepEqual(CS.nodes[0].members.map(T.member.print), ['port api', 'port payments', 'checkout : Checkout [1]', 'pricing : PriceCalculator [1]', 'orders : OrderRepository [1]', 'listeners : OrderListener [0..*]']);
});

test('04-composite-structure.json draws: the subject\'s box with its ports, parts with their types\' ports, an inner connector each way, an open collaboration; laid out clean right and down', () => {
  assert.deepEqual(validate(CS).filter(p => p.level === 'error'), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(CS, direction), g = layout(m, 'internals'), by = g.byId, F = Object.fromEntries(g.families.map(f => [f.id, f])), tag = direction;
    assert.deepEqual(issues(m, 'internals'), [], `${tag}: no overlap but a port on its own owner, no crossing, no line through a node`);
    assert.deepEqual(g.families.map(f => [f.id, f.shape, !!f.round]), [['order-service', 'subject', false], ['publish-subscribe', 'collaboration', true]]);
    assert.equal(F['order-service'].pad, 48, 'the subject has ports with lines: 48 px of padding (§7)');
    ['order-service.checkout', 'order-service.pricing', 'order-service.orders', 'order-service.listeners', 'order-events'].forEach(id => assert.ok(inside(by[id], F['order-service']), `${tag}: ${id} in the subject`));
    ['publish-subscribe.publisher', 'publish-subscribe.subscriber'].forEach(id => assert.ok(inside(by[id], F['publish-subscribe']), `${tag}: ${id} in its collaboration`));
    assert.deepEqual(['order-service.checkout', 'order-service.listeners', 'order-events', 'publish-subscribe.publisher'].map(id => [by[id].shape, !!by[id].shared]), [['part', false], ['part', true], ['collab-use', false], ['part', false]]);
    const ports = g.nodes.filter(n => n.shape === 'port').map(n => n.id);
    assert.deepEqual(ports, ['order-service.api', 'order-service.payments', 'order-service.checkout->checkout.requests', 'order-service.checkout->checkout.quotes', 'order-service.checkout->checkout.charges', 'order-service.pricing->price-calculator.quotes']);
    // each port centred on its owner's border, on its side, and every line of a port ends on its square within 1 px
    ports.forEach(id => { const n = by[id], o = ownerOf(g, n.owner), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      const on = { L: Math.abs(cx - o.x), R: Math.abs(cx - o.x - o.w), T: Math.abs(cy - o.y), B: Math.abs(cy - o.y - o.h) }[n.side];
      assert.ok(on < .01, `${tag}: ${id} on ${o.id}'s ${n.side} border`); });
    g.edges.forEach(e => [[e.fromPort, e.pts[0]], [e.toPort, e.pts.at(-1)]].forEach(([p, at]) => { if (p == null) return; const b = by[p];
      assert.ok(at[0] >= b.x - 1 && at[0] <= b.x + b.w + 1 && at[1] >= b.y - 1 && at[1] <= b.y + b.h + 1, `${tag}: ${e.id} ends ${at} off ${p}'s square`); }));
    // the inner connectors enter the subject's box at its port only: every later point inside it
    for (const [id, end] of [['api-to-checkout', 'from'], ['checkout-to-payments', 'to']]) { const e = g.edges.find(x => x.id === id), f = F['order-service'], pts = end === 'from' ? e.pts : [...e.pts].reverse();
      assert.equal(e.inner, end); pts.slice(1).forEach(p => assert.ok(p[0] > f.x && p[0] < f.x + f.w && p[1] > f.y && p[1] < f.y + f.h, `${tag}: ${id} at ${p} inside the subject`)); }
    // the role names on their lines, clear of every port name
    const names = g.nodes.filter(n => n.nameBox).map(n => n.nameBox), labels = g.edges.filter(e => e.type === 'uml.RoleBinding').map(e => e.lbl);
    assert.ok(labels.length === 2 && labels.every(Boolean), `${tag}: both role names placed`);
    labels.forEach(l => names.forEach(b => assert.ok(!meets(l, b), `${tag}: "${l.text}" over the port name "${b.text}"`)));
    assert.deepEqual(g.edges.find(e => e.id === 'listeners-are-subscribers').end, { from: 'none', to: 'none', dashed: true });
  }
});

test('two parts of one type each draw the type\'s ports, each with its own connectors (G2); a port only its connectors name is drawn too', () => {
  const g = layout(twins(), 'v'), ports = g.nodes.filter(n => n.shape === 'port');
  assert.deepEqual(ports.map(n => n.id), ['shop.in', 'shop.a->worker.job', 'shop.a->worker.idle', 'shop.b->worker.job', 'shop.b->worker.idle', 'shop.c->store.put']);
  const E = id => g.edges.find(e => e.id === id);
  assert.deepEqual([E('in-a').toPort, E('in-b').toPort, E('b-c').fromPort, E('b-c').toPort], ['shop.a->worker.job', 'shop.b->worker.job', 'shop.b->worker.idle', 'shop.c->store.put']);
  assert.equal(g.byId['shop.a->worker.job'].owner, 'shop.a'); assert.equal(g.byId['shop.b->worker.job'].owner, 'shop.b');
  assert.equal(g.byId['shop.a->worker.job'].nameBox.text, 'job : Jobs', 'its name and type');
  assert.equal(g.byId['shop.a->worker.job'].aria, 'Port job : Jobs of a');
  assert.deepEqual(issues(twins(), 'v'), []);
  // a connector through a part to a port of another type is drawn on that part, and said (connector-part)
  const m = twins(); m.edges.push(con('odd', 'shop.in', 'store.put', { to: { part: 'shop.a' } }));
  assert.ok(layout(m, 'v').byId['shop.a->store.put']);
  assert.deepEqual(validate(m).filter(p => p.rule === 'connector-part').map(p => p.ids), [['odd', 'store.put', 'shop.a']]);
});

test('pins (layout.<id>) stay in their own block\'s columns: a part pinned right, a role pinned left and two pins on one cell overlap nothing', () => {
  for (const [why, pins] of [['a part right', { 'order-service.orders': [6, 0] }], ['a role left', { 'publish-subscribe.publisher': [0, 0] }],
    ['one cell', { 'order-service.pricing': [0, 0], 'order-service.orders': [0, 0] }]]) {
    const m = structuredClone(CS); m.views[0].layout = pins; const g = layout(m, 'internals');
    assert.deepEqual(issues(m, 'internals').filter(s => / overlap$/.test(s)), [], why);
    const [S, C] = ['order-service', 'publish-subscribe'].map(id => g.families.find(f => f.id === id)); assert.ok(S.x + S.w <= C.x, why); }
  const m = structuredClone(CS); m.views[0].layout = { 'order-service.orders': [6, 0] }; const by = layout(m, 'internals').byId;
  assert.ok(by['order-service.orders'].x > Math.max(...['checkout', 'pricing', 'listeners'].map(k => by['order-service.' + k].x)), 'the part pinned right is right of the others');
});

test('present pins a port\'s side, on the subject and on a part; the sides chosen face the far ends; a reorder of the type\'s ports lays out again', () => {
  const m = twins(); m.views[0].present = { 'shop.in': { side: 'bottom' }, 'shop.a': { ports: { 'worker.job': { side: 'top' } } } };
  const g = layout(m, 'v');
  assert.equal(g.byId['shop.in'].side, 'B'); assert.equal(g.byId['shop.a->worker.job'].side, 'T');
  const free = layout(twins(), 'v').byId; // unpinned: the subject's port faces its parts' column, and their ports face back toward it; idle faces c
  assert.deepEqual(['shop.in', 'shop.a->worker.job', 'shop.b->worker.job', 'shop.b->worker.idle', 'shop.c->store.put'].map(id => free[id].side), ['L', 'L', 'L', 'R', 'L']);
  const memos = {}, ctx = mm => mapContext(mm, { memos }).buildView('v');
  ctx(twins()); const r = memos.v.runs, w = twins(); w.nodes[1].members.reverse(); ctx(w);
  assert.equal(memos.v.runs, r + 1, 'portRank is in the geometry key');
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup; the memo holds no port node', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(CS, { memos }).buildView('internals'), pts = JSON.stringify(memos.internals.g.edges.map(e => e.pts));
  const second = mapContext(CS, { memos }).buildView('internals');
  assert.equal(memos.internals.runs, 1); assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos.internals.g.edges.map(e => e.pts)), pts, 'the line ends slid onto the squares on a copy');
  assert.ok(!memos.internals.g.nodes.some(n => n.shape === 'port'));
  assert.equal(unid(mapContext(CS).buildView('internals').markup), unid(first.markup), 'and afresh');
});

test('names, reading order, legend and describe() (§10.2, §11, A1)', () => {
  const g = layout(CS, 'internals'), by = g.byId, F = g.families.find(f => f.id === 'order-service');
  assert.equal(F.aria, 'Class OrderService, 2 ports, holding 4 parts, 1 collaboration use');
  assert.equal(g.families.find(f => f.id === 'publish-subscribe').aria, 'Collaboration PublishSubscribe, holding 2 roles');
  assert.equal(by['order-service.checkout'].aria, 'Part checkout : Checkout [1], in OrderService, 3 ports');
  assert.equal(by['order-service.listeners'].aria, 'Part listeners : OrderListener [0..*], shared, in OrderService');
  assert.equal(by['publish-subscribe.publisher'].aria, 'Role publisher : EventSource [1], in PublishSubscribe');
  assert.equal(by['order-events'].aria, 'Collaboration use orderEvents : PublishSubscribe, binding publisher to checkout, subscriber to listeners');
  assert.equal(by['order-service.api'].aria, 'Port api of OrderService'); assert.equal(by['order-service.checkout->checkout.quotes'].aria, 'Port quotes of checkout');
  const E = Object.fromEntries(g.edges.map(e => [e.id, e.aria]));
  assert.equal(E['api-to-checkout'], 'Connector from api of OrderService to requests of checkout');
  assert.equal(E['checkout-is-publisher'], 'Role binding from checkout to orderEvents, as publisher');
  assert.deepEqual(g.order.slice(0, 7), ['order-service', 'order-service.api', 'order-service.payments', 'order-service.checkout', 'order-service.checkout->checkout.requests', 'order-service.checkout->checkout.quotes', 'order-service.checkout->checkout.charges']);
  assert.equal(g.order.length, 15 + 8); assert.deepEqual(g.order.slice(-8), CS.edges.map(e => e.id));
  assert.deepEqual(g.legend.map(s => s.match(/<b>(.*?)<\/b>/)[1]), ['Connector', 'Role binding']);
  const said = describe(CS, 'internals').split('\n');
  assert.equal(said[0], 'Inside OrderService: a composite structure diagram of 15 elements and 8 lines.');
  assert.equal(said[1], 'Class OrderService, 2 ports, holding 4 parts, 1 collaboration use.');
  assert.equal(said.length, 1 + 15 + 8); assert.equal(said.at(-1), 'Role binding from listeners to orderEvents, as subscriber.');
});

/* ---- validators: each rule's failing case; the example breaks none at error level ---- */
const RULE_CASES = {
  'subject-shown': m => { m.views[0].subject = 'checkout'; },
  'part-type': m => { mem(m, 'order-service.pricing').props.valueType = 'Nobody'; },
  'connector-part': m => { m.edges[0].props.ends.to.part = 'order-service.pricing'; },
  'connector-scope': m => { m.edges.push(con('across', 'order-service.checkout', 'publish-subscribe.publisher')); },
  'connector-drawn': m => { m.edges.push(con('loop', 'order-service.api', 'order-service.payments')); },
  'binding-ends': m => { m.edges.push({ id: 'bad-binding', type: 'uml.RoleBinding', from: 'publish-subscribe.publisher', to: 'order-events', label: 'publisher' }); },
  'binding-role': m => { m.edges.find(e => e.id === 'checkout-is-publisher').label = 'nobody'; },
  'collaboration-named': m => { node(m, 'order-events').props.collaboration = 'Gone'; },
  'port-owner': m => { node(m, 'publish-subscribe').members.push(port('publish-subscribe.p')); },
};
test('validators: each rule passes the example and fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  const base = validate(CS).map(p => p.rule);
  assert.deepEqual(base, ['part-type', 'part-type'], 'the example\'s two parts typed by classes it does not hold');
  const LEVEL = { 'part-type': 'warning', 'connector-drawn': 'warning', 'binding-role': 'warning', 'collaboration-named': 'warning' };
  for (const [rule, breakIt] of Object.entries(RULE_CASES)) { const m = structuredClone(CS); breakIt(m);
    const got = validate(m).filter(p => p.rule === rule && (rule !== 'part-type' || p.ids[0] === 'order-service.pricing'));
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(validate(m))}`); assert.equal(got[0].level, LEVEL[rule] || 'error', rule);
    assert.ok(got[0].message.startsWith(rule + ': ') && got[0].ids.length, rule); }
  assert.deepEqual(Object.keys(RULE_CASES).filter(r => r !== 'port-owner').sort(), Object.keys(T.rules).filter(r => !['port-owner', 'manifest-ends'].includes(r)).sort());
  assert.deepEqual(validate(twins()), [], 'the G2 model is clean');
  assert.match(validate(CS)[0].message, /names no class or component, so it shows only the ports its connectors reach through it$/);
  // a connector's end is a part or a port, never the subject itself (UML 2.5.1 §11.2); one between two of its ports is not drawn, nor described
  const bare = structuredClone(CS); bare.edges.push(con('bare', 'order-service', 'order-service.pricing'));
  assert.deepEqual(validate(bare).filter(p => p.rule === 'connector-scope').map(p => [p.path, p.ids]), [['edges[8].from', ['bare', 'order-service']]]);
  const loop = structuredClone(CS); RULE_CASES['connector-drawn'](loop);
  assert.ok(!layout(loop, 'internals').edges.some(e => e.id === 'loop')); assert.doesNotMatch(describe(loop, 'internals'), /from api of OrderService to payments/);
  // a communication view's connectors between lifelines are no structure's: not checked
  const m = twins(); m.nodes.push({ id: 'l1', type: 'uml.Lifeline' }, { id: 'l2', type: 'uml.Lifeline' }); m.edges.push(con('talk', 'l1', 'l2'));
  assert.deepEqual(validate(m).filter(p => p.rule === 'connector-scope'), []);
});

/* ---- editing (§6, §12) ---- */
const run = (m, r) => apply(m, Array.isArray(r) ? r : r.commands);
test('connect: a connector from a port on a part keeps the part (ends.<end>.part); a role binding\'s role is picked; a part\'s port joins nothing else', () => {
  const r = T.edits.connect(CS, V, 'order-service.checkout->checkout.quotes', 'order-service.api', null, { type: 'uml.Connector' });
  assert.deepEqual(r, [{ op: 'add', element: { id: 'connector', type: 'uml.Connector', from: 'checkout.quotes', to: 'order-service.api', props: { ends: { from: { part: 'order-service.checkout' } } } }, view: 'internals' }]);
  const m = run(CS, r); assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  assert.equal(T.edits.connect(CS, V, 'order-service.orders', 'order-service.pricing', null, { type: 'uml.Connector' }), null, 'part to part: the default');
  const pick = T.edits.connect(CS, V, 'order-events', 'order-service.pricing', null, { type: 'uml.RoleBinding' });
  assert.deepEqual(pick.pick, ['publisher', 'subscriber']);
  assert.deepEqual(pick.then(1), [{ op: 'add', element: { id: 'binding', type: 'uml.RoleBinding', from: 'order-service.pricing', to: 'order-events', label: 'subscriber' }, view: 'internals' }], 'drawn from the use: turned to run from the part');
  assert.ok(T.edits.connect(CS, V, 'order-service.pricing', 'order-service.orders', null, { type: 'uml.RoleBinding' }).error);
  assert.ok(T.edits.connect(CS, V, 'order-service.checkout->checkout.quotes', 'order-events', null, { type: 'uml.CommentLink', label: 'Comment link' }).error);
});

test('moveTo: a port dropped goes to the side nearest the drop, Alt + an arrow across its side moves it; along its side, said; a part, or a panel row\'s ↑ ↓, the default', () => {
  const geo = layout(CS, 'internals'), p = geo.byId['order-service.checkout->checkout.quotes'], o = geo.byId['order-service.checkout'];
  assert.deepEqual(T.edits.moveTo(CS, V, p.id, { pt: [o.x + o.w / 2, o.y - 2], geo }), [{ op: 'set', view: 'internals', path: ['present', 'order-service.checkout', 'ports', 'checkout.quotes', 'side'], value: 'top' }]);
  const s = geo.byId['order-service.api'];
  assert.deepEqual(T.edits.moveTo(CS, V, s.id, { by: [0, 1], geo }), { error: 'A port\'s place along its side follows its lines and is not stored: Alt + an arrow across the side moves it to another side' });
  assert.deepEqual(T.edits.moveTo(CS, V, s.id, { by: [1, 0], geo }), [{ op: 'set', view: 'internals', path: ['present', 'order-service.api', 'side'], value: 'right' }]);
  assert.ok(T.edits.moveTo(CS, V, s.id, { by: [-1, 0], geo }).error, 'on that side already');
  assert.equal(T.edits.moveTo(CS, V, s.id, { by: [0, 1] }), null, 'the member list\'s own move');
  assert.equal(T.edits.moveTo(CS, V, 'order-service.orders', { pt: [0, 0], geo }), null);
  // applied, the port is drawn on that side
  const m = run(CS, T.edits.moveTo(CS, V, p.id, { pt: [o.x + o.w / 2, o.y - 2], geo }));
  assert.equal(layout(m, 'internals').byId[p.id].side, 'T');
  assert.equal(layout(run(m, T.edits.moveTo(m, m.views[0], s.id, { by: [1, 0], geo: layout(m, 'internals') })), 'internals').byId[s.id].side, 'R');
});

test('add: a part into the subject; a port into the subject, or a selected part\'s type (said); a role into a collaboration; a collaboration use; else { error }', () => {
  const E = l => T.elements.find(e => e.label === l);
  let r = T.edits.add(CS, V, E('Part'), 'audit : AuditLog [0..1]', null);
  assert.deepEqual(r, [{ op: 'add', element: { id: 'order-service.audit', type: 'uml.Property', label: 'audit', props: { valueType: 'AuditLog', multiplicity: '0..1' } }, owner: 'order-service' }]);
  assert.ok(layout(run(CS, r), 'internals').byId['order-service.audit'], 'drawn in the subject');
  r = T.edits.add(CS, V, E('Port'), 'admin : AdminApi', { sel: ['order-service'] });
  assert.deepEqual(r, [{ op: 'add', element: { id: 'order-service.admin', type: 'uml.Port', label: 'admin', props: { valueType: 'AdminApi' } }, owner: 'order-service' }]);
  r = T.edits.add(CS, V, E('Port'), 'audit', { sel: ['order-service.checkout->checkout.quotes'] });
  assert.equal(r.say, 'Added the port to Checkout, the type of checkout: every part of that type shows it'); assert.equal(r.commands[0].owner, 'checkout');
  assert.ok(layout(run(CS, r), 'internals').byId['order-service.checkout->checkout.audit']);
  assert.ok(T.edits.add(CS, V, E('Port'), 'x', { sel: ['order-service.orders'] }).error, 'its type names no class');
  assert.ok(T.edits.add(CS, V, E('Port'), 'x', { sel: [] }).error); assert.ok(T.edits.add(CS, V, E('Port'), 'x', { sel: ['publish-subscribe'] }).error);
  r = T.edits.add(CS, V, E('Role'), 'broker : Broker', { sel: ['publish-subscribe'] }); assert.equal(r[0].owner, 'publish-subscribe');
  assert.ok(T.edits.add(CS, V, E('Role'), 'broker', { sel: ['order-service'] }).error);
  r = T.edits.add(CS, V, E('Collaboration use'), 'audit : PublishSubscribe', null);
  assert.deepEqual(r, [{ op: 'add', element: { id: 'audit', type: 'uml.CollaborationUse', label: 'audit', parent: 'order-service', props: { collaboration: 'PublishSubscribe' } }, view: 'internals' }]);
  assert.ok(layout(run(CS, r), 'internals').families[0].nodeIds.includes('audit'));
  assert.equal(T.edits.add(CS, V, E('Comment'), 'note', null), null);
});

test('remove: a part goes from the model with its connectors (refs cascade), said; Delete on a port on a part deletes the connectors through it, Shift + Delete the port', () => {
  let r = T.edits.remove(CS, V, ['order-service.checkout'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'order-service.checkout' }]);
  assert.equal(r.say, 'Deleted part checkout of OrderService and its 6 lines (a member is not hidden: it goes from the model)');
  const m = run(CS, r);
  assert.deepEqual(m.edges.map(e => e.id), ['publisher-to-subscriber', 'listeners-are-subscribers'], 'its connectors, through it or to it, and its role binding go with it');
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  r = T.edits.remove(CS, V, ['order-service.checkout->checkout.quotes'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'checkout-to-pricing' }]);
  assert.match(r.say, /the 1 connector through checkout to its port quotes; Shift \+ Delete deletes the port from Checkout/);
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.checkout->checkout.quotes'], true).commands, [{ op: 'delete', id: 'checkout.quotes' }]);
  assert.ok(T.edits.remove(run(CS, r), V, ['order-service.checkout->checkout.quotes'], false).error, 'no connector left to delete');
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.api', 'publish-subscribe'], false).commands, [{ op: 'hide', id: 'publish-subscribe', view: 'internals' }, { op: 'delete', id: 'order-service.api' }]);
  assert.equal(T.edits.remove(CS, V, ['publish-subscribe'], false), null, 'a node alone: the default');
  // a line selected with a part: hidden where the view lists its lines, said where it shows them all (as the canvas); hidden first
  r = T.edits.remove(CS, V, ['order-service.pricing', 'publisher-to-subscriber'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'order-service.pricing' }]);
  assert.match(r.say, /; not the line publisher-to-subscriber: this view shows every line between its cards, and Shift \+ Delete deletes it$/);
  const listed = structuredClone(CS); listed.views[0].edges = listed.edges.map(e => e.id);
  r = T.edits.remove(listed, listed.views[0], ['order-service.pricing', 'checkout-to-pricing', 'publisher-to-subscriber'], false);
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'checkout-to-pricing', view: 'internals' }, { op: 'hide', id: 'publisher-to-subscriber', view: 'internals' }, { op: 'delete', id: 'order-service.pricing' }]);
  assert.deepEqual(run(listed, r).views[0].edges, listed.views[0].edges.filter(id => !['checkout-to-pricing', 'publisher-to-subscriber'].includes(id)));
  r = T.edits.remove(listed, listed.views[0], ['order-service.pricing->price-calculator.quotes', 'publisher-to-subscriber'], false);
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'publisher-to-subscriber', view: 'internals' }, { op: 'delete', id: 'checkout-to-pricing' }], 'a port\'s connectors and the line');
  const tw = twins(); tw.views[0].edges = ['in-a', 'in-b', 'b-c'];
  assert.deepEqual(T.edits.remove(tw, tw.views[0], ['shop.a->worker.idle', 'b-c'], false).commands, [{ op: 'hide', id: 'b-c', view: 'v' }], 'a port with no connector and a line: the line');
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.pricing', 'publisher-to-subscriber'], true).commands.map(c => c.id), ['order-service.pricing', 'publisher-to-subscriber']);
});

test('rename: F2 on a port on a part renames its class\'s port (said), keeping its type; on a part, its row sets name, type and multiplicity', () => {
  const m = structuredClone(CS); mem(m, 'checkout.quotes').props = { valueType: 'Quotes' };
  const r = T.edits.rename(m, m.views[0], 'order-service.checkout->checkout.quotes', 'prices');
  assert.deepEqual(r, { commands: [{ op: 'set', id: 'checkout.quotes', path: 'label', value: 'prices' }], say: 'Renamed Checkout\'s port: every part of that type shows it' });
  assert.deepEqual(T.edits.rename(CS, V, 'order-service.pricing', 'pricer : PriceCalculator [0..1]'), [{ op: 'set', id: 'order-service.pricing', path: 'label', value: 'pricer' }, { op: 'set', id: 'order-service.pricing', path: 'props.multiplicity', value: '0..1' }]);
  assert.ok(T.edits.rename(CS, V, 'order-service.pricing', ': x').error);
  assert.equal(T.edits.rename(CS, V, 'order-events', 'x'), null);
});

test('member rows (edits.member): on the subject `port name : Type` is a port and any other row a part; on a collaboration a role; an edit keeps the member\'s kind', () => {
  assert.deepEqual(T.edits.member(CS, V, 'order-service', null, 'port admin : AdminApi'), [{ op: 'add', element: { id: 'order-service.admin', type: 'uml.Port', label: 'admin', props: { valueType: 'AdminApi' } }, owner: 'order-service' }]);
  assert.deepEqual(T.edits.member(CS, V, 'order-service', null, 'audit : AuditLog')[0].element.type, 'uml.Property');
  assert.deepEqual(T.edits.member(CS, V, 'publish-subscribe', null, 'broker : Broker [1]')[0], { op: 'add', element: { id: 'publish-subscribe.broker', type: 'uml.Property', label: 'broker', props: { valueType: 'Broker', multiplicity: '1' } }, owner: 'publish-subscribe' });
  assert.deepEqual(T.edits.member(CS, V, 'order-service', 'order-service.api', 'port gateway : Api'), [{ op: 'set', id: 'order-service.api', path: 'label', value: 'gateway' }, { op: 'set', id: 'order-service.api', path: 'props.valueType', value: 'Api' }]);
  assert.deepEqual(T.edits.member(CS, V, 'order-service', 'order-service.orders', 'orders : OrderStore [1]'), [{ op: 'set', id: 'order-service.orders', path: 'props.valueType', value: 'OrderStore' }]);
  assert.ok(T.edits.member(CS, V, 'order-service', null, 'port x [2]').error);
  assert.equal(T.edits.member(CS, V, 'order-events', null, 'x'), null);
  assert.deepEqual(T.member.edit(mem(CS, 'order-service.orders'), 'repo : OrderRepository [1]'), { commands: [{ op: 'set', id: 'order-service.orders', path: 'label', value: 'repo' }] });
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = l => T.elements.find(e => e.label === l), steps = [];
  for (let i = 0; i < 5; i++) { const w = steps.reduce((m, s) => apply(m, s), CS), v = w.views[0];
    const part = T.edits.add(w, v, E('Part'), `p${i} : Checkout [1]`, null), pid = part[0].element.id, w2 = apply(w, part);
    const c = T.edits.connect(w2, w2.views[0], `${pid}->checkout.requests`, 'order-service.api', null, { type: 'uml.Connector' }).map(x => ({ ...x, element: { ...x.element, id: `c${i}` } }));
    steps.push(part, c, T.edits.member(w2, w2.views[0], 'order-service', null, `port q${i}`),
      T.edits.rename(w2, w2.views[0], pid, `r${i} : Checkout [0..1]`),
      T.edits.moveTo(w2, w2.views[0], 'order-service.api', { by: [0, i % 2 ? 1 : -1] }) || [{ op: 'set', view: 'internals', path: ['present', 'order-service.api', 'side'], value: i % 2 ? 'bottom' : 'top' }],
      i % 2 ? T.edits.remove(w2, w2.views[0], [pid], false).commands : [{ op: 'set', id: pid, path: 'props.aggregation', value: 'shared' }]);
  }
  assert.equal(steps.length, 30);
  const h = history(CS), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, 'internals')), flat(layout(JSON.parse(seen[30]), 'internals')));
  assert.equal(describe(reopened, 'internals'), describe(JSON.parse(seen[30]), 'internals'));
});

test('the PDF\'s tables (§11): a part\'s and a role\'s kind and rows, a collaboration use with its collaboration and bindings', () => {
  assert.deepEqual(['order-service.checkout', 'publish-subscribe.publisher', 'order-service.api', 'order-events', 'order-service', 'nope'].map(id => T.word(CS, id)), ['Part', 'Role', 'Port', 'Collaboration use', null, null]);
  assert.deepEqual(T.rows(CS, V, 'order-service.listeners'), ['listeners : OrderListener [0..*]', 'shared']);
  assert.deepEqual(T.rows(CS, V, 'order-events'), ['PublishSubscribe', 'publisher ← checkout', 'subscriber ← listeners']);
  assert.equal(T.rows(CS, V, 'order-service'), null);
  const ctx = mapContext(CS), [els] = tablesOf(ctx, ctx.V[V.id], ctx.buildGeo(V.id));
  assert.ok(els.rows.some(r => /Collaboration use/.test(r) && /publisher ← checkout/.test(r)), els.rows.join('\n'));
});

/* ---- P1 (§14): a subject of 30 parts, 50 connectors, 20 ports on parts, its common edit a part's type changed ---- */
function stress() {
  const classes = Array.from({ length: 5 }, (_, k) => ({ id: `t${k}`, type: 'uml.Class', label: `Type${k}`, members: [port(`t${k}.a`, 'a'), port(`t${k}.b`, 'b')] }));
  const parts = Array.from({ length: 30 }, (_, i) => P(`s.p${i}`, `part${i}`, { props: { valueType: i < 10 ? `Type${i % 5}` : `Plain${i}`, multiplicity: '1' } }));
  const edges = [];
  for (let i = 0; i < 10; i++) edges.push(con(`x${i}`, `t${i % 5}.a`, `t${(i + 1) % 5}.b`, { from: { part: `s.p${i}` }, to: { part: `s.p${(i + 1) % 10}` } }));
  for (let i = 0; edges.length < 50; i++) edges.push(con(`y${i}`, `s.p${10 + (i % 20)}`, `s.p${10 + ((i * 7 + 3) % 20)}`));
  return { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.Class', label: 'Big', members: [port('s.in'), ...parts] }, ...classes],
    edges: edges.filter(e => e.from !== e.to), views: [{ id: 'all', diagram: 'uml.composite-structure', subject: 's', nodeIds: ['s'] }] };
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('P1 (§14): 30 parts, 50 connectors, 20 ports on parts: a part\'s type changed, laid out and drawn, and a full layout each under 1 s in CI, the edit\'s time against the 100 ms target printed (CPU, best of seven after a warm-up; the maintainer\'s decision of 13 Nov 2026) (timed)', () => {
  const M = stress(), memos = {}, draw = m => mapContext(m, { memos }).buildView('all').markup;
  assert.equal(M.nodes[0].members.length - 1, 30); assert.ok(M.edges.length >= 48);
  assert.equal(layout(M, 'all').nodes.filter(n => n.shape === 'port' && n.owner !== 's').length, 20);
  const edit = k => apply(M, [{ op: 'set', id: 's.p12', path: 'props.valueType', value: 'Plain' + 'x'.repeat(k + 1) }]);
  draw(M); draw(edit(20)); // the warm-up
  const runs = Array.from({ length: 7 }, (_, k) => { const was = memos.all.runs, m = edit(k);
    const r = { full: cpu(() => mapContext(M).buildView('all')), type: cpu(() => draw(m)) }; assert.equal(memos.all.runs, was + 1, 'the edit lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`); assert.ok(best('type') < 1000, `a part's type ${best('type')} ms`);
  console.log(`# P1 composite: a part's type ${best('type').toFixed(1)} ms (target 100 ms), full layout ${best('full').toFixed(1)} ms`);
});

test('the type ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('uml.composite-structure'", 'function csGeo(', 'SHAPE.collaboration = {']) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});
