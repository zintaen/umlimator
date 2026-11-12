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
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { parseSlot, printSlot, slotEdit } from '../src/uml/object.js';

const OBJ = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/02-object.json', import.meta.url)));
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
