// The Mermaid stateDiagram reader and writer (notes/stage-4.md §13, 4.8): read(write(model)) equals the model on the
// subset, ids included, for example 10 and 500 generated models; the file with every construct on Mermaid's state page
// gives the pinned report (risks.md R1, R4); same source, same ids (R3); §13's collisions; a size limit, hostile input
// read in linear time, and malformed input reported, never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidState as read, writeMermaidState as write } from '../src/readers/mermaid-state.js';
import { validate } from '../lib/umlimator-all.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/state.mmd', import.meta.url), 'utf8');

// the model as one state machine view shows it, which is what Mermaid's text carries: its nodes, the lines between them,
// and of the view its id, title, direction and nodes (not its layout, nor a parent)
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes: m.nodes.filter(n => ids.has(n.id)), edges: m.edges.filter(e => ids.has(e.from) && ids.has(e.to)),
    views: [{ id: v.id, diagram: 'uml.state-machine', ...(title ? { title } : {}), ...(v.direction === 'down' ? { direction: 'down' } : {}), nodeIds: v.nodeIds }] };
}
// order is not meaning for nodes, lines or a view's nodes; a state's regions keep theirs, and its internal transitions theirs
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const rank = x => (x.type === 'uml.Region' ? 0 : 1);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId).map(n => (n.members ? { ...n, members: [...n.members].sort((a, b) => rank(a) - rank(b)) } : n)),
  edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });

test('read(write(model)) is example 10, ids included, and nothing is reported', () => {
  const m = json('../examples/order-states.json'), text = write(m), back = read(text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(canon(back.model), canon(project(m, 'order-life')), text);
  assert.doesNotMatch(text, /not written/);
  // the writer's text is Mermaid's: regions by --, [*] where its scope's is, a kind Mermaid has no notation for, the crossings warned of
  assert.match(text, / {4}%% region: fulfilling\.parcel Parcel\n/);
  assert.match(text, /\n {4}--\n {4}%% region: fulfilling\.payment Payment\n/);
  assert.match(text, / {4}%% start-id: parcel-start\n {4}%% id: t-parcel-start\n {4}\[\*\] --> picking\n/);
  assert.match(text, / {4}%% id: delivery-history\n {4}%% kind: shallowHistory\n {4}state "H" as delivery_history\n/);
  assert.match(text, / {2}%% warning: Mermaid may not draw this\n {2}%% id: t-prepaid-picking\n {2}prepaid --> picking\n/);
  assert.match(text, /capturing --> capturing : capture failed \[attempts #60; 3\] \/ count the attempt\n/);
  assert.match(text, / {2}placed : entry \/ reserve the books\n/);
  assert.equal(text.split('%% warning:').length - 1, 7);
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
const TEXT = ['Waiting', 'colon: inside', 'Quotes "and" <angles>', 'two\nlines', 'semi;colon #1', 'go direction LR now', 'back\\slash', '%% not a comment', '50% off', ' padded ', '-- and }', '[*]'];
const TRIGGERS = ['go', 'after 30 days', 'evt(a/b)', 'pay(amount[0])', 'a, b', 'x: y', 'semi;colon', 'Ünïcode', 'two\nlines', 'entry'];
const GUARDS = ['x > 1', 'a[0] > 1', 'max(a, b[1]) > 2', 'else', 'a/b', 'q "quoted" <b>'];
const EFFECTS = ['count the attempt', 'a / b', 'say "hi" <b>', 'two\nlines', 'f(x); g #2', 'x:y'];
function generate(seed) {
  const r = rng(seed), maybe = (p, x) => (r() < p ? x : undefined), used = new Set(), nodes = [], edges = [];
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  const NAMES = ['idle', 'Two words', 'start', 'end', 'a-b', 'x.y', 'Ünit', 'note', 'state', 'a_b', 'idle.r1', 'S_x', 'click', 'default', '__proto__', 'constructor', '9lives'];
  const parts = () => clean({ trigger: maybe(0.6, pick(r, TRIGGERS)), guard: maybe(0.4, pick(r, GUARDS)), effect: maybe(0.5, pick(r, EFFECTS)) });
  const scope = (parent, depth) => { // a scope's states and pseudostates, some of them composite
    const here = [];
    for (let k = 0, n = 1 + Math.floor(r() * (depth ? 3 : 5)); k < n; k++) {
      const x = r(), base = parent ? `${parent}.` : '';
      if (x < 0.15) here.push(clean({ id: take(pick(r, ['start', `${base}start`, 'init']), `I${used.size}`), type: 'uml.Pseudostate', parent, props: { kind: 'initial' } }));
      else if (x < 0.27) here.push(clean({ id: take(pick(r, ['end', `${base}end`, 'done']), `F${used.size}`), type: 'uml.FinalState', parent }));
      else if (x < 0.4) {
        const kind = pick(r, ['fork', 'join', 'choice', 'junction', 'shallowHistory', 'deepHistory', 'terminate']);
        here.push(clean({ id: take(pick(r, [kind, 'p', 'h-1']), `P${used.size}`), type: 'uml.Pseudostate', parent, label: ['fork', 'join', 'choice'].includes(kind) ? undefined : maybe(0.2, 'shown'), props: { kind } }));
      } else {
        const id = take(pick(r, NAMES), `S${used.size}`), props = clean(Object.fromEntries(['entry', 'do', 'exit'].map(a => [a, maybe(0.2, pick(r, TEXT.filter(t => t.trim() === t)))])));
        const members = Array.from({ length: r() < 0.25 ? 1 + Math.floor(r() * 2) : 0 }, (_, j) => {
          const p = parts();
          if (!p.trigger || ['entry', 'do', 'exit'].includes(p.trigger)) p.trigger = 'tick';
          return { id: take(pick(r, [`${id}.t${j + 1}`, `${id}.tick`]), `M${used.size}`), type: 'uml.InternalTransition', props: p };
        });
        const st = clean({ id, type: 'uml.State', parent, label: pick(r, [id, ...TEXT]), props: Object.keys(props).length ? props : undefined });
        here.push(st);
        if (depth < 3 && r() < 0.3) { // a composite: its regions, or its substates directly
          const regions = r() < 0.5 ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, j) => clean({ id: take(pick(r, [`${id}.r${j + 1}`, `${id}.zone`, 'r']).replace(/\s/g, '_'), `R${used.size}`), type: 'uml.Region', label: maybe(0.5, pick(r, TEXT)) })) : [];
          members.unshift(...regions);
          if (regions.length) regions.forEach(g => { if (r() < 0.8) here.push(...scope(g.id, depth + 1)); });
          else here.push(...scope(id, depth + 1));
        }
        if (members.length) st.members = members;
      }
    }
    return here;
  };
  nodes.push(...scope(undefined, 0));
  const ends = nodes.map(n => n.id);
  for (let k = 0, n = Math.floor(r() * nodes.length * 1.5); k < n; k++) {
    const from = pick(r, ends), to = pick(r, ends), p = parts();
    edges.push(clean({ id: take(pick(r, [`${from}-${to}`, 't1', 'go', `${from}-${to}-2`]), `T${k}`), type: 'uml.Transition', from, to, props: Object.keys(p).length ? p : undefined }));
  }
  for (const s of nodes.filter(n => n.type === 'uml.State')) if (r() < 0.2) { // a description, or a note
    const desc = r() < 0.5, c = clean({ id: take(pick(r, ['note-1', 'note-2', 'c']), `C${used.size}`), type: 'uml.Comment', label: pick(r, desc ? ['This is a state description', 'x: y', 'semi;colon', ' padded ', 'two\nlines'] : TEXT), ext: desc ? { mermaid: { description: true } } : undefined });
    nodes.push(c);
    edges.push({ id: take(pick(r, [`${c.id}-link`, 'l']), `L${used.size}`), type: 'uml.CommentLink', from: c.id, to: s.id });
  }
  const title = maybe(0.6, pick(r, ['Order', 'Order: paid', "It's here"]));
  const view = clean({ id: pick(r, ['state-diagram', 'order', 'vé w']), diagram: 'uml.state-machine', title, direction: maybe(0.5, 'down'), nodeIds: nodes.map(n => n.id).sort(() => r() - 0.5) });
  return clean({ schemaVersion: 2, title, root: view.id, nodes: nodes.sort(() => r() - 0.5), edges, views: [view] });
}

test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let hints = 0, kinds = 0, warned = 0, regions = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), text = write(m), back = read(text);
    hints += text.split('-id:').length + text.split('%% id:').length - 2; kinds += text.split('%% kind:').length - 1;
    warned += text.split('%% warning:').length - 1; regions += text.split('%% region:').length - 1;
    assert.doesNotMatch(text, /%% not written/, `seed ${seed}\n${text}`);
    assert.deepEqual(back.report, [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${text}`);
  }
  assert.ok(hints > 1000 && kinds > 300 && warned > 300 && regions > 100, `${hints} hints, ${kinds} kinds, ${warned} warnings, ${regions} regions`);
});

test('a file with every construct on Mermaid\'s state page gives the pinned report (R1, R4)', () => {
  const { model, report } = read(every);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    '18 skipped: accTitle: accessibility text is not read',
    '19 skipped: accDescr: accessibility text is not read',
    '78 approximated: note left of State2: the side is not kept',
    '95 approximated: direction LR inside a composite state is not kept: the view has one direction',
    '101 skipped: classDef movement font-style:italic: styles are not read',
    '102 skipped: classDef badBadEvent fill:#f00,color:white,font-weight:bold: styles are not read',
    '103 skipped: Crash:::movement: a style class is not read',
    '104 skipped: Crash:::badBadEvent: a style class is not read',
    '105 skipped: class Still, Moving movement: styles are not read',
    '114 approximated: Placed : entry: a second entry replaces the first',
    '117 approximated: Paid --> Placed: its text is not trigger [guard] / effect: the ( it opens is not closed: it is kept as its trigger',
    '127 skipped: hide empty description: not read',
    '128 skipped: scale 350 width: not read',
    '139 approximated: %% id: s1 is taken, so s1 --> s1 is s1-s1',
    '141 approximated: %% id: has->arrow: an id holds no "->", so it is has-arrow',
    '142 skipped: a } that closes nothing',
    '143 skipped: "s1 -> s2" is not understood',
    '144 approximated: direction RL is drawn left to right',
    '145 approximated: state Open { is never closed: read to the end',
  ]);
  const v = model.views[0], node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id);
  const links = id => model.edges.filter(e => e.type === 'uml.CommentLink' && e.to === id).map(e => node(e.from));
  assert.equal(model.title, "Every construct on Mermaid's state diagram page");
  assert.equal(v.direction, undefined); // direction RL, read as LR, is the last
  // no core error (one with no rule: a dangling end, a cycle of owners, ...). The state type's UML rules (4.6) may name
  // what Mermaid's own examples do and UML does not allow (a fork into plain states, a history at the top): the reader
  // keeps what the source says, and validate() says so
  const core = m => validate(m).filter(p => p.level === 'error' && !p.rule);
  assert.deepEqual(core(model), []);
  // states: a name, a description as the label, a text after a colon as a description comment
  assert.deepEqual([node('stateId').label, node('s2').label, node('s3').label], ['stateId', 'This is a state description', 's3']);
  assert.deepEqual(links('s3'), [{ id: 'note-1', type: 'uml.Comment', label: 'This is a state description', ext: { mermaid: { description: true } } }]);
  // [*] once per scope, its ids from the scope; composites nested; a transition between two composites' substates
  assert.deepEqual(['start', 'end', 'First.start', 'First.end', 'NamedComposite.start', 'Second.start', 'Third.end'].map(id => [node(id).type, node(id).parent ?? null]), [
    ['uml.Pseudostate', null], ['uml.FinalState', null], ['uml.Pseudostate', 'First'], ['uml.FinalState', 'First'], ['uml.Pseudostate', 'NamedComposite'],
    ['uml.Pseudostate', 'Second'], ['uml.FinalState', 'Third']]);
  assert.deepEqual(['second', 'namedSimple', 'Second', 'deeper', 'Third', 'third'].map(id => node(id).parent), ['First', 'NamedComposite', 'NamedComposite', 'Second', 'Second', 'Third']);
  assert.deepEqual(edge('second-namedSimple'), { id: 'second-namedSimple', type: 'uml.Transition', from: 'second', to: 'namedSimple' });
  assert.equal(links('NamedComposite')[0].label, 'Another Composite');
  // choice, fork and join; guards are triggers' text where they are not in brackets (Mermaid's own example)
  assert.deepEqual(['if_state', 'fork_state', 'join_state'].map(id => node(id).props.kind), ['choice', 'fork', 'join']);
  assert.deepEqual(edge('if_state-False').props, { trigger: 'if n < 0' });
  // notes: a block over several lines (CRLF), the side not kept
  assert.deepEqual(links('State1').map(c => c.label), ['The state with a note', 'Important information! You can write\nnotes.']);
  assert.deepEqual(links('State2').map(c => c.label), ['This is the note to the left.']);
  // concurrency: three regions, each with its own [*]
  assert.deepEqual(node('Active').members, ['Active.r1', 'Active.r2', 'Active.r3'].map(id => ({ id, type: 'uml.Region' })));
  assert.deepEqual(['Active.r1.start', 'Active.r2.start', 'CapsLockOn', 'ScrollLockOff'].map(id => node(id).parent), ['Active.r1', 'Active.r2', 'Active.r2', 'Active.r3']);
  assert.deepEqual(edge('NumLockOff-NumLockOn').props, { trigger: 'EvNumLockPressed' });
  // a comment after a transition, a style class after a name
  assert.ok(edge('Still-Moving') && edge('Moving-Crash') && edge('Crash-end'));
  assert.equal(links('yswsii')[0].label, 'Your state with spaces in it');
  // activities, an internal transition, a second entry, a refused text kept as the trigger
  assert.deepEqual(node('Placed').props, { entry: 'reserve them again', do: 'poll the payment provider', exit: 'log the payment result' });
  assert.deepEqual(node('Placed').members, [{ id: 'Placed.t1', type: 'uml.InternalTransition', props: { trigger: 'address changed', guard: 'not shipped', effect: 'update the address' } }]);
  assert.deepEqual(edge('t-pay').props, { trigger: 'payment', guard: 'ok', effect: 'send the receipt' });
  assert.deepEqual(edge('Paid-Placed'), { id: 'Paid-Placed', type: 'uml.Transition', from: 'Paid', to: 'Placed', props: { trigger: 'refund (pending' }, ext: { mermaid: { label: 'refund (pending' } } });
  // the hints: a kind, an id, a region's id and name (with one region the hint makes it one)
  assert.deepEqual(node('hist'), { id: 'hist', type: 'uml.Pseudostate', props: { kind: 'shallowHistory' } });
  assert.deepEqual(node('s-long'), { id: 's-long', type: 'uml.State', label: 'Long name', members: [{ id: 'Long.left', type: 'uml.Region', label: 'Left side' }, { id: 's-long.r2', type: 'uml.Region' }] });
  assert.deepEqual(['l1', 'Long.left.end', 'l2'].map(id => node(id).parent), ['Long.left', 'Long.left', 's-long.r2']);
  assert.deepEqual([edge('s1-s1').from, edge('has-arrow').from], ['s1', 's2']);
  // §13's collisions: Coll's [*] are the next free after its states Coll.start and Coll.end; p-q --> r and p --> q-r
  assert.deepEqual(['Coll.start', 'Coll.end', 'Coll.start-2', 'Coll.end-2'].map(id => [node(id).type, node(id).parent]), [['uml.State', 'Coll'], ['uml.State', 'Coll'], ['uml.Pseudostate', 'Coll'], ['uml.FinalState', 'Coll']]);
  assert.deepEqual(['Coll.start-2-Coll.start', 'Coll.start-Coll.end', 'Coll.end-Coll.end-2', 'p-q-r', 'p-q-r-2'].map(id => [edge(id).from, edge(id).to]),
    [['Coll.start-2', 'Coll.start'], ['Coll.start', 'Coll.end'], ['Coll.end', 'Coll.end-2'], ['p-q', 'r'], ['p', 'q-r']]);
  assert.equal(node('o1').parent, 'Open');
});

test('the same source read twice gives the same ids (R3); an inserted transition renames only the later ones of its pair', () => {
  const ids = m => [...m.nodes.flatMap(n => [n.id, ...(n.members || []).map(x => x.id)]), ...m.edges.map(e => e.id)];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  const a = read('stateDiagram-v2\nA --> B : 1\nA --> B : 2\nC --> D\nstate X {\nA --> B : 3\n}\n').model;
  const b = read('stateDiagram-v2\nC --> D : 0\nA --> B : 1\nA --> B : 2\nC --> D\nstate X {\nA --> B : 3\n}\n').model;
  assert.deepEqual(a.edges.map(e => e.id), ['A-B', 'A-B-2', 'C-D', 'A-B-3']);
  assert.deepEqual(b.edges.map(e => e.id), ['C-D', 'A-B', 'A-B-2', 'C-D-2', 'A-B-3']);
});

test("§13's collisions: a state named start or end keeps its name; derived ids take the next free; a hint taken or holding -> is reported", () => {
  const r = read('stateDiagram-v2\n[*] --> start\nend --> [*]\nstate X {\n  [*] --> X.start\n}\n');
  assert.deepEqual(r.model.nodes.map(n => n.id), ['start', 'end', 'X', 'X.start', 'start-2', 'end-2', 'X.start-2']);
  assert.deepEqual(r.model.edges.map(e => [e.id, e.from, e.to]), [['start-2-start', 'start-2', 'start'], ['end-end-2', 'end', 'end-2'], ['X.start-2-X.start', 'X.start-2', 'X.start']]);
  assert.deepEqual(r.report, []);
  assert.deepEqual(read('stateDiagram-v2\na-b --> c\na --> b-c\n').model.edges.map(e => e.id), ['a-b-c', 'a-b-c-2']);
  const h = read('stateDiagram-v2\n%% id: b\na --> b\n%% id: x->y\nb --> a\n%% start-id: a\n[*] --> a\n');
  assert.deepEqual(h.model.edges.map(e => e.id), ['a-b', 'x-y', 'start-a']);
  assert.deepEqual(h.report.map(x => `${x.line} ${x.message}`), ['3 %% id: b is taken, so a --> b is a-b', '5 %% id: x->y: an id holds no "->", so it is x-y', '7 %% id: a is taken, so the initial state of the top is start']);
  // a state named in two composites' bodies is kept in the first; one named at the top first moves into the first body
  const two = read('stateDiagram-v2\ns --> t\nstate A {\n  s\n}\nstate B {\n  s --> u\n}\n');
  assert.deepEqual(two.model.nodes.filter(n => ['s', 't', 'u'].includes(n.id)).map(n => [n.id, n.parent ?? null]), [['s', 'A'], ['t', null], ['u', 'B']]);
  assert.deepEqual(two.report.map(x => `${x.line} ${x.message}`), ["7 s is named in A's body and in B's: it is kept in the first"]);
  // the writer names what the reader would not derive, so the round trip keeps them
  const m = { schemaVersion: 2, nodes: [{ id: 'start', type: 'uml.State', label: 'start' }, { id: 'go', type: 'uml.Pseudostate', props: { kind: 'initial' } }, { id: 'end', type: 'uml.FinalState' }],
    edges: [{ id: 'e1', type: 'uml.Transition', from: 'go', to: 'start' }, { id: 'start-end', type: 'uml.Transition', from: 'start', to: 'end' }],
    views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['start', 'go', 'end'] }] };
  const text = write(m);
  assert.match(text, / {2}start\n {2}%% start-id: go\n {2}%% id: e1\n {2}\[\*\] --> start\n {2}start --> \[\*\]\n/); // end and start-end are what the reader derives
  assert.deepEqual(canon(read(text).model), canon({ ...m, root: 'v', views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['start', 'go', 'end'] }] }));
});

test('text over the size limit is refused with a report; hostile input reads in under a second and never throws (R2) (timed)', () => {
  const big = read('stateDiagram-v2\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit/);
  const nested = 'stateDiagram-v2\n' + 'state s {\n'.repeat(100000), names = 'stateDiagram-v2\n' + Array.from({ length: 60000 }, (_, k) => `state n${k} {`).join('\n');
  const many = 'stateDiagram-v2\n' + Array.from({ length: 50000 }, (_, k) => `a${k % 300}-->b${k % 7}:[k>${k % 9}]/x`).join('\n');
  const hostile = [nested, names, many, 'stateDiagram-v2\n' + '}\n'.repeat(400000), 'stateDiagram-v2\n' + 'state A {\n--\n'.repeat(80000),
    'stateDiagram-v2\nnote right of a\n' + 'x\n'.repeat(400000), 'stateDiagram-v2\na : ' + '('.repeat(4000) + '\nb --> c : ' + '[a'.repeat(400000),
    'stateDiagram-v2\nstate A {\n' + '--\n'.repeat(340000), 'stateDiagram-v2\n' + 'a : e / x\n'.repeat(100000), 'stateDiagram-v2\nstate A {\n' + '[*]-->a\n--\n'.repeat(90000),
    'stateDiagram-v2\n' + Array.from({ length: 30000 }, (_, k) => `state b${k} {\n  b${k + 1}\n}`).join('\n'), 'stateDiagram-v2\nconstructor --> __proto__\n__proto__ : entry / x\nstate hasOwnProperty {\n toString\n}\n'];
  // in this process's CPU time, and a slow run tried twice more, its best kept: node --test runs the suites side by side,
  // and a cold or busy CI runner is several times slower than the work (the writer is linear: 90k regions in about 0.3 s)
  const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
  const best = f => { let [out, ms] = cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, cpu(f)[1]); return [out, ms]; };
  for (const h of hostile) {
    assert.ok(h.length <= 1 << 20, `${h.length}`);
    const [r, readMs] = best(() => read(h));
    assert.ok(readMs < 1000, `${h.slice(16, 40)}: read ${readMs} ms`);
    const writeMs = best(() => write(r.model))[1];
    // §13 bounds the read; the write is held to 3 s, linear in the input (about 0.3 s idle, four times that on a CI runner),
    // which a quadratic writer would pass by a hundredfold
    assert.ok(writeMs < 3000, `${h.slice(16, 40)}: write ${writeMs} ms`);
  }
  const deep = read(names), at = id => deep.model.nodes.find(n => n.id === id);
  assert.deepEqual(deep.report.filter(x => !/never closed/.test(x.message)).map(x => `${x.line} ${x.message}`), ['66 state n64 is nested over 64 deep: what it holds is read flat from there']);
  assert.equal(deep.report.length, 65); // and the 64 composites never closed
  assert.deepEqual(['n63', 'n64', 'n59999'].map(id => at(id).parent), ['n62', 'n63', 'n63']);
  assert.equal(read(many).model.edges.length, 50000);
  const unicorn = read(hostile.at(-1)).model;
  assert.deepEqual(unicorn.nodes.map(n => [n.id, n.parent ?? null]), [['constructor', null], ['__proto__', null], ['hasOwnProperty', null], ['toString', 'hasOwnProperty']]);
  assert.deepEqual(unicorn.nodes[1].props, { entry: 'x' });
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart LR\nA-->B', '---\ntitle: x\n', 'stateDiagram-v2\nstate X {\nA --> B', 'stateDiagram\nstate\nstate "x"\nstate "x" as\nnote\nnote left of\n--\n}\n%% region: r\n[*]\n[*] : x\n --> \nA -->\n--> B\n:::\nA : \n%% kind: nope\nstate k\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('flowchart LR\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid stateDiagram: nothing read' }]);
  // only a state holds activities, internal transitions and a body; [*] is no state's name; the view's id holds no ->
  const odd = read('stateDiagram-v2\n%% kind: final\nstate F {\n a\n}\nstate K <<fork>>\nK : entry / x\nK : ev / y\n%% kind: initial\ni\ni : do / z\n');
  assert.deepEqual(odd.report.map(x => `${x.line} ${x.message}`), ['3 state F {: F is a final state, which holds nothing: what its body holds is read into the scope around it',
    '7 K : entry: K is a fork pseudostate, which has no activity: not read', '8 K : ev / y: K is a fork pseudostate, which has no internal transition: not read',
    '11 i : do: i is an initial pseudostate, which has no activity: not read']);
  assert.deepEqual(odd.model.nodes.map(n => [n.id, n.parent ?? null, n.props ?? null, n.members ?? null]), [['F', null, null, null], ['a', null, null, null], ['K', null, { kind: 'fork' }, null], ['i', null, { kind: 'initial' }, null]]);
  assert.deepEqual(validate(odd.model).filter(p => p.level === 'error' && !p.rule), []); // no core error (above)
  assert.deepEqual(read('stateDiagram-v2\nstate [*]\nnote right of [*] : x\n').report.map(x => x.message), ['state [*] is not understood', 'note right of [*] : x: names no state']);
  const arrow = read('%% id: a->b\nstateDiagram-v2\n');
  assert.deepEqual([arrow.model.views[0].id, arrow.report.map(x => `${x.line} ${x.message}`)], ['a-b', ['2 %% id: a->b: an id holds no "->", so the view is a-b']]);
  assert.deepEqual(read('stateDiagram-v2\nnote right of a\nnever ended').report, [{ line: 2, status: 'approximated', message: 'a note with no end note: read to the end' }]);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', ';', '#', ':', '\n', '-->', '[*]', '--', '%%', ' as ', 'end note\n', 'state ', '<<fork>>', ':::', '<br>', '[', '/', '(', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(validate(out.model).filter(p => p.level === 'error' && !p.rule), [], chars.join('')); // no core error (above)
    write(out.model);
  }
});

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  // a title that is not text is written as text; a region's empty label is reported
  const v = { id: 'v', diagram: 'uml.state-machine', nodeIds: [] };
  assert.match(write({ schemaVersion: 2, title: 12, nodes: [], edges: [], views: [v] }), /^---\ntitle: 12\n---\n/);
  const r2 = write({ schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.State', label: 'A', members: [{ id: 'A.r1', type: 'uml.Region', label: '' }, { id: 'A.r2', type: 'uml.Region' }] }], edges: [], views: [{ ...v, nodeIds: ['A'] }] });
  assert.match(r2, /%% not written: A\.r1: an empty label\n/);
  const S = (id, more) => ({ id, type: 'uml.State', label: id, ...more });
  const m = { schemaVersion: 2, nodes: [S('a', { props: { entry: ' padded ', stereotypes: ['x'] } }), S('b', { parent: 'nowhere' }), { id: 'k', type: 'uml.Class', label: 'K' },
    { id: 'f', type: 'uml.Pseudostate', label: 'F', props: { kind: 'fork' } }, { id: 'q', type: 'uml.Pseudostate', props: { kind: 'entryPoint' } },
    { id: 'c1', type: 'uml.Comment', label: 'go / now', ext: { mermaid: { description: true } } }, { id: 'c2', type: 'uml.Comment', label: 'loose' },
    S('i', { members: [{ id: 'i.1', type: 'uml.InternalTransition', props: { guard: 'g' } }, { id: 'i.2', type: 'uml.Operation' }] }), S('n', { label: undefined })],
  edges: [{ id: 't', type: 'uml.Transition', from: 'a', to: 'b', props: { trigger: 'x[', weight: 2 } }, { id: 'u', type: 'uml.Transition', from: 'a', to: 'k' },
    { id: 'l1', type: 'uml.CommentLink', from: 'c1', to: 'a' }, { id: 'd', type: 'uml.Dependency', from: 'a', to: 'b' }],
  views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['a', 'b', 'k', 'f', 'q', 'c1', 'c2', 'i', 'n'] }] };
  const text = write(m, 'v');
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: k (uml.Class)', '%% not written: q (uml.Pseudostate)', '%% not written: b: parent nowhere, not a state in the view: written at the top',
    '%% not written: u (uml.Transition)', '%% not written: d (uml.Dependency)', '%% not written: c2 (uml.Comment)',
    '%% not written: a: entry  padded', '%% not written: a: property stereotypes', '%% not written: c1: its text reads as an activity or a transition, so it is written as a note',
    '%% not written: f: label F', '%% not written: i.1 (uml.InternalTransition)', '%% not written: i.2 (uml.Operation)', '%% not written: n: no label, read as its name',
    '%% not written: t: its label, which does not read back as trigger [guard] / effect', '%% not written: t: property weight']);
  const back = read(text);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.nodes.map(n => n.id).sort(), ['a', 'b', 'c1', 'f', 'i', 'n']);
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const classes = json('../examples/sales-classes.json');
  assert.equal(write(classes), '%% not written: the model, which has no uml.state-machine view\n');
  assert.match(write(classes, classes.views[0].id), /^%% not written: view .*, not a uml\.state-machine one\n$/);
});

test('an initial or final state that cannot be its scope\'s [*] is written under %% kind:, and a second final state too', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'X', type: 'uml.State', label: 'X' }, { id: 'a', type: 'uml.State', label: 'a', parent: 'X' }, { id: 'top', type: 'uml.State', label: 'top' },
    { id: 'i', type: 'uml.Pseudostate', parent: 'X', props: { kind: 'initial' } }, { id: 'e1', type: 'uml.FinalState' }, { id: 'e2', type: 'uml.FinalState' }, { id: 'lone', type: 'uml.FinalState', label: 'Done' }],
  edges: [{ id: 'x', type: 'uml.Transition', from: 'i', to: 'top' }, { id: 'y', type: 'uml.Transition', from: 'top', to: 'e1' }, { id: 'z', type: 'uml.Transition', from: 'a', to: 'e2' }],
  views: [{ id: 'state-diagram', diagram: 'uml.state-machine', nodeIds: ['X', 'a', 'top', 'i', 'e1', 'e2', 'lone'] }] };
  const text = write(m);
  assert.match(text, / {4}%% kind: initial\n {4}state "●" as i\n/); // its line goes out of X: [*] there would move top into X
  assert.match(text, / {2}%% kind: final\n {2}state "◉" as e2\n/);
  assert.match(text, / {2}%% kind: final\n {2}state "Done" as lone\n/);
  assert.match(text, / {2}%% end-id: e1\n {2}%% id: y\n {2}top --> \[\*\]\n/);
  assert.deepEqual(read(text).report, []);
  assert.deepEqual(canon(read(text).model), canon({ ...m, root: 'state-diagram' }));
});
