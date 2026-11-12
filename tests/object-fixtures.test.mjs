// The object diagram's fixtures (work package 2.6, notes/stage-2.md §15): tests/object-minimal.json, the edge cases of an
// object view, and tests/object-stress.json, 50 instances and 60 links laid out within P1's budget. Each lays out with no
// overlap, no line through a node and no role on a node, in both directions. tests/fixtures.html draws both in a browser,
// in both themes and three fonts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import '../src/uml/object.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { endLabels } from '../src/typed/draw.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const MINIMAL = read('./object-minimal.json'), STRESS = read('./object-stress.json');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const turned = (m, vid, direction) => { const c = structuredClone(m); c.views.find(v => v.id === vid).direction = direction; return c; };

// DoD 3 in Node: no two nodes overlap, no line runs through a node it does not join, no role lies on a node, and every link
// the view shows is drawn, each on its own. Lines may cross: check() lists those, and they are returned
function clean(m, vid) {
  const g = layout(m, vid), bad = [];
  for (const a of g.nodes) for (const b of g.nodes) if (a.id < b.id && meets(a, b)) bad.push(`${a.id} and ${b.id} overlap`);
  let labels = 0;
  g.edges.forEach(e => {
    e.pts.slice(1).forEach((q, k) => { const p = e.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
      g.nodes.forEach(n => { if (n.id !== e.from && n.id !== e.to && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }); });
    endLabels(e, e.pts).forEach(b => { labels++; g.nodes.forEach(n => { if (meets(b, n)) bad.push(`${e.id}'s "${b.text}" lies on ${n.id}`); }); });
  });
  const shown = new Set(m.views.find(v => v.id === vid).nodeIds);
  assert.deepEqual(g.edges.map(e => e.id).sort(), m.edges.filter(e => shown.has(e.from) && shown.has(e.to)).map(e => e.id).sort(), `${vid}: every link drawn, each on its own`);
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, labels, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the minimal fixture holds every case of notes/stage-2.md §15, so it cannot be trimmed by accident', () => {
  const N = Object.fromEntries(MINIMAL.nodes.map(n => [n.id, n])), inst = MINIMAL.nodes.filter(n => n.type === 'uml.InstanceSpecification'), slots = inst.flatMap(n => n.members || []);
  const g = layout(MINIMAL, 'v'), L = Object.fromEntries(g.nodes.map(n => [n.id, n.label]));
  assert.equal(L.anon, ': Customer', 'an anonymous instance');
  assert.equal(L.bare, 'thing', 'an instance with no classifier, drawn by its name');
  assert.ok(inst.some(n => !(n.members || []).length), 'an instance with no slots');
  assert.ok(slots.some(s => !s.props || s.props.value == null), 'a slot with no value');
  assert.equal(g.byId.bare.w, 320, 'a long slot value: the instance as wide as an instance may be, the value cut');
  const E = Object.fromEntries(MINIMAL.edges.map(e => [e.id, e])), pair = e => [e.from, e.to].sort().join(' ');
  assert.ok(E.places.label && E.places.props.ends.from.role && E.places.props.ends.to.role, 'a link with a name and roles at both ends');
  assert.ok(!E.takes.label && E.takes.props.association, 'a link naming its association only');
  assert.equal(g.edges.find(e => e.id === 'takes').label, 'Takes', '…drawn with its association\'s name');
  assert.ok(MINIMAL.edges.filter(e => pair(e) === pair(E['has-1'])).length === 2, 'two links between one pair (F2)');
  assert.ok(MINIMAL.edges.some(e => e.from === e.to), 'a link from an instance to itself (F1)');
  assert.equal(L.o1, 'shop::order1 : Order', 'an instance in a package the view does not show, qualified');
  assert.ok(N['order-class'] && N['order-class'].type === 'uml.Class', 'its classifier is in the model');
  assert.deepEqual(validate(MINIMAL).map(p => [p.level, p.rule, p.ids]), [['warning', 'instance-of', ['o1', 'o1.coupon', 'order-class']]], 'with a slot its classifier lacks (instance-of); no error');
});

test('the minimal fixture lays out clean, right and down: no overlap, no line through an instance, no role on one, each link drawn', () => {
  for (const direction of ['down', 'right']) {
    const r = clean(turned(MINIMAL, 'v', direction), 'v');
    assert.deepEqual([r.bad, r.others, r.crossings], [[], [], []], direction);
    assert.equal(r.labels, 3, `${direction}: the roles buyer, orders and lines`);
  }
});

test('the stress fixture: 50 instances with their slots, 60 links with roles, one to itself; no error', () => {
  assert.equal(STRESS.nodes.filter(n => n.type === 'uml.InstanceSpecification').length, 50);
  assert.equal(STRESS.edges.length, 60);
  assert.equal(layout(STRESS, 'all').nodes.length, 50, 'P1: a full layout of 50 nodes');
  assert.ok(STRESS.edges.some(e => e.from === e.to));
  assert.deepEqual(validate(STRESS), []);
});

test('the stress fixture lays out clean, right and down; its crossings are the ones the conformance note states', () => {
  // the counts docs/conformance/uml-object.md and risks.md L4 state: a change of layout that moves them updates both
  const want = { down: 42, right: 42 };
  for (const direction of ['down', 'right']) {
    const r = clean(turned(STRESS, 'all', direction), 'all');
    assert.deepEqual(r.bad, [], direction);
    assert.deepEqual(r.others, [], `${direction}: check() finds nothing but lines that cross`);
    assert.ok(r.labels >= 60, `${direction}: ${r.labels} roles`);
    console.log(`# all, ${direction}: ${r.g.nodes.length} instances, ${r.g.edges.length} links, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, want[direction], `${direction}: the crossings the conformance note states`);
  }
});

test('performance (risks.md P1): the stress fixture lays out in under 1 s, and an edit that moves nothing is laid out and drawn (SVG markup) in under 100 ms', () => {
  const runs = [];
  for (let i = 0; i < 3; i++) { // the first run is cold (the JIT warms up on it); a page lays out warm after its first draw
    const memos = {}, t0 = performance.now(); mapContext(STRESS, { memos }).buildGeo('all'); const full = performance.now() - t0;
    const t1 = performance.now(), out = mapContext(apply(STRESS, [{ op: 'set', id: 'l1', path: 'props.ends.to.role', value: 'bought' }]), { memos }).buildView('all').markup; const paint = performance.now() - t1;
    assert.ok(out.includes('>bought<'), 'the markup holds the edit');
    assert.equal(memos.all.runs, 1, 'a role laid out nothing again');
    runs.push({ full, paint });
  }
  const best = k => Math.min(...runs.map(r => r[k]));
  console.log(`# ${STRESS.views[0].nodeIds.length} instances, ${STRESS.edges.length} links: full layout ${runs.map(r => Math.round(r.full)).join(', ')} ms; an edit that moves nothing, laid out and drawn ${runs.map(r => r.paint.toFixed(1)).join(', ')} ms`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('paint') < 100, `an edit that moves nothing ${best('paint')} ms`);
});
