// The package diagram's fixtures (work package 2.6, notes/stage-2.md §15): tests/package-minimal.json, risks.md G1's package
// cases, L8 and M6 in a few views, and tests/package-stress.json, packages over three levels with 50 nodes and 60 lines,
// laid out within P1's budget. Each lays out with no overlap, no line through a node, along a box's border or through a
// tab, and every box holds exactly what it owns on the picture, in both directions. tests/fixtures.html draws both in a
// browser, in both themes and three fonts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import '../src/uml/package.js';
import '../src/uml/object.js';
import { diagramOf } from '../src/core/registry.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { SHAPE } from '../src/draw/shapes.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const MINIMAL = read('./package-minimal.json'), STRESS = read('./package-stress.json');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x > f.x && o.y > f.y && o.x + o.w < f.x + f.w && o.y + o.h < f.y + f.h;
const turned = (m, vid, direction) => { const c = structuredClone(m); c.views.find(v => v.id === vid).direction = direction; return c; };

// DoD 3 in Node, with §15's box cases: no two nodes overlap; no line runs through a node it does not join, through a closed
// package's tab or an open one's, or along a box's border; each box holds exactly the shown elements it owns, at any depth.
// Lines may cross: check() lists those, and they are returned
function clean(m, vid) {
  const g = layout(m, vid), bad = [], own = Object.fromEntries(m.nodes.map(n => [n.id, n.parent]));
  for (const a of g.nodes) for (const b of g.nodes) if (a.id < b.id && meets(a, b)) bad.push(`${a.id} and ${b.id} overlap`);
  const tabs = [...g.nodes.filter(n => n.shape === 'package').map(n => ({ id: n.id, x: n.tabX ?? n.x, y: n.y - 8, w: Math.min(48, Math.round(n.w * .4)), h: 8 })),
    ...g.families.map(f => ({ id: f.id, x: f.x, y: f.y, w: +/H(-?[\d.]+)V/.exec(SHAPE.package.frame(f))[1] - f.x, h: 24 }))];
  g.edges.forEach(e => e.pts.slice(1).forEach((q, k) => {
    const p = e.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }, ends = [e.from, e.to];
    g.nodes.forEach(n => { if (!ends.includes(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); });
    tabs.forEach(t => { if (!ends.includes(t.id) && meets(s, { x: t.x + 1, y: t.y + 1, w: t.w - 2, h: t.h - 2 })) bad.push(`${e.id} runs through ${t.id}'s tab`); });
    g.families.forEach(f => { // a segment on a border's line, over more than a pixel of that border
      const vert = p[0] === q[0] && Math.min(p[1], q[1]) < f.y + f.h - 1 && Math.max(p[1], q[1]) > f.y + 1, horiz = p[1] === q[1] && Math.min(p[0], q[0]) < f.x + f.w - 1 && Math.max(p[0], q[0]) > f.x + 1;
      if ((vert && [f.x, f.x + f.w].some(x => Math.abs(p[0] - x) < 1)) || (horiz && [f.y, f.y + f.h].some(y => Math.abs(p[1] - y) < 1))) bad.push(`${e.id} runs along ${f.id}'s border`); });
  }));
  const holds = (b, id) => { for (let p = own[id], seen = 0; p != null && seen < 99; p = own[p], seen++) if (p === b) return true; return false; };
  g.families.forEach(f => [...g.nodes, ...g.families].forEach(n => { if (n !== f && inside(n, f) !== holds(f.id, n.id)) bad.push(`${f.id} ${inside(n, f) ? 'covers' : 'lacks'} ${n.id}`); }));
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the minimal fixture holds every case of notes/stage-2.md §15, so it cannot be trimmed by accident', () => {
  const N = Object.fromEntries(MINIMAL.nodes.map(n => [n.id, n])), V = Object.fromEntries(MINIMAL.views.map(v => [v.id, v])), shown = new Set(V.v.nodeIds);
  const kids = id => MINIMAL.nodes.filter(n => n.parent === id), pk = n => n && n.type === 'uml.Package', depth = id => { let d = 0; for (let p = N[id].parent; p; p = N[p].parent) d++; return d; };
  assert.ok(MINIMAL.nodes.some(n => pk(n) && pk(N[n.parent])), 'a package holding a package');
  assert.ok(MINIMAL.nodes.some(n => pk(n) && shown.has(n.id) && !kids(n.id).length), 'an empty package');
  assert.ok(MINIMAL.nodes.some(n => pk(n) && shown.has(n.id) && kids(n.id).length && kids(n.id).every(k => !shown.has(k.id))), 'a package whose contents are all hidden');
  assert.ok(MINIMAL.nodes.some(n => pk(n) && kids(n.id).some(k => shown.has(k.id)) && kids(n.id).some(k => !shown.has(k.id))), 'a package with some of its contents shown');
  const E = Object.fromEntries(MINIMAL.edges.map(e => [e.id, e]));
  assert.ok(MINIMAL.edges.some(e => depth(e.from) === 3 && depth(e.to) === 0 && N[e.to].type === 'uml.Class'), 'a line from a class at depth 3 to one at depth 0');
  assert.ok(MINIMAL.edges.some(e => !pk(N[e.from]) && !pk(N[e.to]) && N[e.from].parent && N[e.from].parent === N[e.to].parent), 'a line between two classes in one box');
  assert.ok(MINIMAL.edges.some(e => e.type === 'uml.Dependency' && pk(N[e.from]) && pk(N[e.to])), 'a line between two boxes');
  assert.ok(E['sales-imports-top'] && E['top-imports-empty'] && E['wholesale-accesses-some'].props.visibility === 'private' && E['wholesale-merges-sales'].type === 'uml.PackageMerge', 'imports to an open and a closed package, an access, a merge');
  const g = layout(MINIMAL, 'v'), L = Object.fromEntries(g.nodes.map(n => [n.id, n.label]));
  assert.deepEqual([L['card-payment'], L['in-class'], L.order, L['w-order']], ['payments::card::CardPayment', 'inner::Inner', 'Order', 'Order'], 'qualified without its owners, or with one between hidden; two classes named Order');
  assert.deepEqual(layout(MINIMAL, 'payments').nodes.map(n => n.label), ['card::CardPayment', 'sales::Order'], 'a view with a subject names from it');
  assert.deepEqual(V.v.layout, { customer: [1, 1] }, 'a pinned class in a box');
  assert.deepEqual(g.nodes.filter(n => n.shape === 'package').map(n => n.id), ['empty', 'hidden'], 'two closed packages, drawn as folders');
  assert.ok(!g.edges.some(e => e.id === 'top-holds-a1'), 'a line from a package to a class it holds is not drawn');
  assert.deepEqual(layout(MINIMAL, 'boxes').families.map(f => f.id), ['sales', 'some'], 'hand-written containers are not drawn');
  assert.deepEqual(validate(MINIMAL).map(p => [p.level, p.rule, p.ids]), [['warning', 'owner-kinds', ['nested', 'root']], ['warning', 'line-inside', ['top-holds-a1', 'top', 'a1']],
    ['warning', 'own-boxes', ['boxes']]], 'a class owned by a class, the line not drawn and the containers ignored, each warned of; no error');
});

test('the minimal fixture lays out clean in every view, right and down: no overlap, no line through a node, a tab or along a border; boxes hold exactly their own', () => {
  for (const v of MINIMAL.views) for (const direction of ['down', 'right']) {
    const r = clean(turned(MINIMAL, v.id, direction), v.id), tag = `${v.id}, ${direction}`;
    assert.deepEqual([r.bad, r.others, r.crossings], [[], [], []], tag);
  }
  const g = layout(MINIMAL, 'v'), F = Object.fromEntries(g.families.map(f => [f.id, f]));
  assert.ok(inside(F.deep, F.mid) && inside(F.mid, F.top) && inside(g.byId.leaf, F.deep) && !inside(g.byId.root, F.top), 'three levels, the class at depth 3 inside all three');
  assert.ok(inside(g.byId.customer, F.sales), 'the pinned class stays in its box');
  assert.ok(g.edges.find(e => e.id === 'leaf-to-root'), 'the line from depth 3 to depth 0 is drawn');
});

test('the stress fixture: 50 nodes over three levels of packages and 60 lines, with closed packages, imports, an access and a merge; no error', () => {
  const N = Object.fromEntries(STRESS.nodes.map(n => [n.id, n])), depth = id => { let d = 0; for (let p = N[id].parent; p; p = N[p].parent) d++; return d; };
  const g = layout(STRESS, 'all');
  assert.equal(g.nodes.length, 50, 'P1: a full layout of 50 nodes, its open packages aside');
  assert.equal(STRESS.edges.length, 60); assert.equal(g.edges.length, 60, 'every line drawn');
  assert.equal(Math.max(...g.families.map(f => depth(f.id))), 2, 'packages over three levels');
  assert.ok(g.nodes.some(n => depth(n.id) === 3), 'a class at depth 3');
  assert.ok(g.nodes.filter(n => n.shape === 'package').length >= 2, 'closed packages');
  assert.ok(['uml.PackageImport', 'uml.PackageMerge'].every(t => STRESS.edges.some(e => e.type === t)) && STRESS.edges.some(e => e.props && e.props.visibility === 'private'));
  assert.deepEqual(validate(STRESS), []);
});

test('the stress fixture lays out clean, right and down; its crossings are the ones the conformance note states', () => {
  // the counts docs/conformance/uml-package.md and risks.md L4 state: a change of layout that moves them updates both
  const want = { down: 0, right: 1 };
  for (const direction of ['down', 'right']) {
    const r = clean(turned(STRESS, 'all', direction), 'all');
    assert.deepEqual(r.bad, [], direction);
    assert.deepEqual(r.others, [], `${direction}: check() finds nothing but lines that cross`);
    console.log(`# all, ${direction}: ${r.g.nodes.length} nodes, ${r.g.families.length} boxes, ${r.g.edges.length} lines, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, want[direction], `${direction}: the crossings the conformance note states`);
  }
});

test('performance (risks.md P1): the stress fixture lays out in under 1 s, and an edit that moves nothing is laid out and drawn (SVG markup) in under 100 ms', () => {
  const runs = [], id = STRESS.nodes.find(n => n.label === 'Book').id;
  for (let i = 0; i < 3; i++) { // the first run is cold (the JIT warms up on it); a page lays out warm after its first draw
    const memos = {}, t0 = performance.now(); mapContext(STRESS, { memos }).buildGeo('all'); const full = performance.now() - t0;
    const t1 = performance.now(), out = mapContext(apply(STRESS, [{ op: 'set', id, path: 'label', value: 'Tome' }]), { memos }).buildView('all').markup; const paint = performance.now() - t1;
    assert.ok(out.includes('>Tome<'), 'the markup holds the edit');
    assert.equal(memos.all.runs, 1, 'a rename to a name of the same width laid out nothing again');
    runs.push({ full, paint });
  }
  const best = k => Math.min(...runs.map(r => r[k]));
  console.log(`# ${STRESS.views[0].nodeIds.length} elements, ${STRESS.edges.length} lines: full layout ${runs.map(r => Math.round(r.full)).join(', ')} ms; an edit that moves nothing, laid out and drawn ${runs.map(r => r.paint.toFixed(1)).join(', ')} ms`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('paint') < 100, `an edit that moves nothing ${best('paint')} ms`);
});

test('DoD 1: the registry holds both types, and the JSON Schema and the types name their vocabulary', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema).$defs;
  for (const name of ['uml.object', 'uml.package']) {
    const T = diagramOf({ diagram: name });
    assert.equal(T && T.name, name);
    assert.ok(S.view.properties.diagram.examples.includes(name), `the schema's view.diagram names ${name}`);
    for (const t of [...T.elements, ...T.lines].map(x => x.type)) assert.ok(schema.includes(t) && dts.includes(`'${t}'`), `${name}: ${t}`);
    for (const [t, fields] of Object.entries(T.props)) for (const f of fields) assert.ok(schema.includes(`"${f.key.split('.')[0]}"`), `${name}: ${t}'s ${f.key} in the schema`);
  }
  assert.ok(S.node.properties.members.anyOf[0].items.anyOf[0].properties.props.anyOf[0].properties.value, "a slot's value");
  assert.ok(['UmlObjectElementType', 'UmlSlotProps', 'UmlLinkProps', 'UmlPackageLineType', 'UmlPackageImportProps'].every(k => dts.includes(`export ${k.endsWith('Props') ? 'interface' : 'type'} ${k} `)));
});
