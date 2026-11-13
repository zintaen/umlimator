// The Mermaid erDiagram reader and writer (notes/milestone-2.md §8.1, M2.8): read(write(model)) equals the model on the
// subset, ids included, for example 20 and 500 generated models; the file with every construct on Mermaid's ER page gives
// the pinned report (risks.md R1, R4); same source, same ids (R3); a size limit, hostile input read in linear time,
// names like __proto__ read as names, and malformed input reported, never thrown (R2, §8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidEr as read, writeMermaidEr as write } from '../src/readers/mermaid-er.js';
import { validate } from '../lib/umlimator-all.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/er.mmd', import.meta.url), 'utf8');

// the model as one er view shows it, which is what Mermaid's text carries: its entities, the relationships between them,
// and of the view its id, title, direction and nodes (not its layout, its notation crowsfoot, which is Mermaid's, nor a parent)
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes: m.nodes.filter(n => ids.has(n.id)), edges: m.edges.filter(e => ids.has(e.from) && ids.has(e.to)),
    views: [{ id: v.id, diagram: 'er', ...(title ? { title } : {}), ...(v.direction === 'down' ? { direction: 'down' } : {}), nodeIds: v.nodeIds }] };
}
// order is not meaning for nodes, lines or a view's nodes; an entity's columns keep theirs
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });
// the two notes a read gives once per file, whatever it holds: they say what Mermaid's text is, not what this text lost
const ONCE = /kept under ext\.mermaid\.comment|which column a foreign key references/;
const core = m => validate(m).filter(p => p.level === 'error' && !p.rule); // no core error (one with no rule: a dangling end, an id twice, ...)

test('read(write(model)) is example 20, ids and references included, and nothing is reported', () => {
  const m = json('../docs/diagrams/examples/20-entity-relationship.json'), text = write(m), back = read(text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(canon(back.model), canon(project(m, 'er-schema')), text);
  assert.doesNotMatch(text, /not written/);
  // the writer's text is Mermaid's: an alias for a label, keys, a nullable type, both lines, an empty label in quotes
  assert.match(text, /\n {2}er-customer\["customer"\] \{\n {4}bigint id PK\n {4}varchar\(255\) email UK\n {4}%% references: er-customer\.id\n {4}bigint\? referred_by FK\n {2}\}\n/);
  assert.match(text, /\n {4}bigint order_id FK, UK\n/);
  assert.match(text, /\n {2}%% id: er-order-lines\n {2}er-order \|\|--\|\{ er-order_line : "contains"\n/);
  assert.match(text, /\n {2}er-order \|\|\.\.o\| er-payment : ""\n/);
  assert.match(text, /\n {2}er-customer \|o\.\.o\{ er-customer : "referred"\n/);
  assert.deepEqual(core(back.model), []);
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
const TEXT = ['Orders', 'colon: inside', 'Quotes "and" <angles>', 'two\nlines', 'hash #1 and #quot;', 'go direction LR now', 'back\\slash', '%% not a comment', '50% off', ' padded ', '-- and }', 'tilde~s~', 'Ünïcode ❤', '<br> as text'];
const NAMES = ['customer', 'ORDER', 'LINE-ITEM', 'a.b', 'Ünit', 'x_1', 'two words', ' padded', 'q"uote', '50%', 'one', 'end', 'class-x', 'u-x', 'many', 'to', '9lives',
  'go direction TB', '__proto__', 'constructor', 'entity', 'back\\slash', 'erDiagram', 'one-to', 'Style'];
const COLUMNS = ['id', 'name', 'PK', 'fk', '*star', 'a b', 'x,y', 'price(eur)', 'Ünit', '__proto__', 'constructor', 'uk_code', 'a-b'];
const TYPES = ['int', 'varchar(255)', 'numeric(10,2)', 'double precision', 'List~int~', 'x?', 'uk', 'string[]', '*ptr', 'Ünicode'];
const MULTS = ['1', '0..1', '0..*', '1..*'];
function generate(seed) {
  const r = rng(seed), maybe = (p, x) => (r() < p ? x : undefined), used = new Set(), nodes = [], edges = [];
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  for (let k = 0, n = 1 + Math.floor(r() * 7); k < n; k++) {
    const id = take(pick(r, NAMES), `E${used.size}`), labels = new Set(), members = [];
    for (let j = 0, c = Math.floor(r() * 5); j < c; j++) {
      const label = pick(r, COLUMNS);
      if (labels.has(label)) continue;
      labels.add(label);
      const props = clean({ dataType: pick(r, TYPES), primaryKey: maybe(0.3, true), foreignKey: maybe(0.3, true), unique: maybe(0.2, true), nullable: maybe(0.3, true) });
      members.push(clean({ id: take(r() < 0.8 ? `${id}.${label}` : pick(r, ['c', `${id.trim()}.c`, 'key']), `C${used.size}`), type: 'er.Column', label, props, ext: maybe(0.2, { mermaid: { comment: pick(r, TEXT) } }) }));
    }
    nodes.push(clean({ id, type: 'er.Entity', label: r() < 0.5 ? id : pick(r, TEXT), members: members.length ? members : undefined }));
  }
  const cols = nodes.flatMap(n => n.members || []);
  for (const c of cols) if (r() < 0.3) c.props.references = pick(r, [...cols.map(x => x.id).filter(id => id.trim() === id), 'other.id']); // a hint is read trimmed
  for (let k = 0, n = Math.floor(r() * nodes.length * 1.5); k < n; k++) {
    const from = pick(r, nodes).id, to = pick(r, nodes).id;
    edges.push(clean({ id: take(pick(r, [`${from}-${to}`, 'r1', 'places', `${from}-${to}-2`.trim()]), `R${k}`), type: 'er.Relationship', from, to, label: maybe(0.6, pick(r, TEXT)),
      props: { identifying: r() < 0.5, ends: { from: { multiplicity: pick(r, MULTS) }, to: { multiplicity: pick(r, MULTS) } } } }));
  }
  const title = maybe(0.6, pick(r, ['Schema', 'Schema: shop', "It's here"]));
  const view = clean({ id: pick(r, ['er-diagram', 'schema', 'vé w']), diagram: 'er', title, direction: maybe(0.5, 'down'), nodeIds: nodes.map(n => n.id).sort(() => r() - 0.5) });
  return clean({ schemaVersion: 2, title, root: view.id, nodes: nodes.sort(() => r() - 0.5), edges, views: [view] });
}

// Mermaid 12.3.0 itself on the writer's output was checked once at M2.8 (14 Nov 2026, from the npm package in a scratch
// folder, not a dependency), outside these tests: for example 20 and seeds 1 to 200 its parser read every text, with the
// same entities in the same order, each one's attributes (type, name, keys) and every relationship's two ends and
// identifying, as the reader does. The test below checks this reader only.
test('the writer names what it cannot write as one line or once, and quotes a title YAML would not read as text', () => {
  const col = (label, dataType) => ({ id: `A.${label}`, type: 'er.Column', label, props: { dataType } });
  const m = { nodes: [{ id: 'A', type: 'er.Entity', label: 'A', members: [col('a', 'int\nx'), col('b\nc', 'int'), col('d', 'int')] },
    { id: 'B', type: 'er.Entity', label: 'B' }],
  edges: [{ id: 'r', type: 'er.Relationship', from: 'A', to: 'B', props: { identifying: true, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } } }],
  views: [{ id: 'er-diagram', diagram: 'er', title: 'null', nodeIds: ['A', 'B', 'A'], edges: ['r', 'r'] }] };
  const text = write(m), back = read(text);
  assert.match(text, /^---\ntitle: "null"\n---\n/);
  for (const s of ['A.a (er.Column)', 'A.b\\nc (er.Column)', 'A: listed twice in the view, written once', 'r: listed twice in the view, written once'])
    assert.ok(text.includes(`%% not written: ${s}\n`), `${s}\n${text}`);
  assert.deepEqual(back.report.filter(x => !ONCE.test(x.message)), [], text);
  assert.equal(back.model.title, 'null');
  assert.deepEqual(back.model.views[0].nodeIds, ['A', 'B']);
  assert.deepEqual(back.model.edges.map(e => e.id), ['r']);
  assert.deepEqual(back.model.nodes[0].members.map(c => c.label), ['d']);
  for (const t of ['yes', 'True', '123', '1.5']) assert.equal(read(write({ ...m, views: [{ ...m.views[0], title: t }] })).model.title, t);
  assert.match(write({ ...m, views: [{ ...m.views[0], title: 'Orders (v2)' }] }), /\ntitle: Orders \(v2\)\n/);
});

test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let hints = 0, made = 0, refs = 0, ticks = 0, comments = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), text = write(m), back = read(text);
    hints += text.split('%% id:').length - 1; made += text.split(/\n {2}entity(-\d+)?[[ \n]/).length - 1;
    refs += text.split('%% references:').length - 1; ticks += text.split('`').length - 1; comments += (text.match(/ "[^"]*"\n/g) || []).length;
    assert.doesNotMatch(text, /%% not written/, `seed ${seed}\n${text}`);
    assert.deepEqual(back.report.filter(x => !ONCE.test(x.message)), [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${text}`);
  }
  assert.ok(hints > 1000 && made > 100 && refs > 300 && ticks > 500 && comments > 100, `${hints} hints, ${made} made names, ${refs} references, ${ticks} backticks, ${comments} comments`);
});

test("a file with every construct on Mermaid's ER page gives the pinned report (R1, R4)", () => {
  const { model, report } = read(every);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    '11 skipped: accTitle: accessibility text is not read',
    '12 skipped: accDescr: accessibility text is not read',
    "52 approximated: PERSON.driversLicense: a column's comment is kept under ext.mermaid.comment and not drawn, as every other column's",
    '59 approximated: NAMED-DRIVER.carRegistrationNumber: Mermaid does not say which column a foreign key references, so references is left out, as for every other (fk-flag warns of each)',
    '82 skipped: subgraph title1: a group is not read; the entities in it are',
    '88 skipped: subgraph title2: a group is not read; the entities in it are',
    '90 skipped: subgraph title3: a group is not read; the entities in it are',
    '91 skipped: direction TB inside a subgraph is not kept: the view has one direction',
    '95 skipped: subgraph Client Domain: a group is not read; the entities in it are',
    '98 skipped: subgraph id1: a group is not read; the entities in it are',
    '101 skipped: title1 -- title2: title1 is a subgraph, and a relationship with a group is not read',
    '102 skipped: title2 -- ROOM: title2 is a subgraph, and a relationship with a group is not read',
    '105 skipped: style: styling is not read',
    '106 skipped: classDef: styling is not read',
    '107 skipped: class: styling is not read',
    '108 skipped: :::someclass on BOAT: styling is not read',
    '111 skipped: :::foo on PERSON: styling is not read',
    '112 skipped: classDef: styling is not read',
    "117 approximated: SHIP u--|| YARD: u, a parent marker Mermaid's page does not show, is read as 1",
    '136 approximated: %% id: dock is taken, so DOCK -- SHIP is dock-2',
    '137 skipped: DOCK[Quay]: DOCK has an alias already',
    '138 skipped: DOCK.id: DOCK has a column id already',
    '139 skipped: "?? broken" in DOCK\'s block is not a column',
    '141 skipped: "SHIP -> DOCK" is not understood',
    '142 skipped: an end that closes no subgraph',
    '143 approximated: SHIP ||--|| DOCK: no : label, which Mermaid asks for, so it has none',
    '144 approximated: direction BT is drawn top to bottom',
    "147 approximated: OPEN's { is never closed: read to the end",
  ]);
  const v = model.views[0], node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id);
  const col = id => model.nodes.flatMap(n => n.members || []).find(c => c.id === id), ends = e => [e.props.ends.from.multiplicity, e.props.identifying, e.props.ends.to.multiplicity];
  assert.equal(model.title, "Every construct on Mermaid's ER page");
  assert.deepEqual([v.id, v.diagram, v.direction], ['er-diagram', 'er', 'down']); // direction BT, read as TB, is the last
  assert.deepEqual(core(model), []);
  // entities: in order of first naming, names in quotes, aliases; the subgraphs are not entities
  assert.deepEqual(v.nodeIds, ['CUSTOMER', 'ORDER', 'LINE-ITEM', 'DELIVERY-ADDRESS', 'PRODUCT', 'This ❤ Unicode', 'This **is** _Markdown_', 'CAR', 'NAMED-DRIVER', 'PERSON',
    'MANUFACTURER', 'PASSENGER', 'p', 'a', 'CLIENT', 'HOUSE', 'ROOM', 'OWNER', 'INVOICE', 'RECEIPT', 'id1x', 'id2x', 'BOAT', 'SHIP', 'HARBOUR', 'FLEET', 'FLAG', 'YARD', 'dock', 'OPEN']);
  assert.deepEqual([node('p').label, node('a').label, node('dock').label, node('CUSTOMER').label], ['Person', 'Customer Account', 'Dock', 'CUSTOMER']);
  // the ends, both sides' symbols and their words; identifying -- and to, non-identifying .. optionally to .- -.
  assert.deepEqual(ends(edge('CUSTOMER-ORDER')), ['1', true, '0..*']);
  assert.deepEqual(ends(edge('ORDER-LINE-ITEM')), ['1', true, '1..*']);
  assert.deepEqual(ends(edge('CUSTOMER-DELIVERY-ADDRESS')), ['1..*', false, '1..*']);
  assert.deepEqual(ends(edge('CAR-NAMED-DRIVER-2')), ['1', true, '0..*']);
  assert.deepEqual(ends(edge('PERSON-NAMED-DRIVER-2')), ['0..*', false, '0..*']);
  assert.deepEqual(ends(edge('p-a')), ['1', true, '0..1']);
  assert.deepEqual(['SHIP-HARBOUR', 'SHIP-FLEET', 'SHIP-FLAG', 'SHIP-YARD'].map(id => ends(edge(id))), [['1', true, '0..*'], ['0..*', false, '1'], ['0..1', false, '1'], ['1', true, '1']]);
  assert.equal(edge('PRODUCT-LINE-ITEM').label, 'appears in');
  assert.equal(edge('SHIP-dock').label, undefined);
  // columns: keys, a comment, a nullable type, a * key, a generic type, a type in backticks
  assert.deepEqual(col('NAMED-DRIVER.driverLicence').props, { dataType: 'string', primaryKey: true, foreignKey: true });
  assert.deepEqual([col('PERSON.driversLicense').props, col('PERSON.driversLicense').ext], [{ dataType: 'string', primaryKey: true }, { mermaid: { comment: 'The license #' } }]);
  assert.deepEqual(col('PERSON.phone').props, { dataType: 'string', unique: true });
  assert.deepEqual(col('PASSENGER.middleName').props, { dataType: 'string', nullable: true });
  assert.deepEqual(col('CAR.parts').props, { dataType: 'string[]' });
  assert.deepEqual(node('HARBOUR').members.map(c => [c.id, c.props.dataType, !!c.props.primaryKey]), [['HARBOUR.code', 'string', true], ['HARBOUR.names', 'List~string~', false], ['HARBOUR.depth', 'double precision', false]]);
  // the hints: an entity's id, a column's id and references, a relationship's id
  assert.deepEqual(node('dock').members, [{ id: 'dock-key', type: 'er.Column', label: 'id', props: { dataType: 'int', primaryKey: true } },
    { id: 'dock.harbour', type: 'er.Column', label: 'harbour', props: { dataType: 'string', foreignKey: true, references: 'HARBOUR.code' } }]);
  assert.deepEqual([edge('docked-at').from, edge('docked-at').to, edge('docked-at').label], ['dock', 'HARBOUR', 'docked at']);
  // the entities of the subgraphs are read, a group's own relationships are not
  assert.ok(['CLIENT', 'OWNER', 'INVOICE', 'RECEIPT'].every(node) && edge('HOUSE-ROOM') && !node('title1') && !node('title2'));
  // Mermaid 12.3.0's own parser on the valid part (the file to its broken input; once, 14 Nov 2026, from the npm package
  // in a scratch folder, not a dependency) reads the same 29 entities and two more, title1 and title2, which are groups
  // here; their attributes and keys (`string?` its type, `*code` its name); and the same 18 relationships, ends and
  // labels, and two more with those groups
  assert.deepEqual([model.nodes.filter(n => n.id !== 'OPEN').length, model.edges.filter(e => e.props && e.id !== 'dock-2' && e.id !== 'SHIP-dock').length], [29, 18]);
});

test('the same source read twice gives the same ids (R3); an inserted relationship renames only the later ones of its pair', () => {
  const ids = m => [...m.nodes.flatMap(n => [n.id, ...(n.members || []).map(x => x.id)]), ...m.edges.map(e => e.id)];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  const a = read('erDiagram\nA ||--o{ B : one\nA ||--o{ B : two\nC ||--|| D : x\n').model;
  const b = read('erDiagram\nC ||--|| D : w\nA ||--o{ B : one\nA ||--o{ B : two\nC ||--|| D : x\n').model;
  assert.deepEqual(a.edges.map(e => e.id), ['A-B', 'A-B-2', 'C-D']);
  assert.deepEqual(b.edges.map(e => e.id), ['C-D', 'A-B', 'A-B-2', 'C-D-2']);
  // a column takes the next free after another element's id; an arrow in a name or a hint is a dash, reported for a hint
  const c = read('erDiagram\n"a->b"\n%% id: A.x\nB\nA {\nint x\n}\n%% id: p->q\nA ||--|| B : r\n');
  assert.deepEqual(c.model.nodes.map(n => [n.id, (n.members || []).map(x => x.id)]), [['a-b', []], ['A.x', []], ['A', ['A.x-2']]]);
  assert.deepEqual(c.model.edges.map(e => e.id), ['p-q']);
  assert.deepEqual(c.report.map(x => `${x.line} ${x.message}`), ['2 entity a->b: an id holds no "->", so it is a-b', '9 %% id: p->q: an id holds no "->", so A -- B is p-q']);
});

test('text over the size limit is refused with a report; hostile input reads in under a second and never throws (§8, R2) (timed)', t => {
  const big = read('erDiagram\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit of 1048576/);
  const many = 'erDiagram\n' + Array.from({ length: 50000 }, (_, k) => `a${k % 300}||--o{b${k % 7}:x`).join('\n');
  const hostile = [
    ['subgraphs 90,000 deep', 'erDiagram\n' + 'subgraph s\n'.repeat(90000)],
    ['50,000 relationships among 307 names', many],
    ['one line of 130,000 columns', 'erDiagram\nA {' + ' int a'.repeat(130000) + ' }'],
    ['a line of 400,000 ? and a ~ at its end', 'erDiagram\nA {\n' + 'a?'.repeat(400000) + '~\n}'],
    ['a line of 200,000 ~', 'erDiagram\nA {\n' + 'a~ '.repeat(200000) + '\n}'],
    ['a line of 300,000 entities', 'erDiagram\n' + 'A{}'.repeat(300000)],
    ['400,000 stray }', 'erDiagram\n' + '}\n'.repeat(400000)],
    ['80,000 columns of one name', 'erDiagram\nA {\n' + 'int x\n'.repeat(80000) + '}'],
    ['an unclosed quote on 80,000 lines', 'erDiagram\n' + 'A ||--|| "b\n'.repeat(80000)],
    ['40,000 hints taken', 'erDiagram\n' + '%% id: x\nA ||--|| B : r\n'.repeat(40000)],
    ['a direction line of 100,000 words', 'erDiagram\n' + 'direction LR '.repeat(80000)],
    ['names of the prototype', 'erDiagram\n__proto__ {\n int constructor\n string toString\n}\nconstructor ||--o{ __proto__ : hasOwnProperty\n"valueOf" ||--|| __proto__ : x\n'],
  ];
  // in this process's CPU time, a slow run tried twice more, its best kept: CI runs the timed tests one file at a time, and
  // a cold or busy runner is several times slower than the work
  const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
  const best = f => { let [out, ms] = cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };
  for (const [what, h] of hostile) {
    assert.ok(h.length <= 1 << 20, `${what}: ${h.length}`);
    const [r, readMs] = best(() => read(h)), writeMs = best(() => write(r.model))[1];
    t.diagnostic(`${what}: read ${readMs.toFixed(0)} ms, write ${writeMs.toFixed(0)} ms (target and ceiling 1000 ms each)`);
    assert.ok(readMs < 1000, `${what}: read ${readMs} ms`);
    assert.ok(writeMs < 1000, `${what}: write ${writeMs} ms`);
    assert.deepEqual(core(r.model), [], what);
  }
  assert.deepEqual(read(hostile[0][1]).report.at(-1), { line: 90002, status: 'approximated', message: '90000 subgraphs are never closed with end: read to the end' });
  assert.equal(read(many).model.edges.length, 50000);
  assert.equal(read(hostile[2][1]).model.nodes[0].members.length, 1); // the one name once, the others reported
  const proto = read(hostile.at(-1)[1]).model;
  assert.deepEqual(proto.nodes.map(n => [n.id, (n.members || []).map(c => c.id)]), [['__proto__', ['__proto__.constructor', '__proto__.toString']], ['constructor', []], ['valueOf', []]]);
  assert.deepEqual(proto.edges.map(e => [e.id, e.label]), [['constructor-__proto__', 'hasOwnProperty'], ['valueOf-__proto__', 'x']]);
  assert.equal(Object.getPrototypeOf(proto.nodes[0]), Object.prototype);
  assert.deepEqual(canon(read(write(proto)).model), canon(proto));
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart LR\nA-->B', '---\ntitle: x\n', 'erDiagram\nA {\nint', 'erDiagram\n"\n""\n[\nA[\nA[]\nA["x"\nA ||\nA ||--\nA ||--|| \nA ||--|| B :\n:::\nA:::\n{\n}\nsubgraph\nsubgraph "\nend\n%% id:\n%% references:\nA {\n`\n``\nint\nint `x\nint x PK,\nint x "c\n?\n}\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('flowchart LR\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid erDiagram: nothing read' }]);
  // a row not read is reported and reading goes on in the block; after its } a statement may follow on the line
  const after = read('erDiagram\nA {\nint x PK,\nint y\n} B ||--|| A : r\n');
  assert.deepEqual(after.report.map(x => `${x.line} ${x.message}`), ['3 "int x PK," in A\'s block is not a column']);
  assert.deepEqual([after.model.nodes.map(n => n.id), after.model.nodes[0].members.map(c => c.id), after.model.edges.map(e => e.id)], [['A', 'B'], ['A.y'], ['B-A']]);
  const arrow = read('%% id: a->b\nerDiagram\n');
  assert.deepEqual([arrow.model.views[0].id, arrow.report.map(x => `${x.line} ${x.message}`)], ['a-b', ['1 %% id: a->b: an id holds no "->", so the view is a-b']]);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', '`', '~', '?', ',', ':', ':::', '\n', '||', '--', '..', 'o{', '[', ']', '%% id: x\n', '%% references: y\n', 'subgraph ', 'end\n', 'PK', '#quot;', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(core(out.model), [], chars.join(''));
    const back = read(write(out.model));
    assert.deepEqual(canon(back.model), canon(out.model), chars.join('')); // what was read is written back whole
  }
});

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  const E = (id, more) => ({ id, type: 'er.Entity', label: id, ...more }), C = (id, label, props, more) => ({ id, type: 'er.Column', label, props, ...more });
  const m = { schemaVersion: 2, nodes: [
    E('a', { props: { x: 1 }, members: [C('a.id', 'id', { dataType: 'int', primaryKey: false, check: 'x > 0' }), C('a.nt', 'nt', {}), C('a.two', 'id', { dataType: 'int' }),
      { id: 'a.op', type: 'uml.Operation', label: 'f' }, C('a.c', 'c', { dataType: 'int', references: ' padded ' }, { ext: { mermaid: { comment: 'ok', other: 1 } } }),
      C('a.t', 'x~y', { dataType: 'p~q' })] }),
    E('b', { label: undefined }), E('e', { label: '' }), { id: 'k', type: 'uml.Class', label: 'K' }, { id: 'n', type: 'uml.Comment', label: 'note' }],
  edges: [{ id: 'r', type: 'er.Relationship', from: 'a', to: 'b', label: '', props: { ends: { from: { multiplicity: '2..5', role: 'x' }, to: {} }, weight: 2 } },
    { id: 'r2', type: 'er.Relationship', from: 'a', to: 'k', props: { identifying: true, ends: { from: { multiplicity: '1' }, to: { multiplicity: '*' } } } },
    { id: 'l', type: 'uml.CommentLink', from: 'n', to: 'a' }],
  views: [{ id: 'v', diagram: 'er', notation: 'idef1x', nodeIds: ['a', 'b', 'e', 'k', 'n'] }] };
  const text = write(m, 'v');
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: v: notation idef1x: Mermaid draws crow\'s foot', '%% not written: k (uml.Class)', '%% not written: n (uml.Comment)',
    '%% not written: a: property x', '%% not written: a.id: property check', '%% not written: a.id: primaryKey false, read as absent', '%% not written: a.nt (er.Column)',
    '%% not written: a.two (er.Column)', '%% not written: a.op (uml.Operation)', '%% not written: a.c: ext, but for ext.mermaid.comment',
    '%% not written: a.c: references  padded , which the reader would not keep', '%% not written: a.t (er.Column)', '%% not written: b: no label, read as its name',
    '%% not written: e: an empty label, read as its name', '%% not written: r: property weight', '%% not written: r: role at its from end',
    '%% not written: r: multiplicity 2..5 at its from end, written as 1..*', '%% not written: r: multiplicity none at its to end, written as 1',
    '%% not written: r: identifying unset, written as non-identifying', '%% not written: r: an empty label, read as none', '%% not written: r2 (er.Relationship)', '%% not written: l (uml.CommentLink)']);
  assert.match(text, /\n {2}a \}\|\.\.\|\| b : ""\n/);
  const back = read(text);
  assert.deepEqual(back.report.filter(x => !ONCE.test(x.message)), []);
  assert.deepEqual(back.model.nodes.map(n => [n.id, (n.members || []).map(c => c.id)]), [['a', ['a.id', 'a.c']], ['b', []], ['e', []]]);
  // an entity whose id Mermaid cannot write as a name is written as `entity` under its %% id:, with its label as the
  // alias; one that would start with a keyword of Mermaid's lexer, in quotes
  const odd = { schemaVersion: 2, nodes: [E('q"x'), E('entity'), E('one', { label: 'One' })], edges: [{ id: 'q"x-entity', type: 'er.Relationship', from: 'q"x', to: 'entity', props: { identifying: true, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } } }],
    views: [{ id: 'er-diagram', diagram: 'er', nodeIds: ['q"x', 'entity', 'one'] }] };
  const oddText = write(odd);
  assert.match(oddText, /\n {2}%% id: q"x\n {2}entity-2\["q#quot;x"\]\n {2}entity\n {2}"one"\["One"\]\n {2}entity-2 \|\|--o\{ entity : ""\n/);
  assert.deepEqual(canon(read(oddText).model), canon({ ...odd, root: 'er-diagram' }));
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const classes = json('../examples/sales-classes.json');
  assert.equal(write(classes), '%% not written: the model, which has no er view\n');
  assert.match(write(classes, classes.views[0].id), /^%% not written: view .*, not an er one\n$/);
});
