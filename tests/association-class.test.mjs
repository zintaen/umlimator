// Association classes on the class view (UML 2.5.1 11.5.4): a uml.Class whose props.associationClass is a uml.Association's
// id is drawn joined to the middle of that association's line by a dashed line; the rule association-class, describe(),
// the accessible names, the PDF's Kind, the Mermaid writer and the properties form's field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf } from '../src/core/registry.js';
import '../src/map/typed.js';
import '../src/uml/class.js';
import '../src/uml/package.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { writeMermaidClass } from '../src/readers/mermaid-class.js';

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
