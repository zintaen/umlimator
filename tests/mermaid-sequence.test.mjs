// The Mermaid sequenceDiagram reader and writer (notes/stage-3.md §8, 3.6): read(write(model)) equals the model on the
// subset, ids included, for example 11 and 500 generated models; the file with every construct on Mermaid's sequence page
// gives the pinned report (risks.md R1, R4); same source, same ids (R3); a size limit, and malformed input reported,
// never thrown (R2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readMermaidSequence as read, writeMermaidSequence as write } from '../src/readers/mermaid-sequence.js';
import { validate } from '../lib/umlimator-all.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const every = readFileSync(new URL('import/sequence.mmd', import.meta.url), 'utf8');

// the model as one sequence view shows it, which is what Mermaid's text carries: its lifelines, and of the view its id,
// title, lifelines, occurrences and fragments (not its layout, nor a parent)
function project(m, viewId) {
  const v = m.views.find(x => x.id === viewId), ids = new Set(v.nodeIds), title = v.title ?? m.title;
  return { schemaVersion: 2, ...(title ? { title } : {}), root: v.id, nodes: m.nodes.filter(n => ids.has(n.id)), edges: [],
    views: [{ id: v.id, diagram: 'uml.sequence', ...(title ? { title } : {}), nodeIds: v.nodeIds, edges: v.edges, ...(v.fragments?.length ? { fragments: v.fragments } : {}) }] };
}
// order is meaning for lifelines and occurrences (model.md §1 rule 8), not for the model's nodes or the view's fragments
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), views: m.views.map(v => (v.fragments ? { ...v, fragments: [...v.fragments].sort(byId) } : v)) });

test('read(write(model)) is example 11, ids included, and nothing is reported', () => {
  const m = json('../examples/checkout-sequence.json'), text = write(m), back = read(text);
  assert.deepEqual(back.report, [], text);
  assert.deepEqual(canon(back.model), canon(project(m, 'checkout')), text);
  // the writer's text is Mermaid's: the main bars by + and -, the use as a note, the created lifeline where it is created
  assert.match(text, /api->>\+payments: charge\(total\)\n/);
  assert.match(text, /payments-->>-api: declined\n/);
  assert.match(text, / {4}%% use: f3\n {4}Note over api,receipt: ref Send receipt email\n/);
  assert.match(text, / {4}%% represents: Receipt\n {4}create participant receipt as receipt : Receipt\n/);
});

// a seeded generator of models in the subset (proposal.md §8.2)
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OPS = ['alt', 'opt', 'loop', 'par', 'break'];
function generate(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], maybe = (p, x) => (r() < p ? x : undefined), used = new Set();
  const take = (base, other) => { const id = base && !used.has(base) && r() < 0.8 ? base : other; used.add(id); return id; };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  const NAMES = ['api', 'payments', 'Two words!', 'end', 'x-ray', 'card-payment', 'Ünit', 'loop', 'a_b', 'alt-1', 'shop.web', 'L_end', 'Note'];
  const lifeline = k => {
    const id = take(pick(NAMES), `L${k}`), props = clean({ represents: maybe(0.4, pick(['ShopApi', 'pkg::Type', 'A : B', ' T '])), stereotypes: maybe(0.2, ['actor']) });
    return clean({ id, type: 'uml.Lifeline', label: pick([id, id, 'Label with spaces', 'colon: inside', 'Quotes "and" <angles>', 'two\nlines', 'semi;colon #1', ' padded ', ' ']), props: Object.keys(props).length ? props : undefined });
  };
  const upfront = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, k) => lifeline(k)), pool = Array.from({ length: Math.floor(r() * 3) }, (_, k) => lifeline(10 + k));
  const all = [...upfront, ...pool], alive = upfront.map(n => n.id), created = [], frags = [], edges = [], open = new Map();
  const GUARDS = ['payment accepted', 'x > 1; y #2', 'two\nlines', 'end', ' g '];
  const gen = (parent, depth) => {
    for (let k = 0, n = Math.floor(r() * (depth ? 6 : 14)); k < n; k++) {
      const x = r();
      if (x < 0.15 && depth < 3) { // a fragment, its operands each with their own content (or none)
        const op = pick(OPS), fid = take(pick([`${op}-1`, 'f1', 'frag']), `F${frags.length}`);
        const members = Array.from({ length: op === 'alt' || op === 'par' ? 1 + Math.floor(r() * 3) : 1 }, (_, j) => clean({ id: take(pick([`${fid}.${j + 1}`, `${fid}-op`]), `O${frags.length}-${j}`),
          type: 'uml.InteractionOperand', label: j > 0 && op === 'alt' ? pick(['else', ...GUARDS]) : maybe(0.7, pick(GUARDS)) }));
        frags.push(clean({ id: fid, type: 'uml.CombinedFragment', parent, props: { operator: op }, members }));
        for (const o of members) gen(o.id, depth + 1);
      } else if (x < 0.22) { // an interaction use over lifelines next to each other
        const lo = Math.floor(r() * upfront.length), hi = lo + Math.floor(r() * (upfront.length - lo));
        edges.push(clean({ id: take(pick(['use', 'f3']), `U${edges.length}`), type: 'uml.InteractionUse', label: maybe(0.8, pick(['Send receipt email', 'two\nlines'])), parent,
          props: clean({ covers: upfront.slice(lo, hi + 1).map(n => n.id), refersTo: maybe(0.4, pick(['receipt-flow', 'other'])) }) }));
      } else {
        let sort = pick(['call', 'call', 'async', 'reply', 'reply', 'create', 'delete']), from = pick(alive), to = pick(alive), replyTo;
        if (sort === 'create') { if (pool.length) { to = pool.shift().id; alive.push(to); created.push(to); } else sort = 'call'; }
        if (sort === 'delete') { const others = alive.filter(a => a !== from); if (others.length) { to = pick(others); alive.splice(alive.indexOf(to), 1); } else sort = 'call'; }
        const id = take(`${from}-${to}`, `m${edges.length}`), key = `${from}\0${to}`, back = `${to}\0${from}`;
        // a reply answers the latest call back that has none yet; sometimes another one, which the writer names in %% reply-to:
        if (sort === 'reply') { if (open.get(back)?.length) replyTo = r() < 0.85 ? open.get(back).pop() : pick(open.get(back)); else sort = 'call'; }
        if (sort === 'call') { if (!open.has(key)) open.set(key, []); open.get(key).push(id); }
        edges.push(clean({ id, type: 'uml.Message', from, to, label: maybe(0.9, pick(['place(order)', 'ok', 'a; b #1 <br> c\\n', 'two\nlines', 'x: y', 'end', '  padded  '])), parent,
          props: clean({ sort, replyTo }) }));
      }
    }
  };
  gen(undefined, 0);
  const title = maybe(0.6, pick(['Checkout', 'Checkout: paid', "It's here"]));
  const nodeIds = [...upfront.map(n => n.id), ...pool.map(n => n.id), ...created]; // Mermaid places a created lifeline after the others
  const view = clean({ id: pick(['sequence-diagram', 'checkout', 'vé w']), diagram: 'uml.sequence', title, nodeIds, edges, fragments: frags.length ? frags : undefined });
  return clean({ schemaVersion: 2, title, root: view.id, nodes: all.sort(() => r() - 0.5), edges: [], views: [view] });
}

test('read(write(model)) equals the model, for 500 generated models in the subset', () => {
  let hints = 0, replyTo = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generate(seed), text = write(m), back = read(text);
    hints += text.split('%% id:').length - 1; replyTo += text.split('%% reply-to:').length - 1;
    assert.doesNotMatch(text, /%% not written/, `seed ${seed}\n${text}`);
    assert.deepEqual(back.report, [], `seed ${seed}\n${text}`);
    assert.deepEqual(canon(back.model), canon(project(m, m.root)), `seed ${seed}\n${text}`);
  }
  assert.ok(hints > 500, `${hints} ids are written as hints`);
  assert.ok(replyTo > 10, `${replyTo} replies' calls are written as hints`);
});

test('a file with every construct on Mermaid\'s sequence page gives the pinned report (R1, R4)', () => {
  const { model, report } = read(every);
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), [
    "3 skipped: front matter config: Mermaid's configuration is not read",
    '9 skipped: accTitle: accessibility text is not read',
    '10 skipped: accDescr: accessibility text is not read',
    '13 skipped: autonumber: message numbers are not drawn in a sequence view',
    "17 approximated: Boundary's type boundary is read as a stereotype, shown as text",
    "20 approximated: API's type boundary is read as a stereotype, shown as text",
    "21 approximated: Auth's type control is read as a stereotype, shown as text",
    '24 skipped: box Purple Alice & John: a group of participants is not read; the participants are',
    '29 approximated: Alice->J: read as a call; it has no arrowhead, and is drawn with one',
    '30 approximated: J-->Alice: read as a reply; it has no arrowhead, and is drawn with one',
    '33 approximated: Alice<<->>J: read as a call; its arrowhead at the sender is not drawn',
    '34 approximated: Alice<<-->>J: read as a reply; its arrowhead at the sender is not drawn',
    '34 approximated: Alice<<-->>J: a reply with no call from J to Alice before it answers none',
    '35 approximated: Alice-xJ: read as an async; its cross is not drawn',
    '36 approximated: Alice--xJ: read as an async; its dotted line and its cross are not drawn',
    '38 approximated: Alice--)J: read as an async; its dotted line is drawn solid',
    '39 skipped: "Alice-|\\J: A half arrow" is not understood: a half arrow is not in the subset',
    '41 approximated: Alice->>J: the central connection is not drawn',
    '49 approximated: Alice-)J: its + is not read: activations are derived, and an async opens none',
    '57 skipped: destroy Bob: the next message is from it, so its stem is not ended',
    '60 skipped: a note is not read (notes are not in the subset)',
    '61 skipped: a note is not read (notes are not in the subset)',
    '69 approximated: J-->Alice: read as a reply; it has no arrowhead, and is drawn with one',
    '93 approximated: critical Establish a connection to the DB: its content is read, with no frame (critical is not in the subset)',
    '94 approximated: Alice-->Auth: read as a reply; it has no arrowhead, and is drawn with one',
    '94 approximated: Alice-->Auth: a reply with no call from Auth to Alice before it answers none',
    "95 approximated: option Network timeout: read as the critical region's content, with no frame",
    '96 approximated: Auth-->Auth: read as a reply; it has no arrowhead, and is drawn with one',
    '96 approximated: Auth-->Auth: a reply with no call from Auth to Auth before it answers none',
    '99 approximated: API-->Alice: read as a reply; it has no arrowhead, and is drawn with one',
    '99 approximated: API-->Alice: a reply with no call from Alice to API before it answers none',
    '101 skipped: rect rgb(191, 223, 255): a background colour is not read; its content is',
    '108 skipped: link: actor menus are not read',
    '109 skipped: links: actor menus are not read',
    '110 skipped: else outside an alt: not read',
    '111 skipped: an end that closes nothing',
  ]);
  const v = model.views[0], node = id => model.nodes.find(n => n.id === id), msg = label => v.edges.find(e => e.label === label);
  assert.equal(model.title, "Every construct on Mermaid's sequence diagram page");
  assert.deepEqual(validate(model).filter(p => p.level === 'error'), []);
  // participants: actors, types, aliases both ways, name : Type, the order they come in
  assert.deepEqual(v.nodeIds, ['Alice', 'Bob', 'Boundary', 'J', 'API', 'Auth', 'api', 'Carol', 'Dave', 'Carl', 'D']);
  assert.deepEqual([node('Bob').props, node('J').label, node('API').label, node('Auth').label, node('D').label, node('D').props],
    [{ stereotypes: ['actor'] }, 'John', 'Public API', 'Auth Service', 'Donald', { stereotypes: ['actor'] }]);
  assert.deepEqual(node('api'), { id: 'api', type: 'uml.Lifeline', label: 'api : ShopApi' }); // the alias as Mermaid shows it: no %% represents: above it
  // arrows, replies and their calls, create and destroy
  assert.deepEqual(['Solid line with arrowhead', 'Dotted line with arrowhead', 'Solid, open arrow', 'Hi Carl!', 'We are too many', 'I agree'].map(l => [msg(l).id, msg(l).props]), [
    ['Alice-J-2', { sort: 'call' }], ['J-Alice-2', { sort: 'reply', replyTo: 'Alice-J-2' }], ['Alice-J-7', { sort: 'async' }],
    ['Alice-Carl', { sort: 'create' }], ['Alice-Carl-2', { sort: 'delete' }], ['Bob-Alice', { sort: 'call' }]]);
  assert.deepEqual(msg('Hi!'), { id: 'Carl-D', type: 'uml.Message', from: 'Carl', to: 'D', label: 'Hi!', props: { sort: 'create' } });
  // text: a line break, entity codes, a semicolon that ends a statement
  assert.deepEqual([msg('Hello John,\nhow are you?').id, msg('I \u2665 you #1; truly').id, msg('one').to, msg('two').from], ['Alice-J-13', 'Alice-J-14', 'Dave', 'Dave']);
  // the use the writer marks: its covers run from its first lifeline to its last
  assert.deepEqual(v.edges.find(e => e.id === 'welcome'), { id: 'welcome', type: 'uml.InteractionUse', label: 'Say hello', props: { covers: ['Alice', 'Bob', 'Boundary', 'J'], refersTo: 'greeting' } });
  // fragments: alt with a bare else, opt, loop, par nested, break; critical and rect read as their content
  assert.deepEqual(v.fragments.map(f => [f.id, f.parent ?? null, f.members.map(o => `${o.id}=${o.label}`).join(' | ')]), [
    ['loop-1', null, 'loop-1.1=Every minute'], ['alt-1', null, 'alt-1.1=is sick | alt-1.2=is well | alt-1.3=else'], ['opt-1', null, 'opt-1.1=Extra response'],
    ['par-1', null, 'par-1.1=Alice to Bob | par-1.2=Alice to John'], ['par-2', 'par-1.2', 'par-2.1=John to Charlie | par-2.2=John to Diana'],
    ['break-1', null, 'break-1.1=when the booking process fails']]);
  assert.deepEqual(['Unsure', 'Can you help us today?', 'connect', 'show failure', 'Rect'].map(l => msg(l).parent ?? null), ['alt-1.3', 'par-2.2', null, 'break-1.1', null]);
  assert.deepEqual(msg('Done').props, { sort: 'reply', replyTo: 'Alice-API' });
});

test('the same source read twice gives the same ids (R3); an inserted message renames only the later ones of its pair', () => {
  const ids = m => [...m.nodes.map(n => n.id), ...m.views[0].edges.map(e => e.id), ...(m.views[0].fragments || []).flatMap(f => [f.id, ...f.members.map(o => o.id)])];
  assert.deepEqual(ids(read(every).model), ids(read(every).model));
  assert.equal(new Set(ids(read(every).model)).size, ids(read(every).model).length);
  const a = read('sequenceDiagram\nA->>B: 1\nA->>B: 2\nC->>D: 3\nalt x\nA->>B: 4\nend\n').model, b = read('sequenceDiagram\nC->>D: 0\nA->>B: 1\nA->>B: 2\nC->>D: 3\nalt x\nA->>B: 4\nend\n').model;
  assert.deepEqual(a.views[0].edges.map(e => e.id), ['A-B', 'A-B-2', 'C-D', 'A-B-3']);
  assert.deepEqual(b.views[0].edges.map(e => e.id), ['C-D', 'A-B', 'A-B-2', 'C-D-2', 'A-B-3']);
  assert.deepEqual(b.views[0].fragments.map(f => [f.id, f.members[0].id]), [['alt-1', 'alt-1.1']]);
});

test('a reply answers the latest unanswered call back; one answered only in another operand of an alt is unanswered', () => {
  const r = read(['sequenceDiagram', 'A->>B: c1', 'A->>B: c2', 'B-->>A: r2', 'alt ok', 'B-->>A: r1a', 'else', 'B-->>A: r1b', 'end', 'B-->>A: none', 'B-->>C: stray'].join('\n'));
  assert.deepEqual(r.model.views[0].edges.map(e => [e.label, e.props.replyTo ?? null]), [['c1', null], ['c2', null], ['r2', 'A-B-2'], ['r1a', 'A-B'], ['r1b', 'A-B'], ['none', null], ['stray', null]]);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.message}`), ['10 B-->>A: a reply with no call from A to B before it answers none', '11 B-->>C: a reply with no call from C to B before it answers none']);
});

test('+, -, activate and deactivate are reported only where they disagree with the derived bars', () => {
  const r = read(['sequenceDiagram', 'A->>+B: call', 'B-->>-A: reply', 'A->>B: again', 'activate B', 'B-->>A: back', 'deactivate B', 'A-)+B: async', 'activate C', 'A->>B: x', 'B->>-A: solid return'].join('\n'));
  assert.deepEqual(r.report.map(x => `${x.line} ${x.message}`), [
    '8 A-)B: its + is not read: activations are derived, and an async opens none', '9 activate C: activations are derived from the messages, so it is not read',
    '11 B->>A: its - is not read: activations are derived, and a bar ends at the last reply to its call']);
});

test('participants: an alias name : Type under %% represents:, a colon in a plain alias, an encoded colon kept in the label, an actor created; a title statement; a %% id: above anything', () => {
  const r = read(['sequenceDiagram', 'title: Paying', '%% id: the-api', '%% represents: Shop<br>Api', 'participant api as api : Shop<br>Api', 'participant w as a#58; b', 'participant s as Service: v2', '%% id: m1',
    'api->>w: go', 'create actor x as X', 'w->>x: make', '%% id: f', '%% operand-id: f-yes', 'alt yes', '%% id: f-no', 'else no', 'end'].join('\n'));
  const v = r.model.views[0];
  assert.deepEqual(r.report, []);
  assert.equal(r.model.title, 'Paying');
  assert.deepEqual(r.model.nodes, [{ id: 'the-api', type: 'uml.Lifeline', label: 'api', props: { represents: 'Shop\nApi' } }, { id: 'w', type: 'uml.Lifeline', label: 'a: b' },
    { id: 's', type: 'uml.Lifeline', label: 'Service: v2' }, { id: 'x', type: 'uml.Lifeline', label: 'X', props: { stereotypes: ['actor'] } }]);
  assert.deepEqual(v.edges.map(e => [e.id, e.from, e.to, e.props.sort]), [['m1', 'the-api', 'w', 'call'], ['w-x', 'w', 'x', 'create']]);
  assert.deepEqual(v.fragments, [{ id: 'f', type: 'uml.CombinedFragment', props: { operator: 'alt' }, members: [{ id: 'f-yes', type: 'uml.InteractionOperand', label: 'yes' }, { id: 'f-no', type: 'uml.InteractionOperand', label: 'no' }] }]);
});

test('text over the size limit is refused with a report; a large file under it reads in linear time (R2) (timed)', () => {
  const big = read('sequenceDiagram\n' + 'x'.repeat(1 << 20));
  assert.deepEqual([big.model.nodes, big.report.map(x => x.status)], [[], ['skipped']]);
  assert.match(big.report[0].message, /over the limit/);
  const t0 = performance.now(), r = read('sequenceDiagram\n' + Array.from({ length: 25000 }, (_, k) => `A${k % 50}->>+B${k % 7}: call ${k}\nB${k % 7}-->>-A${k % 50}: done`).join('\n'));
  assert.equal(r.model.views[0].edges.length, 50000);
  assert.ok(performance.now() - t0 < 5000, `${performance.now() - t0} ms`);
  assert.deepEqual(r.report, []);
  // hostile shapes: calls answered only inside an alt, a deep nest, a long list of names, statements split by ;
  const hostile = ['sequenceDiagram\n' + 'A->>B: c\n'.repeat(30000) + 'alt x\n' + 'B-->>A: r\n'.repeat(30000) + 'end\n',
    'sequenceDiagram\n' + 'alt x\nrect y\n'.repeat(20000) + 'A->>B: deep\n'.repeat(20000),
    'sequenceDiagram\n%% use: u\nNote over ' + Array.from({ length: 100000 }, (_, k) => `P${k}`).join(',') + ': ref x\n',
    'sequenceDiagram\n' + 'A->>B: x;'.repeat(60000)];
  for (const h of hostile) { const t = performance.now(); read(h); assert.ok(performance.now() - t < 5000, `${h.slice(16, 40)}: ${performance.now() - t} ms`); }
  // a reply that walks past many answered calls under one open call; an alt or a par with many operands (review of 3.6)
  const past = 'sequenceDiagram\n' + 'A->>B\n'.repeat(80000) + 'A->>B\nopt\nB-->>A\nend\n' + 'B-->>A\n'.repeat(80000);
  for (const h of [past, 'sequenceDiagram\npar\n' + 'and\n'.repeat(260000) + 'end\n', 'sequenceDiagram\nalt\n' + 'else\n'.repeat(209000) + 'end\n']) {
    assert.ok(h.length < 1 << 20);
    const t = performance.now(), back = read(h).model, t2 = performance.now();
    write(back);
    assert.ok(t2 - t < 2000 && performance.now() - t2 < 2000, `${h.slice(16, 40)}: read ${t2 - t} ms, write ${performance.now() - t2} ms`);
  }
  // the writer on models small text gives: a deep nest, a use over many lifelines
  for (const h of ['sequenceDiagram\n' + 'alt x\n'.repeat(5000) + 'A->>B: deep\n'.repeat(5000), 'sequenceDiagram\n%% use: u\nNote over ' + Array.from({ length: 30000 }, (_, k) => `P${k}`).join(',') + ': ref x\n']) {
    const back = read(h).model, t = performance.now();
    write(back);
    assert.ok(performance.now() - t < 1000, `${h.slice(16, 40)}: write ${performance.now() - t} ms`);
  }
  const many = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Lifeline', label: 'A' }, { id: 'B', type: 'uml.Lifeline', label: 'B' }],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['A', 'B'], edges: Array.from({ length: 20000 }, (_, k) => ({ id: `e${k}`, type: 'uml.Message', from: 'A', to: 'B', props: { sort: 'call' } })) }] };
  const t3 = performance.now(), wrote = write(many);
  assert.ok(performance.now() - t3 < 3000, `${performance.now() - t3} ms`);
  assert.equal(read(wrote).model.views[0].edges.at(-1).id, 'e19999');
});

test('malformed input is reported, never thrown', () => {
  for (const x of [null, 42, {}, '', 'flowchart LR\nA-->B', '---\ntitle: x\n', 'sequenceDiagram\nalt x\nA->>B', 'sequenceDiagram\nparticipant\nactor\ncreate\ndestroy\nNote\n%% use:\nNote over : x\nend\nelse\nand\noption\n->>B\nA->>\n:::\nA-->>B\ncreate participant A\nB->>A: x\n']) {
    const r = read(x);
    assert.ok(Array.isArray(r.report) && r.model.schemaVersion === 2, String(x));
  }
  assert.deepEqual(read('flowchart LR\nA-->B').report, [{ line: 1, status: 'skipped', message: 'not a Mermaid sequenceDiagram: nothing read' }]);
  assert.deepEqual(read('sequenceDiagram\nalt x\nA->>B: y').report, [{ line: 2, status: 'approximated', message: 'alt is never closed: read to the end' }]);
  assert.deepEqual(read('sequenceDiagram\ncreate participant B\nB->>A: x\ndestroy C\n').report.map(x => `${x.line} ${x.message}`),
    ['2 create B: the next message is from it, so nothing creates it', '4 destroy C: no message to it follows']);
  // every prefix of the every-construct file, and the file with characters broken at random
  const r = rng(7);
  for (let k = 0; k < every.length; k += 7) read(every.slice(0, k));
  for (let k = 0; k < 300; k++) {
    const chars = [...every];
    for (let j = 0; j < 20; j++) chars[Math.floor(r() * chars.length)] = pick(r, ['{', '}', '"', ';', '#', ':', '\n', '->>', '-->>', '+', '-', '()', '%%', ' as ', 'end\n', 'else', '@{', '<br>', '']);
    const out = read(chars.join(''));
    assert.ok(Array.isArray(out.report));
    assert.deepEqual(validate(out.model).filter(p => p.level === 'error'), [], chars.join(''));
  }
});
function pick(r, a) { return a[Math.floor(r() * a.length)]; }

test('the writer names in comments what it cannot write, and the reader passes over them', () => {
  const L = (id, more) => ({ id, type: 'uml.Lifeline', label: id, ...more });
  const m = { schemaVersion: 2, nodes: [L('a', { props: { stereotypes: ['actor', 'boundary'] } }), L('b'), L('c'), { id: 'k', type: 'uml.Class', label: 'K' }],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['a', 'c', 'b', 'k'], edges: [
      { id: 'm1', type: 'uml.Message', from: 'a', to: 'b', props: { sort: 'shout' } },
      { id: 'm2', type: 'uml.Message', from: 'a', to: 'b', props: { sort: 'create' } },
      { id: 'm3', type: 'uml.Message', from: 'a', to: 'c', props: { sort: 'create' } },
      { id: 'm4', type: 'uml.Message', from: 'b', to: 'a', props: { sort: 'reply', replyTo: 'm1' } },
      { id: 'u', type: 'uml.InteractionUse', label: 'U', props: { covers: ['a', 'c'] } },
      { id: 'x', type: 'uml.Message', from: 'a', to: 'k', props: { sort: 'call' } }],
    fragments: [{ id: 'f', type: 'uml.CombinedFragment', props: { operator: 'critical' }, members: [{ id: 'f.1', type: 'uml.InteractionOperand' }] },
      { id: 'g', type: 'uml.CombinedFragment', props: { operator: 'alt' }, members: [{ id: 'g.1', type: 'uml.InteractionOperand' }, { id: 'g.2', type: 'uml.InteractionOperand' }] }] }] };
  const text = write(m, 'v');
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), [
    '%% not written: k (uml.Class)', '%% not written: x (uml.Message)', '%% not written: f (uml.CombinedFragment)', '%% not written: f.1 (uml.InteractionOperand)',
    '%% not written: m1: sort shout, written as a call', '%% not written: m2: sort create: the lifeline is in the diagram before it, written as a call',
    '%% not written: v: the order of its lifelines: Mermaid places a lifeline a message creates after the others',
    '%% not written: a: stereotype boundary', '%% not written: u: covers a, c, which are not lifelines next to each other in order', '%% not written: g.2: no guard, read as else']);
  assert.match(text, /%% reply-to: m1\n {2}b-->>-a:\n/);
  const back = read(text);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.views[0].nodeIds, ['a', 'b', 'c']);
  assert.deepEqual(back.model.views[0].edges.map(e => [e.id, e.props.sort, e.props.replyTo ?? e.props.covers ?? null]),
    [['m1', 'call', null], ['m2', 'call', null], ['m3', 'create', null], ['m4', 'reply', 'm1'], ['u', undefined, ['a', 'b', 'c']]]);
  assert.equal(write(m, 'nope'), '%% not written: view nope, which the model does not have\n');
  const classes = json('../examples/sales-classes.json');
  assert.equal(write(classes), '%% not written: the model, which has no uml.sequence view\n');
  assert.match(write(classes, classes.views[0].id), /^%% not written: view .*, not a uml\.sequence one\n$/);
});

test('a reply written outside its broken fragment keeps its call, through %% reply-to: (review of 3.6)', () => {
  const M = (id, from, to, sort, more) => ({ id, type: 'uml.Message', from, to, ...more, props: { sort, ...more?.props } });
  const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Lifeline', label: 'A' }, { id: 'B', type: 'uml.Lifeline', label: 'B' }],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['A', 'B'], edges: [M('c1', 'A', 'B', 'call'), M('c2', 'A', 'B', 'call'),
      M('r1', 'B', 'A', 'reply', { parent: 'g.1', props: { replyTo: 'c2' } }), M('t', 'A', 'B', 'async'), M('r2', 'B', 'A', 'reply', { parent: 'g.2', props: { replyTo: 'c2' } })],
    fragments: [{ id: 'g', type: 'uml.CombinedFragment', props: { operator: 'alt' }, members: [{ id: 'g.1', type: 'uml.InteractionOperand', label: 'a' }, { id: 'g.2', type: 'uml.InteractionOperand', label: 'b' }] }] }] };
  const text = write(m), back = read(text);
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()), ["%% not written: g: its occurrences are not one run in the view's edges"]);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.views[0].edges.map(e => [e.id, e.parent ?? null, e.props.replyTo ?? null]),
    [['c1', null, null], ['c2', null, null], ['r1', 'g.1', 'c2'], ['t', null, null], ['r2', null, 'c2']]);
  // a reply-to the reader cannot follow is reported
  assert.deepEqual(read('sequenceDiagram\nA->>B: c\n%% reply-to: nope\nB-->>A: r\n').report.map(x => `${x.line} ${x.message}`), ['4 B-->>A: reply-to nope is not an earlier call from A to B, so it is not read']);
});

test('text keeps the spaces at its ends, an empty text is named, a lifeline with no label reads as its name, par_over is a keyword (review of 3.6)', () => {
  const L = (id, label, props) => ({ id, type: 'uml.Lifeline', ...(label !== undefined ? { label } : {}), ...(props ? { props } : {}) });
  const m = { schemaVersion: 2, nodes: [L('a', ' '), L('b', ' B '), L('c', undefined, { represents: 'T' }), L('par_over', 'par_over')],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['a', 'b', 'c', 'par_over'], edges: [
      { id: 'm1', type: 'uml.Message', from: 'a', to: 'b', label: '  padded  ', parent: 'o.1', props: { sort: 'call' } },
      { id: 'm2', type: 'uml.Message', from: 'par_over', to: 'b', label: '', parent: 'p.1', props: { sort: 'call' } }],
    fragments: [{ id: 'o', type: 'uml.CombinedFragment', props: { operator: 'opt' }, members: [{ id: 'o.1', type: 'uml.InteractionOperand', label: ' g ' }] },
      { id: 'p', type: 'uml.CombinedFragment', props: { operator: 'opt' }, members: [{ id: 'p.1', type: 'uml.InteractionOperand', label: '' }] }] }] };
  const text = write(m), back = read(text), v = back.model.views[0];
  assert.match(text, /participant L_par_over as par_over\n/);
  assert.deepEqual(text.split('\n').filter(l => l.includes('not written')).map(l => l.trim()),
    ['%% not written: c: no label, read as its name', '%% not written: p.1: an empty guard, read as none', '%% not written: m2: an empty label, read as none']);
  assert.deepEqual(back.report, []);
  assert.deepEqual(back.model.nodes.map(n => [n.id, n.label, n.props?.represents ?? null]), [['a', ' ', null], ['b', ' B ', null], ['c', 'c', 'T'], ['par_over', 'par_over', null]]);
  assert.deepEqual([v.edges[0].label, v.fragments[0].members[0].label, v.edges[1].from], ['  padded  ', ' g ', 'par_over']);
});

test('a par_over block is read as par, reported, and its end closes it, not the fragment around it', () => {
  const r = read('sequenceDiagram\nparticipant a\nparticipant b\nopt outer\npar_over one\na->>b: x\nand two\nb->>a: y\nend\na->>b: z\nend\n');
  const v = r.model.views[0], [o, p] = v.fragments;
  assert.deepEqual(v.fragments.map(f => [f.props.operator, f.members.length]), [['opt', 1], ['par', 2]]);
  assert.equal(p.parent, o.members[0].id);
  assert.deepEqual(v.edges.map(e => e.parent), [p.members[0].id, p.members[1].id, o.members[0].id]);
  assert.deepEqual(r.report.map(x => x.status), ['approximated']);
});

test('a lifeline waiting to be created that sends a message creating another is not created later (integration of 3.3 and 3.6)', () => {
  const r = read('sequenceDiagram\nparticipant A\ncreate participant B\ncreate participant C\nB->>C: hi\nA->>B: late\n');
  const v = r.model.views[0];
  assert.deepEqual(v.edges.map(e => `${e.from}>${e.to} ${e.props.sort}`), ['B>C create', 'A>B call']);
  assert.deepEqual(r.report.map(x => `${x.line} ${x.message}`), ['3 create B: the next message is from it, so nothing creates it']);
  assert.deepEqual(validate(r.model).filter(p => p.level === 'error'), []);
});
