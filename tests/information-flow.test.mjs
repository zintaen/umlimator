// The information flow diagram, uml.information-flow (work package M2.5, notes/milestone-2.md §7.4): the type's definition,
// the information item (a classifier with a filled triangle), 15-information-flow.json laid out clean right and down, line
// ends on outlines, the layout not edited after layoutTyped, accessible names, the reading order, the legend, describe(), the
// PDF's tables and line text (S17), the validators each with a passing and a failing case, conveyed as a declared reference,
// the editing hooks (connect, rename, remove), a 30-step session saved and reopened, and the common edit's time (§11). tests/information-flow.html draws
// it in a browser and edits it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE } from '../src/draw/shapes.js';
import { textW } from '../src/core/text.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { tablesOf } from '../src/page/print.js';
import '../src/uml/information.js';

const IF = JSON.parse(readFileSync(new URL('../examples/order-information-flow.json', import.meta.url)));
const V = 'order-flows';
const T = diagramOf({ diagram: 'uml.information-flow' });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const N = (id, type, label) => ({ id, type: 'uml.' + type, label });
const F = (id, from, to, conveyed, label) => ({ id, type: 'uml.InformationFlow', from, to, props: { conveyed }, ...(label ? { label } : {}) });
const model = (nodes, edges) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.information-flow', nodeIds: nodes.map(n => n.id) }] });
const withDir = (m, direction) => { const c = structuredClone(m); c.views.forEach(v => { v.direction = direction; }); return c; };
const flow = (m, id) => m.edges.find(e => e.id === id);
// each line's drawn path's two ends, from the markup (tests/deployment.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// a point's distance from a box's border; an actor's outline is its figure's 24 px column (SHAPE.actor.inset)
const boxOff = (n, [x, y]) => { const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h); return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };
const outline = n => (n.shape === 'actor' ? { x: n.x + (n.w - 24) / 2, y: n.y, w: 24, h: n.h } : n);

test('the definition: uml.information-flow is registered with its palette, its two lines, conveyed a declared reference, its rules and its hooks', () => {
  assert.equal(T.name, 'uml.information-flow');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.Class', 'Class'], ['uml.Interface', 'Interface'], ['uml.Component', 'Component'], ['uml.Actor', 'Actor'], ['uml.InformationItem', 'Information item'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.InformationFlow', 'Information flow'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.refs, { 'uml.InformationFlow': { 'props.conveyed': 'drop' } });
  for (const k of ['layout', 'validate', 'describe', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', k);
  assert.equal(T.validate.length, 1, 'validate(model): run once, not once a view');
  assert.deepEqual(Object.keys(T.edits), ['connect', 'rename', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['conveyed-some', 'conveyed-kind', 'conveyed-once', 'flow-ends']);
});

test('the information item: the classifier 32 px wider, a filled triangle at its top right, its name kept clear of it and named by its accessible name', () => {
  const S = SHAPE['information-item'], C = SHAPE.classifier, n = { type: 'uml.InformationItem', label: 'Card details', compartments: [] };
  assert.deepEqual(S.size(n), { w: C.size(n).w + 32, h: C.size(n).h });
  const box = { ...n, id: 'card', x: 10, y: 20, ...S.size(n), aria: 'Information item Card details, conveyed by 2 flows' }, svg = S.draw(box, 'var(--um-muted)', 'var(--um-panel)');
  assert.match(svg, /^<g class="node classifier" data-id="card" data-shape="information-item" tabindex="-1" role="img" aria-label="Information item Card details, conveyed by 2 flows">/);
  const [, x0, y0] = /<path d="M([\d.]+) ([\d.]+)L[^"]*Z" class="if-icon" fill="var\(--um-muted\)"/.exec(svg).map(Number);
  assert.deepEqual([x0, y0], [box.x + box.w - 16, box.y + 6], 'the triangle, 10 px, at the top right');
  assert.match(svg, />Card details<\/text>/, 'the name whole');
  // a long name: cut so its right end stays 24 px clear of the box's right side, centred
  const long = { ...n, label: 'x'.repeat(200) }, L = { ...long, id: 'l', x: 0, y: 0, ...S.size(long) };
  const t = /class="c-name"[^>]*>([^<]*)</.exec(S.draw(L, 'c', 'f'))[1];
  assert.ok(t.endsWith('…') && L.w / 2 + textW(t, 13) / 2 <= L.w - 24 + .5, `${t.length} characters in ${L.w} px`);
});

test('15-information-flow.json draws: an actor, components, items, «flow» lines by what they convey; laid out clean right and down', () => {
  assert.deepEqual(validate(IF), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(IF, direction), g = layout(m, V), by = g.byId;
    assert.deepEqual(check(m, V), [], direction);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${direction}: ${p.id} and ${q.id} overlap`);
    assert.equal(by.shopper.shape, 'actor');
    assert.deepEqual(['storefront-component', 'shop-api', 'payment-provider-component', 'warehouse', 'email-service'].map(id => by[id].shape), Array(5).fill('component'));
    assert.deepEqual(['order-info', 'card-details', 'receipt-info', 'stock-info'].map(id => by[id].shape), Array(4).fill('information-item'));
    const e = Object.fromEntries(g.edges.map(x => [x.id, x]));
    assert.deepEqual(e['flow-shopper-storefront'].end, { from: 'none', to: 'open', dashed: true });
    assert.equal(e['flow-shopper-storefront'].label, '«flow» Order, Card details');
    assert.equal(e['api-email'].label, '«flow» Order, Receipt');
    assert.ok(g.edges.every(x => x.cut === 280 && x.lbl && !x.lbl.short), `${direction}: every label placed whole, cut at 280`);
    // the reply that closes the loop, back over three columns, runs under the rows (laid out right: bottom to bottom)
    assert.deepEqual([e['email-shopper'].fromSide, e['email-shopper'].toSide], ['bottom', 'bottom']);
    assert.ok(!e['warehouse-api'].fromSide, 'a flow back one column keeps the router\'s sides');
  }
  const memos = {}; mapContext(IF, { memos }).buildView(V);
  const { gap, rgap, labelGaps, repair, reroute } = memos[V].dg;
  assert.deepEqual({ gap, rgap, labelGaps, repair, reroute }, { gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, 'S19: both flags off');
});

test('a class, an interface and a comment: the classifier (name only, «interface»), the note; a comment link dashed, no ends; a flow conveying a class', () => {
  const m = model([N('a', 'Class', 'Order'), N('b', 'Interface', 'Payments'), N('i', 'InformationItem', 'Money'), N('c', 'Comment', 'the PSP')],
    [F('f', 'a', 'b', ['a', 'i'], 'pay'), { id: 'k', type: 'uml.CommentLink', from: 'c', to: 'b' }]);
  assert.deepEqual(validate(m), []);
  for (const direction of ['right', 'down']) { const d = withDir(m, direction); assert.deepEqual(check(d, 'v'), [], direction); }
  const g = layout(m, 'v'), s = svgOf(g);
  assert.deepEqual(['a', 'b', 'c'].map(id => g.byId[id].shape), ['if-classifier', 'if-classifier', 'note']);
  assert.match(s, /data-shape="classifier" tabindex="-1" role="img" aria-label="Interface Payments"[^]*?>«interface»<\/text>/);
  assert.equal(g.edges[0].label, '«flow» pay: Order, Money', 'its name, then what it conveys');
  assert.deepEqual(g.edges[1].end, { from: 'none', to: 'none', dashed: true });
  assert.equal(g.edges[1].label, undefined);  // any other kind a view shows carries its keyword, so none passes for a class
  const o = model([N('d', 'DataType', 'Money'), N('e', 'Enumeration', 'Status'), N('p', 'PrimitiveType', 'Cents'), N('u', 'UseCase', 'Buy')], []), og = layout(o, 'v');
  assert.deepEqual(['d', 'e', 'p', 'u'].map(id => og.byId[id].stereotypes), [['dataType'], ['enumeration'], ['primitive'], ['useCase']]);
  assert.deepEqual(g.byId.a.stereotypes, [], 'a class: its name only');
});

test('every line end is on its outline within 1 px: a component\'s box, an actor\'s figure', () => {
  for (const direction of ['right', 'down']) {
    const { g, markup } = mapContext(withDir(IF, direction)).buildView(V), E = ends(markup);
    assert.equal(E.length, g.edges.length);
    E.forEach(({ from, to, i, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => {
      const d = boxOff(outline(g.byId[id]), p); assert.ok(d <= 1, `${direction}: ${g.edges[i].id} ends ${d.toFixed(2)} px off ${id}`); }));
  }
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (§2.6)', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(IF, { memos }).buildView(V), pts = JSON.stringify(memos[V].g.edges.map(e => e.pts)), second = mapContext(IF, { memos }).buildView(V);
  assert.equal(memos[V].runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos[V].g.edges.map(e => e.pts)), pts);
});

test('names, reading order and legend (A1): each element by its kind and what conveys it, each flow by its ends and what it conveys', () => {
  const g = layout(IF, V), s = svgOf(g);
  assert.equal(g.byId.shopper.aria, 'Actor Shopper');
  assert.equal(g.byId['shop-api'].aria, 'Component Shop API');
  assert.equal(g.byId['order-info'].aria, 'Information item Order, conveyed by 4 flows');
  assert.equal(g.byId['card-details'].aria, 'Information item Card details, conveyed by 2 flows');
  const e = id => g.edges.find(x => x.id === id).aria;
  assert.equal(e('flow-shopper-storefront'), 'Information flow from Shopper to Storefront, conveys Order and Card details');
  assert.equal(e('storefront-payments'), 'Information flow from Storefront to Payment provider, conveys Card details');
  assert.match(s, /role="img" aria-label="Information item Order, conveyed by 4 flows"/);
  assert.match(s, /aria-label="Actor Shopper"/);
  assert.deepEqual(g.order, [...IF.views[0].nodeIds, ...IF.edges.map(x => x.id)], 'the view\'s elements in its order, then every line');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Information flow']);
  // three conveyed, a name, stereotypes
  const m = structuredClone(IF); Object.assign(flow(m, 'api-email'), { label: 'confirm' }); flow(m, 'api-email').props.conveyed.push('stock-info');
  m.nodes.find(n => n.id === 'warehouse').props = { stereotypes: ['external'] };
  const h = layout(m, V);
  assert.equal(h.edges.find(x => x.id === 'api-email').aria, 'Information flow confirm from Shop API to Email service, conveys Order, Receipt and Stock level');
  assert.equal(h.byId.warehouse.aria, 'Component Warehouse (external)');
});

test('describe(): the view in sentences, each element in reading order, then each line by its accessible name', () => {
  const d = describe(IF, V).split('\n');
  assert.equal(d[0], 'What travels with an order: an information flow diagram of 10 elements and 8 lines.');
  assert.deepEqual(d.slice(1, 3), ['Actor Shopper.', 'Component Storefront.']);
  assert.equal(d.at(-1), 'Information flow from Email service to Shopper, conveys Receipt.');
  assert.equal(d.length, 1 + 10 + 8);
});

test('the PDF (§9, S17): each element\'s kind; an item\'s rows, the flows that convey it; the lines table lists what each flow conveys', () => {
  const v = IF.views[0];
  assert.deepEqual(['shopper', 'shop-api', 'order-info', 'nowhere'].map(id => T.word(IF, id)), ['Actor', 'Component', 'Information item', null]);
  assert.deepEqual(T.rows(IF, v, 'card-details'), ['Shopper → Storefront', 'Storefront → Payment provider']);
  assert.equal(T.rows(IF, v, 'shop-api'), null);
  const cv = structuredClone(IF); flow(cv, 'api-email').props.conveyed.push('warehouse');
  assert.deepEqual(T.rows(cv, v, 'warehouse'), ['Shop API → Email service'], 'a conveyed component: the flows that convey it');
  assert.equal(T.text(IF, v, 'api-email'), 'Order, Receipt');
  const ctx = mapContext(IF), [els, lines] = tablesOf(ctx, ctx.V[V], { nodes: [], edges: layout(IF, V).edges }), cells = r => [...r.matchAll(/<td>(.*?)<\/td>/g)].map(x => x[1]);
  assert.deepEqual(lines.rows.map(r => cells(r)[1]), ['Order, Card details', 'Card details', 'Order', 'Order', 'Stock level', 'Stock level', 'Order, Receipt', 'Receipt']);
  assert.deepEqual(lines.rows.map(r => cells(r)[2]), Array(8).fill('Information flow'));
  assert.ok(els.rows.some(r => cells(r)[1] === 'Information item' && cells(r)[2] === '<p>Shopper → Storefront</p><p>Storefront → Payment provider</p>'), 'the item\'s rows');
  // a flow with a name: the name, then what it conveys
  const m = structuredClone(IF); flow(m, 'api-email').label = 'confirm';
  assert.equal(T.text(m, v, 'api-email'), 'confirm: Order, Receipt');
});

// ---- §7.4: validators, each with a passing and a failing case
const BREAKS = {
  'conveyed-some': m => { flow(m, 'api-warehouse').props.conveyed = []; return ['api-warehouse']; },
  'conveyed-kind': m => { m.nodes.push(N('n1', 'Comment', 'a note')); flow(m, 'api-warehouse').props.conveyed.push('n1'); return ['api-warehouse', 'n1']; },
  'conveyed-once': m => { flow(m, 'api-warehouse').props.conveyed.push('order-info'); return ['api-warehouse', 'order-info']; },
  'flow-ends': m => { m.edges.push(F('bad', 'order-info', 'shop-api', ['card-details'])); return ['bad', 'order-info', 'shop-api']; },
};
test('validators: 15-information-flow.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements', () => {
  assert.deepEqual(T.validate(IF), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(IF), ids = broke(m), got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // a conveyed id that is gone; conveyed missing; a classifier and an item not shown conveyed (passes); a comment link is no flow
  const gone = structuredClone(IF); flow(gone, 'api-warehouse').props.conveyed = ['order-info', 'parcel'];
  assert.deepEqual(T.validate(gone).map(p => [p.rule, p.path, p.message]), [['conveyed-kind', 'edges[3].props.conveyed[1]', 'conveyed-kind: api-warehouse conveys "parcel", which the model does not hold']]);
  const none = structuredClone(IF); delete flow(none, 'api-warehouse').props;
  assert.deepEqual(T.validate(none).map(p => p.rule), ['conveyed-some']);
  const hidden = structuredClone(IF); hidden.views[0].nodeIds = hidden.views[0].nodeIds.filter(id => id !== 'stock-info'); flow(hidden, 'api-warehouse').props.conveyed.push('warehouse', 'stock-info');
  assert.deepEqual(T.validate(hidden), [], 'an item not shown and a component may be conveyed');
  // UML 2.5.1's convey_classifiers: an actor, a data type, an enumeration or a primitive type is never conveyed
  for (const t of ['Actor', 'DataType', 'Enumeration', 'PrimitiveType']) {
    const m = structuredClone(IF); m.nodes.push(N('k', t, 'K')); flow(m, 'api-warehouse').props.conveyed.push('k');
    assert.deepEqual(T.validate(m).map(p => p.rule), ['conveyed-kind'], t);
  }
  // a type named like an Object member is a kind like any other, never a crash
  for (const t of ['constructor', 'toString', '__proto__']) {
    const m = structuredClone(IF); m.nodes.push({ id: 'x', type: t, label: 'X' }); flow(m, 'api-warehouse').props.conveyed.push('x'); m.edges.push(F('xf', 'x', 'shop-api', ['order-info']));
    assert.deepEqual(T.validate(m).map(p => p.rule), ['conveyed-kind', 'flow-ends'], t);
    assert.match(T.validate(m)[0].message, new RegExp(`a ${t.toLowerCase()}:`));
  }
  const toComment = structuredClone(IF); toComment.nodes.push(N('n1', 'Comment', 'x')); toComment.edges.push(F('c', 'shopper', 'n1', ['order-info']));
  assert.equal(T.validate(toComment)[0].message, 'flow-ends: c runs from "Shopper" (actor) to "x" (comment): a flow joins two classes, interfaces, components or actors');
});

test('conveyed is a declared reference: deleting an item drops it from every flow that conveys it, and the flows stay; hiding it changes nothing', () => {
  const m = apply(IF, [{ op: 'delete', id: 'order-info' }]);
  assert.deepEqual(m.edges.map(e => e.props.conveyed), [['card-details'], ['card-details'], [], [], ['stock-info'], ['stock-info'], ['receipt-info'], ['receipt-info']]);
  assert.equal(m.edges.length, 8, 'no flow is deleted with it');
  assert.deepEqual(T.validate(m).map(p => [p.rule, p.ids[0]]), [['conveyed-some', 'flow-storefront-api'], ['conveyed-some', 'api-warehouse']], 'a flow left conveying nothing is said');
  assert.equal(layout(m, V).edges.find(e => e.id === 'api-email').label, '«flow» Receipt');
  const h = apply(IF, [{ op: 'hide', id: 'order-info', view: V }]);
  assert.deepEqual(h.edges.map(e => e.props.conveyed), IF.edges.map(e => e.props.conveyed));
  assert.equal(layout(h, V).edges.find(e => e.id === 'api-email').label, '«flow» Order, Receipt', 'an item not shown is still named');
  // a classifier deleted: its flows go (their ends), and it leaves what conveys it
  const c = structuredClone(IF); flow(c, 'api-warehouse').props.conveyed.push('payment-provider-component');
  const d = apply(c, [{ op: 'delete', id: 'payment-provider-component' }]);
  assert.ok(!d.edges.some(e => e.id === 'storefront-payments')); assert.deepEqual(flow(d, 'api-warehouse').props.conveyed, ['order-info']);
});

// ---- §7.4: editing
test('remove: Shift + Delete on an item takes the flows it leaves conveying nothing, said; a flow conveying more keeps it; Delete, the default', () => {
  const v = IF.views[0], r = T.edits.remove(IF, v, ['order-info'], true);
  assert.deepEqual(r.commands, ['order-info', 'flow-storefront-api', 'api-warehouse'].map(id => ({ op: 'delete', id })));
  assert.equal(r.say, 'Deleted "Order" and the 2 flows that conveyed nothing else: Storefront → Shop API, Shop API → Warehouse');
  const m = apply(IF, r.commands);
  assert.deepEqual(validate(m), [], 'no flow left conveying nothing');
  assert.deepEqual(flow(m, 'api-email').props.conveyed, ['receipt-info'], 'one conveying more keeps the rest');
  assert.equal(T.edits.remove(IF, v, ['order-info'], false), null, 'Delete hides: the default');
  assert.equal(T.edits.remove(IF, v, ['shop-api'], true), null, 'a component: its flows go by their ends, the default');
  assert.equal(T.edits.remove(IF, v, ['api-email'], true), null);
  assert.equal(T.edits.remove(IF, v, ['order-info', 'api-email'], true).say, 'Deleted "Order", the line Shop API → Email service and the 2 flows that conveyed nothing else: Storefront → Shop API, Shop API → Warehouse', 'a line by its ends');
});

test('connect: a flow between two classifiers or actors asks what it conveys, items first; other ends refused; rename sets what it conveys by name', () => {
  const v = IF.views[0], line = { type: 'uml.InformationFlow' };
  const r = T.edits.connect(IF, v, 'shopper', 'shop-api', null, line);
  assert.deepEqual(r.pick, ['Order', 'Card details', 'Receipt', 'Stock level', 'Storefront', 'Shop API', 'Payment provider', 'Warehouse', 'Email service'], 'no actor (convey_classifiers)');
  assert.deepEqual(r.then(2), [{ op: 'add', element: { id: 'flow1', type: 'uml.InformationFlow', from: 'shopper', to: 'shop-api', props: { conveyed: ['receipt-info'] } }, view: V }]);
  assert.deepEqual(validate(apply(IF, r.then(2))), []);
  assert.deepEqual(T.edits.connect(IF, v, 'order-info', 'shop-api', null, line), { error: 'An information flow joins two classes, interfaces, components or actors' });
  assert.equal(T.edits.connect(IF, v, 'shopper', 'shop-api', null, { type: 'uml.CommentLink' }), null, 'a comment link: the default');
  const bare = structuredClone(IF); bare.nodes = bare.nodes.filter(n => n.type === 'uml.Actor'); bare.nodes.push(N('c', 'Comment', 'x'));
  assert.deepEqual(T.edits.connect(bare, v, 'shopper', 'shopper', null, line), { error: 'Add an information item for the flow to convey first' }, 'an actor is never conveyed');
  // rename: the text as drawn, «flow» or not, `[name:] names`; each by its name, else its id
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', '«flow» Order, Receipt'), [], 'unchanged: nothing');
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', 'Receipt, Stock level'), [{ op: 'set', id: 'api-email', path: 'props.conveyed', value: ['receipt-info', 'stock-info'] }]);
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', 'confirm: Order, receipt-info'), [{ op: 'set', id: 'api-email', path: 'label', value: 'confirm' }]);
  const named = apply(IF, T.edits.rename(IF, v, 'api-email', 'confirm: Order, Receipt'));
  assert.deepEqual(T.edits.rename(named, v, 'api-email', 'Order'), [{ op: 'set', id: 'api-email', path: 'props.conveyed', value: ['order-info'] }, { op: 'set', id: 'api-email', path: 'label', value: undefined }]);
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', 'Order, Parcel'), { error: 'No information item or classifier is named Parcel' });
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', '«flow» '), { error: 'A flow conveys one element at least' });
  assert.equal(T.edits.rename(IF, v, 'shopper', 'Buyer'), null, 'an element: the default');
  assert.deepEqual(T.edits.rename(IF, v, 'api-email', 'Order, Order, Receipt'), [], 'each element once');
  // names holding `:` or `,`, and a flow's name holding `:`: the text as drawn comes back unchanged, and each reads right
  const odd = structuredClone(IF); odd.nodes.push(N('q', 'InformationItem', 'Billing::Receipt'), N('pdf', 'InformationItem', 'Receipt: PDF'), N('na', 'InformationItem', 'Name, address'), N('p2', 'InformationItem', 'PDF'));
  flow(odd, 'api-email').props.conveyed = ['q', 'pdf', 'na']; flow(odd, 'api-email').label = 'step 1: confirm';
  const drawn = layout(odd, V).edges.find(e => e.id === 'api-email').label;
  assert.equal(drawn, '«flow» step 1: confirm: Billing::Receipt, Receipt: PDF, Name, address');
  assert.deepEqual(T.edits.rename(odd, v, 'api-email', drawn), [], 'Enter on the text as drawn: nothing');
  assert.deepEqual(T.edits.rename(odd, v, 'api-email', 'Receipt: PDF'), [{ op: 'set', id: 'api-email', path: 'props.conveyed', value: ['pdf'] }, { op: 'set', id: 'api-email', path: 'label', value: undefined }], 'the whole text names an element: no name');
  assert.deepEqual(T.edits.rename(odd, v, 'api-email', 'step 2: Name, address, PDF'), [{ op: 'set', id: 'api-email', path: 'props.conveyed', value: ['na', 'p2'] }, { op: 'set', id: 'api-email', path: 'label', value: 'step 2' }]);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: N(`c${i}`, i % 2 ? 'Class' : 'Component', `Service ${i}`), view: V }],
    [{ op: 'add', element: N(`it${i}`, 'InformationItem', `Item ${i}`), view: V }],
    [{ op: 'add', element: F(`f${i}`, `c${i}`, 'shop-api', [`it${i}`]), view: V }],
    [{ op: 'set', id: `f${i}`, path: 'props.conveyed', value: [`it${i}`, 'order-info'] }],
    [[{ op: 'set', id: `f${i}`, path: 'label', value: `step ${i}` }], [{ op: 'hide', id: `it${i}`, view: V }], [{ op: 'set', id: `c${i}`, path: 'props.stereotypes', value: ['external'] }]][i % 3],
    [[{ op: 'delete', id: `it${i}` }], [{ op: 'set', id: `c${i}`, path: 'label', value: `Renamed ${i}` }], [{ op: 'delete', id: `f${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(IF), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), draw = (m, o) => unid(mapContext(m, o).buildView(V).markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos[V].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, V), describe(JSON.parse(seen[30]), V));
});

// §11: 40 nodes (24 components and classes, 16 items) and 60 flows, each conveying one to three items
const STRESS = (() => {
  const nodes = [], edges = [];
  for (let i = 0; i < 24; i++) nodes.push(N(`s${i}`, i % 3 ? 'Component' : 'Class', `Service ${i}`));
  for (let i = 0; i < 16; i++) nodes.push(N(`i${i}`, 'InformationItem', `Item ${i}`));
  for (let k = 0; k < 60; k++) edges.push(F(`f${k}`, `s${k % 24}`, `s${(k * 7 + 1 + Math.floor(k / 24)) % 24}`, [`i${k % 16}`, ...(k % 3 ? [`i${(k + 5) % 16}`] : []), ...(k % 5 ? [] : [`i${(k + 9) % 16}`])]));
  return model(nodes, edges);
})();
test('P1 (§11): on 40 nodes and 60 flows, a full layout and a conveyed element added (laid out and drawn) under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven) (timed)', () => {
  assert.equal(STRESS.nodes.length, 40); assert.equal(STRESS.edges.length, 60); assert.deepEqual(validate(STRESS), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('v');
  draw(STRESS);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => { const was = memos.v.runs, r = { full: timed(() => mapContext(STRESS).buildView('v')),
    add: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'f7', path: 'props.conveyed', value: ['i7', `i${(k + 8) % 16}`] }]))) };
    assert.equal(memos.v.runs, was + 1, 'the edit lays the view out again: the label grew'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('add') < 1000, `a conveyed element added ${best('add')} ms`);
  console.log(`# P1 target 100 ms: a conveyed element added ${best('add').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms; routes ${JSON.stringify(layout(STRESS, 'v').stats)}`);
});

test('audit 1: a name holding $\' or $& is its accessible name as written, the markup whole', () => {
  for (const [label, aria] of [["Price$'", 'Price$&#39;'], ['Cost$&', 'Cost$&amp;'], ['Tax$`', 'Tax$`']]) {
    const m = { schemaVersion: 2, nodes: [N('a', 'Class', label), N('b', 'Actor', 'Shopper'), N('i', 'InformationItem', 'Order')], edges: [F('f', 'b', 'a', ['i'])], views: [{ id: 'v', diagram: 'uml.information-flow', nodeIds: ['a', 'b'] }] };
    const svg = svgOf(layout(m, 'v')), g = svg.slice(svg.indexOf('data-id="a"'), svg.indexOf('>', svg.indexOf('data-id="a"')));
    assert.equal(g.match(/aria-label="([^"]*)"/)[1], `Class ${aria}`);
    assert.equal(g.match(/data-shape=/g).length, 1, label);
  }
});
