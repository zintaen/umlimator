// The entity-relationship diagram, er (work package M2.2, notes/milestone-2.md §4, §7.1): the type's definition; the entity
// with its key columns and rows; the six ends of src/typed/draw.js's table (ENDS, exported) in crow's foot and IDEF1X, one
// geometry, a switch that lays nothing out; S9's row syntax; the validators, each with a passing and a failing case;
// describe(), names, reading order, the legend, the PDF's word, rows and text; the editing hooks; a 30-step session saved and
// reopened; P1 (§11). tests/er.html draws it in a browser and edits it by pointer and keyboard. Imports src/ to reach the
// internals; lib/umlimator-all.js holds the same code. The example is read wherever check.mjs's targets() says it lives
// (docs/diagrams/examples/, until M2.13 moves it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { tablesOf } from '../src/page/print.js';
import { ENDS } from '../src/typed/draw.js';
import { ER_RULES, ER_TYPE, erEnd, erMember, erProblems, parseColumn, printColumn } from '../src/er/er.js';
import { targets } from '../docs/diagrams/examples/check.mjs';

const T = diagramOf({ diagram: 'er' });
const EX = JSON.parse(readFileSync(targets().find(([f]) => f === '20-entity-relationship.json')[1]));
const V = EX.views[0], VID = V.id;
const by = (m, id) => m.nodes.find(n => n.id === id), col = (m, id) => m.nodes.flatMap(n => n.members || []).find(c => c.id === id), edge = (m, id) => m.edges.find(e => e.id === id);
const unid = s => s.replace(/\bg\d+-/g, 'g-');
const withView = (m, more) => { const c = structuredClone(m); Object.assign(c.views[0], more); return c; };
const C = (id, label, props) => ({ id, type: 'er.Column', label, props });
const R = (id, from, to, f, t, more = {}) => ({ id, type: 'er.Relationship', from, to, props: { identifying: false, ends: { from: { multiplicity: f }, to: { multiplicity: t } }, ...more } });

test('the definition: er is registered with its palette, its two lines, its properties, its rules and its hooks; ENDS holds its six ends', () => {
  assert.equal(T.name, 'er');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['er.Entity', 'Table'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['er.Relationship', 'Relationship'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.lines[0].props, { identifying: false, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } }, 'connect adds 1 to 0..*, non-identifying');
  assert.deepEqual(T.props['er.Column'].map(f => [f.key, f.kind]), [['dataType', 'text'], ['primaryKey', 'bool'], ['foreignKey', 'bool'], ['references', 'text'], ['unique', 'bool'], ['nullable', 'bool']]);
  assert.deepEqual(T.props['er.Relationship'].map(f => [f.key, f.path, f.kind]), [['identifying', undefined, 'bool'], ['ends.from.multiplicity', ['ends', 'from', 'multiplicity'], 'text'], ['ends.to.multiplicity', ['ends', 'to', 'multiplicity'], 'text']]);
  for (const k of ['layout', 'validate', 'describe', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits), ['member', 'connect']);
  assert.deepEqual(Object.keys(T.rules), ['pk-exists', 'column-names', 'fk-target', 'fk-flag', 'relationship-fk', 'identifying-key', 'identifying-parent', 'relationship-ends', 'relationship-tables', 'notation']);
  assert.deepEqual(T.refs, { 'er.Column': { 'props.references': 'drop' } });
  assert.deepEqual(['er.Entity', 'uml.Comment'].map(t => T.member.holds({ type: t })), [true, false]);
  for (const k of ['cf-one', 'cf-zero-one', 'cf-one-many', 'cf-zero-many', 'idef-dot', 'idef-diamond']) assert.ok(Object.hasOwn(ENDS, k) && ENDS[k].length === 4, k);
  assert.deepEqual(['cf-one', 'cf-zero-one', 'cf-one-many', 'cf-zero-many', 'idef-dot', 'idef-diamond'].map(k => ENDS[k][3]), ['none', 'hollow', 'none', 'hollow', 'line', 'hollow'], 'rings and the diamond hollow, the dot filled');
});

test('20-entity-relationship.json validates clean and lays out clean right and down in both notations; right when the view says nothing; drawn twice from one memo, the same markup', () => {
  assert.deepEqual(validate(EX), []);
  for (const direction of ['right', 'down']) for (const notation of ['crowsfoot', 'idef1x']) assert.deepEqual(check(withView(EX, { direction, notation }), VID), [], `${direction} ${notation}`);
  const g = layout(EX, VID), at = id => g.byId[id];
  assert.ok(at('er-customer').x + at('er-customer').w < at('er-order').x, 'right: the parent left of its child');
  assert.equal(unid(svgOf(g)), unid(svgOf(layout(withView(EX, { direction: 'right' }), VID))), 'right by default');
  const memos = {}, first = mapContext(EX, { memos }).buildView(VID), nodes = JSON.stringify(memos[VID].g.nodes);
  const second = mapContext(EX, { memos }).buildView(VID);
  assert.equal(memos[VID].runs, 1); assert.equal(unid(second.markup), unid(first.markup)); assert.equal(JSON.stringify(memos[VID].g.nodes), nodes, 'the geometry is not edited after the layout');
});

test('the ends (§4.1): each multiplicity at each end in crow\'s foot and IDEF1X, the nearest form with the text written for any other, none for an unreadable one', () => {
  const at = (t, w, idef) => erEnd({ type: 'er.Relationship', props: { ends: { [w]: { multiplicity: t } } } }, w, idef);
  const cf = ['1', '0..1', '1..*', '0..*', '*', '2..5', '3', '0..3', 'many', '5..2', '0', undefined].map(t => at(t, 'to', false));
  assert.deepEqual(cf, [['cf-one', undefined], ['cf-zero-one', undefined], ['cf-one-many', undefined], ['cf-zero-many', undefined], ['cf-zero-many', undefined],
    ['cf-one-many', '2..5'], ['cf-one-many', '3'], ['cf-zero-many', '0..3'], ['none', 'many'], ['none', '5..2'], ['none', '0'], ['none', undefined]]);
  assert.deepEqual(['1', '0..1', '1..*', '0..*', '2..5'].map(t => at(t, 'from', true)), [['none'], ['idef-diamond'], ['idef-dot', 'P'], ['idef-dot', undefined], ['idef-dot', '2..5']], 'IDEF1X at the parent');
  assert.deepEqual(['1', '0..1', '1..*', '0..*', '2..5', 'many'].map(t => at(t, 'to', true)), [['idef-dot', '1'], ['idef-dot', 'Z'], ['idef-dot', 'P'], ['idef-dot', undefined], ['idef-dot', '2..5'], ['none', 'many']], 'IDEF1X at the child');
  // on the picture: identifying solid, non-identifying dashed in both notations; a marker per end used, each drawn as its row
  for (const notation of ['crowsfoot', 'idef1x']) { const g = layout(withView(EX, { notation }), VID), s = svgOf(g), e = id => g.edges.find(x => x.id === id).end;
    assert.equal(e('er-order-lines').dashed, false, notation); assert.equal(e('er-customer-orders').dashed, true, notation);
    for (const k of new Set(g.edges.flatMap(x => [x.end.from, x.end.to]).filter(k => k !== 'none'))) assert.ok(s.includes(`<path d="${ENDS[k][2]}"`), `${notation}: ${k}'s marker`); }
  const cfg = layout(EX, VID), idf = layout(withView(EX, { notation: 'idef1x' }), VID), end = (g, id) => { const x = g.edges.find(e => e.id === id).end; return [x.from, x.to, x.labels.from.mult, x.labels.to.mult]; };
  assert.deepEqual(end(cfg, 'er-order-lines'), ['cf-one', 'cf-one-many', undefined, undefined]);
  assert.deepEqual(end(idf, 'er-order-lines'), ['none', 'idef-dot', undefined, 'P']);
  assert.deepEqual(end(idf, 'er-order-payment'), ['none', 'idef-dot', undefined, 'Z']);
  assert.deepEqual(end(idf, 'er-customer-referrals'), ['idef-diamond', 'idef-dot', undefined, undefined], 'an optional parent: the diamond');
  assert.match(svgOf(idf), /class="end-lab"[^>]*>P<\/text>/, 'IDEF1X\'s letter is an end label');
});

test('one geometry, two skins (§4.3, §11): a notation switch repaints with no layout (the memo\'s run count holds), every box where it was, the ends and the dependent corners changed', () => {
  const memos = {}, ctx = m => mapContext(m, { memos }).buildView(VID);
  const a = ctx(EX), boxes = JSON.stringify(memos[VID].g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h])), pts = JSON.stringify(memos[VID].g.edges.map(e => e.pts));
  const b = ctx(apply(EX, [{ op: 'set', view: VID, path: 'notation', value: 'idef1x' }]));
  assert.equal(memos[VID].runs, 1, 'no layout on the switch');
  assert.equal(JSON.stringify(memos[VID].g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h])), boxes); assert.equal(JSON.stringify(memos[VID].g.edges.map(e => e.pts)), pts);
  assert.notEqual(a.markup, b.markup);
  assert.match(b.markup, /data-shape="entity"[^>]*aria-label="Table order_line[^"]*"><rect [^>]*rx="8" class="n-mask"/, 'order_line, a dependent entity, rounded in IDEF1X');
  assert.doesNotMatch(b.markup, /aria-label="Table order,[^"]*"><rect [^>]*rx=/, 'order is independent');
  assert.doesNotMatch(a.markup, /data-shape="entity"[^>]*><rect [^>]*rx=/, 'no corner rounded in crow\'s foot');
  ctx(EX); assert.equal(memos[VID].runs, 1, 'and back');
});

test('the entity (§7.1): the name in its header, its key columns, a divider, the rest; marks PK, FK, UK and ?; types muted; 120 to 320 px wide, every text cut; rows and collapsed as the classifier\'s', () => {
  const g = layout(EX, VID), n = g.byId['er-order_line'], s = svgOf(g);
  assert.deepEqual(n.sections.map(S => [S.name, S.rows.map(r => [r.marks, r.name, r.type])]), [['keys', [['PK FK', 'order_id', 'bigint'], ['PK', 'line_no', 'integer']]], ['columns', [['FK', 'book_id', 'bigint'], ['', 'quantity', 'integer']]]]);
  assert.deepEqual(g.byId['er-customer'].sections[1].rows.map(r => r.marks), ['UK', 'FK ?']);
  assert.equal(n.h, 24 + 2 * (8 + 2 * 15));
  const grp = s.slice(s.indexOf('data-id="er-order_line"')), one = grp.slice(0, grp.indexOf('</g></g>') + 8);
  assert.match(one, /class="c-name"[^>]*>order_line<\/text>/); assert.equal((one.match(/class="c-comp"/g) || []).length, 2);
  assert.match(one, /class="er-mark" fill="var\(--um-muted\)"[^>]*>PK FK<\/text>/); assert.match(one, /class="er-type" fill="var\(--um-muted\)"[^>]*>integer<\/text>/);
  for (const x of g.nodes) assert.ok(x.w >= 120 && x.w <= 320, x.id);
  const big = structuredClone(EX); by(big, 'er-book').label = 'a_table_name_far_too_long_to_fit_any_box_at_all_'.repeat(3); by(big, 'er-book').members.push(C('er-book.x', 'y'.repeat(80), { dataType: 'varchar(4000) collate "und-x-icu"' }));
  const h = layout(big, VID); assert.equal(h.byId['er-book'].w, 320); assert.match(svgOf(h), /…<\/text>/, 'cut with fit');
  // rows: at most that many in a section, then "+k more"; collapsed: the sections named hidden; an entity with no column
  const p = withView(EX, { present: { 'er-order_line': { rows: 1 }, 'er-customer': { collapsed: ['columns'] } } }), q = layout(p, VID);
  assert.deepEqual(q.byId['er-order_line'].rows, 1); assert.equal(q.byId['er-order_line'].h, 24 + 2 * (8 + 2 * 15), 'one row and +1 more in each');
  assert.equal((svgOf(q).match(/class="c-more"[^>]*>\+1 more</g) || []).length, 2);
  assert.equal(q.byId['er-customer'].h, 24 + 8 + 15, 'the keys only');
  const bare = structuredClone(EX); bare.nodes.push({ id: 'er-empty', type: 'er.Entity', label: 'empty' }); bare.views[0].nodeIds.push('er-empty');
  assert.equal(layout(bare, VID).byId['er-empty'].h, 24 + 10); assert.deepEqual(check(bare, VID), []);
});

test('names (A1), the reading order, describe() and the legend', () => {
  const g = layout(EX, VID), s = svgOf(g);
  assert.equal(g.byId['er-order_line'].aria, 'Table order_line, key order_id and line_no, 4 columns: order_id bigint PK FK order.id; line_no integer PK; book_id bigint FK book.id; quantity integer');
  assert.match(s, /data-shape="entity" tabindex="-1" role="img" aria-label="Table book_author, key book_id and author_id, 2 columns: /);
  assert.equal(g.edges.find(e => e.id === 'er-order-lines').aria, 'Identifying relationship contains from order (exactly one) to order_line (one or more)');
  assert.equal(g.edges.find(e => e.id === 'er-order-payment').aria, 'Non-identifying relationship from order (exactly one) to payment (zero or one)');
  assert.deepEqual(g.order, [...V.nodeIds, ...EX.edges.map(e => e.id)]);
  const d = describe(EX, VID).split('\n');
  assert.equal(d[0], 'Bookshop schema: an entity-relationship diagram of 7 elements and 7 lines.');
  assert.equal(d[3], 'Table order_line, key order_id and line_no, 4 columns: order_id bigint PK FK order.id; line_no integer PK; book_id bigint FK book.id; quantity integer.');
  assert.equal(d.at(-1), 'Non-identifying relationship referred from customer (zero or one) to customer (zero or more).');
  assert.equal(d.length, 1 + 7 + 7);
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Identifying', 'Non-identifying', 'Exactly one', 'Zero or one', 'One or more', 'Zero or more']);
  assert.match(g.legend[1], /stroke-dasharray="3 2"/); assert.doesNotMatch(g.legend[0], /stroke-dasharray/);
  assert.deepEqual(layout(withView(EX, { notation: 'idef1x' }), VID).legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Identifying', 'Non-identifying', 'Child end', 'Optional parent', 'Dependent entity'], 'IDEF1X keys its rounded corners');
  // a comment and its link
  const m = structuredClone(EX); m.nodes.push({ id: 'note', type: 'uml.Comment', label: 'Money in cents' }); m.edges.push({ id: 'about', type: 'uml.CommentLink', from: 'note', to: 'er-payment' }); m.views[0].nodeIds.push('note');
  const h = layout(m, VID); assert.equal(h.byId.note.shape, 'note'); assert.equal(h.edges.find(e => e.id === 'about').aria, 'Comment link from Money in cents to payment');
  assert.ok(h.legend.some(l => l.includes('<b>Comment link</b>'))); assert.deepEqual(validate(m), []);
});

test('the PDF\'s tables (§9): an entity\'s word and its columns as S9 prints them; a relationship\'s text, its multiplicities, shown in the lines table before its label', () => {
  assert.deepEqual(['er-order', 'er-customer-orders', 'nowhere'].map(id => T.word(EX, id)), ['Table', null, null]);
  assert.deepEqual(T.rows(EX, V, 'er-payment'), ['id bigint PK', 'order_id bigint FK order.id UK', 'amount numeric(10,2)']);
  assert.equal(T.rows(EX, V, 'er-customer-orders'), null);
  assert.equal(T.text(EX, V, 'er-customer-orders'), 'places: 1 to 0..*, non-identifying');
  assert.equal(T.text(EX, V, 'er-book-authors'), '1 to 1..*, identifying'); assert.equal(T.text(EX, V, 'er-order'), null);
  const ctx = mapContext(EX), [els, lines] = tablesOf(ctx, ctx.V[VID], { nodes: [], edges: [] }), cells = r => [...r.matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);
  assert.ok(els.rows.some(r => cells(r).includes('Table')));
  assert.ok(lines.rows.map(r => cells(r)[1]).includes('contains: 1 to 1..*, identifying'), lines.rows.map(r => cells(r)[1]));
});

test('a column\'s row (S9): name type [PK] [FK table.column] [UK] [NULL], flags in any order and case; FK by labels or id, resolved to the id; print(parse(x)) stable; what does not read is said', () => {
  const I = { col: new Map(EX.nodes.flatMap(n => (n.members || []).map(c => [c.id, { c, e: n }]))) };
  assert.deepEqual(parseColumn('customer_id bigint FK customer.id', I), { label: 'customer_id', props: { dataType: 'bigint', foreignKey: true, references: 'er-customer.id' } });
  assert.deepEqual(parseColumn('note  numeric(10, 2)  null uk', I), { label: 'note', props: { dataType: 'numeric(10, 2)', nullable: true, unique: true } });
  assert.deepEqual(parseColumn('ref FK er-book.id PK', I), { label: 'ref', props: { foreignKey: true, references: 'er-book.id', primaryKey: true } }, 'by id; no type');
  assert.deepEqual(parseColumn('x int FK', I), { label: 'x', props: { dataType: 'int', foreignKey: true } }, 'FK alone (fk-flag then warns)');
  assert.deepEqual(parseColumn('id', I), { label: 'id', props: {} });
  for (const [t, why] of [['', 'it is empty'], ['id int PK pk', 'PK is written twice'], ['id int PK extra', '"extra" is left over: write name type [PK] [FK table.column] [UK] [NULL]'], ['x int FK customer.nope', 'FK customer.nope names no column (table.column)'],
    ['a numeric(10 PK', 'its brackets do not pair'], ['a int) PK', 'its brackets do not pair'], ['"" int', 'it is empty']])
    assert.deepEqual(parseColumn(t, I), { error: `"${t}" is not a column: ${why}` }, t);
  assert.deepEqual(parseColumn('t timestamp with time zone NULL', I), { label: 't', props: { dataType: 'timestamp with time zone', nullable: true } }, 'a type of several words');
  assert.deepEqual(parseColumn('"unit price" numeric(10, 2)', I), { label: 'unit price', props: { dataType: 'numeric(10, 2)' } }, 'a name with a space, in quotes');
  for (const t of ['id bigint PK', 'customer_id bigint FK customer.id', 'order_id bigint PK FK order.id', 'note text UK NULL', 'x FK', 'amount double precision NULL', '"unit price" numeric(10, 2)'])
    assert.equal(printColumn(parseColumn(t, I), I), t, t);
  assert.equal(printColumn(col(EX, 'er-order_line.order_id'), { col: I.col }), 'order_id bigint PK FK order.id');
  // the panel asks owners (null: no Owner field) with the live model just before it prints the rows: a fresh copy, read nowhere else
  const live = structuredClone(EX); assert.equal(T.owners(live, by(live, 'er-order')), null);
  assert.equal(T.member.print(col(live, 'er-order.customer_id')), 'customer_id bigint FK customer.id', 'the panel\'s print, from the model the panel read');
  // a renamed table: labels first, so a row sent back unchanged keeps its reference; labels two tables share: the id printed
  const ren = { schemaVersion: 2, nodes: [{ id: 'order', type: 'er.Entity', label: 'purchase', members: [C('order.id', 'id', { primaryKey: true })] }, { id: 'order-2', type: 'er.Entity', label: 'order', members: [C('order-2.id', 'id', { primaryKey: true })] },
    { id: 'line', type: 'er.Entity', label: 'line', members: [C('line.oid', 'oid', { dataType: 'bigint', foreignKey: true, references: 'order-2.id' })] }], edges: [], views: [] };
  T.owners(ren, ren.nodes[2]); const row = T.member.print(ren.nodes[2].members[0]);
  assert.equal(row, 'oid bigint FK order.id'); assert.equal(T.edits.member(ren, null, 'line', 'line.oid', row.replace('oid', 'order_id'))[1].value.references, 'order-2.id');
  ren.nodes[0].label = 'order'; T.owners(ren, ren.nodes[2]);
  assert.equal(T.member.print(ren.nodes[2].members[0]), 'oid bigint FK order-2.id', 'two tables labelled order: the id');
  assert.equal(T.member.print(C('loose', 'x', { references: 'er-customer.id' })), 'x FK er-customer.id', 'a column never read: the id it references');
});

test('edits.member (§7.1): a new row adds a column with its id from the entity\'s; a row edited sets its name and props, keeping props the syntax does not write; a bad row is said', () => {
  const M = T.edits.member;
  assert.deepEqual(M(EX, V, 'er-book', null, 'price numeric(10,2) NULL'), [{ op: 'add', element: { id: 'er-book.price', type: 'er.Column', label: 'price', props: { dataType: 'numeric(10,2)', nullable: true } }, owner: 'er-book' }]);
  assert.equal(M(EX, V, 'er-book', null, 'title text')[0].element.id, 'er-book.title-2', 'the next free id');
  assert.deepEqual(M(EX, V, 'er-book', null, 'x int FK nowhere.id'), { error: '"x int FK nowhere.id" is not a column: FK nowhere.id names no column (table.column)' });
  const m = structuredClone(EX); col(m, 'er-book.isbn').props.comment = 'ISBN-13';
  const cmds = M(m, V, 'er-book', 'er-book.isbn', 'isbn13 char(13) UK');
  assert.deepEqual(cmds, [{ op: 'set', id: 'er-book.isbn', path: 'label', value: 'isbn13' }, { op: 'set', id: 'er-book.isbn', path: 'props', value: { comment: 'ISBN-13', dataType: 'char(13)', unique: true } }]);
  assert.deepEqual(validate(apply(m, cmds)), []);
  const n = apply(EX, M(EX, V, 'er-author', null, 'born date NULL')); assert.equal(layout(n, VID).byId['er-author'].sections[1].rows.length, 2, 'drawn: the entity grows');
  assert.equal(M(EX, V, 'er-customer-orders', null, 'x int'), null, 'not an entity: the default');
});

test('connect (§7.1): a relationship between two tables is the default with the palette\'s 1 to 0..*, non-identifying; a relationship from or to a comment is refused; a comment link is the default', () => {
  const m = structuredClone(EX); m.nodes.push({ id: 'note', type: 'uml.Comment', label: 'n' });
  assert.equal(T.edits.connect(m, V, 'er-author', 'er-payment', null, T.lines[0]), null);
  assert.equal(T.edits.connect(m, V, 'er-author', 'er-author', null, T.lines[0]), null, 'a self-reference');
  assert.deepEqual(T.edits.connect(m, V, 'note', 'er-payment', null, T.lines[0]), { error: 'A relationship joins two tables' });
  assert.deepEqual(T.edits.connect(m, V, 'er-author', 'note', null, T.lines[0]), { error: 'A relationship joins two tables' });
  assert.equal(T.edits.connect(m, V, 'note', 'er-payment', null, T.lines[1]), null);
  // what the default then adds draws and says what it lacks: no column of payment references author
  const n = apply(EX, [{ op: 'add', element: { id: 'r1', type: 'er.Relationship', from: 'er-author', to: 'er-payment', props: structuredClone(T.lines[0].props) }, view: VID }]);
  assert.deepEqual(validate(n).map(p => [p.level, p.rule]), [['warning', 'relationship-fk']]);
  assert.deepEqual(layout(n, VID).edges.find(e => e.id === 'r1').end, { from: 'cf-one', to: 'cf-zero-many', dashed: true, labels: { from: { mult: undefined }, to: { mult: undefined } } });
});

test('declared references (§3): deleting a column drops it from every column that referenced it; deleting a table takes its relationships', () => {
  const m = apply(EX, [{ op: 'delete', id: 'er-customer.id' }]);
  assert.equal(col(m, 'er-order.customer_id').props.references, undefined); assert.equal(col(m, 'er-customer.referred_by').props.references, undefined);
  assert.deepEqual([...new Set(erProblems(m).map(p => p.rule))].sort(), ['fk-flag', 'pk-exists', 'relationship-fk']);
  const n = apply(EX, [{ op: 'delete', id: 'er-book' }]);
  assert.deepEqual(n.edges.map(e => e.id).filter(id => id.startsWith('er-book')), []);
});

// ---- §7.1: validators, each with a passing and a failing case: [rule, level, break, the ids it names]
const BREAKS = [
  ['pk-exists', 'warning', m => { delete col(m, 'er-payment.id').props.primaryKey; return ['er-payment']; }],
  ['column-names', 'error', m => { col(m, 'er-book.title').label = 'isbn'; return ['er-book', 'er-book.isbn', 'er-book.title']; }],
  ['fk-target', 'error', m => { by(m, 'er-book').members.push(C('er-book.x', 'x', { foreignKey: true, references: 'er-gone' })); return ['er-book.x']; }],
  ['fk-target', 'warning', m => { by(m, 'er-author').members.push(C('er-author.x', 'x', { foreignKey: true, references: 'er-book.title' })); return ['er-author.x', 'er-book.title']; }],
  ['fk-flag', 'warning', m => { delete col(m, 'er-order.customer_id').props.foreignKey; return ['er-order.customer_id']; }],
  ['fk-flag', 'warning', m => { col(m, 'er-book.title').props.foreignKey = true; return ['er-book.title']; }],
  ['relationship-fk', 'warning', m => { m.edges.push(R('r', 'er-author', 'er-payment', '1', '0..*')); return ['r', 'er-author', 'er-payment']; }],
  ['identifying-key', 'error', m => { edge(m, 'er-order-payment').props.identifying = true; return ['er-order-payment', 'er-payment', 'er-payment.order_id']; }],
  ['identifying-parent', 'error', m => { edge(m, 'er-order-lines').props.ends.from.multiplicity = '0..1'; return ['er-order-lines', 'er-order']; }],
  ['relationship-ends', 'error', m => { edge(m, 'er-book-lines').props.ends.to.multiplicity = 'many'; return ['er-book-lines']; }],
  ['relationship-ends', 'error', m => { delete edge(m, 'er-book-lines').props.ends; return ['er-book-lines']; }, 2], // both ends
  ['relationship-ends', 'warning', m => { edge(m, 'er-book-lines').props.ends.to.multiplicity = '2..5'; return ['er-book-lines']; }],
  ['relationship-tables', 'error', m => { m.nodes.push({ id: 'note', type: 'uml.Comment', label: 'Money in cents' }); m.edges.push(R('r', 'note', 'er-payment', '1', '0..*')); return ['r', 'note']; }],
  ['notation', 'warning', m => { m.views[0].notation = 'IDEF1X'; return ['er-schema']; }],
];
test('validators (§7.1): the example breaks none; each rule fails on a model that breaks it, naming its rule and its elements, at its level, through validate() too', () => {
  assert.deepEqual(erProblems(EX), []); assert.deepEqual(T.validate(EX, V), []);
  const hit = new Set();
  for (const [rule, level, broke, k = 1] of BREAKS) {
    const m = structuredClone(EX), ids = broke(m), got = erProblems(m), tag = `${rule} ${level}`;
    assert.deepEqual(got.map(p => [p.rule, p.level]), Array(k).fill([rule, level]), `${tag}: ${JSON.stringify(got)}`);
    const [p] = got; hit.add(rule);
    assert.match(p.message, new RegExp('^' + rule + ': '), tag);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), tag);
    assert.ok(validate(m).some(x => x.rule === rule && x.path === p.path), `${tag}: in validate()`);
  }
  assert.deepEqual([...hit].sort(), Object.keys(ER_RULES).sort(), 'every rule has a failing case');
  const msg = m => erProblems(m).map(p => p.message);
  const two = structuredClone(EX); col(two, 'er-book.title').label = 'isbn';
  assert.deepEqual(msg(two), ['column-names: "book" has two columns named "isbn" (er-book.isbn, er-book.title)']);
  const idp = structuredClone(EX); edge(idp, 'er-order-lines').props.ends.from.multiplicity = '0..1';
  assert.deepEqual(msg(idp), ['identifying-parent: er-order-lines is identifying, so its parent end at "order" is 1, not "0..1"']);
  const idk = structuredClone(EX); edge(idk, 'er-order-payment').props.identifying = true;
  assert.deepEqual(msg(idk), ['identifying-key: er-order-payment is identifying, but order_id of "payment" is not in its primary key']);
  // the cases that pass: a key referenced through a unique column; a self-reference; a nullable foreign key; 1..1 at the parent;
  // a comment's link to a table; the notation idef1x
  const ok = withView(EX, { notation: 'idef1x' }); ok.nodes.push({ id: 'note', type: 'uml.Comment', label: 'Money in cents' }); ok.edges.push({ id: 'about', type: 'uml.CommentLink', from: 'note', to: 'er-payment' }); by(ok, 'er-order').members.push(C('er-order.isbn', 'isbn', { dataType: 'char(13)', foreignKey: true, references: 'er-book.isbn', nullable: true }));
  ok.edges.push(R('r', 'er-book', 'er-order', '0..1', '0..*'));
  assert.deepEqual(erProblems(ok), []);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) { const t = `t${i}`;
    steps.push(() => [{ op: 'add', element: { id: t, type: 'er.Entity', label: `table${i}` }, view: VID }], m => T.edits.member(m, V, t, null, 'id bigint PK'), m => T.edits.member(m, V, t, null, 'customer_id bigint FK customer.id'),
      () => [{ op: 'add', element: { id: `r${i}`, type: 'er.Relationship', from: 'er-customer', to: t, props: structuredClone(T.lines[0].props) }, view: VID }],
      [() => [{ op: 'set', id: `r${i}`, path: ['props', 'ends', 'to', 'multiplicity'], value: '0..1' }], () => [{ op: 'set', view: VID, path: 'notation', value: i % 2 ? 'crowsfoot' : 'idef1x' }], () => [{ op: 'set', id: `r${i}`, path: 'label', value: `has ${i}` }]][i % 3],
      [() => [{ op: 'hide', id: t, view: VID }], () => [{ op: 'delete', id: `${t}.customer_id` }], m => T.edits.member(m, V, t, `${t}.id`, 'id bigint PK UK')][i % 3]); }
  assert.equal(steps.length, 30);
  const h = history(EX), seen = [JSON.stringify(h.model)], cmds = [];
  for (const s of steps) { const c = s(h.model); cmds.push(c); h.push(apply(h.model, c)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = cmds.slice(15).reduce((m, c) => apply(m, c), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o) => unid(mapContext(m, o).buildView(VID).markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos[VID].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, VID), describe(JSON.parse(seen[30]), VID));
});

// §10, §11: 50 entities and 60 relationships, each child referencing its parent by a column (identifying where it is in the key),
// the four multiplicities in turn
const STRESS = (() => {
  const nodes = [], edges = [], M = ['0..*', '1..*', '0..1', '1'];
  for (let k = 0; k < 50; k++) nodes.push({ id: `e${k}`, type: 'er.Entity', label: `table_${k}`, members: [C(`e${k}.id`, 'id', { dataType: 'bigint', primaryKey: true }), C(`e${k}.name`, 'name', { dataType: 'varchar(80)' })] });
  for (let i = 0; i < 60; i++) { const child = 1 + (i % 49), parent = (i * 7) % child, key = i % 3 === 0;
    nodes[child].members.push(C(`e${child}.fk${i}`, `fk_${i}`, { dataType: 'bigint', foreignKey: true, references: `e${parent}.id`, ...(key ? { primaryKey: true } : {}) }));
    edges.push(R(`r${i}`, `e${parent}`, `e${child}`, '1', M[i % 4], { identifying: key })); edges[i].label = `has ${i}`; }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'er', nodeIds: nodes.map(n => n.id) }] };
})();
test('P1 (§11): on 50 entities and 60 relationships, a full layout and markup, a column\'s type set (no other entity moves) and a column added (its entity grows), laid out and drawn under CI\'s 1 s, the 100 ms target printed; a notation switch lays nothing out (CPU, best of seven after a warm-up) (timed)', () => {
  assert.equal(STRESS.nodes.length, 50); assert.equal(STRESS.edges.length, 60); assert.deepEqual(validate(STRESS), []);
  assert.deepEqual(check(STRESS, 'all').filter(p => p.level === 'error'), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(STRESS);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(STRESS).buildView('all')),
    type: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'e7.name', path: 'props.dataType', value: `text${k}` }]))),
    added: timed(() => draw(apply(STRESS, [{ op: 'add', element: C(`e9.c${k}`, `c_${k}`, { dataType: 'int' }), owner: 'e9' }]))) }));
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'type', 'added']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  draw(STRESS); const before = memos.all.runs;
  const at = g => Object.fromEntries(g.nodes.map(n => [n.id, [n.x, n.y, n.w, n.h]])), a = at(layout(STRESS, 'all')), b = at(layout(apply(STRESS, [{ op: 'set', id: 'e7.name', path: 'props.dataType', value: 'text0' }]), 'all'));
  assert.deepEqual(Object.keys(a).filter(id => id !== 'e7' && String(a[id]) !== String(b[id])), [], 'a column\'s type set: no other entity moves');
  const sw = timed(() => draw(apply(STRESS, [{ op: 'set', view: 'all', path: 'notation', value: 'idef1x' }])));
  assert.equal(memos.all.runs, before, 'the switch repaints'); assert.ok(sw < 1000);
  console.log(`# P1 target 100 ms: a column's type ${best('type').toFixed(1)} ms, a column added ${best('added').toFixed(1)} ms, the notation switched ${sw.toFixed(1)} ms; full layout and markup ${best('full').toFixed(1)} ms`);
});

test('audit 1: a row keeps its FK target, names with quotes or brackets round-trip, a cut row is in the accessible name', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'orders', type: 'er.Entity', label: 'old orders', members: [C('orders.id', 'id', { primaryKey: true })] },
    { id: 'orders-2', type: 'er.Entity', label: 'orders', members: [C('orders-2.id', 'id', { primaryKey: true })] },
    { id: 'line', type: 'er.Entity', label: 'line', members: [C('line.order', 'order_id', { dataType: 'int', foreignKey: true, references: 'orders.id' })] }],
  edges: [], views: [{ id: 'v', diagram: 'er', nodeIds: ['orders', 'orders-2', 'line'] }] };
  ER_TYPE.owners(m); const row = ER_TYPE.member.print(m.nodes[2].members[0]);
  assert.equal(row, 'order_id int FK orders.id');
  assert.equal(erMember(m, m.views[0], 'line', 'line.order', row + ' NULL')[1].value.references, 'orders.id', 'NULL added: the FK still names orders.id');
  for (const label of ['size(cm', 'size)', 'note>', '"quoted"', 'a "b" c', 'back\\slash x', 'my col']) {
    const t = { schemaVersion: 2, nodes: [{ id: 't', type: 'er.Entity', label: 't', members: [C('t.c', label, { dataType: 'int' })] }], edges: [], views: [] };
    const r = erMember(t, null, 't', 't.c', printColumn(t.nodes[0].members[0]));
    assert.deepEqual([r[0].value, r[1].value], [label, { dataType: 'int' }], label);
  }
  const long = 'shipping_instructions_for_the_courier_and_the_warehouse_team';
  const w = { schemaVersion: 2, nodes: [{ id: 'o', type: 'er.Entity', label: 'orders', members: [C('o.id', 'id', { primaryKey: true, dataType: 'bigint' }), C('o.n', long, { dataType: 'text' })] }], edges: [], views: [{ id: 'v', diagram: 'er', nodeIds: ['o'] }] };
  assert.equal(layout(w, 'v').byId.o.aria, `Table orders, key id, 2 columns: id bigint PK; ${long} text`);
});

test('audit 2: an FK to a column whose id holds a space, and a column with no label, print rows that save back unchanged', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'orders', type: 'er.Entity', label: 'orders', members: [C('orders.order no', 'order no', { dataType: 'int', primaryKey: true })] },
    { id: 'lines', type: 'er.Entity', label: 'lines', members: [C('lines.ref', 'ref', { dataType: 'int', foreignKey: true, references: 'orders.order no' })] }], edges: [], views: [] };
  const row = (ER_TYPE.owners(m), printColumn(m.nodes[1].members[0]));
  assert.equal(row, 'ref int FK "orders.order no"');
  assert.equal(erMember(m, null, 'lines', 'lines.ref', row + ' UK')[1].value.references, 'orders.order no');
  const t = { schemaVersion: 2, nodes: [{ id: 't', type: 'er.Entity', label: 't', members: [{ id: 't.qty', type: 'er.Column', props: { dataType: 'integer', primaryKey: true } }] }], edges: [], views: [] };
  assert.equal(printColumn(t.nodes[0].members[0]), 't.qty integer PK');
  t.nodes[0].members[0].label = '';
  assert.ok(erMember(t, null, 't', 't.qty', printColumn(t.nodes[0].members[0])).error, 'an empty name is reported, not replaced by the type');
});
