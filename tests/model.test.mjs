// validate() and check(): a model's own problems, and the layout check's geometry, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, check, layout, rules, describe } from '../lib/umlimator.js';
import { mapContext } from '../src/map/context.js';
import { fit } from '../src/core/text.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));

test('validate() finds nothing wrong in the examples and the benchmark models', () => {
  for (const f of ['bookshop', 'bike-share', 'weather', 'assistant']) assert.deepEqual(validate(read(`../examples/${f}.json`)), [], f);
  for (const f of ['b10', 'b26', 'b69', 'd24', 'm50']) assert.deepEqual(validate(read(`../bench/models/${f}.json`)), [], f);
});

test('validate() names each error and warning by where it is, and accepts what render() draws (lines to a box, a view loaded later)', () => {
  const bad = { root: 'nope',
    nodes: [{ id: 'a', kind: 'backend' }, { id: 'a' }, { label: 'no id' }, { id: 'b', kind: 'wizard', opensView: 'later' }],
    edges: [{ id: 'e1', from: 'a', to: 'ghost' }, { id: 'e1', from: 'a', to: 'box' }, { id: 'e3', from: 'a', to: 'b', kind: 'zaps', weight: 5, fromSide: 'up' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], tour: ['a', 'z'], stepIds: ['q'], browserOrder: ['w'], layout: { zz: [0, 0] },
      edges: ['e1', 'e9', { from: 'a', to: 'box' }, { from: 'a', to: 'far' }],
      containers: [{ id: 'box', nodeIds: ['a', 'x'], parent: 'inner' }, { id: 'inner', parent: 'box' }, { id: 'lost', parent: 'nowhere' }] }] };
  const got = validate(bad).map(p => `${p.level} ${p.path}`).sort();
  assert.deepEqual(got, [
    'error edges[0].to', 'error edges[1].id', 'error nodes[1].id', 'error nodes[2].id', 'error root',
    'error views[0].browserOrder[0]', 'error views[0].containers[0].nodeIds[1]', 'error views[0].containers[0].parent', 'error views[0].containers[1].parent',
    'error views[0].containers[2].parent', 'error views[0].edges[1]', 'error views[0].edges[3].to', 'error views[0].nodeIds[2]',
    'error views[0].stepIds[0]', 'error views[0].tour[1]',
    'warning edges[2].fromSide', 'warning edges[2].kind', 'warning edges[2].weight', 'warning nodes[3].kind', 'warning nodes[3].opensView', 'warning views[0].containers[2]',
    'warning views[0].edges[0]', 'warning views[0].edges[2]', // a line from a card to the box that holds it: no error, but not drawn (audit 11)
    'warning views[0].layout.zz',
  ]);
  assert.match(validate(bad).find(p => p.path === 'views[0].containers[0].parent').message, /inside itself/);
  assert.deepEqual(validate({ nodes: [] }).map(p => p.path), ['views']);
});

test('validate() warns of a line from a card or a box to itself, which no view draws (F1)', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: [{ from: 'box', to: 'box' }, { from: 'a', to: 'b' }], containers: [{ id: 'box', nodeIds: ['b'] }] }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path} ${p.message}`), [
    'warning edges[0] a line from "a" to itself: not drawn',
    'warning views[0].edges[0] a line from "box" to itself: not drawn',
  ]);
  assert.equal(layout(m, 'v').edges.length, 1); // the view's own lines: only a -> b is drawn
});

test('check() reports the layout check\'s geometry for a view, naming the lines it is about', () => {
  const cards = ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }));
  const clean = { nodes: cards, edges: [{ id: 'ab', from: 'a', to: 'b', label: 'calls' }, { id: 'bc', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  assert.deepEqual(check(clean, 'v'), []);
  const back = { nodes: cards, edges: [{ id: 'cb', from: 'c', to: 'b' }], views: [{ id: 'v', nodeIds: ['b', 'c'], layout: { b: [0, 0], c: [1, 0] } }] };
  assert.deepEqual(check(back, 'v'), [{ message: 'view v: edge C→B runs right-to-left', targets: [{ type: 'edge', ids: ['cb'], view: 'v' }] }]);
  assert.throws(() => check(clean, 'nope'), /no view/);
});

test('check() names exactly what an issue is about: of two lines that read the same, the one it means (#61)', () => {
  const m = { nodes: [{ id: 'a1', label: 'API', kind: 'backend' }, { id: 'a2', label: 'API', kind: 'backend' }, { id: 'db', label: 'DB', kind: 'database' }],
    edges: [{ id: 'a2db', from: 'a2', to: 'db' }, { id: 'a1db', from: 'a1', to: 'db' }],
    views: [{ id: 'v', nodeIds: ['a1', 'a2', 'db'], layout: { a2: [0, 0], db: [1, 0], a1: [2, 0] } }] };
  assert.deepEqual(check(m, 'v'), [{ message: 'view v: edge API→DB runs right-to-left', targets: [{ type: 'edge', ids: ['a1db'], view: 'v' }] }]);
});

// A deep parent chain (milestone 4a §2.4, work package 4a.2): the cycle check walks each chain once, so validate() of
// 20,000 levels is linear, and says "ends up inside itself" on each element of a cycle, where and in the order it did
const owners = (n, parentOf) => ({ schemaVersion: 2,
  nodes: Array.from({ length: n }, (_, i) => { const p = parentOf(i); return { id: 't' + i, type: 'uml.Package', ...(p != null ? { parent: 't' + p } : {}) }; }),
  views: [{ id: 'v', diagram: 'uml.package', nodeIds: Array.from({ length: n }, (_, i) => 't' + i) }] });
const cycles = m => validate(m).filter(p => /inside itself/.test(p.message)).map(p => p.path);

test('validate() says a cycle on each element of it, in model order, and nothing on a chain that only leads into one (4a.2)', () => {
  // t0 t1 t2 a cycle; t3 hangs from it; t4 its own parent; t5 t6 a chain to t7 t8, a cycle listed after them; t9 apart
  const m = owners(10, i => [2, 0, 1, 0, 4, 6, 7, 8, 7, null][i]);
  assert.deepEqual(cycles(m), ['nodes[0].parent', 'nodes[1].parent', 'nodes[2].parent', 'nodes[4].parent', 'nodes[7].parent', 'nodes[8].parent']);
  assert.deepEqual(cycles(owners(5, i => (i ? i - 1 : null))), []);
  // a cycle through a member and its owner: the node that names the member is said, the member (no parent) is not
  const mem = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.State', members: [{ id: 'r', type: 'uml.Region' }], parent: 'r' }], views: [] };
  assert.deepEqual(cycles(mem), ['nodes[0].parent']);
});

test('validate() of a 20,000-topic chain, a chain into a cycle and a ring of 20,000 under CI\'s 1 s, printed against 100 ms (CPU, best of five, after a warm-up) (timed)', () => {
  const N = 20000, chain = owners(N, i => (i ? i - 1 : null)), tail = owners(N, i => (i ? i - 1 : 1)), ring = owners(N, i => (i + N - 1) % N);
  assert.deepEqual(cycles(chain), []);
  assert.deepEqual(cycles(tail), ['nodes[0].parent', 'nodes[1].parent']);
  assert.equal(cycles(ring).length, N);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = m => Math.min(...Array.from({ length: 5 }, () => timed(() => validate(m))));
  const [c, t, r] = [chain, tail, ring].map(best); // each walk to the top was 9.5 s at 20,000
  for (const ms of [c, t, r]) assert.ok(ms < 1000, `${ms} ms`);
  console.log(`# P1 target 100 ms: validate() of a 20,000 chain ${c} ms, a chain into a cycle ${t} ms, a ring of 20,000 ${r} ms`);
});

test('a map view with a box lays out a line to a listed id that is no card: the line is left out, as without the box (backlog M3.3)', () => {
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'ghost' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'ghost'], containers: [{ id: 'box', label: 'Box', nodeIds: ['a'] }] }] };
  assert.ok(validate(m).some(p => p.level === 'error' && /ghost/.test(p.message)));
  assert.equal(layout(m, 'v').edges.length, 1);
});

test('a field that must be a list and is not: validate() says so, and the map draws without it (audit 1)', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  for (const [set, path, level] of [[m => { m.nodes[0].verbs = 'GET /orders'; }, 'nodes[0].verbs', 'warning'], [m => { m.views[0].nodeIds = 'a'; }, 'views[0].nodeIds', 'error'],
    [m => { m.views[0].containers = 'box'; }, 'views[0].containers', 'warning'], [m => { m.views[0].intake = 'feed'; }, 'views[0].intake', 'warning']]) {
    const m = base(); set(m);
    assert.ok(validate(m).some(p => p.path === path && p.level === level), path);
    assert.doesNotThrow(() => layout(m, 'v'), path);
  }
});

test('an icon\'s src and an author\'s avatar are escaped in href: an SVG data URL draws, and a model adds no attributes (audit 1)', () => {
  const src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>';
  const m = { icons: { logo: { src }, bad: { src: 'x" onerror="alert(1)' } }, authors: { ann: { avatar: 'y" onload="alert(2)' } },
    nodes: [{ id: 'a', label: 'A', icon: 'logo' }, { id: 'b', label: 'B', icon: 'bad', author: 'ann' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const s = mapContext(m).buildView('v').markup;
  assert.ok(s.includes('href="data:image/svg+xml;utf8,&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot;/&gt;"'));
  assert.ok(!/ on(error|load)="/.test(s));
});

test('a model\'s icon glyph (icons[k].g) draws as inert shapes only: no event attribute, image, use, foreignObject, script or style; Lucide\'s glyphs unchanged (audit 18)', () => {
  const hostile = ['<path d="M2 2h20"/><image href="x" onerror="alert(1)"/>', '<path d="M0 0" onload="alert(2)"/>', '<script>alert(3)</script><circle r="2"/>',
    '<foreignObject><div onclick="alert(4)">x</div></foreignObject>', '<use href="data:image/svg+xml,x#a"/>', '<g onclick="alert(5)"><rect width="2"/></g>',
    '<path d="a" fill="url(http://example.com/x#a)" style="x"/>', '<path d="a" fill="u&#114;l(x)"/>', '<path/onload=alert(6)>', '<path d=">" onload="alert(7)"/>',
    '<!--<path onload=alert(8)>--><rect width="2"/>', '<svg onload="alert(9)"><path d="M1 1"/></svg>', '<g><path d="M1 1"/>', '<path d="M1 1"><animate onbegin="alert(10)"/></path>'];
  const m = { icons: Object.fromEntries(hostile.map((g, i) => ['h' + i, { g }])), nodes: hostile.map((_, i) => ({ id: 'n' + i, label: 'N', icon: 'h' + i })),
    views: [{ id: 'v', nodeIds: hostile.map((_, i) => 'n' + i) }] };
  const s = mapContext(m).buildView('v').markup;
  assert.equal(s.match(/<svg\b/g).length, 1); // the view's own
  assert.ok(!/<(image|use|foreignObject|script|animate|div)\b|\son\w+=|style="x"|url\(|&#114;/i.test(s), s.match(/<(image|use|foreignObject|script|svg|animate)\b.{0,60}|\son\w+=.{0,40}/i)?.[0]);
  assert.ok(s.includes('<path d="M2 2h20"/>') && s.includes('<g><rect width="2"/></g>') && s.includes('<g><path d="M1 1"/></g>'));
  // every line icon the CLI ships (its `icons` table: the SVG's inner markup) draws exactly as written
  const dir = new URL('../icons/', import.meta.url), man = read('../icons/manifest.json');
  const lucide = Object.entries(man).filter(([, e]) => e.source === 'lucide').map(([k, e]) => [k, readFileSync(new URL(e.file, dir), 'utf8').replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').trim()]);
  assert.ok(lucide.length > 20);
  const L = { icons: Object.fromEntries(lucide.map(([k, g]) => [k, { g }])), nodes: lucide.map(([k]) => ({ id: k, label: k, icon: k })), views: [{ id: 'v', nodeIds: lucide.map(([k]) => k) }] };
  const t = mapContext(L).buildView('v').markup;
  for (const [k, g] of lucide) assert.ok(t.includes(`stroke-linejoin="round">${g}</g>`), k);
});

test('a cut label ends on whole characters: never half an emoji (audit 1)', () => {
  const t = fit('\u{1F600}'.repeat(40), 13, 100, true);
  assert.ok(t.endsWith('…') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(t), JSON.stringify(t));
});

test('edges that is no list, a view that is no object, a box\'s nodeIds that is no list: validate() says so, and the map draws without it (audit 2)', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'box', label: 'Box', nodeIds: ['b'] }] }] });
  for (const [set, path] of [[m => { m.views[0].containers[0].nodeIds = 'b'; }, 'views[0].containers[0].nodeIds'], [m => { m.edges = { 0: m.edges[0] }; }, 'edges'], [m => { m.views.push(null); }, 'views[1]']]) {
    const m = base(); set(m);
    assert.ok(validate(m).some(p => p.path === path && p.level === 'error'), path);
    assert.doesNotThrow(() => layout(m, 'v'), path);
  }
});

test('a card\'s author tag ends on whole characters: initials and a long name never cut an emoji in half (audit 2)', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const author of ['\u{1F680} rocket team', 'team-' + '\u{1F680}'.repeat(30)]) {
    const s = mapContext({ nodes: [{ id: 'a', label: 'Orders', author }], views: [{ id: 'v', nodeIds: ['a'] }] }).buildView('v').markup;
    assert.ok(!lone.test(s), author);
  }
});

test('a map view\'s edges list: a line to a card off the view, and a line listed twice, get a warning; the twice-listed line is drawn once (audit 7)', () => {
  const N = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
  const m = { nodes: N, edges: [{ id: 'ab', from: 'a', to: 'b', label: 'pays' }, { id: 'ac', from: 'a', to: 'c' }],
    views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], edges: ['ab', 'ab', 'ac', { from: 'b', to: 'c' }] }] };
  assert.deepEqual(validate(m).map(x => x.path + ' ' + x.message), [
    'views[0].edges[1] "ab" is listed twice: drawn once',
    'views[0].edges[2] "ac" ends on "c", which is not one of the view\'s cards or boxes: not drawn',
    'views[0].edges[3] the line ends on "c", which is not one of the view\'s cards or boxes: not drawn']);
  const g = layout(m, 'v');
  assert.deepEqual(g.edges.map(e => [e.from + '>' + e.to, e.lbl && e.lbl.text]), [['a>b', 'pays']]);
  // audit 8: a listed model line to another view's box is not drawn here either, and says so
  const mb = { nodes: N, edges: [{ id: 'l1', from: 'a', to: 'grp' }],
    views: [{ id: 'v1', nodeIds: ['a', 'b'], containers: [{ id: 'grp', label: 'Group', nodeIds: ['b'] }], edges: ['l1'] }, { id: 'v2', parent: 'v1', nodeIds: ['a', 'b'], edges: ['l1'] }] };
  assert.deepEqual(validate(mb).map(x => x.path + ' ' + x.message), ['views[1].edges[0] "l1" ends on "grp", which is not one of the view\'s cards or boxes: not drawn']);
});

test('a card, box or view whose id is an Object.prototype name lays out, validates and breaks rules as any other id (audit 8, M3)', () => {
  const P = ['toString', 'constructor', '__proto__', 'valueOf'];
  // sequence, hub and flow views with a card named for a prototype key: every card and line drawn, as under the id "orders"
  const card = (c, extra) => ({ nodes: [{ id: 'api', label: 'API', kind: 'public' }, { id: c, label: 'Orders' }, { id: 'pay', label: 'Pay' }, { id: 'mail', label: 'Mail' }, { id: 'log', label: 'Log' }],
    edges: [{ id: 'e1', from: 'api', to: c }, { id: 'e2', from: c, to: 'pay' }, { id: 'e3', from: 'api', to: 'mail' }, { id: 'e4', from: 'api', to: 'log' }, { id: 'e5', from: 'pay', to: c }],
    views: [{ id: 'v', nodeIds: ['api', c, 'pay', 'mail', 'log'], ...extra }] });
  const sig = (m, vid) => { const g = layout(m, vid); return [g.nodes.length, g.edges.map(e => [e.step ?? null, e.back]).join(), check(m, vid).length]; };
  for (const extra of [{}, { render: 'sequence' }, { node: 'api' }]) for (const c of P) assert.deepEqual(sig(card(c, extra), 'v'), sig(card('orders', extra), 'v'), `${JSON.stringify(extra)} ${c}`);
  // a view named for one keeps its plan (the loop back D→B), and unfolds a card
  const flow = vid => ({ nodes: ['a', 'b', 'c', 'd', 'x', 'p', 'q'].map(id => ({ id, label: id.toUpperCase(), ...(id === 'x' ? { opensView: 'inner' } : {}) })),
    edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'cd', from: 'c', to: 'd' }, { id: 'db', from: 'd', to: 'b', label: 'retry' }, { id: 'ax', from: 'a', to: 'x' }, { id: 'pq', from: 'p', to: 'q' }],
    views: [{ id: vid, nodeIds: ['a', 'b', 'c', 'd', 'x'] }, { id: 'inner', parent: vid, nodeIds: ['p', 'q'] }] });
  const vsig = vid => { const m = flow(vid), g = layout(m, vid), u = layout(m, vid, { expand: ['x'] });
    return [g.nodes.map(n => [n.id, n.x, n.y]).join(), g.edges.filter(e => e.back).length, check(m, vid).map(i => i.message.replace(vid, 'V')).join(), u.unfolded.join(), u.nodes.length]; };
  for (const vid of P) assert.deepEqual(vsig(vid), vsig('flow'), vid);
  // validate(): a box named for one is no box used twice, nor a parent that is there, nor a box a card is in already
  for (const b of P) { const m = { nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'v', nodeIds: ['a'], containers: [{ id: b, label: 'B', nodeIds: ['a'] }] }] };
    assert.deepEqual(validate(m), [], b); }
  assert.deepEqual(validate({ nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'v', nodeIds: ['a'], containers: [{ id: 'g', parent: 'toString', nodeIds: ['a'] }] }] }).map(x => x.message), ['"toString" is not a box of this view']);
  assert.deepEqual(validate({ nodes: [{ id: 'toString', label: 'A' }], views: [{ id: 'v', nodeIds: ['toString'], containers: [{ id: 'g', nodeIds: ['toString'] }] }] }), []);
  // rules(): a card named for one keeps its kind and its box
  const ruled = db => rules({ nodes: [{ id: 'web', label: 'Web', kind: 'frontend' }, { id: db, label: 'Orders DB', kind: 'db' }], edges: [{ id: 'l', from: 'web', to: db }],
    views: [{ id: 'v', nodeIds: ['web', db], containers: [{ id: 'data', label: 'Data', nodeIds: [db] }] }],
    rules: [{ id: 'no-db', from: { kind: 'frontend' }, to: { kind: 'db' } }, { id: 'no-data', from: { id: 'web' }, to: { container: 'data' } }] }).map(b => b.rule);
  for (const c of P) assert.deepEqual(ruled(c), ['no-db', 'no-data'], c);
});

test('the layout search render bakes stops on work, not on a clock: a slow machine bakes the same layout (audit 7)', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop.json', import.meta.url)));
  const run = () => { const c = mapContext(m); c.planOf('overview'); return JSON.stringify(c.optimize('overview')); };
  const fast = run(), now = performance.now, t = now.call(performance);
  performance.now = () => t + (now.call(performance) - t) * 1000; // a machine 1000 times slower, as its clock sees it
  try { assert.equal(run(), fast); } finally { performance.now = now; }
});

test('an entry that is no object in nodes, edges, a view\'s nodes or containers is left out: the view draws, and validate() says so (audit 9)', () => {
  const base = () => ({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  for (const [what, f] of [['a model line', m => m.edges.unshift(null)], ['a card', m => m.nodes.unshift(null)],
    ['a view\'s card', m => { m.views[0].nodes = [null]; }], ['a view\'s box', m => { m.views[0].containers = [null]; }]]) {
    const m = base(); f(m);
    assert.ok(validate(m).some(p => p.level === 'error'), what);
    const g = layout(m, 'v'); assert.equal(g.nodes.length, 2, what); assert.equal(g.edges.length, 1, what); check(m, 'v');
  }
});

test('a view\'s gap or rgap that is no positive number is the default, and validate() warns (audit 9)', () => {
  const at = gap => { const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], ...gap }] }; return [layout(m, 'v'), validate(m)]; };
  const [plain] = at({});
  for (const gap of [{ gap: 'wide' }, { gap: {} }, { gap: ['x'] }, { rgap: 'wide' }, { gap: -5 }]) {
    const [g, probs] = at(gap); assert.deepEqual(g.bounds, plain.bounds, JSON.stringify(gap));
    assert.deepEqual(probs.map(p => p.path), [`views[0].${Object.keys(gap)[0]}`], JSON.stringify(gap)); }
  const [huge, hp] = at({ gap: 1e308 }); assert.ok(huge.bounds.w < 3000, huge.bounds.w); assert.match(hp[0].message, /drawn as 2000/);
});

test('audit 11: a map line from a box to a card or box inside it is warned of and left out of what the view says it draws', () => {
  const m = { nodes: [{ id: 'api', label: 'API' }, { id: 'db', label: 'DB' }, { id: 'web', label: 'Web' }],
    edges: [{ id: 'w', from: 'web', to: 'api' }, { id: 'audit', from: 'payments', to: 'db', label: 'writes audit rows' }, { id: 'up', from: 'core', to: 'payments' }],
    views: [{ id: 'main', nodeIds: ['web', 'api', 'db'], containers: [{ id: 'core', label: 'Core', nodeIds: [] }, { id: 'payments', label: 'Payments', parent: 'core', nodeIds: ['api', 'db'] }] }],
    rules: [{ id: 'r', from: { kind: 'script' }, to: { kind: 'store' }, allow: false }] };
  assert.deepEqual(validate(m).map(p => [p.path, p.message]), [
    ['edges[1]', 'joins the box "payments" and "db", which it holds: not drawn in view "main"'],
    ['edges[2]', 'joins the box "core" and "payments", which it holds: not drawn in view "main"']]);
  assert.deepEqual(layout(m, 'main').edges.map(e => e.ids), [['w']]);
  assert.match(describe(m, 'main'), /^main: 3 cards and 1 line\./);
  assert.deepEqual(mapContext(m).viewEdges(mapContext(m).V.main).map(e => e.id), ['w']);
});

test('audit 19: an object with a toString key ({"toString": 1}, valid JSON) is no text: validate() says where and goes on, layout, the drawing and describe() read the rest', async () => {
  const dir = new URL('../src/', import.meta.url), { readdirSync } = await import('node:fs'); // every type registered, as the bundle has them
  for (const f of readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js') && !/^(page|canvas)[\\/]/.test(f))) await import(new URL(f.replaceAll('\\', '/'), dir));
  const { validate: v, layout: l, svgOf } = { ...(await import('../src/map/validate.js')), ...(await import('../src/map/api.js')), ...(await import('../src/draw/svg.js')) };
  const { describe: d } = await import('../src/map/insight.js'), bad = () => JSON.parse('{"toString":1}');
  const files = readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')), thrown = [];
  for (const f of files) {
    const m = read(`../examples/${f}`); if (!Array.isArray(m.views)) continue;
    const said = [], todo = [...(m.nodes || []).map((x, i) => [x, `nodes[${i}]`]), ...(m.edges || []).map((x, i) => [x, `edges[${i}]`]),
      ...m.views.flatMap((w, i) => [...(w.nodes || []).map((x, j) => [x, `views[${i}].nodes[${j}]`]), ...(Array.isArray(w.edges) ? w.edges : []).map((x, j) => [x, `views[${i}].edges[${j}]`])])];
    while (todo.length) { const [x, at] = todo.pop(); if (!x || typeof x !== 'object') continue; x.label = bad(); said.push(at + '.label'); if (x.props) { x.props.guard = bad(); said.push(at + '.props.guard'); }
      (x.members || []).forEach((y, j) => todo.push([y, `${at}.members[${j}]`])); }
    m.views[0].title = bad(); said.push('views[0].title');
    let ps; try { ps = v(m); } catch (e) { thrown.push(`${f} validate: ${e.message}`); continue; }
    const errs = new Set(ps.filter(p => p.level === 'error' && /toString/.test(p.message)).map(p => p.path));
    assert.deepEqual(said.filter(p => !errs.has(p)), [], f + ': each one said');
    for (const w of m.views) for (const [k, fn] of [['layout', () => svgOf(l(m, w.id))], ['describe', () => d(m, w.id)]]) try { fn(); } catch (e) { thrown.push(`${f} ${k} ${w.id}: ${e.message}`); }
  }
  assert.deepEqual(thrown, []);
  // a map by id may name a card toString: its layout and override are read, and nothing is said
  const named = { nodes: [{ id: 'toString', label: 'T' }, { id: 'b' }], views: [{ id: 'v', nodeIds: ['toString', 'b'], layout: { toString: [0, 0], b: [1, 0] }, nodeOverrides: { toString: { label: 'Tee' } } }] };
  assert.deepEqual(v(named).filter(p => /toString/.test(p.message)), []);
  assert.equal(l(named, 'v').nodes.find(n => n.id === 'toString').label, 'Tee');
});

test('audit 20: every exported function reads a hostile model (an object with a toString or valueOf key in a label, a title, an id, a rule, a story) as validate() does: none throws', async () => {
  const U = await import('../lib/umlimator-all.js'), { readdirSync } = await import('node:fs');
  const browser = ['render', 'mountPage'], ran = new Set(); // render(): tests/stories.html plays a hostile story
  const call = (name, fn) => { ran.add(name); return fn(); };
  const files = readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')), thrown = [];
  for (const f of files) for (const bad of ['{"toString":1}', '{"valueOf":1}', '{"toString":1,"valueOf":1}', '[{"toString":1}]']) {
    const plain = read(`../examples/${f}`); if (!Array.isArray(plain.views) || !plain.views.length) continue;
    const m = structuredClone(plain), B = () => JSON.parse(bad), v = m.views[0].id, nodes = m.nodes || [], a = nodes[0] && nodes[0].id, b = nodes[1] && nodes[1].id;
    [...nodes, ...(m.edges || [])].forEach((x, i) => { if (x && typeof x === 'object' && i % 2) x.label = B(); });
    if (nodes[2]) nodes[2].id = B(); // a card whose id is no text
    m.views.forEach(w => { w.title = B(); }); m.title = B();
    m.rules = [{ id: 'r', title: B(), from: a, to: b }, { id: B(), noCycles: true }];
    m.stories = [{ id: 's', title: B(), steps: [{ view: v, caption: B(), duration: B(), camera: { card: a, zoom: B() }, highlight: [a, B()] }] }];
    const spans = [{ id: 's1', service: a, start: 0, end: 5 }, { id: 's2', parent: 's1', service: B(), start: 1, end: 3 }, { id: 's3', parent: 's1', service: b, start: B(), end: 4, name: B() }];
    const otlp = { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: B() } }] }, scopeSpans: [{ spans: [{ spanId: B(), startTimeUnixNano: B(), endTimeUnixNano: '9' }] }] }] };
    const observed = [{ from: a, to: b, count: B() }, { from: B(), to: b, count: 1 }, { parent: a, child: B(), callCount: 2 }];
    const runs = {
      migrate: () => U.migrate(m), validate: () => U.validate(m), rules: () => U.rules(m), references: () => U.references(m, a), apply: () => U.apply(m, { op: 'set', id: b, path: 'label', value: 'Q' }),
      history: () => { const h = U.history(m); h.push(plain); h.undo(); return h.model; },
      diff: () => [U.diff(plain, m), U.diff(m, plain), U.diff(m, m)].map(d => d.summary.join()),
      drift: () => U.drift(m, observed, { match: { [a]: B(), x: a } }).counts,
      otlpSpans: () => U.otlpSpans(otlp), sequenceFromTrace: () => U.sequenceFromTrace(m, spans, { match: { [a]: B() } }),
      layout: () => U.layout(m, v), check: () => U.check(m, v), describe: () => U.describe(m, v), paths: () => U.paths(m, v, a, b), reach: () => U.reach(m, v, a),
      critical: () => U.critical(m, v, { from: a }), whatIf: () => U.whatIf(m, v, { remove: [a] }),
    };
    for (const [k, fn] of Object.entries(runs)) try { call(k, fn); } catch (e) { thrown.push(`${f} ${bad} ${k}: ${e.message}`); }
  }
  assert.deepEqual(thrown, []);
  assert.deepEqual(Object.keys(U).filter(k => typeof U[k] === 'function' && !browser.includes(k) && !ran.has(k)), [], 'every exported function is run');
});

test('audit 20: a map by name one level down may hold a key named toString: a stereotype\'s tagged value, a part\'s port; a value with one is still said', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Class', label: 'Order', props: { tags: { Entity: { toString: 'yes', table: 'orders' }, toString: { a: 1 } } } }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['c'], present: { c: { ports: { toString: { side: 'left' } } } } }] };
  assert.deepEqual(validate(m).filter(p => /toString/.test(p.message)), []);
  const bad = structuredClone(m); bad.nodes[0].props.tags.Entity.table = { toString: 1 }; bad.views[0].present.c.ports.toString = { toString: 1 };
  assert.deepEqual(validate(bad).filter(p => /toString/.test(p.message)).map(p => p.path).sort(), ['nodes[0].props.tags.Entity.table', 'views[0].present.c.ports.toString']);
});

// audit 24: a host's model may hold what structuredClone refuses (a function, a Symbol, a Proxy) or a value that throws when
// read. unreadable() copied a model with structuredClone once it found a value to leave out, and layout(), apply() and diff()
// copied every model so: each threw a DataCloneError. Now such a value stays as it is (a function by reference), and one that
// throws when read is left out, as a toString that is no function is
test('audit 24: a model holding a function, a Symbol, a Proxy or a getter that throws is read, never thrown on', async () => {
  const L = await import('../lib/umlimator-all.js');
  const mk = (d, T, extra) => { const f = () => 1, m = { schemaVersion: 2, nodes: [{ id: 'a', type: T, label: 'A', props: { onClick: f, tag: Symbol('s') } }, ...extra], edges: [], views: [{ id: 'v', diagram: d, nodeIds: ['a', ...extra.map(n => n.id)] }], root: 'v' }; return [m, f]; };
  const hostile = T => [[], [{ id: 'b', type: T, label: { toString: 1 } }], [{ id: 'b', type: T, label: 'B', props: { p: new Proxy({}, { ownKeys() { throw new Error('trap'); } }) } }],
    [{ id: 'b', type: T, label: 'B', props: { get g() { throw new Error('getter'); } } }], [{ id: 'b', type: T, get label() { throw new Error('label'); } }]];
  const writers = { 'mermaid-class': ['uml.class', 'uml.Class'], 'mermaid-er': ['er', 'er.Entity'], 'mermaid-flowchart': ['flowchart', 'flowchart.Process'], 'mermaid-mindmap': ['mindmap', 'mindmap.Topic'],
    'mermaid-requirement': ['sysml.requirement', 'sysml.Requirement'], 'mermaid-sequence': ['uml.sequence', 'uml.Lifeline'], 'mermaid-state': ['uml.state-machine', 'uml.State'] };
  for (const [file, [d, T]] of Object.entries(writers)) {
    const W = await import(`../src/readers/${file}.js`), write = Object.values(W).find(x => typeof x === 'function' && /^write/.test(x.name));
    hostile(T).forEach((extra, k) => { const what = `${file} #${k}`, [m, f] = mk(d, T, extra);
      assert.equal(typeof write(m), 'string', what);
      const said = L.validate(m); assert.ok(Array.isArray(said), what);
      if (k >= 2) assert.ok(said.some(p => /left out/.test(p.message)), `${what}: said`);
      assert.equal(typeof L.describe(m, 'v'), 'string', what);
      assert.ok(L.layout(m, 'v').nodes.length >= 1, what);
      assert.ok(L.diff(m, m), what);
      const a = L.apply(m, { op: 'set', id: 'a', path: 'label', value: 'A2' }); assert.equal(a.nodes[0].props.onClick, f, `${what}: the function kept`);
      assert.equal(m.nodes[0].label, 'A', `${what}: the host's model unchanged`); });
  }
  // the words: a value that throws is said as one, at its path
  const [m] = mk('uml.class', 'uml.Class', hostile('uml.Class')[3]);
  assert.deepEqual(L.validate(m).filter(p => /throws when it is read/.test(p.message)).map(p => p.path), ['nodes[1].props.g']);
});

// audit 25: copyOf()'s copy by hand (a model structuredClone refuses, one holding a function) made a {} of every object, a
// Date, a Map or a Set too, and wrote each key by assignment: an own "__proto__" key, as JSON.parse gives it, became the
// copy's prototype, and its keys were read through it
test('audit 25: a model holding a function keeps its Dates, Maps and Sets, and an own __proto__ key stays a key', async () => {
  const L = await import('../lib/umlimator-all.js'), when = new Date('2026-01-02T00:00:00Z');
  const mk = () => ({ schemaVersion: 2, nodes: [{ id: 'a', label: 'A', props: { created: new Date(when), tags: new Set(['x']), by: new Map([['k', 1]]), list: [1, , 3] } }], views: [{ id: 'v', nodeIds: ['a'] }] });
  for (const fn of [false, true]) { const m = mk(); if (fn) m.nodes[0].onClick = () => 1;
    const p = L.apply(m, { op: 'set', id: 'a', path: 'label', value: 'Z' }).nodes[0].props, what = fn ? 'with a function' : 'without';
    assert.ok(p.created instanceof Date && +p.created === +when, what); assert.deepEqual([...p.tags], ['x'], what); assert.equal(p.by.get('k'), 1, what);
    assert.equal(p.list.length, 3, what); assert.ok(!(1 in p.list), `${what}: a gap kept`);
    assert.notEqual(p.created, m.nodes[0].props.created, `${what}: a copy`); }
  const f = mk(); f.onOpen = () => 1;
  assert.deepEqual(L.diff(mk(), f).summary, [], 'a function alone is no change');
  const later = mk(); later.onOpen = () => 1; later.nodes[0].props.created = new Date('2027-05-05T00:00:00Z');
  assert.deepEqual(L.diff(mk(), later).summary, ['changes A (props)']);
  // a class's instance, and one structuredClone refuses (a WeakMap): kept as they are
  class Box { constructor() { this.v = 1; } } const weak = new WeakMap(), box = new Box(), w = mk(); w.onOpen = () => 1; w.nodes[0].props.weak = weak; w.nodes[0].props.box = box;
  const pw = L.apply(w, { op: 'set', id: 'a', path: 'label', value: 'Z' }).nodes[0].props; assert.equal(pw.weak, weak); assert.equal(pw.box.v, 1);
  // __proto__: an own key, as JSON.parse writes it, in the copy as in the model, with or without a function
  const json = '{"schemaVersion":2,"nodes":[{"id":"a","label":"A"},{"id":"b","__proto__":{"label":"Injected","type":"x"}}],"views":[{"id":"v","nodeIds":["a","b"]}]}';
  for (const fn of [false, true]) { const m = JSON.parse(json); if (fn) m.onOpen = () => {};
    const b = L.apply(m, { op: 'set', id: 'a', path: 'label', value: 'Z' }).nodes[1], what = fn ? 'with a function' : 'without';
    assert.ok(Object.hasOwn(b, '__proto__'), what); assert.equal(b.label, undefined, what); assert.equal(Object.getPrototypeOf(b), Object.prototype, what);
    assert.equal(JSON.stringify(b), '{"id":"b","__proto__":{"label":"Injected","type":"x"}}', what);
    assert.deepEqual(L.layout(m, 'v').nodes.map(n => n.label).filter(x => x === 'Injected'), [], what); }
  assert.equal({}.label, undefined, 'nothing written to Object.prototype');
});

// audit 25: a value apply() could not read (a Proxy whose keys throw) stood in its model as one shared frozen object: a later
// set into it threw a raw TypeError, and validate() of the result named a "toString" key the host never wrote
test('audit 25: apply() leaves out a value it cannot read; what it returns takes a set and validates clean', async () => {
  const L = await import('../lib/umlimator-all.js');
  const mk = () => ({ schemaVersion: 2, nodes: [{ id: 'a', label: 'A', props: new Proxy({ x: 1 }, { ownKeys() { throw new Error('k'); } }) }, { id: 'b', label: 'B', list: [1, new Proxy({}, { ownKeys() { throw new Error('k'); } }), 3] }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  assert.deepEqual(L.apply(mk(), { op: 'set', id: 'a', path: 'props.y', value: 2 }).nodes[0].props, { y: 2 });
  const out = L.apply(mk(), { op: 'set', id: 'a', path: 'label', value: 'B' });
  assert.equal(Object.hasOwn(out.nodes[0], 'props'), false); assert.deepEqual(out.nodes[1].list, [1, 3]);
  assert.deepEqual(L.validate(out), []);
  assert.deepEqual(L.apply(out, { op: 'set', id: 'a', path: 'props.y', value: 3 }).nodes[0].props, { y: 3 });
  assert.ok(L.validate(mk()).some(p => p.path === 'nodes[0].props'), 'the model itself: said where');
});

// audit 25: describe(), paths(), reach(), critical(), whatIf() and references() read the raw model, and a host's getter that
// threw was thrown out of them; layout() and validate() read it as no value (audit 24). Now all of them do
test('audit 25: describe(), paths(), reach(), critical(), whatIf() and references() read a model whose getter throws', async () => {
  const L = await import('../lib/umlimator-all.js');
  const base = () => ({ schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', latency: 3 }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  const getRoot = () => new Proxy(base(), { get(t, k) { if (k === 'views') throw new Error('host'); return t[k]; } });
  const typed = () => { const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a'] }] };
    Object.defineProperty(m.views[0], 'diagram', { get() { throw new Error('host'); }, enumerable: true }); return m; };
  const edge = () => { const m = base(); Object.defineProperty(m.edges[0], 'label', { get() { throw new Error('host'); }, enumerable: true }); return m; };
  const run = { describe: m => L.describe(m, 'v'), paths: m => L.paths(m, 'v', 'a', 'b'), reach: m => L.reach(m, 'v', 'a'), critical: m => L.critical(m, 'v'), whatIf: m => L.whatIf(m, 'v', { remove: 'a' }) };
  for (const [name, f] of Object.entries(run)) {
    assert.throws(() => f(getRoot()), /no view "v"/, `${name}: as layout() says`); assert.throws(() => L.layout(getRoot(), 'v'), /no view "v"/);
    assert.doesNotThrow(() => f(typed()), name); assert.doesNotThrow(() => f(edge()), name);
  }
  assert.equal(L.paths(edge(), 'v', 'a', 'b').length, 3); assert.match(L.describe(edge(), 'v'), /A calls B/);
  assert.deepEqual(L.references(getRoot(), 'a'), [{ path: ['edges', 0, 'from'], kind: 'end' }]);
  assert.deepEqual(L.references(typed(), 'a'), [{ path: ['views', 0, 'nodeIds', 0], kind: 'view' }]);
  assert.deepEqual(L.references(edge(), 'b'), L.references(base(), 'b'));
});

// audit 26: copyOf() structuredClone'd an object that is no plain one (a class's instance) alone and, when that threw (the
// instance held a function), kept the host's object as it was: apply() wrote its set into the host's node (history()'s
// undo gave back the edited model) and layout() wrote an _id into the host's line. Such an object is copied key by key now
test('audit 26: apply(), layout() and diff() never write into a host\'s model of class instances holding functions', async () => {
  const L = await import('../lib/umlimator-all.js');
  class Node { constructor(id, label) { this.id = id; this.label = label; } }
  class Line { constructor(from, to) { this.from = from; this.to = to; } }
  class Secret { #v = 'B'; constructor(id) { this.id = id; } get label() { return this.#v; } } // a getter on the prototype, reading a private field
  const mk = () => { const a = new Node('a', 'A'), e = new Line('a', 'b'), f = () => 1; a.onClick = f; e.onClick = f; a.props = { by: new Map([['k', f]]), seen: new Set([{ f }]), weak: new WeakMap() };
    return { schemaVersion: 2, nodes: [a, new Node('b', 'B'), new Secret('c')], edges: [e], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] }; };
  const snap = m => JSON.stringify(m, (k, v) => (v instanceof Map || v instanceof Set ? [...v] : v));
  const m = mk(), before = snap(m), [a] = m.nodes, [e] = m.edges;
  const h = L.history(m), out = h.push(L.apply(m, [{ op: 'set', id: 'a', path: 'label', value: 'Renamed' }, { op: 'set', id: 'a', path: 'props.x', value: 1 }]));
  assert.equal(snap(m), before, 'the host\'s model unchanged'); assert.equal(a.label, 'A'); assert.equal(a.props.x, undefined);
  const o = out.nodes[0]; assert.notEqual(o, a); assert.equal(o.label, 'Renamed'); assert.equal(o.props.x, 1);
  assert.equal(o.onClick, a.onClick, 'a function kept');
  assert.ok(o.props.by instanceof Map && o.props.by !== a.props.by && o.props.by.get('k') === a.onClick, 'a Map holding a function: copied');
  assert.ok(o.props.seen instanceof Set && [...o.props.seen][0] !== [...a.props.seen][0], 'a Set holding an object: copied');
  assert.equal(o.props.weak, a.props.weak, 'a WeakMap: kept, as its entries cannot be read');
  assert.equal(snap(h.undo()), before, 'undo gives back the model as it was');
  for (const k of ['layout', 'check', 'describe', 'validate']) { const r = k === 'validate' ? L.validate(m) : L[k](m, 'v'); assert.ok(r != null, k); }
  assert.ok(L.diff(m, out).summary.length >= 1); L.diff(out, m);
  assert.equal(snap(m), before, 'layout(), check(), describe(), validate() and diff() wrote nothing');
  assert.deepEqual(Object.keys(e), ['from', 'to', 'onClick'], 'no _id on the host\'s line');
  // a cycle through an instance: kept, in the copy
  const cyc = mk(); cyc.nodes[0].self = cyc.nodes[0]; const c2 = L.apply(cyc, { op: 'set', id: 'a', path: 'label', value: 'Z' }).nodes[0];
  assert.equal(c2.self, c2); assert.equal(cyc.nodes[0].label, 'A');
  // a model with no function: as it was (structuredClone)
  const plain = { nodes: [new Node('a', 'A')], views: [{ id: 'v', nodeIds: ['a'] }] }, p2 = L.apply(plain, { op: 'set', id: 'a', path: 'label', value: 'Z' });
  assert.equal(plain.nodes[0].label, 'A'); assert.equal(p2.nodes[0].label, 'Z');
});
