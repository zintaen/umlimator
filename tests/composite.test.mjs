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
import { svgOf } from '../src/draw/svg.js';
import { tablesOf } from '../src/page/print.js';
import { csParse, csRow } from '../src/uml/composite.js';
import '../src/uml/component.js'; // the spreadPorts tests lay out component views too
import '../src/uml/object.js';
import '../src/uml/deployment.js';
import '../src/uml/activity.js';
import '../src/uml/information.js';

const CS = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.composite-structure' }), V = CS.views[0];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x - .01 && o.y >= f.y - .01 && o.x + o.w <= f.x + f.w + .01 && o.y + o.h <= f.y + f.h + .01;
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
// the layout check: a port on its own owner sits half inside it by design (§4.1) and is not an overlap (decision 22)
const issues = (m, vid) => check(m, vid).map(x => x.message);
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
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'field', 'member', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(['uml.Class', 'uml.Component', 'uml.Collaboration', 'uml.Interface'].map(t => T.member.holds({ type: t })), [true, true, true, false]);
  assert.deepEqual(Object.keys(T.rules), ['subject-shown', 'part-type', 'part-multiplicity', 'connector-part', 'connector-scope', 'connector-drawn', 'binding-ends', 'binding-role', 'collaboration-named', 'present-values', 'own-boxes', 'port-owner', 'manifest-ends']);
});

test('the shapes: a part (dashed when shared), a collaboration use (a dashed ellipse), an open collaboration\'s frame', () => {
  const p = { id: 'p', label: 'checkout : CheckoutFlow [1]' }, s = SHAPE.part.size(p);
  assert.equal(s.h, 48); assert.ok(s.w >= 96 && s.w <= 320);
  assert.equal(SHAPE.part.size({ label: 'x'.repeat(200) }).w, 320, 'a long text is cut');
  const d = SHAPE.part.draw({ ...p, ...s, x: 0, y: 0, shared: true }, 'var(--um-muted)', 'var(--um-panel)');
  assert.match(d, /^<g class="node part" data-id="p" data-shape="part"[^>]*aria-label="Part checkout : CheckoutFlow \[1\]">/);
  assert.match(d, /class="n-body"[^>]*stroke-dasharray="6 4"/); assert.doesNotMatch(SHAPE.part.draw({ ...p, ...s, x: 0, y: 0 }, 'c', 'f'), /dasharray/);
  assert.match(d, /data-o="p">checkout : CheckoutFlow \[1\]</, 'renamed in place');
  const u = SHAPE['collab-use'].draw({ id: 'u', label: 'events : PubSub', x: 0, y: 0, ...SHAPE['collab-use'].size({ label: 'events : PubSub' }) }, 'c', 'f');
  assert.match(u, /^<g class="node collab-use"/); assert.match(u, /class="n-body" stroke-dasharray="6 4"/);
  const f = SHAPE.collaboration.frame({ id: 'c', title: 'PublishSubscribe', x: 0, y: 0, w: 400, h: 200 });
  assert.match(f, /^<ellipse class="family-box" cx="200" cy="100" rx="200" ry="100"[^>]*stroke-dasharray="6 4"\/><text class="family-title"[^>]*data-t="ft" data-o="c">PublishSubscribe<\/text><path d="M[\d.]+ [\d.]+H[\d.]+"/);
  const [, x0, y, x1] = f.match(/<path d="M([\d.]+) ([\d.]+)H([\d.]+)"/).map(Number);
  assert.ok(Math.abs(((x0 - 200) / 200) ** 2 + ((y - 100) / 100) ** 2 - 1) < .01 && Math.abs(x0 + x1 - 400) < .01, 'the rule under the name meets the ellipse at both ends');
});

test('a part\'s text, `name : Type [multiplicity]`, both ways; a member row is a port, a part or a role by its owner', () => {
  assert.deepEqual(csParse('checkout : CheckoutFlow [1]'), { label: 'checkout', valueType: 'CheckoutFlow', multiplicity: '1' });
  assert.deepEqual(csParse(' listeners:OrderListener[0..*] '), { label: 'listeners', valueType: 'OrderListener', multiplicity: '0..*' });
  assert.deepEqual(csParse('x'), { label: 'x', valueType: undefined, multiplicity: undefined });
  assert.deepEqual(csParse(': T [1]'), { label: undefined, valueType: 'T', multiplicity: '1' }, 'an anonymous part, as drawn (audit 17)');
  assert.ok(csParse(':').error && csParse('[1]').error && csParse('a : b : c').error);
  assert.ok(csRow({ type: 'uml.Class' }, ': T', { type: 'uml.Port' }).error, 'a port has a name');
  assert.deepEqual(csRow({ type: 'uml.Class' }, 'port api : OrderApi'), { type: 'uml.Port', label: 'api', props: { valueType: 'OrderApi' } });
  assert.deepEqual(csRow({ type: 'uml.Collaboration' }, 'port x'), { type: 'uml.Property', label: 'port x', props: {} }, 'a collaboration owns no port: a role');
  assert.ok(csRow({ type: 'uml.Class' }, 'port api [2]').error, 'a port takes no multiplicity');
  assert.deepEqual(csRow({ type: 'uml.Class' }, 'pricing : PriceCalculator [1]'), { type: 'uml.Property', label: 'pricing', props: { valueType: 'PriceCalculator', multiplicity: '1' } });
  assert.deepEqual(CS.nodes[0].members.map(T.member.print), ['port api', 'port payments', 'checkout : CheckoutFlow [1]', 'pricing : PriceCalculator [1]', 'orders : OrderRepository [1]', 'listeners : OrderListener [0..*]']);
});

test('04-composite-structure.json draws: the subject\'s box with its ports, parts with their types\' ports, an inner connector each way, an open collaboration; laid out clean right and down', () => {
  assert.deepEqual(validate(CS).filter(p => p.level === 'error'), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(CS, direction), g = layout(m, 'internals'), by = g.byId, F = Object.fromEntries(g.families.map(f => [f.id, f])), tag = direction;
    assert.deepEqual(issues(m, 'internals'), [], `${tag}: no overlap, no crossing, no line through a node`);
    assert.deepEqual(g.families.map(f => [f.id, f.shape, !!f.round]), [['order-service', 'subject', false], ['publish-subscribe', 'collaboration', true]]);
    assert.equal(F['order-service'].pad, 48, 'the subject has ports with lines: 48 px of padding (§7)');
    ['order-service.checkout', 'order-service.pricing', 'order-service.orders', 'order-service.listeners', 'order-events'].forEach(id => assert.ok(inside(by[id], F['order-service']), `${tag}: ${id} in the subject`));
    ['publish-subscribe.publisher', 'publish-subscribe.subscriber'].forEach(id => assert.ok(inside(by[id], F['publish-subscribe']), `${tag}: ${id} in its collaboration`));
    assert.deepEqual(['order-service.checkout', 'order-service.listeners', 'order-events', 'publish-subscribe.publisher'].map(id => [by[id].shape, !!by[id].shared]), [['part', false], ['part', true], ['collab-use', false], ['part', false]]);
    const ports = g.nodes.filter(n => n.shape === 'port').map(n => n.id);
    assert.deepEqual(ports, ['order-service.api', 'order-service.payments', 'order-service.checkout->checkout-class.requests', 'order-service.checkout->checkout-class.quotes', 'order-service.checkout->checkout-class.charges', 'order-service.pricing->price-calculator.quotes']);
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
  assert.equal(by['order-service.checkout'].aria, 'Part checkout : CheckoutFlow [1], in OrderService, 3 ports');
  assert.equal(by['order-service.listeners'].aria, 'Part listeners : OrderListener [0..*], shared, in OrderService');
  assert.equal(by['publish-subscribe.publisher'].aria, 'Role publisher : EventSource [1], in PublishSubscribe');
  assert.equal(by['order-events'].aria, 'Collaboration use orderEvents : PublishSubscribe, binding publisher to checkout, subscriber to listeners');
  assert.equal(by['order-service.api'].aria, 'Port api of OrderService'); assert.equal(by['order-service.checkout->checkout-class.quotes'].aria, 'Port quotes of checkout');
  const E = Object.fromEntries(g.edges.map(e => [e.id, e.aria]));
  assert.equal(E['api-to-checkout'], 'Connector from api of OrderService to requests of checkout');
  assert.equal(E['checkout-is-publisher'], 'Role binding from checkout to orderEvents, as publisher');
  assert.deepEqual(g.order.slice(0, 7), ['order-service', 'order-service.api', 'order-service.payments', 'order-service.checkout', 'order-service.checkout->checkout-class.requests', 'order-service.checkout->checkout-class.quotes', 'order-service.checkout->checkout-class.charges']);
  assert.equal(g.order.length, 15 + 8); assert.deepEqual(g.order.slice(-8), CS.edges.map(e => e.id));
  assert.deepEqual(g.legend.map(s => s.match(/<b>(.*?)<\/b>/)[1]), ['Connector', 'Role binding']);
  const said = describe(CS, 'internals').split('\n');
  assert.equal(said[0], 'Inside OrderService: a composite structure diagram of 15 elements and 8 lines.');
  assert.equal(said[1], 'Class OrderService, 2 ports, holding 4 parts, 1 collaboration use.');
  assert.equal(said.length, 1 + 15 + 8); assert.equal(said.at(-1), 'Role binding from listeners to orderEvents, as subscriber.');
});

/* ---- validators: each rule's failing case; the example breaks none at error level ---- */
const RULE_CASES = {
  'subject-shown': m => { m.views[0].subject = 'checkout-class'; },
  'part-type': m => { mem(m, 'order-service.pricing').props.valueType = 'Nobody'; },
  'part-multiplicity': m => { mem(m, 'order-service.pricing').props.multiplicity = 'many'; }, // audit 5: no rule read it
  'connector-part': m => { m.edges[0].props.ends.to.part = 'order-service.pricing'; },
  'connector-scope': m => { m.edges.push(con('across', 'order-service.checkout', 'publish-subscribe.publisher')); },
  'connector-drawn': m => { m.edges.push(con('loop', 'order-service.api', 'order-service.payments')); },
  'binding-ends': m => { m.edges.push({ id: 'bad-binding', type: 'uml.RoleBinding', from: 'publish-subscribe.publisher', to: 'order-events', label: 'publisher' }); },
  'binding-role': m => { m.edges.find(e => e.id === 'checkout-is-publisher').label = 'nobody'; },
  'collaboration-named': m => { node(m, 'order-events').props.collaboration = 'Gone'; },
  'present-values': m => { m.views[0].present = { ...m.views[0].present, 'order-service.api': { side: 'Top' } }; }, // audit 47
  'port-owner': m => { node(m, 'publish-subscribe').members.push(port('publish-subscribe.p')); },
};
test('validators: each rule passes the example and fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  const base = validate(CS).map(p => p.rule);
  assert.deepEqual(base, ['part-type', 'part-type'], 'the example\'s two parts typed by classes it does not hold');
  const LEVEL = { 'part-type': 'warning', 'part-multiplicity': 'warning', 'connector-drawn': 'warning', 'binding-role': 'warning', 'collaboration-named': 'warning', 'present-values': 'warning' };
  for (const [rule, breakIt] of Object.entries(RULE_CASES)) { const m = structuredClone(CS); breakIt(m);
    const got = validate(m).filter(p => p.rule === rule && (rule !== 'part-type' || p.ids[0] === 'order-service.pricing'));
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(validate(m))}`); assert.equal(got[0].level, LEVEL[rule] || 'error', rule);
    assert.ok(got[0].message.startsWith(rule + ': ') && got[0].ids.length, rule); }
  assert.deepEqual(Object.keys(RULE_CASES).filter(r => r !== 'port-owner').sort(), Object.keys(T.rules).filter(r => !['own-boxes', 'port-owner', 'manifest-ends'].includes(r)).sort());
  assert.deepEqual(validate(twins()), [], 'the G2 model is clean');
  assert.match(validate(CS)[0].message, /names no class or component, so it shows only the ports its connectors reach through it$/);
  // a connector's end is a part or a port, never the subject itself (UML 2.5.1 §11.2); one between two of its ports is not drawn, nor described
  const bare = structuredClone(CS); bare.edges.push(con('bare', 'order-service', 'order-service.pricing'));
  assert.deepEqual(validate(bare).filter(p => p.rule === 'connector-scope').map(p => [p.path, p.ids]), [['edges[8].from', ['bare', 'order-service']]]);
  const loop = structuredClone(CS); RULE_CASES['connector-drawn'](loop);
  assert.ok(!layout(loop, 'internals').edges.some(e => e.id === 'loop')); assert.doesNotMatch(describe(loop, 'internals'), /from api of OrderService to payments/);
  // audit 10: two ports of one part, or of a subject drawn with no box, are not drawn either (the router's loop ignores ports), warned
  const fb = twins(); fb.edges.push(con('fb', 'worker.idle', 'worker.job', { from: { part: 'shop.a' }, to: { part: 'shop.a' } }));
  const nb = twins(); nb.nodes[0].members = [port('shop.in'), port('shop.out')]; nb.edges = [con('fb', 'shop.out', 'shop.in')];
  [fb, nb].forEach((m, k) => { assert.ok(!layout(m, 'v').edges.some(e => e.id === 'fb'), `case ${k}`);
    assert.deepEqual(validate(m).filter(p => p.rule === 'connector-drawn').map(p => p.ids), [['fb', k ? 'shop' : 'shop.a']]); });
  // a communication view's connectors between lifelines are no structure's: not checked
  const m = twins(); m.nodes.push({ id: 'l1', type: 'uml.Lifeline' }, { id: 'l2', type: 'uml.Lifeline' }); m.edges.push(con('talk', 'l1', 'l2'));
  assert.deepEqual(validate(m).filter(p => p.rule === 'connector-scope'), []);
});

/* ---- editing (§6, §12) ---- */
const run = (m, r) => apply(m, Array.isArray(r) ? r : r.commands);
test('connect: a connector from a port on a part keeps the part (ends.<end>.part); a role binding\'s role is picked; a part\'s port joins nothing else', () => {
  const r = T.edits.connect(CS, V, 'order-service.checkout->checkout-class.quotes', 'order-service.api', null, { type: 'uml.Connector' });
  assert.deepEqual(r, [{ op: 'add', element: { id: 'connector', type: 'uml.Connector', from: 'checkout-class.quotes', to: 'order-service.api', props: { ends: { from: { part: 'order-service.checkout' } } } }, view: 'internals' }]);
  const m = run(CS, r); assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  assert.equal(T.edits.connect(CS, V, 'order-service.orders', 'order-service.pricing', null, { type: 'uml.Connector' }), null, 'part to part: the default');
  const pick = T.edits.connect(CS, V, 'order-events', 'order-service.pricing', null, { type: 'uml.RoleBinding' });
  assert.deepEqual(pick.pick, ['publisher', 'subscriber']);
  assert.deepEqual(pick.then(1), [{ op: 'add', element: { id: 'binding', type: 'uml.RoleBinding', from: 'order-service.pricing', to: 'order-events', label: 'subscriber' }, view: 'internals' }], 'drawn from the use: turned to run from the part');
  assert.ok(T.edits.connect(CS, V, 'order-service.pricing', 'order-service.orders', null, { type: 'uml.RoleBinding' }).error);
  assert.ok(T.edits.connect(CS, V, 'order-service.checkout->checkout-class.quotes', 'order-events', null, { type: 'uml.CommentLink', label: 'Comment link' }).error);
});

test('moveTo: a port dropped goes to the side nearest the drop, Alt + an arrow across its side moves it; along its side, said; a part, or a panel row\'s ↑ ↓, the default', () => {
  const geo = layout(CS, 'internals'), p = geo.byId['order-service.checkout->checkout-class.quotes'], o = geo.byId['order-service.checkout'];
  assert.deepEqual(T.edits.moveTo(CS, V, p.id, { pt: [o.x + o.w / 2, o.y - 2], geo }), [{ op: 'set', view: 'internals', path: ['present', 'order-service.checkout', 'ports', 'checkout-class.quotes', 'side'], value: 'top' }]);
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
  // audit 10: the Part entry adds a part whatever its name starts with; 'port name : Type' is the member rows' syntax
  assert.deepEqual(T.edits.add(CS, V, E('Part'), 'port authority : Authority', null), [{ op: 'add', element: { id: 'order-service.port-authority', type: 'uml.Property', label: 'port authority', props: { valueType: 'Authority' } }, owner: 'order-service' }]);
  r = T.edits.add(CS, V, E('Port'), 'admin : AdminApi', { sel: ['order-service'] });
  assert.deepEqual(r, [{ op: 'add', element: { id: 'order-service.admin', type: 'uml.Port', label: 'admin', props: { valueType: 'AdminApi' } }, owner: 'order-service' }]);
  r = T.edits.add(CS, V, E('Port'), 'audit', { sel: ['order-service.checkout->checkout-class.quotes'] });
  assert.equal(r.say, 'Added the port to CheckoutFlow, the type of checkout: every part of that type shows it'); assert.equal(r.commands[0].owner, 'checkout-class');
  assert.ok(layout(run(CS, r), 'internals').byId['order-service.checkout->checkout-class.audit']);
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
  r = T.edits.remove(CS, V, ['order-service.checkout->checkout-class.quotes'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'checkout-to-pricing' }]);
  assert.match(r.say, /the 1 connector through checkout to its port quotes; Shift \+ Delete deletes the port from CheckoutFlow/);
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.checkout->checkout-class.quotes'], true).commands, [{ op: 'delete', id: 'checkout-class.quotes' }]);
  assert.ok(T.edits.remove(run(CS, r), V, ['order-service.checkout->checkout-class.quotes'], false).error, 'no connector left to delete');
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.api', 'publish-subscribe'], false).commands, [{ op: 'hide', id: 'publish-subscribe', view: 'internals' }, { op: 'delete', id: 'order-service.api' }]);
  assert.equal(T.edits.remove(CS, V, ['publish-subscribe'], false), null, 'a node alone: the default');
  // a line selected with a part: hidden where the view lists its lines, said where it shows them all (as the canvas); hidden first
  r = T.edits.remove(CS, V, ['order-service.pricing', 'publisher-to-subscriber'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'order-service.pricing' }]);
  assert.match(r.say, /; not the line publisher-to-subscriber: this view shows every line between its cards, and Shift \+ Delete deletes it$/);
  const listed = structuredClone(CS); listed.views[0].edges = listed.edges.map(e => e.id);
  r = T.edits.remove(listed, listed.views[0], ['order-service.pricing', 'checkout-to-pricing', 'publisher-to-subscriber'], false);
  // the part's line goes with it, counted in its words: not hidden first, nor counted hidden (audit 35)
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'publisher-to-subscriber', view: 'internals' }, { op: 'delete', id: 'order-service.pricing' }]);
  assert.match(r.say, /its 1 line .*; hid 1 element$/);
  assert.deepEqual(run(listed, r).views[0].edges, listed.views[0].edges.filter(id => !['checkout-to-pricing', 'publisher-to-subscriber'].includes(id)));
  r = T.edits.remove(listed, listed.views[0], ['order-service.pricing->price-calculator.quotes', 'publisher-to-subscriber'], false);
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'publisher-to-subscriber', view: 'internals' }, { op: 'delete', id: 'checkout-to-pricing' }], 'a port\'s connectors and the line');
  const tw = twins(); tw.views[0].edges = ['in-a', 'in-b', 'b-c'];
  assert.deepEqual(T.edits.remove(tw, tw.views[0], ['shop.a->worker.idle', 'b-c'], false).commands, [{ op: 'hide', id: 'b-c', view: 'v' }], 'a port with no connector and a line: the line');
  assert.deepEqual(T.edits.remove(CS, V, ['order-service.pricing', 'publisher-to-subscriber'], true).commands.map(c => c.id), ['order-service.pricing', 'publisher-to-subscriber']);
});

test('rename: F2 on a port on a part renames its class\'s port (said), keeping its type; on a part, its row sets name, type and multiplicity', () => {
  const m = structuredClone(CS); mem(m, 'checkout-class.quotes').props = { valueType: 'Quotes' };
  const r = T.edits.rename(m, m.views[0], 'order-service.checkout->checkout-class.quotes', 'prices');
  assert.deepEqual(r, { commands: [{ op: 'set', id: 'checkout-class.quotes', path: 'label', value: 'prices' }], say: 'Renamed CheckoutFlow\'s port: every part of that type shows it' });
  assert.deepEqual(T.edits.rename(CS, V, 'order-service.pricing', 'pricer : PriceCalculator [0..1]'), [{ op: 'set', id: 'order-service.pricing', path: 'label', value: 'pricer' }, { op: 'set', id: 'order-service.pricing', path: 'props.multiplicity', value: '0..1' }]);
  assert.deepEqual(T.edits.rename(CS, V, 'order-service.pricing', ': x'), [{ op: 'set', id: 'order-service.pricing', path: 'label', value: undefined }, { op: 'set', id: 'order-service.pricing', path: 'props.valueType', value: 'x' },
    { op: 'set', id: 'order-service.pricing', path: 'props.multiplicity', value: undefined }], 'no name before the type: an anonymous part (audit 17)');
  assert.ok(T.edits.rename(CS, V, 'order-service.pricing', ' [2]').error, 'neither a name nor a type');
  assert.deepEqual(T.edits.rename(CS, V, 'order-events', 'x'), [{ op: 'set', id: 'order-events', path: 'label', value: 'x' }], 'a collaboration use: name : Collaboration (audit 16)');
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
    const part = T.edits.add(w, v, E('Part'), `p${i} : CheckoutFlow [1]`, null), pid = part[0].element.id, w2 = apply(w, part);
    const c = T.edits.connect(w2, w2.views[0], `${pid}->checkout-class.requests`, 'order-service.api', null, { type: 'uml.Connector' }).map(x => ({ ...x, element: { ...x.element, id: `c${i}` } }));
    steps.push(part, c, T.edits.member(w2, w2.views[0], 'order-service', null, `port q${i}`),
      T.edits.rename(w2, w2.views[0], pid, `r${i} : CheckoutFlow [0..1]`),
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
  // 0.22.0 (5.8): the subject's and an open collaboration's rows, each part with its aggregation; a closed element has none.
  // Their connectors are Lines rows (audit 3 lists a line drawn to a member's owner), not member rows too (audit 17)
  assert.deepEqual(T.rows(CS, V, 'order-service'), ['port api', 'port payments', 'checkout : CheckoutFlow [1], composite', 'pricing : PriceCalculator [1], composite', 'orders : OrderRepository [1], composite',
    'listeners : OrderListener [0..*], shared']);
  assert.deepEqual(T.rows(CS, V, 'publish-subscribe'), ['publisher : EventSource [1]', 'subscriber : EventListener [0..*]']);
  // audit 10: a role has no aggregation, the collaboration shown open or as the subject
  const sub = { ...V, subject: 'publish-subscribe', nodeIds: ['publish-subscribe'], edges: undefined };
  assert.deepEqual(T.rows(CS, sub, 'publish-subscribe'), T.rows(CS, V, 'publish-subscribe'));
  assert.deepEqual(T.rows(CS, sub, 'publish-subscribe.publisher'), ['publisher : EventSource [1]']);
  const ctx = mapContext(CS), [els] = tablesOf(ctx, ctx.V[V.id], ctx.buildGeo(V.id));
  assert.ok(els.rows.some(r => /Collaboration use/.test(r) && /publisher ← checkout/.test(r)), els.rows.join('\n'));
  // audit 10: the view's hand-written containers, which the picture ignores (own-boxes), are in no Boxes table
  const hand = structuredClone(CS); hand.views[0].containers = [{ id: 'hand', label: 'Handwritten', nodeIds: hand.views[0].nodeIds.slice(0, 2) }];
  const hc = mapContext(hand); assert.deepEqual(tablesOf(hc, hc.V[V.id], hc.buildGeo(V.id))[2].rows, []);
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

test('layout() of a subject with a chain of 3,000 parts: ranked without recursion (audit 2)', () => {
  const parts = Array.from({ length: 3000 }, (_, i) => ({ id: 'p' + i, type: 'uml.Property', label: 'p' + i }));
  const edges = parts.slice(1).map((p, i) => ({ id: 'k' + i, type: 'uml.Connector', from: parts[i].id, to: p.id }));
  const g = layout({ schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'S', members: parts }], edges, views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'] }] }, 'v');
  assert.equal(g.nodes.length, 3000); assert.ok(g.nodes[2999].x > g.nodes[0].x);
});

test('a part or port row it prints parses back: a qualified type, an array type, a generic type (audit 4)', () => {
  for (const row of ['a : ns::T [1]', 'a : T[]', 'a : Map<K, V>', 'a : T[] [0..*]']) assert.equal(T.member.print(csRow(null, row)), row, row);
  assert.equal(T.member.print(csRow({ type: 'uml.Class' }, 'port p : ns::T')), 'port p : ns::T');
  // audit 5: a closing bracket that is no multiplicity is the type's, so an unchanged row edits nothing
  assert.deepEqual(csParse('items : list[str]'), { label: 'items', valueType: 'list[str]', multiplicity: undefined });
  assert.deepEqual(csParse('c : Map[K, V] [0..1]'), { label: 'c', valueType: 'Map[K, V]', multiplicity: '0..1' });
  assert.deepEqual(csParse('xs : T [many]').multiplicity, undefined);
  assert.deepEqual(csParse('a::b'), { label: 'a::b', valueType: undefined, multiplicity: undefined });
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.Class', label: 'S', members: [P('s.t', 't', { props: { valueType: 'Tag[]' } })] }], edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['s'] }] };
  assert.deepEqual(T.edits.member(m, m.views[0], 's', 's.t', 't2 : Tag[]'), [{ op: 'set', id: 's.t', path: 'label', value: 't2' }]);
});

test("the subject's operation row prints and edits as the class type's, never as a part (audit 4)", () => {
  const op = { id: 's.place', type: 'uml.Operation', label: 'place', props: { returnType: 'Receipt' } };
  assert.equal(T.member.print(op), 'place(): Receipt');
  assert.ok(T.member.edit(op, 'place : Order').error);
  assert.equal(T.member.edit(op, 'place(): Order').commands.find(c => c.path === 'props').value.returnType, 'Order');
});

test("two named connectors from one port of the subject: both names are placed, the box's pad making them room (audit 5)", () => {
  const pt = (id, label) => ({ id, type: 'uml.Port', label });
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Svc', members: [pt('S.api', 'api'), P('S.a', 'a', { props: { valueType: 'A' } }), P('S.b', 'b', { props: { valueType: 'B' } })] },
    { id: 'A', type: 'uml.Class', label: 'A', members: [pt('A.in', 'in')] }, { id: 'B', type: 'uml.Class', label: 'B', members: [pt('B.in', 'in')] }],
  edges: [{ id: 'c1', type: 'uml.Connector', from: 'S.api', to: 'A.in', label: 'orders', props: { ends: { to: { part: 'S.a' } } } },
    { id: 'c2', type: 'uml.Connector', from: 'S.api', to: 'B.in', label: 'refunds', props: { ends: { to: { part: 'S.b' } } } }, { id: 'c3', type: 'uml.Connector', from: 'A.in', to: 'B.in' }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'] }] };
  assert.deepEqual(layout(m, 'v').edges.filter(e => e.label).map(e => [e.id, e.lbl && e.lbl.text]), [['c1', 'orders'], ['c2', 'refunds']]);
  assert.deepEqual(check(m, 'v'), []);
});

test('three and four named connectors from one port of the subject, right and down: every name placed and no crossing (audit 6)', () => {
  const pt = (id, label) => ({ id, type: 'uml.Port', label }), names = ['orders', 'refunds', 'audits', 'returns'];
  for (const n of [3, 4]) for (const direction of ['right', 'down']) {
    const parts = names.slice(0, n).map((x, i) => P('S.p' + i, 'p' + i, { props: { valueType: 'T' + i } }));
    const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Svc', members: [pt('S.api', 'api'), ...parts] }, ...parts.map((_, i) => ({ id: 'T' + i, type: 'uml.Class', label: 'T' + i, members: [pt(`T${i}.in`, 'in')] }))],
      edges: parts.map((_, i) => ({ id: 'c' + i, type: 'uml.Connector', from: 'S.api', to: `T${i}.in`, label: names[i], props: { ends: { to: { part: 'S.p' + i } } } })),
      views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'], direction }] };
    assert.deepEqual(layout(m, 'v').edges.map(e => e.lbl && e.lbl.text), names.slice(0, n), `${n} ${direction}`);
    assert.deepEqual(check(m, 'v').map(p => p.message), [], `${n} ${direction}`);
  }
});

test('audit 7: two unnamed delegations from one port to two parts or components side by side do not cross', () => {
  const pt = (id, label) => ({ id, type: 'uml.Port', label }), parts = [0, 1].map(i => P('S.p' + i, 'part' + i, { props: { valueType: 'T' + i } }));
  const cs = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Svc', members: [pt('S.in', 'in'), ...parts] }], edges: parts.map((p, i) => ({ id: 'c' + i, type: 'uml.Connector', from: 'S.in', to: p.id })),
    views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'] }] };
  const cp = { schemaVersion: 2, nodes: [{ id: 'B', type: 'uml.Component', label: 'Box', members: [pt('B.in', 'in')] }, ...[0, 1].map(i => ({ id: 'k' + i, type: 'uml.Component', label: 'Inner' + i, parent: 'B' }))],
    edges: [0, 1].map(i => ({ id: 'd' + i, type: 'uml.Connector', from: 'B.in', to: 'k' + i, props: { kind: 'delegation' } })), views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['B', 'k0', 'k1'] }] };
  assert.deepEqual(check(cs, 'v').map(p => p.message), []); assert.deepEqual(check(cp, 'v').map(p => p.message), []);
});

test('audit 6: a listed connector between two types\' ports that names no part is reported, not dropped silently', () => {
  const pt = (id, label) => ({ id, type: 'uml.Port', label });
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Svc', members: [pt('S.api', 'api'), { id: 'S.p0', type: 'uml.Property', label: 'p0', props: { valueType: 'T0' } }, { id: 'S.p1', type: 'uml.Property', label: 'p1', props: { valueType: 'T1' } }] },
    { id: 'T0', type: 'uml.Class', label: 'T0', members: [pt('T0.in', 'in')] }, { id: 'T1', type: 'uml.Class', label: 'T1', members: [pt('T1.in', 'in')] }],
  edges: [{ id: 'bare', type: 'uml.Connector', from: 'T0.in', to: 'T1.in' }, { id: 'unlisted', type: 'uml.Connector', from: 'T1.in', to: 'T0.in' }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'], edges: ['bare'] }] };
  assert.ok(!layout(m, 'v').edges.some(e => e.id === 'bare'));
  const p = validate(m).filter(x => x.rule === 'connector-part');
  assert.deepEqual(p.map(x => [x.level, x.path, x.ids]), [['warning', 'edges[0].props.ends.from.part', ['bare', 'T0.in']]], 'the unlisted one may belong to another view');
});

test('audit 8: a card or a port whose id is an Object.prototype name is sized as any other', () => {
  const card = id => { const m = { schemaVersion: 2, nodes: [{ id: 'Shop', type: 'uml.Class', label: 'Shop', members: [port('sp', 'api')] }, { id, type: 'uml.Class', label: 'Helper' }],
    edges: [{ id: 'c1', type: 'uml.Connector', from: 'sp', to: id }], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'Shop', nodeIds: ['Shop', id] }] };
    const n = layout(m, 'v').byId[id]; return [n.w, n.h]; };
  assert.deepEqual(card('toString'), card('Note1')); assert.deepEqual(card('valueOf'), card('Note1'));
  const shop = pid => { const m = { schemaVersion: 2, nodes: [{ id: 'Shop', type: 'uml.Class', label: 'Shop', members: [port(pid, 'api')] }, { id: 'B', type: 'uml.Class', label: 'B' }],
    edges: [{ id: 'c1', type: 'uml.Connector', from: pid, to: 'B' }], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'Shop', nodeIds: ['Shop', 'B'] }] };
    const n = layout(m, 'v').byId.Shop; return [n.w, n.h]; };
  assert.deepEqual(shop('constructor'), shop('p1')); assert.deepEqual(shop('toString'), shop('p1'));
});

test('audit 11: connect() refuses a connector between two ports of one part or of the subject, which the view does not draw', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Component', label: 'Shop', members: [port('shop.in', 'in'), port('shop.out', 'out'), P('shop.a', 'a', { props: { valueType: 'Worker' } }), P('shop.b', 'b', { props: { valueType: 'Worker' } })] },
    { id: 'worker', type: 'uml.Class', label: 'Worker', members: [port('worker.job', 'job'), port('worker.idle', 'idle')] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'shop', nodeIds: ['shop'] }] };
  const L = { type: 'uml.Connector', label: 'Connector' }, c = (f, t) => T.edits.connect(m, m.views[0], f, t, {}, L);
  assert.match(c('shop.a->worker.job', 'shop.a->worker.idle').error, /no line runs from a part or a box to itself/);
  assert.match(c('shop.in', 'shop.out').error, /no line runs from a part or a box to itself/);
  assert.deepEqual(c('shop.a->worker.job', 'shop.b->worker.idle')[0].element.props.ends, { from: { part: 'shop.a' }, to: { part: 'shop.b' } }, 'two parts: added');
});

test('audit 11: in a view with no edges list, a connector between ports of the parts\' types that names no part is reported', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Component', label: 'Shop', members: [P('shop.a', 'a', { props: { valueType: 'Worker' } }), P('shop.b', 'b', { props: { valueType: 'Store' } })] },
    { id: 'worker', type: 'uml.Class', label: 'Worker', members: [port('worker.job', 'job')] }, { id: 'store', type: 'uml.Class', label: 'Store', members: [port('store.put', 'put')] },
    { id: 'other', type: 'uml.Class', label: 'Other', members: [port('other.x', 'x'), port('other.y', 'y')] }],
  edges: [{ id: 'c1', type: 'uml.Connector', from: 'worker.job', to: 'store.put' }, { id: 'c2', type: 'uml.Connector', from: 'other.x', to: 'other.y' }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'shop', nodeIds: ['shop'] }] };
  assert.deepEqual(validate(m).filter(x => x.rule === 'connector-part').map(x => [x.level, x.path, x.ids]), [['warning', 'edges[0].props.ends.from.part', ['c1', 'worker.job']]], 'c2\'s ports type no part: another view\'s');
});

test('audit 11: a connector through an open collaboration\'s roles is checked as one through parts: a port not of the role\'s type is an error', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'sale', type: 'uml.Collaboration', label: 'Sale', members: [P('sale.buyer', 'buyer', { props: { valueType: 'Party' } }), P('sale.seller', 'seller', { props: { valueType: 'Party' } })] },
    { id: 'party', type: 'uml.Class', label: 'Party', members: [port('party.out', 'out'), port('party.in', 'in')] }, { id: 'other', type: 'uml.Class', label: 'Other', members: [port('other.x', 'x')] }],
  edges: [{ id: 'ok', type: 'uml.Connector', from: 'party.out', to: 'party.in', props: { ends: { from: { part: 'sale.buyer' }, to: { part: 'sale.seller' } } } },
    { id: 'bad', type: 'uml.Connector', from: 'other.x', to: 'party.in', props: { ends: { from: { part: 'sale.buyer' }, to: { part: 'sale.seller' } } } }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['sale', 'party'] }] };
  assert.ok(layout(m, 'v').edges.some(e => e.id === 'ok'));
  assert.deepEqual(validate(m).filter(x => x.ids.includes('ok') || x.ids.includes('bad')).map(x => [x.level, x.rule, x.ids]), [['error', 'connector-part', ['bad', 'other.x', 'sale.buyer']]]);
});

test('audit 12: with no edges list, another classifier\'s own delegation (its port to its part) is not warned in a view whose part it types', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'A', type: 'uml.Class', label: 'Engine', members: [port('A.p', 'p'), P('A.inner', 'inner', { props: { valueType: 'Pump' } })] },
    { id: 'Pump', type: 'uml.Class', label: 'Pump', members: [port('Pump.in', 'in')] },
    { id: 'B', type: 'uml.Class', label: 'Car', members: [P('B.engine', 'engine', { props: { valueType: 'Engine' } })] }],
  edges: [{ id: 'deleg', type: 'uml.Connector', from: 'A.p', to: 'Pump.in', props: { ends: { to: { part: 'A.inner' } } } }],
  views: [{ id: 'engine', diagram: 'uml.composite-structure', subject: 'A', nodeIds: ['A'] }, { id: 'car', diagram: 'uml.composite-structure', subject: 'B', nodeIds: ['B'] }] };
  assert.deepEqual(validate(m), []);
  assert.ok(layout(m, 'engine').edges.some(e => e.id === 'deleg'));
});

test('audit 12: a collaboration with no label is named by its id, as drawn: the use finds it, binding-role checks the role, connect picks one', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'Shop', type: 'uml.Class', members: [P('Shop.a', 'a'), P('Shop.b', 'b')] },
    { id: 'PubSub', type: 'uml.Collaboration', members: [P('PubSub.pub', 'publisher'), P('PubSub.sub', 'subscriber')] },
    { id: 'use', type: 'uml.CollaborationUse', label: 'events', parent: 'Shop', props: { collaboration: 'PubSub' } }],
  edges: [{ id: 'rb', type: 'uml.RoleBinding', from: 'Shop.a', to: 'use', label: 'nobody' }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'Shop', nodeIds: ['Shop', 'use', 'PubSub'] }] };
  assert.deepEqual(validate(m).filter(x => x.rule !== 'part-type').map(x => [x.rule, x.ids]), [['binding-role', ['rb', 'PubSub']]]);
  const T = diagramOf(m.views[0]), r = T.edits.connect(m, m.views[0], 'Shop.b', 'use', {}, T.lines.find(l => l.type === 'uml.RoleBinding'));
  assert.deepEqual(r.pick, ['publisher', 'subscriber']);
});

test('audit 12: describe() of a model whose part id holds \'->\' (validate reports it) does not throw', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url)));
  m.nodes[0].members[3].id = 'a->b';
  assert.ok(validate(m).some(x => x.level === 'error'));
  assert.equal(typeof describe(m, 'internals'), 'string');
});

test('audit 15: a connector\'s, a part\'s and a port\'s stereotypes are drawn and said; F2 on the connector edits its label alone', async () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Shop', members: [P('a', 'a', { props: { valueType: 'X', stereotypes: ['service'] } }), P('b', 'b', { props: { valueType: 'Y' } }),
    { id: 'q', type: 'uml.Port', label: 'in', props: { stereotypes: ['rest'] } }] }],
  edges: [{ id: 'c1', type: 'uml.Connector', from: 'a', to: 'b', label: 'calls', props: { stereotypes: ['http'] } }], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S'], subject: 'S' }] };
  const g = layout(m, 'v'), c = g.edges.find(e => e.id === 'c1'), svg = String((await import('../src/draw/svg.js')).svgOf(mapContext(m).buildGeo('v')));
  assert.deepEqual([c.label, c.aria], ['«http» calls', 'Connector from a to b: «http» calls']);
  assert.equal(g.nodes.find(x => x.id === 'q').aria, 'Port in (rest) of Shop');
  for (const w of ['«service»', '«rest» in']) assert.ok(svg.includes(w), w);
  assert.ok(g.nodes.find(x => x.id === 'a').h === 48, 'one stereotype: the part keeps its height');
  assert.deepEqual(T.edits.rename(m, m.views[0], 'c1', '«http» calls'), []);
  assert.equal(layout(apply(m, T.edits.rename(m, m.views[0], 'c1', '«http» sends')), 'v').edges.find(e => e.id === 'c1').label, '«http» sends');
});

test('audit 15: a part or collaboration use with no name and no type is drawn and said by its id; one with a type alone, ": Y"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Shop', members: [P('a', undefined), P('b', undefined, { props: { valueType: 'Y' } })] }, { id: 'u', type: 'uml.CollaborationUse', parent: 'S' }],
    edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S', 'u'], subject: 'S' }] };
  const g = layout(m, 'v'), n = id => g.nodes.find(x => x.id === id);
  assert.deepEqual(['a', 'b', 'u'].map(id => [n(id).label, n(id).aria]), [['a', 'Part a, in Shop'], [': Y', 'Part : Y, in Shop'], ['u', 'Collaboration use u']]);
  assert.deepEqual(T.edits.rename(m, m.views[0], 'a', 'a'), [], 'F2 unchanged: no name stored');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v')).flatMap(t => t.rows).join(' ');
  assert.doesNotMatch(rows, /(^|>)\s*, composite/, 'no blank part row');
});

test('audit 16: the PDF cover counts a view\'s own line apart from a model line with the same ends (both named a->b#0)', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', label: 'places order' }],
    views: [{ id: 'one', nodeIds: ['a', 'b'] }, { id: 'two', nodeIds: ['a', 'b'], edges: [{ from: 'a', to: 'b', label: 'cancels order' }] }] };
  const c = mapContext(m), ids = c.views.flatMap(v => tablesOf(c, v, c.buildGeo(v.id)).lineIds);
  assert.equal(new Set(ids).size, 2, ids);
});

test('audit 16: an anonymous part is named ": Engine [1]" by its ports, connectors and bindings; F2 on a collaboration use and on the subject\'s port', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'E', type: 'uml.Class', label: 'Engine', members: [{ id: 'E.in', type: 'uml.Port', label: 'in' }] },
    { id: 'S', type: 'uml.Class', label: 'Service', members: [P('S.p', undefined, { props: { valueType: 'Engine', multiplicity: '1' } }), { id: 'S.in', type: 'uml.Port', label: 'in', props: { valueType: 'Old' } }] },
    { id: 'u', type: 'uml.CollaborationUse', parent: 'S', props: { collaboration: 'PubSub' } }],
  edges: [{ id: 'c', type: 'uml.Connector', from: 'S.in', to: 'E.in', props: { ends: { to: { part: 'S.p' } } } }, { id: 'b', type: 'uml.RoleBinding', from: 'S.p', to: 'u', label: 'publisher' }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S', 'u'], subject: 'S' }] };
  const text = describe(m, 'v');
  assert.doesNotMatch(text, /S\.p/, text);
  assert.match(text, /in of : Engine \[1\]/);
  const v = m.views[0];
  assert.equal(layout(m, 'v').nodes.find(n => n.id === 'u').label, ': PubSub', 'no leading space');
  assert.deepEqual(T.edits.rename(m, v, 'u', ': PubSub'), [], 'F2 unchanged');
  assert.deepEqual(T.edits.rename(m, v, 'u', 'events : PubSub'), [{ op: 'set', id: 'u', path: 'label', value: 'events' }]);
  assert.deepEqual(T.edits.rename(m, v, 'S.in', 'in : Request'), [{ op: 'set', id: 'S.in', path: 'props.valueType', value: 'Request' }]);
  assert.deepEqual(T.edits.rename(m, v, 'S.in', 'out'), [{ op: 'set', id: 'S.in', path: 'label', value: 'out' }], 'a name alone keeps the type');
});

test('audit 17: F2 and the panel row on an anonymous part, role or collaboration use read the text it is drawn with', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'E', type: 'uml.Class', label: 'Engine' },
    { id: 'S', type: 'uml.Class', label: 'Car', members: [P('S.p', undefined, { props: { valueType: 'Engine', multiplicity: '1' } }), P('S.q', 'wheel', { props: { valueType: 'Wheel', multiplicity: '4' } })] },
    { id: 'C', type: 'uml.Collaboration', label: 'PubSub', members: [P('C.r', undefined, { props: { valueType: 'Publisher' } })] },
    { id: 'u', type: 'uml.CollaborationUse', parent: 'S', props: { collaboration: 'PubSub' } }],
  edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S', 'u', 'C'], subject: 'S' }] };
  const v = m.views[0], g = layout(m, 'v'), set = (id, path, value) => ({ op: 'set', id, path, value });
  assert.equal(g.nodes.find(n => n.id === 'S.p').label, ': Engine [1]');
  assert.deepEqual(T.edits.rename(m, v, 'S.p', ': Engine [1]'), [], 'Enter unchanged');
  assert.deepEqual(T.edits.rename(m, v, 'S.p', ': Engine [2]'), [set('S.p', 'props.multiplicity', '2')], 'still anonymous');
  assert.deepEqual(T.edits.rename(m, v, 'S.p', 'e : Engine [1]'), [set('S.p', 'label', 'e')]);
  assert.deepEqual(T.edits.rename(m, v, 'S.q', ': Wheel [4]'), [set('S.q', 'label', undefined)], 'a name taken off');
  assert.deepEqual(T.edits.rename(m, v, 'C.r', ': Listener'), [set('C.r', 'props.valueType', 'Listener')], 'a role');
  assert.deepEqual(T.member.edit(node(m, 'S').members[0], ': Engine [1]'), { commands: [] });
  assert.deepEqual(T.member.edit(node(m, 'S').members[0], ': Motor [1]'), { commands: [set('S.p', 'props.valueType', 'Motor')] });
  assert.deepEqual(T.edits.member(m, v, 'S', 'S.p', ': Engine [3]'), [set('S.p', 'props.multiplicity', '3')]);
  assert.deepEqual(T.edits.member(m, v, 'S', null, ': Gearbox'), [{ op: 'add', element: { id: 'S.gearbox', type: 'uml.Property', props: { valueType: 'Gearbox' } }, owner: 'S' }], 'added by text, its id from its type');
  assert.deepEqual(T.edits.rename(m, v, 'u', ': Other'), [set('u', 'props.collaboration', 'Other')], 'an anonymous collaboration use re-typed');
  assert.deepEqual(T.edits.add(m, v, { type: 'uml.CollaborationUse' }, ': PubSub', {})[0].element, { id: 'pubsub', type: 'uml.CollaborationUse', parent: 'S', props: { collaboration: 'PubSub' } });
  for (const t of ['', ':', '[1]', ' : ']) assert.ok(T.edits.rename(m, v, 'S.p', t).error, JSON.stringify(t));
  assert.ok(T.edits.rename(m, v, 'u', '[1]').error);
  // a label of '' is no name: drawn, said and edited as an absent one (finding 9)
  const e = structuredClone(m); node(e, 'S').members[0].label = '';
  e.nodes[0].members = [port('E.in', 'in')]; node(e, 'S').members.push(port('S.in', 'in')); e.edges.push(con('c', 'S.in', 'E.in', { to: { part: 'S.p' } }));
  const said = describe(e, 'v');
  assert.match(said, /Port in of : Engine \[1\]\./); assert.match(said, /Connector from in of Car to in of : Engine \[1\]\./);
  assert.deepEqual(T.edits.rename(e, e.views[0], 'S.p', ': Engine [1]'), [], 'Enter unchanged on a label of ""');
});

test('audit 17: a role binding\'s picker offers the named roles, which binding-role accepts; with none named, it says so', () => {
  const mk = roles => ({ schemaVersion: 2, nodes: [{ id: 'C', type: 'uml.Collaboration', label: 'PubSub', members: roles },
    { id: 'S', type: 'uml.Class', label: 'Shop', members: [P('S.p', 'checkout', { props: { valueType: 'Checkout' } })] }, { id: 'Checkout', type: 'uml.Class', label: 'Checkout' },
    { id: 'u', type: 'uml.CollaborationUse', label: 'events', parent: 'S', props: { collaboration: 'PubSub' } }],
  edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S', 'u'], subject: 'S' }] });
  const anon = mk([P('C.r', undefined, { props: { valueType: 'Publisher' } })]), r0 = T.edits.connect(anon, anon.views[0], 'S.p', 'u', {}, { type: 'uml.RoleBinding' });
  assert.match(r0.error, /^Name a role of PubSub first/);
  const two = mk([P('C.r', undefined, { props: { valueType: 'Publisher' } }), P('C.s', 'subscriber', { props: { valueType: 'Listener' } })]);
  const r = T.edits.connect(two, two.views[0], 'S.p', 'u', {}, { type: 'uml.RoleBinding' });
  assert.deepEqual(r.pick, ['subscriber']);
  assert.deepEqual(validate(apply(two, r.then(0))).filter(p => p.rule === 'binding-role'), []);
  // audit 18: a collaboration with no roles is refused too, where binding-role would warn of the unlabelled binding at once
  const none = mk([]); assert.match(T.edits.connect(none, none.views[0], 'S.p', 'u', {}, { type: 'uml.RoleBinding' }).error, /^Add a role to PubSub first/);
  const lost = mk([]); lost.nodes[3].props.collaboration = 'Gone'; // no collaboration resolves: collaboration-named says so, the binding is added
  const c = T.edits.connect(lost, lost.views[0], 'S.p', 'u', {}, { type: 'uml.RoleBinding' }); assert.equal(c[0].element.label, undefined);
  assert.deepEqual(validate(apply(lost, c)).filter(p => p.rule === 'binding-role'), []);
});

test('audit 19: the Connector tool refuses ends in two structures (a part or the subject\'s port, and a collaboration\'s role): connector-scope would fail at once', () => {
  const m = structuredClone(CS), v = m.views[0], T = diagramOf(v), line = T.lines.find(l => l.type === 'uml.Connector');
  for (const [a, b] of [['order-service.checkout', 'publish-subscribe.publisher'], ['order-service.api', 'publish-subscribe.subscriber'], ['publish-subscribe.subscriber', 'order-service.pricing']]) {
    const r = T.edits.connect(m, v, a, b, null, line); assert.ok(r && r.error && /lie in one structure/.test(r.error), `${a} -> ${b}: ${JSON.stringify(r)}`); }
  assert.equal(T.edits.connect(m, v, 'publish-subscribe.publisher', 'publish-subscribe.subscriber', null, line), null, 'two roles of one collaboration: drawn as is');
  assert.equal(T.edits.connect(m, v, 'order-service.checkout', 'order-service.pricing', null, line), null, 'two parts of the subject: drawn as is');
});

test('audit 21: the palette\'s Port adds a port, never a part: a port with no name (": Api", or nothing typed) is refused with the port syntax', () => {
  const Port = T.elements.find(e => e.label === 'Port');
  for (const sel of [['order-service'], ['order-service.checkout']]) {
    for (const t of [': Api', '', null, undefined]) { const r = T.edits.add(CS, V, Port, t, { sel }); assert.deepEqual(r, { error: 'A port is port name : Type' }, `${sel[0]} ${JSON.stringify(t)}`); }
    const r = T.edits.add(CS, V, Port, 'admin : Api', { sel }), c = Array.isArray(r) ? r : r.commands;
    assert.deepEqual(c.map(x => [x.element.type, x.element.label, x.element.props]), [['uml.Port', 'admin', { valueType: 'Api' }]]);
  }
});

test('audit 21: a connector from a part to a collaboration use lies in no structure: connector-scope says so, and the Connector tool refuses it', () => {
  const m = structuredClone(CS), v = m.views[0], line = T.lines.find(l => l.type === 'uml.Connector'), use = v.nodeIds.find(id => (m.nodes.find(n => n.id === id) || {}).type === 'uml.CollaborationUse');
  assert.match(T.edits.connect(m, v, 'order-service.checkout', use, null, line).error, /lie in one structure/);
  m.edges.push({ id: 'c-use', type: 'uml.Connector', from: 'order-service.checkout', to: use });
  assert.deepEqual(validate(m).filter(p => p.rule === 'connector-scope').map(p => [p.level, p.ids[0]]), [['error', 'c-use']]);
  assert.equal(T.edits.connect(CS, CS.views[0], 'order-service.checkout', 'order-service.pricing', null, line), null, 'two parts: as before');
});

// audit 22: a listed line of another kind (a dependency) is drawn by its kind, never as a connector's plain line; a comment
// link's label, which this view neither draws nor says, has no Name field and F2 writes none; connector-scope names the one
// end out of scope
test('a dependency in a composite view keeps its direction, a comment link has no name here, and connector-scope names the stray end (audit 22)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'svc', type: 'uml.Class', label: 'OrderService', members: [P('svc.p', 'repo', { props: { valueType: 'Repo' } })] },
    { id: 'repo', type: 'uml.Class', label: 'Repo' }, { id: 'db', type: 'uml.Class', label: 'Database' }, { id: 'n', type: 'uml.Comment', label: 'A note' }],
    edges: [{ id: 'dep', type: 'uml.Dependency', from: 'repo', to: 'db' }, { id: 'use', type: 'uml.Usage', from: 'db', to: 'repo' }, con('c', 'db', 'repo'), { id: 'cl', type: 'uml.CommentLink', from: 'n', to: 'repo', label: 'ZZLABEL' }],
    views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'svc', nodeIds: ['svc', 'repo', 'db', 'n'], edges: ['dep', 'use', 'c', 'cl'] }] };
  const g = layout(m, 'v'), end = id => g.edges.find(e => e.id === id).end;
  assert.deepEqual(end('c'), { from: 'none', to: 'none' });
  for (const id of ['dep', 'use']) assert.deepEqual(end(id), { from: 'none', to: 'open', dashed: true }, id);
  assert.ok(!svgOf(g).includes('ZZLABEL') && !describe(m, 'v').includes('ZZLABEL'), 'the label is neither drawn nor said');
  assert.ok(T.unnamed.includes('uml.CommentLink'));
  assert.ok(T.edits.rename(m, m.views[0], 'cl', 'NEW').error);
  assert.deepEqual(T.edits.rename(m, m.views[0], 'c', 'NEW'), [{ op: 'set', id: 'c', path: 'label', value: 'NEW' }], 'a connector is renamed as before');
  // a connector from a part of the subject to a collaboration use: only the use lies in no structure
  const s = structuredClone(CS), part = mem(s, 'order-service.checkout') ? 'order-service.checkout' : s.nodes[0].members.find(x => x.type === 'uml.Property').id;
  const use = s.nodes.find(n => n.type === 'uml.CollaborationUse').id; s.edges.push(con('c-use', part, use));
  const msg = validate(s).find(p => p.rule === 'connector-scope' && p.ids.includes('c-use')).message, nm = x => JSON.stringify((mem(s, x) || node(s, x)).label);
  assert.ok(msg.includes(`and ${nm(use)} lies in no structure of this view`), msg);
  assert.ok(!msg.includes('which lie in no structure'), msg);
});

// audit 23: a dependency or usage the view lists is drawn as the class view draws it (audit 22); its legend keys it as the class
// view's does, and its accessible name and describe() name its kind as the PDF's Kind column does, never "Line"
test('a dependency or usage in a composite view has its legend entry, and its accessible name names its kind (audit 23)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'svc', type: 'uml.Class', label: 'OrderService', members: [P('svc.p', 'repo', { props: { valueType: 'Repo' } }), P('svc.q', 'db', { props: { valueType: 'Database' } })] },
    { id: 'Repo', type: 'uml.Class', label: 'Repo' }, { id: 'Database', type: 'uml.Class', label: 'Database' }],
  edges: [{ id: 'c', type: 'uml.Connector', from: 'svc.p', to: 'svc.q' }, { id: 'd', type: 'uml.Dependency', from: 'svc.p', to: 'svc.q', label: 'reads' }, { id: 'u', type: 'uml.Usage', from: 'svc.q', to: 'svc.p' }],
  views: [{ id: 'w', diagram: 'uml.composite-structure', subject: 'svc', nodeIds: ['svc'], edges: ['c', 'd', 'u'] }] };
  const g = layout(m, 'w'), keys = g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]);
  assert.deepEqual(keys, ['Connector', 'Dependency', 'Usage']);
  assert.equal(g.edges.find(e => e.id === 'd').aria, 'Dependency from repo to db: reads');
  assert.equal(g.edges.find(e => e.id === 'u').aria, 'Usage from db to repo: «use»'); // its keyword, as its legend entry says (audit 34)
  const said = describe(m, 'w').split('\n'); assert.ok(said.includes('Dependency from repo to db: reads.') && said.includes('Usage from db to repo: «use».'), said.join('\n'));
  // a kind the class view has no word for is still a plain "Line", keyed "Line" with its arrow as every structural view keys it (audit 27)
  const odd = structuredClone(m); odd.edges.push({ id: 'x', type: 'uml.Flow', from: 'svc.p', to: 'svc.q' }); odd.views[0].edges.push('x');
  const go = layout(odd, 'w'); assert.equal(go.edges.find(e => e.id === 'x').aria, 'Line from repo to db');
  assert.deepEqual(go.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Connector', 'Dependency', 'Usage', 'Line']); assert.equal(go.edges.find(e => e.id === 'x').end.to, 'arrow');
});

test('audit 23: a view\'s own connector (view.edges object) is checked as a model one, at its own path (a bad ends.part: connector-part)', () => {
  const c = CS.edges.find(e => e.type === 'uml.Connector' && e.props && e.props.ends && e.props.ends.to), own = structuredClone(CS);
  own.edges = own.edges.filter(e => e.id !== c.id); own.views[0].edges = CS.edges.map(e => (e.id === c.id ? structuredClone(c) : e.id));
  assert.deepEqual(validate(own), validate(CS), 'a sound own connector: nothing said');
  const j = own.views[0].edges.findIndex(x => typeof x === 'object');
  own.views[0].edges[j].props.ends.to.part = 'nope'; const m = structuredClone(CS); m.edges.find(e => e.id === c.id).props.ends.to.part = 'nope';
  const at = x => validate(x).filter(p => (p.ids || []).includes(c.id)).map(p => [p.rule, p.path]);
  const want = at(m), k = `edges[${CS.edges.indexOf(c)}]`;
  assert.ok(want.some(([r]) => r === 'connector-part'), 'the model line: said');
  assert.deepEqual(at(own), want.map(([r, p]) => [r, p.replace(k, `views[0].edges[${j}]`)]), 'the own line: said alike, at its own path');
});

test('audit 24: Delete on a role of a collaboration the view holds as its own deletes it; on a port on a part, the view\'s own connector through it', () => {
  let m = { schemaVersion: 2, nodes: [{ id: 'svc', type: 'uml.Class', label: 'Service', members: [{ id: 'svc.a', type: 'uml.Property', label: 'a' }] }], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'svc', nodeIds: ['svc'] }] };
  m = apply(m, { op: 'add', in: 'view', view: 'v', element: { id: 'ps', type: 'uml.Collaboration', label: 'PubSub', members: [{ id: 'ps.pub', type: 'uml.Property', label: 'pub' }, { id: 'ps.sub', type: 'uml.Property', label: 'sub' }] } });
  const T = diagramOf(m.views[0]);
  assert.deepEqual(T.edits.remove(m, m.views[0], ['ps.pub'], false), { commands: [{ op: 'delete', id: 'ps.pub' }], say: 'Deleted role pub of PubSub (a member is not hidden: it goes from the model)' });
  // the example's checkout-to-pricing connector held as the view's own line
  const o = structuredClone(CS), i = o.edges.findIndex(e => e.id === 'checkout-to-pricing'), own = o.edges.splice(i, 1)[0];
  o.views[0].edges = [...o.edges.map(e => e.id), own];
  assert.ok(layout(o, o.views[0].id).edges.some(e => e.id === own.id), 'drawn');
  const r = T.edits.remove(o, o.views[0], ['order-service.checkout->checkout-class.quotes'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: own.id }]);
  assert.match(T.edits.remove(o, o.views[0], ['order-service.pricing'], false).say, /^Deleted part pricing of OrderService and its 1 line/);
});

test('audit 24: a part given no type is said to have none, not to be "typed null"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'car', type: 'uml.Class', label: 'Car', members: [{ id: 'car.wheel', type: 'uml.Property', label: 'wheel', props: { valueType: 'Wheel' } }] }, { id: 'w', type: 'uml.Class', label: 'Wheel' }], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'car', nodeIds: ['car'] }] };
  const T = diagramOf(m.views[0]), n = apply(m, T.edits.member(m, m.views[0], 'car', null, 'engine'));
  const said = validate(n).filter(p => p.rule === 'part-type').map(p => p.message);
  assert.deepEqual(said, ['part-type: part "engine" of "Car" has no type, so it shows only the ports its connectors reach through it']);
  const port = T.edits.add(n, n.views[0], { type: 'uml.Port' }, 'p', { sel: ['car.engine'] });
  assert.deepEqual(port, { error: 'engine has no type: type it as a class or component to add a port to' });
});

test('audit 25: a collaboration use naming none and a role binding with no role say so in words, not "null"', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'S', type: 'uml.Class', label: 'Service', members: [{ id: 'S.p', type: 'uml.Property', label: 'p', props: { valueType: 'Service' } }] },
    { id: 'C', type: 'uml.Collaboration', label: 'Observer', members: [{ id: 'C.o', type: 'uml.Property', label: 'subject' }] },
    { id: 'u', type: 'uml.CollaborationUse', label: 'observer', parent: 'S', props: {} },
    { id: 'u2', type: 'uml.CollaborationUse', label: 'watch', parent: 'S', props: { collaboration: 'Observer' } }],
    edges: [{ id: 'rb', type: 'uml.RoleBinding', from: 'S.p', to: 'u2' }], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S', 'u', 'u2'] }] };
  const said = validate(m).map(p => p.message);
  assert.ok(said.includes('collaboration-named: collaboration use "observer" names no collaboration'), JSON.stringify(said));
  assert.ok(said.includes('binding-role: rb binds no role: name one of "Observer"\'s roles'), JSON.stringify(said));
  assert.ok(!said.some(s => s.includes('null')), JSON.stringify(said));
  m.nodes[2].props.collaboration = 'Watcher'; m.edges[0].label = 'other';
  const named = validate(m).map(p => p.message);
  assert.ok(named.includes('collaboration-named: collaboration use "observer" names "Watcher", not a collaboration of the model'), JSON.stringify(named));
  assert.ok(named.includes('binding-role: rb binds "other", not a role of "Observer"'), JSON.stringify(named));
});

test('audit 26: a role binding the view holds as its own line is a row of its collaboration use, as describe() and the picture have it', () => {
  const b = CS.edges.find(e => e.id === 'listeners-are-subscribers'), vid = V.id;
  let m = apply(CS, [{ op: 'set', view: vid, path: 'edges', value: CS.edges.map(e => e.id) }]);
  m = apply(m, [{ op: 'delete', id: b.id }]);
  m = apply(m, [{ op: 'add', element: structuredClone(b), in: 'view', view: vid }]);
  const v = m.views.find(x => x.id === vid);
  assert.ok(v.edges.some(e => typeof e === 'object' && e.id === b.id) && !m.edges.some(e => e.id === b.id), 'the binding is the view\'s own');
  assert.match(describe(m, vid), /binding publisher to checkout, subscriber to listeners/);
  assert.deepEqual(T.rows(m, v, 'order-events'), ['PublishSubscribe', 'publisher ← checkout', 'subscriber ← listeners']);
  const c = mapContext(m), t = JSON.stringify(tablesOf(c, c.V[vid], c.buildGeo(vid)));
  assert.match(t, /subscriber ← listeners/, 'and the PDF\'s table');
  // a binding the view leaves out of its edges list is not drawn, said or listed
  const off = apply(CS, [{ op: 'set', view: vid, path: 'edges', value: CS.edges.filter(e => e.id !== b.id).map(e => e.id) }]);
  assert.deepEqual(T.rows(off, off.views.find(x => x.id === vid), 'order-events'), ['PublishSubscribe', 'publisher ← checkout']);
});

test('audit 28: a uml.Property kept as a node, not a member, prints in the PDF as a property; an element of no type as an element', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Class', label: 'Shop', members: [{ id: 'p1', type: 'uml.Property', label: 'cart', props: { valueType: 'Cart' } }] },
    { id: 'loose', type: 'uml.Property', label: 'engine' }, { id: 'u', label: 'Thing' }], edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S', 'loose', 'u'] }] };
  assert.equal(layout(m, 'v').nodes.find(n => n.id === 'loose').aria, 'Property engine');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '')));
  const kind = label => rows.find(r => r[0] === label)[1];
  assert.deepEqual([kind('engine'), kind('Thing'), kind('Shop')], ['Property', 'Element', 'Class'], 'as layout() and describe() name them');
});

test('audit 30: the PDF\'s Members column of the subject and of an open collaboration lists only what their boxes draw: no operation, no literal', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'S', type: 'uml.Class', label: 'Car', members: [{ id: 'e', type: 'uml.Property', label: 'engine', props: { valueType: 'Engine' } }, { id: 'drv', type: 'uml.Operation', label: 'drive' }, { id: 'lit', type: 'uml.EnumerationLiteral', label: 'RED' }, { id: 'pt', type: 'uml.Port', label: 'api' }] },
    { id: 'E', type: 'uml.Class', label: 'Engine' },
    { id: 'col', type: 'uml.Collaboration', label: 'Observer', members: [{ id: 'r1', type: 'uml.Property', label: 'subject' }, { id: 'nt', type: 'uml.Operation', label: 'notify' }] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['S', 'E', 'col'], subject: 'S' }] };
  const s = String(svgOf(mapContext(m).buildGeo('v')));
  assert.ok(!/drive|RED|notify/.test(s), 'the picture draws none of them');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '').trim()));
  assert.deepEqual(rows.find(r => r[0] === 'Car'), ['Car', 'Class', 'engine : Engine, compositeport api']);
  assert.deepEqual(rows.find(r => r[0] === 'Observer'), ['Observer', 'Collaboration', 'subject']);
  assert.deepEqual(T.rows(m, m.views[0], 'S'), ['engine : Engine, composite', 'port api']);
  assert.deepEqual(T.rows(m, m.views[0], 'col'), ['subject']);
});

test('audit 34: another UML kind the composite view shows is drawn with its kind\'s keyword, a package as a package; a usage, import, abstraction or required extension with its keyword', () => {
  const kinds = ['Actor', 'Node', 'Interface', 'Enumeration', 'DataType', 'Artifact', 'UseCase', 'PrimitiveType', 'Class', 'Package'];
  const m = { schemaVersion: 2, nodes: kinds.map(k => ({ id: k.toLowerCase(), type: 'uml.' + k, label: 'X' + k, props: { stereotypes: ['s'] } })),
    edges: ['Usage', 'PackageImport', 'Abstraction', 'Extension'].map((k, i) => ({ id: 'e' + i, type: 'uml.' + k, from: 'class', to: kinds[i].toLowerCase(), ...(k === 'Extension' ? { props: { isRequired: true } } : {}) }))
      .concat([{ id: 'e4', type: 'uml.PackageImport', from: 'class', to: 'package', label: 'x', props: { visibility: 'private', stereotypes: ['t'] } }]),
    views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: kinds.map(k => k.toLowerCase()), edges: ['e0', 'e1', 'e2', 'e3', 'e4'] }] };
  const g = layout(m, 'v'), at = id => g.nodes.find(n => n.id === id);
  assert.deepEqual(kinds.map(k => [at(k.toLowerCase()).shape, at(k.toLowerCase()).stereotypes]), [['classifier', ['actor', 's']], ['classifier', ['node', 's']], ['classifier', ['interface', 's']],
    ['classifier', ['enumeration', 's']], ['classifier', ['dataType', 's']], ['classifier', ['artifact', 's']], ['classifier', ['useCase', 's']], ['classifier', ['primitive', 's']], ['classifier', ['s']], ['package', ['s']]]);
  assert.match(svgOf(g), /«interface»/);
  const ln = id => g.edges.find(e => e.id === id);
  assert.deepEqual(['e0', 'e1', 'e2', 'e3', 'e4'].map(id => ln(id).label), ['«use»', '«import»', '«abstraction»', '{required}', '«access» «t» x']);
  assert.equal(ln('e0').aria, 'Usage from XClass to XActor: «use»');
  // F2 on such a line takes its keyword and stereotypes off what was typed, as the class view's does
  assert.deepEqual(T.edits.rename(m, m.views[0], 'e4', '«access» «t» y'), [{ op: 'set', id: 'e4', path: 'label', value: 'y' }]);
});

test('audit 34: Shift + Delete of a part with other elements says them, and Delete says what it hid, as the deployment hook does', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url), 'utf8')), v = m.views[0];
  const r = T.edits.remove(m, v, ['order-service.pricing', 'order-events', 'publish-subscribe'], true);
  assert.deepEqual(r.commands.map(c => c.id), ['order-service.pricing', 'order-events', 'publish-subscribe']);
  assert.equal(r.say, 'Deleted part pricing of OrderService and its 1 line, and 2 other elements');
  const h = T.edits.remove(m, v, ['order-service.pricing', 'order-events'], false);
  assert.deepEqual(h.commands.map(c => c.op + ' ' + c.id), ['hide order-events', 'delete order-service.pricing']);
  assert.equal(h.say, 'Deleted part pricing of OrderService and its 1 line (a member is not hidden: it goes from the model); hid 1 element');
  // a line the part's words count already is not counted again
  const line = m.edges.find(e => e.type === 'uml.Connector' && [e.from, e.to].includes('order-service.pricing') || ['from', 'to'].some(k => ((e.props || {}).ends || {})[k] && e.props.ends[k].part === 'order-service.pricing'));
  assert.equal(T.edits.remove(m, v, ['order-service.pricing', line.id], true).say, 'Deleted part pricing of OrderService and its 1 line');
});


test('audit 35: Delete on ports on parts counts a connector between two of them once, and a selected line it deletes is not said kept', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url), 'utf8')), v = m.views[0];
  const a = 'order-service.pricing->price-calculator.quotes', b = 'order-service.checkout->checkout-class.quotes', c = 'order-service.checkout->checkout-class.requests';
  let r = T.edits.remove(m, v, [a, b], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'checkout-to-pricing' }]);
  assert.equal(r.say, 'Deleted the 1 connector through pricing to its port quotes; Shift + Delete deletes the port from PriceCalculator; the same connector through checkout to its port quotes; Shift + Delete deletes the port from CheckoutFlow');
  r = T.edits.remove(m, v, [a, b, c], false);
  assert.deepEqual(r.commands.map(x => x.id), ['checkout-to-pricing', 'api-to-checkout']);
  assert.match(r.say, /the same connector through checkout to its port quotes; .*; the 1 connector through checkout to its port requests;/);
  // a line the port's connectors include, selected with it, in either order: deleted, not said kept (the view lists no lines)
  for (const ids of [[b, 'checkout-to-pricing'], ['checkout-to-pricing', b]]) {
    r = T.edits.remove(m, v, ids, false);
    assert.deepEqual(r.commands, [{ op: 'delete', id: 'checkout-to-pricing' }], ids.join());
    assert.equal(r.say, 'Deleted the 1 connector through checkout to its port quotes; Shift + Delete deletes the port from CheckoutFlow', ids.join());
  }
  // and a part's line selected with it, which the core's cascade takes: not said kept
  assert.equal(T.edits.remove(m, v, ['order-service.pricing', 'checkout-to-pricing'], false).say, 'Deleted part pricing of OrderService and its 1 line (a member is not hidden: it goes from the model)');
  // a line it does not take is still said kept
  assert.match(T.edits.remove(m, v, [b, 'publisher-to-subscriber'], false).say, /; not the line publisher-to-subscriber: this view shows every line between its cards/);
  // a view listing its lines: the port's line is deleted, not hidden as well
  const L = structuredClone(m); L.views[0].edges = L.edges.map(e => e.id);
  r = T.edits.remove(L, L.views[0], [b, 'checkout-to-pricing'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'checkout-to-pricing' }]); assert.doesNotMatch(r.say, /hid/);
});

test('audit 36: Delete beside a part ends on a host\'s member that holds itself and reads members thousands deep', () => {
  const base = () => ({ schemaVersion: 2, nodes: [
    { id: 'shop', type: 'uml.Component', label: 'Shop', members: [{ id: 'shop.a', type: 'uml.Property', label: 'a' }] },
    { id: 'lib', type: 'uml.Class', label: 'Lib' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'shop', nodeIds: ['shop', 'lib'] }] });
  const want = { commands: [{ op: 'hide', id: 'lib', view: 'v' }, { op: 'delete', id: 'shop.a' }], say: 'Deleted part a of Shop (a member is not hidden: it goes from the model); hid 1 element' };
  assert.deepEqual(T.edits.remove(base(), base().views[0], ['shop.a', 'lib'], false), want);
  // a member that holds itself (a host's object): the walk ends
  const m1 = base(), x = { id: 'lib.inner', type: 'uml.Class', members: [] }; x.members.push(x); m1.nodes[1].members = [x];
  assert.deepEqual(T.edits.remove(m1, m1.views[0], ['shop.a', 'lib'], false), want);
  // members 20,000 deep, read from a file as validate, apply and layout read them (audit 35): no stack overflow
  let d = '{"id":"d0","type":"uml.Class"}'; for (let i = 1; i < 20000; i++) d = `{"id":"d${i}","type":"uml.Class","members":[${d}]}`;
  const m2 = base(); m2.nodes[1].members = [JSON.parse(d)];
  assert.deepEqual(T.edits.remove(m2, m2.views[0], ['shop.a', 'lib'], false), want);
  // and a selected member deep in a node beside the part is found there
  const m3 = base(); m3.nodes[1].members = [{ id: 'lib.x', type: 'uml.Class', members: [{ id: 'lib.x.y', type: 'uml.Property', label: 'y' }] }];
  assert.doesNotThrow(() => T.edits.remove(m3, m3.views[0], ['shop.a', 'lib.x.y'], false));
});

test('audit 36: the PDF names a port with no name, or a name "", by its id, as the picture, its accessible name and describe() do', () => {
  for (const unnamed of [m => { m.label = ''; }, m => { delete m.label; }]) {
    const m = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url), 'utf8')), v = m.views[0], api = m.nodes[0].members.find(x => x.id === 'order-service.api');
    unnamed(api);
    const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V[v.id], layout(m, v.id)), row = els.rows.find(r => r.includes('<b>OrderService</b>'));
    assert.match(row, /<p>port order-service\.api<\/p><p>port payments<\/p>/);
    assert.doesNotMatch(row, /<p>port <\/p>/);
    assert.match(ctx.buildView(v.id).markup, /aria-label="Port order-service\.api of OrderService"/);
    // F2 still opens on the port's own text, its name empty, not its id written in as a name
    assert.equal(T.member.print(api), 'port ');
  }
});

test('audit 38: lines between two parts, or two components, whose ports are listed in opposite orders do not cross (spreadPorts)', () => {
  const ports = (o, ps) => ps.map(p => ({ id: o + '.' + p, type: 'uml.Port', label: p }));
  const cs = (conns, dir) => ({ schemaVersion: 2, nodes: [
    { id: 's', type: 'uml.Class', label: 'S', members: [{ id: 's.a', type: 'uml.Property', label: 'a', props: { valueType: 'A' } }, { id: 's.b', type: 'uml.Property', label: 'b', props: { valueType: 'B' } }] },
    { id: 'A', type: 'uml.Class', label: 'A', members: ports('A', ['p1', 'p2', 'p3']) }, { id: 'B', type: 'uml.Class', label: 'B', members: ports('B', ['q1', 'q2', 'q3']) }],
  edges: conns.map(([f, t], i) => ({ id: 'c' + i, type: 'uml.Connector', from: 'A.' + f, to: 'B.' + t, props: { ends: { from: { part: 's.a' }, to: { part: 's.b' } } } })),
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 's', nodeIds: ['s'], direction: dir }] });
  const cp = (conns, dir) => ({ schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Component', label: 'A', members: ports('A', ['p1', 'p2', 'p3']) }, { id: 'B', type: 'uml.Component', label: 'B', members: ports('B', ['q1', 'q2', 'q3']) }],
    edges: conns.map(([f, t], i) => ({ id: 'c' + i, type: 'uml.Connector', from: 'B.' + t, to: 'A.' + f })), views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['B', 'A'], direction: dir }] });
  for (const mk of [cs, cp]) for (const dir of ['right', 'down']) for (const conns of [[['p1', 'q2'], ['p2', 'q1']], [['p1', 'q3'], ['p2', 'q2'], ['p3', 'q1']]])
    assert.deepEqual(check(mk(conns, dir), 'v').map(p => p.message), [], `${mk === cs ? 'composite' : 'component'} ${dir} ${JSON.stringify(conns)}`);
});

test('audit 39: a node\'s port lines follow where the far node put its ports, not their rank, so they run parallel (spreadPorts)', () => {
  // Comp0's p1 also has a line to Comp4 below, so Comp0 puts p2 above p1; Comp3, whose id sorts later, ranked its ends by p1
  // before p2 (audit 38's way), and its two lines to Comp0 crossed
  const port = (id, label) => ({ id, type: 'uml.Port', label });
  const cp = dir => ({ schemaVersion: 2, title: 'F', nodes: [
    { id: 'C0', type: 'uml.Component', label: 'Comp0', members: [port('C0p1', 'p1'), port('C0p2', 'p2')] },
    { id: 'C3', type: 'uml.Component', label: 'Comp3', members: [port('C3p0', 'p0'), port('C3p1', 'p1')] },
    { id: 'C4', type: 'uml.Component', label: 'Comp4', members: [port('C4p0', 'p0')] }],
  edges: [{ id: 'c0', type: 'uml.Connector', from: 'C3p1', to: 'C0p1' }, { id: 'c2', type: 'uml.Connector', from: 'C3p0', to: 'C0p2' }, { id: 'c3', type: 'uml.Connector', from: 'C4p0', to: 'C0p1' }],
  views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['C0', 'C3', 'C4'], direction: dir }] });
  // a composite the round-39 fuzzer found: three parts of one type, two lines between part0 and part2, and two of the subject's ports
  const cs = dir => ({ schemaVersion: 2, title: 'F', nodes: [
    { id: 'S', type: 'uml.Class', label: 'Shop', members: [port('Sp0', 'sp0'), port('Sp1', 'sp1'), ...[0, 1, 2].map(i => ({ id: 'S.' + i, type: 'uml.Property', label: 'part' + i, props: { valueType: 'Type0' } }))] },
    { id: 'T0', type: 'uml.Class', label: 'Type0', members: [port('T0p0', 'p0'), port('T0p1', 'p1')] }],
  edges: [{ id: 'c0', type: 'uml.Connector', from: 'T0p1', to: 'T0p0', props: { ends: { from: { part: 'S.0' }, to: { part: 'S.2' } } } },
    { id: 'c1', type: 'uml.Connector', from: 'T0p0', to: 'Sp0', props: { ends: { from: { part: 'S.1' } } } },
    { id: 'c2', type: 'uml.Connector', from: 'T0p0', to: 'T0p1', props: { ends: { from: { part: 'S.0' }, to: { part: 'S.2' } } } },
    { id: 'c3', type: 'uml.Connector', from: 'Sp1', to: 'T0p1', props: { ends: { to: { part: 'S.0' } } } }],
  views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S', nodeIds: ['S'], direction: dir }] });
  for (const mk of [cp, cs]) for (const dir of ['right', 'down']) assert.deepEqual(check(mk(dir), 'v').map(p => p.message), [], `${mk === cp ? 'component' : 'composite'} ${dir}`);
  const g = layout(cp('right'), 'v'), pts = id => g.edges.find(e => e.id === id).pts;
  assert.deepEqual([pts('c0').length, pts('c2').length], [2, 2], 'Comp3\'s two lines to Comp0 run straight'); // as 8774b14 drew them
});

test('audit 41: a part, port or member row added or renamed to a name another member of its class holds is refused in member-names\' words, here and in the component view', () => {
  const C = { id: 'c', type: 'uml.Class', label: 'Car', members: [{ id: 'c.engine', type: 'uml.Property', label: 'engine', props: { valueType: 'Engine', aggregation: 'composite' } },
    { id: 'c.wheel', type: 'uml.Property', label: 'wheel', props: { valueType: 'Wheel', aggregation: 'composite' } }, { id: 'c.go', type: 'uml.Operation', label: 'go' }] };
  const m = { schemaVersion: 2, nodes: [C, { id: 'E', type: 'uml.Class', label: 'Engine' }, { id: 'W', type: 'uml.Class', label: 'Wheel' }], edges: [], views: [{ id: 'cs', diagram: 'uml.composite-structure', subject: 'c', nodeIds: ['c'] }] };
  const v = m.views[0], said = /^member-names: "Car" has a member named "engine" already \(c\.engine\)/;
  assert.match(T.edits.member(m, v, 'c', null, 'engine : Engine').error, said, 'a part added');
  assert.match(T.edits.member(m, v, 'c', null, 'port engine : Api').error, said, 'a port added');
  assert.match(T.edits.member(m, v, 'c', 'c.wheel', 'engine : Wheel').error, said, 'a part row edited');
  assert.match(T.edits.rename(m, v, 'c.wheel', 'engine').error, said, 'F2');
  assert.match(T.edits.add(m, v, { type: 'uml.Property' }, 'engine : Engine', { sel: [] }).error, said, 'the Part entry');
  assert.match(T.member.edit(C.members[1], 'engine : Wheel', C).error, said, 'the panel row');
  assert.match(T.member.add('engine : Engine', C).error, said, 'the panel\'s New member');
  assert.ok(Array.isArray(T.member.edit(C.members[2], 'engine()', C).commands), 'an operation is told apart by its parameters: engine() is no clash with the part');
  // what is no clash still goes through: a new name, the same name kept, a type changed
  assert.ok(Array.isArray(T.edits.member(m, v, 'c', null, 'tyre : Wheel')));
  assert.deepEqual(T.edits.rename(m, v, 'c.wheel', 'wheel : Wheel'), []);
  assert.ok(Array.isArray(T.edits.rename(m, v, 'c.wheel', 'rim')));
  // a component's or a collaboration's members: no classifier member-names judges, not refused here
  const k = structuredClone(m); k.nodes[0].type = 'uml.Component';
  assert.ok(Array.isArray(T.edits.rename(k, k.views[0], 'c.wheel', 'engine')));
  // the component view: an interface's operations, as the class view's
  const CP = diagramOf({ diagram: 'uml.component' }), I = { id: 'i', type: 'uml.Interface', label: 'Payments', members: [{ id: 'o1', type: 'uml.Operation', label: 'pay' }, { id: 'o2', type: 'uml.Operation', label: 'refund' }] };
  assert.match(CP.member.add('pay()', I).error, /^member-names: "Payments" has a member named "pay" already \(o1\)/);
  assert.match(CP.member.edit(I.members[1], 'pay()', I).error, /^member-names: "Payments" has a member named "pay" already \(o1\)/);
  assert.equal(CP.member.add('pay(amount: Int)', I).label, 'pay', 'an overload is no clash');
  assert.ok(Array.isArray(CP.member.edit(I.members[1], 'refund(id: Int)', I).commands));
});

test('audit 42: the properties panel\'s Name field on a part or port writing a name another member of its class holds is refused in member-names\' words, as F2 is', async () => {
  await import('../src/typed/edit.js');
  const { typedEditor } = await import('../src/canvas/edit.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Class', label: 'Shop', members: [P('shop.a', 'a', { props: { valueType: 'W' } }), P('shop.b', 'b', { props: { valueType: 'W' } }), port('shop.p')] },
    { id: 'w', type: 'uml.Class', label: 'W' }], edges: [], views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'shop', nodeIds: ['shop'] }] };
  const got = [], status = [];
  const I = typedEditor({ root: { addEventListener() {} }, stage: { addEventListener() {} }, can: () => true, say() {}, status: s => status.push(s), emit: c => got.push(c), view: () => 'v', model: () => m, picked: () => [], sel: () => null,
    geo: () => ({ byId: {}, nodes: [] }), cam: () => null, focus() {}, touch() {} });
  const set = (id, value) => { got.length = 0; status.length = 0; const ok = I.field(id, 'label', value, () => { got.push([{ op: 'set', id, path: 'label', value }]); return true; }); return { ok, c: got.flat(), status: [...status] }; };
  for (const id of ['shop.a', 'shop.p']) {
    const r = set(id, 'b');
    assert.equal(r.ok, false, id); assert.deepEqual(r.c, [], id);
    assert.match(r.status[0], /^member-names: "Shop" has a member named "b" already \(shop\.b\)/, id);
    assert.equal(I.label({ type: 'node', id }, 'b'), false, `${id}: F2 says the same`);
  }
  // a new name, or a field other than the name, is the default set; a component's members are no classifier member-names judges
  assert.deepEqual(set('shop.a', 'c').c, [{ op: 'set', id: 'shop.a', path: 'label', value: 'c' }]);
  assert.equal(T.edits.field(m, m.views[0], 'shop.a', 'props.valueType', 'b'), null);
  const k = structuredClone(m); k.nodes[0].type = 'uml.Component';
  assert.equal(T.edits.field(k, k.views[0], 'shop.a', 'label', 'b'), null);
});

test('audit 43: validate() says a drawn port\'s type, a role\'s type and multiplicity and a collaboration use\'s collaboration that are not text', () => {
  const O = { z: 3 }, said = m => validate(m).filter(p => / is not text|role .*multiplicity/.test(p.message)).map(p => p.path).sort();
  const m = { schemaVersion: 2, nodes: [
    { id: 'c', type: 'uml.Class', label: 'C', members: [{ id: 'c.q', type: 'uml.Port', label: 'q', props: { valueType: O } }, { id: 'c.p', type: 'uml.Property', label: 'p', props: { valueType: 'W' } }] },
    { id: 'w', type: 'uml.Class', label: 'W', members: [{ id: 'w.r', type: 'uml.Port', label: 'r', props: { valueType: O } }] },
    { id: 'u', type: 'uml.CollaborationUse', label: 'u', parent: 'c', props: { collaboration: O } },
    { id: 'k', type: 'uml.Collaboration', label: 'K', members: [{ id: 'k.r', type: 'uml.Property', label: 'r', props: { valueType: O, multiplicity: O } }] }], edges: [],
    views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'c', nodeIds: ['c', 'u', 'k'] }] };
  assert.deepEqual(said(m), ['nodes[0].members[0].props.valueType', 'nodes[1].members[0].props.valueType', 'nodes[2].props.collaboration', 'nodes[3].members[0].props.multiplicity', 'nodes[3].members[0].props.valueType']);
  assert.ok(validate(m).some(p => p.message === 'part-multiplicity: role "r"\'s multiplicity [[object Object]] is not one (1, *, 0..1, 1..*)'));
  const bad = structuredClone(m); bad.nodes[3].members[0].props = { valueType: 'W', multiplicity: '3..1' };
  assert.ok(validate(bad).some(p => p.message === 'part-multiplicity: role "r"\'s multiplicity [3..1] has its lower bound above its upper'));
});

// audit 45: a comment link drawn from an element to a comment on the object, component, deployment, composite, activity and
// information flow views is added from the comment, as the class view's (audit 44); with no comment at either end, refused
test('connect: a comment link drawn to a comment is added from it on the other UML views (audit 45)', () => {
  for (const [d, t] of [['uml.object', 'uml.InstanceSpecification'], ['uml.component', 'uml.Component'], ['uml.deployment', 'uml.Node'], ['uml.activity', 'uml.Action'], ['uml.information-flow', 'uml.Class']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: t, label: 'A' }, { id: 'b', type: t, label: 'B' }, { id: 'k', type: 'uml.Comment', label: 'note' }, { id: 'k2', type: 'uml.Comment', label: 'other' }],
      edges: [], views: [{ id: 'v', diagram: d, title: 'V', nodeIds: ['a', 'b', 'k', 'k2'] }] }, D = diagramOf(m.views[0]), c = (f, x) => D.edits.connect(m, m.views[0], f, x, null, { type: 'uml.CommentLink' });
    const r = c('a', 'k'); assert.deepEqual(r, [{ op: 'add', element: { id: 'commentlink1', type: 'uml.CommentLink', from: 'k', to: 'a' }, view: 'v' }], d);
    assert.ok(describe(apply(m, r), 'v').split('\n').every(l => !/about note|from A to note/.test(l)), d);
    assert.equal(c('k', 'a'), null, `${d}: from a comment, the default`); assert.equal(c('k', 'k2'), null, d);
    assert.deepEqual(c('a', 'b'), { error: 'A comment link runs from a comment' }, d);
    // a comment the view holds as its own (view.nodes)
    const own = structuredClone(m); own.nodes = own.nodes.filter(n => n.id !== 'k'); own.views[0].nodes = [{ id: 'k', type: 'uml.Comment', label: 'note' }];
    assert.deepEqual(D.edits.connect(own, own.views[0], 'a', 'k', null, { type: 'uml.CommentLink' })[0].element, { id: 'commentlink1', type: 'uml.CommentLink', from: 'k', to: 'a' }, `${d}: a view's own comment`); }
  // the composite view: between a part and a comment, from the comment; between two parts, refused; on a port of a part, as before
  const m = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url), 'utf8')), v = m.views.find(x => x.diagram === 'uml.composite-structure');
  m.nodes.push({ id: 'k', type: 'uml.Comment', label: 'note' }); v.nodeIds.push('k');
  const D = diagramOf(v), c = (f, x) => D.edits.connect(m, v, f, x, null, { type: 'uml.CommentLink' });
  assert.deepEqual(c('order-service.checkout', 'k'), [{ op: 'add', element: { id: 'commentlink1', type: 'uml.CommentLink', from: 'k', to: 'order-service.checkout' }, view: v.id }]);
  assert.equal(c('k', 'order-service.checkout'), null);
  assert.deepEqual(c('order-service.checkout', 'order-service.pricing'), { error: 'A comment link runs from a comment' });
});

test('audit 50: a part\'s text parses in linear time, a run of spaces too (as the timing view\'s F2), and as before', () => {
  const sp = ' '.repeat(64000);
  for (const s of ['a' + sp + 'x', 'a' + sp + ': T' + sp + 'x', 'a : T' + sp + '[1' + sp + 'x]', 'a' + sp + '[1]']) {
    const t = performance.now(); csParse(s); assert.ok(performance.now() - t < 250, `${s.length} characters in ${performance.now() - t} ms`); }
  assert.deepEqual(csParse('a' + sp + '[1]'), { label: 'a', valueType: undefined, multiplicity: '1' });
  for (const [s, r] of [['engine : ns::Engine  [0..1]', { label: 'engine', valueType: 'ns::Engine', multiplicity: '0..1' }], [': Engine [1]', { label: undefined, valueType: 'Engine', multiplicity: '1' }],
    ['a:::b', { label: 'a::', valueType: 'b', multiplicity: undefined }], ['list : T[]', { label: 'list', valueType: 'T[]', multiplicity: undefined }], ['a : b : c', { error: 'A part is name : Type [multiplicity]' }]])
    assert.deepEqual(csParse(s), r, s);
});
