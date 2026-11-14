// The Mermaid mindmap reader and writer (notes/milestone-4a.md §8, 4a.5): read(write(model)) equals the model as one
// mindmap view shows it, ids included, for example 25 and 500 generated models; the file with every construct on
// Mermaid's mindmap page gives the pinned report (risks.md R1, R4), a tab counting one as Mermaid 12.3.0's lexer counts
// it; same source, same ids (R3); a size limit, 64 levels, hostile input read in linear time, never a throw (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidMindmap as read, writeMermaidMindmap as write } from '../src/readers/mermaid-mindmap.js';
import { validate } from '../lib/umlimator-all.js';
import { check, targets } from '../docs/diagrams/examples/check.mjs';

const text = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const every = text('import/mindmap.mmd');
const example = JSON.parse(readFileSync(targets().find(([f]) => f === '25-mindmap.json')[1], 'utf8'));

// the model as one mindmap view shows it, which is what Mermaid's text carries: the shown topics, the view's id, title,
// nodes and sides
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  const present = Object.fromEntries(Object.entries(v.present || {}).filter(([id, p]) => ids.has(id) && p.side).map(([id, p]) => [id, { side: p.side }]));
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes: m.nodes.filter(n => ids.has(n.id)), edges: [],
    views: [{ id: v.id, diagram: 'mindmap', ...(title ? { title } : {}), nodeIds: v.nodeIds, ...(Object.keys(present).length ? { present } : {}) }] };
}
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId) });
const core = m => validate(m).filter(p => p.level === 'error' && !p.rule); // a core error: a dangling parent, an id used twice, ...
const lines = r => r.report.map(x => `${x.line} ${x.status}: ${x.message}`);

test('read(write(model)) is example 25, ids and sides included, and nothing is reported', () => {
  const t = write(example), back = read(t);
  assert.deepEqual(back.report, [], t);
  assert.deepEqual(canon(back.model), canon(project(example, 'mm-plan')), t);
  assert.doesNotMatch(t, /not written/);
  assert.match(t, /^---\ntitle: Opening the bookshop\n---\n%% id: mm-plan\nmindmap\n {2}mm-opening\[Opening the bookshop\]\n {4}%% side: right\n {4}mm-catalogue\[Catalogue\]\n {6}mm-first-titles\[/);
  assert.match(t, /\n {4}%% side: left\n {4}mm-hosting\[Hosting\]\n {6}mm-on-gcp\[On Google Cloud\]\n {6}mm-on-azure\[On Azure\]\n$/);
  // ids the reader derives need no form of their own
  const plain = write({ schemaVersion: 2, nodes: [{ id: 'opening', type: 'mindmap.Topic', label: 'Opening' }, { id: 'the-catalogue', type: 'mindmap.Topic', label: 'The catalogue', parent: 'opening' }],
    edges: [], views: [{ id: 'mindmap', diagram: 'mindmap', nodeIds: ['opening', 'the-catalogue'] }] });
  assert.equal(plain, 'mindmap\n  Opening\n    The catalogue\n');
});

// a seeded generator of models in the subset: one root, at most 64 levels, nodeIds in pre-order
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const TEXT = ['Origins', 'Long history', 'Brackets [x] (y) {z}', 'Quotes "and" <angles>', 'two\nlines', 'hash #1 and #35; and #quot;', '<br> kept', '`ticks`', ' padded ', '',
  'mindmap', 'Mindmap ideas', '%% not a comment', ':::not a class', '::icon(no)', '))bang((', 'Ünïcode ❤', 'a, b: c', '-->', 'x', '**bold** _it_', 'three\nlines\nhere', '__proto__'];
const NAMES = ['a', 'root', 'x y', '__proto__', 'constructor', 'mindmap', 'Mind', '%%x', ':::c', 'a(b', 'topic', 'topic-2', 'é', 'a"b', 'a-b', 'origins', 'x', 'x-2', 't', 'hasOwnProperty'];
const SHAPES = ['circle', 'bang', 'hexagon', 'rounded', 'cloud'];
function generate(seed) {
  const r = rng(seed), used = new Set(), nodes = [];
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const slug = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'topic';
  const deep = r() < 0.1, count = deep ? 65 : 1 + Math.floor(r() * 14);
  for (let k = 0; k < count; k++) {
    const label = pick(r, TEXT), n = { id: take(r() < 0.4 ? slug(label) : pick(r, NAMES), `n${used.size}`), type: 'mindmap.Topic', label };
    if (k) { const p = deep ? nodes[k - 1] : pick(r, nodes.filter(x => x.depth < 64)); n.parent = p.id; n.depth = p.depth + 1; } else n.depth = 0;
    const mer = {};
    if (r() < 0.2) mer.shape = pick(r, SHAPES);
    if (r() < 0.15) mer.icon = pick(r, ['fa fa-book', 'mdi mdi-skull-outline']);
    if (r() < 0.15) mer.classes = pick(r, ['urgent', 'urgent large']);
    if (r() < 0.15) mer.markdown = true;
    if (Object.keys(mer).length) n.ext = { mermaid: mer };
    if (r() < 0.1) n.opensView = pick(r, ['checkout', 'a view']);
    nodes.push(n);
  }
  const kids = new Map(), order = [], stack = [nodes[0]];
  for (const n of nodes.slice(1)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
  while (stack.length) { const n = stack.pop(); order.push(n.id); stack.push(...(kids.get(n.id) || []).toReversed()); }
  const sides = [];
  for (const n of kids.get(nodes[0].id) || []) if (r() < 0.5) sides.push([n.id, { side: pick(r, ['left', 'right']) }]);
  const present = Object.fromEntries(sides); // a key __proto__ kept as a key
  const title = r() < 0.6 ? pick(r, ['Plan', 'Plan: a shop', "It's here", '---']) : undefined;
  const view = { id: pick(r, ['mindmap', 'plan', 'mm-plan', 'a b']), diagram: 'mindmap', ...(title ? { title } : {}), nodeIds: order, ...(Object.keys(present).length ? { present } : {}) };
  for (const n of nodes) delete n.depth;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes: nodes.sort(() => r() - 0.5), edges: [], views: [view] };
}

test('read(write(model)) equals the model, for 500 generated models of at most 64 levels and one root', () => {
  let hints = 0, quoted = 0, bare = 0, md = 0, deep = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), t = write(m), back = read(t);
    hints += t.split('%% id:').length - 1; quoted += t.split('["').length - 1; md += t.split('"`').length - 1;
    bare += m.nodes.filter(n => !t.includes(`${n.id}[`)).length; deep += m.nodes.length === 65;
    assert.doesNotMatch(t, /%% not written/, `seed ${seed}\n${t}`);
    // what the model keeps under ext.mermaid is reported as kept, once per kind; nothing else
    assert.deepEqual(back.report.filter(x => !/^(a .+|::icon\(\): an icon|:::classes: a class) is kept, (not )?drawn/.test(x.message)), [], `seed ${seed}\n${t}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${t}`);
    assert.deepEqual(core(back.model), [], `seed ${seed}`);
  }
  assert.ok(hints > 300 && quoted > 500 && bare > 300 && md > 200 && deep > 20, `${hints} hints, ${quoted} quoted, ${bare} bare, ${md} Markdown, ${deep} 64 deep`);
});

test("a file with every construct on Mermaid's mindmap page gives the pinned report (R1, R4); a tab counts one", () => {
  const r = read(every), m = r.model;
  assert.deepEqual(lines(r), [
    "4 skipped: front matter config.layout: Mermaid's configuration is not read",
    "9 skipped: a %%{init}%% directive: Mermaid's configuration is not read",
    '11 approximated: a circle (( )) is kept, drawn as a rounded box',
    '14 approximated: ::icon(): an icon is kept, not drawn',
    '29 approximated: a rounded rectangle ( ) is kept, drawn as a rounded box',
    '31 approximated: a bang )) (( is kept, drawn as a rounded box',
    '32 approximated: a cloud ) ( is kept, drawn as a rounded box',
    '33 approximated: a hexagon {{ }} is kept, drawn as a rounded box',
    '38 approximated: :::classes: a class is kept, not drawn',
    '42 approximated: a Markdown string is kept, drawn as plain text',
    '49 skipped: #nope;: an entity Mermaid does not know, kept as written',
    '50 approximated: "Unclosed quote: a quote is not closed, kept as written',
    '62 approximated: unclosed((shape: (( is not closed by )), read as text',
    '63 skipped: trailing: text after the topic is not read',
    '64 approximated: Second root: a second root, which Mermaid refuses: read as a topic with no parent',
  ]);
  const node = id => m.nodes.find(n => n.id === id), v = m.views[0];
  assert.deepEqual([m.title, v.id, v.title, m.root], ["Every construct on Mermaid's mindmap page", 'mindmap', "Every construct on Mermaid's mindmap page", 'mindmap']);
  assert.deepEqual(v.nodeIds, m.nodes.map(n => n.id)); // source order
  assert.deepEqual(check(m, 'mindmap'), []);
  assert.deepEqual(core(m), []);
  // the tree from the indents: a deeper indent of any size is a child; a tab counts one, so six tabs sit under four spaces
  assert.deepEqual(['origins', 'uses', 'creative-techniques', 'six-tabs-level-six', 'six-tabs-and-two-spaces', 'five-spaces-between-the-levels', 'hinted', 'second-root'].map(id => node(id).parent ?? null),
    ['root', 'on-automatic-creation', 'uses', 'unclear-indents', 'six-tabs-level-six', 'unclear-indents', 'root', null]);
  // shapes, icons, classes and Markdown kept under ext.mermaid; [ ] is the topic itself
  assert.deepEqual(['root', 'sq', 'rr', 'ci', 'bg', 'cl', 'hx', 'text-with-no-id', 'rounded-with-no-id'].map(id => node(id).ext?.mermaid.shape ?? null),
    ['circle', null, 'rounded', 'circle', 'bang', 'cloud', 'hexagon', null, 'rounded']);
  assert.deepEqual([node('long-history').ext, node('A').ext, node('B').ext, node('md2').ext], [{ mermaid: { icon: 'fa fa-book' } }, { mermaid: { classes: 'urgent large' } },
    { mermaid: { shape: 'rounded', icon: 'mdi mdi-skull-outline' } }, { mermaid: { markdown: true } }]);
  // text: <br>, Markdown over three lines, quotes and entities; an unknown one and an unclosed quote kept as written
  assert.deepEqual(['on-effectiveness-and-features', 'md', 'q1', 'q2', 'q3', 'q4', 'unclosed-shape', 'after'].map(id => node(id).label),
    ['On effectiveness\nand features', 'The **root** with\na second line\nUnicode works too: 🤓', 'A double quote:" and #hash', 'Angles <b> and & and ♥', 'Unknown #nope; kept',
      '"Unclosed quote', 'unclosed((shape', 'text']);
  // ids: a topic's own, a hint, else its words; a text read twice takes the next free
  assert.deepEqual(['hinted', 'origins-2', 'origins-3', 'text-with-no-id'].map(id => node(id).label), ['Hinted topic', 'Origins', 'Origins', 'Text with no id']);
  assert.deepEqual([v.present, node('left-side').opensView], [{ 'left-side': { side: 'left' } }, 'mindmap']);
  // written back: what it kept, as it came
  const t = write(m), back = read(t);
  assert.match(t, / {2}root\(\(mindmap\)\)\n/);
  assert.match(t, / {6}bg\)\)Bang\(\(\n {6}cl\)Cloud\(\n {6}hx\{\{Hexagon\}\}\n/);
  assert.match(t, / {6}B\(Another\)\n {6}::icon\(mdi mdi-skull-outline\)\n/);
  assert.match(t, / {6}A\[I am a topic\]\n {6}:::urgent large\n/);
  assert.match(t, / {6}md\["`The \*\*root\*\* with\na second line\nUnicode works too: 🤓`"\]\n/);
  assert.match(t, / {6}q1\["A double quote:#quot; and #35;hash"\]\n/);
  assert.match(t, / {4}%% side: left\n {4}%% opens: mindmap\n {4}Left side\n/);
  assert.match(t, /\n%% not written: second-root: a further root, which Mermaid refuses: it and what it holds\n$/);
  assert.deepEqual(back.model.nodes.map(n => n.id), m.nodes.map(n => n.id).filter(id => id !== 'second-root'));
});

test('the same source read twice gives the same ids (R3); an inserted topic renames only the later ones of its text', () => {
  assert.deepEqual(read(every), read(every));
  const ids = s => read(s).model.nodes.map(n => n.id);
  assert.deepEqual(ids('mindmap\n  Plan\n    Idea\n    Other\n    Idea\n'), ['plan', 'idea', 'other', 'idea-2']);
  assert.deepEqual(ids('mindmap\n  Plan\n    Idea\n    New\n    Other\n    Idea\n'), ['plan', 'idea', 'new', 'other', 'idea-2']);
  assert.deepEqual(ids('mindmap\n  Plan\n    Idea\n    Idea\n    Other\n    Idea\n'), ['plan', 'idea', 'idea-2', 'other', 'idea-3']);
  // a topic's own id is taken before text's: a later id[ ] keeps its id, the earlier text moves on
  const r = read('mindmap\n  Plan\n    Idea\n    idea[Named]\n    %% id: idea\n    Hinted\n');
  assert.deepEqual([r.model.nodes.map(n => n.id), lines(r)], [['plan', 'idea-2', 'idea', 'idea-3'], ['5 approximated: %% id: idea is taken, so it is idea-3']]);
});

test('the writer names what Mermaid cannot hold and never writes it invalid', () => {
  const T = (id, parent, x = {}) => ({ id, type: 'mindmap.Topic', label: id, ...(parent ? { parent } : {}), ...x });
  const chain = Array.from({ length: 70 }, (_, k) => T(`c${k}`, k ? `c${k - 1}` : null));
  const m = { schemaVersion: 2, nodes: [...chain, T('lone'), T('under-lone', 'lone'), { id: 'card', label: 'x' }, T('p1', 'c0', { props: { a: 1 }, ext: { other: 1, mermaid: { shape: 'star', x: 1 } } })],
    edges: [{ id: 'e', type: 'flow.Flow', from: 'c0', to: 'c1' }], views: [{ id: 'mindmap', diagram: 'mindmap', nodeIds: ['c0', 'p1', ...chain.slice(1).map(n => n.id), 'lone', 'under-lone', 'card'] }] };
  const t = write(m), back = read(t);
  assert.deepEqual(t.split('\n').filter(l => l.startsWith('%% not written')), [
    '%% not written: card (undefined)',
    '%% not written: lone: a further root, which Mermaid refuses: it and what it holds',
    '%% not written: p1: shape star, which Mermaid\'s mindmap does not have',
    '%% not written: p1: its props',
    '%% not written: p1: its ext.other',
    '%% not written: p1: its ext.mermaid.x',
    '%% not written: c65: deeper than 64 levels, so it and what lies below it are written at level 64',
    '%% not written: e (flow.Flow): a mindmap has no lines']);
  // the deep ones hang at level 64, where the reader puts them too
  const parent = id => back.model.nodes.find(n => n.id === id).parent;
  assert.deepEqual(['c64', 'c65', 'c69'].map(parent), ['c63', 'c63', 'c63']);
  assert.deepEqual(lines(back), []); // written at level 64, they are read there, as siblings
  assert.deepEqual([write({}), write(m, 'nope'), write({ views: [{ id: 'f', diagram: 'flowchart' }] }, 'f')],
    ['%% not written: the model, which has no mindmap view\n', '%% not written: view nope, which the model does not have\n', '%% not written: view f, a flowchart view, not a mindmap one\n']);
});

const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
const best = (f, n = 3) => { let [out, ms] = cpu(f); for (let i = 1; i < n; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };

test('hostile input (§8.2) reads in under a second and never throws; over 1 MiB is refused (R2) (timed)', () => {
  const big = read('mindmap\n  ' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, lines(big)], [[], ['1 skipped: the input is 1048586 characters, over the limit of 1048576: nothing read']]);
  const ladder = c => 'mindmap\n' + Array.from({ length: 1400 }, (_, k) => c.repeat(k) + `t${k}`).join('\n');
  const hostile = {
    'spaces 1,400 deep': ladder(' '), 'tabs 1,400 deep': ladder('\t'),
    '100,000 bare topics with one text': 'mindmap\n  root\n' + '    x\n'.repeat(100000),
    'a 64 KiB line of ( and )': 'mindmap\n  root\n    a' + '()'.repeat(32768), 'a 64 KiB line of (': 'mindmap\n  root\n    ' + '('.repeat(65536),
    'a 64 KiB line of ) and (': 'mindmap\n  root\n    ' + ')('.repeat(32768), 'an unclosed Markdown string': 'mindmap\n  root\n    a["`' + 'x\n'.repeat(300000),
    'unclosed quotes': 'mindmap\n  root\n' + '    a["x]\n'.repeat(80000), 'entities': 'mindmap\n  root\n    a["' + '#nope;#35;'.repeat(50000) + '"]',
  };
  for (const f of ['directives', 'proto', 'unclosed', 'crlf']) hostile[`tests/import/hostile/mindmap-${f}.mmd`] = text(`import/hostile/mindmap-${f}.mmd`);
  let worst = 0;
  for (const [name, h] of Object.entries(hostile)) {
    assert.ok(h.length <= 1 << 20, `${name}: ${h.length}`);
    const [r, ms] = best(() => read(h));
    worst = Math.max(worst, ms);
    assert.ok(ms < 1000 && r.model.schemaVersion === 2 && r.model.nodes.length > 0, `${name}: read in ${ms} ms`);
    assert.ok(!r.report.some(x => /the reader failed/.test(x.message)), `${name}: the reader failed`);
    assert.ok(best(() => write(r.model))[1] < 1000, `${name}: written slowly`);
  }
  console.log(`# hostile input: the slowest read ${worst.toFixed(0)} ms CPU, best of three (target and ceiling 1000 ms)`);
  // read to 64 levels, deeper lines at 64, one report item; through tabs as through spaces
  for (const c of [' ', '\t']) {
    const r = read(ladder(c)), depth = new Map();
    for (const n of r.model.nodes) depth.set(n.id, n.parent ? depth.get(n.parent) + 1 : 0);
    assert.deepEqual([r.model.nodes.length, Math.max(...depth.values()), depth.get('t1399'), r.model.nodes.find(n => n.id === 't1399').parent, lines(r)],
      [1400, 64, 64, 't63', ['67 approximated: deeper than 64 levels: read at level 64']]);
  }
  // 10,000 lines each a tab deeper hold 50 million characters, since a tab counts one: refused by size first
  assert.equal(10000 * 9999 / 2 > 1 << 20, true);
  const xs = read(hostile['100,000 bare topics with one text']).model.nodes;
  assert.deepEqual([xs.length, xs[1].id, xs[2].id, xs.at(-1).id], [100001, 'x', 'x-2', 'x-100000']);
  const proto = read(hostile['tests/import/hostile/mindmap-proto.mmd']);
  assert.deepEqual(proto.model.nodes.map(n => [n.id, n.label, n.parent ?? null]), [['proto', '__proto__', null], ['constructor', 'constructor', 'proto'],
    ['__proto__', 'hasOwnProperty', 'proto'], ['toString', '__proto__', 'proto'], ['valueOf', 'constructor', 'proto']]);
  assert.deepEqual(core(proto.model), []);
  assert.deepEqual(lines(read(hostile['tests/import/hostile/mindmap-directives.mmd'])), ["2 skipped: a %%{init}%% directive: Mermaid's configuration is not read",
    '4 skipped: #ent;: an entity Mermaid does not know, kept as written', '4 skipped: #99999999;: an entity Mermaid does not know, kept as written',
    '5 approximated: "An unclosed quote: a quote is not closed, kept as written']);
  assert.deepEqual(lines(read(hostile['tests/import/hostile/mindmap-unclosed.mmd'])), ['3 approximated: id((text: (( is not closed by )), read as text',
    '4 approximated: id2{{text}: {{ is not closed by }}, read as text', '5 approximated: ]closing first: ] opens no shape, read as text',
    '6 approximated: x))bang: )) is not closed by ((, read as text', '7 approximated: "["quote: [ is not closed by ], read as text']);
  // an unclosed Markdown string is its one line, read as text; the lines after it are read as they are
  const md = read('mindmap\n  root\n    a["`open\n    b\n    c\n');
  assert.deepEqual([md.model.nodes.map(n => [n.id, n.parent ?? null]), lines(md)],
    [[['root', null], ['a-open', 'root'], ['b', 'root'], ['c', 'root']], ['3 approximated: a["`open: ["` is not closed by `"], read as text']]);
  assert.equal(read(hostile['an unclosed Markdown string']).model.nodes.length, 300001);
  // a side on a topic whose id is __proto__ is kept and written back; a carriage return in a label is reported
  const side = read('mindmap\n  root\n    %% side: left\n    __proto__[x]\n');
  assert.deepEqual([Object.entries(side.model.views[0].present), side.report], [[['__proto__', { side: 'left' }]], []]);
  assert.match(write(side.model), /%% side: left\n {4}__proto__\[x\]/);
  assert.match(write({ schemaVersion: 2, nodes: [{ id: 'a', type: 'mindmap.Topic', label: 'a\r\nb' }], edges: [], views: [{ id: 'v', diagram: 'mindmap', nodeIds: ['a'] }] }),
    /%% not written: a: a carriage return in its label, written as a line break/);
  const crlf = read(hostile['tests/import/hostile/mindmap-crlf.mmd']);
  assert.deepEqual([crlf.report, crlf.model.nodes.map(n => [n.id, n.parent ?? null])],
    [[], [['root', null], ['one-tab', 'root'], ['space-then-tab', 'one-tab'], ['two', 'one-tab'], ['four-spaces', 'two']]]);
  // §11: 5,000 topics read and written, against 100 ms
  const m = read('mindmap\n  root\n' + Array.from({ length: 4999 }, (_, k) => '  '.repeat(2 + (k % 8)) + `Topic ${k} [x]`).join('\n')).model;
  const [t, w] = best(() => write(m)), r = best(() => read(t))[1];
  assert.equal(read(t).model.nodes.length, 5000);
  console.log(`# 5,000 topics: read ${r.toFixed(0)} ms, written ${w.toFixed(0)} ms CPU, best of three (target 100 ms, ceiling 1000 ms)`);
  assert.ok(r < 1000 && w < 1000);
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart TD\nA-->B', '---\ntitle: x\n', 'mindmap', 'mindmap\n::icon(x)\n:::c\n', 'mindmap\n  a[\n  ((\n  "`\n  ]\n  %% id:\n  %% side: up\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2 && r.model.views[0].diagram === 'mindmap', String(x));
    assert.ok(!r.report.some(y => /the reader failed/.test(y.message)), `${String(x)}: the reader failed`);
  }
  assert.deepEqual(lines(read('flowchart TD\nA-->B')), ['1 skipped: not a Mermaid mindmap: nothing read']);
  assert.deepEqual(lines(read('mindmap\n::icon(x)\n:::c\n  a\n')), ['2 skipped: ::icon(x): no topic above it', '3 skipped: :::c: no topic above it']);
  assert.deepEqual(lines(read('mindmap\n  a\n  %% side: up\n  %% opens: v\n')), ['3 skipped: %% side: up: a side is left or right', '4 skipped: %% opens: v: no topic below it takes it']);
  const arrow = read('%% id: a->b\nmindmap\n  x->y[t]\n');
  assert.deepEqual([arrow.model.root, arrow.model.nodes[0].id, lines(arrow)],
    ['a-b', 'x-y', ['1 approximated: %% id: a->b: an id holds no "->", so the view is a-b', '3 approximated: topic x->y: an id holds no "->", so it is x-y']]);
});
