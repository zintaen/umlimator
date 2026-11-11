// The class diagram's fixtures (work package 1.11): tests/class-minimal.json, the smallest class view, and
// tests/class-stress.json, risks.md G1's edge cases in a view of 50 elements, laid out within P1's budget.
// tests/class.html draws both in a browser, in both themes and three fonts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import '../src/uml/class.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { endLabels } from '../src/typed/draw.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const MINIMAL = read('./class-minimal.json'), STRESS = read('./class-stress.json');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// DoD 3 in Node: no two nodes overlap, no line runs through a node it does not join, no role or multiplicity lies on a
// node, and every line the view shows is drawn. Lines may cross: check() lists those, and they are returned
function clean(m, vid) {
  const g = layout(m, vid), bad = [];
  for (const a of g.nodes) for (const b of g.nodes) if (a.id < b.id && meets(a, b)) bad.push(`${a.id} and ${b.id} overlap`);
  let labels = 0;
  g.edges.forEach(e => {
    e.pts.slice(1).forEach((q, k) => { const p = e.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
      g.nodes.forEach(n => { if (n.id !== e.from && n.id !== e.to && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }); });
    endLabels(e, e.pts).forEach(b => { labels++; g.nodes.forEach(n => { if (meets(b, n)) bad.push(`${e.id}'s "${b.text}" lies on ${n.id}`); }); });
  });
  const v = m.views.find(x => x.id === vid), shown = new Set(v.nodeIds), owner = new Map(m.nodes.flatMap(n => [[n.id, n.id], ...(n.members || []).map(x => [x.id, n.id])]));
  const want = m.edges.filter(e => shown.has(owner.get(e.from)) && shown.has(owner.get(e.to))).map(e => e.id).sort();
  assert.deepEqual(g.edges.map(e => e.id).sort(), want, `${vid}: every line drawn, each on its own`);
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, labels, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the minimal fixture: one class with an attribute and an operation, one without, a composition; it validates and lays out clean', () => {
  assert.deepEqual(validate(MINIMAL), []);
  const r = clean(MINIMAL, 'v');
  assert.deepEqual([r.bad, r.others, r.crossings], [[], [], []]);
  assert.equal(r.labels, 3, 'the composite end\'s multiplicity, and the role and multiplicity at the navigable end');
});

test('the stress fixture holds every edge case of risks.md G1, so it cannot be trimmed by accident', () => {
  const N = Object.fromEntries(STRESS.nodes.map(n => [n.id, n])), ms = n => n.members || [], all = STRESS.nodes.flatMap(ms);
  const pair = e => [e.from, e.to].sort().join(' '), pairs = {};
  STRESS.edges.forEach(e => { pairs[pair(e)] = (pairs[pair(e)] || 0) + 1; });
  assert.ok(STRESS.nodes.some(n => n.type === 'uml.Class' && !ms(n).length), 'a class with no members');
  assert.ok(STRESS.nodes.some(n => ms(n).length === 60), 'a class with 60');
  assert.ok(STRESS.nodes.some(n => (n.props || {}).isAbstract) && all.some(x => (x.props || {}).isAbstract), 'an abstract class and an abstract operation');
  assert.ok(all.some(x => x.type === 'uml.Property' && (x.props || {}).isStatic) && all.some(x => x.type === 'uml.Operation' && (x.props || {}).isStatic), 'static members');
  assert.ok(all.some(x => (x.props || {}).isDerived), 'a derived member');
  assert.ok(STRESS.edges.some(e => e.type === 'uml.Association' && e.from === e.to), 'a reflexive association');
  assert.ok(Object.values(pairs).some(k => k >= 4), 'four lines between two classes');
  assert.ok(STRESS.nodes.some(n => n.type === 'uml.Package' && N[n.parent] && N[n.parent].type === 'uml.Package'), 'a package holding a package');
  assert.ok(STRESS.nodes.some(n => n.type === 'uml.Enumeration' && !ms(n).length), 'an enumeration with no literals');
  assert.ok(STRESS.views[0].nodeIds.length >= 50, 'a view of 50 elements or more (P1: a full layout of 50 nodes in 1 s)');
  assert.deepEqual(validate(STRESS).filter(p => p.level === 'error'), []);
});

test('the stress fixture lays out with no overlap, no line through a node and no end label on a node, in both views', () => {
  for (const v of STRESS.views) {
    const r = clean(STRESS, v.id);
    assert.deepEqual(r.bad, [], v.id);
    assert.deepEqual(r.others, [], `${v.id}: check() finds nothing but lines that cross`);
    assert.ok(r.labels > 20 || v.id !== 'all', `${v.id}: ${r.labels} end labels`);
    console.log(`# ${v.id}: ${r.g.nodes.length} elements, ${r.g.edges.length} lines, ${r.crossings.length} crossings`);
    // the counts docs/conformance/uml-class.md and risks.md L4 state: a change of layout that moves them updates both
    assert.equal(r.crossings.length, { all: 29, 'edge-cases': 2 }[v.id], `${v.id}: the crossings the conformance note states`);
  }
  const a = layout(STRESS, 'edge-cases').nodes.find(n => n.id === 'person'), b = layout(STRESS, 'all').nodes.find(n => n.id === 'person');
  assert.ok(a.h < b.h / 4, 'present.person.rows: 8 caps the 60-member class in one view, which the other shows whole');
});

test('performance (risks.md P1): the stress fixture lays out in under 1 s, and an edit that moves nothing is laid out and drawn (SVG markup) in under 100 ms', () => {
  const runs = [];
  for (let i = 0; i < 3; i++) { // the first run is cold (the JIT warms up on it); a page lays out warm after its first draw
    const memos = {}, t0 = performance.now(); mapContext(STRESS, { memos }).buildGeo('all'); const full = performance.now() - t0;
    const t1 = performance.now(), out = mapContext(apply(STRESS, [{ op: 'set', id: 'buys', path: 'props.ends.to.role', value: 'buyer' }]), { memos }).buildView('all').markup; const paint = performance.now() - t1;
    assert.ok(out.includes('>buyer<'), 'the markup holds the edit');
    const t2 = performance.now(); mapContext(apply(STRESS, [{ op: 'set', id: 'book', path: 'label', value: 'BookWithALongerName' }]), { memos }).buildGeo('all'); const grow = performance.now() - t2;
    assert.equal(memos.all.runs, 2, 'the role laid out nothing again; the longer name laid out once');
    runs.push({ full, paint, grow });
  }
  const best = k => Math.min(...runs.map(r => r[k]));
  console.log(`# ${STRESS.views[0].nodeIds.length} elements, ${STRESS.edges.length} lines: full layout ${runs.map(r => Math.round(r.full)).join(', ')} ms; an edit that moves nothing, laid out and drawn ${runs.map(r => r.paint.toFixed(1)).join(', ')} ms; one that resizes a class ${runs.map(r => Math.round(r.grow)).join(', ')} ms`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('grow') < 1000, `an edit that resizes a class ${best('grow')} ms`);
  assert.ok(best('paint') < 100, `an edit that moves nothing ${best('paint')} ms`);
});

test('a view with no elements lays out as an empty stage, and draws', () => {
  for (const m of [{ schemaVersion: 2, nodes: [], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: [] }] }, { schemaVersion: 2, nodes: [], edges: [], views: [{ id: 'v', diagram: 'uml.class' }] },
    { nodes: [], edges: [], views: [{ id: 'v', nodeIds: [] }] }, { ...MINIMAL, views: [{ ...MINIMAL.views[0], nodeIds: [] }] }]) {
    const g = layout(m, 'v');
    assert.deepEqual([g.nodes.length, g.edges.length, g.bounds], [0, 0, { x: -36, y: -36, w: 72, h: 72 }]);
    assert.match(mapContext(m).buildView('v').markup, /^<svg viewBox="-36 -36 72 72"/);
    assert.deepEqual(check(m, 'v'), []);
  }
});
