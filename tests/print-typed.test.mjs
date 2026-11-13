// The PDF's tables per type (work package 4.9, notes/stage-4.md §15, R9): a type's `word(model, id)` is an element's kind
// and its `rows(model, view, id)` what is listed in place of its members; a typed view's first table is headed "Elements".
// Imports src/ to reach print.js's tables (tablesOf), which printDoc pours into the PDF's columns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerDiagramType } from '../src/core/registry.js';
import '../src/map/typed.js';
import '../src/uml/class.js';
import '../src/uml/object.js';
import '../src/uml/package.js';
import { mapContext } from '../src/map/context.js';
import { tablesOf } from '../src/page/print.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const NONE = { nodes: [], edges: [] }; // the geometry the tables read: steps and opened views of cards, kinds of map lines
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
  'sales-classes.json': 'c2f9bf731cb7392c', 'order-objects.json': '377e5f3b2a3538c4', 'bookshop-packages.json': '61f60b0985090f3d', // 6.7: the profile's row and its application's
};

test('maps\' tables are unchanged; a class, object or package view\'s are unchanged but for the heading, "Elements"', () => {
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
