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
// every other type too, for bike-share's typed views (step 3 of the one-model plan)
import '../src/typed/layout.js';
import '../src/typed/draw.js';
import '../src/uml/sequence.js';
import '../src/uml/communication.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/state.js';
import '../src/uml/overview.js';
import '../src/uml/component.js';
import '../src/uml/composite.js';
import '../src/uml/profile.js';
import '../src/uml/timing.js';
import '../src/uml/information.js';
import '../src/er/er.js';
import '../src/flowchart/flowchart.js';
import '../src/dfd/dfd.js';
import '../src/c4/c4.js';
import '../src/c4/views.js';
import '../src/mindmap/mindmap.js';
import '../src/cloud/cloud.js';
import '../src/bpmn/process.js';
import '../src/sysml/requirement.js';
import '../src/sysml/blocks.js';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';
import { layout } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { tablesOf } from '../src/page/print.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
// the geometry the tables read: the cards drawn, their steps and opened views, the lines drawn and their kinds (a typed view's
// tables list only what its type draws: audits 15, 29)
const NONE = { nodes: ['placed', 'plain', 'empty', 'nil', 'text'].map(id => ({ id })), edges: ['go', 'back', 'none'].map(_id => ({ _id })) };
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
  'bike-share.json': '11e5940a1c5a141e', 'bike-share-c4.json': '61b680937d248209', 'monorepo.json': '4e2638724ead87d6', 'shapes.json': '49fdf9fb182b383b',
  'sales-classes.json': 'cea8962c5cc55d53', 'order-objects.json': '67b4d8e36a4b59c5', 'bookshop-packages.json': '61f60b0985090f3d', // 6.7: the profile's row and its application's
}; // audit 1: a typed view's element by its drawn name (catalog::Book, ada : Customer), so sales-classes and order-objects changed
// bike-share.json changed when the rider shop's three views (overview, api, checkout, from bookshop.json) joined it,
// and again when its typed views joined it (step 3): the tables of all its 49 views, the trips map's fare, lifecycle and trip
// API and the fleet map's battery monitor and rebalance planner now opening typed views; and again in step 4: the dock feed,
// demand and rider help views joined it (52 views), and the fleet map's dock listener and demand forecast open two of them.
// Step 4 also took out the files the model replaced (bookshop, clinic, weather, assistant, states) and pinned the clinic's
// successor, bike-share-c4.json, the import of examples/bike-share.dsl

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

test('the Lines table lists a line drawn to a member\'s owner: an association from a property, a comment on one (audit 3)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'order', type: 'uml.Class', label: 'Order', members: [{ id: 'order.customer', type: 'uml.Property', label: 'customer' }] },
    { id: 'customer', type: 'uml.Class', label: 'Customer' }, { id: 'note', type: 'uml.Comment', label: 'kept by id' }],
  edges: [{ id: 'ref', type: 'uml.Association', from: 'order.customer', to: 'customer', label: 'refers to' }, { id: 'about', type: 'uml.CommentLink', from: 'note', to: 'order.customer' },
    { id: 'plain', type: 'uml.Dependency', from: 'order', to: 'customer' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['order', 'customer', 'note'] }] };
  const ctx = mapContext(m), lines = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'))[1], text = lines.rows.map(r => r.replace(/<[^>]+>/g, ''));
  assert.match(lines.title, /<span>3<\/span>/); assert.ok(text.includes('Order → Customerrefers toAssociation') && text.some(t => t.startsWith('kept by id → Order')), text);
});

test('audit 8: an open package is named in the tables as it is drawn, by its qualified name', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'sales', type: 'uml.Package', label: 'sales' }, { id: 'orders', type: 'uml.Package', label: 'orders', parent: 'sales' },
    { id: 'Order', type: 'uml.Class', label: 'Order', parent: 'orders' }, { id: 'billing', type: 'uml.Package', label: 'billing', parent: 'sales' }],
    edges: [{ id: 'imp', type: 'uml.PackageImport', from: 'billing', to: 'orders' }], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['orders', 'Order', 'billing'] }] };
  const ctx = mapContext(m), [els, lines] = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v')), text = t => t.rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.deepEqual(text(els), ['sales::orders Package', 'Order Class', 'sales::billing Package']);
  assert.deepEqual(text(lines), ['sales::billing → sales::orders Package import']);
});

test('audit 29: the PDF prints what the view draws: type "" is no type, its Kind "Element" as named; a class drawn with no compartments lists no members', async () => {
  for (const f of ['component', 'composite', 'activity', 'information', 'usecase', 'state', 'overview']) await import(`../src/uml/${f}.js`);
  for (const f of ['internal', 'parametric', 'requirement']) await import(`../src/sysml/${f}.js`);
  const text = (m, i = 0) => { const ctx = mapContext(m); return tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'))[i].rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); };
  for (const diagram of ['uml.component', 'uml.deployment', 'uml.composite-structure', 'uml.activity', 'uml.information-flow', 'uml.use-case', 'uml.state-machine', 'uml.interaction-overview', 'sysml.internal-block', 'sysml.parametric', 'sysml.requirement'])
    for (const type of [undefined, '']) { const m = { schemaVersion: 2, nodes: [{ id: 'u', ...(type !== undefined ? { type } : {}), label: 'Plain' }], edges: [], views: [{ id: 'v', diagram, nodeIds: ['u'] }] };
      assert.equal(layout(m, 'v').nodes.find(n => n.id === 'u').aria, 'Element Plain', `${diagram} ${JSON.stringify(type)}`);
      assert.deepEqual(text(m), ['Plain Element'], `${diagram} ${JSON.stringify(type)}: the Kind, as its accessible name`); }
  const money = { id: 'money', type: 'uml.Class', label: 'Money', members: [{ id: 'amt', type: 'uml.Property', label: 'amount', props: { valueType: 'Int' } }, { id: 'add', type: 'uml.Operation', label: 'add' }] };
  for (const diagram of ['uml.component', 'uml.composite-structure', 'uml.deployment', 'uml.package'])
    assert.deepEqual(text({ schemaVersion: 2, nodes: [money], edges: [], views: [{ id: 'v', diagram, nodeIds: ['money'] }] }), ['Money Class'], diagram);
  // an interface as a ball draws no compartment; as a box, its operations and attributes
  const I = { id: 'i', type: 'uml.Interface', label: 'Pay', members: [{ id: 'op', type: 'uml.Operation', label: 'pay' }] }, cv = present => ({ schemaVersion: 2, nodes: [I], edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['i'], ...present }] });
  assert.deepEqual(text(cv({})), ['Pay Interface pay()']);
  assert.deepEqual(text(cv({ present: { i: { as: 'ball' } } })), ['Pay Interface']);
});


// audit 30: one rule for an element or a line of no type, of type "", or of a type of no notation, in every type: what the
// view draws and calls it (its accessible name) is what describe(), the PDF's Kind and validate()'s words say. Every type src/
// registers, read from the sources so a new one is held to it too
test('audit 30: in every type, an element or line of no type (or "", or of no notation) is drawn, named, described, printed and warned of alike', async () => {
  const build = readFileSync(new URL('../tools/build.mjs', import.meta.url), 'utf8');
  for (const f of [...build.matchAll(/'([a-z0-9]+\/[a-z0-9-]+)'/g)].map(m => m[1])) await import(`../src/${f}.js`);
  const { diagramOf } = await import('../src/core/registry.js'), { validate } = await import('../src/map/validate.js'), { describe } = await import('../src/map/insight.js');
  const src = p => readdirSync(new URL(`../src/${p}/`, import.meta.url)).map(f => readFileSync(new URL(`../src/${p}/${f}`, import.meta.url), 'utf8')).join('\n');
  const { C4_TYPES } = await import('../src/c4/c4.js'), { C4_VIEW_TYPES } = await import('../src/c4/views.js');
  const names = [...new Set([...readdirSync(new URL('../src/', import.meta.url)).flatMap(d => [...src(d).matchAll(/registerDiagramType\('([a-z0-9.-]+)'/g)].map(m => m[1])), ...[...C4_TYPES, ...C4_VIEW_TYPES].map(T => T.name)])]
    .filter(d => d !== 'map' && diagramOf({ diagram: d }));
  assert.ok(names.length >= 30, names.join());
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w, drawnAs = w => (w === 'Line' ? 'a plain line' : an(w.toLowerCase()));
  const bad = [], warn = console.warn; console.warn = () => {};
  try {
    for (const d of names) {
      const say = (what, ok, got) => { if (!ok) bad.push(`${d} ${what}: ${JSON.stringify(got)}`); }, seen = {};
      for (const type of [undefined, '', 'fooBar']) {
        const has = type === undefined ? {} : { type }, q = JSON.stringify(type);
        const not = eg => (type === undefined ? `has no <notation>.<Name> type (${eg})` : `type ${q} is not <notation>.<Name> (${eg})`); // no type: not "type undefined" (audit 31)
        const m = { schemaVersion: 2, nodes: [{ id: 'x', label: 'Thing', ...has, members: [{ id: 'mm', label: 'zork', ...has }] }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [],
          views: [{ id: 'v', diagram: d, title: 'V', nodeIds: ['x', 'a', 'b'], edges: [{ id: 'e', from: 'a', to: 'b', label: 'qux', ...has }] }] };
        const g = layout(m, 'v'), n = g.nodes.find(y => y.id === 'x'), e = g.edges.find(y => y.id === 'e' || (y.ids || []).includes('e'));
        const ps = validate(m), at = p => (ps.find(y => y.path === p) || {}).message, ctx = mapContext(m), [els, lines] = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v'));
        const row = els.rows.find(r => r.includes('<b>Thing</b>')), k = row && cells(row)[1], desc = describe(m, 'v'), lr = lines.rows[0], lk = lr && cells(lr).at(-1);
        // the element: its kind as its name starts, in the PDF and describe(); "" as no type; validate() says what is drawn
        const word = n && typeof n.aria === 'string' && n.aria.includes(' Thing') ? n.aria.slice(0, n.aria.indexOf(' Thing')) : null;
        if (type !== 'fooBar') seen.node ??= n && n.aria; else say('node of no notation: its PDF Kind as named', !n || word === k, [n && n.aria, k]);
        if (type === '') say('"" node: as no type', (n && n.aria) === seen.node, [n && n.aria, seen.node]);
        if (type !== 'fooBar' && !n) { say(`${q} node not drawn: not printed nor described`, !row && !/Thing/.test(desc), desc);
          if (type === '') say('"" node: warned not drawn', at('nodes[0].type') === 'type "" is not <notation>.<Name> (uml.Class): not drawn', at('nodes[0].type')); }
        else if (type !== 'fooBar') { say(`${q} node: PDF Kind as named`, !!word && k === word, [n.aria, k]); say(`${q} node: described as named`, !!word && new RegExp(`\\b${word}`, 'i').test(desc) && /Thing/.test(desc), desc);
          if (type === '') say('"" node: warned drawn as named', at('nodes[0].type') === `type "" is not <notation>.<Name> (uml.Class): drawn as ${an(String(word).toLowerCase())}`, at('nodes[0].type')); }
        // the member: no view draws one of no kind, and validate() says so
        if (type !== 'fooBar') { say(`${q} member not drawn`, !JSON.stringify(g).includes('zork'), 'zork'); say(`${q} member: warned not drawn`, at('nodes[0].members[0].type') === `${not('uml.Property')}: not drawn`, at('nodes[0].members[0].type')); }
        // the line: its kind as its name starts ("Line", "Data flow"), in the PDF's Lines and validate()'s words; of no notation, as
        // written, or "Line" where a view names every kind it does not know so (a class view, BPMN)
        const lw = e && typeof e.aria === 'string' ? e.aria.slice(0, Math.min(...[' qux', ' from'].map(w => e.aria.indexOf(w)).filter(i => i > 0))) : null;
        if (type !== 'fooBar') seen.line ??= e && e.aria;
        if (type === '') say('"" line: as no type', (e && e.aria) === seen.line, [e && e.aria, seen.line]);
        if (!e) say(`${q} line not drawn: warned so`, at('views[0].edges[0].type') === `${not('uml.Dependency')}: not drawn`, at('views[0].edges[0].type'));
        else { say(`${q} line: PDF Kind as named`, lk === lw || type === 'fooBar' && lw === 'Line' && lk === 'fooBar', [e.aria, lk]);
          say(`${q} line: warned drawn as named`, at('views[0].edges[0].type') === `${not('uml.Dependency')}: drawn as ${drawnAs(type === 'fooBar' && lw === 'fooBar' ? 'Line' : lw)}`, [at('views[0].edges[0].type'), e.aria]); }
      }
    }
  } finally { console.warn = warn; }
  assert.deepEqual(bad, []);
});
