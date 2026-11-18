// The object diagram, uml.object (work package 2.3, notes/stage-2.md §9): the type's definition, the slot micro-syntax, the
// instance's look (underlined head, slots, links with roles), boxes and qualified names, its validators, describe(),
// accessible names, the legend, and a 30-step session saved and reopened. tests/object.html draws it in a browser and edits
// it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { validate } from '../src/map/validate.js';
import { mapContext } from '../src/map/context.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { tablesOf } from '../src/page/print.js';
import { parseSlot, printSlot, slotEdit } from '../src/uml/object.js';

const OBJ = JSON.parse(readFileSync(new URL('../examples/order-objects.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.object' });
const I = (id, label, classifier, slots = [], more = {}) => ({ id, type: 'uml.InstanceSpecification', ...(label != null ? { label } : {}), ...(classifier ? { props: { classifier } } : {}),
  ...(slots.length ? { members: slots.map(([f, v]) => ({ id: `${id}.${f}`, type: 'uml.Slot', label: f, ...(v != null ? { props: { value: v } } : {}) })) } : {}), ...more });
const L = (id, from, to, props, label) => ({ id, type: 'uml.Link', from, to, ...(label ? { label } : {}), ...(props ? { props } : {}) });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x > f.x && o.y > f.y && o.x + o.w < f.x + f.w && o.y + o.h < f.y + f.h;

test('the definition: uml.object is registered with its palette, its two lines, its properties and its hooks', () => {
  assert.equal(T.name, 'uml.object');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.InstanceSpecification', 'Instance'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.Link', 'Link'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.props['uml.InstanceSpecification'].map(f => f.key), ['classifier', 'stereotypes']);
  assert.deepEqual(T.props['uml.Link'].map(f => [f.key, f.path ?? null]), [['association', null], ['ends.from.role', ['ends', 'from', 'role']], ['ends.to.role', ['ends', 'to', 'role']], ['stereotypes', null]]);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners']) assert.equal(typeof T[k], 'function', k);
  assert.equal(T.validate.length, 2);
  assert.deepEqual(['uml.InstanceSpecification', 'uml.Comment', 'uml.Package'].map(t => T.member.holds({ type: t })), [true, false, false]);
  for (const r of ['slot-kinds', 'link-ends', 'instance-of', 'owner-kinds', 'member-names']) assert.ok(T.rules[r], r);
  assert.equal(T.owners, diagramOf({ diagram: 'uml.class' }).owners, 'the Owner field lists packages, as in the class view');
});

// ---- §9.2: the slot micro-syntax
test('slots: feature = value, or feature; print(parse(x)) is stable for every slot of 02-object.json and the fixtures; a line with no name is refused', () => {
  assert.deepEqual(parseSlot('status = placed'), { type: 'uml.Slot', label: 'status', props: { value: 'placed' } });
  assert.deepEqual(parseSlot('  total=34.00 EUR  '), { type: 'uml.Slot', label: 'total', props: { value: '34.00 EUR' } });
  assert.deepEqual(parseSlot('nickname'), { type: 'uml.Slot', label: 'nickname', props: {} });
  assert.deepEqual(parseSlot('Größe = 名前 = x'), { type: 'uml.Slot', label: 'Größe', props: { value: '名前 = x' } }, 'the value is the rest of the line');
  for (const bad of ['', '   ', '= 3', '3d = x', 'a b', 'a =', 'a = ']) assert.match(parseSlot(bad).error, /is not a slot: /, JSON.stringify(bad));
  const slots = [...OBJ.nodes.flatMap(n => n.members || []), { label: 'a', props: { value: '  spaced  ' } }, { label: 'b' }, { label: 'c', props: { value: '= odd' } }, { label: 'note', props: { value: 'x'.repeat(200) } }];
  for (const s of slots) { const once = printSlot(parseSlot(printSlot(s))); assert.equal(printSlot(parseSlot(once)), once, s.label); }
  for (const s of OBJ.nodes.flatMap(n => n.members)) assert.equal(printSlot(parseSlot(printSlot(s))), printSlot(s), s.id);
  assert.equal(T.member.print(OBJ.nodes[1].members[1]), 'total = 34.00 EUR');
  assert.equal(T.member.add('quantity = 3').label, 'quantity');
  // an edit: one transaction setting the label and the props, others kept; a line that does not parse applies nothing (E3)
  const m = { id: 's', type: 'uml.Slot', label: 'x', props: { value: '1', note: 'keep' } };
  assert.deepEqual(slotEdit(m, 'y = 2').commands, [{ op: 'set', id: 's', path: 'label', value: 'y' }, { op: 'set', id: 's', path: 'props', value: { note: 'keep', value: '2' } }]);
  assert.deepEqual(slotEdit(m, 'y').commands[1].value, { note: 'keep' }, 'no value: the value is removed');
  assert.ok(slotEdit(m, '= 2').error);
});

// ---- §9.1: drawing
const MIN = { schemaVersion: 2,
  nodes: [{ id: 'shop', type: 'uml.Package', label: 'shop' }, { id: 'hidden', type: 'uml.Package', label: 'hidden' },
    { id: 'Order', type: 'uml.Class', label: 'Order', members: [{ id: 'Order.total', type: 'uml.Property', label: 'total' }] },
    I('anon', null, 'Order', [['total', '1']]), I('bare', 'thing'), I('empty', 'e', 'Order'), I('novalue', 'nv', 'Order', [['total', null]]),
    I('long', 'long', 'Order', [['total', 'x'.repeat(120)]]), I('inbox', 'boxed', 'Order', [], { parent: 'shop' }), I('far', 'far', 'Order', [], { parent: 'hidden' }),
    I('st', 'st', 'Order', [], { props: { classifier: 'Order', stereotypes: ['snapshot'] } }), { id: 'c', type: 'uml.Comment', label: 'just placed' }],
  edges: [L('named', 'anon', 'bare', null, 'owns'), L('assoc', 'bare', 'empty', { association: 'Holds' }), L('roles', 'empty', 'novalue', { ends: { from: { role: 'whole' }, to: { role: 'part' } } }),
    L('twin', 'empty', 'novalue'), L('self', 'long', 'long', { ends: { to: { role: 'next' } } }), L('in', 'inbox', 'far'), { id: 'cl', type: 'uml.CommentLink', from: 'c', to: 'anon' }],
  views: [{ id: 'v', diagram: 'uml.object', title: 'Minimal', nodeIds: ['shop', 'anon', 'bare', 'empty', 'novalue', 'long', 'inbox', 'far', 'st', 'c'] }] };

test('the instance\'s look: an underlined head, name : Classifier, : Classifier or name; one slots compartment; stereotypes over it; a long value cut', () => {
  const g = layout(MIN, 'v'), n = g.byId;
  assert.deepEqual(['anon', 'bare', 'empty', 'novalue', 'long', 'inbox', 'far', 'st'].map(id => n[id].label),
    [': Order', 'thing', 'e : Order', 'nv : Order', 'long : Order', 'boxed : Order', 'hidden::far : Order', 'st : Order'], 'qualified by the owner the view does not show');
  assert.ok(['anon', 'bare', 'empty', 'st'].every(id => n[id].shape === 'classifier' && n[id].underline));
  assert.deepEqual(n.anon.compartments.map(c => [c.name, c.members.map(m => [m.label, m.props.default])]), [['slots', [['total', '1']]]]);
  assert.deepEqual(n.empty.compartments, [], 'no slots: the head alone');
  assert.deepEqual(n.st.stereotypes, ['snapshot']);
  assert.equal(n.long.w, 320, 'a long value widens the box to 320 px, then is cut');
  assert.equal(n.c.shape, 'note');
  const s = svgOf(g);
  assert.match(s, /class="c-name"[^>]*text-decoration="underline" data-o="anon">: Order<\/text>/);
  assert.match(s, /class="c-row"[^>]*>total = 1<\/text>/);
  assert.match(s, /class="c-row"[^>]*>total<\/text>/, 'a slot with no value: its feature');
  assert.match(s, /data-o="long">long : Order<\/text>[^]*?class="c-row"[^>]*>total = x+…<\/text>/);
  assert.doesNotMatch(svgOf(layout({ schemaVersion: 2, nodes: [{ id: 'k', type: 'uml.Class', label: 'K' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['k'] }] }, 'v')), /underline/, 'a class\'s name is not underlined');
  // the package shown is a box holding its instance
  assert.deepEqual(g.families.map(f => [f.id, f.nodeIds]), [['shop', ['inbox']]]);
  assert.ok(inside(n.inbox, g.families[0]));
});

test('a classifier the view shows (the outline\'s Show adds any model node) is drawn and named as the class view draws it, not as an instance', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'Order', type: 'uml.Class', label: 'Order', members: [{ id: 'Order.total', type: 'uml.Property', label: 'total' }] },
    { id: 'Pay', type: 'uml.Interface', label: 'Pay' }, I('o', 'o', 'Order', [['total', '1']])],
  views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['Order', 'Pay', 'o'] }] };
  const n = layout(m, 'v').byId;
  assert.ok(!n.Order.underline && !n.Pay.underline, 'a classifier\'s name is not underlined');
  assert.equal(n.Order.label, 'Order');
  assert.deepEqual(n.Order.compartments.map(c => [c.name, c.members.map(x => x.label)]), [['attributes', ['total']], ['operations', []]]);
  assert.deepEqual(n.Pay.stereotypes, ['interface']);
  assert.equal(n.Order.aria, 'Class Order, 1 attribute, 0 operations');
  assert.equal(n.Pay.aria, 'Interface Pay, 0 attributes, 0 operations');
  assert.ok(n.o.underline && n.o.aria.startsWith('Instance specification o : Order'), 'the instance beside it is unchanged');
  assert.match(describe(m, 'v'), /^Class Order, 1 attribute, 0 operations\.$/m);
});

test('links: no end marks, the name or else the association on the line, each role by its end; two links between one pair and a link to itself are drawn', () => {
  const g = layout(MIN, 'v'), e = Object.fromEntries(g.edges.map(x => [x.id, x]));
  assert.deepEqual(g.edges.map(x => x.id), ['named', 'assoc', 'roles', 'twin', 'self', 'in', 'cl']);
  assert.deepEqual([e.named.label, e.assoc.label, e.roles.label], ['owns', 'Holds', undefined]);
  assert.deepEqual(e.roles.end, { from: 'none', to: 'none', labels: { from: { role: 'whole' }, to: { role: 'part' } } });
  assert.deepEqual(e.cl.end, { from: 'none', to: 'none', dashed: true });
  assert.notDeepEqual(e.roles.pts, e.twin.pts, 'two links between one pair take two routes');
  assert.ok(e.self.pts.length >= 4, 'a link to itself is a loop');
  assert.equal(e.roles.aria, 'Link from e : Order (whole) to nv : Order (part)');
  assert.equal(e.named.aria, 'Link from : Order to thing: owns');
  assert.equal(e.in.aria, 'Link from boxed : Order to hidden::far : Order');
  assert.match(svgOf(g), /<title>Link from e : Order \(whole\) to nv : Order \(part\)<\/title>/);
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Link', 'Comment link']);
  // a view with no edges list draws links and comment links only; a listed line of another type is drawn
  const m = structuredClone(MIN); m.edges.push({ id: 'dep', type: 'uml.Dependency', from: 'bare', to: 'anon' });
  assert.ok(!layout(m, 'v').edges.some(x => x.id === 'dep'));
  m.views[0].edges = ['dep']; assert.deepEqual(layout(m, 'v').edges.map(x => x.id), ['dep']);
});

test('02-object.json draws: seven instances and six links, laid out clean down and right, named for a screen reader', () => {
  assert.deepEqual(validate(OBJ), []);
  for (const direction of ['down', 'right']) {
    const m = structuredClone(OBJ); m.views[0].direction = direction;
    const g = layout(m, 'snapshot');
    assert.deepEqual(check(m, 'snapshot'), [], direction);
    for (const a of g.nodes) for (const b of g.nodes) assert.ok(a === b || !meets(a, b), `${direction}: ${a.id} and ${b.id} overlap`);
    assert.equal(g.nodes.length, 7); assert.equal(g.edges.length, 6);
    assert.ok(g.edges.every(e => e.end.from === 'none' && e.end.to === 'none'));
    assert.equal(g.edges.find(e => e.id === 'ada-places-order').lbl != null, true, `${direction}: the link's name is drawn`);
    const s = svgOf(g);
    assert.match(s, /data-id="order-1042" data-shape="classifier" tabindex="-1" role="img" aria-label="Instance specification order1042 : Order, 2 slots"/);
    assert.match(s, /<title>Link from ada : Customer to order1042 : Order \(orders\): places<\/title>/);
  }
  assert.equal(check(MIN, 'v').length, 0, 'the minimal fixture lays out clean');
  const down = structuredClone(MIN); down.views[0].direction = "down"; assert.deepEqual(check(down, "v"), []);
});

test('describe(): each box then what it holds, every instance with its slots and links, in reading order', () => {
  assert.deepEqual(describe(OBJ, 'snapshot').split('\n').slice(0, 3), ['Order 1042, just placed: an object diagram of 7 elements and 6 lines.',
    'Instance specification ada : Customer, 1 slot: email = ada@example.org; linked to order1042 : Order (orders) ("places").',
    'Instance specification order1042 : Order, 2 slots: status = placed, total = 34.00 EUR; linked to ada : Customer ("places"); linked to line1 : OrderLine (lines); linked to line2 : OrderLine (lines); linked to card : CardPayment (payments).']);
  const d = describe(MIN, 'v').split('\n');
  assert.equal(d[0], 'Minimal: an object diagram of 10 elements and 7 lines.');
  assert.deepEqual(d.slice(1, 3), ['Package shop, holding 1 element.', 'Instance specification boxed : Order; linked to hidden::far : Order.']);
  assert.ok(d.includes('Instance specification long : Order, 1 slot: total = ' + 'x'.repeat(120) + '; linked to long : Order (next).'), 'a link to itself, said once');
  assert.ok(d.includes('Instance specification st : Order (snapshot).'));
  assert.ok(d.includes('Comment: just placed; about : Order.'));
});

// ---- §9.3: validators, each with a passing and a failing case
const BREAKS = {
  'slot-kinds': m => { m.nodes[0].members.push({ id: 'ada.op', type: 'uml.Operation', label: 'pay' }); return ['ada', 'ada.op']; },
  'link-ends': m => { m.nodes.push({ id: 'note', type: 'uml.Comment', label: 'n' }); m.edges.push(L('bad', 'ada', 'note')); return ['bad', 'ada', 'note']; },
  'instance-of': m => { m.nodes.push({ id: 'Customer', type: 'uml.Class', label: 'Customer', members: [{ id: 'Customer.name', type: 'uml.Property', label: 'name' }] }); return ['ada', 'ada.email', 'Customer']; },
  'owner-kinds': m => { m.nodes.find(n => n.id === 'line-1').parent = 'order-1042'; return ['line-1', 'order-1042']; },
  'member-names': m => { m.nodes[1].members.push({ id: 'order-1042.status2', type: 'uml.Slot', label: 'status', props: { value: 'paid' } }); return ['order-1042', 'order-1042.status', 'order-1042.status2']; },
};
test('validators: 02-object.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(OBJ, OBJ.views[0]), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(OBJ), ids = broke(m), got = T.validate(m, m.views[0]);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, ['instance-of', 'owner-kinds'].includes(rule) ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  assert.equal(T.validate(Object.assign(structuredClone(OBJ), { nodes: [...OBJ.nodes, { id: 'loose', type: 'uml.Slot', label: 'x' }] }), OBJ.views[0])[0].rule, 'slot-kinds', 'a slot as a node');
  const inPkg = structuredClone(OBJ); inPkg.nodes.push({ id: 'p', type: 'uml.Package', label: 'p', members: [{ id: 'p.s', type: 'uml.Slot', label: 's' }] });
  assert.ok(T.validate(inPkg, inPkg.views[0]).some(p => p.rule === 'slot-kinds' && p.ids.includes('p.s')), 'a slot outside an instance');
});

test('instance-of: by name or qualified name, a general\'s attributes count; a classifier the model holds no or several times is not checked (M8)', () => {
  const base = () => ({ schemaVersion: 2, nodes: [{ id: 'pk', type: 'uml.Package', label: 'shop' },
    { id: 'Party', type: 'uml.Class', label: 'Party', members: [{ id: 'Party.email', type: 'uml.Property', label: 'email' }] },
    { id: 'Cust', type: 'uml.Class', label: 'Customer', parent: 'pk', members: [{ id: 'Cust.name', type: 'uml.Property', label: 'name' }] },
    I('ada', 'ada', 'shop::Customer', [['name', 'Ada'], ['email', 'a@x'], ['age', '36']])],
  edges: [{ id: 'g', type: 'uml.Generalization', from: 'Cust', to: 'Party' }, { id: 'g2', type: 'uml.Generalization', from: 'Party', to: 'Cust' }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['ada'] }] });
  const said = m => T.validate(m, m.views[0]).filter(p => p.rule === 'instance-of').map(p => p.ids[1]);
  assert.deepEqual(said(base()), ['ada.age'], 'qualified name; the general\'s email counts; a cycle of generals is walked once');
  const byName = base(); byName.nodes[3].props.classifier = 'Customer'; assert.deepEqual(said(byName), ['ada.age']);
  const none = base(); none.nodes[3].props.classifier = 'Nobody'; assert.deepEqual(said(none), []);
  const two = base(); two.nodes.push({ id: 'C2', type: 'uml.Class', label: 'Customer' }); two.nodes[3].props.classifier = 'Customer'; assert.deepEqual(said(two), []);
  assert.deepEqual(said(Object.assign(base(), { edges: [] })), ['ada.email', 'ada.age']);
});

// ---- DoD 4 and 6: the gestures' commands applied, and a 30-step session saved and reopened
test('save and reopen (DoD 6): a 30-step session on 02-object.json undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const base = { ...structuredClone(OBJ), nodes: [...structuredClone(OBJ.nodes), { id: 'shop', type: 'uml.Package', label: 'shop' }] };
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: I(`o${i}`, `obj${i}`, 'Order'), view: 'snapshot' }],
    [{ op: 'add', element: { id: `o${i}.s`, type: 'uml.Slot', label: 'status', props: { value: 'new' } }, owner: `o${i}` }],
    slotEdit({ id: `o${i}.s`, type: 'uml.Slot', label: 'status', props: { value: 'new' } }, `status = step ${i}`).commands,
    [{ op: 'add', element: L(`k${i}`, `o${i}`, 'ada', { ends: { to: { role: 'buyer' } } }), view: 'snapshot' }],
    [[{ op: 'set', id: `o${i}`, path: 'props.classifier', value: 'CardPayment' }], [{ op: 'reparent', id: `o${i}`, parent: 'shop' }], [{ op: 'set', id: `k${i}`, path: ['props', 'ends', 'from', 'role'], value: 'order' }]][i % 3],
    [[{ op: 'hide', id: `o${i}`, view: 'snapshot' }], [{ op: 'delete', id: `k${i}` }], [{ op: 'set', id: `o${i}`, path: 'label', value: `renamed${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(base), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, 'snapshot')), flat(layout(JSON.parse(seen[30]), 'snapshot')));
  assert.equal(describe(reopened, 'snapshot'), describe(JSON.parse(seen[30]), 'snapshot'));
  assert.deepEqual(check(reopened, 'snapshot'), []);
});

test('an object view: Tab reaches every element, then every line (one node-key ring per card, audit 1)', () => {
  const s = mapContext(OBJ).buildView('snapshot').markup, cards = (s.match(/<g class="node[ "]/g) || []).length;
  assert.ok(cards > 0);
  assert.equal((s.match(/node-key/g) || []).length, cards);
});

test('validate() of an object view, an instance of the last of a 5,000-deep generalization chain: its attributes walked without recursion (audit 2)', () => {
  const nodes = Array.from({ length: 5000 }, (_, i) => ({ id: 'c' + i, type: 'uml.Class', label: 'C' + i, members: [{ id: 'c' + i + '.a', type: 'uml.Property', label: 'a' + i }] }));
  const edges = nodes.slice(1).map((n, i) => ({ id: 'g' + i, type: 'uml.Generalization', from: n.id, to: nodes[i].id }));
  nodes.push(I('o', 'o', 'C4999', [['a0', '1']]));
  assert.deepEqual(validate({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o'] }] }), []);
});

test('a model with only object views gets no class rules but member-names (uml-object.md, audit 3)', () => {
  const m = { schemaVersion: 2, nodes: [I('a', 'a', null, [['x', '1'], ['x', '2']]), I('b', 'b', null, []), { id: 'n', type: 'uml.Comment', label: 'about a' }],
    edges: [{ id: 'g', type: 'uml.Generalization', from: 'a', to: 'b' }, { id: 'c', type: 'uml.CommentLink', from: 'a', to: 'n' }],
    views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b', 'n'] }] };
  const rules = validate(m).map(p => p.rule);
  assert.ok(rules.includes('member-names'), rules.join());
  assert.ok(!rules.includes('generalization-kinds') && !rules.includes('comment-link'), rules.join());
  assert.ok(!T.rules['generalization-kinds'] && !T.rules['comment-link']);
});

test("the PDF prints a classifier's members as the class type does, as the picture draws them (audit 4)", () => {
  assert.equal(T.member.print({ id: 'p', type: 'uml.Operation', label: 'place', props: { returnType: 'Receipt' } }), 'place(): Receipt');
  assert.equal(T.member.print({ id: 'a', type: 'uml.Property', label: 'id', props: { valueType: 'UUID', visibility: 'private' } }), '- id: UUID');
  assert.equal(T.member.print({ id: 's', type: 'uml.Slot', label: 'id', props: { value: '7' } }), 'id = 7');
});

test('audit 8: a profile is drawn and named as a package, closed or open', () => {
  const closed = { schemaVersion: 2, nodes: [{ id: 'P', type: 'uml.Profile', label: 'Persistence' }, I('o', 'o1', 'Order')], edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['P', 'o'] }] };
  const p = layout(closed, 'v').byId.P;
  assert.equal(p.shape, 'package'); assert.ok(!p.underline); assert.deepEqual(p.stereotypes, ['profile']); assert.equal(p.aria, 'Profile Persistence (closed)');
  const open = { schemaVersion: 2, nodes: [{ id: 'P', type: 'uml.Profile', label: 'Persistence' }, I('o', 'o1', 'Order', [], { parent: 'P' })], edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['P', 'o'] }] };
  assert.ok(describe(open, 'v').includes('Profile Persistence, holding 1 element.'), describe(open, 'v'));
});

test('audit 14: F2 on an instance edits its name alone (an anonymous one opens ": Customer"), on a link its label alone', () => {
  const m = { schemaVersion: 2, nodes: [I('c1', null, 'Customer'), I('c2', 'bo', 'Customer')], edges: [{ ...L('k', 'c1', 'c2', { stereotypes: ['x'], association: 'knows' }) }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['c1', 'c2'] }] };
  const g = layout(m, 'v'), F2 = (id, text) => apply(m, T.edits.rename(m, m.views[0], id, text));
  assert.equal(g.nodes.find(n => n.id === 'c1').label, ': Customer');
  const m2 = F2('c1', 'ada : Customer'); assert.equal(m2.nodes[0].label, 'ada'); assert.equal(layout(m2, 'v').nodes.find(n => n.id === 'c1').label, 'ada : Customer');
  assert.deepEqual(T.edits.rename(m, m.views[0], 'c1', ': Customer'), []); // unchanged: still anonymous
  assert.equal(F2('c2', 'bob').nodes[1].label, 'bob');
  assert.equal(g.edges[0].label, '«x» knows'); assert.deepEqual(T.edits.rename(m, m.views[0], 'k', '«x» knows'), []);
  assert.equal(F2('k', '«x» friends').edges[0].label, 'friends');
});

test('audit 14: an element of another kind is drawn and named as its kind, a line of another kind as a directed "Line"', () => {
  const m = { schemaVersion: 2, nodes: [I('o1', 'order1', 'Order'), { id: 'api', type: 'uml.Component', label: 'Shop API' }, { id: 'u', type: 'uml.Actor', label: 'Shopper' }, { id: 'c', type: 'uml.Class', label: 'Order' }],
    edges: [{ id: 'of', type: 'uml.Dependency', from: 'o1', to: 'c', props: { stereotypes: ['instanceOf'] } }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o1', 'api', 'u', 'c'], edges: ['of'] }] };
  const g = layout(m, 'v'), n = id => g.nodes.find(x => x.id === id);
  assert.equal(n('o1').underline, true); assert.ok(!n('api').underline && !n('u').underline);
  assert.match(n('api').aria, /^Component Shop API\b/); assert.match(n('u').aria, /^Actor Shopper\b/);
  assert.deepEqual([g.edges[0].end.to, g.edges[0].aria], ['arrow', 'Line from order1 : Order to Order: «instanceOf»']);
  const d = describe(m, 'v'); assert.match(d, /^Instance specification order1 : Order.*depends on Order/m); assert.doesNotMatch(d, /^Class Order.*(linked to|depends on)/m); // by its verb (audit 26)
});

test('audit 21: the PDF\'s Lines row gives a link\'s label as drawn: its association\'s name when it has none, its «stereotypes» first', () => {
  const m = structuredClone(OBJ), e = m.edges.find(x => x.id === 'ada-places-order'); delete e.label; e.props.association = 'places';
  const row = mm => { const c = mapContext(mm), [, L] = tablesOf(c, c.V.snapshot, c.buildGeo('snapshot')); return L.rows.find(r => r.includes('ada : Customer → order1042 : Order')); };
  assert.match(row(m), /<td>places<\/td><td>Link<\/td>/);
  e.label = 'buys'; e.props.stereotypes = ['online']; assert.match(row(m), /<td>«online» buys<\/td><td>Link<\/td>/);
  delete e.label; delete e.props.association; delete e.props.stereotypes; assert.match(row(m), /<td><\/td><td>Link<\/td>/, 'nothing drawn: an empty cell');
});

// audit 22: describe() says a comment link's drawn text, as the class view does
test('describe() says a comment link\'s label, which the object view draws (audit 22)', () => {
  const m = { schemaVersion: 2, nodes: [I('ada', 'ada', 'Customer'), { id: 'n', type: 'uml.Comment', label: 'A note' }],
    edges: [{ id: 'cl', type: 'uml.CommentLink', from: 'n', to: 'ada', label: 'checked on Friday' }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['ada', 'n'] }] };
  assert.ok(svgOf(layout(m, 'v')).includes('checked on Friday'));
  assert.ok(describe(m, 'v').includes('Comment: A note; about ada : Customer ("checked on Friday").'), describe(m, 'v'));
});

test('audit 26: a line of another kind an object view lists is said by its kind\'s verb, not "linked to", and the legend has its "Line"', () => {
  const E = (id, type, from, to) => ({ id, type, from, to });
  const m = { schemaVersion: 2, nodes: [I('a', 'a', 'A'), I('b', 'b')],
    edges: [E('g', 'uml.Generalization', 'a', 'b'), E('s', 'uml.Association', 'b', 'a'), E('d', 'uml.Dependency', 'a', 'b'), E('u', 'uml.Usage', 'b', 'a'), E('f', 'uml.InformationFlow', 'a', 'b'), L('k', 'a', 'b')],
    views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b'], edges: ['g', 's', 'd', 'u', 'f', 'k'] }] };
  const d = describe(m, 'v').split('\n');
  assert.equal(d[1], 'Instance specification a : A; a kind of b; associated with b; depends on b; a line to b; linked to b.');
  assert.equal(d[2], 'Instance specification b; associated with a : A; uses a : A; linked to a : A.');
  const g = layout(m, 'v');
  assert.deepEqual(g.legend.map(x => x.match(/<b>([^<]*)<\/b>/)[1]), ['Link', 'Line']);
  assert.equal(g.edges.find(e => e.id === 'd').aria, 'Line from a : A to b', 'the accessible name stays "Line" (audit 14)');
  // a view of links alone says and keys them as before
  const only = { ...m, views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b'], edges: ['k'] }] };
  assert.equal(describe(only, 'v').split('\n')[1], 'Instance specification a : A; linked to b.');
  assert.deepEqual(layout(only, 'v').legend.map(x => x.match(/<b>([^<]*)<\/b>/)[1]), ['Link']);
});

// audit 27: the object view's "Line" swatch was the bare stroke "Link" has, though the line is drawn with an arrowhead;
// and the class, package, profile, component, deployment and use case views drew the same arrow with no "Line" entry
test('audit 27: every structural view that draws a line of another kind as "Line" lists it in its legend, its swatch with the arrowhead it is drawn with', async () => {
  for (const f of ['component', 'deployment', 'usecase', 'package', 'profile']) await import(`../src/uml/${f}.js`);
  const sw = s => /<g[^>]*>(.*?)<\/g>/.exec(s)[1], name = s => /<b>([^<]*)<\/b>/.exec(s)[1];
  const o = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.InstanceSpecification', label: 'a' }, { id: 'b', type: 'uml.InstanceSpecification', label: 'b' }],
    edges: [{ id: 'k', type: 'uml.Link', from: 'a', to: 'b' }, { id: 'd', type: 'uml.Dependency', from: 'b', to: 'a' }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b'], edges: ['k', 'd'] }] };
  const g = layout(o, 'v'), link = g.legend.find(s => name(s) === 'Link'), line = g.legend.find(s => name(s) === 'Line');
  assert.equal(g.edges.find(e => e.id === 'd').end.to, 'arrow');
  assert.notEqual(sw(line), sw(link), 'the Line swatch is not the Link swatch');
  assert.match(sw(line), /<path d="M2 8H17"\/><path d="M16 4L26 8L16 12Z" fill="var\(--um-muted\)"\/>/, 'a shorter stroke and a filled arrowhead');
  for (const [d, A] of [['uml.class', 'uml.Class'], ['uml.package', 'uml.Package'], ['uml.profile', 'uml.Class'], ['uml.component', 'uml.Component'], ['uml.deployment', 'uml.Node'], ['uml.use-case', 'uml.UseCase']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: A, label: 'A' }, { id: 'b', type: A, label: 'B' }], edges: [{ id: 'x', type: 'uml.Link', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: d, nodeIds: ['a', 'b'], edges: ['x'] }] };
    const h = layout(m, 'v'), e = h.edges.find(x => x.id === 'x');
    assert.deepEqual([e.end.to, e.aria.split(' ')[0]], ['arrow', 'Line'], d);
    const items = h.legend.filter(s => name(s) === 'Line'); assert.equal(items.length, 1, `${d}: one "Line" entry`);
    assert.equal(sw(items[0]).replace(/^.*?(<path d="M2 8H17"\/>)/, '$1'), sw(line), `${d}: the object view's swatch`);
  }
});

test('audit 28: an element of no UML kind, drawn as an instance with its slots, is judged and printed as one', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'u', label: 'order1', members: [{ id: 's', type: 'uml.Slot', label: 'total', props: { value: '3' } }] }, { id: 'k', type: 'uml.InstanceSpecification', label: 'line1' }],
    edges: [{ id: 'l', type: 'uml.Link', from: 'u', to: 'k' }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['u', 'k'] }] };
  assert.equal(layout(m, 'v').byId.u.aria, 'Instance specification order1, 1 slot');
  assert.deepEqual(validate(m), [], 'its slot is in an instance, and its link joins two');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '')));
  assert.equal(rows.find(r => r[0] === 'order1')[1], 'Instance specification', 'the PDF\'s Kind');
  // a uml.Class still holds no slot, and a link to it is still refused
  const cls = { ...m, nodes: [{ ...m.nodes[0], type: 'uml.Class' }, m.nodes[1]] };
  assert.deepEqual(validate(cls).map(p => p.rule).sort(), ['link-ends', 'slot-kinds']);
});

test('audit 28: a type that is not a string, even an array naming a classifier, is drawn as an instance: nothing throws', () => {
  for (const t of [['uml.Class'], ['uml.Package'], 42, {}]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: t, label: 'Aa' }, { id: 'b', type: 'uml.InstanceSpecification', label: 'Bb' }], edges: [{ id: 'x', type: 'uml.Link', from: 'a', to: 'b' }],
      views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b'], edges: ['x'] }] };
    const d = JSON.stringify(t);
    assert.equal(layout(m, 'v').byId.a.aria, 'Instance specification Aa', d);
    assert.match(describe(m, 'v'), /^Instance specification Aa; linked to Bb/m, d);
    assert.deepEqual(check(m, 'v'), [], d);
    assert.deepEqual(validate(m).map(p => p.path), ['nodes[0].type'], `${d}: only the type's own warning, no link-ends`);
  }
});

test('audit 29: an element of no UML kind is drawn, said and edited as an instance specification: its head, its slots, member-names, the panel\'s slot rows, F2', () => {
  const mk = t => ({ schemaVersion: 2, nodes: [{ id: 'o', ...(t ? { type: t } : {}), label: 'order1', props: { classifier: 'Order' },
    members: [{ id: 's1', type: 'uml.Slot', label: 'total', props: { value: '3' } }, { id: 's2', type: 'uml.Slot', label: 'total', props: { value: '4' } }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o'] }] });
  const T = diagramOf({ diagram: 'uml.object' });
  for (const t of ['uml.InstanceSpecification', undefined]) { const m = mk(t), d = `type ${t}`, n = layout(m, 'v').nodes[0];
    assert.equal(n.label, 'order1 : Order', d);
    assert.equal(describe(m, 'v').split('\n')[1], 'Instance specification order1 : Order, 2 slots: total = 3, total = 4.', d);
    assert.deepEqual(validate(m).filter(p => p.rule === 'member-names').map(p => p.path), ['nodes[0].members[1]'], d);
    assert.equal(T.member.holds(m.nodes[0]), true, d);
    assert.deepEqual(T.edits.rename(m, m.views[0], 'o', 'order2 : Order'), [{ op: 'set', id: 'o', path: 'label', value: 'order2' }], d);
    const ctx = mapContext(m); assert.match(tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'))[0].rows[0], /order1 : Order/, d); }
});

test('audit 30: an element of no UML kind the object view shows is an instance to slot-kinds, and the PDF\'s Members list what its box draws', () => {
  for (const type of ['uml.InstanceSpecification', undefined, '', 'acme.Thing']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'o1', label: 'o1', ...(type === undefined ? {} : { type }), members: [{ id: 'p', type: 'uml.Property', label: 'secret', props: { valueType: 'int' } }, { id: 'n', label: 'nameless' }, { id: 's', type: 'uml.Slot', label: 'id', props: { value: '7' } }] }],
      edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o1'] }] }, q = JSON.stringify(type);
    assert.deepEqual(validate(m).filter(p => p.rule === 'slot-kinds').map(p => p.message), ['slot-kinds: "o1" holds p, a property: an instance holds slots only', 'slot-kinds: "o1" holds n, an element of no type: an instance holds slots only'], q);
    const ctx = mapContext(m), row = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'))[0].rows[0];
    assert.match(row, /<td>Instance specification<\/td><td><p>id = 7<\/p><\/td>/, q);
  }
  // not shown by an object view: no instance there to judge (a class view's untyped class holds its attributes)
  const elsewhere = { schemaVersion: 2, nodes: [{ id: 'c', label: 'C', members: [{ id: 'p', type: 'uml.Property', label: 'a' }] }, { id: 'o', type: 'uml.InstanceSpecification', label: 'o' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o'] }, { id: 'k', diagram: 'uml.class', nodeIds: ['c'] }] };
  assert.deepEqual(validate(elsewhere).filter(p => p.rule === 'slot-kinds'), []);
  // a classifier the view shows: its compartments' members, as drawn
  const cls = { schemaVersion: 2, nodes: [{ id: 'k', type: 'uml.Class', label: 'K', members: [{ id: 'a', type: 'uml.Property', label: 'a' }, { id: 'pt', type: 'uml.Port', label: 'pt' }] }], edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['k'] }] };
  const cx = mapContext(cls); assert.match(tablesOf(cx, cx.V.v, cx.buildGeo('v'))[0].rows[0], /<td>Class<\/td><td><p>a<\/p><\/td>/);
});

test('audit 30: instance-of reads a generalization a class view draws as its own line: a slot may name an attribute of a general', () => {
  const m = { schemaVersion: 2,
    nodes: [{ id: 'base', type: 'uml.Class', label: 'Base', members: [{ id: 'bid', type: 'uml.Property', label: 'id' }] },
      { id: 'ord', type: 'uml.Class', label: 'Order', members: [{ id: 'tot', type: 'uml.Property', label: 'total' }] },
      { id: 'o1', type: 'uml.InstanceSpecification', label: 'o1', props: { classifier: 'Order' }, members: [{ id: 's1', type: 'uml.Slot', label: 'id', props: { value: '7' } }] }],
    edges: [],
    views: [{ id: 'classes', diagram: 'uml.class', nodeIds: ['base', 'ord'], edges: [{ id: 'g', type: 'uml.Generalization', from: 'ord', to: 'base' }] },
      { id: 'objects', diagram: 'uml.object', nodeIds: ['o1'] }] };
  assert.deepEqual(validate(m), []);
  const n = structuredClone(m); n.edges.push(n.views[0].edges.pop());
  assert.deepEqual(validate(n), [], 'as with the same generalization a model line');
  const x = structuredClone(m); x.views[0].edges = [];
  assert.deepEqual(validate(x).map(p => p.rule), ['instance-of'], 'with none, warned');
});

test('audit 33: slot-kinds writes the member\'s kind in lower case with its article, mid-sentence', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.InstanceSpecification', label: 'order1', members: [{ id: 'o.op', type: 'uml.Operation', label: 'pay' }, { id: 'o.p', type: 'uml.Port', label: 'api' },
    { id: 'o.l', type: 'uml.EnumerationLiteral', label: 'RED' }, { id: 'o.s', type: 'uml.Slot', label: 'id', props: { value: '7' } }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['o'] }] };
  assert.deepEqual(validate(m).filter(p => p.rule === 'slot-kinds').map(p => p.message), [
    'slot-kinds: "order1" holds o.op, an operation: an instance holds slots only', 'slot-kinds: "order1" holds o.p, a port: an instance holds slots only',
    'slot-kinds: "order1" holds o.l, an enumeration literal: an instance holds slots only']);
});

// audit 40: a slot added or edited to a feature the instance has a slot for already; a Link from an instance to a comment
test('audit 40: a slot for a feature the instance has one for is refused, and a link joins two instances or is refused', () => {
  const m = structuredClone(OBJ), v = m.views[0], ada = m.nodes.find(x => x.id === 'ada'), o = m.nodes.find(x => x.id === 'order-1042');
  assert.match(T.member.add('email = 5', ada).error, /^member-names: "ada" has a member named "email" already \(ada\.email\)/);
  assert.match(T.member.edit(o.members.find(x => x.id === 'order-1042.status'), 'total = 1', o).error, /^member-names: "order1042" has a member named "total" already \(order-1042\.total\): an instance has one slot for a feature$/);
  assert.deepEqual(T.member.add('phone = 5', ada), { type: 'uml.Slot', label: 'phone', props: { value: '5' } });
  assert.equal(T.member.edit(o.members.find(x => x.id === 'order-1042.status'), 'status = shipped', o).commands.length, 2, 'a slot keeping its feature');
  // connect: a Link between two instances (one of no UML kind is one, as drawn) is the default's; to a comment or a class, refused
  const k = apply(m, [{ op: 'add', element: { id: 'c1', type: 'uml.Comment', label: 'note' }, view: v.id }, { op: 'add', element: { id: 'k1', type: 'uml.Class', label: 'K' }, view: v.id },
    { op: 'add', element: { id: 'u1', label: 'plain' }, view: v.id }]);
  const C = (a, b, type = 'uml.Link') => T.edits.connect(k, v, a, b, null, { type });
  for (const [a, b] of [['ada', 'c1'], ['c1', 'ada'], ['ada', 'k1'], ['ada', 'gone']]) {
    assert.deepEqual(C(a, b), { error: 'A link joins two instance specifications' }, `${a} -> ${b}`);
    assert.ok(validate(apply(k, [{ op: 'add', element: { id: 'x', type: 'uml.Link', from: a, to: b }, view: v.id }])).some(p => p.rule === 'link-ends'), 'link-ends says so');
  }
  assert.equal(C('ada', 'order-1042'), null); assert.equal(C('ada', 'u1'), null);
  assert.equal(C('c1', 'ada', 'uml.CommentLink'), null, 'another line: the default');
});
