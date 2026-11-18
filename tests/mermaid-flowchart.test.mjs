// The Mermaid flowchart reader and writer (notes/milestone-2.md §8, §8.2, M2.9): read(write(model)) equals the model on
// the subset, ids included, for example 21 and 500 generated models; the file with every construct on Mermaid's flowchart
// page gives the pinned report (risks.md R1, R4), and on it the reader reads every node and link the map importer
// (umlimator_import.py) reads, with the same ids; same source, same ids (R3); a size limit, a cap on links, hostile input
// read in linear time, and malformed input reported, never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMermaidFlowchart as read, writeMermaidFlowchart as write } from '../src/readers/mermaid-flowchart.js';
import { validate } from '../lib/umlimator-all.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/flowchart.mmd', import.meta.url), 'utf8');

// the model as one flowchart view shows it, which is what Mermaid's text carries: its nodes, the flows between them, and
// of the view its id, title, direction (down unless right) and nodes
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes: m.nodes.filter(n => ids.has(n.id)), edges: m.edges.filter(e => ids.has(e.from) && ids.has(e.to)),
    views: [{ id: v.id, diagram: 'flowchart', ...(title ? { title } : {}), direction: v.direction === 'right' ? 'right' : 'down', nodeIds: v.nodeIds }] };
}
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });
const core = m => validate(m).filter(p => p.level === 'error' && !p.rule); // a core error: a dangling end, an id used twice, ...

test('read(write(model)) is example 21, ids included, and nothing is reported', () => {
  const m = json('../examples/returns-flowchart.json'), text = write(m), back = read(text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(canon(back.model), canon(project(m, 'returns')), text);
  assert.doesNotMatch(text, /not written/);
  // the bracket forms where Mermaid has them, @{ shape } for the three it lacks; end, which Mermaid reads as a keyword, by a hint
  assert.match(text, /^---\ntitle: Handling a returned book\n---\n%% id: returns\nflowchart TD\n {2}return-arrives\(\["Returned parcel arrives"\]\)\n {2}slip\[\/"Read the returns slip"\/\]\n/);
  assert.match(text, / {2}key-in@\{ shape: manual-input, label: "Key in the order number" \}\n/);
  assert.match(text, / {2}wait@\{ shape: delay, label: "Wait for the bank to confirm" \}\n/);
  assert.match(text, / {2}letter@\{ shape: doc, label: "Rejection letter" \}\n/);
  assert.match(text, / {2}resaleable\{"Fit for resale\?"\}\n {2}refund\[\["Refund the payment"\]\]\n/);
  assert.match(text, / {2}stock-records\[\("Stock records"\)\]\n/);
  assert.match(text, / {2}join\(\("A"\)\)\n {2}%% id: end\n {2}N_end\(\["Return closed"\]\)\n/);
  assert.match(text, / {2}%% id: resaleable-yes\n {2}resaleable -->\|"yes"\| refund\n/);
  assert.match(text, / {2}slip --> key-in\n/); // a derived id needs no hint
  assert.equal(text.split('%% id:').length - 1, 7);
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
const TYPES = ['flow.Terminator', 'flow.Process', 'flow.Decision', 'flow.InputOutput', 'flow.PredefinedProcess', 'flow.Document', 'flow.Database', 'flow.ManualInput', 'flow.Delay', 'flow.Connector'];
const TEXT = ['Start', 'Fit for resale?', 'Quotes "and" <angles>', 'two\nlines', 'semi;colon #1', 'pipe | bar', 'back\\slash', '%% not a comment', '50% off', ' padded ', 'end', '[x]',
  '`ticks`', '#quot; kept', '<br> kept', '{a: b}', 'A', 'Ünïcode ❤', '', '-->', 'a, b: c'];
const NAMES = ['a', 'b', 'end', 'End', 'class-a', 'classes', 'x y', 'Ünit', 'a-b', 'a.b', '9lives', 'o', 'x', 'ox', 'graph', 'subgraph', 'style', 'default', '__proto__', 'constructor',
  '$x', 'N_end', 'a_b', 'a--b', '-lead', 'trail-', 'é', 'a-b-c', 'flowchart', 'A1', 'q"uote', 'a&b', 'k1'];
function generate(seed) {
  const r = rng(seed), maybe = (p, x) => (r() < p ? x : undefined), used = new Set(), nodes = [], edges = [];
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  for (let k = 0, n = 1 + Math.floor(r() * 12); k < n; k++) nodes.push({ id: take(pick(r, NAMES), `n${used.size}`), type: pick(r, TYPES), label: pick(r, TEXT) });
  for (let k = 0, n = Math.floor(r() * 16); k < n; k++) {
    const from = pick(r, nodes).id, to = pick(r, nodes).id; // self-loops and parallel flows too
    edges.push(clean({ id: take(pick(r, [`${from}-${to}`, `${from}-${to}-2`, 'e1', 'yes', ...NAMES]).replace(/->/g, '-'), `f${used.size}`), type: 'flow.Flow', from, to, label: maybe(0.5, pick(r, TEXT)) }));
  }
  const title = maybe(0.6, pick(r, ['Returns', 'Returns: a book', "It's here", '---']));
  const view = clean({ id: pick(r, ['flowchart', 'returns', 'vé w', 'a->b'.replace('->', '-')]), diagram: 'flowchart', title, direction: pick(r, ['down', 'right']), nodeIds: nodes.map(n => n.id).sort(() => r() - 0.5) });
  return clean({ schemaVersion: 2, title, root: view.id, nodes: nodes.sort(() => r() - 0.5), edges: edges.sort(() => r() - 0.5), views: [view] });
}

test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let hints = 0, shapes = 0, loops = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), text = write(m), back = read(text);
    hints += text.split('%% id:').length - 1; shapes += text.split('@{ shape:').length - 1; loops += m.edges.filter(e => e.from === e.to).length;
    assert.doesNotMatch(text, /%% not written/, `seed ${seed}\n${text}`);
    assert.deepEqual(back.report, [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${text}`);
    assert.deepEqual(core(back.model), [], `seed ${seed}`);
  }
  assert.ok(hints > 1500 && shapes > 800 && loops > 100, `${hints} hints, ${shapes} @{ shape }, ${loops} self-loops`);
});

test("a file with every construct on Mermaid's flowchart page gives the pinned report (R1, R4)", () => {
  const { model, report } = read(every);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    "10 skipped: a %%{init}%% directive: Mermaid's configuration is not read",
    '12 skipped: accTitle: accessibility text is not read',
    '13 skipped: accDescr: accessibility text is not read',
    '20 approximated: md: a Markdown string is read as plain text',
    '22 approximated: round: a rounded box is read as a process',
    '27 approximated: asym: an asymmetric shape is read as a process',
    '29 approximated: hexagon: a hexagon is read as a process',
    '32 approximated: trap: a trapezoid is read as a process',
    '33 approximated: trapalt: an upside-down trapezoid is read as a process',
    '34 approximated: dbl: a double circle is read as a process',
    '51 approximated: sh16: shape hex is read as a process',
    '52 approximated: sh17: shape docs is read as a process',
    '53 approximated: sh18: shape bolt is read as a process',
    '55 skipped: icon: icon is not read', '55 skipped: icon: form is not read', '55 skipped: icon: pos is not read', '55 skipped: icon: h is not read',
    '56 skipped: img: img is not read', '56 skipped: img: pos is not read', '56 skipped: img: w is not read', '56 skipped: img: h is not read', '56 skipped: img: constraint is not read',
    '59 approximated: A2 --- B2: no arrowhead: read as a flow',
    '60 approximated: A3 -- This is the text! --- B3: no arrowhead: read as a flow',
    '61 approximated: A4 ---|This is the text| B4: no arrowhead: read as a flow',
    '64 approximated: A7 -.-> B7: dotted: read as a flow',
    '65 approximated: A8 -. text .-> B8: dotted: read as a flow',
    '66 approximated: A9 ==> B9: thick: read as a flow',
    '67 approximated: A10 == text ==> B10: thick: read as a flow',
    '68 skipped: A11 ~~~ B11: an invisible link is not read',
    "75 skipped: e1@{ ... }: a link's animation is not read",
    '77 approximated: M --o N: a circle end: read as a flow',
    '78 approximated: M --x O: a cross end: read as a flow',
    '79 approximated: P o--o Q: a circle end, an arrowhead at each end: read as two flows',
    '80 approximated: Q <--> R: an arrowhead at each end: read as two flows',
    '81 approximated: R x--x S: a cross end, an arrowhead at each end: read as two flows',
    '92 skipped: subgraph one: the group is not read, the nodes in it are',
    '95 skipped: subgraph two-words: the group is not read, the nodes in it are',
    '98 skipped: subgraph three: the group is not read, the nodes in it are',
    '99 approximated: direction RL inside a subgraph is not kept: the view has one direction',
    '101 skipped: subgraph inner: the group is not read, the nodes in it are',
    '106 skipped: one --> three: one is a subgraph, which is not read',
    '107 skipped: three --> c2: three is a subgraph, which is not read',
    '109 approximated: g: a Markdown string is read as plain text',
    '109 approximated: g -> h: a Markdown string is read as plain text',
    '111 skipped: click A1 callback "Tooltip for a callback": styles and interaction are not read',
    '112 skipped: click B1 "https://www.github.com" "This is a tooltip for ...: styles and interaction are not read',
    '113 skipped: linkStyle 3 stroke:#ff3,stroke-width:4px,color:red: styles and interaction are not read',
    '114 skipped: style id1 fill:#f9f,stroke:#333,stroke-width:4px: styles and interaction are not read',
    '115 skipped: classDef someclass fill:#f96: styles and interaction are not read',
    '116 skipped: class id2 someclass: styles and interaction are not read',
    '117 skipped: i1:::someclass: a style class is not read',
    '126 approximated: %% id: k1 is taken, so k2 --> k1 is k2-k1',
    '128 approximated: %% id: has->arrow: an id holds no "->", so it is has-arrow',
    '130 skipped: an end that closes no subgraph',
    '131 skipped: not read: l1 --> l2 -->',
    '132 skipped: not read: l3 -- unclosed text',
    "133 skipped: direction LR outside a subgraph is not read: the header gives the view's direction",
    '134 skipped: not read: q1@{ shape: doc',
    '135 skipped: subgraph never: the group is not read, the nodes in it are',
    '135 approximated: subgraph never is never closed: read to the end',
  ]);
  const v = model.views[0], node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id), type = id => node(id).type.slice(5);
  assert.deepEqual([model.title, v.id, v.direction], ["Every construct on Mermaid's flowchart page", 'flowchart', 'down']);
  assert.deepEqual(core(model), []);
  // each bracket form and each @{ shape } of a flowchart symbol as its type; the others as processes
  assert.deepEqual(['id', 'stadium', 'subr', 'cylinder', 'circle', 'rhombus', 'lean', 'leanalt', 'round', 'hexagon', 'dbl'].map(type),
    ['Process', 'Terminator', 'PredefinedProcess', 'Database', 'Connector', 'Decision', 'InputOutput', 'InputOutput', 'Process', 'Process', 'Process']);
  assert.deepEqual(Array.from({ length: 18 }, (_, k) => type(`sh${k + 1}`)), ['Process', 'Terminator', 'Decision', 'InputOutput', 'InputOutput', 'PredefinedProcess', 'PredefinedProcess',
    'Document', 'Database', 'ManualInput', 'ManualInput', 'Delay', 'Connector', 'Terminator', 'Terminator', 'Process', 'Process', 'Process']);
  // labels: a bare node is its id; quotes, Markdown's backticks, entity codes and ; inside quotes
  assert.deepEqual(['id', 'md', 'Y', 'Z', 'j3', 'sh18', 'icon', 'U'].map(id => node(id).label), ['id', 'This **is** _Markdown_', 'A double quote:"', 'A dec char:♥', 'Last; first', 'sh18', 'User Icon', 'Is it?']);
  // links: text inline and in pipes, chains, groups, an edge id, two flows for two arrowheads
  assert.deepEqual(['A3-B3', 'A4-B4', 'A6-B6', 'A8-B8', 'C2-C3', 'U-X', 'g-h'].map(id => edge(id).label), ['This is the text!', 'This is the text', 'text', 'text', 'text2', 'No', 'The **dog** in the hog']);
  assert.equal(edge('A1-B1').label, undefined);
  assert.deepEqual(['a-b', 'a-c', 'b-d', 'c-d', 'E-G', 'E-H', 'F-G', 'F-H', 'e1', 'P-Q', 'Q-P', 'Q-R', 'R-Q'].map(id => !!edge(id)), Array(13).fill(true));
  assert.deepEqual([edge('e1').from, edge('e1').to], ['K', 'L']);
  // the hints: a link's id, a node's id, a taken one, one with ->
  assert.deepEqual([edge('t-link').from, node('k-three').label, edge('k2-k1').to, edge('has-arrow').to], ['k1', 'Third', 'k1', 'k-three']);
  // subgraphs: their nodes read, their ids no node
  assert.ok(['a1', 'b2', 'c3', 'q2'].every(node) && !node('one') && !node('three'));
});

test("on the file of every construct it reads every node and link the map importer reads, with the importer's ids", () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const py = JSON.parse(execFileSync('python3', ['-I', '-c', `import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
import umlimator_import as imp
m, _ = imp.read("mermaid", sys.stdin.read(), "flowchart")
print(json.dumps({"nodes": [n["id"] for n in m["nodes"]], "edges": [[e["id"], e["from"], e["to"]] for e in m["edges"]], "boxes": [b["id"] for v in m["views"] for b in v.get("containers", [])]}))`], { input: every, encoding: 'utf8' }));
  // the importer reads no %% id: (a comment to it and to Mermaid), so the reader is given the file without them
  const { model } = read(every.split('\n').filter(l => !/^\s*%% id:/.test(l)).join('\n'));
  const nodes = model.nodes.map(n => n.id), edges = model.edges.map(e => [e.id, e.from, e.to]), boxes = new Set(py.boxes);
  assert.ok(py.nodes.length > 80 && py.edges.length > 40, `${py.nodes.length} nodes, ${py.edges.length} links`);
  assert.deepEqual(nodes.filter(id => py.nodes.includes(id)), py.nodes);
  // the importer draws a line to a subgraph's box; the typed flowchart has no box, so the reader reports it (pinned above)
  assert.deepEqual(edges.filter(e => py.edges.some(p => p[0] === e[0])), py.edges.filter(([, a, b]) => !boxes.has(a) && !boxes.has(b)));
  assert.deepEqual(py.edges.filter(([, a, b]) => boxes.has(a) || boxes.has(b)), [['one-three', 'one', 'three'], ['three-c2', 'three', 'c2']]);
  // what it reads besides: Mermaid's @{ } forms, the second flow of o--o and x--x; an edge id both read, as the line's id (audit 29)
  assert.deepEqual(nodes.filter(id => !py.nodes.includes(id)), [...Array.from({ length: 18 }, (_, k) => `sh${k + 1}`), 'icon', 'img']);
  assert.deepEqual(edges.filter(e => !py.edges.some(p => p[0] === e[0])), [['Q-P', 'Q', 'P'], ['S-R', 'S', 'R']]);
  assert.deepEqual(py.edges.find(p => p[0] === 'e1'), ['e1', 'K', 'L']);
});

test('the same source read twice gives the same ids (R3); an inserted link renames only the later ones of its pair', () => {
  const ids = m => [...m.nodes.map(n => n.id), ...m.edges.map(e => e.id)];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  const a = read('flowchart TD\nA --> B\nA -->|again| B\nC --> D\n').model, b = read('flowchart TD\nC --> D\nA --> B\nA -->|again| B\nC --> D\n').model;
  assert.deepEqual(a.edges.map(e => e.id), ['A-B', 'A-B-2', 'C-D']);
  assert.deepEqual(b.edges.map(e => e.id), ['C-D', 'A-B', 'A-B-2', 'C-D-2']);
  // a node named as another's derived link takes its name; the link the next free
  const c = read('graph LR\na-b --> c\na --> b-c\nb\n').model;
  assert.deepEqual([c.nodes.map(n => n.id), c.edges.map(e => e.id)], [['a-b', 'c', 'a', 'b-c', 'b'], ['a-b-c', 'a-b-c-2']]);
  // a hint taken by a later node's name: the node takes the next free, reported
  const d = read('flowchart TD\n%% id: B\nA[x]\nB[y]\n');
  assert.deepEqual([d.model.nodes.map(n => n.id), d.report.map(x => `${x.line} ${x.message}`)], [['B', 'B-2'], ["4 node B: its name is another's id, so it is B-2"]]);
});

test('text over the size limit is refused with a report; links past the cap are not read; hostile input reads in under a second and never throws (R2) (timed)', () => {
  const big = read('flowchart TD\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit of 1048576/);
  const group = n => Array.from({ length: n }, (_, k) => `n${k}`).join(' & ');
  const product = 'flowchart TD\n' + group(400) + ' --> ' + group(400) + '\n';
  const hostile = [product, 'flowchart TD\n' + 'subgraph s\n'.repeat(90000), 'flowchart TD\n' + 'end\n'.repeat(260000),
    'flowchart TD\n' + Array.from({ length: 60000 }, (_, k) => `a${k % 300}-->|x|b${k % 7}`).join('\n'), 'flowchart TD\na -- ' + '.'.repeat(1000000), 'flowchart TD\na -- ' + '-x'.repeat(500000),
    'flowchart TD\na -. ' + '..-'.repeat(330000), 'flowchart TD\n' + 'a["'.repeat(330000), 'flowchart TD\n' + 'a[ & '.repeat(200000), 'flowchart TD\n' + 'A@{ '.repeat(250000),
    'flowchart TD\n' + ';'.repeat(1000000), 'flowchart TD\n' + 'a-'.repeat(500000), 'flowchart TD\nA ' + ' '.repeat(1000000) + '-- x', 'flowchart TD\n' + 'a --> b\n'.repeat(130000),
    'flowchart TD\n' + 'x@--> '.repeat(170000), 'flowchart TD\nsubgraph a[' + ' '.repeat(1000000) + 'x',
    'flowchart TD\n' + Array.from({ length: 80000 }, (_, k) => `A${k}([) `).join('& ') + ' --> Z', 'flowchart TD\n' + Array.from({ length: 80000 }, (_, k) => `A${k}[[x] `).join('& ') + ' --> Z',
    // audit 10: a chained line, with and without an edge id at its end (the id search was quadratic in the rest of the line)
    'flowchart TD\n' + Array.from({ length: 105000 }, (_, k) => `n${k}`).join('-->'), 'flowchart TD\n' + Array.from({ length: 95000 }, (_, k) => `n${k}`).join('-->') + ' e@--> z',
    'flowchart TD\nconstructor --> __proto__\n__proto__@{ shape: constructor }\nhasOwnProperty --> toString\n'];
  const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
  const best = f => { let [out, ms] = cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };
  let worst = 0;
  for (const h of hostile) {
    assert.ok(h.length <= 1 << 20, `${h.length}`);
    const [r, readMs] = best(() => read(h));
    worst = Math.max(worst, readMs);
    assert.ok(readMs < 1000, `${h.slice(13, 40)}: read ${readMs} ms`);
    const writeMs = best(() => write(r.model))[1];
    assert.ok(writeMs < 3000, `${h.slice(13, 40)}: write ${writeMs} ms`); // linear; a quadratic writer would pass by a hundredfold
  }
  console.log(`# hostile input: the slowest read ${worst.toFixed(0)} ms CPU, best of up to three (target and ceiling 1000 ms)`);
  const capped = read(product);
  assert.equal(capped.model.edges.length, 100000);
  assert.deepEqual(capped.report, [{ line: 2, status: 'skipped', message: 'over 100000 links: the rest are not read' }]);
  assert.equal(read(hostile[13]).model.edges.at(-1).id, 'a-b-100000');
  assert.deepEqual(read(hostile.at(-2)).model.edges.at(-1), { id: 'e', type: 'flow.Flow', from: 'n94999', to: 'z' });
  const proto = read(hostile.at(-1));
  assert.deepEqual(proto.model.nodes.map(n => [n.id, n.type]), [['constructor', 'flow.Process'], ['__proto__', 'flow.Process'], ['hasOwnProperty', 'flow.Process'], ['toString', 'flow.Process']]);
  assert.deepEqual(proto.report.map(x => x.message), ['__proto__: shape constructor is read as a process']);
  assert.deepEqual(core(proto.model), []);
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'stateDiagram-v2\nA-->B', '---\ntitle: x\n', 'flowchart\nsubgraph', 'graph TD;A-->B;B', 'flowchart TD\n-->\nA -->\n--> B\n:::\nA[\nA@{\nA@{ shape: }\n|x|\nA -->|x\n&\nA & --> B\n"\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('stateDiagram-v2\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid flowchart: nothing read' }]);
  // statements after the header, split by ;
  assert.deepEqual(read('graph TD;A-->B;B-->C').model.edges.map(e => e.id), ['A-B', 'B-C']);
  const arrow = read('%% id: a->b\nflowchart LR\n');
  assert.deepEqual([arrow.model.views[0].id, arrow.model.views[0].direction, arrow.report.map(x => `${x.line} ${x.message}`)], ['a-b', 'right', ['2 %% id: a->b: an id holds no "->", so the view is a-b']]);
  assert.deepEqual(read('flowchart BT\n').report.map(x => x.message), ['direction BT is drawn top to bottom']);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', ';', '#', ':', '\n', '-->', '---', '-.', '==', '|', '&', '%%', '@{', ':::', '<br>', '[', '/', '(', 'end\n', 'subgraph ', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(core(out.model), [], chars.join(''));
    write(out.model);
  }
});

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  const v = { id: 'v', diagram: 'flowchart', nodeIds: [] };
  assert.match(write({ schemaVersion: 2, title: 12, nodes: [], edges: [], views: [v] }), /^---\ntitle: "12"\n---\n%% id: v\nflowchart TD\n$/);
  const P = (id, more) => ({ id, type: 'flow.Process', label: id, ...more });
  const m = { schemaVersion: 2, nodes: [P('a', { props: { x: 1 } }), P('b', { parent: 'a' }), { id: 'k', type: 'uml.Class', label: 'K' }, { id: 'c', type: 'uml.Comment', label: 'note' },
    { id: 'n', type: 'flow.Decision' }, P('w', { label: { text: 7 } })], // an object, not text; a number is written as its text (audit 31)
  edges: [{ id: 't', type: 'flow.Flow', from: 'a', to: 'b', props: { weight: 2 } }, { id: 'u', type: 'flow.Flow', from: 'a', to: 'k' }, { id: 'l', type: 'uml.CommentLink', from: 'c', to: 'a' },
    { id: 'd', type: 'uml.Dependency', from: 'a', to: 'b' }, { id: 'q', type: 'flow.Flow', from: 'a', to: 'b', label: ['x'] }],
  views: [{ ...v, nodeIds: ['a', 'b', 'k', 'c', 'n', 'w'] }] };
  const text = write(m, 'v');
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: k (uml.Class)', '%% not written: c (uml.Comment)', '%% not written: a: its props', '%% not written: b: property parent',
    '%% not written: n: no label, read as an empty one', '%% not written: w: its label, which is not text', '%% not written: t: its props', '%% not written: u (flow.Flow)',
    '%% not written: l (uml.CommentLink)', '%% not written: d (uml.Dependency)', '%% not written: q: its label, which is not text']);
  const back = read(text);
  assert.deepEqual(back.report, []);
  assert.deepEqual([back.model.nodes.map(n => n.id), back.model.edges.map(e => e.id)], [['a', 'b', 'n', 'w'], ['t', 'q']]);
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const classes = json('../examples/sales-classes.json');
  assert.equal(write(classes), '%% not written: the model, which has no flowchart view\n');
  assert.match(write(classes, classes.views[0].id), /^%% not written: view .*, not a flowchart one\n$/);
});

test('an %% id: the statement below does not take is reported, not carried on; an edge id taken by a node is named so; a quoted link text may hold |', () => {
  for (const line of ['style A fill:red', 'subgraph s', 'end', 'A -->', 'direction LR']) {
    const r = read(`flowchart LR\n%% id: foo\n${line}\nA --> B`);
    assert.deepEqual(r.model.edges.map(e => e.id), ['A-B'], line);
    assert.deepEqual(r.report[0], { line: 2, status: 'skipped', message: '%% id: foo: the statement below it takes no id from it' }, line);
  }
  assert.deepEqual(read('flowchart LR\n%% id: foo\n%% id: bar\nA --> B\n%% id: baz').report.map(x => x.line), [2, 5]);
  // Mermaid draws e1@{ } above its link as a node e1, so the link's id is taken
  assert.deepEqual(read('flowchart TD\ne1@{ animate: true }\nA e1@--> B').report.at(-1), { line: 3, status: 'approximated', message: 'the edge id e1 is taken, so A --> B is A-B' });
  assert.deepEqual(read('flowchart TD\nA -->|"a|b"| B').model.edges, [{ id: 'A-B', type: 'flow.Flow', from: 'A', to: 'B', label: 'a|b' }]);
  assert.equal(write({ nodes: [], edges: [], views: [{ diagram: 'flowchart', nodeIds: [] }] }), 'flowchart TD\n'); // a view with no id
});

test('a carriage return in a label is written as an entity, so it reads back as itself (audit 3)', () => {
  for (const label of ['x\ry', 'x\r\ny']) {
    const t = write({ schemaVersion: 2, root: 'v', nodes: [{ id: 'a', type: 'flow.Process', label }], edges: [], views: [{ id: 'v', diagram: 'flowchart', nodeIds: ['a'] }] }, 'v');
    assert.equal(read(t).model.nodes[0].label, label);
  }
});

test('a ; inside an entity code outside quotes ends no statement (#35; #quot; #lt;), as Mermaid reads the codes first (audit 5)', () => {
  for (const [t, label] of [['A -->|#35;1 step| B', '#1 step'], ['A[#quot;x#quot;] --> B', undefined], ['A -- #lt;go#gt; --> B; C', '<go>']]) {
    const r = read(`flowchart LR\n  ${t}\n`);
    assert.deepEqual([r.model.edges.map(e => [e.from, e.to, e.label]), r.report], [[['A', 'B', label]], []], t);
  }
});

test('audit 7: a bare subgraph is a group, a quoted label may run over lines, and a trapezoid takes its nearest closer', () => {
  const pairs = t => { const r = read(t); return [r.model.nodes.map(n => [n.id, n.label]), r.model.edges.map(e => [e.from, e.to, e.label]), r.report.map(x => `${x.line} ${x.message}`)]; };
  // Mermaid's flow.jison reads `subgraph` alone as an untitled subgraph (id subGraph<n>): not a node, and its end closes it
  assert.deepEqual(pairs('flowchart LR\n  subgraph\n  A --> B\n  end\n  B --> C\n'),
    [[['A', 'A'], ['B', 'B'], ['C', 'C']], [['A', 'B', undefined], ['B', 'C', undefined]], ['2 subgraph subGraph0: the group is not read, the nodes in it are']]);
  // Mermaid's own Markdown-strings example: a quoted label over two lines, its line break kept
  assert.deepEqual(pairs('flowchart LR\n  a["`The **cat**\n  in the hat`"] -- "edge label" --> b["`The **dog** in the hog`"]\n').slice(0, 2),
    [[['a', 'The **cat**\nin the hat'], ['b', 'The **dog** in the hog']], [['a', 'b', 'edge label']]]);
  // [/x\] then [\y/]: the first takes its own \], not the second's /]
  assert.deepEqual(pairs('flowchart LR\n  A[/Order placed\\] --> B[\\Ship it/]\n  B --> C[Done]\n').slice(0, 2),
    [[['A', 'Order placed'], ['B', 'Ship it'], ['C', 'Done']], [['A', 'B', undefined], ['B', 'C', undefined]]]);
});

test('audit 8: the writer writes the flows the view lists (inline ones too), and an unknown direction as LR, as drawn', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'flow.Terminator', label: 'Start' }, { id: 'a', type: 'flow.Process', label: 'Ship' }],
    edges: [{ id: 'f1', type: 'flow.Flow', from: 's', to: 'a' }, { id: 'x', type: 'flow.Flow', from: 'a', to: 's', label: 'debug only' }],
    views: [{ id: 'v', diagram: 'flowchart', direction: 'LR', nodeIds: ['s', 'a'], edges: ['f1', { id: 'retry', type: 'flow.Flow', from: 'a', to: 's', label: 'again' }] }] };
  const text = write(m, 'v');
  assert.match(text, /^flowchart LR$/m);
  assert.ok(!text.includes('debug only') && text.includes('again'), text);
});

test('audit 18: a link\'s @{ } names each field it does not read: animate and animation as its animation, curve and the rest by key', () => {
  const said = text => read(`flowchart LR\n  A e1@--> B\n  ${text}`).report.map(x => `${x.line} ${x.status}: ${x.message}`);
  assert.deepEqual(said('e1@{ curve: linear }'), ['3 skipped: e1: curve is not read']);
  assert.deepEqual(said('e1@{ animate: true }'), ["3 skipped: e1@{ ... }: a link's animation is not read"]);
  assert.deepEqual(said('e1@{ animation: fast, curve: basis }'), ["3 skipped: e1@{ ... }: a link's animation is not read", '3 skipped: e1: curve is not read']);
  assert.deepEqual(read('flowchart LR\n  A e1@--> B\n  e1@{ curve: linear }').model.edges.map(e => e.id), ['e1']);
});

test('a blank %% id: is no hint, and is said (audit 19)', () => {
  const { model, report } = read('flowchart TD\n%% id:\nA --> B');
  assert.deepEqual(model.edges.map(e => e.id), ['A-B']);
  assert.deepEqual(report.map(r => r.message), ['%% id: holds no id: not read']);
});

test('audit 24: a front-matter title ends at a YAML comment, and a quoted one is read to its closing quote, in all seven readers', async () => {
  const bodies = { flowchart: 'flowchart LR\n  a --> b', class: 'classDiagram\n  class A', er: 'erDiagram\n  A ||--o{ B : x', state: 'stateDiagram-v2\n  [*] --> A',
    sequence: 'sequenceDiagram\n  A->>B: x', mindmap: 'mindmap\n  root', requirement: 'requirementDiagram\n  requirement r {\n  id: 1\n  }' };
  const cases = [['Shop # the main flow', 'Shop', []], ['"Shop" # the main flow', 'Shop', []], ["'Bob''s shop' # a comment", "Bob's shop", []],
    ['"The \\"returns\\" flow"', 'The "returns" flow', []], ['a#b c', 'a#b c', []], ['C# tips', 'C# tips', []],
    ['"Shop" and more', 'Shop', ['2 skipped: front matter title: and more, after the quoted title, is not read']],
    ['"Shop', 'Shop', []], ['"x \\', 'x \\', []]];
  for (const [kind, body] of Object.entries(bodies)) {
    const M = await import(`../src/readers/mermaid-${kind}.js`), rd = Object.values(M).find(f => f.name.startsWith('read'));
    for (const [val, title, said] of cases) {
      const { model, report } = rd(`---\ntitle: ${val}\n---\n${body}\n`);
      assert.equal(model.title, title, `${kind}: title: ${val}`);
      assert.deepEqual(report.filter(r => r.line === 2).map(r => `${r.line} ${r.status}: ${r.message}`), said, `${kind}: title: ${val}`);
    }
  }
});

test('audit 25: a block-scalar front-matter title, and a plain or quoted one over more lines, are read as js-yaml reads them, in all seven readers', async () => {
  const bodies = { flowchart: 'flowchart LR\n  a --> b', class: 'classDiagram\n  class A', er: 'erDiagram\n  A ||--o{ B : x', state: 'stateDiagram-v2\n  [*] --> A',
    sequence: 'sequenceDiagram\n  A->>B: x', mindmap: 'mindmap\n  root', requirement: 'requirementDiagram\n  requirement r {\n  id: 1\n  }' };
  // [front matter, title, its last line]: the key after it is still said, on its own line
  const cases = [['title: >\n  Orders and\n  payments', 'Orders and payments', 4], ['title: |-\n  Orders', 'Orders', 3], ['title: Orders\n  and payments', 'Orders and payments', 3],
    ['title: |\n  a\n  b', 'a\nb', 4], ['title: >\n  a\n\n  b\n    deep\n  c', 'a\nb\n  deep\nc', 7], ['title: >2\n   x\n  y', ' x\ny', 4],
    ["title: 'quoted\n  more' # c", 'quoted more', 3], ['title:\n  on the next line', 'on the next line', 3], ['title: >+ # a comment\n  kept', 'kept', 3]];
  for (const [kind, body] of Object.entries(bodies)) {
    const M = await import(`../src/readers/mermaid-${kind}.js`), rd = Object.values(M).find(f => f.name.startsWith('read'));
    for (const [fm, title, last] of cases) {
      const { model, report } = rd(`---\n${fm}\ntheme: x\n---\n${body}\n`);
      assert.equal(model.title, title, `${kind}: ${fm}`);
      assert.deepEqual(report.filter(r => r.message.startsWith('front matter')).map(r => `${r.line}: ${r.message}`), [`${last + 1}: front matter theme: Mermaid's configuration is not read`], `${kind}: ${fm}`);
    }
  }
});

test('a flowchart whose indented text is over the reader\'s limit is written unindented and reads back; text over it even so says so (audit 26)', () => {
  const big = n => {
    const m = { schemaVersion: 2, root: 'flow', nodes: [], edges: [], views: [{ id: 'flow', diagram: 'flowchart', nodeIds: [] }] };
    for (let i = 0; i < n; i++) {
      const id = `step_${i}`;
      m.nodes.push({ id, type: 'flow.Process', label: `Process the incoming order number ${i} carefully` }); m.views[0].nodeIds.push(id);
      if (i) m.edges.push({ id: `step_${i - 1}-${id}`, type: 'flow.Flow', from: `step_${i - 1}`, to: id, label: 'then' });
    }
    return m;
  };
  const t = write(big(10500)), back = read(t);
  assert.deepEqual([t.length <= 1 << 20, /over its limit/.test(t), back.model.nodes.length, back.model.edges.length], [true, false, 10500, 10499]);
  const t2 = write(big(14000));
  assert.match(t2.slice(t2.lastIndexOf('%%')), /^%% not written: text the reader reads back: this is \d+ characters, over its limit of 1048576\n$/);
});

// audit 31: the ER, flowchart, requirement and mindmap writers refused a number label as "not text", though the model draws
// it as written (audit 30) and the class and state writers write it: every writer now writes a number or true as its text
test('audit 31: every Mermaid writer writes a node or line label that is a number or true as its text, which reads back as that label', async () => {
  const W = {};
  for (const [f, n] of [['class', 'Class'], ['state', 'State'], ['er', 'Er'], ['flowchart', 'Flowchart'], ['requirement', 'Requirement'], ['mindmap', 'Mindmap']]) {
    const R = await import(`../src/readers/mermaid-${f}.js`); W[f] = [R['writeMermaid' + n], R['readMermaid' + n]]; }
  const two = (diagram, a, b, line) => ({ schemaVersion: 2, root: 'v', nodes: [a, b], edges: line ? [line] : [], views: [{ id: 'v', diagram, nodeIds: [a.id, b.id] }] });
  for (const label of [2024, 0, 1.5, true]) {
    const cases = {
      class: two('uml.class', { id: 'A', type: 'uml.Class', label }, { id: 'B', type: 'uml.Class', label: 'B' }),
      state: two('uml.state-machine', { id: 'A', type: 'uml.State', label }, { id: 'B', type: 'uml.State', label: 'B' }),
      er: two('er', { id: 'A', type: 'er.Entity', label }, { id: 'B', type: 'er.Entity', label: 'B' }, { id: 'A-B', type: 'er.Relationship', from: 'A', to: 'B', label, props: { identifying: false, fromMultiplicity: '1', toMultiplicity: '0..*' } }),
      flowchart: two('flowchart', { id: 'A', type: 'flow.Process', label }, { id: 'B', type: 'flow.Process', label: 'B' }, { id: 'A-B', type: 'flow.Flow', from: 'A', to: 'B', label }),
      requirement: two('sysml.requirement', { id: 'A', type: 'sysml.Requirement', label, props: { text: 't' } }, { id: 'B', type: 'sysml.Block', label: 'B' }),
      mindmap: { schemaVersion: 2, root: 'v', nodes: [{ id: 'A', type: 'mindmap.Topic', label }], edges: [], views: [{ id: 'v', diagram: 'mindmap', nodeIds: ['A'] }] },
    };
    for (const [f, m] of Object.entries(cases)) {
      const [write, readBack] = W[f], out = write(m), back = readBack(out).model;
      assert.doesNotMatch(out, /not text/, `${f} ${label}: ${out}`);
      assert.equal(back.nodes.find(x => x.id === 'A').label, String(label), `${f} ${label}: ${out}`);
      if (m.edges.length) assert.equal(back.edges.find(x => x.id === 'A-B').label, String(label), `${f} ${label} line: ${out}`);
    }
  }
  // another value is still refused, and said
  assert.match(W.flowchart[0]({ schemaVersion: 2, root: 'v', nodes: [{ id: 'A', type: 'flow.Process', label: { a: 1 } }], edges: [], views: [{ id: 'v', diagram: 'flowchart', nodeIds: ['A'] }] }), /not written: A: its label, which is not text/);
});

// audit 34: the dash form's text (Mermaid's edgeText) stopped at a |, so both readers dropped `S -- yes|no --> T` whole, its
// nodes too; the text now runs to the first close outside quotes, in this reader and in the map importer alike
test('a | in the dash form\'s link text is text, bare or quoted, in this reader and the map importer alike (audit 34)', () => {
  const src = ['flowchart LR', 'S -- yes|no --> T', 'U -- "a|b" --> V', 'A -- "x --> y" --> B', 'E -- open " quote --> F', 'G -- x --> H -- y|z --> I', 'J -->|"p|q"| K', 'L -- plain --> M'].join('\n');
  const want = [['S', 'T', 'yes|no'], ['U', 'V', 'a|b'], ['A', 'B', 'x --> y'], ['E', 'F', 'open " quote'], ['G', 'H', 'x'], ['H', 'I', 'y|z'], ['J', 'K', 'p|q'], ['L', 'M', 'plain']];
  const { model, report } = read(src);
  assert.deepEqual(model.edges.map(e => [e.from, e.to, e.label]), want);
  assert.deepEqual(report.filter(r => r.status === 'skipped'), []);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const py = JSON.parse(execFileSync('python3', ['-I', '-c', `import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
import umlimator_import as imp
m, unread = imp.read("mermaid", sys.stdin.read(), "flowchart")
print(json.dumps({"edges": [[e["from"], e["to"], e.get("label")] for e in m["edges"]], "unread": unread}))`], { input: src, encoding: 'utf8' }));
  assert.deepEqual(py, { edges: want, unread: [] });
  // a link with no close still fails in linear time, quotes and all
  const long = 'flowchart LR\nA -- ' + '"q" | '.repeat(20000) + '"\n', t = performance.now();
  read(long); execFileSync('python3', ['-I', '-c', `import sys
sys.path.insert(0, ${JSON.stringify(root)})
import umlimator_import as imp
imp.read("mermaid", sys.stdin.read(), "flowchart")`], { input: long, encoding: 'utf8' });
  assert.ok(performance.now() - t < 5000, `${Math.round(performance.now() - t)} ms`);
});

// audit 37: mfCloseAt ran over the whole run of one character before it said no close starts there, and the text scan moves on by
// one character, so a long unclosed link text of one repeated character (x, [, ...) took time in the square of its length
test('an unclosed link text of one repeated character is read in linear time, as before for each kind of character (audit 37)', () => {
  for (const c of ['x', '[', '(', '{', '<', "'", 'o', '>', '|', '.', '-', '=']) {
    const t = performance.now(), r = read('flowchart TD\nA -- ' + c.repeat(200000));
    assert.ok(performance.now() - t < 1500, `${JSON.stringify(c)}: ${Math.round(performance.now() - t)} ms`);
    assert.ok(r && typeof r === 'object', c);
  }
  // the closes the scan finds are as before
  assert.deepEqual(read('flowchart TD\nA -- text x --> B').model.edges.map(e => [e.from, e.to, e.label]), [['A', 'B', 'text x']]);
  assert.deepEqual(read('flowchart TD\nA == heavy ==> B\nC -. dotted .-> D').model.edges.map(e => [e.from, e.to, e.label]), [['A', 'B', 'heavy'], ['C', 'D', 'dotted']]);
});

test('a node of no type (or "") is written as a process, with its flows, and said (audit 43)', () => {
  for (const type of [undefined, '']) {
    const model = { schemaVersion: 2, nodes: [{ id: 's', type: 'flow.Terminator', label: 'Start' }, { id: 'x', ...(type === undefined ? {} : { type }), label: 'Check stock' }, { id: 'e', type: 'flow.Terminator', label: 'End' }],
      edges: [{ id: 'f1', type: 'flow.Flow', from: 's', to: 'x' }, { id: 'f2', type: 'flow.Flow', from: 'x', to: 'e' }], views: [{ id: 'v', diagram: 'flowchart', nodeIds: ['s', 'x', 'e'] }] };
    assert.deepEqual(validate(model).filter(p => p.level === 'error'), []);
    const text = write(model, 'v');
    assert.match(text, /^ {2}x\["Check stock"\]$/m);
    assert.match(text, /not written: x: no type, written as a process \(flow\.Process\)/);
    assert.doesNotMatch(text, /not written: (x \(|f1|f2)/);
    const back = read(text).model;
    assert.deepEqual(back.nodes.map(n => [n.id, n.type]), [['s', 'flow.Terminator'], ['x', 'flow.Process'], ['e', 'flow.Terminator']]);
    assert.deepEqual(back.edges.map(x => [x.id, x.from, x.to]), [['f1', 's', 'x'], ['f2', 'x', 'e']]);
  }
});
