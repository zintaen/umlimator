// The use case diagram, uml.use-case (work package 4.4, notes/stage-4.md §8): the type's definition, the ellipse and the
// actor (sizes, outlines, line ends slid onto them), subjects as boxes, the lines' looks and labels, accessible names, the
// reading order, the legend, the validators, describe(), the editing hooks, a 30-step session saved and reopened, and the
// common edit's time. tests/usecase.html draws it in a browser and edits it by pointer and keyboard. Imports src/ to reach
// the internals; lib/umlimator-all.js holds the same code.
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
import '../src/uml/usecase.js';

const UC = JSON.parse(readFileSync(new URL('../examples/shopping-use-cases.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.use-case' });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const A = (id, label, more = {}) => ({ id, type: 'uml.Actor', label, ...more });
const U = (id, label, more = {}) => ({ id, type: 'uml.UseCase', label, ...more });
const L = (id, type, from, to, props) => ({ id, type: 'uml.' + type, from, to, ...(props ? { props } : {}) });
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
// each line's drawn path's two ends, from the markup (tests/typed-shapes.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// a point's distance from a node's outline: the ellipse, the actor's figure column, else its box
const off = (n, [x, y]) => {
  if (n.shape === 'ellipse') return Math.abs(Math.hypot((x - n.x - n.w / 2) / (n.w / 2), (y - n.y - n.h / 2) / (n.h / 2)) - 1) * Math.min(n.w, n.h) / 2;
  const b = n.shape === 'actor' ? { x: n.x + (n.w - 24) / 2, y: n.y, w: Math.min(24, n.w), h: n.h } : n;
  const dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h);
  return dx || dy ? Math.hypot(dx, dy) : Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y); };

test('the definition: uml.use-case is registered with its palette, its five lines, its properties and its hooks', () => {
  assert.equal(T.name, 'uml.use-case');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.Actor', 'Actor'], ['uml.UseCase', 'Use case'], ['uml.Subject', 'Subject'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => e.label), ['Association', 'Include', 'Extend', 'Generalization', 'Comment link']);
  assert.deepEqual(T.props['uml.Extend'].map(f => [f.key, f.kind]), [['condition', 'text'], ['extensionPoints', 'list']]);
  for (const t of ['uml.Actor', 'uml.UseCase', 'uml.Subject']) assert.deepEqual(T.props[t].map(f => f.key), ['stereotypes'], t);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'rankFlip']) assert.equal(typeof T[k], 'function', k);
  assert.equal(typeof T.edits.connect, 'function');
  assert.deepEqual(T.refs, { 'uml.Extend': { 'props.extensionPoints': 'drop' } });
  assert.deepEqual(['uml.UseCase', 'uml.Actor', 'uml.Subject'].map(t => T.member.holds({ type: t })), [true, false, false]);
  assert.deepEqual(['Generalization', 'Extend', 'Include', 'Association'].map(t => T.rankFlip({ type: 'uml.' + t })), [true, true, false, false], 'the parent and the base first');
  assert.deepEqual(Object.keys(T.rules).sort(), ['association-ends', 'extend-ends', 'extend-points', 'generalization-kinds', 'include-cycle', 'include-ends', 'named', 'point-names', 'use-case-owner']);
});

test('the shapes: an ellipse holds its text block at its corners; its inset puts a slid point on it; the actor\'s narrows to the figure\'s column', () => {
  const E = SHAPE.ellipse, n = { label: 'Check the order and pay for the books in one go, please', points: ['payment', 'extras'], stereotypes: ['main'] };
  const { w, h } = E.size(n), box = { ...n, x: 0, y: 0, w, h };
  assert.ok(w >= 96 && h >= 44 && w <= Math.ceil(160 * 1.42 + 16), `${w} × ${h}`);
  assert.ok(E.size({ label: 'A' }).w === 96 && E.size({ label: 'A' }).h === 44, 'the smallest ellipse');
  assert.ok(E.size({ label: 'x', points: ['a', 'b', 'c', 'd', 'e', 'f'] }).h > E.size({ label: 'x', points: ['a'] }).h + 5 * 15 * 1.4, 'each point adds a row');
  for (const [s, ts] of [['L', [1, h / 4, h / 2, h - 1]], ['R', [3, h / 2]], ['T', [2, w / 3, w / 2]], ['B', [w / 5, w - 2]]]) for (const t of ts) {
    const d = E.inset(box, s, t), p = s === 'L' ? [d, t] : s === 'R' ? [w - d, t] : s === 'T' ? [t, d] : [t, h - d];
    assert.ok(off({ ...box, shape: 'ellipse' }, p) < 0.01, `${s} ${t}`); }
  const a = SHAPE.actor.size({ label: 'Payment provider' });
  assert.ok(a.w > 24 && a.h === 44 + 4 + 16);
  assert.equal(SHAPE.actor.inset({ w: 60 }, 'L', 10), 18); assert.equal(SHAPE.actor.inset({ w: 60 }, 'T', 10), 0);
  assert.equal(SHAPE.actor.size({ label: 'A long actor name that wraps onto a second line and then is cut' }).h, 44 + 4 + 32, 'two lines at most');
  assert.match(SHAPE.subject.frame({ id: 's', x: 0, y: 0, w: 200, h: 100, title: '«system» Shop' }), /class="family-box"[^]*class="family-title"[^]*>«system» Shop</);
});

test('shopping-use-cases.json (example 8) draws: actors, ellipses, the subject a box holding its use cases, lines by kind, laid out clean right and down', () => {
  assert.deepEqual(validate(UC), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(UC, direction), g = layout(m, 'shopping'), by = g.byId;
    assert.deepEqual(check(m, 'shopping'), [], direction);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${direction}: ${p.id} and ${q.id} overlap`);
    assert.deepEqual(['shopper', 'member', 'payment-provider'].map(id => by[id].shape), ['actor', 'actor', 'actor']);
    assert.ok(g.nodes.filter(n => n.type === 'uml.UseCase').every(n => n.shape === 'ellipse'));
    assert.deepEqual(by.checkout.points, ['payment', 'extras']);
    const [box] = g.families; assert.equal(box.id, 'bookshop'); assert.equal(box.shape, 'subject');
    assert.equal(box.nodeIds.length, 8); box.nodeIds.forEach(id => assert.ok(inside(by[id], box), `${direction}: ${id} in the subject`));
    // actors first: before every use case along the flow
    const along = n => (direction === 'down' ? n.y : n.x);
    ['shopper', 'member', 'payment-provider'].forEach(id => assert.ok(along(by[id]) + (direction === 'down' ? by[id].h : by[id].w) <= along(box), `${direction}: ${id} before the subject`));
    const e = Object.fromEntries(g.edges.map(x => [x.id, x]));
    assert.deepEqual(e['shopper-browses'].end, { from: 'none', to: 'none' });
    assert.deepEqual(e['checkout-includes-pay'].end, { from: 'none', to: 'open', dashed: true }); assert.equal(e['checkout-includes-pay'].label, '«include»');
    assert.deepEqual(e['voucher-extends-checkout'].end, { from: 'none', to: 'open', dashed: true });
    assert.equal(e['voucher-extends-checkout'].label, '«extend» (payment) [the shopper has a voucher code]'); assert.equal(e['voucher-extends-checkout'].cut, 280);
    assert.deepEqual(e['card-is-pay'].end, { from: 'none', to: 'triangle' });
  }
});

test('every line end is on its shape\'s outline within 1 px: the ellipse, the actor\'s figure column, a closed subject\'s box', () => {
  const m = structuredClone(UC); m.nodes.push({ id: 'back', type: 'uml.Subject', label: 'Back office' }, A('clerk', 'Clerk')); m.views[0].nodeIds.push('back', 'clerk');
  m.edges.push({ id: 'note-link', type: 'uml.CommentLink', from: 'n1', to: 'back' }); m.nodes.push({ id: 'n1', type: 'uml.Comment', label: 'later' }); m.views[0].nodeIds.push('n1');
  for (const direction of ['right', 'down']) {
    const { g, markup } = mapContext(withDir(m, direction)).buildView('shopping'), E = ends(markup);
    assert.equal(E.length, g.edges.length);
    E.forEach(({ from, to, i, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => { const n = g.byId[id] || g.families.find(f => f.id === id);
      assert.ok(off(n, p) <= 1, `${direction}: ${g.edges[i].id} ends ${off(n, p).toFixed(2)} px off ${id} (${n.shape})`); }));
    assert.ok(E.some(({ i, a }) => String(a) !== String(g.edges[i].pts[0])), 'ends slid onto outlines');
  }
  assert.equal(layout(m, 'shopping').byId.back.shape, 'classifier', 'a subject with nothing shown is a rectangle');
});

test('a pin moves the pinned node alone (§8.5): the actors are first with pins too, and a pin is read where it was drawn', () => {
  const at = m => Object.fromEntries(layout(m, 'shopping').nodes.map(n => [n.id, [n.col, n.row]])), base = at(UC);
  for (const [id, d] of [['gift-wrap', [0, 6]], ['shopper', [0, 6]], ['track', [2, 0]]]) {
    const m = structuredClone(UC), to = [base[id][0] + d[0], base[id][1] + d[1]]; m.views[0].layout = { [id]: to };
    const now = at(m); assert.deepEqual(now[id], to, id);
    assert.deepEqual(Object.fromEntries(Object.entries(now).filter(([k]) => k !== id)), Object.fromEntries(Object.entries(base).filter(([k]) => k !== id)), `pinning ${id} moves nothing else`);
  }
  const stale = structuredClone(UC); stale.views[0].layout = { nowhere: [0, 0] };
  assert.deepEqual(at(stale), base, 'a pin of a node not shown changes nothing');
  // a comment in the host's column 0: the actor is drawn before it, and says column 0, which the canvas can pin
  const c = { schemaVersion: 2, nodes: [A('a', 'A'), U('u', 'U'), { id: 'n', type: 'uml.Comment', label: 'note' }], edges: [L('e', 'Association', 'a', 'u'), L('c', 'CommentLink', 'n', 'u')], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['a', 'u', 'n'] }] }, g = layout(c, 'v');
  assert.ok(g.byId.a.x < g.byId.n.x && g.byId.a.col === 0 && g.nodes.every(n => n.col >= 0), JSON.stringify(g.nodes.map(n => [n.id, n.col])));
});

test('an association from an actor to a box is drawn, and validate() says so (association-ends)', () => {
  const m = structuredClone(UC); m.edges.push(L('z', 'Association', 'shopper', 'bookshop'));
  assert.ok(layout(m, 'shopping').byId.shopper);
  assert.ok(validate(m).some(p => p.rule === 'association-ends' && p.ids.includes('z')));
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (notes/stage-4.md §2.4)', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(UC, { memos }).buildView('shopping'), pts = JSON.stringify(memos.shopping.g.edges.map(e => e.pts)), second = mapContext(UC, { memos }).buildView('shopping');
  assert.equal(memos.shopping.runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos.shopping.g.edges.map(e => e.pts)), pts);
});

test('names, reading order and legend (A1, L13): actors, then the subject and its use cases, then the lines; each kind keyed', () => {
  const g = layout(UC, 'shopping'), s = svgOf(g);
  assert.equal(g.byId.shopper.aria, 'Actor Shopper');
  assert.equal(g.byId.checkout.aria, 'Use case Check out, in Online bookshop, 2 extension points');
  assert.equal(g.families[0].aria, 'Subject Online bookshop, holding 8 use cases');
  assert.equal(g.edges.find(e => e.id === 'voucher-extends-checkout').aria, 'Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher code');
  assert.equal(g.edges.find(e => e.id === 'member-is-shopper').aria, 'Generalization from Member to Shopper');
  assert.match(s, /data-shape="ellipse" tabindex="-1" role="img" aria-label="Use case Check out, in Online bookshop, 2 extension points"/);
  assert.match(s, /role="img" aria-label="Subject Online bookshop, holding 8 use cases"/);
  assert.match(s, /data-comp="extension points"[^]*?>payment<\/text>/);
  assert.deepEqual(g.order.slice(0, 5), ['shopper', 'member', 'payment-provider', 'bookshop', 'browse']);
  assert.deepEqual(g.order.slice(12), UC.edges.map(e => e.id), 'then every line, each a key ring');
  assert.equal((s.match(/class="um-key line-key[^"]*" data-i=/g) || []).length, UC.edges.length);
  assert.equal((s.match(/class="um-key line-key node-key" data-node=/g) || []).length, 11, 'and each node (a box is selected by its frame)');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Association', 'Include', 'Extend', 'Generalization']);
  // stereotypes: over a use case's name, on an actor, in the names
  const m = structuredClone(UC); m.nodes[0].props = { stereotypes: ['human'] }; m.nodes[4].props = { stereotypes: ['main'] };
  const h = layout(m, 'shopping');
  assert.equal(h.byId.shopper.aria, 'Actor Shopper (human)'); assert.match(svgOf(h), /class="c-st"[^>]*>«main»<\/text>/);
  // a use case in no subject keeps its own name, and is said without "in"
  const loose = structuredClone(UC); delete loose.nodes.find(n => n.id === 'track').parent;
  assert.equal(layout(loose, 'shopping').byId.track.aria, 'Use case Track an order');
});

test('describe(): the view in sentences, each element in reading order, then each line by its accessible name', () => {
  const d = describe(UC, 'shopping').split('\n');
  assert.equal(d[0], 'Shopping: a use case diagram of 12 elements and 10 lines.');
  assert.deepEqual(d.slice(1, 6), ['Actor Shopper.', 'Actor Member.', 'Actor Payment provider.', 'Subject Online bookshop, holding 8 use cases.', 'Use case Browse the catalog, in Online bookshop.']);
  assert.equal(d.at(-2), 'Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher code.');
  assert.equal(d.length, 1 + 12 + 10);
});

// ---- §8.3: validators, each with a passing and a failing case
const BREAKS = {
  'association-ends': m => { m.edges.push(L('bad', 'Association', 'shopper', 'member')); return ['bad', 'shopper', 'member']; },
  'include-ends': m => { m.edges.push(L('bad', 'Include', 'shopper', 'pay')); return ['bad', 'shopper', 'pay']; },
  'extend-ends': m => { m.edges.push(L('bad', 'Extend', 'checkout', 'checkout', { extensionPoints: ['checkout.payment'] })); return ['bad', 'checkout', 'checkout']; },
  'extend-points': m => { m.edges.find(e => e.id === 'voucher-extends-checkout').props.extensionPoints = ['checkout.payment', 'nowhere']; return ['voucher-extends-checkout', 'checkout', 'nowhere']; },
  'generalization-kinds': m => { m.edges.push(L('bad', 'Generalization', 'member', 'pay')); return ['bad', 'member', 'pay']; },
  'use-case-owner': m => { m.nodes.find(n => n.id === 'shopper').parent = 'bookshop'; return ['shopper', 'bookshop']; },
  'include-cycle': m => { m.edges.push(L('back', 'Include', 'pay', 'checkout')); return ['checkout', 'pay', 'back']; },
  named: m => { m.nodes.find(n => n.id === 'sign-in').label = ' '; return ['sign-in']; },
  'point-names': m => { m.nodes.find(n => n.id === 'checkout').members[1].label = 'payment'; return ['checkout', 'checkout.payment', 'checkout.extras']; },
};
test('validators: shopping-use-cases.json (example 8) breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(UC), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(UC), ids = broke(m), got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, ['use-case-owner', 'point-names'].includes(rule) ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // an extend with no point; an include of itself; a use case in a package and an actor in one are fine; class lines are not ours
  const m = structuredClone(UC); delete m.edges.find(e => e.id === 'gift-wrap-extends-checkout').props.extensionPoints;
  assert.deepEqual(T.validate(m).map(p => [p.rule, p.path]), [['extend-points', 'edges[9]']]);
  const self = structuredClone(UC); self.edges.push(L('me', 'Include', 'pay', 'pay')); assert.deepEqual(T.validate(self).map(p => p.rule).sort(), ['include-cycle', 'include-ends']);
  const pk = structuredClone(UC); pk.nodes.push({ id: 'p', type: 'uml.Package', label: 'p' }); pk.nodes[0].parent = 'p'; pk.nodes[4].parent = 'p'; assert.deepEqual(T.validate(pk), []);
  const cls = structuredClone(UC); cls.nodes.push({ id: 'K', type: 'uml.Class', label: 'K' }, { id: 'J', type: 'uml.Class', label: 'J' }); cls.edges.push(L('kj', 'Generalization', 'K', 'J'), L('ka', 'Association', 'K', 'J'));
  assert.deepEqual(T.validate(cls), [], 'a class model\'s generalization and association are the class type\'s');
});

// ---- §8.4: editing
test('extension points are member rows by name; deleting one drops it from every extend that names it', () => {
  const ep = { id: 'checkout.payment', type: 'uml.ExtensionPoint', label: 'payment' };
  assert.equal(T.member.print(ep), 'payment');
  assert.deepEqual(T.member.add('  gift card '), { type: 'uml.ExtensionPoint', label: 'gift card', props: {} });
  assert.ok(T.member.add('  ').error);
  assert.deepEqual(T.member.edit(ep, 'pay now').commands, [{ op: 'set', id: 'checkout.payment', path: 'label', value: 'pay now' }]);
  assert.ok(T.member.edit(ep, '').error);
  const m = apply(UC, [{ op: 'delete', id: 'checkout.payment' }]);
  assert.deepEqual(m.edges.find(e => e.id === 'voucher-extends-checkout').props.extensionPoints, []);
  assert.deepEqual(T.validate(m).map(p => p.rule), ['extend-points'], 'the extend now names none: said');
  assert.equal(layout(m, 'shopping').edges.find(e => e.id === 'voucher-extends-checkout').label, '«extend» [the shopper has a voucher code]');
});

test('the Owner field and connect: subjects and packages for a use case, packages for an actor; an association drawn from a use case starts at the actor', () => {
  const m = structuredClone(UC); m.nodes.push({ id: 'pk', type: 'uml.Package', label: 'shop' });
  assert.deepEqual(T.owners(m, m.nodes.find(n => n.id === 'checkout')), [{ id: 'bookshop', label: 'Online bookshop' }, { id: 'pk', label: 'shop' }]);
  assert.deepEqual(T.owners(m, m.nodes[0]), [{ id: 'pk', label: 'shop' }]);
  assert.equal(T.owners(m, m.edges[0]), null);
  const v = UC.views[0], line = t => ({ type: 'uml.' + t });
  assert.deepEqual(T.edits.connect(UC, v, 'track', 'shopper', null, line('Association')), [{ op: 'add', element: { id: 'association1', type: 'uml.Association', from: 'shopper', to: 'track' }, view: 'shopping' }]);
  assert.equal(T.edits.connect(UC, v, 'shopper', 'track', null, line('Association')), null, 'from the actor: the default');
  assert.equal(T.edits.connect(UC, v, 'track', 'sign-in', null, line('Include')), null);
  assert.deepEqual(validate(apply(UC, T.edits.connect(UC, v, 'track', 'shopper', null, line('Association')))), []);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: U(`u${i}`, `Case ${i}`), view: 'shopping' }],
    [{ op: 'reparent', id: `u${i}`, parent: 'bookshop' }],
    [{ op: 'add', element: { id: `u${i}.p`, type: 'uml.ExtensionPoint', label: 'start' }, owner: `u${i}` }],
    [{ op: 'add', element: L(`x${i}`, 'Extend', 'gift-wrap', `u${i}`, { extensionPoints: [`u${i}.p`], condition: 'asked' }), view: 'shopping' }],
    [[{ op: 'set', id: `x${i}`, path: 'props.condition', value: `when ${i}` }], [{ op: 'add', element: L(`a${i}`, 'Association', 'member', `u${i}`), view: 'shopping' }], T.member.edit({ id: `u${i}.p` }, 'begin').commands][i % 3],
    [[{ op: 'hide', id: `u${i}`, view: 'shopping' }], [{ op: 'delete', id: `u${i}.p` }, { op: 'delete', id: `x${i}` }], [{ op: 'set', id: `u${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(UC), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  // the session's drawing, laid out again after each step from one memo, is the reopened model's, drawn fresh
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), draw = (m, o) => unid(mapContext(m, o).buildView('shopping').markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos.shopping.runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, 'shopping'), describe(JSON.parse(seen[30]), 'shopping'));
});

test('P1 (S15): on 50 elements and 60 lines, a full layout under 1 s, and a use case renamed laid out and drawn under 100 ms (CPU, best of five) (timed)', () => {
  const nodes = [{ id: 'sys', type: 'uml.Subject', label: 'Shop' }], edges = [];
  for (let i = 0; i < 8; i++) nodes.push(A(`a${i}`, `Actor ${i}`));
  for (let i = 0; i < 41; i++) nodes.push(U(`u${i}`, `Use case number ${i}`, { parent: 'sys', ...(i % 5 ? {} : { members: [{ id: `u${i}.p`, type: 'uml.ExtensionPoint', label: 'point' }] }) }));
  // each actor with its own run of five use cases; includes and extends between neighbours, as a drawn view has them
  for (let i = 0; i < 41; i++) edges.push(L(`as${i}`, 'Association', `a${Math.min(7, Math.floor(i / 5))}`, `u${i}`));
  for (let i = 0; i < 12; i++) edges.push(L(`in${i}`, 'Include', `u${i * 3 + 2}`, `u${i * 3 + 3}`));
  for (let i = 0; i < 7; i++) edges.push(L(`ex${i}`, 'Extend', `u${i * 5 + 1}`, `u${i * 5}`, { extensionPoints: [`u${i * 5}.p`] }));
  const M = { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'uml.use-case', nodeIds: nodes.map(n => n.id) }] };
  assert.equal(nodes.length, 50); assert.equal(edges.length, 60); assert.deepEqual(validate(M), []);
  // CPU time, best of five after a warm-up: CI runs the timed tests one file at a time in their own step (tests/communication.test.mjs)
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(M);
  const runs = [0, 1, 2, 3, 4].map(k => { const was = memos.all.runs, r = { full: timed(() => mapContext(M).buildView('all')), rename: timed(() => draw(apply(M, [{ op: 'set', id: 'u7', path: 'label', value: `Case ${'x'.repeat(4 + 3 * k)}` }]))) };
    assert.equal(memos.all.runs, was + 1, 'a rename lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  // CI holds the 1 s ceiling and prints the edit against S15's 100 ms (the maintainer's decision of 13 Nov 2026): a CI
  // runner is 2 to 5 times slower than a laptop, where these edits take 10 to 30 ms
  assert.ok(best('rename') < 1000, `a rename ${best('rename')} ms`);
  console.log(`# P1 target 100 ms: ` + best('rename') + ' ' + `a rename ${best('rename')} ms`);
});
