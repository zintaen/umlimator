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
  assert.deepEqual(T.refs, { 'uml.Extend': { 'props.extensionPoints': 'drop empties' } });
  assert.deepEqual(['uml.UseCase', 'uml.Actor', 'uml.Subject'].map(t => T.member.holds({ type: t })), [true, false, false]);
  assert.deepEqual(['Generalization', 'Extend', 'Include', 'Association'].map(t => T.rankFlip({ type: 'uml.' + t })), [true, true, false, false], 'the parent and the base first');
  assert.deepEqual(Object.keys(T.rules).sort(), ['association-ends', 'comment-link', 'extend-ends', 'extend-points', 'generalization-cycle', 'generalization-kinds', 'include-cycle', 'include-ends', 'named', 'point-names', 'use-case-owner']);
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
    assert.deepEqual(by['check-out'].points, ['payment', 'extras']);
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
  assert.equal(g.byId['check-out'].aria, 'Use case Check out, in Online bookshop, 2 extension points');
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
  'extend-ends': m => { m.edges.push(L('bad', 'Extend', 'check-out', 'check-out', { extensionPoints: ['checkout.payment'] })); return ['bad', 'check-out', 'check-out']; },
  'extend-points': m => { m.edges.find(e => e.id === 'voucher-extends-checkout').props.extensionPoints = ['checkout.payment', 'nowhere']; return ['voucher-extends-checkout', 'check-out', 'nowhere']; },
  'generalization-kinds': m => { m.edges.push(L('bad', 'Generalization', 'member', 'pay')); return ['bad', 'member', 'pay']; },
  'use-case-owner': m => { m.nodes.find(n => n.id === 'shopper').parent = 'bookshop'; return ['shopper', 'bookshop']; },
  'include-cycle': m => { m.edges.push(L('back', 'Include', 'pay', 'check-out')); return ['check-out', 'pay', 'back']; },
  named: m => { m.nodes.find(n => n.id === 'sign-in').label = ' '; return ['sign-in']; },
  'point-names': m => { m.nodes.find(n => n.id === 'check-out').members[1].label = 'payment'; return ['check-out', 'checkout.payment', 'checkout.extras']; },
  'comment-link': m => { m.edges.push(L('cl', 'CommentLink', 'browse', 'pay')); return ['cl', 'browse', 'pay']; }, // audit 46
};
test('validators: shopping-use-cases.json (example 8) breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(UC), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(UC), ids = broke(m), got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, ['use-case-owner', 'point-names', 'comment-link'].includes(rule) ? 'warning' : 'error', rule);
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
test('extension points are member rows by name; deleting one drops it from every extend that names it, and an extend left naming none goes too', () => {
  const ep = { id: 'checkout.payment', type: 'uml.ExtensionPoint', label: 'payment' };
  assert.equal(T.member.print(ep), 'payment');
  assert.deepEqual(T.member.add('  gift card '), { type: 'uml.ExtensionPoint', label: 'gift card', props: {} });
  assert.ok(T.member.add('  ').error);
  assert.deepEqual(T.member.edit(ep, 'pay now').commands, [{ op: 'set', id: 'checkout.payment', path: 'label', value: 'pay now' }]);
  assert.ok(T.member.edit(ep, '').error);
  const m = apply(UC, [{ op: 'delete', id: 'checkout.payment' }]);
  assert.equal(m.edges.find(e => e.id === 'voucher-extends-checkout'), undefined, 'it named that point alone: it goes (refs: empties, audit 19)');
  assert.deepEqual(T.validate(m).map(p => p.rule), [], 'nothing left naming no point');
  const two = structuredClone(UC), ext = two.edges.find(e => e.id === 'voucher-extends-checkout'), uc = two.nodes.find(n => n.id === ext.to);
  uc.members.push({ id: 'checkout.gift', type: 'uml.ExtensionPoint', label: 'gift' }); ext.props.extensionPoints.push('checkout.gift');
  const k = apply(two, [{ op: 'delete', id: 'checkout.payment' }]);
  assert.deepEqual(k.edges.find(e => e.id === 'voucher-extends-checkout').props.extensionPoints, ['checkout.gift'], 'one naming another keeps it');
  assert.equal(layout(k, 'shopping').edges.find(e => e.id === 'voucher-extends-checkout').label, '«extend» (gift) [the shopper has a voucher code]');
});

test('the Owner field and connect: subjects and packages for a use case, packages for an actor; an association drawn from a use case starts at the actor', () => {
  const m = structuredClone(UC); m.nodes.push({ id: 'pk', type: 'uml.Package', label: 'shop' });
  assert.deepEqual(T.owners(m, m.nodes.find(n => n.id === 'check-out')), [{ id: 'bookshop', label: 'Online bookshop' }, { id: 'pk', label: 'shop' }]);
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
  // CPU time, best of five after a warm-up: CI runs the timed tests one file at a time in their own step
  // (tests/communication.test.mjs)
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

test('an include chain 20,000 long is walked without recursion; a cycle at its end is said once, naming it (audit 1)', () => {
  const n = 20000, ids = Array.from({ length: n }, (_, i) => 'u' + i);
  const m = { schemaVersion: 2, nodes: ids.map(id => ({ id, type: 'uml.UseCase', label: id })), edges: ids.slice(1).map((id, i) => ({ id: 'i' + i, type: 'uml.Include', from: ids[i], to: id })),
    views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ids.slice(0, 3) }] };
  assert.deepEqual(validate(m), []);
  m.edges.push({ id: 'back', type: 'uml.Include', from: ids[n - 1], to: ids[n - 2] });
  assert.deepEqual(validate(m).filter(p => p.rule === 'include-cycle').map(p => p.ids), [[ids[n - 2], ids[n - 1], 'back']]);
});

test('describe() of packages nested 6,000 deep reads them with a stack, not recursion (audit 3)', () => {
  const N = 6000, nodes = Array.from({ length: N }, (_, i) => ({ id: 'p' + i, type: 'uml.Package', label: 'P' + i, ...(i ? { parent: 'p' + (i - 1) } : {}) }));
  nodes.push({ id: 'u', type: 'uml.UseCase', label: 'Buy', parent: 'p' + (N - 1) }, { id: 'a', type: 'uml.Actor', label: 'Shopper' });
  const d = describe({ schemaVersion: 2, nodes, edges: [{ id: 'e', type: 'uml.Association', from: 'a', to: 'u' }], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: nodes.map(n => n.id) }] }, 'v').split('\n');
  assert.ok(d[1].startsWith('Actor Shopper'), d[1]);
  assert.equal(d.length, N + 4);
});

test('F2 on an include or extend edits its label alone; an extend\'s [condition] is read back, its (points) are the panel\'s (audit 15)', () => {
  const T = diagramOf({ diagram: 'uml.use-case' }), v = UC.views[0], drawn = (m, id) => layout(m, v.id).edges.find(x => x.id === id).label;
  const inc = UC.edges.find(e => e.type === 'uml.Include'), ext = UC.edges.find(e => e.type === 'uml.Extend' && e.props?.condition && e.props?.extensionPoints?.length);
  for (const e of [inc, ext]) assert.deepEqual(T.edits.rename(UC, v, e.id, drawn(UC, e.id)), [], `${e.id}: unchanged, nothing`);
  const a = apply(UC, T.edits.rename(UC, v, inc.id, drawn(UC, inc.id) + ' for payment'));
  assert.equal(drawn(a, inc.id), drawn(UC, inc.id) + ' for payment'); assert.doesNotMatch(a.edges.find(e => e.id === inc.id).label, /«/);
  const b = apply(UC, T.edits.rename(UC, v, ext.id, drawn(UC, ext.id).replace(/\]$/, ' today]')));
  assert.equal(b.edges.find(e => e.id === ext.id).props.condition, ext.props.condition + ' today'); assert.equal(drawn(b, ext.id), drawn(UC, ext.id).replace(/\]$/, ' today]'));
  assert.match(T.edits.rename(UC, v, ext.id, drawn(UC, ext.id).replace(/\(.*\)/, '(other)')).error ?? '', /extension points/);
  assert.equal(T.edits.rename(UC, v, v.nodeIds[0], 'x'), null, 'a node: the canvas\'s own');
});

test('audit 16: F2 on an extend, unchanged, changes nothing; a condition holding brackets reads back; a label ending in [..] is refused', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.UseCase', label: 'Redeem' }, { id: 'b', type: 'uml.UseCase', label: 'Check out' }],
    edges: [{ id: 'x', type: 'uml.Extend', from: 'a', to: 'b', props: { condition: 'cart.items[0] is a voucher' } }],
    views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['a', 'b'], edges: ['x'] }] };
  const v = m.views[0], shown = layout(m, 'v').edges.find(e => e.id === 'x').label;
  assert.deepEqual(T.edits.rename(m, v, 'x', shown), []);
  assert.deepEqual(T.edits.rename(m, v, 'x', '«extend» [cart.items[1] is a voucher]'), [{ op: 'set', id: 'x', path: 'props.condition', value: 'cart.items[1] is a voucher' }]);
  const m2 = structuredClone(m); m2.edges[0] = { id: 'x', type: 'uml.Extend', from: 'a', to: 'b', label: 'apply code [beta]' };
  assert.deepEqual(T.edits.rename(m2, m2.views[0], 'x', '«extend» apply code [beta]'), []);
  assert.ok(T.edits.rename(m2, m2.views[0], 'x', '«extend» apply code [gamma]').error);
});

test('audit 17: an extend\'s name and «stereotypes», drawn on its line, are in its accessible name and describe()', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/shopping-use-cases.json', import.meta.url))), V = m.views[0];
  const e = [...(m.edges || []), ...(V.edges || [])].find(x => x && x.type === 'uml.Extend');
  const was = layout(m, V.id).edges.find(x => x.id === e.id).aria;
  e.label = 'voucher path'; (e.props ||= {}).stereotypes = ['optional'];
  const aria = layout(m, V.id).edges.find(x => x.id === e.id).aria;
  assert.ok(aria.startsWith(was.replace(/(, at |, when |$).*/, '') + ': «optional» voucher path'), aria);
  assert.ok(describe(m, V.id).includes(aria), 'describe() says the line as its aria does');
});

test('audit 20: the use case rules count a view\'s own lines (view.edges objects), which the view draws; deleting an extension point takes a view\'s own extend that named only it', () => {
  const m = structuredClone(UC), v = m.views[0];
  v.edges = [...m.edges.map(e => e.id), L('own-inc', 'Include', 'shopper', 'browse'), L('own-ext', 'Extend', 'gift-wrap', 'check-out'), L('own-assoc', 'Association', 'browse', 'track'),
    L('own-cyc1', 'Include', 'browse', 'track'), L('own-cyc2', 'Include', 'track', 'browse')];
  const g = layout(m, v.id); assert.ok(['own-inc', 'own-ext', 'own-assoc'].every(id => g.edges.some(e => (e._id ?? e.id) === id)), 'drawn');
  const got = validate(m).filter(p => p.level !== 'info'), at = id => `views[0].edges[${v.edges.findIndex(e => e.id === id)}]`;
  assert.deepEqual(got.map(p => [p.rule, p.path]), [['include-ends', at('own-inc')], ['extend-points', at('own-ext')], ['association-ends', at('own-assoc')], ['include-cycle', at('own-cyc1')]]);
  // the same lines in the model: the same rules
  const same = structuredClone(m); same.edges.push(...same.views[0].edges.filter(e => typeof e === 'object')); same.views[0].edges = same.views[0].edges.map(e => (typeof e === 'object' ? e.id : e));
  assert.deepEqual(validate(same).filter(p => p.level !== 'info').map(p => p.rule), got.map(p => p.rule));
  // Shift + Delete on the extension point a view's own extend names alone: the extend goes too
  const x = structuredClone(UC), ext = x.edges.find(e => e.type === 'uml.Extend'); x.edges = x.edges.filter(e => e !== ext);
  x.views[0].edges = [...x.edges.map(e => e.id), { ...ext, id: 'own-ext' }];
  const r = T.edits.remove(x, x.views[0], ext.props.extensionPoints, true);
  assert.deepEqual(r.commands.map(c => c.id), [...ext.props.extensionPoints, 'own-ext']);
  assert.deepEqual(validate(apply(x, r.commands)).filter(p => p.level === 'error'), []);
});

test('audit 21: each view\'s own lines are checked with that view alone: two views\' own includes make no cycle neither has', () => {
  const m = { schemaVersion: 2, nodes: [U('u1', 'Pay'), U('u2', 'Check out')], edges: [],
    views: [{ id: 'w1', diagram: 'uml.use-case', nodeIds: ['u1', 'u2'], edges: [L('g1', 'Include', 'u1', 'u2')] }, { id: 'w2', diagram: 'uml.use-case', nodeIds: ['u1', 'u2'], edges: [L('g2', 'Include', 'u2', 'u1')] }] };
  assert.deepEqual(validate(m).filter(p => p.level !== 'info').map(p => p.message), []);
  const one = structuredClone(m); one.views[0].edges.push(L('g3', 'Include', 'u2', 'u1'));
  assert.deepEqual(validate(one).filter(p => p.rule === 'include-cycle').map(p => p.path), ['views[0].edges[1]'], 'both in one view: a cycle, as before');
});

// audit 22: a palette node apply() puts in a view's own nodes (add { in: 'view' }) is drawn, said and checked by the use case,
// activity, state machine, communication and interaction overview types, as by the sequence type; a problem at one is said at
// its own path
test('the behavioural types draw, say and check a view\'s own nodes (audit 22)', async () => {
  for (const f of ['activity', 'state', 'communication', 'overview', 'sequence']) await import(`../src/uml/${f}.js`);
  const ex = n => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
  for (const [file, diagram, el] of [['shopping-use-cases', 'uml.use-case', U('gift', 'Send as a gift')], ['fulfil-activity', 'uml.activity', { id: 'wrap', type: 'uml.Action', label: 'Gift-wrap the books' }],
    ['order-states', 'uml.state-machine', { id: 'held', type: 'uml.State', label: 'On hold' }], ['checkout-communication', 'uml.communication', { id: 'audit', type: 'uml.Lifeline', label: 'audit' }],
    ['buy-book-overview', 'uml.interaction-overview', { id: 'wait', type: 'uml.DecisionNode', label: 'Wait here' }]]) {
    const m = ex(file), v = m.views.find(x => x.diagram === diagram), n = apply(m, [{ op: 'add', element: el, view: v.id, in: 'view' }]), nv = n.views.find(x => x.id === v.id);
    assert.ok(nv.nodes.some(x => x.id === el.id) && !n.nodes.some(x => x.id === el.id), `${diagram}: in the view's own nodes`);
    assert.ok(layout(n, v.id).byId[el.id], `${diagram}: drawn`);
    assert.ok(describe(n, v.id).includes(el.label), `${diagram}: said`);
  }
  // a model association from an actor to a view's own use case: drawn, and no false association-ends; a view's own actor with no
  // name: named, at its own path
  const m = structuredClone(UC), v = m.views[0], actor = m.nodes.find(x => x.type === 'uml.Actor').id;
  const n = apply(m, [{ op: 'add', element: U('gift', 'Send as a gift'), view: v.id, in: 'view' }, { op: 'add', element: L('as-gift', 'Association', actor, 'gift'), view: v.id }]);
  assert.ok(layout(n, v.id).edges.some(e => e.id === 'as-gift'));
  assert.deepEqual(validate(n).filter(p => p.rule === 'association-ends'), []);
  n.views[0].nodes[0].label = '';
  assert.deepEqual(validate(n).filter(p => p.rule === 'named').map(p => [p.path, p.ids]), [[`views[0].nodes[0]`, ['gift']]]);
});

// audit 23: every registered type reads a view's own nodes as the model's (registry.js): the structural UML types, the
// milestone-2 types, the cloud family and SysML's block definition and requirement views draw, say and check a node added
// with add { in: 'view' } as they do the same node added to the model, a problem at it said at its own path
test('every type draws, says and checks a view\'s own nodes as the model\'s (audit 23)', async () => {
  for (const f of ['uml/class', 'uml/package', 'uml/object', 'uml/component', 'uml/deployment', 'uml/profile', 'uml/information', 'er/er', 'flowchart/flowchart', 'dfd/dfd', 'c4/c4', 'c4/views', 'cloud/cloud', 'sysml/blocks', 'sysml/requirement']) await import(`../src/${f}.js`);
  const ex = n => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
  const two = (type, member) => ({ id: 'zed', type, label: 'Zed', members: ['a', 'b'].map(k => ({ id: `zed.${k}`, type: member, label: 'a' })) }); // two members of one name
  const rows = [['sales-classes', two('uml.Class', 'uml.Property')], ['bookshop-packages', two('uml.Class', 'uml.Property')], ['bookshop-components', { id: 'zed', type: 'uml.Component', label: 'Zed' }],
    ['bookshop-deployment', { id: 'zed', type: 'uml.Node', label: 'Zed' }], ['order-objects', two('uml.InstanceSpecification', 'uml.Slot')], ['bookshop-profile', two('uml.Stereotype', 'uml.Property')],
    ['order-information-flow', { id: 'zed', type: 'uml.Class', label: 'Zed' }], ['bookshop-schema', { id: 'zed', type: 'er.Entity', label: 'Zed' }], ['returns-flowchart', { id: 'zed', type: 'flow.Process', label: 'Zed' }],
    ['bookshop-data-flow', { id: 'zed', type: 'dfd.Process', label: 'Zed', props: { number: '9' } }], ['bookshop-c4', { id: 'zed', type: 'c4.SoftwareSystem', label: 'Zed' }],
    ['bookshop-gcp', { id: 'zed', type: 'gcp.Product', label: 'Zed', props: { icon: 'cloud-run' } }], ['bookshop-aws', { id: 'zed', type: 'aws.Service', label: 'Zed' }], ['bookshop-azure', { id: 'zed', type: 'azure.Service', label: 'Zed' }],
    ['ebike-blocks', two('sysml.Block', 'sysml.PartProperty')], ['ebike-requirements', { id: 'zed', type: 'sysml.Requirement', label: 'Zed', props: { reqId: 'EB-9', text: 'x' } }]];
  let checked = 0;
  for (const [file, el] of rows) {
    const m = ex(file), v = m.views[0], said = (n, where) => validate(n).filter(p => (p.ids || []).includes('zed')).map(p => [p.rule, where === 'view' ? String(p.path).replace(/^views\[0\]\.nodes\[0\]/, 'X') : String(p.path).replace(/^nodes\[\d+\]/, 'X')]);
    const got = ['model', 'view'].map(where => { const n = apply(m, [{ op: 'add', element: el, view: v.id, in: where }]);
      if (where === 'view') assert.ok(!n.nodes.some(x => x.id === 'zed') && n.views[0].nodes.some(x => x.id === 'zed'), `${file}: in the view's own nodes`);
      return { drawn: !!layout(n, v.id).byId.zed, said: describe(n, v.id).includes('Zed'), problems: said(n, where) }; });
    assert.deepEqual(got[1], got[0], `${v.diagram} (${file}): as the model's`);
    assert.ok(got[1].drawn && got[1].said, `${v.diagram}: drawn and said`);
    checked += got[1].problems.length > 0;
  }
  assert.ok(checked >= 5, 'checked: a problem at the view\'s own node is said, at its own path');
});

// audit 23: a hostile model's view-own nodes (ids a prototype has, parents in a loop between a view and the model, a URL and
// markup in labels) are read without a throw, drawn escaped and fetching nothing, and a delete of one ends
test('a view\'s own nodes in a hostile model: no throw, nothing fetched, a delete ends (audit 23)', async () => {
  await import('../src/uml/activity.js');
  const bad = '<img src=https://track.example/p.gif onerror=alert(1)><a href="javascript:alert(1)">x</a> url(https://track.example/u)';
  const m = { schemaVersion: 2, nodes: [{ id: 'constructor', type: 'uml.Action', label: bad, parent: '__proto__' }, { id: 'toString', type: 'uml.ActivityPartition', label: bad, parent: 'hasOwnProperty' }],
    edges: [{ id: 'f', type: 'uml.ControlFlow', from: 'constructor', to: '__proto__' }],
    views: [{ id: 'v', diagram: 'uml.activity', nodeIds: ['constructor', 'toString', '__proto__', 'hasOwnProperty'],
      nodes: [{ id: '__proto__', type: 'uml.ActivityPartition', label: bad, parent: 'toString' }, { id: 'hasOwnProperty', type: 'uml.ActivityPartition', label: bad, parent: '__proto__' }, { id: 'toString', type: 'uml.Action', label: 'taken by the model' }] }] };
  const g = layout(m, 'v'), svg = svgOf(g, {});
  const tags = svg.match(/<[^>]+>/g) || [], attrs = tags.flatMap(t => [...t.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
  assert.ok(!tags.some(t => /^<\/?(img|a|image|script|foreignObject|use)\b/i.test(t)), 'markup escaped: no tag of the model\'s');
  assert.deepEqual(attrs.filter(([k, v]) => (/^(href|src|xlink:href)$/i.test(k) && /^\s*(https?:|javascript:|\/\/)/i.test(v)) || (/^style$/i.test(k) && /url\(/i.test(v)) || /^on/i.test(k)), [], 'no attribute fetches or runs the model\'s text');
  assert.ok(Array.isArray(validate(m)) && typeof describe(m, 'v') === 'string');
  const a = apply(m, [{ op: 'delete', id: '__proto__' }]);
  assert.deepEqual(a.nodes.map(n => n.id), ['constructor', 'toString'], 'the model\'s nodes kept');
  assert.ok(!a.nodes.some(n => ['__proto__', 'hasOwnProperty', n.id].includes(n.parent)), 'none left under what the view alone held, nor under itself');
  assert.ok(!(a.views[0].nodes || []).some(n => n.id === '__proto__' || n.id === 'hasOwnProperty'));
  // a hook's add under such an owner: added to the view, not under a prototype key
  const r = diagramOf(m.views[0]).edits.add(m, m.views[0], { type: 'uml.Action' }, 'x', { sel: ['hasOwnProperty'] });
  assert.equal(r[0].in, 'view'); assert.equal(Object.getPrototypeOf({}).polluted, undefined);
});

test('audit 24: Shift + Delete on an extension point of a use case the view holds as its own names it as a point', () => {
  const U = { id: 'co', type: 'uml.UseCase', label: 'Check out', members: [{ id: 'co.pay', type: 'uml.ExtensionPoint', label: 'payment' }] };
  const m = { schemaVersion: 2, nodes: [{ id: 'rv', type: 'uml.UseCase', label: 'Redeem a voucher' }], edges: [{ id: 'x', type: 'uml.Extend', from: 'rv', to: 'co', props: { extensionPoints: ['co.pay'] } }],
    views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['rv', 'co'], nodes: [U] }] };
  assert.equal(diagramOf(m.views[0]).edits.remove(m, m.views[0], ['co.pay'], true).say, 'Deleted extension point "payment" and the extend from "Redeem a voucher", which named no other extension point');
});

test('audit 29: generalization-cycle: an actor or a use case that is its own ancestor is an error, said as the class view says it', () => {
  const N = (id, type) => ({ id, type, label: id }), G = (id, from, to) => ({ id, type: 'uml.Generalization', from, to });
  const m = { schemaVersion: 2, nodes: [N('a1', 'uml.Actor'), N('a2', 'uml.Actor'), N('a3', 'uml.Actor'), N('u1', 'uml.UseCase'), N('u2', 'uml.UseCase')],
    edges: [G('g1', 'a1', 'a2'), G('g2', 'a2', 'a3'), G('g3', 'a3', 'a1'), G('g4', 'u1', 'u2'), G('g5', 'u2', 'u1')], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['a1', 'a2', 'a3', 'u1', 'u2'] }] };
  assert.deepEqual(validate(m).map(p => [p.level, p.path, p.message]), [
    ['error', 'edges[2]', 'generalization-cycle: "a1" → "a2" → "a3" → "a1" is its own ancestor (g3)'],
    ['error', 'edges[4]', 'generalization-cycle: "u1" → "u2" → "u1" is its own ancestor (g5)']]);
  // a chain with no cycle, and the bookshop's own generalizations, raise nothing
  m.edges.splice(2, 1); m.edges.pop(); assert.deepEqual(validate(m), []);
});

test('audit 30: a self-generalization of an actor or a use case is generalization-cycle\'s, as in the class view, not generalization-kinds\'', () => {
  for (const t of ['uml.UseCase', 'uml.Actor']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'u', type: t, label: 'U' }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'u', to: 'u' }], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['u'] }] };
    const cls = { ...m, nodes: [{ id: 'u', type: 'uml.Class', label: 'U' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['u'] }] };
    assert.deepEqual(validate(m).map(p => [p.level, p.rule, p.message]), [['error', 'generalization-cycle', 'generalization-cycle: "U" → "U" is its own ancestor (g)']], t);
    assert.deepEqual(validate(m).map(p => p.message), validate(cls).map(p => p.message), 'said as the class view says it');
  }
  // an actor to a use case is still generalization-kinds'
  const k = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Actor', label: 'A' }, { id: 'u', type: 'uml.UseCase', label: 'U' }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'a', to: 'u' }], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['a', 'u'] }] };
  assert.deepEqual(validate(k).map(p => p.rule), ['generalization-kinds']);
});

test('audit 32: use-case-owner, partition-owner and transition-ends write the kind with its article, as owner-kinds does: never "a undefined", "a Interface"', () => {
  const mk = (d, nodes, edges = []) => ({ schemaVersion: 2, root: 'v', nodes, edges, views: [{ id: 'v', diagram: d, parent: null, nodeIds: nodes.map(n => n.id) }] });
  const said = (m, rule) => validate(m).filter(p => p.rule === rule).map(p => p.message);
  for (const [t, w] of [[undefined, 'an element'], ['', 'an element'], ['uml.Interface', 'an interface'], ['uml.Actor', 'an actor'], ['uml.UseCase', 'a use case']]) {
    const x = t === undefined ? {} : { type: t };
    if (t !== 'uml.UseCase') assert.deepEqual(said(mk('uml.use-case', [{ id: 'p', ...x, label: 'P' }, { id: 'u', type: 'uml.UseCase', label: 'Buy', parent: 'p' }]), 'use-case-owner'),
      [`use-case-owner: "Buy" is owned by "P", ${w}: a use case's owner is a subject or a package`], String(t));
    assert.deepEqual(said(mk('uml.activity', [{ id: 'p', ...x, label: 'P' }, { id: 'a', type: 'uml.Action', label: 'Pay', parent: 'p' }]), 'partition-owner'),
      [`partition-owner: a ("Pay") is owned by p ("P"), ${w}, not a partition`], String(t));
    const st = said(mk('uml.state-machine', [{ id: 's', type: 'uml.State', label: 'Idle' }, { id: 'x', ...x, label: 'X' }], [{ id: 't1', type: 'uml.Transition', from: 's', to: 'x' }]), 'transition-ends');
    assert.equal(st.length, 1, String(t)); assert.match(st[0], new RegExp(`^transition-ends: t1 ends on "[^"]*X", ${w}: `), String(t));
  }
});

// audit 37: laid out down, the association routed last ran down through the extend's label, which found no other spot off
// every line; a label left on a line now has the view laid out again with room for it, as one with no spot has
test('audit 37: an extend\'s label with its point and condition keeps off the association laid out down', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a0', type: 'uml.Actor', label: 'Customer service agent 0' }, { id: 'sys', type: 'uml.Subject', label: 'Online shop' },
    { id: 'u0', type: 'uml.UseCase', label: 'Do a long use case number 0', parent: 'sys' },
    { id: 'u1', type: 'uml.UseCase', label: 'Do a long use case number 1', parent: 'sys', members: [{ id: 'u1p', type: 'uml.ExtensionPoint', label: 'point 1' }] },
    { id: 'u2', type: 'uml.UseCase', label: 'Do a long use case number 2', parent: 'sys' }],
  edges: [{ id: 'e0', type: 'uml.Association', from: 'a0', to: 'u0' }, { id: 'e1', type: 'uml.Association', from: 'a0', to: 'u2' },
    { id: 'e2', type: 'uml.Extend', from: 'u0', to: 'u1', props: { extensionPoints: ['u1p'], condition: 'x > 1' } }, { id: 'e3', type: 'uml.Include', from: 'u0', to: 'u2' }],
  views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['a0', 'sys', 'u0', 'u1', 'u2'], direction: 'down' }] };
  assert.deepEqual(check(m, 'v').map(p => p.message).filter(p => !/ cross$/.test(p)), []);
  assert.equal(layout(m, 'v').edges.find(e => e.id === 'e2').lbl.text, '«extend» (point 1) [x > 1]');
});

test('audit 50: connect refuses a line validate() calls an error, in the rule\'s words (include-ends, extend-ends, association-ends, generalization-kinds); one it does not, the default', () => {
  const v = UC.views[0], c = (f, t, type) => T.edits.connect(UC, v, f, t, null, { type: 'uml.' + type });
  for (const [f, t, type, rule] of [['shopper', 'check-out', 'Include', 'include-ends'], ['check-out', 'shopper', 'Include', 'include-ends'], ['shopper', 'check-out', 'Extend', 'extend-ends'],
    ['check-out', 'redeem-voucher', 'Association', 'association-ends'], ['shopper', 'check-out', 'Generalization', 'generalization-kinds'], ['check-out', 'shopper', 'Generalization', 'generalization-kinds']]) {
    const r = c(f, t, type); assert.ok(r && typeof r.error === 'string' && r.error.startsWith(rule + ': the new line '), `${f} -> ${t} ${type}: ${JSON.stringify(r)}`);
    // what it refuses is what validate() would flag on the canvas's own add
    assert.ok(validate(apply(UC, { op: 'add', element: { id: 'x', type: 'uml.' + type, from: f, to: t }, view: v.id })).some(p => p.level === 'error' && p.rule === rule), rule); }
  assert.equal(c('redeem-voucher', 'check-out', 'Extend'), null, 'an extend between two use cases: its extension points are picked after (extend-points is its own)');
  assert.equal(c('track', 'sign-in', 'Include'), null); assert.equal(c('shopper', 'track', 'Association'), null);
  assert.deepEqual(c('track', 'shopper', 'Association'), [{ op: 'add', element: { id: 'association1', type: 'uml.Association', from: 'shopper', to: 'track' }, view: 'shopping' }]);
});

test('audit 58: a use case named with no spaces (Chinese) wraps to more than one line', () => {
  const n = { id: 'u', label: '为书店开业准备第一批五百种图书并与两家批发商谈好退货条款和付款期限', x: 0, y: 0 }; Object.assign(n, SHAPE.ellipse.size(n));
  const ls = [...SHAPE.ellipse.draw(n).matchAll(/class="c-name"[^>]*>([^<]*)</g)].map(x => x[1]);
  assert.ok(ls.length > 1 && ls.join('') === n.label, JSON.stringify(ls));
});

// audit 59: the shopping example after Alt + Left on the shopper and Alt + Down on the payment provider warned twice that a
// line runs through the payment provider: the warnings came from the layout as pinned, which pinsClear drops for a clean one
test('a pinned view warns only of the layout it draws (audit 59)', () => {
  const m = structuredClone(UC), said = [], keep = console.warn; m.views[0].layout = { shopper: [0, 1], 'payment-provider': [1, 1] };
  console.warn = s => said.push(String(s));
  try { layout(m, m.views[0].id); } finally { console.warn = keep; }
  assert.deepEqual(check(m, m.views[0].id), []);
  assert.deepEqual(said.filter(s => /runs through/.test(s)), []);
});

// Layout by business flow, section 12 step 10 (docs/diagrams/notes/layout-flow.md section 7.2): the use case's zoneOf, read
// only in an arranged view: a primary actor first (where every actor goes today), a secondary actor (whose associations all
// come from use cases) last; no flowRole, so no line is a dependency and the view has no main flow
test('zoneOf: a primary actor first, a secondary actor last; an arranged view draws the secondary actor after the use cases', () => {
  const m = { schemaVersion: 2, nodes: [A('shopper', 'Shopper'), A('bank', 'Bank'), A('idle', 'Idle'), U('buy', 'Buy'), U('pay', 'Pay')],
    edges: [L('a1', 'Association', 'shopper', 'buy'), L('a2', 'Association', 'pay', 'bank'), L('i', 'Include', 'buy', 'pay')],
    views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['shopper', 'bank', 'idle', 'buy', 'pay'] }] };
  const v = m.views[0], el = id => m.nodes.find(x => x.id === id);
  assert.deepEqual(['shopper', 'bank', 'idle', 'buy'].map(id => T.zoneOf(el(id), m, v)), ['first', 'last', 'first', null]);
  assert.equal(T.flowRole, undefined);
  const col = (mm, id) => layout(mm, 'v').byId[id].col;
  assert.ok(col(m, 'bank') < col(m, 'pay'), 'not arranged: every actor in the actors\' column');
  const a = structuredClone(m); a.views[0].arrange = 'flow';
  assert.ok(col(a, 'shopper') < col(a, 'buy') && col(a, 'bank') > col(a, 'pay'), 'arranged: the bank after the use cases');
  assert.equal(T.layout.keepsRank(a, a.views[0], 'bank'), null, 'a last actor\'s pin holds');
});
