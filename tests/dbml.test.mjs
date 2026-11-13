// The DBML adapter (notes/milestone-2.md §8.4, M2.11): a Database captured from a pinned @dbml/core reads into a model
// check.mjs passes, with the pinned report (risks.md R1); same Database, same ids (R3); it imports nothing and package.json
// names no @dbml/core (D8); §8's limits on a parsed object: counts, wrong kinds, prototype names, a deep or circular
// object, never thrown on, each hostile input read in under a second (R2).
// tests/import/dbml.json was captured from @dbml/core 11.0.0 in a scratch folder (npm install @dbml/core@11.0.0), its
// `dbml` text parsed by `Parser.parse(dbml, 'dbmlv2').export()`; renew it the same way when @dbml/core changes its model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDbml as read } from '../src/readers/dbml.js';
import { check } from '../docs/diagrams/examples/check.mjs';

const captured = JSON.parse(readFileSync(new URL('import/dbml.json', import.meta.url)));
const skip = (line, message) => ({ line, status: 'skipped', message }), approx = (line, message) => ({ line, status: 'approximated', message });
const rel = e => [e.id, e.from, e.to, e.props.identifying, e.props.ends.from.multiplicity, e.props.ends.to.multiplicity];

test('the captured Database reads into a model check.mjs passes, with the pinned report', () => {
  assert.equal(captured.core, '@dbml/core 11.0.0');
  const { model, report } = read(captured.database);
  assert.deepEqual(check(model, 'er'), []);
  assert.deepEqual(model.views, [{ id: 'schema', diagram: 'er', nodeIds: ['customer', 'order', 'order_line', 'book', 'author', 'book_author', 'payment', 'shipment', 'tag', 'stock'] }]);
  // each ref from its referenced end to its referring one; identifying when the foreign key is in the child's key; an
  // optional parent where the foreign key is nullable; one-to-one `0..1`; a many-to-many with no foreign key
  assert.deepEqual(model.edges.map(rel), [
    ['customer-customer', 'customer', 'customer', false, '0..1', '0..*'], // inline, through the alias C
    ['book-book_author', 'book', 'book_author', true, '1', '0..*'],
    ['author-book_author', 'author', 'book_author', true, '1', '0..*'],
    ['customer-order', 'customer', 'order', false, '1', '0..*'],
    ['order-order_line', 'order', 'order_line', true, '1', '0..*'],
    ['book-order_line', 'book', 'order_line', false, '1', '0..*'],
    ['order-payment', 'order', 'payment', false, '1', '0..1'],
    ['order_line-shipment', 'order_line', 'shipment', false, '0..1', '0..*'], // a composite foreign key, nullable
    ['book-tag', 'book', 'tag', false, '0..*', '0..*'],
    ['book-stock', 'book', 'stock', true, '1', '0..1']]); // across schemas, its key a foreign key
  const col = id => model.nodes.flatMap(n => n.members || []).find(c => c.id === id);
  assert.deepEqual(col('order_line.order_id'), { id: 'order_line.order_id', type: 'er.Column', label: 'order_id', props: { dataType: 'bigint', primaryKey: true, foreignKey: true, references: 'order.id' } });
  assert.deepEqual(col('shipment.line_no').props, { dataType: 'integer', nullable: true, foreignKey: true, references: 'order_line.line_no' });
  assert.deepEqual(col('customer.email').props, { dataType: 'varchar(255)', unique: true });
  assert.deepEqual(col('payment.amount').props, { dataType: 'numeric(10,2)' });
  assert.deepEqual(col('order.status').props, { dataType: 'order_status', nullable: true });
  assert.deepEqual(report, [
    skip('', 'the database: its sticky notes are not read'),
    skip('schemas[0].enums[0]', 'enum order_status: not read'),
    skip('schemas[0].tableGroups[0]', 'table group sales: not read'),
    skip('schemas[0].tables[0]', 'table customer: its note is not read'),
    skip('schemas[0].tables[0]', 'table customer: its header colour is not read'),
    skip('schemas[0].tables[0].fields[0]', 'customer.id: its increment is not read'),
    skip('schemas[0].tables[0].fields[3]', 'customer.created_at: its default is not read'),
    skip('schemas[0].tables[1].fields[2]', 'order.status: its default is not read'),
    skip('schemas[0].tables[2].fields[3]', 'order_line.quantity: its note is not read'),
    skip('schemas[0].tables[2].indexes[1]', 'table order_line: an index is not read'),
    approx('schemas[1].tables[0]', 'table warehouse.stock: its schema is not kept, so it is read as stock'),
    skip('schemas[1].tables[0].fields[1]', 'stock.on_hand: its default is not read'),
    skip('schemas[0].refs[3]', 'ref order.(customer_id) -> customer.(id): its delete action is not read'),
    skip('schemas[0].refs[5]', 'ref order_line.(book_id) -> book.(id): its name is not read'),
    approx('schemas[0].refs[8]', 'ref book.(id) -> tag.(id): a many-to-many is one relationship with no foreign key')]);
  // same Database, same ids and model (R3); the input is not changed
  const before = JSON.stringify(captured.database);
  assert.deepEqual(read(JSON.parse(before)), { model, report });
  assert.equal(JSON.stringify(captured.database), before);
});

test('the adapter imports nothing and package.json names no @dbml/core (D8)', () => {
  const src = readFileSync(new URL('../src/readers/dbml.js', import.meta.url), 'utf8'), pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\b|\brequire\(|\bimport\(/m);
  assert.doesNotMatch(pkg, /dbml/);
});

// a Database of n tables of one field each, and refs between them
const db = (tables, refs = []) => ({ schemas: [{ name: 'public', tables, refs }] });
const table = (name, fields = [{ name: 'id', type: { type_name: 'int' }, pk: true }], more = {}) => ({ name, fields, indexes: [], ...more });
const ref = (a, b, ra = '*', rb = '1', fa = ['id'], fb = ['id']) => ({ endpoints: [{ tableName: a, fieldNames: fa, relation: ra }, { tableName: b, fieldNames: fb, relation: rb }] });

test('input that is not a Database, and fields of the wrong kind, are skipped and reported, never thrown on (R2)', () => {
  for (const x of [undefined, null, 42, 'Table a {}', [], {}, { schemas: {} }])
    assert.deepEqual(read(x), { model: { schemaVersion: 2, root: 'schema', nodes: [], edges: [], views: [{ id: 'schema', diagram: 'er', nodeIds: [] }] },
      report: [skip('', 'not a parsed DBML Database (parse the text with @dbml/core first): nothing read')] }, String(x));
  const odd = read({ schemas: [7, { tables: 'x', refs: {}, enums: 3 }, { name: 'public', tables: [null, { name: 4 }, { name: '' },
    table('a', [null, { name: 'x' }, { name: 'y', type: { type_name: 5 } }, { name: 'y', type: 'int' }], { indexes: [{ pk: true, columns: [{ type: 'column', value: 'nope' }] }, 'x'] }),
    table('a'), table('b', undefined, { indexes: {} }), table('c', 'fields')],
  refs: [null, { endpoints: [] }, ref('a', 'b', '*', '1', ['x'], ['zz']), ref('a', 'b', '?', '1'), ref('a', 'b', '*', '1', ['x', 'y'], ['id']), { ...ref('a', 'b', '*', '1', ['x']), inactive: true }] }] });
  assert.deepEqual(odd.report, [
    skip('schemas[0]', 'a schema that is not an object'),
    skip('schemas[1].enums', 'enums is not a list'),
    skip('schemas[1].refs', 'refs is not a list'),
    skip('schemas[1].tables', 'tables is not a list'),
    skip('schemas[2].tables[0]', 'a table with no name'),
    skip('schemas[2].tables[1]', 'a table with no name'),
    skip('schemas[2].tables[2]', 'a table with no name'),
    skip('schemas[2].tables[3].fields[0]', 'table a: a field with no name'),
    approx('schemas[2].tables[3].fields[1]', 'a.x: its type is not text, so it has none'),
    approx('schemas[2].tables[3].fields[2]', 'a.y: its type is not text, so it has none'),
    skip('schemas[2].tables[3].fields[3]', 'a.y is named twice: the second is not read'),
    skip('schemas[2].tables[3].indexes[0]', 'table a: a primary key index not of its columns is not read'),
    skip('schemas[2].tables[3].indexes[1]', 'table a: an index is not read'),
    skip('schemas[2].tables[4]', 'table public.a is named twice: the second is not read'),
    skip('schemas[2].tables[5].indexes', 'table b: indexes is not a list'),
    skip('schemas[2].tables[6].fields', 'table c: fields is not a list'),
    ...[0, 1, 2, 3].map(k => skip(`schemas[2].refs[${k}]`, 'a ref whose ends are not two columns of tables read: not read')),
    skip('schemas[2].refs[4]', 'ref a.(x, y) -> b.(id): its two ends name different numbers of columns: not read'),
    skip('schemas[2].refs[5]', 'ref a.(x) - b.(id): inactive, so not read')]);
  assert.deepEqual(check(odd.model, 'er'), []);
  assert.deepEqual(odd.model.nodes.map(n => n.id), ['a', 'b', 'c']);
  // a host's object whose getter throws: what was read is kept, and the rest reported
  const boom = Object.defineProperty({}, 'name', { get() { throw new Error('boom'); } });
  const trap = db([table('t'), table('u', [{ name: 'id', type: { type_name: 'int' } }, boom]), table('v')]);
  assert.equal(read(Object.defineProperty({}, 'schemas', { get() { throw new Error('boom'); } })).report.length, 1);
  assert.deepEqual(read({ ...db([]), name: 'Bookshop' }).model.title, 'Bookshop');
  const r = read(trap);
  assert.deepEqual([r.model.nodes.map(n => [n.id, (n.members || []).map(c => c.id)]), r.report], [[['t', ['t.id']], ['u', ['u.id']]], [skip('', 'the Database could not be read to its end (boom): the rest is not read')]]);
});

test('names are ordinary, prototype names and "->" included; a circular Database (as @dbml/core builds it) is walked once (R2, R3)', () => {
  const t = table('__proto__', [{ name: 'constructor', type: { type_name: 'int' }, pk: true }, { name: 'toString', type: { type_name: 'int' }, not_null: true }], { alias: 'hasOwnProperty' });
  const u = table('a->b', [{ name: '__proto__', type: { type_name: 'int' }, not_null: true }]), v = table('__proto__.constructor');
  const d = db([t, u, v], [ref('a->b', 'hasOwnProperty', '*', '1', ['__proto__'], ['constructor']), ref('__proto__', '__proto__', '*', '1', ['toString'], ['constructor'])]);
  // @dbml/core's own objects point back up: a field to its table, a table to its schema, a schema to its database
  d.schemas[0].database = d; for (const x of d.schemas[0].tables) { x.schema = d.schemas[0]; for (const f of x.fields) f.table = x; }
  const { model, report } = read(d);
  assert.deepEqual(report, []);
  assert.deepEqual(model.nodes.map(n => [n.id, n.members.map(c => c.id)]), [['__proto__', ['__proto__.constructor-2', '__proto__.toString']], ['a-b', ['a-b.__proto__']], ['__proto__.constructor', ['__proto__.constructor.id']]]);
  assert.deepEqual(model.edges.map(rel), [['__proto__-a-b', '__proto__', 'a-b', false, '1', '0..*'], ['__proto__-__proto__', '__proto__', '__proto__', false, '1', '0..*']]);
  assert.equal(model.nodes[1].members[0].props.references, '__proto__.constructor-2');
  assert.deepEqual(check(model, 'er'), []);
  assert.equal(Object.getPrototypeOf(model.nodes[0]), Object.prototype);
  // a column two refs make a foreign key keeps the first's reference; both relationships are drawn
  const two = read(db([table('a'), table('b'), table('c', [{ name: 'x', type: { type_name: 'int' }, not_null: true }])], [ref('c', 'a', '*', '1', ['x']), ref('c', 'b', '*', '1', ['x'])]));
  assert.deepEqual([two.model.edges.map(e => e.id), two.model.nodes[2].members[0].props.references, two.report],
    [['a-c', 'b-c'], 'a.id', [approx('schemas[0].refs[1]', 'ref c.(x) -> b.(id): x refers to a.id already, which it keeps')]]);
});

test('counts over the limit: 10,000 tables, columns and refs read, the rest reported once each; hostile input in under a second (R2) (timed)', () => {
  const N = 10000, many = n => Array.from({ length: n }, (_, k) => table(`t${k}`));
  const tables = read(db(many(N + 5)));
  assert.equal(tables.model.nodes.length, N);
  assert.deepEqual(tables.report, [skip(`schemas[0].tables[${N}]`, `over ${N} tables: the rest are not read`)]);
  const cols = read(db([table('w', Array.from({ length: N + 5 }, (_, k) => ({ name: `c${k}`, type: { type_name: 'int' }, not_null: true })))]));
  assert.equal(cols.model.nodes[0].members.length, N);
  assert.deepEqual(cols.report, [skip(`schemas[0].tables[0].fields[${N}]`, `over ${N} columns: the rest are not read`)]);
  const refs = read(db([table('a'), table('b', [{ name: 'id', type: { type_name: 'int' }, pk: true }, { name: 'a', type: { type_name: 'int' }, not_null: true }])],
    Array.from({ length: N + 5 }, () => ref('b', 'a', '*', '1', ['a'], ['id']))));
  assert.equal(refs.model.edges.length, N);
  assert.equal(refs.model.edges.at(-1).id, `a-b-${N}`);
  assert.deepEqual(refs.report, [skip(`schemas[0].refs[${N}]`, `over ${N} refs: the rest are not read`)]);

  let deep = { type_name: 'int' }; for (let k = 0; k < 200000; k++) deep = { type_name: 'int', args: deep }; // nesting is never followed
  let note = 'x'; for (let k = 0; k < 200000; k++) note = { note };
  const hostile = [
    db(many(200000)), // tables over the limit
    db([table('w', Array.from({ length: 200000 }, (_, k) => ({ name: `c${k % 7}`, type: deep, note })))]), // repeated names, deep objects
    db(many(N), Array.from({ length: 200000 }, (_, k) => ref(`t${k % N}`, `t${(k * 7) % N}`))), // refs over the limit
    db(many(N), Array.from({ length: 200000 }, (_, k) => ref(`t${k % 3}`, 't0', '*', '*'))), // many-to-many between few pairs: ids
    { schemas: Array.from({ length: 200000 }, (_, k) => ({ name: `s${k}`, tables: [table('__proto__')], enums: [{ name: 'e' }] })) }, // schemas, names taken
    db([table('w', [{ name: 'id', type: { type_name: 'int' } }], { indexes: Array.from({ length: 200000 }, () => ({ pk: true, columns: Array.from({ length: 5 }, () => ({ type: 'column', value: 'id' })) })) })])];
  // in this process's CPU time, a slow run tried twice more, its best kept (a cold or busy runner is several times slower)
  const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
  const best = f => { let [out, ms] = cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };
  hostile.forEach((h, k) => {
    const [r, ms] = best(() => read(h));
    console.log(`hostile input ${k}: ${ms.toFixed(0)} ms CPU (target and ceiling 1000 ms)`);
    assert.ok(ms < 1000, `hostile input ${k}: ${ms} ms`);
    assert.ok(r.model.nodes.length <= N && r.model.edges.length <= N);
  });
});
