// The Mermaid classDiagram reader and writer (plan.md 1.10): read(write(model)) equals the model on the subset; the file
// with every construct on Mermaid's class page gives the pinned report (risks.md R1, R4); same source, same ids (R3); a
// size limit, and malformed input reported, never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidClass as read, writeMermaidClass as write } from '../src/readers/mermaid-class.js';
import { validate } from '../lib/umlimator-all.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/classes.mmd', import.meta.url), 'utf8');

// the model as one view of it shows it, which is what Mermaid's text carries: that view's nodes (a parent outside it
// dropped), the lines between them, and of the view its id, title, direction and nodes (not its layout or present)
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  const nodes = m.nodes.filter(n => ids.has(n.id)).map(n => { const c = structuredClone(n); if (c.parent != null && !ids.has(c.parent)) delete c.parent; return c; });
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes, edges: m.edges.filter(e => ids.has(e.from) && ids.has(e.to)),
    views: [{ id: v.id, diagram: 'uml.class', ...(title ? { title } : {}), ...(v.direction === 'down' ? { direction: 'down' } : {}), nodeIds: v.nodeIds }] };
}
// order is meaning only for members (model.md §1 rule 8): nodes, lines and a view's nodes compare as sets
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });
const roundTrip = (m, viewId) => { const text = write(m, viewId), back = read(text); return { text, back }; };

test('read(write(model)) is the class example, view by view, and nothing is reported', () => {
  const m = json('../docs/diagrams/examples/01-class.json');
  for (const v of m.views) {
    const { text, back } = roundTrip(m, v.id);
    assert.deepEqual(back.report, [], text);
    assert.deepEqual(canon(back.model), canon(project(m, v.id)), text);
  }
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function generate(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], maybe = (p, x) => (r() < p ? x : undefined), used = new Set();
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  const nodes = [], edges = [], packages = [], classes = [], kinds = new Map();
  const NAMES = ['Order', 'card-payment', 'Line_2', 'Ünit', 'Book', 'Shelf', 'a', 'Z9', 'Money', 'Thing-one-two', 'Customer', 'Payment', 'Two words!'];
  const TYPES = ['String', 'Integer', 'List<int>', 'Map<K, V>', 'List<List<Money>>', 'int[]', 'Instant'];
  const label = id => pick([id, id, 'Label with spaces', 'Quotes "and" <angles>', 'Two\nlines']);
  for (let k = 0, n = Math.floor(r() * 3); k < n; k++) {
    const id = take(pick(['sales', 'core', 'core-io']), `pkg${k}`), parent = maybe(0.4, packages.length ? pick(packages) : undefined);
    packages.push(id); nodes.push(clean({ id, type: 'uml.Package', label: label(id), parent }));
  }
  for (let k = 0, n = 1 + Math.floor(r() * 7); k < n; k++) {
    const id = take(pick(NAMES), `C${k}`), type = pick(['uml.Class', 'uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType']);
    const members = [], labels = new Set();
    for (let j = 0, mN = Math.floor(r() * 5); j < mN; j++) {
      const kind = type === 'uml.Enumeration' ? 'uml.EnumerationLiteral' : pick(['uml.Property', 'uml.Operation']);
      const name = pick(kind === 'uml.Property' ? ['total', 'unit price', 'count', 'id', 'x'] : ['place', 'add', 'settle', 'go']);
      const lbl = kind === 'uml.EnumerationLiteral' ? pick(['DRAFT', 'placed', 'Shipped_2', 'x']) : name;
      if (kind === 'uml.EnumerationLiteral' && labels.has(lbl)) continue;
      labels.add(lbl);
      const vis = maybe(0.7, pick(['public', 'private', 'protected', 'package']));
      const props = kind === 'uml.Property' ? clean({ visibility: vis, valueType: maybe(0.7, pick(TYPES)), multiplicity: maybe(0.3, pick(['0..1', '1..*', '*', '3'])),
        default: maybe(0.3, pick(['draft', '0', '"none"', 'a = b'])), isStatic: maybe(0.2, true), isDerived: maybe(0.2, true) })
        : kind === 'uml.Operation' ? clean({ visibility: vis, returnType: maybe(0.5, pick(TYPES)), isStatic: maybe(0.2, true), isAbstract: maybe(0.2, true),
          parameters: maybe(0.6, Array.from({ length: 1 + Math.floor(r() * 3) }, (_, q) => clean({ name: `p${q}`, valueType: maybe(0.7, pick(TYPES)), direction: maybe(0.3, pick(['in', 'out', 'inout', 'return'])) }))) })
        : {};
      members.push(clean({ id: take(`${id}.${lbl}`, `m${k}-${j}`), type: kind, label: lbl, props: Object.keys(props).length ? props : undefined }));
    }
    const props = clean({ isAbstract: maybe(0.2, true), stereotypes: maybe(0.3, pick([['entity'], ['service', 'Repo']])) });
    classes.push(id); kinds.set(id, type);
    nodes.push(clean({ id, type, label: label(id), parent: maybe(0.5, packages.length ? pick(packages) : undefined), props: Object.keys(props).length ? props : undefined, members: members.length ? members : undefined }));
  }
  for (let k = 0, n = Math.floor(r() * 8); k < n; k++) {
    let from = pick(classes), to = pick(classes), type = pick(['uml.Association', 'uml.Association', 'uml.Generalization', 'uml.InterfaceRealization', 'uml.Dependency']);
    if (type === 'uml.InterfaceRealization') { // from a classifier to an interface, which is what the reader makes of its target
      const ifaces = classes.filter(c => kinds.get(c) === 'uml.Interface'), others = classes.filter(c => kinds.get(c) !== 'uml.Interface');
      if (ifaces.length && others.length) { from = pick(others); to = pick(ifaces); } else type = 'uml.Dependency';
    }
    const end = () => clean({ role: maybe(0.4, pick(['lines', 'the owner'])), multiplicity: maybe(0.5, pick(['1', '0..1', '0..*', '1..*', '*', '2..5'])), aggregation: maybe(0.3, pick(['composite', 'shared'])), navigable: maybe(0.4, true) });
    const ends = type === 'uml.Association' ? clean({ from: end(), to: end() }) : {};
    Object.keys(ends).forEach(k2 => { if (!Object.keys(ends[k2]).length) delete ends[k2]; });
    const props = clean({ ends: Object.keys(ends).length ? ends : undefined, stereotypes: maybe(0.2, ['use']) });
    edges.push(clean({ id: take(`${from}-${to}`, `e${k}`), type, from, to, label: maybe(0.4, pick(['places', 'is paid by: card'])), props: Object.keys(props).length ? props : undefined }));
  }
  for (let k = 0, n = Math.floor(r() * 3); k < n; k++) {
    const id = take(`note-${k + 1}`, `n${k}`); nodes.push({ id, type: 'uml.Comment', label: pick(['A note', 'two\nlines "quoted"']) });
    if (r() < 0.6) edges.push({ id: take(`${id}-link`, `l${k}`), type: 'uml.CommentLink', from: id, to: pick(classes) });
  }
  const title = maybe(0.6, pick(['Sales', 'Sales: the domain', "It's here"])), view = clean({ id: pick(['class-diagram', 'domain']), diagram: 'uml.class', title,
    direction: maybe(0.5, 'down'), nodeIds: nodes.map(n => n.id).sort(() => r() - 0.5) });
  return clean({ schemaVersion: 2, title, root: view.id, nodes, edges, views: [view] });
}

test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let both = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), { text, back } = roundTrip(m), want = structuredClone(m);
    // an end with a diamond has no arrowhead in Mermaid: its navigable is not written, and the text says so
    for (const e of want.edges) for (const [w, end] of Object.entries(e.props?.ends ?? {})) if (end.aggregation && end.navigable) {
      delete end.navigable; both++;
      assert.ok(text.includes(`%% not written: ${e.id}: navigable at the ${w} end, which has a ${end.aggregation} diamond\n`), `seed ${seed}\n${text}`);
    }
    assert.deepEqual(back.report, [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(want), `seed ${seed}\n${text}`);
  }
  assert.ok(both > 0, 'the generator makes an end both navigable and with a diamond');
});

test('a file with every construct on Mermaid\'s class page gives the pinned report (R1, R4)', () => {
  const { model, report } = read(every);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    '10 approximated: direction RL is drawn left to right',
    '11 skipped: accTitle: accessibility text is not read',
    '12 skipped: accDescr: accessibility text is not read',
    "46 approximated: class Square's type parameter is kept in its name only, Square<Shape> (templates are not in the subset)",
    '60 approximated: classM ..|> classN: classN is realized, so it is read as an interface',
    '61 approximated: classO .. classP: a dashed link with no arrow is read as a dependency from classO to classP',
    "63 skipped: Animal <|--|> Zebra: a two-way inheritance has no counterpart in UML's class diagram",
    '66 approximated: bar ()-- foo: the lollipop bar is an interface foo realizes, drawn as a box',
    '83 approximated: cardinality "many" is read as the multiplicity *',
    '93 skipped: click: links and callbacks are not read',
    '94 skipped: callback: links and callbacks are not read',
    '95 skipped: link: links and callbacks are not read',
    '97 skipped: style: styling is not read',
    '98 skipped: :::someclass on class Mineral: styling is not read',
    '99 skipped: classDef: styling is not read',
    '100 skipped: cssClass: styling is not read',
  ]);
  const node = id => model.nodes.find(n => n.id === id), edge = (a, b) => model.edges.find(e => e.from === a && e.to === b);
  assert.equal(model.title, "Every construct on Mermaid's class diagram page");
  assert.deepEqual(validate(model).filter(p => p.level === 'error'), []);
  // classes, labels, backticks, annotations three ways
  assert.equal(node('Car').label, 'Car with *! symbols');
  assert.deepEqual(node('Car').props, { stereotypes: ['Service'] });
  assert.equal(node('Animal Class!').type, 'uml.Class');
  assert.deepEqual([node('Shape').type, node('Color').type, node('bar').type, node('classN').type], ['uml.Interface', 'uml.Enumeration', 'uml.Interface', 'uml.Interface']);
  assert.deepEqual(node('Color').members.map(x => [x.id, x.type]), [['Color.RED', 'uml.EnumerationLiteral'], ['Color.BLUE', 'uml.EnumerationLiteral']]);
  // members: both ways, Mermaid's `Type name` and `name : Type`, generics, static and abstract
  assert.deepEqual(node('Animal').members.map(x => x.id), ['Animal.age', 'Animal.gender', 'Animal.isMammal']);
  assert.deepEqual(node('BankAccount').members.map(x => [x.label, x.props]), [
    ['owner', { visibility: 'public', valueType: 'String' }], ['balance', { visibility: 'public', valueType: 'BigDecimal', isStatic: true }],
    ['deposit', { visibility: 'public', parameters: [{ name: 'amount' }], returnType: 'bool' }],
    ['withdrawal', { visibility: 'public', parameters: [{ name: 'amount' }], returnType: 'int' }],
    ['audit', { visibility: 'package', isStatic: true }], ['someAbstractMethod', { visibility: 'protected', returnType: 'int', isAbstract: true }],
    ['idCard', { visibility: 'private', valueType: 'IdCard' }]]);
  assert.deepEqual(node('Square').members.map(x => x.props.valueType ?? x.props.returnType ?? x.props.parameters[0].valueType),
    ['int', 'List<int>', 'List<int>', 'List<int>', 'List<List<int>>']);
  // every relation, labels, cardinality, two ways
  assert.deepEqual([['classA', 'classB'], ['classC', 'classD'], ['classE', 'classF'], ['classG', 'classH'], ['classI', 'classJ'], ['classK', 'classL'], ['classM', 'classN'], ['classO', 'classP']]
    .map(([a, b]) => [edge(a, b).type, edge(a, b).label, JSON.stringify(edge(a, b).props ?? {})]), [
    ['uml.Generalization', 'Inheritance', '{}'], ['uml.Association', 'Composition', '{"ends":{"to":{"aggregation":"composite"}}}'],
    ['uml.Association', 'Aggregation', '{"ends":{"to":{"aggregation":"shared"}}}'], ['uml.Association', 'Association', '{"ends":{"to":{"navigable":true}}}'],
    ['uml.Association', 'Link(Solid)', '{}'], ['uml.Dependency', 'Dependency', '{}'], ['uml.InterfaceRealization', 'Realization', '{}'], ['uml.Dependency', 'Link(Dashed)', '{}']]);
  assert.deepEqual([edge('Duck', 'Animal').type, edge('Owner', 'Pet').props.ends, edge('foo', 'bar').type],
    ['uml.Generalization', { from: { navigable: true }, to: { navigable: true } }, 'uml.InterfaceRealization']);
  assert.deepEqual(edge('Customer', 'Ticket').props.ends, { from: { multiplicity: '1' }, to: { multiplicity: '*', navigable: true } });
  // namespaces: labelled, dotted; notes, one for a class
  assert.deepEqual(['Triangle', 'UserService', 'TechLead'].map(id => node(id).parent), ['BaseShapes', 'Auth', 'Company.Engineering']);
  assert.deepEqual([node('Auth').label, node('Company.Engineering').parent], ['Authentication Service', 'Company']);
  assert.deepEqual([node('note-2').label, edge('note-2', 'Duck').type], ['can fly\ncan swim', 'uml.CommentLink']);
  assert.equal(model.views[0].direction, undefined); // RL is right, the default
});

test('the same source read twice gives the same ids (R3)', () => {
  const ids = m => [...m.nodes.flatMap(n => [n.id, ...(n.members || []).map(x => x.id)]), ...m.edges.map(e => e.id)];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  // a relation drawn twice, and one added in front of the others, keep the names of the rest
  const a = read('classDiagram\nA --> B\nA --> B\nC --> D\n').model, b = read('classDiagram\nX --> Y\nA --> B\nA --> B\nC --> D\n').model;
  assert.deepEqual(a.edges.map(e => e.id), ['A-B', 'A-B-2', 'C-D']);
  assert.deepEqual(b.edges.map(e => e.id), ['X-Y', 'A-B', 'A-B-2', 'C-D']);
});

test('text over the size limit is refused with a report; a large file under it reads in linear time (R2)', () => {
  const big = read('classDiagram\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit/);
  const lines = Array.from({ length: 25000 }, (_, k) => `C${k} "1" *--> "0..*" D${k} : owns`).join('\n'), t0 = performance.now();
  const r = read('classDiagram\n' + lines);
  assert.equal(r.model.edges.length, 25000);
  assert.ok(performance.now() - t0 < 5000, `${performance.now() - t0} ms`);
  const t1 = performance.now(); read('classDiagram\nclass A{\n' + '+x : ' + 'List~'.repeat(150000) + '\n}\n'); // tilde runs, unbalanced
  assert.ok(performance.now() - t1 < 2000, `${performance.now() - t1} ms`);
  // one name repeated: a relation, a member, a hinted note, each id one more -<n>; finding the next is not a count from 2
  for (const each of ['A-->B\n', 'A : x\n', '%% id: x\nnote "a"\n']) {
    const t2 = performance.now(), r2 = read('classDiagram\n' + each.repeat(40000));
    assert.ok(performance.now() - t2 < 3000, `${JSON.stringify(each)}: ${performance.now() - t2} ms`);
    const ids = [...r2.model.nodes.flatMap(n => [n.id, ...(n.members || []).map(x => x.id)]), ...r2.model.edges.map(e => e.id)];
    assert.equal(new Set(ids).size, ids.length);
  }
  const w = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'A', members: Array.from({ length: 20000 }, (_, k) => ({ id: `m${k}`, type: 'uml.Property', label: 'x' })) }], edges: [], views: [] };
  const t3 = performance.now(), wrote = write(w);
  assert.ok(performance.now() - t3 < 3000, `${performance.now() - t3} ms`);
  assert.equal(read(wrote).model.nodes[0].members.at(-1).id, 'm19999');
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart LR\nA-->B', '---\ntitle: x\n', 'classDiagram\nclass A{\n+x', 'classDiagram\nclass\nnamespace\nnote\n}\n<<x>>\nA "1\nA --> \n:::\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('flowchart LR\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid classDiagram: nothing read' }]);
  assert.deepEqual(read('classDiagram\nclass A{\n+x').report, [{ line: 3, status: 'approximated', message: 'class A is never closed: read to the end' }]);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', '`', '~', '<<', '>>', '(', ')', ':', '\n', '--', '..', '|>', '*', '$', '%%', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(validate(out.model).filter(p => p.level === 'error'), [], chars.join(''));
  }
});
function pick(r, a) { return a[Math.floor(r() * a.length)]; }

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'a' }, { id: 'u', type: 'uml.Actor', label: 'U' }],
    edges: [{ id: 'x', type: 'uml.Usage', from: 'a', to: 'a' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'u'] }] };
  const text = write(m, 'v');
  assert.match(text, /%% not written: u \(uml\.Actor\)\n {2}%% not written: x \(uml\.Usage\)\n$/);
  assert.deepEqual(read(text).model.nodes, [{ id: 'a', type: 'uml.Class', label: 'a' }]);
  assert.deepEqual(read(text).report, []);
});

// the review of 1.10: each finding's case
test('a name the id rule changes is made unique and reported; a renamed namespace is reported at its line', () => {
  const r = read('classDiagram\nclass `A->B`\nclass `A-B`\nA --> B');
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.label]), [['A-B-2', 'A->B'], ['A-B', 'A-B'], ['A', 'A'], ['B', 'B']]);
  assert.deepEqual(r.report, [{ line: 2, status: 'approximated', message: 'class A->B: an id holds no "->", so it is A-B-2' }]);
  const n = read('classDiagram\nclass A\nnamespace A {\nclass B\n}');
  assert.deepEqual(n.report, [{ line: 3, status: 'approximated', message: "namespace A has a class's name: it is A-namespace" }]);
  assert.equal(n.model.nodes.find(x => x.id === 'B').parent, 'A-namespace');
});

test('a realization\'s target is an interface, reported when it was not declared one', () => {
  const r = read('classDiagram\nA ..|> B\nC <|.. D\nclass E {\n<<interface>>\n}\nF ..|> E');
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.type]), [['A', 'uml.Class'], ['B', 'uml.Interface'], ['C', 'uml.Interface'], ['D', 'uml.Class'], ['E', 'uml.Interface'], ['F', 'uml.Class']]);
  assert.deepEqual(r.report.map(x => x.line), [2, 3]);
});

test('names that are Object.prototype\'s read and write as any other', () => {
  for (const k of ['constructor', '__proto__', 'toString']) {
    const n = read(`classDiagram\nclass A {\n<<${k}>>\n}`).model.nodes[0];
    assert.deepEqual([n.type, n.props], ['uml.Class', { stereotypes: [k] }]);
    const text = write({ schemaVersion: 2, nodes: [{ id: 'A', type: k, label: 'A' }, { id: 'B', type: 'uml.Class', label: 'B', members: [{ id: 'B.x', type: 'uml.Property', label: 'x', props: { visibility: k } }] }], views: [] });
    assert.doesNotMatch(text, /native code|\[object/);
    assert.match(text, new RegExp(`%% not written: A \\(${k}\\)\n {2}%% not written: B\\.x: visibility ${k}\n$`));
  }
});

test('Mermaid\'s n is the multiplicity *, reported as many is', () => {
  const r = read('classDiagram\nA "0..n" --> "n" B\nclass C {\n+x : int[1..n]\n+y : int[5..2]\n}');
  assert.deepEqual(r.model.edges[0].props.ends, { from: { multiplicity: '0..*' }, to: { multiplicity: '*', navigable: true } });
  assert.deepEqual(r.model.nodes[2].members.map(x => x.props), [{ visibility: 'public', valueType: 'int', multiplicity: '1..*' }, { visibility: 'public', valueType: 'int[5..2]' }]);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.message}`), ['2 cardinality "0..n" is read as the multiplicity 0..*', '2 cardinality "n" is read as the multiplicity *', '4 C.x: multiplicity [1..n] is read as [1..*]']);
});

test('the writer keeps a line break, a >> or a structural line out of the text, and says what it left out', () => {
  const cls = members => ({ schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'A', props: { stereotypes: ['a>>b', 'x\ny', 'interface', 'ok'] }, members }], views: [] });
  const m = cls([{ id: 'A.x', type: 'uml.Property', label: 'x\n}\nclass Evil' }, { id: 'A.d', type: 'uml.Property', label: 'd', props: { default: 'a\nb' } },
    { id: 'm\nclass Z', type: 'uml.Property', label: 'z' }, { id: 'A.c', type: 'uml.Operation', label: 'c', props: { returnType: 'T\nU' } }, { id: 'A.k', type: 'uml.EnumerationLiteral', label: '}' }]);
  const text = write(m), back = read(text);
  assert.deepEqual(back.model.nodes, [{ id: 'A', type: 'uml.Class', label: 'A', props: { stereotypes: ['ok'] } }], text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: A: stereotype a>>b', '%% not written: A: stereotype x\\ny', '%% not written: A: stereotype interface',
    '%% not written: A.x (uml.Property)', '%% not written: A.d (uml.Property)', '%% not written: m\\nclass Z (uml.Property)',
    '%% not written: A.c (uml.Operation)', '%% not written: A.k (uml.EnumerationLiteral)']);
  const v = write({ schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'A' }], edges: [{ id: 'e\nclass Q', type: 'uml.Dependency', from: 'A', to: 'A' }], views: [{ id: 'v\nclass R', diagram: 'uml.class', nodeIds: ['A'] }] });
  assert.deepEqual(read(v).model.nodes.map(n => n.id), ['A'], v);
  assert.deepEqual(read(v).model.edges, [], v);
});

test('the writer says what it drops: a parent cycle, a class\'s class parent, a line to a member, a view it cannot find', () => {
  const C = (id, parent, type = 'uml.Class') => ({ id, type, label: id, ...(parent ? { parent } : {}) });
  const cyc = write({ schemaVersion: 2, nodes: [C('p', 'q', 'uml.Package'), C('q', 'p', 'uml.Package'), C('A', 'q'), C('B', 'A'), { ...C('D'), members: [{ id: 'D.x', type: 'uml.Property', label: 'x' }] }],
    edges: [{ id: 'e', type: 'uml.Dependency', from: 'D.x', to: 'D' }], views: [] });
  assert.deepEqual(cyc.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: B: its parent A, a uml.Class, which only a namespace can be', '%% not written: p (uml.Package)', '%% not written: q (uml.Package)',
    '%% not written: A (uml.Class)', '%% not written: e (uml.Dependency)']);
  const m = json('../docs/diagrams/examples/01-class.json');
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const weather = json('../examples/weather.json');
  assert.equal(write(weather), '%% not written: the model, which has no uml.class view\n');
  assert.match(write(weather, weather.views[0].id), /^%% not written: view .*, not a uml\.class one\n$/);
});

test('a directive over several lines is passed over; a view with no direction is down; o and * mark only before a space', () => {
  const r = read('%%{\n  init: {\n    "theme": "dark"\n  }\n}%%\nclassDiagram\nclass A');
  assert.deepEqual([r.model.nodes.map(n => n.id), r.report.map(x => `${x.line} ${x.status}`)], [['A'], ['1 skipped']]);
  assert.equal(read('classDiagram\nclass A').model.views[0].direction, 'down');
  assert.deepEqual(read('classDiagram\nA --oak').model.edges, [{ id: 'A-oak', type: 'uml.Association', from: 'A', to: 'oak' }]);
  assert.deepEqual(read('classDiagram\nA --o B').model.edges[0].props, { ends: { to: { aggregation: 'shared' } } });
});
