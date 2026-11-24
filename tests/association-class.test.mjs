// Association classes on the class view (UML 2.5.1 11.5.4): a uml.Class whose props.associationClass is a uml.Association's
// id is drawn joined to the middle of that association's line by a dashed line; the rule association-class, describe(),
// the accessible names, the PDF's Kind, the Mermaid writer and the properties form's field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import '../src/map/typed.js';
import * as classTies from '../src/uml/class.js';
import '../src/uml/package.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { writeMermaidClass } from '../src/readers/mermaid-class.js';
import { apply } from '../src/core/apply.js';
import { diff } from '../src/map/diff.js';

const model = (props = { associationClass: 'works' }, more = {}) => ({ schemaVersion: 2,
  nodes: [{ id: 'person', type: 'uml.Class', label: 'Person' }, { id: 'company', type: 'uml.Class', label: 'Company' },
    { id: 'job', type: 'uml.Class', label: 'Job', props, members: [{ id: 'job.salary', type: 'uml.Property', label: 'salary', props: { valueType: 'Money' } }] }],
  edges: [{ id: 'works', type: 'uml.Association', from: 'person', to: 'company', label: 'works for', props: { ends: { from: { role: 'employee', multiplicity: '*' }, to: { role: 'employer', multiplicity: '0..1' } } } }],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['person', 'company', 'job'] }, { id: 'd', diagram: 'uml.class', direction: 'down', nodeIds: ['person', 'company', 'job'] }], ...more });

// the point at which a polyline passes through p, or false
const onLine = (pts, [x, y]) => pts.slice(1).some((b, i) => { const a = pts[i]; return Math.min(a[0], b[0]) - 0.01 <= x && x <= Math.max(a[0], b[0]) + 0.01 && Math.min(a[1], b[1]) - 0.01 <= y && y <= Math.max(a[1], b[1]) + 0.01 && (a[0] === b[0] ? Math.abs(x - a[0]) < 0.01 : Math.abs(y - a[1]) < 0.01); });
const len = pts => pts.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]), 0);
const onBorder = (n, [x, y]) => ((Math.abs(x - n.x) < 0.01 || Math.abs(x - n.x - n.w) < 0.01) && y >= n.y && y <= n.y + n.h) || ((Math.abs(y - n.y) < 0.01 || Math.abs(y - n.y - n.h) < 0.01) && x >= n.x && x <= n.x + n.w);

test('the class view draws an association class joined to the middle of its association\'s line by a dashed line, laid out right and down', () => {
  const m = model();
  for (const v of ['v', 'd']) {
    const g = layout(m, v), job = g.nodes.find(n => n.id === 'job'), works = g.edges.find(e => e.id === 'works'), tie = g.edges.find(e => e.id === 'association-class:job');
    assert.ok(tie, `${v}: the tie is drawn`);
    assert.equal(tie.type, 'tie.AssociationClass');
    assert.deepEqual(tie.end, { from: 'none', to: 'none', dashed: true }, 'dashed, with no arrowhead');
    assert.ok(onBorder(job, tie.pts[0]), `${v}: it leaves the class box's border`);
    assert.ok(onLine(works.pts, tie.pts.at(-1)), `${v}: it ends on the association's line`);
    // at the middle of the line, moved along it just past its label when the label sits there
    const L = works.lbl, at = tie.pts.at(-1), past = L && [L.x - 6, L.x + L.w + 6, L.y - 6, L.y + L.h + 6].some(k => [at[0], at[1]].includes(k));
    assert.ok(past, `${v}: just past the label "works for", which sits on the middle`);
    const bare = model(); delete bare.edges[0].label; const g2 = layout(bare, v), w2 = g2.edges.find(e => e.id === 'works'), at2 = g2.edges.find(e => e.id === 'association-class:job').pts.at(-1);
    const fromStart = (() => { let run = 0; for (let i = 1; i < w2.pts.length; i++) { const [a, b] = [w2.pts[i - 1], w2.pts[i]];
      if (onLine([a, b], at2)) return run + Math.hypot(at2[0] - a[0], at2[1] - a[1]); run += Math.hypot(b[0] - a[0], b[1] - a[1]); } return -1; })();
    assert.ok(Math.abs(fromStart - len(w2.pts) / 2) < 0.5, `${v}: with no label, at the line's middle (${fromStart} of ${len(w2.pts)})`);
    assert.equal(tie._id, undefined, 'no model element: no Ref names it');
    assert.ok(!g.order.includes(tie.id), 'Tab reaches the class and the association, not the tie');
    assert.ok(g.legend.some(x => x.includes('<b>Association class</b>') && x.includes('stroke-dasharray')), 'the legend says it, dashed');
    assert.ok(!g.legend.some(x => x.includes('<b>Line</b>')), 'and draws no "Line" key for it');
    assert.equal(job.aria, 'Class Job, 1 attribute, 0 operations, the association class of the Association from Person (employee, *) to Company (employer, 0..1): works for');
    assert.equal(tie.aria, 'Association class Job of the Association from Person (employee, *) to Company (employer, 0..1): works for');
    assert.deepEqual(check(m, v), [], `${v}: the check is clean`);
  }
  assert.deepEqual(validate(m), [], 'the model breaks no rule');
});

test('no tie without the field, for a class at an end of its association, for a second class of one association, or for a loop', () => {
  const tie = (m, v = 'v') => layout(m, v).edges.filter(e => e.type === 'tie.AssociationClass').map(e => e.id);
  assert.deepEqual(tie(model({})), []);
  const end = model(); end.edges[0].to = 'job';
  assert.deepEqual(tie(end), [], 'an end of its own association');
  const two = model(); two.nodes.push({ id: 'role', type: 'uml.Class', label: 'Role', props: { associationClass: 'works' } }); two.views[0].nodeIds.push('role');
  assert.deepEqual(tie(two), ['association-class:job'], 'the first class the view shows draws the tie');
  const loop = model(); loop.edges[0].to = 'person';
  assert.deepEqual(tie(loop), []);
});

test('rule association-class: errors on a class naming no association, of another kind, an end of its own, or one another class names; warnings when a view draws one without the other', () => {
  const said = m => validate(m).filter(p => p.rule === 'association-class').map(p => [p.level, p.path, p.message]);
  const kind = model({ associationClass: 'works' }); kind.nodes[2].type = 'uml.Interface';
  assert.deepEqual(said(kind), [['error', 'nodes[2].props.associationClass', 'association-class: "Job" is an interface: only a class is an association class']]);
  assert.deepEqual(said(model({ associationClass: 'nope' })), [['error', 'nodes[2].props.associationClass', 'association-class: "Job" names "nope", which is not in the model']]);
  assert.deepEqual(said(model({ associationClass: 7 })), [['error', 'nodes[2].props.associationClass', 'association-class: "Job" names 7, which is not an association\'s id']]);
  const dep = model(); dep.edges[0].type = 'uml.Dependency';
  assert.deepEqual(said(dep), [['error', 'nodes[2].props.associationClass', 'association-class: "Job" names "works for", which is a dependency, not an association']]);
  const end = model(); end.edges[0].to = 'job';
  assert.deepEqual(said(end), [['error', 'nodes[2].props.associationClass', 'association-class: "Job" is an end of its own association works']]);
  const two = model(); two.nodes.push({ id: 'role', type: 'uml.Class', label: 'Role', props: { associationClass: 'works' } });
  assert.deepEqual(said(two), [['error', 'nodes[3].props.associationClass', 'association-class: "Role" and "Job" both name association works, which has one class']]);
  const alone = model(); alone.views = [{ id: 'v', diagram: 'uml.class', nodeIds: ['job', 'person'] }];
  assert.deepEqual(said(alone), [['warning', 'nodes[2].props.associationClass', 'association-class: view "v" shows "Job" but does not draw its association works']]);
  const bare = model(); bare.views = [{ id: 'v', diagram: 'uml.class', nodeIds: ['person', 'company'] }];
  assert.deepEqual(said(bare), [['warning', 'views[0].nodeIds', 'association-class: view "v" draws association works but does not show its class "Job"']]);
  const loop = model(); loop.edges[0].to = 'person';
  assert.deepEqual(said(loop).map(p => p[0]), ['warning', 'warning'], 'a loop: drawn with no tie, in each view');
  assert.ok(diagramOf({ diagram: 'uml.class' }).rules['association-class']);
});

test('describe() says the association class with its association, and the association through its class', () => {
  const d = describe(model(), 'v').split('\n');
  assert.ok(d.includes('Class Person, 0 attributes, 0 operations; associated with Company (employer, 0..1) ("works for") through Job.'), d.join('\n'));
  assert.ok(d.includes('Class Job, 1 attribute, 0 operations; the association class of the association between Person and Company ("works for").'), d.join('\n'));
  assert.ok(!describe(model({}), 'v').includes('through'), 'not without the field');
});

test('the PDF\'s Kind column says an association class; the Mermaid writer says the tie it cannot write', () => {
  const m = model(), ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'));
  assert.match(els.rows.find(r => r.includes('<b>Job</b>')), /<td>Association class<\/td>/);
  assert.match(els.rows.find(r => r.includes('<b>Person</b>')), /<td>Class<\/td>/);
  const text = writeMermaidClass(m, 'v');
  assert.match(text, /%% not written: job: association class of works, which Mermaid has no notation for: the class and the association are written apart/);
  assert.doesNotMatch(text, /property associationClass/, 'said once');
  assert.match(text, /person "employee \*" -- "employer 0\.\.1" company : works for/);
});

test('the properties form: "Association class of" on a class, which takes an association\'s id or its one name, and refuses anything else', () => {
  const T = diagramOf({ diagram: 'uml.class' }), m = model({}), field = T.edits.field;
  assert.deepEqual(T.props['uml.Class'].map(f => f.key), ['isAbstract', 'stereotypes', 'associationClass']);
  assert.ok(!diagramOf({ diagram: 'uml.package' }).props['uml.Class'].some(f => f.key === 'associationClass'), 'on the class view alone, which draws it');
  assert.deepEqual(field(m, m.views[0], 'job', 'props.associationClass', 'works for'), [{ op: 'set', id: 'job', path: 'props.associationClass', value: 'works' }]);
  assert.deepEqual(field(m, m.views[0], 'job', 'props.associationClass', ' works '), [{ op: 'set', id: 'job', path: 'props.associationClass', value: 'works' }]);
  assert.match(field(m, m.views[0], 'job', 'props.associationClass', 'nope').error, /^association-class: no association/);
  assert.match(field(m, m.views[0], 'person', 'props.associationClass', 'works').error, /an end of/);
  assert.equal(field(m, m.views[0], 'job', 'props.associationClass', undefined), null, 'emptied: the panel\'s own set');
  assert.equal(field(m, m.views[0], 'job', 'label', 'Jobs'), null, 'another field: the panel\'s own set');
});

// a tie's path: out of its class box's border, onto its association's line, and through no other card (its association's
// ends included, which check() does not weigh it against), no label, and along no box's border
const tieClear = (g, tie, where) => {
  const c = g.nodes.find(n => `association-class:${n.id}` === tie.id), a = g.edges.find(e => e.id === tie.tie), P = tie.pts;
  assert.ok(onBorder(c, P[0]), `${where}: ${tie.id} leaves its class box's border`);
  assert.ok(onLine(a.pts, P.at(-1)), `${where}: ${tie.id} ends on its association's line`);
  const segs = P.slice(1).map((q, i) => [P[i], q]), inR = ([p, q], r) => Math.max(p[0], q[0]) > r.x && Math.min(p[0], q[0]) < r.x + r.w && Math.max(p[1], q[1]) > r.y && Math.min(p[1], q[1]) < r.y + r.h;
  g.nodes.forEach(n => assert.ok(n === c || !segs.some(s => inR(s, n)), `${where}: ${tie.id} ${JSON.stringify(P)} passes through card ${n.id}`));
  g.edges.forEach(e => assert.ok(!e.lbl || !segs.some(s => inR(s, e.lbl)), `${where}: ${tie.id} lies on the label of ${e.id}`));
};

test('two association classes on one class (Person with Job and Assignment): each dashed line runs clear of the cards, the lines and the labels, laid out right and down (audit 65)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'person', type: 'uml.Class', label: 'Person' }, { id: 'company', type: 'uml.Class', label: 'Company' }, { id: 'project', type: 'uml.Class', label: 'Project' },
    { id: 'job', type: 'uml.Class', label: 'Job', props: { associationClass: 'works' } }, { id: 'assignment', type: 'uml.Class', label: 'Assignment', props: { associationClass: 'staffs' } }],
  edges: [{ id: 'works', type: 'uml.Association', from: 'person', to: 'company', label: 'works for' }, { id: 'staffs', type: 'uml.Association', from: 'person', to: 'project', label: 'staffs' }],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['person', 'company', 'project', 'job', 'assignment'] }, { id: 'd', diagram: 'uml.class', direction: 'down', nodeIds: ['person', 'company', 'project', 'job', 'assignment'] }] };
  for (const v of ['v', 'd']) {
    const g = layout(m, v), ties = g.edges.filter(e => e.type === 'tie.AssociationClass');
    assert.deepEqual(ties.map(t => t.id), ['association-class:job', 'association-class:assignment'], v);
    ties.forEach(t => tieClear(g, t, v));
    assert.deepEqual(check(m, v).map(x => x.message), [], `${v}: the check is clean`);
  }
  // one association class alone still meets its line at the middle, past the label (the first test): nothing in its way
  const one = model(), g = layout(one, 'v'), tie = g.edges.find(e => e.id === 'association-class:job');
  tieClear(g, tie, 'one');
});

test('an association class in a package beside one end of its association: its dashed line runs along no border of the package, laid out down and right (audit 65)', () => {
  const m = dir => ({ schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: 'P' }, { id: 'q', type: 'uml.Package', label: 'Q' },
    { id: 'a', type: 'uml.Class', label: 'A', parent: 'p' }, { id: 'c', type: 'uml.Class', label: 'C', parent: 'p', props: { associationClass: 'ab' } },
    { id: 'b', type: 'uml.Class', label: 'B', parent: 'q' }, { id: 'z', type: 'uml.Class', label: 'Z', parent: 'q' }],
  edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b', label: 'x' }],
  views: [{ id: 'w', diagram: 'uml.class', direction: dir, nodeIds: ['p', 'q', 'a', 'b', 'c', 'z'] }] });
  for (const dir of ['down', 'right']) {
    const g = layout(m(dir), 'w'), tie = g.edges.find(e => e.id === 'association-class:c');
    tieClear(g, tie, dir);
    g.families.forEach(f => tie.pts.slice(1).forEach((q, i) => { const p = tie.pts[i], v = p[0] === q[0], k = v ? 0 : 1;
      const lo = Math.max(Math.min(p[1 - k], q[1 - k]), v ? f.y : f.x), hi = Math.min(Math.max(p[1 - k], q[1 - k]), v ? f.y + f.h : f.x + f.w);
      assert.ok(!(hi - lo > 4 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(p[k] - u) < 8)), `${dir}: ${JSON.stringify(tie.pts)} runs along a border of ${f.id}`); }));
    assert.deepEqual(check(m(dir), 'w').map(x => x.message), [], `${dir}: the check is clean`);
  }
});

test('deleting an association leaves its class a plain class: no associationClass, no rule broken; a diff draws the deleted line with its class (audit 65)', () => {
  const m = model(), m2 = apply(m, [{ op: 'delete', id: 'works' }]);
  assert.deepEqual(m2.nodes.find(n => n.id === 'job').props, {});
  assert.deepEqual(validate(m2), []);
  assert.deepEqual(layout(m2, 'v').edges, []);
  // a class of no type, which the class view draws as a class
  const u = model(); delete u.nodes[2].type; const u2 = apply(u, [{ op: 'delete', id: 'works' }]);
  assert.deepEqual(u2.nodes.find(n => n.id === 'job').props, {});
  assert.deepEqual(validate(u2).filter(p => p.rule === 'association-class'), []);
  // deleting the class's end takes the association and so the field
  const e2 = apply(model(), [{ op: 'delete', id: 'company' }]);
  assert.equal(e2.nodes.find(n => n.id === 'job').props.associationClass, undefined);
  // the diff: the deleted association comes back with its class tied to it, the class marked changed
  const d = diff(m, m2).model;
  assert.equal(d.nodes.find(n => n.id === 'job').props.associationClass, 'works');
  assert.deepEqual(layout(d, 'v').edges.map(e => e.id), ['works', 'association-class:job']);
  assert.equal(d.nodes.find(n => n.id === 'job').change, 'changed');
});

test('an association a view holds as its own line: drawn with its class, and the rule and the panel field take it as the view does (audit 65)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }, { id: 'c', type: 'uml.Class', label: 'C', props: { associationClass: 'ab' } }], edges: [],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'c'], edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b', label: 'x' }] }] };
  assert.deepEqual(layout(m, 'v').edges.map(e => e.id), ['ab', 'association-class:c']);
  assert.deepEqual(validate(m), []);
  const field = diagramOf({ diagram: 'uml.class' }).edits.field;
  assert.deepEqual(field(m, m.views[0], 'c', 'props.associationClass', 'x'), [{ op: 'set', id: 'c', path: 'props.associationClass', value: 'ab' }]);
  // another class view, which does not hold it: shows the class without its association, a warning, not an error
  m.views.push({ id: 'w', diagram: 'uml.class', nodeIds: ['a', 'b', 'c'] });
  assert.deepEqual(validate(m).map(p => p.level + ' ' + p.message), ['warning association-class: view "w" shows "C" but does not draw its association ab']);
  assert.match(field(m, m.views[1], 'c', 'props.associationClass', 'x').error, /^association-class: no association/);
});

// the tie's way round is bounded (audit 65 review): its grid is at most TIE_CELLS cells, and a layout's ties share TIE_WORK
// of work; past either a tie is drawn its fixed way, as before audit 65. A view as the layout draws a large one: n associations
// down the page, their classes in a column below them all, so each tie's way round spans the view
const stacked = n => { const nodes = [], edges = [];
  for (let i = 0; i < n; i++) { const y = i * 100; nodes.push({ id: 'a' + i, x: 0, y, w: 96, h: 48 }, { id: 'b' + i, x: 228, y, w: 96, h: 48 });
    edges.push({ id: 'e' + i, pts: [[96, y + 24], [228, y + 24]], lbl: { x: 140, y: y + 6, w: 40, h: 14 } }); }
  for (let i = 0; i < n; i++) { const c = { id: 'c' + i, x: 0, y: n * 100 + i * 70, w: 96, h: 48 }; nodes.push(c); edges.push({ id: 'association-class:c' + i, type: 'tie.AssociationClass', tie: 'e' + i, t: c }); }
  return { nodes, edges, bounds: { x: -50, y: -50, w: 500, h: n * 170 + 100 } }; };
const tieEnds = (g, where) => g.edges.filter(e => e.type === 'tie.AssociationClass').forEach(t => { const a = g.edges.find(e => e.id === t.tie);
  assert.ok(onBorder(t.t, t.pts[0]), `${where}: ${t.id} leaves its class box's border`); assert.ok(onLine(a.pts, t.pts.at(-1)), `${where}: ${t.id} ends on its association's line`); });

test('the ties of a large class view: drawing them at twice the size takes at most a small multiple of the time, each still from its box to its line (timed, audit 65 review)', () => {
  const tieDraw = classTies.tieDraw, time = n => { let best = Infinity; for (let r = 0; r < 3; r++) { const g = stacked(n), t = performance.now(); tieDraw(g); best = Math.min(best, performance.now() - t); tieEnds(g, `${n}`); } return best; };
  time(10); // warm
  const t1 = time(50), t2 = time(100);
  assert.ok(t2 <= 3 * t1 + 20, `100 associations took ${t2.toFixed(0)} ms, 50 took ${t1.toFixed(0)} ms: more than 3 times`);
  // past the work, a tie is drawn its fixed way: the same as with no work at all
  const g = stacked(100), fixed = stacked(100), b = { left: classTies.TIE_WORK }; tieDraw(g, b); tieDraw(fixed, { left: 0 });
  assert.ok(b.left <= 0, 'the work ran out');
  const last = id => g.edges.find(e => e.id === id).pts, fix = id => fixed.edges.find(e => e.id === id).pts;
  assert.deepEqual(last('association-class:c99'), fix('association-class:c99'));
  assert.notDeepEqual(last('association-class:c0'), fix('association-class:c0'), 'the first ties, before it ran out, go round');
});

test('a huge class view: a tie whose way round would pass TIE_CELLS is drawn its fixed way, without a throw (audit 65 review)', () => {
  // 90,000 cards with room between them, the class among them and its association round the field's top and right
  const field = () => { const nodes = [], k = 300;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) nodes.push({ id: `n${i}_${j}`, x: 40 + i * 60, y: 40 + j * 50, w: 20, h: 14 });
    const S = 40 + k * 60, c = { id: 'c', x: 40 + 60 * 150 + 24, y: 40 + 50 * 150 + 2, w: 12, h: 10 }; nodes.push(c);
    return { nodes, edges: [{ id: 'a', pts: [[10, 20], [S, 20], [S, S]], lbl: { x: 100, y: 5, w: 30, h: 10 } }, { id: 'association-class:c', type: 'tie.AssociationClass', tie: 'a', t: c }], bounds: { x: 0, y: 0, w: S + 200, h: S + 200 } }; };
  const g = field(), fixed = field(), b = { left: classTies.TIE_WORK };
  assert.doesNotThrow(() => classTies.tieDraw(g, b));
  classTies.tieDraw(fixed, { left: 0 });
  assert.ok(b.left > 0, 'the cells, not the work, stopped it');
  assert.deepEqual(g.edges[1].pts, fixed.edges[1].pts);
  tieEnds(g, 'huge');
});

test('check.mjs: a type that declares some refs keeps the hand list\'s checks of the fields it does not declare (class, sequence, BPMN; audit 65)', async () => {
  const { check } = await import('../docs/diagrams/examples/check.mjs');
  const read = f => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
  for (const [f, d] of [['uml-class.json', 'uml.class'], ['mcp-sequence.json', 'uml.sequence'], ['bookshop-order-to-shipment.json', 'bpmn']]) {
    const m = read(f); assert.deepEqual(check(m, d), [], f);
    const x = [...m.nodes, ...m.edges].find(n => n && n.type); x.props = { ...x.props, references: 'nope' };
    assert.ok(check(m, d).includes(`${x.id}.props.references: "nope" is not an element`), `${f}: ${check(m, d)}`);
  }
  // a declared field still checked by its declaration: a class's association class, of type uml.Class and of no type
  const m = read('uml-class.json'), c = m.nodes.find(n => n.type === 'uml.Class'); c.props = { ...c.props, associationClass: 'nope' };
  assert.ok(check(m, 'uml.class').includes(`${c.id}.props.associationClass: "nope" is not an element`));
  delete c.type; assert.ok(check(m, 'uml.class').includes(`${c.id}.props.associationClass: "nope" is not an element`));
});
