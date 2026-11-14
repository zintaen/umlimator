// The PDF's tables per type (work package 4.9, notes/stage-4.md §15, R9): a type's `word(model, id)` is an element's kind
// and its `rows(model, view, id)` what is listed in place of its members; a typed view's first table is headed "Elements".
// Imports src/ to reach print.js's tables (tablesOf), which printDoc pours into the PDF's columns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { registerDiagramType } from '../src/core/registry.js';
import '../src/map/typed.js';
import '../src/uml/class.js';
import '../src/uml/object.js';
import '../src/uml/package.js';
import '../src/uml/deployment.js';
import { layout } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { tablesOf } from '../src/page/print.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const NONE = { nodes: [], edges: ['go', 'back', 'none'].map(_id => ({ _id })) }; // the geometry the tables read: steps and opened views of cards, the lines drawn and their kinds
const cells = row => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);

const seen = [];
registerDiagramType('test.print', {
  word: (model, id) => model.nodes.find(n => n.id === id).props?.kind, // none: the type word, as before
  rows: (model, view, id) => { seen.push([model.title, view.id, id]); const r = { plain: undefined, empty: [], nil: null, text: 'not a list' }; return id in r ? r[id] : ['entry / reserve the books', 'in <Warehouse>']; }, // all but a list: the members
});
const M = { schemaVersion: 2, title: 'print test',
  nodes: [{ id: 'placed', type: 'test.State', label: 'Placed', props: { kind: 'Initial pseudostate' }, members: [{ id: 'placed.r', type: 'test.Region', label: 'never listed' }] },
    ...['plain', 'empty', 'nil', 'text'].map(id => ({ id, type: 'test.State', label: id, members: [{ id: id + '.r', type: 'test.Region', label: 'its member' }] }))],
  edges: [{ id: 'go', type: 'test.Transition', from: 'placed', to: 'plain', label: 'pay' }],
  views: [{ id: 'sm', diagram: 'test.print', nodeIds: ['placed', 'plain', 'empty', 'nil', 'text'], edges: ['go'] }] };

test('a type\'s word and rows: the element\'s kind and what is listed for it, escaped; with none, the type word and its members', () => {
  const ctx = mapContext(M), [els, lines] = tablesOf(ctx, ctx.V.sm, NONE);
  assert.match(els.title, /^Elements <span>5<\/span>$/);
  assert.equal(els.head, '<th>Card</th><th>Kind</th><th>Members</th>'); // the header row as R8's, which tests/cli.py reads
  assert.deepEqual(els.rows.map(cells), [['<b>Placed</b>', 'Initial pseudostate', '<p>entry / reserve the books</p><p>in &lt;Warehouse&gt;</p>'],
    ['<b>plain</b>', 'State', '<p>its member</p>'], ['<b>empty</b>', 'State', ''], ['<b>nil</b>', 'State', '<p>its member</p>'], ['<b>text</b>', 'State', '<p>its member</p>']]);
  assert.deepEqual(seen, ['placed', 'plain', 'empty', 'nil', 'text'].map(id => ['print test', 'sm', id])); // the model, the view and the element's id
  assert.deepEqual(lines.rows.map(cells), [['<i class="w" style="border-color:var(--um-w-calls)"></i>Placed → plain', 'pay', 'Transition']]);
});

// What printDoc listed before 4.9, for the examples drawn today: pinned as one hash a file over its views' tables, those
// of a typed view with their old heading, "Cards". A change to one of these examples or to the tables changes its hash.
const PINNED = {
  'bookshop.json': 'ba6d7e080f9e1964', 'bike-share.json': '40954b2d102fae0b', 'clinic.json': 'a8cdb971d5d07425', 'monorepo.json': '4e2638724ead87d6', 'weather.json': 'c9ada5f273e01b0c', 'assistant.json': '9196bd5b01316ce2', 'shapes.json': '49fdf9fb182b383b', 'states.json': '5fe79fd4bd3d4b2f',
  'sales-classes.json': 'cea8962c5cc55d53', 'order-objects.json': '67b4d8e36a4b59c5', 'bookshop-packages.json': '61f60b0985090f3d', // 6.7: the profile's row and its application's
}; // audit 1: a typed view's element by its drawn name (catalog::Book, ada : Customer), so sales-classes and order-objects changed

test('a typed view\'s tables name each element as drawn: two Order classes shown without their packages are sales::Order and wholesale::Order (audit 1)', () => {
  const m = read('../examples/bookshop-packages.json'), ids = m.nodes.filter(n => n.label === 'Order').map(n => n.id);
  m.views.push({ id: 'two', diagram: 'uml.package', nodeIds: ids });
  const ctx = mapContext(m), names = tablesOf(ctx, ctx.V.two, ctx.buildGeo('two'))[0].rows.map(r => /<b>(.*?)<\/b>/.exec(r)[1]);
  assert.deepEqual(names.sort(), ['sales::Order', 'wholesale::Order']);
});

test('maps\' tables are unchanged; a class, object or package view\'s are unchanged but for the heading, "Elements", and drawn names', () => {
  const got = {};
  for (const f of Object.keys(PINNED)) {
    const ctx = mapContext(read('../examples/' + f)), all = ctx.views.map(v => {
      const ts = tablesOf(ctx, v, ctx.buildGeo(v.id)), typed = (v.diagram ?? 'map') !== 'map';
      assert.match(ts[0].title, typed ? /^Elements / : /^Cards /, `${f} ${v.id}`);
      return ts.filter(t => t.rows.length).map(t => ({ ...t, title: t.title.replace(/^Elements /, 'Cards ') })); // as printDoc pours them
    });
    got[f] = createHash('sha256').update(JSON.stringify(all)).digest('hex').slice(0, 16);
  }
  assert.deepEqual(got, PINNED);
});

// The lines table (milestone 2 §9, S17): a type's text(model, view, id) is what a line says, shown before its label
const said = [];
registerDiagramType('test.printtext', { text: (model, view, id) => { said.push([model.title, view.id, id]); return { go: 'conveys <Order>', back: '' }[id]; } });
test('a type\'s text is a line\'s Label cell, escaped; with none from it, the line\'s label; a type without text shows label', () => {
  const m = structuredClone(M); m.edges.push({ id: 'back', type: 'test.Transition', from: 'plain', to: 'placed', label: 'refund' }, { id: 'none', type: 'test.Transition', from: 'empty', to: 'nil', label: 'ship' });
  m.views[0].edges.push('back', 'none'); m.views.push({ ...m.views[0], id: 'sm2', diagram: 'test.printtext' });
  const ctx = mapContext(m), label = v => tablesOf(ctx, ctx.V[v], NONE)[1].rows.map(r => cells(r)[1]);
  assert.deepEqual(label('sm2'), ['conveys &lt;Order&gt;', 'refund', 'ship']);
  assert.deepEqual(said, [['print test', 'sm2', 'go'], ['print test', 'sm2', 'back'], ['print test', 'sm2', 'none']]);
  assert.deepEqual(label('sm'), ['pay', 'refund', 'ship']); // test.print gives no text
});

test('no conformance note says a typed view\'s table heading reads "Cards": it reads "Elements" (audit 1)', () => {
  const dir = new URL('../docs/conformance/', import.meta.url);
  const stale = readdirSync(dir).filter(f => /heading (still )?says "Cards"/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(stale, []);
});

test('a typed view\'s Lines table lists the lines its type draws, not every model line between its elements (audit 2)', () => {
  const C = (id, label, more = {}) => ({ id, type: 'uml.Class', label, ...more });
  for (const m of [
    { schemaVersion: 2, nodes: [C('a', 'A'), C('b', 'B')], edges: [{ id: 'x', type: 'uml.Association', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['a', 'b'] }] },
    { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: 'p' }, C('a', 'A', { parent: 'p' })], edges: [{ id: 'x', type: 'uml.Dependency', from: 'p', to: 'a' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['p', 'a'] }] },
    { schemaVersion: 2, nodes: [C('a', 'A'), C('b', 'B'), { id: 'o', type: 'uml.InstanceSpecification', label: 'o', props: { classifier: 'A' } }], edges: [{ id: 'x', type: 'uml.Association', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'uml.object', nodeIds: ['a', 'b', 'o'] }] },
    { schemaVersion: 2, nodes: [{ id: 'n', type: 'uml.Node', label: 'Server' }, { id: 'j', type: 'uml.Artifact', label: 'app.jar', parent: 'n' }], edges: [{ id: 'x', type: 'uml.Deployment', from: 'j', to: 'n' }], views: [{ id: 'v', diagram: 'uml.deployment', nodeIds: ['n', 'j'] }] }]) {
    const g = layout(m, 'v'), ctx = mapContext(m);
    assert.deepEqual(g.edges, [], m.views[0].diagram);
    assert.deepEqual(tablesOf(ctx, ctx.V.v, g)[1].rows, [], m.views[0].diagram);
  }
});

test('no conformance note says Tab stops on a box: a box is reached through the outline of elements, as in the package note (audit 2)', () => {
  const dir = new URL('../docs/conformance/', import.meta.url);
  const stale = readdirSync(dir).filter(f => /Tab\s+reads\s+(each box and|a box,|the subject and|the actors, then each subject and)/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(stale, []);
});
