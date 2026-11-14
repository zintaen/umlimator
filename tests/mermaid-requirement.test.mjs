// The Mermaid requirementDiagram reader and writer (notes/milestone-3.md §12, M3.6): read(write(model)) equals the model on
// the subset, ids included, for example 16 without its comment, 500 generated models and models whose names hold each
// character Mermaid cannot read bare; the file with every construct on Mermaid's requirement page gives the pinned report,
// the page's copy from an element among its skipped lines, and a model check.mjs passes (risks.md R1, R4); same source, same
// ids (R3); each row of §12.2 and each untrusted comment; malformed input reported, never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidRequirement as read, writeMermaidRequirement as write } from '../src/readers/mermaid-requirement.js';
import { validate } from '../lib/umlimator-all.js';
import { check } from '../docs/diagrams/examples/check.mjs';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/requirement.mmd', import.meta.url), 'utf8');

// the model as one requirement view shows it, which is what Mermaid's text carries: its requirements, blocks and test
// cases, their containment, the six relationships between them, and of the view its id, title, direction and nodes
const SHOWN = ['sysml.Requirement', 'sysml.Block', 'sysml.TestCase'];
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), nodes = m.nodes.filter(n => v.nodeIds.includes(n.id) && SHOWN.includes(n.type)), ids = new Set(nodes.map(n => n.id));
  const title = v.title ?? m.title;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes, edges: m.edges.filter(e => e.type.startsWith('sysml.') && ids.has(e.from) && ids.has(e.to)),
    views: [{ id: v.id, diagram: 'sysml.requirement', ...(title ? { title } : {}), ...(v.direction ? { direction: v.direction } : {}), nodeIds: v.nodeIds.filter(id => ids.has(id)) }] };
}
// order is not meaning for nodes, lines or a view's nodes
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });
// the two notes a read gives once per file, whatever it holds: they say what Mermaid's text is, not what this text lost
const ONCE = /kept under ext\.mermaid|^Markdown in quoted text/;
const core = m => validate(m).filter(p => p.level === 'error' && !p.rule); // no core error (one with no rule: a dangling end, an id twice, a cycle, ...)
const lines = r => r.report.map(x => `${x.line} ${x.status}: ${x.message}`);

test('read(write(model)) is example 16 without its comment, and nothing is reported', () => {
  const m = json('../examples/ebike-requirements.json'), text = write(m), back = read(text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(canon(back.model), canon(project(m, 'requirements')), text);
  assert.ok(project(m, 'requirements').nodes.length === 15 && project(m, 'requirements').edges.length === 9);
  // the writer's text is Mermaid's: a quoted name, a field quoted, containment, a relationship, an id it would not derive
  assert.match(text, /\n {2}%% id: assist\n {2}requirement "Pedal assistance" \{\n {4}id: "EB-1\.1"\n {4}text: "The motor shall assist the rider only while the rider is pedalling\."\n {2}\}\n/);
  assert.match(text, /\n {2}element Battery \{\n {4}type: Block\n {2}\}\n/);
  assert.match(text, /\n {2}"E-bike specification" - contains -> Range\n/);
  assert.match(text, /\n {2}Battery - satisfies -> "Battery capacity"\n/);
  assert.match(text, /\n {2}%% id: capacity-from-range\n {2}"Battery capacity" - derives -> Range\n/);
  // a comment and its link are not written, and said so
  assert.match(text, /\n {2}%% not written: why-500 \(uml\.Comment\)\n {2}%% not written: why-500-link \(uml\.CommentLink\)\n$/);
  assert.deepEqual(core(back.model), []);
  assert.deepEqual(check(back.model, 'sysml.requirement'), []);
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
// every character Mermaid cannot read in a bare name (§12.3), and the grammar's words
const HOSTILE = [' ', '-', '<', '>', '{', '}', ':', '%%', '"', '\n', '\r\n', '=', ':::'];
const NAMES = ['Range', 'test_req', 'two words', 'a-b', 'x<y', 'p>q', '{braced}', 'c:d', '50%% off', 'q"uote', 'two\nlines', '__proto__', 'constructor', 'requirement', 'element',
  'contains', 'Style', 'Ünit', ' padded ', '', '"', 'a->b', 'cls:::x', 'x = 1', 'direction LR', '**bold**', 'r\r', 'Range'];
const IDS = ['req', 'r-1', 'Range', 'a.b', 'Ünit', '__proto__', 'constructor', 'requirements', 'element', 'x y', 'Range-2'];
const TEXT = ['the text.', 'q"uoted', 'two\nlines', '', ' padded ', 'a - b -> c', '{ braces }', '%% not a comment', 'Ünïcode ❤', 'direction LR', 'id: 3', 'a\r\nb'];
const REQIDS = ['1', 'EB-1.2', 'a b', '/x', '.5', '__proto__', '1.2.3', 'x:y', '%%', 'a/b'];
const KINDS = ['functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint'];
const RELS = { 'sysml.DeriveReqt': 'derives', 'sysml.Copy': 'copies', 'sysml.Satisfy': 'satisfies', 'sysml.Verify': 'verifies', 'sysml.Refine': 'refines', 'sysml.Trace': 'traces' };
const keeps = id => typeof id === 'string' && id !== '' && !/[\r\n]/.test(id) && id.trim() === id && !id.includes('->');
function generate(seed) {
  const r = rng(seed), maybe = (p, x) => (r() < p ? x : undefined), used = new Set(), nodes = [], edges = [];
  const take = (base, other) => { const id = keeps(base) && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  for (let k = 0, n = 1 + Math.floor(r() * 9); k < n; k++) {
    const kind = pick(r, ['sysml.Requirement', 'sysml.Requirement', 'sysml.Requirement', 'sysml.Block', 'sysml.TestCase']), label = pick(r, NAMES);
    const id = take(pick(r, [label, label.replace(/[^\p{L}\p{N}_.-]+/gu, '-'), ...IDS]), `N${k}`);
    // a parent written before it: a requirement's a requirement or an element; an element's an element
    const owners = nodes.filter(o => kind === 'sysml.Requirement' || o.type !== 'sysml.Requirement'), parent = owners.length ? maybe(0.4, pick(r, owners).id) : undefined;
    if (kind === 'sysml.Requirement') {
      const props = clean({ reqId: maybe(0.7, pick(r, REQIDS)), text: maybe(0.7, pick(r, TEXT)), risk: maybe(0.4, pick(r, ['low', 'medium', 'high'])),
        verifyMethod: maybe(0.4, pick(r, ['analysis', 'inspection', 'test', 'demonstration'])), stereotypes: maybe(0.4, [pick(r, KINDS)]) });
      nodes.push(clean({ id, type: kind, label, parent, props: Object.keys(props).length ? props : undefined }));
    } else {
      const types = kind === 'sysml.TestCase' ? ['test suite', 'Testing', 'TEST plan', 'test-bench'] : ['simulation', 'word doc', 'Block-like', 'a:b', 'x/y'];
      const me = clean({ type: maybe(0.5, pick(r, types)), docref: maybe(0.4, pick(r, ['reqs/x', 'http://a-b', 'x y', '__proto__'])) });
      nodes.push(clean({ id, type: kind, label, parent, ext: Object.keys(me).length ? { mermaid: me } : undefined }));
    }
  }
  const reqs = nodes.filter(n => n.type === 'sysml.Requirement');
  for (let k = 0, n = Math.floor(r() * nodes.length * 1.5); k < n && reqs.length; k++) {
    const type = pick(r, Object.keys(RELS)), both = type === 'sysml.DeriveReqt' || type === 'sysml.Copy', toReq = both || type === 'sysml.Satisfy' || type === 'sysml.Verify';
    const from = pick(r, both ? reqs : nodes).id, to = pick(r, toReq ? reqs : nodes).id;
    edges.push({ id: take(pick(r, [`${from}-${RELS[type]}-${to}`, 'e1', 'link', 'Range']), `E${k}`), type, from, to });
  }
  const title = maybe(0.6, pick(r, ['Requirements', 'Reqs: bike', "It's here"]));
  const view = clean({ id: pick(r, ['requirements', 'reqs', 'vé w']), diagram: 'sysml.requirement', title, direction: maybe(0.6, pick(r, ['down', 'right'])), nodeIds: nodes.map(n => n.id).sort(() => r() - 0.5) });
  return clean({ schemaVersion: 2, title, root: view.id, nodes: nodes.sort(() => r() - 0.5), edges, views: [view] });
}

// Mermaid's own parser is not run here (it is not a dependency, and tests never fetch): these tests check this reader on
// the writer's text, and the writer keeps to what Mermaid 12.3.0's page shows (a name quoted unless it is a word)
test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let hints = 0, names = 0, texts = 0, quoted = 0, contains = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), text = write(m), back = read(text);
    hints += text.split('%% id:').length - 1; names += text.split('%% name:').length - 1; texts += text.split('%% text:').length - 1;
    quoted += (text.match(/^ {2}\w+ "/gm) || []).length; contains += text.split(' - contains -> ').length - 1;
    assert.doesNotMatch(text, /%% not written/, `seed ${seed}\n${text}`);
    // a generated copy's ends keep their own texts: its copy-text line is the reader's, tested on its own below
    assert.deepEqual(back.report.filter(x => !ONCE.test(x.message) && !x.message.endsWith('(copy-text): read as written')), [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${text}`);
  }
  assert.ok(hints > 1000 && names > 300 && texts > 100 && quoted > 1000 && contains > 300, `${hints} ids, ${names} names, ${texts} texts, ${quoted} quoted, ${contains} contains`);
});

test('a name holding a character Mermaid cannot read bare is written quoted, or whole in %% name:, and reads back equal', () => {
  for (const c of HOSTILE) {
    const R = (id, label, more) => ({ id, type: 'sysml.Requirement', label, ...more });
    const m = { schemaVersion: 2, root: 'requirements', nodes: [R('a', `a${c}b`), R('b', `${c}`, { parent: 'a' }), R('c', `${c}${c}`, { props: { text: `t${c}` } }), { id: 'd', type: 'sysml.Block', label: `d${c}` }],
      edges: [{ id: 'd-satisfies-a', type: 'sysml.Satisfy', from: 'd', to: 'a' }, { id: 'x', type: 'sysml.DeriveReqt', from: 'c', to: 'b' }],
      views: [{ id: 'requirements', diagram: 'sysml.requirement', nodeIds: ['a', 'b', 'c', 'd'] }] };
    const text = write(m), back = read(text), what = JSON.stringify(c);
    assert.deepEqual(back.report, [], `${what}\n${text}`);
    assert.deepEqual(canon(back.model), canon(m), `${what}\n${text}`);
    // the writer's names: quoted (the quote and line breaks taken out, the label then whole in %% name:)
    const lost = /["\r\n]/.test(c);
    assert.equal(text.includes(`requirement "a${c}b" {`), !lost, `${what}\n${text}`);
    assert.equal(text.includes(`%% name: ${JSON.stringify(`a${c}b`)}`), lost, `${what}\n${text}`);
  }
  // a name that is one of the grammar's words is quoted; a word that is not, bare
  const words = write({ nodes: ['requirement', 'contains', 'Style', 'class', 'Range_1.2'].map(id => ({ id, type: 'sysml.Block', label: id })) });
  assert.deepEqual(words.match(/element .* \{/g), ['element "requirement" {', 'element "contains" {', 'element "Style" {', 'element "class" {', 'element Range_1.2 {']);
});

test("a file with every construct on Mermaid's requirement page gives the pinned report (R1, R4), and a model check.mjs passes", () => {
  const r = read(every), { model } = r;
  assert.deepEqual(lines(r), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    '11 skipped: accTitle: accessibility text is not read',
    '12 skipped: accDescr: accessibility text is not read',
    "59 approximated: test_entity: an element's type and docref are kept under ext.mermaid and not drawn, as every other element's",
    // the page's own copy, from an element: SysML's copy runs between requirements, so it is skipped (§12.1)
    '80 skipped: test_entity2 - copies -> test_req: a copy runs from a requirement to a requirement (copy-ends)',
    '83 approximated: Markdown in quoted text is kept as written, its marks and all',
    '94 skipped: style: styling is not read',
    '96 skipped: classDef: styling is not read',
    '98 skipped: class: styling is not read',
    '99 skipped: :::important on styled_req: styling is not read',
    '140 skipped: test_entity - satisfies -> test_entity2: a satisfy runs to a requirement (satisfy-ends)',
    '141 skipped: test_req6 - derives -> test_entity: a deriveReqt runs from a requirement to a requirement (derive-ends)',
    '142 skipped: test_req - contains -> test_entity: what a requirement contains is a requirement (requirement-nested)',
    '143 skipped: test_req2 - contains -> test_req4: test_req4 is contained by test_req3 already, and an element has one owner',
    '144 skipped: test_req4 - contains -> test_req: it would close a cycle of containment',
    '145 skipped: test_req - satisfies -> nowhere: nowhere is not defined',
    "146 skipped: allocates: no relationship of Mermaid's requirement diagram is called that",
    '147 skipped: test_req is defined twice: the first (line 17) is kept',
    "150 skipped: goal g1: goal is no kind of Mermaid's requirement diagram: its block is not read",
    "155 approximated: dup_fields's id is given twice: the last is kept",
    '156 skipped: "source: someone" in dup_fields\'s block is not a field of a requirement',
    "157 approximated: dup_fields's risk severe is none of low, medium, high: kept as written",
    '159 skipped: %% id: a->b breaks the id rule (not empty, no "->"): arrow_hint takes its own',
    '162 skipped: %% id: cut-off is taken: taken_hint takes its own',
    "165 skipped: %% text: not json is not a JSON string: the field's own text is kept",
    '169 skipped: %% name: 42 is not a JSON string: the name is kept',
    '172 skipped: %% text: "on an element" is above no requirement: not read',
    '175 skipped: %% id: nothing-below is above no definition or relationship: not read',
    '176 approximated: direction RL is drawn left to right',
    '177 skipped: "test_req -> test_req2" is not understood',
    "180 approximated: open's { (line 178) is never closed: read to the end",
  ]);
  const v = model.views[0], node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id);
  assert.equal(model.title, "Every construct on Mermaid's requirement page");
  assert.deepEqual([v.id, v.diagram, v.title, v.direction], ['requirements', 'sysml.requirement', model.title, 'right']); // RL, read as LR, is the last
  assert.deepEqual(v.nodeIds, model.nodes.map(n => n.id));
  assert.deepEqual(v.nodeIds, ['test_req', 'test_req2', 'test_req3', 'test_req4', 'test_req5', 'test_req6', 'test_entity', 'test_entity2', 'test_entity3', '__test_req7__', 'styled_req',
    'Range', 'Range-copy', 'Range-ride', 'Battery', 'cut-off', 'dup_fields', 'arrow_hint', 'taken_hint', 'bad_text', 'bad_name', 'text_on_element', 'open']);
  // the six kinds, the first a requirement and the others its stereotypes; risk and method lowercased
  assert.deepEqual(node('test_req').props, { reqId: '1', text: 'the test text.', risk: 'high', verifyMethod: 'test' });
  assert.deepEqual(['test_req2', 'test_req3', 'test_req4', 'test_req5', 'test_req6'].map(id => node(id).props.stereotypes[0]),
    ['functionalRequirement', 'performanceRequirement', 'interfaceRequirement', 'physicalRequirement', 'designConstraint']);
  assert.deepEqual(node('Range').props, { reqId: 'EB-1.2', text: 'A full charge shall give at least 60 km of assisted riding.', risk: 'high', verifyMethod: 'test' });
  assert.deepEqual(node('__test_req7__').props.text, '*italicized text* **bold text**');
  // elements: a block, a test case by its type, type and docref kept under ext.mermaid; the writer's types not kept
  assert.deepEqual([node('test_entity').type, node('test_entity').ext], ['sysml.Block', { mermaid: { type: 'simulation' } }]);
  assert.deepEqual([node('test_entity2').type, node('test_entity2').ext], ['sysml.Block', { mermaid: { type: 'word doc', docref: 'reqs/test_entity' } }]);
  assert.deepEqual([node('test_entity3').type, node('test_entity3').ext], ['sysml.TestCase', { mermaid: { type: 'test suite', docref: 'github.com/all_the_tests' } }]);
  assert.deepEqual([node('Range-ride'), node('Battery')], [{ id: 'Range-ride', type: 'sysml.TestCase', label: 'Range ride' }, { id: 'Battery', type: 'sysml.Block', label: 'Battery' }]);
  // containment as parent; the second container and the cycle skipped
  assert.deepEqual(model.nodes.filter(n => n.parent).map(n => [n.id, n.parent]), [['test_req3', 'test_req'], ['test_req4', 'test_req3']]);
  // relationships forward and backward, tail to head, each id derived but the hinted one
  assert.deepEqual(model.edges.map(e => [e.id, e.type, e.from, e.to]), [
    ['test_entity-satisfies-test_req2', 'sysml.Satisfy', 'test_entity', 'test_req2'], ['test_req-traces-test_req2', 'sysml.Trace', 'test_req', 'test_req2'],
    ['test_req4-derives-test_req5', 'sysml.DeriveReqt', 'test_req4', 'test_req5'], ['test_req5-refines-test_req6', 'sysml.Refine', 'test_req5', 'test_req6'],
    ['test_entity3-verifies-test_req5', 'sysml.Verify', 'test_entity3', 'test_req5'], ['test_entity-satisfies-test_req6', 'sysml.Satisfy', 'test_entity', 'test_req6'],
    ['test_req5-derives-test_req6', 'sysml.DeriveReqt', 'test_req5', 'test_req6'], ['Range-copy-copies-Range', 'sysml.Copy', 'Range-copy', 'Range'],
    ['Range-ride-verifies-Range', 'sysml.Verify', 'Range-ride', 'Range'], ['Battery-satisfies-Range', 'sysml.Satisfy', 'Battery', 'Range'],
    ['cut-off-satisfied', 'sysml.Satisfy', 'Battery', 'cut-off']]);
  assert.ok(!edge('test_entity2-copies-test_req'));
  // the hints: an id, a name and a text whole; a bad one not applied
  assert.deepEqual(node('cut-off'), { id: 'cut-off', type: 'sysml.Requirement', label: 'Assistance "cut-off"', props: { reqId: 'EB-1.1.1', text: 'Assistance shall stop\nat 25 km/h.' } });
  assert.deepEqual([node('bad_text').props.text, node('bad_name').label, node('arrow_hint').label, node('taken_hint').label], ['kept', 'bad_name', 'arrow_hint', 'taken_hint']);
  assert.deepEqual(node('dup_fields').props, { reqId: '12', risk: 'severe' });
  assert.deepEqual(node('open').props, { reqId: '13' });
  assert.ok(!node('g1') && !node('test_req-2'));
  assert.deepEqual(core(model), []);
  assert.deepEqual(check(model, 'sysml.requirement'), []);
  // what was read is written back whole, but for a risk Mermaid's grammar has no word for, which is named
  const back = write(model), lost = structuredClone(model);
  delete lost.nodes.find(n => n.id === 'dup_fields').props.risk;
  assert.deepEqual(back.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), ["%% not written: dup_fields: risk severe, which is none of Mermaid's low, medium, high"]);
  assert.deepEqual(canon(read(back).model), canon(lost));
});

test('the same source read twice gives the same ids (R3); an id is the name, a slug of it, or the next free', () => {
  const ids = m => [...m.nodes.map(n => n.id), ...m.edges.map(e => e.id)];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  const a = read('requirementDiagram\nrequirement "A b" {\n}\nrequirement "A-b" {\n}\nelement "A  b!" {\n}\nelement a->b {\n}\nelement "Ünit 2" {\n}\nelement "" {\n}\nelement "!!!" {\n}\n'
    + '"A b" - traces -> "A-b"\n"A b" - traces -> "A-b"\n');
  // "A b" slugs to A-b, which "A-b" itself, a name that is an id, takes first only when it comes first; "a->b" is no name
  // (a bare name stops at -), "" none at all
  assert.deepEqual(a.model.nodes.map(n => [n.id, n.label]), [['A-b', 'A b'], ['A-b-2', 'A-b'], ['A-b-3', 'A  b!'], ['Ünit-2', 'Ünit 2'], ['element', '!!!']]);
  assert.deepEqual(a.model.edges.map(e => e.id), ['A-b-traces-A-b-2', 'A-b-traces-A-b-2-2']);
  assert.deepEqual(lines(a), ['8 skipped: "element a->b {" is not understood', '12 skipped: "element "" {" is not understood']);
});

test('each untrusted comment: a bad, clashing or stray %% id:, and %% text: or %% name: that is not a JSON string, is reported and not applied', () => {
  const r = read('%% id: __proto__\nrequirementDiagram\n%% id: constructor\nrequirement a {\n}\n%% id: constructor\nrequirement b {\n}\n%% id: \nelement c {\n}\n%% id: x->y\na - traces -> b\n'
    + '%% text: {"x": 1}\n%% name: "Bee"\nrequirement d {\ntext: own\n}\n%% text: [\n%% name: "ok"\nelement e {\n}\n%% id: z\n%% text: "zz"\nb - contains -> a\n%% name: "stray"\n');
  assert.deepEqual(lines(r), [
    '6 skipped: %% id: constructor is taken: b takes its own',
    '9 skipped: %% id:  breaks the id rule (not empty, no "->"): c takes its own',
    '12 skipped: %% id: x->y breaks the id rule (not empty, no "->"): a - traces -> b takes its own',
    "14 skipped: %% text: {\"x\": 1} is not a JSON string: the field's own text is kept",
    '19 skipped: %% text: [ is above no requirement: not read',
    '23 skipped: %% id: z is above a contains, which is a parent, not an element: not read',
    '24 skipped: %% text: "zz" is above no requirement: not read',
    '26 skipped: %% name: "stray" is above no definition: not read',
  ]);
  // __proto__ and constructor are ordinary ids; the view takes its hint
  assert.deepEqual([r.model.views[0].id, r.model.root], ['__proto__', '__proto__']);
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.label, n.parent, n.props && n.props.text]), [['constructor', 'a', 'b', undefined], ['b', 'b', undefined, undefined],
    ['c', 'c', undefined, undefined], ['d', 'Bee', undefined, 'own'], ['e', 'ok', undefined, undefined]]);
  assert.deepEqual(r.model.edges.map(e => e.id), ['constructor-traces-b']);
  assert.equal(Object.getPrototypeOf(r.model.nodes[0]), Object.prototype);
  assert.deepEqual(canon(read(write(r.model)).model), canon(r.model));
});

test('§12.2: an unclosed block, a field twice, an unknown kind or field, an undefined name, a second container and a cycle are each skipped or read on, and reported', () => {
  const r = read('requirementDiagram\nrequirement a {\nid: 1\nid: 2\nowner: me\n}\nwish w {\nid: 3\n}\nelement b {\n}\nelement c {\n}\nb - contains -> a\nc - contains -> a\n'
    + 'a - traces -> ghost\nrequirement p {\n}\nrequirement q {\n}\nrequirement s {\n}\np - contains -> q\nq - contains -> s\ns - contains -> p\nq - contains -> q\nrequirement open {\nid: 4\n');
  assert.deepEqual(lines(r), [
    "4 approximated: a's id is given twice: the last is kept",
    '5 skipped: "owner: me" in a\'s block is not a field of a requirement',
    "7 skipped: wish w: wish is no kind of Mermaid's requirement diagram: its block is not read",
    '15 skipped: c - contains -> a: a is contained by b already, and an element has one owner',
    '16 skipped: a - traces -> ghost: ghost is not defined',
    '25 skipped: s - contains -> p: it would close a cycle of containment',
    '26 skipped: q - contains -> q: q is contained by p already, and an element has one owner',
    "29 approximated: open's { (line 27) is never closed: read to the end",
  ]);
  assert.deepEqual(r.model.nodes.map(n => [n.id, n.parent ?? null]), [['a', 'b'], ['b', null], ['c', null], ['p', null], ['q', 'p'], ['s', 'q'], ['open', null]]);
  assert.deepEqual(r.model.nodes[0].props, { reqId: '2' });
  // a cycle in the file's order loses its last contains, whichever element the pass starts from
  const ring = read('requirementDiagram\nrequirement x {\n}\nrequirement y {\n}\nrequirement z {\n}\ny - contains -> z\nz - contains -> x\nx - contains -> y\nx - contains -> x\n');
  assert.deepEqual(lines(ring), ['10 skipped: x - contains -> y: it would close a cycle of containment', '11 skipped: x - contains -> x: x is contained by z already, and an element has one owner']);
  // a copy between requirements whose texts differ is read and reported, so copy-text's error is not met silently
  const copy = read('requirementDiagram\nrequirement a {\ntext: one\n}\nrequirement b {\ntext: two\n}\nrequirement c {\ntext: two\n}\nb - copies -> a\nb - copies -> c\n');
  assert.deepEqual([lines(copy), copy.model.edges.map(e => e.id)], [["11 approximated: b - copies -> a: b's text is not a's, which a copy's client has (copy-text): read as written"], ['b-copies-a', 'b-copies-c']]);
  const self = read('requirementDiagram\nrequirement x {\n}\nx - contains -> x\nx - derives -> x\n');
  assert.deepEqual([lines(self), self.model.edges.map(e => e.id)], [['4 skipped: x - contains -> x: it would close a cycle of containment'], ['x-derives-x']]);
  for (const m of [r.model, ring.model, self.model]) assert.deepEqual(core(m), []);
});

test('a containment chain 10,000 deep is read, and validated by the core, with no recursion', () => {
  const n = 10000, text = 'requirementDiagram\n' + Array.from({ length: n }, (_, k) => `requirement r${k} {\n}`).join('\n') + '\n' + Array.from({ length: n - 1 }, (_, k) => `r${k} - contains -> r${k + 1}`).join('\n');
  const { model, report } = read(text);
  assert.deepEqual([report, model.nodes.length, model.nodes.at(-1).parent], [[], n, `r${n - 2}`]);
  assert.deepEqual(core(model), []);
});

test('text over the size limit is refused; the deepest chain under it, 10,000 requirements with 10,000 relationships, and hostile lines read in under a second (§12.2, R2) (timed)', t => {
  const big = read('requirementDiagram\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit of 1048576/);
  // the deepest containment chain that fits under the limit: each element defined, then each contains
  const depth = 22000, chain = 'requirementDiagram\n' + Array.from({ length: depth }, (_, k) => `element e${k} {\n}`).join('\n') + '\n' + Array.from({ length: depth - 1 }, (_, k) => `e${k} - contains -> e${k + 1}`).join('\n');
  const many = 'requirementDiagram\n' + Array.from({ length: 10000 }, (_, k) => `requirement r${k} {\nid: R-${k}\ntext: "number ${k} of the set."\n}`).join('\n') + '\n'
    + Array.from({ length: 10000 }, (_, k) => `r${k} - ${['traces', 'derives', 'refines', 'copies'][k % 4]} -> r${(k * 7919) % 10000}`).join('\n');
  assert.ok(chain.length <= 1 << 20 && chain.length > 0.85 * (1 << 20), `chain: ${chain.length}`);
  assert.ok(many.length <= 1 << 20 && many.length > 850000, `many: ${many.length}`);
  const hostile = [
    ['the deepest chain under the limit', chain], ['10,000 requirements and 10,000 relationships', many],
    ['a line of 1,000,000 dashes', 'requirementDiagram\na ' + '-'.repeat(1000000)],
    ['a line of 500,000 quotes', 'requirementDiagram\n' + '"'.repeat(500000)],
    ['a name of 900,000 characters', 'requirementDiagram\nrequirement ' + 'n'.repeat(900000) + ' {\n}'],
    ['300,000 :::', 'requirementDiagram\na' + ':::'.repeat(300000)],
    ['60,000 unclosed blocks', 'requirementDiagram\n' + 'requirement a {\n'.repeat(60000)],
    ['300,000 stray }', 'requirementDiagram\n' + '}\n'.repeat(300000)],
    ['20,000 hints taken', 'requirementDiagram\n' + Array.from({ length: 20000 }, (_, k) => `%% id: x\nelement e${k} {\n}`).join('\n')],
    ['Markdown marks 300,000 long', 'requirementDiagram\nrequirement a {\ntext: "' + '* '.repeat(300000) + '"\n}'],
    ['a ring of 15,000 contains', 'requirementDiagram\n' + Array.from({ length: 15000 }, (_, k) => `element e${k} {\n}\ne${k} - contains -> e${(k + 1) % 15000}`).join('\n')],
    ['names of the prototype', 'requirementDiagram\nrequirement __proto__ {\nid: constructor\n}\nelement constructor {\ntype: hasOwnProperty\n}\nconstructor - satisfies -> __proto__\nvalueOf - traces -> __proto__\n'],
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
  }
  const deep = read(chain).model;
  assert.deepEqual([deep.nodes.length, deep.nodes.at(-1).parent], [depth, `e${depth - 2}`]);
  const wide = read(many);
  // each copy runs between different texts: read, and reported for copy-text
  assert.deepEqual([wide.model.nodes.length, wide.model.edges.length, wide.report.length], [10000, 10000, 2500]);
  assert.ok(wide.report.every(x => x.status === 'approximated' && x.message.endsWith('(copy-text): read as written')));
  assert.equal(read(hostile[10][1]).report.length, 1); // the ring loses one contains
  const proto = read(hostile.at(-1)[1]);
  assert.deepEqual(proto.model.nodes.map(n => [n.id, n.type]), [['__proto__', 'sysml.Requirement'], ['constructor', 'sysml.Block']]);
  assert.deepEqual([proto.model.edges.map(e => e.id), lines(proto).slice(1)], [['constructor-satisfies-__proto__'], ['9 skipped: valueOf - traces -> __proto__: valueOf is not defined']]);
});

test('malformed input is reported, never thrown, and what was read is written back whole', () => {
  for (const x of [null, 42, {}, '', 'erDiagram\nA ||--o{ B : x', '---\ntitle: x\n', 'requirementDiagram\nrequirement a {\nid', 'requirementDiagram\n"\n""\n{\n}\n- x -> y\na <-\na - \na - traces\na - traces ->\n'
    + 'a <- traces -\n:::\na:::\nrequirement {\nrequirement "" {\nelement a b {\nrequirement a:::b c {\n%% id:\n%% name:\n%% text:\nstyle\nclass\ndirection\ndirection up\naccDescr {\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('erDiagram\nA ||--o{ B : x').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid requirementDiagram: nothing read' }]);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', '-', '<-', '->', ':', ':::', '\n', '%% id: x\n', '%% name: "n"\n', '%% text: 1\n', 'contains', 'copies', 'element ', 'requirement ', '=', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(core(out.model), [], chars.join(''));
    assert.deepEqual(check(out.model, 'sysml.requirement'), [], chars.join(''));
    const text = write(out.model);
    if (!text.includes('%% not written')) assert.deepEqual(canon(read(text).model), canon(out.model), chars.join(''));
  }
});

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'r', type: 'sysml.Requirement', label: 'R', parent: 'pkg', props: { reqId: 'a"b', text: 7, risk: 'x\ny', stereotypes: ['designConstraint', 'functionalRequirement', 'other'], source: 'me' }, ext: { a: 1 } },
    { id: 'b', type: 'sysml.Block', label: 'B', props: { stereotypes: ['block'] }, ext: { mermaid: { type: 'test bench', docref: ' x ', other: 1 } } },
    { id: 't', type: 'sysml.TestCase', ext: { mermaid: { type: 'Block' } } }, { id: 'pkg', type: 'uml.Package', label: 'P' }, { id: 'n', type: 'uml.Comment', label: 'note' }],
  edges: [{ id: 'b-satisfies-r', type: 'sysml.Satisfy', from: 'b', to: 'r', label: 'why' }, { id: 'l', type: 'uml.CommentLink', from: 'n', to: 'r' }, { id: 'a->z', type: 'sysml.Trace', from: 'b', to: 'r' }],
  views: [{ id: 'v', diagram: 'sysml.requirement', direction: 'up', nodeIds: ['r', 'b', 't', 'pkg', 'n', 'r'] }] };
  const text = write(m, 'v');
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: r: listed twice in the view, written once', '%% not written: v: direction up: written as Mermaid\'s TB', '%% not written: pkg (uml.Package)', '%% not written: n (uml.Comment)',
    '%% not written: r: property source', '%% not written: r: ext', '%% not written: r: stereotype functionalRequirement', '%% not written: r: stereotype other',
    '%% not written: r: reqId a"b, which Mermaid\'s quotes cannot hold', '%% not written: r: text 7, which is not text', '%% not written: r: risk x\\ny, which is none of Mermaid\'s low, medium, high',
    '%% not written: b: property stereotypes', '%% not written: b: ext, but for ext.mermaid.type and docref', '%% not written: b: ext.mermaid.type test bench, which the reader would not read back as a block',
    '%% not written: b: ext.mermaid.docref  x', '%% not written: t: no label, read as its name', '%% not written: t: ext.mermaid.type Block, which the reader would not read back as a test case',
    '%% not written: r: parent pkg, which is not written', '%% not written: b-satisfies-r: label', '%% not written: l (uml.CommentLink)', '%% not written: a->z (sysml.Trace)']);
  assert.match(text, /\n {2}%% id: r\n {2}designConstraint R \{\n {2}\}\n {2}%% id: b\n {2}element B \{\n {4}type: Block\n {2}\}\n {2}element t \{\n {4}type: TestCase\n {2}\}\n/);
  const back = read(text);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.nodes.map(n => [n.id, n.type]), [['r', 'sysml.Requirement'], ['b', 'sysml.Block'], ['t', 'sysml.TestCase']]);
  assert.deepEqual(back.model.edges.map(e => e.id), ['b-satisfies-r']);
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const classes = json('../examples/sales-classes.json');
  assert.equal(write(classes), '%% not written: the model, which has no sysml.requirement view\n');
  assert.match(write(classes, classes.views[0].id), /^%% not written: view .*, not a sysml\.requirement one\n$/);
});

test('the writer keeps to Mermaid\'s strings: a value bare only with a word character first, no empty quotes, the rest named', () => {
  const R = (id, more) => ({ id, type: 'sysml.Requirement', label: id, ...more });
  const m = { schemaVersion: 2, title: 'Model', root: 'other', nodes: [R('a', { props: { reqId: '/x', text: '' } }), R('b', { props: { reqId: '.5', risk: 'severe', verifyMethod: 'Test' } }),
    R('c', { props: { reqId: '', stereotypes: [] } }), R('d', { props: {} }), { id: 'e', type: 'sysml.Block', label: 'e', ext: { mermaid: { type: 'Block' } } }],
  edges: [], views: [{ id: 'v', diagram: 'sysml.requirement', title: 'View', nodeIds: ['a', 'b', 'c', 'd', 'e'], edges: [] }] };
  const text = write(m, 'v');
  assert.match(text, /\n {2}%% text: ""\n {2}requirement a \{\n {4}id: "\/x"\n {2}\}\n {2}requirement b \{\n {4}id: "\.5"\n {2}\}\n/);
  assert.doesNotMatch(text, / {4}\w+: ""|: severe\n|: Test\n/);
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    "%% not written: the model's title Model, read back as the view's", "%% not written: the model's root other, read back as the view's id",
    "%% not written: b: risk severe, which is none of Mermaid's low, medium, high", "%% not written: b: verifyMethod Test, which is none of Mermaid's analysis, inspection, test, demonstration",
    '%% not written: c: stereotypes, an empty list', '%% not written: c: reqId "", which Mermaid cannot write empty', '%% not written: d: props, which are empty',
    '%% not written: e: ext.mermaid.type Block, which the reader reads back as none']);
  assert.deepEqual(read(text).model.nodes.find(n => n.id === 'a').props, { reqId: '/x', text: '' });
});

test('a view direction "constructor" is named not written and written TB, not a function\'s source (audit 2)', () => {
  const text = write({ schemaVersion: 2, nodes: [{ id: 'r', type: 'sysml.Requirement', label: 'R' }], views: [{ id: 'v', diagram: 'sysml.requirement', direction: 'constructor', nodeIds: ['r'] }] }, 'v');
  assert.deepEqual(text.split('\n').filter(l => /direction/.test(l)).map(l => l.trim()), ['direction TB', '%% not written: v: direction constructor: written as Mermaid\'s TB']);
});
