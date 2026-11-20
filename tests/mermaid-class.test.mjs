// The Mermaid classDiagram reader and writer (plan.md 1.10; notes/stage-2.md §11): read(write(model)) equals the model on
// the subset, less the owners a view does not show, which the text names; the file with every construct on Mermaid's
// class page gives the pinned report (risks.md R1, R4); same source, same ids (R3); a size limit, and malformed input
// reported, never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidClass as read, writeMermaidClass as write } from '../src/readers/mermaid-class.js';
import { readMermaidFlowchart } from '../src/readers/mermaid-flowchart.js';
import { readMermaidEr } from '../src/readers/mermaid-er.js';
import { readMermaidState } from '../src/readers/mermaid-state.js';
import { readMermaidSequence } from '../src/readers/mermaid-sequence.js';
import { readMermaidMindmap } from '../src/readers/mermaid-mindmap.js';
import { readMermaidRequirement } from '../src/readers/mermaid-requirement.js';
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
// the writer's line for each shown element whose owner the view does not show (notes/stage-2.md §11, option a); of a
// namespace written whose id is that owner's dotted path, it says Mermaid draws the owner, as it splits the name
const hiddenOwners = (m, nodeIds) => {
  const ids = new Set(nodeIds), holds = id => m.nodes.some(n => ids.has(n.id) && n.parent === id && n.type !== 'uml.Comment' && (n.type !== 'uml.Package' || holds(n.id)));
  return m.nodes.filter(n => ids.has(n.id) && n.parent != null && !ids.has(n.parent)).map(n => `%% not written: ${n.id}: its parent ${n.parent}, which the view does not show` +
    (n.type === 'uml.Package' && String(n.id).startsWith(`${n.parent}.`) && holds(n.id) ? `, though Mermaid draws ${n.parent}, as it splits ${n.id} at its dots` : ''));
};
const notWritten = text => text.split('\n').filter(l => l.includes('%% not written:')).map(l => l.trim());

test('read(write(model)) is the class example, view by view, less the owners a view does not show, which the text names', () => {
  const m = json('../examples/sales-classes.json');
  for (const v of m.views) {
    const { text, back } = roundTrip(m, v.id);
    assert.deepEqual(back.report, [], text);
    assert.deepEqual(canon(back.model), canon(project(m, v.id)), text);
    assert.deepEqual(notWritten(text), hiddenOwners(m, v.nodeIds), text);
  }
  // "Payments only" shows four classes of sales without sales
  assert.deepEqual(hiddenOwners(m, m.views.find(v => v.id === 'payments-only').nodeIds).length, 4);
});

test('read(write(model)) is 03-package.json\'s classes in a class view, less the owners the view does not show and the packages\' lines, which the text names', () => {
  // less the profile and its application 6.7 added for the Bookshop atlas: Mermaid's class diagram has neither
  const m = json('../examples/bookshop-packages.json'); m.nodes = m.nodes.filter(n => n.type !== 'uml.Profile'); m.edges = m.edges.filter(e => e.type !== 'uml.ProfileApplication');
  const pkg = new Set(m.nodes.filter(n => n.type === 'uml.Package').map(n => n.id));
  const views = {
    all: m.nodes.map(n => n.id), // payments holds card, which holds card-payment: nested braces
    classes: m.nodes.filter(n => !pkg.has(n.id)).map(n => n.id), // every owner hidden
    some: ['payments-package', 'payable', 'card-payment', 'sales', 'order', 'wholesale-order'], // card and wholesale hidden
  };
  const lines = { all: m.edges.map(e => `%% not written: ${e.id} (${e.type})`), classes: [], some: ['%% not written: sales-needs-payments (uml.Dependency)'] };
  for (const [id, nodeIds] of Object.entries(views)) {
    const c = { ...m, root: id, views: [{ id, diagram: 'uml.class', nodeIds }] }, { text, back } = roundTrip(c, id), want = project(c, id);
    want.edges = want.edges.filter(e => !pkg.has(e.from) && !pkg.has(e.to)); // Mermaid draws a relation between classes only
    assert.deepEqual(back.report, [], text);
    assert.deepEqual(canon(back.model), canon(want), text);
    assert.deepEqual(notWritten(text).sort(), [...hiddenOwners(c, nodeIds), ...lines[id]].sort(), text);
    // with every owner hidden, the two Orders of two packages read back as two classes of one name: option (a)'s cost
    assert.deepEqual(validate(back.model).filter(p => p.level === 'error').map(p => p.rule), id === 'classes' ? ['classifier-names'] : [], text);
  }
  assert.ok(write({ ...m, views: [{ id: 'v', diagram: 'uml.class', nodeIds: views.all }] }).includes(['  namespace payments-package["payments"] {', '    class payable["Payable"] {',
    '      <<interface>>', '    }', '    class payment["Payment"]', '    namespace card {', '      class card-payment["CardPayment"]', '    }', '  }', ''].join('\n')));
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function generate(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], maybe = (p, x) => (r() < p ? x : undefined), used = new Set();
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  const nodes = [], edges = [], packages = [], classes = [], kinds = new Map();
  const NAMES = ['Order', 'card-payment', 'Line_2', 'Ünit', 'Book', 'Shelf', 'a', 'Z9', 'Money', 'Thing-one-two', 'Customer', 'Payment', 'Two words!'];
  const TYPES = ['String', 'Integer', 'List<int>', 'Map<K, V>', 'List<List<Money>>', 'int[]', 'Instant', 'std::string', 'ns::Node'];
  const label = id => pick([id, id, 'Label with spaces', 'Quotes "and" <angles>', 'Two\nlines']);
  for (let k = 0, n = Math.floor(r() * 5); k < n; k++) { // nested up to four deep, some by a dotted id (Company.Engineering)
    const parent = maybe(0.6, packages.length ? pick(packages) : undefined), id = take(parent && r() < 0.4 ? `${parent}.${pick(['io', 'core'])}` : pick(['sales', 'core', 'core-io']), `pkg${k}`);
    packages.push(id); nodes.push(clean({ id, type: 'uml.Package', label: label(id), parent }));
  }
  for (let k = 0, n = 1 + Math.floor(r() * 7); k < n; k++) {
    const id = take(pick(NAMES), `C${k}`), type = pick(['uml.Class', 'uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType']);
    const members = [], labels = new Set();
    for (let j = 0, mN = Math.floor(r() * 5); j < mN; j++) {
      const kind = type === 'uml.Enumeration' ? 'uml.EnumerationLiteral' : pick(['uml.Property', 'uml.Operation']);
      const name = pick(kind === 'uml.Property' ? ['total', 'unit price', 'count', 'id', 'x'] : ['place', 'add', 'settle', 'go']);
      const lbl = kind === 'uml.EnumerationLiteral' ? pick(['DRAFT', 'placed', 'Shipped_2', 'x']) : name;
      if (labels.has(lbl)) continue; // a classifier's members have different names (1.9's member-names)
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
    // a generalization joins two of one kind: the reader makes any other a realization or skips it (audit 38)
    // and closes no cycle: the reader skips the line that would (audit 44)
    const up = c => edges.filter(e => e.type === 'uml.Generalization' && e.from === c).map(e => e.to);
    const reaches = (a, b) => a === b || up(a).some(x => reaches(x, b));
    if (type === 'uml.Generalization') { const ok = classes.filter(c => kinds.get(c) === kinds.get(from) && !reaches(c, from)); if (ok.length) to = pick(ok); else type = 'uml.Dependency'; }
    const end = () => clean({ role: maybe(0.4, pick(['lines', 'the owner', 'phase 2', 'top 10', 'many', 'n'])), multiplicity: maybe(0.5, pick(['1', '0..1', '0..*', '1..*', '*', '2..5'])), aggregation: maybe(0.3, pick(['composite', 'shared'])), navigable: maybe(0.4, true) });
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
    direction: maybe(0.5, 'down'), nodeIds: nodes.filter(n => n.type !== 'uml.Package' || r() > 0.25).map(n => n.id).sort(() => r() - 0.5) }); // some owners hidden
  return clean({ schemaVersion: 2, title, root: view.id, nodes, edges, views: [view] });
}

test('read(write(model)) equals the model, less the owners the view does not show, for 500 generated models in the subset', () => {
  let roles = 0, both = 0, hidden = 0, nested = 0, empty = 0, dots = 0, implied = 0, splits = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), { text, back } = roundTrip(m), want = project(m, m.views[0].id), shown = new Set(m.views[0].nodeIds);
    // a hidden owner is left out, and the text names it on each element it held
    for (const line of hiddenOwners(m, m.views[0].nodeIds)) { hidden++; splits += line.includes('Mermaid draws'); assert.ok(text.includes(`  ${line}\n`), `seed ${seed}\n${line}\n${text}`); }
    // a namespace holding only dotted ones is written by them alone, and its label, unless the one they give, is not
    for (const [, id] of text.matchAll(/%% not written: (\S+): its label .*: it holds only namespaces, written by their dotted names\n/g)) {
      implied++; const p = want.nodes.find(n => n.id === id); p.label = id.slice(id.lastIndexOf('.') + 1);
    }
    if (/\n {2}namespace [^\s[]+\.[^\s[]+/.test(text)) dots++;
    // a namespace with no class in it, at any depth, is not written: Mermaid reads none
    const holds = id => want.nodes.some(n => n.parent === id && (n.type !== 'uml.Package' || holds(n.id)));
    for (const p of want.nodes.filter(n => n.type === 'uml.Package' && !holds(n.id))) {
      empty++; assert.ok(text.includes(`  %% not written: ${p.id} (uml.Package)\n`), `seed ${seed}\n${text}`);
      want.views[0].nodeIds = want.views[0].nodeIds.filter(id => id !== p.id); want.nodes = want.nodes.filter(n => n !== p);
    }
    const up = id => m.nodes.find(n => n.id === id)?.parent;
    if (m.nodes.some(n => shown.has(n.id) && n.type !== 'uml.Package' && shown.has(up(n.id)) && shown.has(up(up(n.id))))) nested++;
    // an end with a diamond has no arrowhead in Mermaid: its navigable is not written, and the text says so
    for (const e of want.edges) for (const [w, end] of Object.entries(e.props?.ends ?? {})) if (end.aggregation && end.navigable) {
      delete end.navigable; both++;
      assert.ok(text.includes(`%% not written: ${e.id}: navigable at the ${w} end, which has a ${end.aggregation} diamond\n`), `seed ${seed}\n${text}`);
    }
    // a role alone whose last word reads as a multiplicity (phase 2, top 10, many, n) would come back as another role and
    // a multiplicity: it is not written, and the text says so (audit 51)
    for (const e of want.edges) for (const [w, end] of Object.entries(e.props?.ends ?? {})) if (['phase 2', 'top 10', 'many', 'n'].includes(end.role) && end.multiplicity == null) {
      roles++; assert.ok(text.includes(`%% not written: ${e.id}: role ${end.role} at the ${w} end, which Mermaid's cardinality reads as another role or a multiplicity\n`), `seed ${seed}\n${text}`);
      delete end.role; if (!Object.keys(end).length) delete e.props.ends[w];
      if (!Object.keys(e.props.ends).length) delete e.props.ends;
      if (!Object.keys(e.props).length) delete e.props;
    }
    assert.deepEqual(back.report, [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(want), `seed ${seed}\n${text}`);
  }
  assert.ok(both > 0, 'the generator makes an end both navigable and with a diamond');
  assert.ok(roles > 10, `the generator makes a role alone that reads as a multiplicity (${roles})`);
  assert.ok(hidden > 100 && nested > 20 && empty > 20 && dots > 10 && implied > 0 && splits > 5, `the generator hides owners (${hidden}), nests a class two shown packages deep (${nested}), leaves packages empty (${empty}), writes dotted ids (${dots}), namespaces only they imply (${implied}) and a hidden owner's dotted path (${splits})`);
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
  // namespaces: labelled, dotted (tests/import/namespaces.mmd has every example of Mermaid's section); notes, one for a class
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

test('text over the size limit is refused with a report; a large file under it reads in linear time (R2) (timed)', () => {
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
  for (const each of ['A-->B\n', 'A : x\n', '%% id: x\nnote "a"\n']) { // a repeated member is reported, and its id still made
    const t2 = performance.now(), r2 = read('classDiagram\n' + each.repeat(40000));
    assert.ok(performance.now() - t2 < 3000, `${JSON.stringify(each)}: ${performance.now() - t2} ms`);
    const ids = [...r2.model.nodes.flatMap(n => [n.id, ...(n.members || []).map(x => x.id)]), ...r2.model.edges.map(e => e.id)];
    assert.equal(new Set(ids).size, ids.length);
  }
  const w = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'A' }], edges: Array.from({ length: 20000 }, (_, k) => ({ id: `e${k}`, type: 'uml.Dependency', from: 'A', to: 'A' })), views: [] };
  const t3 = performance.now(), wrote = write(w);
  assert.ok(performance.now() - t3 < 3000, `${performance.now() - t3} ms`);
  assert.equal(read(wrote).model.edges.at(-1).id, 'e19999');
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart LR\nA-->B', '---\ntitle: x\n', 'classDiagram\nclass A{\n+x', 'classDiagram\nclass\nnamespace\nnote\n}\n<<x>>\nA "1\nA --> \n:::\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('flowchart LR\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid classDiagram: nothing read' }]);
  assert.deepEqual(read('classDiagram\nclass A{\n+x').report, [{ line: 3, status: 'approximated', message: 'class A is never closed: read to the end' }]);
  // a body left open in the middle of the file: Mermaid's member holds no {, so the next class's { closes it there, said,
  // and that class reads its own members (audit 47)
  const open = read('classDiagram\nclass Order {\n  +int id\n\nclass Customer {\n  +String name\n}\nOrder --> Customer');
  assert.deepEqual(open.model.nodes.map(n => [n.id, (n.members || []).map(x => x.id)]), [['Order', ['Order.id']], ['Customer', ['Customer.name']]]);
  assert.deepEqual(open.report, [{ line: 5, status: 'approximated', message: 'class Order is not closed before this line: closed here' }]);
  const quoted = read('classDiagram\nclass A {\n+x\n+s "{"\n}\nclass B'); // a { in quotes is a member's text, as before
  assert.deepEqual([quoted.model.nodes.map(n => (n.members || []).length), quoted.report], [[2, 0], []]);
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
  const m = json('../examples/sales-classes.json');
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const map = json('./fixtures/integration-c4.json');
  assert.equal(write(map), '%% not written: the model, which has no uml.class view\n');
  assert.match(write(map, map.views[0].id), /^%% not written: view .*, not a uml\.class one\n$/);
});

test('a directive over several lines is passed over; a view with no direction is down; o and * mark only before a space', () => {
  const r = read('%%{\n  init: {\n    "theme": "dark"\n  }\n}%%\nclassDiagram\nclass A');
  assert.deepEqual([r.model.nodes.map(n => n.id), r.report.map(x => `${x.line} ${x.status}`)], [['A'], ['1 skipped']]);
  assert.equal(read('classDiagram\nclass A').model.views[0].direction, 'down');
  assert.deepEqual(read('classDiagram\nA --oak').model.edges, [{ id: 'A-oak', type: 'uml.Association', from: 'A', to: 'oak' }]);
  assert.deepEqual(read('classDiagram\nA --o B').model.edges[0].props, { ends: { to: { aggregation: 'shared' } } });
});

test('a member named twice is read once, reported; an interface that realizes one specializes it', () => {
  const r = read('classDiagram\nA ..|> B\nB ..|> C\nclass D {\n+x : int\n+x : String\n+f(a : int)\n+f(a : String)\n+f(b : int)\n}\nclass `a->>b`');
  assert.deepEqual(r.model.edges.map(e => [e.id, e.type]), [['A-B', 'uml.InterfaceRealization'], ['B-C', 'uml.Generalization']]);
  assert.deepEqual(r.model.nodes.find(n => n.id === 'D').members.map(x => x.id), ['D.x', 'D.f', 'D.f-2']);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    '2 approximated: A ..|> B: B is realized, so it is read as an interface', '3 approximated: B ..|> C: C is realized, so it is read as an interface',
    '3 approximated: B ..|> C: B is an interface, so it specializes C', '6 skipped: D.x: D has a member x already', '9 skipped: D.f: D has a member f(int) already',
    '11 approximated: class a->>b: an id holds no "->", so it is a-b']);
  assert.deepEqual(validate(r.model).filter(p => p.level === 'error'), []);
});

// stage 2 (notes/stage-2.md §11): nested namespaces as Mermaid 12.3.0 reads them, and what the writer says of an owner it
// does not write
test('the examples of Mermaid\'s namespace section give the pinned report and Mermaid\'s nesting, and write back as Mermaid reads them', () => {
  const src = readFileSync(new URL('import/namespaces.mmd', import.meta.url), 'utf8'), { model, report } = read(src);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "39 approximated: namespace Auth in Platform has another namespace's name: it is Auth-2",
    '41 skipped: UserService.login: UserService has a member login() already', '42 skipped: UserService.logout: UserService has a member logout() already']);
  // as Mermaid 12.3.0's ClassDB has them: Platform's Auth is Platform.Auth, not the Auth above, and UserService is in the
  // last namespace that names it; a dotted name's parts are namespaces, met again by the path
  const ns = model.nodes.filter(n => n.type === 'uml.Package').map(n => [n.id, n.label, n.parent ?? '']);
  assert.deepEqual(ns, [['BaseShapes', 'BaseShapes', ''], ['Auth', 'Authentication Service', ''], ['Company', 'Company', ''], ['Company.Engineering', 'Engineering', 'Company'],
    ['Company.Engineering.Backend', 'Backend', 'Company.Engineering'], ['Company.Engineering.Frontend', 'Frontend', 'Company.Engineering'], ['Platform', 'Platform', ''], ['Auth-2', 'Auth', 'Platform'], ['Data', 'Data', 'Platform']]);
  assert.deepEqual(['Triangle', 'UserService', 'Developer', 'TechLead', 'CEO', 'Repository', 'Gateway'].map(id => model.nodes.find(n => n.id === id).parent),
    ['BaseShapes', 'Auth-2', 'Company.Engineering.Backend', 'Company.Engineering', 'Company', 'Data', 'Platform']);
  assert.deepEqual(validate(model).filter(p => p.level === 'error'), []);
  // written back: Auth, now empty, is named, as Mermaid reads no empty namespace; the rest reads back as it was
  const text = write(model), want = structuredClone(model);
  want.nodes = want.nodes.filter(n => n.id !== 'Auth'); want.views[0].nodeIds = want.views[0].nodeIds.filter(id => id !== 'Auth');
  assert.deepEqual(notWritten(text), ['%% not written: Auth (uml.Package)']);
  assert.deepEqual(canon(read(text).model), canon(want), text);
  assert.ok(text.includes('\n  namespace Platform {\n    namespace Auth-2["Auth"] {\n      class UserService {\n'), text);
  // a dotted id is written dotted, at the top: in braces, or in backticks, Mermaid would read Company.Company.Engineering
  assert.ok(text.includes('\n  namespace Company.Engineering.Backend {\n    class Developer {\n'), text);
  assert.ok(!text.includes('`'), text);
  // a namespace that holds only dotted ones is not written but by them, and a label of its own is named
  const co = { schemaVersion: 2, nodes: [{ id: 'Co', type: 'uml.Package', label: 'Company' }, { id: 'Co.Eng', type: 'uml.Package', label: 'Eng', parent: 'Co' },
    { id: 'Lead', type: 'uml.Class', label: 'Lead', parent: 'Co.Eng' }], views: [] }, t2 = write(co);
  assert.deepEqual([t2.includes('namespace Co {'), t2.includes('\n  namespace Co.Eng {\n    class Lead\n  }\n')], [false, true], t2);
  assert.deepEqual(notWritten(t2), ['%% not written: Co: its label Company: it holds only namespaces, written by their dotted names']);
  assert.deepEqual(read(t2).model.nodes.map(n => [n.id, n.label, n.parent]), [['Co', 'Co', undefined], ['Co.Eng', 'Eng', 'Co'], ['Lead', 'Lead', 'Co.Eng']]);
  // numbers for ids, and a dotted id of more parts than the reader splits, are written as any other: in braces, in backticks
  const deep = Array.from({ length: 34 }, (_, k) => Array.from({ length: k + 1 }, () => 'a').join('.')), nested = { schemaVersion: 2, views: [],
    nodes: [...deep.map((id, k) => ({ id, type: 'uml.Package', label: 'a', ...(k ? { parent: deep[k - 1] } : {}) })), { id: 'C', type: 'uml.Class', label: 'C', parent: deep[33] }] };
  const parents = m => m.nodes.map(n => `${n.id} in ${n.parent}`).sort();
  assert.deepEqual(parents(read(write(nested)).model), parents(nested));
  assert.doesNotThrow(() => write({ schemaVersion: 2, views: [], nodes: [{ id: 1, type: 'uml.Package', label: 'p' }, { id: 2, type: 'uml.Package', label: 'q', parent: 1 }, { id: 'C', type: 'uml.Class', label: 'C', parent: 2 }] }));
});

test('a namespace is known by its parent and its name, as Mermaid qualifies one inside another', () => {
  const r = read('classDiagram\nnamespace A {\nnamespace X {\nclass C\n}\n}\nnamespace B {\nnamespace X {\nclass D\n}\n}\nnamespace A.X {\nclass E\n}\nnamespace P {\nnamespace Q.R {\nclass F\n}\n}');
  assert.deepEqual(r.model.nodes.filter(n => n.type === 'uml.Package').map(n => [n.id, n.label, n.parent]),
    [['A', 'A', undefined], ['X', 'X', 'A'], ['B', 'B', undefined], ['X-2', 'X', 'B'], ['P', 'P', undefined], ['Q', 'Q', 'P'], ['Q.R', 'R', 'Q']]);
  assert.deepEqual(['C', 'D', 'E', 'F'].map(id => r.model.nodes.find(n => n.id === id).parent), ['X', 'X-2', 'X', 'Q.R']);
  assert.deepEqual(r.report, [{ line: 8, status: 'approximated', message: "namespace X in B has another namespace's name: it is X-2" }]);
  assert.deepEqual(validate(r.model).filter(p => p.level === 'error'), []);
  // a note inside a namespace is read, outside it
  assert.deepEqual(read('classDiagram\nnamespace A {\nnote "n"\n}').report, [{ line: 3, status: 'approximated', message: 'a note in namespace A is read outside it' }]);
});

test('deep namespaces read in linear time: braces at any depth, a dotted name of over 32 parts as one name (R2) (timed)', () => {
  const dots = 'a.'.repeat(32) + 'a', d = read(`classDiagram\nnamespace ${dots} {\nclass C\n}`);
  assert.deepEqual([d.model.nodes.map(n => [n.id, n.parent]), d.report.map(x => x.message)], [[[dots, undefined], ['C', dots]], [`namespace ${dots}: over 32 dotted parts, so read as one name`]]);
  assert.equal(read(`classDiagram\nnamespace ${'a.'.repeat(31)}a {\n}`).model.nodes.length, 32);
  const t0 = performance.now(), big = read('classDiagram\nnamespace ' + 'a.'.repeat(500000) + 'a {\n}');
  assert.ok(performance.now() - t0 < 2000, `${performance.now() - t0} ms`);
  assert.equal(big.model.nodes.length, 1);
  const t1 = performance.now(), deep = read('classDiagram\n' + 'namespace a {\n'.repeat(70000));
  assert.ok(performance.now() - t1 < 3000, `${performance.now() - t1} ms`);
  assert.equal(new Set(deep.model.nodes.map(n => n.id)).size, 70000);
});

test('the writer names an owner it does not write: one the view does not show, one the model does not have, a note\'s', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: 'p' }, { id: 'q', type: 'uml.Package', label: 'q', parent: 'p' },
    { id: 'A', type: 'uml.Class', label: 'A', parent: 'q' }, { id: 'B', type: 'uml.Class', label: 'B', parent: 'gone' },
    { id: 'n1', type: 'uml.Comment', label: 'x', parent: 'p' }, { id: 'n2', type: 'uml.Comment', label: 'y', parent: 'q' }], edges: [],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['q', 'A', 'B', 'n1', 'n2'] }] };
  const text = write(m);
  assert.deepEqual(notWritten(text), ['%% not written: q: its parent p, which the view does not show', '%% not written: B: its parent gone, which the model does not have',
    '%% not written: n1: its parent p, which the view does not show', '%% not written: n2: its parent q: a note is written outside namespaces']);
  assert.deepEqual(read(text).model.nodes.map(n => [n.id, n.parent]), [['q', undefined], ['A', 'q'], ['B', undefined], ['n1', undefined], ['n2', undefined]]);
});

// review of 2.4, each case checked against Mermaid 12.3.0's ClassDB (getNamespaces, getClasses) under jsdom
test('a dotted namespace is written dotted beside a class or an unwritten namespace of its last part\'s name; its hidden owner is named as one Mermaid draws', () => {
  const P = (id, parent) => ({ id, type: 'uml.Package', label: id.slice(id.lastIndexOf('.') + 1), ...(parent ? { parent } : {}) });
  const C = (id, parent) => ({ id, type: 'uml.Class', label: id, parent });
  // only a written namespace beside it has its name: a class X, or an empty namespace X, does not (Mermaid: P, P.X in P)
  for (const nodes of [[P('P'), C('X', 'P'), P('P.X', 'P'), C('B', 'P.X')], [P('P'), C('A', 'P'), P('X', 'P'), P('P.X', 'P'), C('B', 'P.X')]]) {
    const m = { schemaVersion: 2, nodes, views: [] }, text = write(m);
    assert.ok(text.includes('\n  namespace P.X {\n    class B\n  }\n') && !text.includes('`'), text);
    assert.deepEqual(read(text).model.nodes.filter(n => n.type === 'uml.Package').map(n => [n.id, n.parent]), [['P', undefined], ['P.X', 'P']], text);
  }
  // a hidden owner of a dotted id: Mermaid draws core, as it splits `core.io`; an empty one is not written, so no more is said
  const nodes = [P('core'), P('core.io', 'core'), C('C', 'core.io')], v = nodeIds => ({ schemaVersion: 2, nodes, views: [{ id: 'v', diagram: 'uml.class', nodeIds }] });
  assert.deepEqual(notWritten(write(v(['core.io', 'C']))), ['%% not written: core.io: its parent core, which the view does not show, though Mermaid draws core, as it splits core.io at its dots']);
  assert.deepEqual(notWritten(write(v(['core.io']))), ['%% not written: core.io: its parent core, which the view does not show', '%% not written: core.io (uml.Package)']);
});

test('the writer is linear in a namespace\'s dotted children, and writes a model nested thousands deep (nothing throws) (timed)', () => {
  const nodes = [{ id: 'P', type: 'uml.Package', label: 'P' }];
  for (let k = 0; k < 40000; k++) nodes.push({ id: `P.c${k}`, type: 'uml.Package', label: `c${k}`, parent: 'P' }, { id: `K${k}`, type: 'uml.Class', label: `K${k}`, parent: `P.c${k}` });
  const t0 = performance.now(), wide = write({ schemaVersion: 2, nodes, views: [] });
  assert.ok(performance.now() - t0 < 1500, `${performance.now() - t0} ms`);
  assert.ok(wide.includes('\nnamespace P.c39999 {\n')); // over 1 MiB: unindented
  // one repeated name, 5000 deep: the reader keys each by its parent, so the model is 5000 deep; it is written, indented 32
  // deep at most, and reads back as it was
  const text = 'classDiagram\n' + 'namespace a {\n'.repeat(5000) + 'class C\n' + '}\n'.repeat(5000), m = read(text).model;
  assert.equal(m.nodes.find(n => n.id === 'C').parent, 'a-5000');
  const back = read(write(m));
  assert.deepEqual([back.report, back.model.nodes], [[], m.nodes]);
});

test('labels with #, a backslash, a leading <<, « or spaces at their ends round-trip (audit 1)', () => {
  const model = { schemaVersion: 2, root: 'v', nodes: [{ id: 'A', type: 'uml.Class', label: 'Files in C:\\new' }, { id: 'B', type: 'uml.Class', label: 'Price #35;1' }],
    edges: [{ id: 'A-B', type: 'uml.Dependency', from: 'A', to: 'B', label: '<<use>> it' }, { id: 'A-B-2', type: 'uml.Dependency', from: 'A', to: 'B', label: '  padded  ' },
      { id: 'A-B-3', type: 'uml.Dependency', from: 'A', to: 'B', label: '«x» y', props: { stereotypes: ['s#1'] } }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B'] }] };
  const back = read(write(model));
  assert.deepEqual([back.report, back.model.nodes, back.model.edges], [[], model.nodes, model.edges]);
});

test('a member the reader would read as another, and a stereotype holding » or spaces at its ends, are named not written (audit 2)', () => {
  const members = [['uml.Property', '#x'], ['uml.Property', 'a:b'], ['uml.Operation', 'a(b)'], ['uml.Property', 'List~T~'], ['uml.Property', '-->'], ['uml.EnumerationLiteral', 'a -> b']];
  for (const [type, label] of members) {
    const t = write({ schemaVersion: 2, nodes: [{ id: 'A', type: type === 'uml.EnumerationLiteral' ? 'uml.Enumeration' : 'uml.Class', members: [{ id: 'A.m', type, label }] }] });
    assert.deepEqual([t.includes('%% not written: A.m'), read(t).model.nodes[0].members], [true, undefined], label);
  }
  const ok = { id: 'A.n', type: 'uml.Property', label: 'n b', props: { visibility: 'private', valueType: 'int' } };
  assert.deepEqual(read(write({ schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', members: [ok] }] })).model.nodes[0].members, [ok]);
  const model = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class' }, { id: 'B', type: 'uml.Class' }],
    edges: [{ id: 'A-B', type: 'uml.Dependency', from: 'A', to: 'B', props: { stereotypes: ['a»b', ' s '] } }] };
  const t = write(model), back = read(t).model.edges;
  assert.deepEqual([back[0].props, back[0].label, t.includes('%% not written: A-B: stereotype  s ')], [{ stereotypes: ['a»b'] }, undefined, true]);
});

test('the writer is linear in notes and in a view that lists its edges by id (audit 1) (timed)', () => {
  const notes = read('classDiagram\nclass A\n' + 'note for A "x"\n'.repeat(30000)).model;
  let t0 = performance.now();
  write(notes);
  assert.ok(performance.now() - t0 < 1500, `notes: ${performance.now() - t0} ms`);
  const nodes = [{ id: 'A', type: 'uml.Class', label: 'A' }, { id: 'B', type: 'uml.Class', label: 'B' }];
  const edges = Array.from({ length: 40000 }, (_, k) => ({ id: `e${k}`, type: 'uml.Dependency', from: 'A', to: 'B' }));
  t0 = performance.now();
  write({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B'], edges: edges.map(e => e.id) }] });
  assert.ok(performance.now() - t0 < 1500, `edges by id: ${performance.now() - t0} ms`);
});

test('a class file of 20000 nested namespaces that the reader read, once written, reads again: unindented over the limit (audit 2)', () => {
  const m = read('classDiagram\n' + Array.from({ length: 20000 }, (_, i) => `namespace n${i} {`).join('\n') + '\nclass X\n' + '}\n'.repeat(20000)).model;
  const back = read(write(m));
  assert.deepEqual([back.report, back.model.nodes.length], [[], 20001]);
});

test('a %% id: that is taken or above a line that takes none is reported; a class with no label is named not written (audit 3)', () => {
  assert.deepEqual(read('classDiagram\nclass X\n%% id: X\nA --> B\n').report, [{ line: 4, status: 'approximated', message: '%% id: X is taken, so A --> B is X-2' }]);
  assert.deepEqual(read('classDiagram\n%% id: zz\nclass C\n').report, [{ line: 3, status: 'skipped', message: '%% id: zz is above a line that takes none: not read' }]);
  const t = write({ schemaVersion: 2, root: 'v', nodes: [{ id: 'n1', type: 'uml.Class', label: '' }], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['n1'] }] }, 'v');
  assert.match(t, /%% not written: n1: no label, read as its name/);
});

test('a static or abstract marker right after the ), as Mermaid reads it, is read so, not kept in the return type (audit 4)', () => {
  const m = read('classDiagram\nclass Shape {\n  +draw(int x)$ bool\n  +area()* double\n  +make() Shape$\n}\n').model, ops = m.nodes.find(n => n.id === 'Shape').members;
  assert.deepEqual(ops.map(o => [o.label, o.props.returnType, o.props.isStatic, o.props.isAbstract]),
    [['draw', 'bool', true, undefined], ['area', 'double', undefined, true], ['make', 'Shape', true, undefined]]);
  assert.match(write(m), /\+draw\(x : int\)\$? bool\$?/);
});

test('a class named with its ~generic~ in a relation or a member line is that class, its label the generic (audit 5)', () => {
  const r = read('classDiagram\nclass Square~Shape~\nSquare~Shape~ <|-- Cube\nSquare~Shape~ : +int side\nAnimal --> List~int~\n');
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.label, (n.members || []).length]), [['Square', 'Square<Shape>', 1], ['Cube', 'Cube', 0], ['Animal', 'Animal', 0], ['List', 'List<int>', 0]]);
  assert.deepEqual(r.model.edges.map(e => [e.type, e.from, e.to]), [['uml.Generalization', 'Cube', 'Square'], ['uml.Association', 'Animal', 'List']]);
  assert.deepEqual(r.report.map(x => x.line), [2, 5]);
});

test('a type ending in * or $ reads back as itself, else the member is not written; a , inside [] or () does not split a parameter (audit 6)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'B', type: 'uml.Class', label: 'B', members: [
    { id: 'B.data', type: 'uml.Property', label: 'data', props: { visibility: 'public', valueType: 'char*' } },
    { id: 'B.cost', type: 'uml.Property', label: 'cost', props: { valueType: 'US$', isStatic: true } },
    { id: 'B.get', type: 'uml.Operation', label: 'get', props: { returnType: 'char*' } }] }] };
  const text = write(m), back = read(text).model.nodes[0].members;
  assert.deepEqual(back.map(x => [x.label, x.props]), [['data', { visibility: 'public', valueType: 'char*' }], ['cost', { valueType: 'US$', isStatic: true }]]);
  assert.match(text, /%% not written: B\.get/);
  const ops = read('classDiagram\nclass C {\n  +lookup(d: Dict[str, int], k: str) int\n  +on(h: (e: Event, c: Ctx) => void) void\n}\n').model.nodes[0].members;
  assert.deepEqual(ops.map(o => o.props.parameters), [[{ name: 'd', valueType: 'Dict[str, int]' }, { name: 'k', valueType: 'str' }], [{ name: 'h', valueType: '(e: Event, c: Ctx) => void' }]]);
});

test('a class named like a statement keyword is written in backticks, so its relations read back (audit 9)', () => {
  for (const k of ['note', 'class', 'classDef', 'cssClass', 'direction', 'namespace', 'style', 'click', 'link', 'callback', 'accTitle', 'accDescr']) {
    const m = { schemaVersion: 2, root: 'v', nodes: [{ id: k, type: 'uml.Class', label: k }, { id: 'Order', type: 'uml.Class', label: 'Order' }],
      edges: [{ id: `${k}-Order`, type: 'uml.Association', from: k, to: 'Order' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: [k, 'Order'] }] };
    assert.deepEqual(read(write(m, 'v')).model.edges.map(e => [e.from, e.to]), [[k, 'Order']], k);
  }
});

test('a stereotype ending in > or with a space at an end, an id or a type with a space at an end, is said, not changed (audit 11)', () => {
  const m = read('classDiagram\nclass A {\n  +x : int\n  +f(a : int) int\n}\nclass B\nA --> B').model;
  const a = m.nodes.find(n => n.id === 'A');
  a.props = { stereotypes: ['a>', ' b', 'ok'] };
  m.edges[0].id = 'A-B ';
  a.members[0].id = 'A.x ';
  a.members[1].props.returnType = ' int';
  const text = write(m);
  assert.deepEqual(notWritten(text), ['%% not written: A: stereotype a>', '%% not written: A: stereotype  b', '%% not written: A.x  (uml.Property)',
    '%% not written: A.f: type  int, read back trimmed', '%% not written: A-B  (uml.Association)']);
  assert.deepEqual(read(text).model.nodes.find(n => n.id === 'A').props.stereotypes, ['ok']);
});

test('the writer names ext and props it has no place for: a class\'s tags and ext, a line\'s ext (audit 14)', () => {
  const m = json('./class-minimal.json'); m.nodes[0].props = { stereotypes: ['entity'], tags: { entity: { table: 'orders' } } }; m.nodes[0].ext = { structurizr: { url: 'x' } }; m.edges[0].ext = { x: 1 };
  assert.deepEqual(write(m, 'v').match(/not written: .*/g), ['not written: order: property tags', 'not written: order: ext', 'not written: order-lines: ext']);
});

test('a } at the end of a line closes its class or namespace, as Mermaid\'s lexer does (audit 15)', () => {
  const shape = s => { const r = read(s); return [r.model.nodes.map(n => [n.id, n.parent ?? null, (n.members || []).map(m => m.label)]), r.model.edges.length, r.report.map(x => x.message)]; };
  assert.deepEqual(shape('classDiagram\nclass Duck {\n  +swim()\n  +quack() }\nclass Pond\nDuck --> Pond\n'),
    [[['Duck', null, ['swim', 'quack']], ['Pond', null, []]], 1, []]);
  assert.deepEqual(shape('classDiagram\nnamespace Zoo { class Cage }\nclass Keeper\nKeeper --> Cage\n'),
    [[['Zoo', null, []], ['Cage', 'Zoo', []], ['Keeper', null, []]], 1, []]);
  assert.deepEqual(shape('classDiagram\nnamespace Zoo {\n  class Cage }\nclass Keeper\n'),
    [[['Zoo', null, []], ['Cage', 'Zoo', []], ['Keeper', null, []]], 0, []]);
});

test('a class body closed on its own line closes at its first }, and a } after it closes the namespace (audit 16)', () => {
  const shape = s => { const r = read(s); return [r.model.nodes.map(n => [n.id, n.parent ?? null, (n.members || []).map(m => m.label)]), r.report.map(x => x.message)]; };
  assert.deepEqual(shape('classDiagram\nnamespace Shop { class Cart { +total() } }\nclass Other\n'),
    [[['Shop', null, []], ['Cart', 'Shop', ['total']], ['Other', null, []]], []]);
  assert.deepEqual(shape('classDiagram\nnamespace Shop {\nclass Cart { +total() } }\nclass Other\n'),
    [[['Shop', null, []], ['Cart', 'Shop', ['total']], ['Other', null, []]], []]);
  assert.deepEqual(shape('classDiagram\nclass Cart { +total() } }\n')[1], ['a } that closes nothing']);
});

test('audit 17: member text that both starts with << and ends with >> annotates the class, as Mermaid\'s addMember; a <<x>> in front of a member is its stereotype', () => {
  const look = s => { const r = read(s); return [r.model.nodes.map(n => [n.id, n.type, n.props?.stereotypes ?? null, (n.members || []).map(m => [m.label, m.props?.stereotypes ?? null])]), r.report.map(x => x.message)]; };
  // a body line: the member is kept, its <<column>> its own stereotype, not the class's
  const body = 'classDiagram\nclass Order {\n  <<entity>>\n  <<column>> -placedAt : Instant\n  +total : Money\n}';
  assert.deepEqual(look(body), [[['Order', 'uml.Class', ['entity'], [['placedAt', ['column']], ['total', null]]]], ['Order.placedAt: <<column>> in front of it is read as its stereotype']]);
  // a one-line body, `Name : text` and the opening line of a body: annotations, so Shape is an interface and C an enumeration
  assert.deepEqual(look('classDiagram\nclass Shape { <<interface>> }\nclass C\nC : <<enumeration>>\nclass X {<<interface>>\n+run()\n}'),
    [[['Shape', 'uml.Interface', null, []], ['C', 'uml.Enumeration', null, []], ['X', 'uml.Interface', null, [['run', null]]]], []]);
  assert.deepEqual(look('classDiagram\nC : <<a>> <<b>> +x : int')[0], [['C', 'uml.Class', null, [['x', ['a', 'b']]]]]);
  // written back as Mermaid has it, and read back the same
  const m = read(body).model, text = write(m);
  assert.match(text, /\n {4}<<column>> -placedAt : Instant\n/);
  assert.deepEqual(read(text).model.nodes, m.nodes);
  assert.deepEqual(read(write(read('classDiagram\nclass Shape { <<interface>> }').model)).model.nodes.map(n => n.type), ['uml.Interface']);
});

test('a blank %% id: or %% link-id: is no hint: the element takes its derived id, and the comment is said (audit 19)', () => {
  for (const [text, ids] of [
    ['classDiagram\nclass A\nclass B\n%% id:\nA --> B', ['A-B']],
    ['classDiagram\nclass A {\n%% id:\n+String name\n}', ['A.name']],
    ['classDiagram\nclass A\n%% id:\nnote for A "n"', ['note-1', 'note-1-link']],
    ['classDiagram\nclass A\n%% link-id:\nnote for A "n"', ['note-1-link']],
  ]) {
    const { model, report } = read(text), json = JSON.stringify(model);
    assert.deepEqual(validate(model).filter(p => p.level === 'error'), [], text);
    assert.ok(!json.includes('"id":""'), text);
    for (const id of ids) assert.ok(json.includes(`"id":"${id}"`), `${text}: ${id}`);
    assert.ok(report.some(r => r.status === 'skipped' && /^%% (id|link-id): holds no id/.test(r.message)), text);
  }
});

test('a relation label ending in } reads back as written: the writer writes that } as #125;, and a member text ending in one is not written (audit 19)', () => {
  for (const label of ['a}', '}', 'a }', 'x}}', 'returns {}']) {
    const m = read('classDiagram\nclass A\nclass B\nA --> B : x').model;
    m.edges[0].label = label;
    const back = read(write(m));
    assert.equal(back.model.edges[0].label, label);
    assert.deepEqual(back.report, [], label);
  }
  const m = read('classDiagram\nclass A {\n+x\n}\nclass B\nA --> B').model;
  m.nodes[0].members[0].label = 'a}';
  const text = write(m), back = read(text);
  assert.match(text, /%% not written: A\.x/);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.edges.map(e => [e.from, e.to]), [['A', 'B']]);
});

test('audit 23: every Mermaid writer writes a title that is a number or true as quoted text, and a hostile value never throws', async () => {
  const W = { class: ['uml.class', 'uml.Class'], sequence: ['uml.sequence', 'uml.Lifeline'], state: ['uml.state-machine', 'uml.State'], er: ['er', 'er.Entity'],
    requirement: ['sysml.requirement', 'sysml.Requirement'], mindmap: ['mindmap', 'mindmap.Topic'], flowchart: ['flowchart', 'flow.Process'] };
  for (const [f, [d, t]] of Object.entries(W)) {
    const mod = await import(`../src/readers/mermaid-${f}.js`), [rd, wr] = ['read', 'write'].map(k => Object.values(mod).find(x => x.name.startsWith(k) || (k === 'write' && x.name === 'msWrite')));
    const one = () => ({ schemaVersion: 2, root: 'v', nodes: [{ id: 'A', type: t, label: 'A' }], edges: [], views: [{ id: 'v', diagram: d, nodeIds: ['A'] }] });
    // a number, a boolean and text YAML would read as a number or no title: quoted, and read back as that text
    for (const [title, text] of [[12, '12'], [true, 'true'], ['1e3', '1e3'], ['null', 'null'], ['Orders', 'Orders']]) for (const where of ['model', 'view']) {
      const m = one(); if (where === 'model') m.title = title; else m.views[0].title = title;
      const out = wr(m), at = `${f}, ${JSON.stringify(title)} on the ${where}`;
      assert.match(out, new RegExp(`^---\\ntitle: ${text === 'Orders' ? 'Orders' : `"${text}"`}\\n---\\n`), at);
      assert.doesNotMatch(out, /not written: the model/, at);
      assert.equal(rd(out).model.title, text, at);
    }
    // a JSON object holding a toString key, as the view's title, a card's label and the view asked for: no throw
    const m = one(); m.views[0].title = JSON.parse('{"toString":1}'); m.nodes[0].label = JSON.parse('{"toString":1}'); m.title = 'T';
    assert.match(wr(m), /^---\ntitle: T\n---\n/, f);
    assert.match(wr(one(), JSON.parse('{"toString":1}')), /not written: view \[object Object\], which the model does not have/, f);
  }
});

test('audit 30: a member labelled with a number or true is written as that text, an object label is said, and nothing throws', () => {
  const lit = label => ({ type: 'uml.EnumerationLiteral', label });
  const m = { schemaVersion: 2, root: 'v', nodes: [
    { id: 'Level', type: 'uml.Enumeration', label: 'Level', members: [{ id: 'Level.1', ...lit(1) }, { id: 'Level.2', ...lit(2) }, { id: 'Level.t', ...lit(true) },
      { id: 'Level.o', ...lit({ en: 'one' }) }, { id: 'Level.s', ...lit(JSON.parse('{"toString":1}')) }] },
    { id: 'C', type: 'uml.Class', label: 'C', members: [{ id: 'C.p', type: 'uml.Property', label: 7 }, { id: 'C.o', type: 'uml.Operation', label: { a: 1 } }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['Level', 'C'] }] };
  const text = write(m);
  assert.match(text, /^\s+1$/m); assert.match(text, /^\s+2$/m); assert.match(text, /^\s+true$/m);
  assert.match(text, /%% not written: .*Level\.o/); assert.match(text, /%% not written: .*Level\.s/); assert.match(text, /%% not written: .*C\.o/);
  const back = read(text).model, lv = back.nodes.find(n => n.label === 'Level');
  assert.deepEqual(lv.members.map(x => x.label), ['1', '2', 'true']);
  assert.deepEqual(back.nodes.find(n => n.label === 'C').members.map(x => x.label), ['7']);
});

test('audit 30: every Mermaid reader lists 1,000 report items, then counts the rest in one', async () => {
  const heads = { class: 'classDiagram', sequence: 'sequenceDiagram', state: 'stateDiagram-v2', er: 'erDiagram', flowchart: 'flowchart LR', requirement: 'requirementDiagram', mindmap: 'mindmap\n  root' };
  for (const [f, head] of Object.entries(heads)) {
    const mod = await import(`../src/readers/mermaid-${f}.js`), rd = Object.values(mod).find(x => x.name.startsWith('read'));
    const r = rd(head + '\n' + Array(5000).fill('?').join('\n'));
    assert.ok(r.report.length <= 1001, `${f}: ${r.report.length} items`);
    if (r.report.length === 1001) assert.match(r.report[1000].message, /^\d+ more items like these: not listed$/, f);
    // a short input keeps its whole report, with no counting line
    const few = rd(head + '\n?\n?\n?');
    assert.ok(few.report.every(x => !/more items like these/.test(x.message)), f);
  }
  const { readMermaidClass } = await import('../src/readers/mermaid-class.js');
  assert.equal(readMermaidClass('classDiagram\n' + Array(400000).fill('?').join('\n')).report.at(-1).message, '399000 more items like these: not listed');
});

test('inheritance between an interface and what is not one is a realization or skipped, never an invalid model (audit 38)', () => {
  const cases = [
    ['classDiagram\nclass Animal {\n  <<interface>>\n  +speak() void\n}\nAnimal <|-- Dog\n', [['uml.InterfaceRealization', 'Dog', 'Animal']], ['6 approximated: Animal <|-- Dog: Animal is an interface, so Dog realizes it']],
    ['classDiagram\nclass Animal {\n  <<interface>>\n}\nBase <|-- Animal\n', [], ['5 skipped: Base <|-- Animal: interface Animal cannot specialize class Base']],
    ['classDiagram\nC ..|> I\nD --|> I\n', [['uml.InterfaceRealization', 'C', 'I'], ['uml.InterfaceRealization', 'D', 'I']], ['2 approximated: C ..|> I: I is realized, so it is read as an interface', '3 approximated: D --|> I: I is an interface, so D realizes it']],
    ['classDiagram\nclass E {\n  <<enumeration>>\n}\nE --|> K\nclass J {\n  <<interface>>\n}\nclass L {\n  <<interface>>\n}\nJ --|> L\n', [['uml.Generalization', 'J', 'L']], ['5 skipped: E --|> K: enumeration E cannot specialize class K']],
  ];
  for (const [text, edges, report] of cases) {
    const { model, report: r } = read(text);
    assert.deepEqual(model.edges.map(e => [e.type, e.from, e.to]), edges, text);
    assert.deepEqual(r.map(x => `${x.line} ${x.status}: ${x.message}`), report, text);
    assert.deepEqual(validate(model).filter(p => p.level === 'error'), [], text);
  }
});

test('a :: is part of a type in Mermaid\'s Type name form (-std::string owner), and hostile member text never throws (audit 42)', () => {
  const r = read('classDiagram\nclass Person {\n  -std::string first\n  -std::string last\n  -data::Repo~K~ repo = none\n  +greet(std::string to, a::b::C c) d::E\n  -t : int = a == b\n}\n');
  const m = r.model.nodes[0].members;
  assert.deepEqual(m.map(x => [x.id, x.props]), [
    ['Person.first', { visibility: 'private', valueType: 'std::string' }],
    ['Person.last', { visibility: 'private', valueType: 'std::string' }],
    ['Person.repo', { visibility: 'private', valueType: 'data::Repo<K>', default: 'none' }],
    ['Person.greet', { visibility: 'public', parameters: [{ name: 'to', valueType: 'std::string' }, { name: 'c', valueType: 'a::b::C' }], returnType: 'd::E' }],
    ['Person.t', { visibility: 'private', valueType: 'int', default: 'a == b' }]]);
  assert.deepEqual(r.report, []);
  assert.deepEqual(read(write(r.model)).model.nodes[0].members, m);
  // a scoped type ending in *, which the writer writes in the Type name form, reads back as itself
  const ptr = { schemaVersion: 2, nodes: [{ id: 'N', type: 'uml.Class', label: 'N', members: [{ id: 'N.next', type: 'uml.Property', label: 'next', props: { valueType: 'ns::Node*' } },
    { id: 'N.prev', type: 'uml.Property', label: 'prev', props: { valueType: 'std::shared_ptr<ns::Node>*' } }] }] };
  assert.match(write(ptr), /ns::Node\* next/);
  assert.deepEqual(read(write(ptr)).model.nodes[0].members, ptr.nodes[0].members);
  // hostile member text: colons, equals signs and quotes in any order never throw, every member read has a name, and the
  // model is valid
  const bits = [':', '::', ':::', '=', '==', '=>', '"', "'", '(', ')', ',', ' ', 'a', 'std', '<', '>', '~', '[', ']', '{', '$', '*', '-', '+'];
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 2000; k++) {
    const line = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => bits[Math.floor(rnd() * bits.length)]).join('');
    const out = read(`classDiagram\nclass Z {\n  ${line}\n}\n`);
    for (const x of out.model.nodes.flatMap(n => n.members || [])) assert.ok(x.label, line);
    assert.equal(typeof write(out.model), 'string', line);
  }
});

test('a parameter\'s = default (int amount = 0, x : int = 5) is cut off before its name and type, and reported (audit 42)', () => {
  const r = read('classDiagram\nclass Account {\n  +deposit(String currency, int amount = 0) bool\n  +f(x : int = 5, s : String = "a, b", c : char = \',\')\n  +g(int x = 5) void\n  +on(cb : (a: int) => void, n : int)\n  +o(= 5)\n}\n');
  const m = r.model.nodes[0].members;
  assert.deepEqual(m.map(x => [x.id, x.props]), [
    ['Account.deposit', { visibility: 'public', parameters: [{ name: 'currency', valueType: 'String' }, { name: 'amount', valueType: 'int' }], returnType: 'bool' }],
    ['Account.f', { visibility: 'public', parameters: [{ name: 'x', valueType: 'int' }, { name: 's', valueType: 'String' }, { name: 'c', valueType: 'char' }] }],
    ['Account.g', { visibility: 'public', parameters: [{ name: 'x', valueType: 'int' }], returnType: 'void' }],
    ['Account.on', { visibility: 'public', parameters: [{ name: 'cb', valueType: '(a: int) => void' }, { name: 'n', valueType: 'int' }] }],
    ['Account.o', { visibility: 'public' }]]);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 approximated: Account.deposit: parameter amount's default 0 is not kept, as a parameter has no default in the model",
    "4 approximated: Account.f: parameter x's default 5 is not kept, as a parameter has no default in the model",
    "4 approximated: Account.f: parameter s's default \"a, b\" is not kept, as a parameter has no default in the model",
    "4 approximated: Account.f: parameter c's default ',' is not kept, as a parameter has no default in the model",
    "5 approximated: Account.g: parameter x's default 5 is not kept, as a parameter has no default in the model",
    '7 skipped: Account.o: a parameter with no name, = 5, is not read']);
  assert.deepEqual(validate(r.model).filter(p => p.level === 'error'), []);
  const kept = m.filter(x => x.id !== 'Account.on'); // a function type in a parameter is not written (as before audit 42)
  assert.deepEqual(read(write(r.model)).model.nodes[0].members.filter(x => x.id !== 'Account.on'), kept);
});

test('a Rust lifetime\'s \' (&\'a str) is not a quote: parameters split, an attribute keeps its default, and write then read keeps both (audit 43)', () => {
  const r = read('classDiagram\nclass Parser {\n  +longest(x : &\'a str, y : &\'a str) &\'a str\n  +NAME : &\'static str = "app"\n  +h(a : don\'t, b : int)\n  +g(x : &\'a str = "it\'s", y : int)\n  -c : char = \'q\'\n}\n');
  const m = r.model.nodes[0].members;
  assert.deepEqual(m.map(x => [x.id, x.props]), [
    ['Parser.longest', { visibility: 'public', parameters: [{ name: 'x', valueType: "&'a str" }, { name: 'y', valueType: "&'a str" }], returnType: "&'a str" }],
    ['Parser.NAME', { visibility: 'public', valueType: "&'static str", default: '"app"' }],
    ['Parser.h', { visibility: 'public', parameters: [{ name: 'a', valueType: "don't" }, { name: 'b', valueType: 'int' }] }],
    ['Parser.g', { visibility: 'public', parameters: [{ name: 'x', valueType: "&'a str" }, { name: 'y', valueType: 'int' }] }],
    ['Parser.c', { visibility: 'private', valueType: 'char', default: "'q'" }]]);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "6 approximated: Parser.g: parameter x's default \"it's\" is not kept, as a parameter has no default in the model"]);
  const text = write(r.model);
  assert.doesNotMatch(text, /not written/);
  assert.deepEqual(read(text).model.nodes[0].members, m);
});

test('an element of no type (or "") in a class view is written as a class, with its lines, and said (audit 43)', () => {
  for (const type of [undefined, '']) {
    const t = type === undefined ? {} : { type };
    const model = { schemaVersion: 2, nodes: [{ id: 'A', ...t, label: 'A', members: [{ id: 'A.x', type: 'uml.Property', label: 'x' }] }, { id: 'B', type: 'uml.Class', label: 'B' },
      { id: 'P', type: 'uml.Package', label: 'P' }, { id: 'C', ...t, label: 'C', parent: 'P' }],
      edges: [{ id: 'e', type: 'uml.Association', from: 'A', to: 'B' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B', 'P', 'C'] }] };
    const text = write(model, 'v');
    assert.match(text, /not written: A: no type, written as a class \(uml\.Class\)/);
    assert.doesNotMatch(text, /not written: (A \(|C \(|e\b)/);
    const back = read(text).model;
    assert.deepEqual(back.nodes.map(n => [n.id, n.type, n.parent]), [['A', 'uml.Class', undefined], ['B', 'uml.Class', undefined], ['P', 'uml.Package', undefined], ['C', 'uml.Class', 'P']]);
    assert.deepEqual(back.nodes[0].members.map(x => x.id), ['A.x']);
    assert.deepEqual(back.edges.map(x => [x.id, x.from, x.to]), [['e', 'A', 'B']]);
  }
});

// audit 44: a generalization cycle (A <|-- B with B <|-- A, or A <|-- A) was read into a model validate() rejects, with an
// empty report: the line that closes it, in source order, is skipped and said; a diamond is no cycle; a hostile chain of
// sixty thousand lines closed at its end is settled in one pass, never thrown, and what is read validates
test('a generalization cycle is skipped at the line that closes it, never an invalid model (audit 44)', () => {
  const errors = m => validate(m).filter(v => v.level === 'error').map(v => v.message);
  const r = read('classDiagram\n  Shape <|-- Circle\n  Circle <|-- Shape\n  Node <|-- Node\n  class Node');
  assert.deepEqual(r.report, [{ line: 3, status: 'skipped', message: 'Circle <|-- Shape: Shape would be its own ancestor, a generalization cycle UML refuses' },
    { line: 4, status: 'skipped', message: 'Node <|-- Node: Node would specialize itself, a generalization cycle UML refuses' }]);
  assert.deepEqual(r.model.edges.map(e => e.id), ['Circle-Shape']);
  assert.deepEqual(errors(r.model), []);
  const three = read('classDiagram\nA <|-- B\nB <|-- C\nC <|-- A\nA <|-- B');
  assert.deepEqual(three.report.map(x => [x.line, x.status]), [[4, 'skipped']]);
  assert.deepEqual(errors(three.model), []);
  const diamond = read('classDiagram\nA <|-- B\nA <|-- C\nB <|-- D\nC <|-- D\nA <|-- D');
  assert.deepEqual(diamond.report, []);
  assert.equal(diamond.model.edges.length, 5);
  // an interface specializing an interface closes one too; a realization is no generalization and closes none
  const ifc = read('classDiagram\nclass I { <<interface>> }\nclass J { <<interface>> }\nI <|-- J\nJ <|-- I\nK ..|> I\nI ..|> K');
  assert.ok(ifc.report.some(x => x.line === 5 && /its own ancestor/.test(x.message)), JSON.stringify(ifc.report));
  assert.ok(!errors(ifc.model).some(e => e.startsWith('generalization-cycle')), errors(ifc.model).join('; '));
  let s = 'classDiagram\n'; for (let i = 0; i < 60000; i++) s += `a${i}<|--a${i + 1}\n`; s += 'a60000<|--a0\na7<|--a7\n';
  const t0 = Date.now(), big = read(s);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
  assert.equal(big.report.filter(x => /generalization cycle/.test(x.message)).length, 2);
  assert.equal(big.model.edges.length, 60000);
  assert.ok(!errors(big.model).some(e => e.startsWith('generalization-cycle')));
});

test('an entity code for a character XML cannot hold is read as U+FFFD and said, in every Mermaid reader (audit 47)', () => {
  // a raw control character in a label makes the model's SVG export not well-formed; #9; #10; #13; and the rest still read
  const bad = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  const said = (line, code) => ({ line, status: 'approximated', message: `${code} names no character SVG or XML can hold: read as U+FFFD` });
  const cases = [
    [read, 'classDiagram\nclass A["x#27;[31mz"]\nnote "a#8;"\nA "#1;" --> "1" B : <<#2;>> t#3;', [said(2, '#27;'), said(3, '#8;'), said(4, '#1;'), said(4, '#2;'), said(4, '#3;')], ['x\uFFFD[31mz', 'a\uFFFD', 't\uFFFD']],
    [readMermaidFlowchart, 'flowchart LR\nA["a#27;"] -->|b#0;| C', [said(2, '#27;'), said(2, '#0;')], ['a\uFFFD', 'b\uFFFD']],
    [readMermaidEr, 'erDiagram\nA["#27;x"]\nA ||--o{ B : "r#2;"', [said(2, '#27;'), said(3, '#2;')], ['\uFFFDx', 'r\uFFFD']],
    [readMermaidState, 'stateDiagram-v2\nstate "s#27;" as S\nS --> T : t#3;\nT : d#4;', [said(2, '#27;'), said(3, '#3;'), said(4, '#4;')], ['s\uFFFD', 't\uFFFD', 'd\uFFFD']],
    [readMermaidSequence, 'sequenceDiagram\nparticipant A as a#27;\nA->>B: m#6;', [said(2, '#27;'), said(3, '#6;')], ['a\uFFFD', 'm\uFFFD']],
    [readMermaidMindmap, 'mindmap\n  r#27;\n    k#55296;\n    t#9;u#65;', [said(2, '#27;'), said(3, '#55296;')], ['r\uFFFD', 'k\uFFFD', 't\tuA']],
  ];
  for (const [fn, text, report, labels] of cases) {
    const r = fn(text), all = [];
    JSON.stringify(r.model, (k, v) => { if (typeof v === 'string') all.push(v); return v; }); // every text in the model
    assert.deepEqual(r.report.filter(x => x.message.includes('U+FFFD')), report, text);
    for (const l of labels) assert.ok(all.includes(l), `${text}: ${JSON.stringify(l)} in ${JSON.stringify(all)}`);
    assert.ok(!all.some(l => bad.test(l)), text);
  }
});

test('a member holding { or } is not written, so read(write(model)) keeps every member; a { closes an open body only on a class or namespace line (audit 48)', () => {
  // Mermaid's member is [^{}\n]*: a brace in it would end the body there, so the member gets a %% not written: line
  for (const def of ['{}', '{', '}', 'a{b', 'v}w']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'Order', type: 'uml.Class', label: 'Order', members: [
      { id: 'Order.tags', type: 'uml.Property', label: 'tags', props: { valueType: 'Set', default: def } },
      { id: 'Order.total', type: 'uml.Property', label: 'total', props: { valueType: 'int' } }] }],
      edges: [], views: [{ id: 'class-diagram', diagram: 'uml.class', nodeIds: ['Order'] }] };
    const t = write(m), r = read(t);
    assert.match(t, /%% not written: Order\.tags \(uml\.Property\)/, def);
    assert.doesNotMatch(t.replace(/%%.*$/gm, ''), /\btags\b/, def);
    assert.deepEqual([r.report, r.model.nodes.map(n => [n.id, (n.members || []).map(x => x.id)])], [[], [['Order', ['Order.total']]]], def);
  }
  for (const [type, label] of [['Set{x}', 'tags'], ['int', 'x{y']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'A', members: [{ id: 'A.m', type: 'uml.Operation', label, props: { returnType: type } }, { id: 'A.n', type: 'uml.Property', label: 'n' }] }], edges: [], views: [] };
    const r = read(write(m));
    assert.deepEqual([r.report, r.model.nodes.map(n => [n.id, (n.members || []).map(x => x.id)])], [[], [['A', ['A.n']]]], label);
  }
  // hand-written: a member holding { stays its class's, and the next member too; a class line closes an open body, as before
  const hand = read('classDiagram\nclass Order {\n  tags : Set = {}\n  total : int\n}\n');
  assert.deepEqual([hand.report, hand.model.nodes.map(n => [n.id, (n.members || []).map(x => x.label)])], [[], [['Order', ['tags', 'total']]]]);
  const open = read('classDiagram\nclass Order {\n  +int id\nnamespace Shop {\nclass Customer\n}\n');
  assert.deepEqual(open.report, [{ line: 4, status: 'approximated', message: 'class Order is not closed before this line: closed here' }]);
  assert.equal(open.model.nodes.find(n => n.id === 'Customer').parent, 'Shop');
});

test('a property default that reads back otherwise (en~US as en<US) is not written but said (audit 48)', () => {
  const one = def => ({ schemaVersion: 2, nodes: [{ id: 'Locale', type: 'uml.Class', label: 'Locale', members: [{ id: 'Locale.tag', type: 'uml.Property', label: 'tag', props: { valueType: 'String', default: def } }] }], edges: [], views: [] });
  for (const def of ['en~US', 'a~b~c']) {
    const t = write(one(def)), r = read(t);
    assert.match(t, /%% not written: Locale\.tag \(uml\.Property\)/, def);
    assert.deepEqual([r.report, r.model.nodes[0].members], [[], undefined], def);
  }
  for (const def of ['en_US', '~x', '0', 'a = b']) { // read back as written: kept
    const r = read(write(one(def)));
    assert.deepEqual(r.model.nodes[0].members[0].props, { valueType: 'String', default: def }, def);
  }
});

test('a raw character XML cannot hold (not an entity code) is read as U+FFFD and said, in every Mermaid reader (audit 48)', () => {
  const bad = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  const said = (line, c) => ({ line, status: 'approximated', message: `the character U+${c}, which SVG or XML cannot hold, is read as U+FFFD` });
  const cases = [
    [read, 'classDiagram\n  class A["a\x01b"]\n  A --> B : x\x1by\x02', [said(2, '0001'), said(3, '001B')], ['a\uFFFDb', 'x\uFFFDy\uFFFD']],
    [readMermaidFlowchart, 'flowchart LR\n  A["a\x01b"] --> B["\uffff"]', [said(2, '0001')], ['a\uFFFDb', '\uFFFD']],
    [readMermaidSequence, 'sequenceDiagram\n  participant A as a\x01b\n  A->>B: m\ud800n', [said(2, '0001'), said(3, 'D800')], ['a\uFFFDb', 'm\uFFFDn']],
    [readMermaidState, 'stateDiagram-v2\n  state "a\x01b" as A\n  A --> B : t\x7f\x0b', [said(2, '0001'), said(3, '000B')], ['a\uFFFDb', 't\x7f\uFFFD']],
    [readMermaidEr, 'erDiagram\n  A ||--o{ B : "r\x01s"', [said(2, '0001')], ['r\uFFFDs']],
    [readMermaidMindmap, 'mindmap\n  root[a\x01b]\n    child\x1f\n    ok\t\u{1F4E6}', [said(2, '0001'), said(3, '001F')], ['a\uFFFDb', 'child\uFFFD', 'ok\t\u{1F4E6}']],
    [readMermaidRequirement, 'requirementDiagram\n  requirement r1 {\n    id: 1\n    text: "a\x01b"\n  }', [said(4, '0001')], ['a\uFFFDb']],
  ];
  for (const [fn, text, report, labels] of cases) {
    const r = fn(text), all = [];
    JSON.stringify(r.model, (k, v) => { if (typeof v === 'string') all.push(v); return v; });
    assert.deepEqual(r.report.filter(x => x.message.includes('U+FFFD')), report, JSON.stringify(text));
    for (const l of labels) assert.ok(all.includes(l), `${JSON.stringify(text)}: ${JSON.stringify(l)} in ${JSON.stringify(all)}`);
    assert.ok(!all.some(l => bad.test(l)), JSON.stringify(text));
  }
  // hostile: a million controls on one line say it once, in linear time
  const t0 = performance.now(), big = readMermaidFlowchart('flowchart LR\n  A["' + '\x01'.repeat(1e6 - 40) + '"]');
  assert.ok(performance.now() - t0 < 2000);
  assert.equal(big.report.filter(x => x.message.includes('U+0001')).length, 1);
});

test('a "string" left open before any label\'s : (a class\'s or namespace\'s ["label"], a note, a cardinality) runs over line breaks to its closing quote, as Mermaid\'s; a member\'s text does not (audit 49)', () => {
  const r = read('classDiagram\nnamespace Shop["The\n  shop"] {\n  class A["Order\nservice"] {\n    +int a\n  }\n}\nnote for A "a\n  note"\nA "1\n2" --> B : owns\nA : +x "y\nB : +z\n');
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.label, n.parent ?? null, (n.members || []).map(m => m.label)]),
    [['Shop', 'The\n  shop', null, []], ['A', 'Order\nservice', 'Shop', ['a', '"y']], ['note-1', 'a\n  note', null, []], ['B', 'B', null, ['z']]]);
  assert.deepEqual(r.model.edges.map(e => [e.from, e.to, e.label ?? null, e.props?.ends?.from ?? null]), [['A', 'B', 'owns', { role: '1\n2' }], ['note-1', 'A', null, null]]);
  assert.deepEqual(r.report, []);
  // no closing quote after it: the line read as before
  assert.deepEqual(read('classDiagram\nclass A["never closed\nclass B\n').report.map(x => [x.line, x.message]), [[2, 'class A: "["never closed" is not read']]);
});

test('a %% comment line inside a "string" over lines (a note, a cardinality) is taken out, as Mermaid\'s cleanupComments does before it parses, its quotes not counted, and said (audit 51)', () => {
  const r = read('classDiagram\n  note "first\n  %% a " quote\n  second"\n  A "role\n  %% x\n  1" --> B\n');
  assert.deepEqual(r.model.nodes.map(n => n.label), ['first\n  second', 'A', 'B']);
  assert.deepEqual(r.model.edges.map(e => e.props.ends.from), [{ role: 'role', multiplicity: '1' }]);
  assert.deepEqual(r.report.map(x => [x.line, x.status, x.message]), [[3, 'approximated', 'a %% line inside a "string" is a comment to Mermaid, which takes it out first: not read'], [6, 'approximated', 'a %% line inside a "string" is a comment to Mermaid, which takes it out first: not read']]);
});

test('an end\'s multiplicity written with spaces (0 .. 1) is written without them, so it reads back as itself and no role appears; one that is still no multiplicity is not written and said, and the role is checked alone (audit 52)', () => {
  const cases = [
    [{ multiplicity: '0 .. 1' }, { multiplicity: '0..1' }, []],
    [{ role: 'items', multiplicity: '1 .. *' }, { role: 'items', multiplicity: '1..*' }, []],
    [{ multiplicity: ' 0..* ' }, { multiplicity: '0..*' }, []],
    [{ role: 'items', multiplicity: 'some' }, { role: 'items' }, ['multiplicity some at the to end']],
    [{ multiplicity: '0 .. 1 x' }, {}, ['multiplicity 0 .. 1 x at the to end']],
    [{ role: 'phase', multiplicity: '2 ..' }, { role: 'phase' }, ['multiplicity 2 .. at the to end']],
  ];
  for (const [end, got, said] of cases) {
    const m = { nodes: [{ id: 'A', type: 'uml.Class', label: 'A' }, { id: 'B', type: 'uml.Class', label: 'B' }],
      edges: [{ id: 'A-B', type: 'uml.Association', from: 'A', to: 'B', props: { ends: { to: end } } }],
      views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B'] }] };
    assert.deepEqual(validate(m), [], JSON.stringify(end));
    const text = write(m, 'v'), back = read(text).model.edges[0];
    assert.deepEqual(back.props?.ends?.to ?? {}, got, `${JSON.stringify(end)}\n${text}`);
    assert.deepEqual([...text.matchAll(/%% not written: A-B: (multiplicity .*? end)/g)].map(x => x[1]), said, text);
  }
});

test('::: right after a name outside a class statement (A:::foo, A:::foo --> B, A --> B:::foo), which Mermaid\'s class parser refuses, is said and not read as a member or a label (audit 54)', () => {
  const said = '": Mermaid reads ::: only in a class statement, as class A:::foo: not read';
  for (const [src, nodes] of [['class A\nA:::foo', [['A', []]]], ['A:::foo --> B', []], ['A --> B:::foo', []], ['A :::foo', []], ['A~T~:::foo', []]]) {
    const r = read(`classDiagram\n${src}`), last = src.split('\n').at(-1);
    assert.deepEqual(r.model.nodes.map(n => [n.id, (n.members || []).map(m => m.label)]), nodes, src);
    assert.deepEqual(r.model.edges, [], src);
    assert.deepEqual(r.report.map(x => [x.line, x.status, x.message]), [[src.split('\n').length + 1, 'skipped', `"${last}${said}`]], src);
  }
  // class A:::foo is styling, said as before; a member or label after ": " that starts with :: is read as text, as the writer writes it
  assert.deepEqual(read('classDiagram\nclass A:::foo').report.map(x => x.message), [':::foo on class A: styling is not read']);
  const r = read('classDiagram\nA : ::x\nA -- B : ::y');
  assert.deepEqual([r.model.nodes[0].members.map(m => m.label), r.model.edges.map(e => e.label), r.report], [['::x'], ['::y'], []]);
});

test('a backslash before a capital N is text, not a line break, in the flowchart, class, sequence and state readers; a lower-case \\n still breaks (audit 57)', () => {
  const labels = m => [...m.nodes.flatMap(n => [n.label, n.props?.description]), ...[...(m.edges || []), ...(m.views || []).flatMap(v => v.edges || [])].map(e => e.label)].filter(x => typeof x === 'string' && x.includes('\\'));
  assert.deepEqual(labels(readMermaidFlowchart('flowchart LR\n  A["Save to D:\\New folder"] --> B').model), ['Save to D:\\New folder']);
  assert.deepEqual(labels(read('classDiagram\n  class A\n  note for A "see C:\\Notes\\Nina"').model), ['see C:\\Notes\\Nina']);
  assert.deepEqual(labels(readMermaidSequence('sequenceDiagram\n  A->>B: open D:\\New folder').model), ['open D:\\New folder']);
  const st = readMermaidState('stateDiagram-v2\n  s1 : saved to D:\\New folder').model;
  assert.ok(JSON.stringify(st).includes('saved to D:\\\\New folder'), JSON.stringify(st));
  assert.equal(readMermaidFlowchart('flowchart LR\n  A["one\\ntwo<BR>three"]').model.nodes[0].label, 'one\ntwo\nthree');
  assert.equal(readMermaidSequence('sequenceDiagram\n  A->>B: one\\ntwo<Br/>three').model.views[0].edges[0].label, 'one\ntwo\nthree');
});

test('the class writer writes a carriage return as #13;, in a class, relation and note label, so Mermaid reads one statement and it reads back (audit 58)', () => {
  for (const label of ['Order\r\nLine', 'y\r}\rclass Z']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label }, { id: 'B', type: 'uml.Class', label: 'B' }, { id: 'n', type: 'uml.Comment', label }],
      edges: [{ id: 'A-B', type: 'uml.Association', from: 'A', to: 'B', label }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B', 'n'] }] };
    const text = write(m), back = read(text).model;
    assert.ok(!text.includes('\r'), JSON.stringify(text));
    assert.equal(text.split('#13;').length - 1, 3 * (label.split('\r').length - 1));
    assert.deepEqual([back.nodes.map(n => n.label), back.edges.map(e => e.label)], [[label, 'B', label], [label]]);
  }
});

// audit 59: the class writer's #13; came after 0.44.0, so the 0.30.0 note keeps the three writers it shipped, and the
// section for what main holds past the last release (package.json's version) records the class writer
test('docs/module-api.md records the class writer\'s #13; after the last release, not in the 0.30.0 note (audit 59)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'a\rb' }], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A'] }] };
  assert.match(write(m), /a#13;b/, 'the class writer writes #13;');
  const doc = readFileSync(new URL('../docs/module-api.md', import.meta.url), 'utf8'), at = h => doc.indexOf('\n## ' + h);
  const section = h => doc.slice(at(h), doc.indexOf('\n## ', at(h) + 4) >>> 0 || undefined).replace(/\s+/g, ' ');
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  assert.match(section('0.30.0:'), /the flowchart, state and sequence writers write a carriage return as `#13;`/);
  const after = doc.slice(doc.indexOf('\n## ', at(version + ':') + 4)).replace(/\s+/g, ' ');
  assert.ok(at(version + ':') > 0 && doc.indexOf('\n## ', at(version + ':') + 4) > 0, 'a section after the last release');
  assert.match(after, /The Mermaid class writer writes a carriage return in a class, relation, cardinality, note or namespace label as `#13;`/);
});

test('a " inside a backtick class name is a plain character: the statements after it are read, and read(write(m)) keeps the ids (audit 60)', () => {
  const r = read('classDiagram\n  class `Pipe 5"`\n  class Valve\n  class Pump\n  `Pipe 5"` --> Valve : feeds\n  Pump --> Valve : drives\n  class Tank\n');
  assert.deepEqual(r.model.nodes.map(n => n.id), ['Pipe 5"', 'Valve', 'Pump', 'Tank']);
  assert.deepEqual(r.model.edges.map(e => [e.from, e.to, e.label]), [['Pipe 5"', 'Valve', 'feeds'], ['Pump', 'Valve', 'drives']]);
  assert.deepEqual(r.report, []);
  // a real string still goes on over the lines to its closing quote, and a ` inside it is plain
  const s = read('classDiagram\n  class A["a `b\n  c"]\n  class B\n');
  assert.deepEqual(s.model.nodes.map(n => [n.id, n.label]), [['A', 'a `b\n  c'], ['B', 'B']]);
  const m = { schemaVersion: 2, nodes: [
    { id: 'Pipe 5"', type: 'uml.Class', label: 'Pipe', members: [{ id: 'Pipe 5".d', type: 'uml.Property', label: 'diameter', props: { valueType: 'int' } }] },
    { id: 'Valve', type: 'uml.Class', label: 'Valve', members: [{ id: 'Valve.state-id', type: 'uml.Property', label: 'state', props: { valueType: 'string' } }] }],
  edges: [{ id: 'feeds', type: 'uml.Association', from: 'Pipe 5"', to: 'Valve', label: 'feeds' }],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['Pipe 5"', 'Valve'] }] };
  const back = read(write(m));
  assert.deepEqual([back.model.nodes.flatMap(n => (n.members || []).map(c => c.id)), back.model.edges.map(e => e.id)], [['Pipe 5".d', 'Valve.state-id'], ['feeds']]);
  assert.deepEqual(back.report, []);
});
