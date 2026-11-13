// Structure notation (work package 5.3, notes/stage-5.md §4, §9.1): the port, component, ball and artifact shapes of
// src/uml/structure.js (their sizes; a point slid by inset, as the typed line drawer slides a line's end with drawnPts, lies
// on out; hit areas, colours, texts and names), the component's frame, the sides chosen before the layout against a table of
// rankings, the room a node needs for its ports, the ports drawn after the layout on a copy of hand-built geometry (the
// ports with no line 8 px apart on their border, the line ends on the squares' faces, the names clear of lines and nodes),
// and the shared rules with a passing and a failing case each. With the monospace estimate (no measurer in Node);
// tests/structure.html draws the shapes in Chrome in both themes and three fonts. Imports src/ to reach the internals;
// lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textW } from '../src/core/text.js';
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import { SN_SAY, STRUCT_RULES, portFit, portLen, portSides, portsDrawn, structProblems } from '../src/uml/structure.js';

const LONG = 'Order fulfilment and warehouse coordination service for every regional store';
const at = (shape, n) => ({ id: `${shape}-${JSON.stringify(n).length}`, shape, x: 40.5, y: 70.25, ...n, ...SHAPE[shape].size(n) });
const NODES = [at('port', {}), at('port', { w: 12, h: 32 }), at('component', { label: 'Shop API' }), at('component', { label: LONG, keyword: true, stereotypes: ['service', 'external'] }),
  at('artifact', { label: 'shop-api.jar' }), at('artifact', { label: 'deploy.yaml', type: 'uml.DeploymentSpecification' }), at('ball', {}), at('ball', { label: 'Orders' }), at('ball', { label: LONG })];

// an outline's points from its path (absolute M L H V A Z, as the shapes write it), each arc sampled every 0.5°: flow.test.mjs's
function outline(d) {
  const tk = d.match(/[MLHVAZ]|-?\d+(\.\d+)?/g), segs = []; let i = 0, x = 0, y = 0, x0 = 0, y0 = 0;
  const num = () => +tk[i++], to = (X, Y) => { segs.push([x, y, X, Y]); x = X; y = Y; };
  while (i < tk.length) { const c = tk[i++];
    if (c === 'M') { x = x0 = num(); y = y0 = num(); } else if (c === 'L') to(num(), num()); else if (c === 'H') to(num(), y); else if (c === 'V') to(x, num()); else if (c === 'Z') to(x0, y0);
    else if (c === 'A') { const r = num(); num(); num(); const large = num(), sweep = num(), X = num(), Y = num();
      const hx = (x - X) / 2, hy = (y - Y) / 2, k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (r * r - hx * hx - hy * hy) / (hx * hx + hy * hy))), cx = k * hy + (x + X) / 2, cy = -k * hx + (y + Y) / 2;
      const a0 = Math.atan2(y - cy, x - cx); let da = Math.atan2(Y - cy, X - cx) - a0; if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
      if (Math.abs(da) < 1e-9 && large) da = sweep ? 2 * Math.PI : -2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 360))); for (let j = 1; j <= n; j++) to(cx + r * Math.cos(a0 + da * j / n), cy + r * Math.sin(a0 + da * j / n)); x = X; y = Y; } }
  return segs;
}
const off = (segs, [px, py]) => Math.min(...segs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy); }));
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('sizes (§4.1, §9.1): a port 12 px square; a component and an artifact 96 to 320 px wide, a row per keyword; a ball 16 px, as wide as its name cut at 160 px', () => {
  const S = (sh, n = {}) => SHAPE[sh].size(n);
  assert.deepEqual([S('port'), S('ball'), S('ball', { label: '' }), S('component', { label: 'Shop' })], [{ w: 12, h: 12 }, { w: 16, h: 16 }, { w: 16, h: 16 }, { w: 96, h: 48 }]);
  assert.equal(S('component', { label: 'Shop', keyword: true }).h, 24 + 14 + 16 + 8, '«component» takes a row when asked');
  assert.equal(S('component', { label: 'Shop', keyword: true, stereotypes: ['a', ' '] }).h, 24 + 2 * 14 + 16 + 8, 'a blank stereotype takes no row');
  assert.equal(S('artifact', { label: 'x.jar' }).h, 24 + 14 + 16 + 8, '«artifact» always');
  assert.equal(S('component', { label: LONG }).w, 320); assert.equal(S('ball', { label: LONG }).w, Math.ceil(textW(SHAPE.ball.draw({ id: 'b', label: LONG, x: 0, y: 0, w: 1, h: 1 }).match(/c-name[^>]*>([^<]*)</)[1], 11) + 4));
  assert.ok(S('ball', { label: LONG }).w <= 164 && S('ball', { label: 'Orders' }).h === 16 + 4 + 14);
  assert.equal(S('component', { label: 'Shop', stereotypes: ['a much longer stereotype than the name'] }).w, Math.ceil(textW('«a much longer stereotype than the name»', 11) + 20));
});

test('every shape\'s out fills its box (a ball\'s, its circle), and a point on any side slid by inset (drawnPts, as a typed line\'s end is) lies on out', () => {
  for (const n of NODES) { const S = SHAPE[n.shape], segs = outline(S.out(n)), xs = segs.flatMap(s => [s[0], s[2]]), ys = segs.flatMap(s => [s[1], s[3]]);
    const box = n.shape === 'ball' ? { x: n.x + n.w / 2 - 8, y: n.y, w: 16, h: 16 } : n;
    assert.ok(Math.abs(Math.min(...xs) - box.x) < .02 && Math.abs(Math.max(...xs) - box.x - box.w) < .02 && Math.abs(Math.min(...ys) - box.y) < .02 && Math.abs(Math.max(...ys) - box.y - box.h) < .02, `${n.id}: out fills ${JSON.stringify(box)}`);
    const look = m => ({ ...m, S });
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 0; k <= 20; k++) {
      const v = side === 'L' || side === 'R', t = v ? box.y + box.h * k / 20 : box.x + box.w * k / 20, p = v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h];
      const [q] = drawnPts({ s: n, t: null, fs: side, pts: [p, [p[0] + 50, p[1] + 50]] }, look);
      assert.ok(off(segs, q) < .02, `${n.id}, side ${side} at ${t}: slid to ${q}, ${off(segs, q).toFixed(3)} px off its outline`); }
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 1; k <= 5; k++) S.ports(n, side, k).forEach(q => assert.ok(off(segs, q) < .02, `${n.id}: port ${q} on its outline`));
    assert.deepEqual(S.face(n), [box.y, box.y + box.h], `${n.id}: its face`);
  }
});

test('drawn: a node of the shape it names, its accessible name, a hit area 24 px or more, strokes --um-muted and fills the stage\'s or --um-text, texts and icons inside', () => {
  for (const n of NODES) { const s = SHAPE[n.shape].draw({ ...n, aria: `Name of ${n.id}` });
    assert.match(s, new RegExp(`^<g class="node ${n.shape}" data-id="${n.id}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="Name of ${n.id}">`));
    for (const [, k, v] of s.matchAll(/ (stroke|fill)="([^"]*)"/g)) assert.ok(k === 'stroke' ? v === 'var(--um-muted)' : ['var(--um-stage-bg)', 'var(--um-text)', 'var(--um-muted)', 'transparent'].includes(v), `${n.id}: ${k} ${v}`);
    if (n.shape === 'port') assert.match(s, /width="24" height="(24|32)" class="st-hit"/, `${n.id}: 24 px to hit, or its length`);
    if (n.shape === 'ball') assert.match(s, /r="12" class="st-hit"/);
    // each text's estimated box inside the node, less its padding; under the icon's band (24 px) on a component or an artifact
    for (const [, x, y, px, t] of s.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle" class="[^"]*" fill="[^"]*" style="font:\d+ ([\d.]+)px var\(--um-sans\)">([^<]*)<\/text>/g)) {
      const w = textW(t.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), +px), x0 = +x - w / 2, x1 = +x + w / 2, y0 = +y - +px, y1 = +y + 3, pad = n.shape === 'ball' ? 1.9 : 9.9;
      assert.ok(x0 >= n.x + pad && x1 <= n.x + n.w - pad && y0 >= n.y + (n.shape === 'ball' ? 16 : 24) && y1 <= n.y + n.h, `${n.id}: "${t}" inside`); }
    for (const [, d] of s.matchAll(/<path d="([^"]*)" class="n-det st-icon"/g)) { const segs = outline(d.replace(/ M/g, 'M')), xs = segs.flatMap(q => [q[0], q[2]]), ys = segs.flatMap(q => [q[1], q[3]]);
      assert.ok(Math.min(...xs) >= n.x + 4 && Math.max(...xs) <= n.x + n.w - 4 && Math.min(...ys) >= n.y + 4 && Math.max(...ys) <= n.y + 22, `${n.id}: its icon in the top right band`); }
  }
  assert.match(SHAPE.component.draw(NODES[2]), /aria-label="Component Shop API"/, 'a name of its own with no aria');
  assert.match(SHAPE.artifact.draw(NODES[5]), /aria-label="Deployment specification deploy.yaml"/);
  assert.match(SHAPE.artifact.draw(NODES[5]), />«deployment spec»</); assert.match(SHAPE.artifact.draw(NODES[4]), />«artifact»</);
  assert.doesNotMatch(SHAPE.component.draw(NODES[2]), /«component»/, '«component» only when the view asks'); assert.match(SHAPE.component.draw(NODES[3]), />«component»<.*>«service»</);
  assert.match(SHAPE.component.draw(NODES[3]), /…<\/text><\/g>$/, 'a long name cut'); assert.match(SHAPE.component.draw(NODES[3]), /data-o="component-\d+"/, 'the name renamed in place');
  assert.match(SHAPE.ball.draw(NODES[7]), /aria-label="Interface Orders, as a ball"/);
  assert.doesNotMatch(SHAPE.ball.draw(NODES[6]), /<text/, 'a ball with no name draws none');
  const port = SHAPE.port.draw({ ...NODES[0], label: 'orders', nameBox: { text: 'orders : OrderApi', x: 60, y: 50, w: 96, h: 14 } });
  assert.match(port, /class="port-name" data-box="60 50 96 14" fill="var\(--um-muted\)" style="font:500 10px var\(--um-sans\)">orders : OrderApi<\/text>/);
  assert.match(port, /aria-label="Port orders"/);
});

test('the component\'s frame (§9.1): its border, its name in the header room cut to the box, its icon at the top right', () => {
  const f = { id: 'shop', label: 'Shop', x: 10, y: 20, w: 200, h: 120 }, s = SHAPE.component.frame(f);
  assert.match(s, /^<rect class="family-box" x="10" y="20" width="200" height="120" stroke="var\(--um-muted\)"\/><text class="family-title" x="22" y="37"[^>]*data-o="shop">Shop<\/text>/);
  const [, d] = s.match(/<path d="([^"]*)" class="n-det st-icon"/), segs = outline(d.replace(/ M/g, 'M')), xs = segs.flatMap(q => [q[0], q[2]]), ys = segs.flatMap(q => [q[1], q[3]]);
  assert.ok(Math.max(...xs) <= f.x + f.w - 8 && Math.min(...ys) >= f.y + 4 && Math.max(...ys) <= f.y + 24);
  const t = SHAPE.component.frame({ ...f, w: 120, title: LONG }).match(/>([^<]*)<\/text>/)[1];
  assert.ok(t.endsWith('…') && textW(t, 12) <= 120 - 44, 'a long title stops short of the icon');
});

test('the accessible names (§10.1, §10.3)', () => {
  assert.equal(SN_SAY.component('Shop API', { ports: 2, holds: ['component'] }), 'Component Shop API, 2 ports, holding 1 component');
  assert.equal(SN_SAY.component('Shop', { stereotypes: ['service'], ports: 1, holds: ['component', 'artifact', 'component'] }), 'Component Shop (service), 1 port, holding 2 components, 1 artifact');
  assert.equal(SN_SAY.port('orders', 'Shop API', { provides: ['Orders'] }), 'Port orders of Shop API, provides Orders');
  assert.equal(SN_SAY.port('pay', 'Checkout', { valueType: 'PayPort', provides: ['A', 'B'], requires: ['Payments'] }), 'Port pay : PayPort of Checkout, provides A, B, requires Payments');
  assert.equal(SN_SAY.iface('Orders', { ball: true, providers: ['Shop API'], requirers: ['Storefront'] }), 'Interface Orders, as a ball, provided by Shop API, required by Storefront');
  assert.equal(SN_SAY.iface('Orders'), 'Interface Orders');
  assert.equal(SN_SAY.artifact('shop-api.jar', { on: 'Java 21 runtime', manifests: ['Shop API'] }), 'Artifact shop-api.jar, on Java 21 runtime, manifests Shop API');
  assert.equal(SN_SAY.artifact('deploy.yaml', { spec: true }), 'Deployment specification deploy.yaml');
});

test('the sides chosen before the layout (§4.2) match a table of rankings', () => {
  const pos = { a: [1, 1], left: [0, 1], right: [2, 1], up: [1, 0], down: [1, 2], far: [3, 4], box: [1.5, 1] };
  const P = (id, far, pin) => ({ id, owner: 'a', far, pin });
  // [ports, direction down, expected sides]
  const TABLE = [
    [[P('p', ['right'])], false, { p: 'R' }],
    [[P('p', ['left'])], false, { p: 'L' }],
    [[P('p', ['up'])], false, { p: 'T' }],
    [[P('p', ['down'])], false, { p: 'B' }],
    [[P('p', ['far'])], false, { p: 'R' }], // another column decides before the row
    [[P('p', ['left', 'right', 'right'])], false, { p: 'R' }], // the side facing most
    [[P('p', ['left', 'right'])], false, { p: 'L' }], // a tie: left first
    [[P('p', ['right'], 'top')], false, { p: 'T' }], // a pin wins
    [[P('p', ['right'], 'sideways')], false, { p: 'R' }], // a pin that is no side is passed over
    [[P('p', ['right'])], true, { p: 'B' }], // down: a later column is below
    [[P('p', ['down'])], true, { p: 'R' }],
    [[P('p', ['up'])], true, { p: 'L' }],
    [[P('p', [])], false, { p: 'L' }], // no line: the side with fewest ports, left first
    [[P('n1', []), P('p', ['left']), P('n2', []), P('n3', [])], false, { p: 'L', n1: 'R', n2: 'T', n3: 'B' }], // lined ports first, then the rest in order
    [[P('p', ['nowhere']), P('q', ['a'])], false, { p: 'L', q: 'R' }], // far ends with no place, or in the owner's own slot, count for none
    [[P('p', ['left']), { id: 'o', owner: 'right', far: ['a'] }], false, { p: 'L', o: 'L' }], // each owner counts its own
    [[{ id: 'b1', owner: 'box', far: ['left'] }], false, { b1: 'L' }], // a box at the mean of what it holds, as the type gives it
  ];
  TABLE.forEach(([ports, down, want], i) => assert.deepEqual(portSides(ports, pos, down), want, `row ${i}`));
  assert.deepEqual(portSides(null, null), {});
});

test('the room a node needs for its ports (§4.1): on each side 16 + Σ (port length + 8) px, a port 12 px and 10 more a further line', () => {
  assert.deepEqual([portLen(0), portLen(1), portLen(4)], [12, 12, 42]);
  const ports = [{ id: 'a', owner: 'n', lines: 1 }, { id: 'b', owner: 'n', lines: 4 }, { id: 'c', owner: 'n', lines: 0 }, { id: 'd', owner: 'm', lines: 2 }, { id: 'e', owner: 'n', lines: 1 }];
  assert.deepEqual(portFit(ports, { a: 'L', b: 'L', c: 'T', d: 'B', e: 'R' }), { n: { w: 16 + 20, h: 16 + 20 + 50 }, m: { w: 16 + 30, h: 16 } });
});

/* ---- the ports drawn after the layout, on a copy of hand-built geometry (§4.3, §4.5) ---- */
// a component a with a port p1 of two lines to b on its right (its box from the router's hook, fpb), a port p3 on its bottom
// with a line and no box recorded, and ports with no line on its left and right; a box f, holding c, with a port q whose
// lines run out to b and in to c (inner: its end on f leaves by R); ports with no line on f; a tall node d with ten on one side
const N = (id, x, y, w, h, more = {}) => ({ id, label: id.toUpperCase(), x, y, w, h, col: 0, row: 0, ...more });
function geometry() {
  const nodes = [N('a', 100, 100, 120, 120), N('b', 400, 120, 96, 48), N('c', 680, 140, 96, 48), N('d', 100, 400, 120, 216)], P1 = { x: 214, y: 144, w: 12, h: 22 }, Q = { x: 594, y: 164, w: 12, h: 22 };
  const edges = [
    { id: 'e1', from: 'a', to: 'b', fromPort: 'a.p1', fs: 'R', ts: 'L', pts: [[220, 150], [400, 150]], fpb: P1, lbl: { x: 280, y: 128, w: 60, h: 18 }, label: 'calls' },
    { id: 'e2', from: 'a', to: 'b', fromPort: 'a.p1', fs: 'R', ts: 'B', pts: [[220, 160], [260, 160], [260, 200], [448, 200], [448, 168]], fpb: P1 },
    { id: 'e3', from: 'a', to: 'b', fromPort: 'a.p3', fs: 'B', ts: 'B', pts: [[160, 220], [160, 260], [430, 260], [430, 168]] },
    { id: 'e4', from: 'f', to: 'c', fromPort: 'f.q', inner: 'from', fs: 'R', ts: 'L', pts: [[600, 168], [680, 168]], fpb: Q },
    { id: 'e5', from: 'b', to: 'f', toPort: 'f.q', fs: 'R', ts: 'L', pts: [[496, 150], [560, 150], [560, 180], [600, 180]], tpb: Q },
  ];
  return { nodes, edges, families: [{ id: 'f', label: 'F', x: 600, y: 60, w: 300, h: 260 }], byId: Object.fromEntries(nodes.map(n => [n.id, n])), bounds: { x: 0, y: 0, w: 920, h: 640 } };
}
const PORTS = [['a.p1', 'a', 'R', 'requests', 'OrderApi'], ['a.p2', 'a', 'R', 'audit'], ['a.p3', 'a', 'B', 'events'], ['a.p4', 'a', 'L', 'x'], ['a.p5', 'a', 'L', 'a forty character port name for the tests'], ['a.p6', 'a', 'L', 'z'],
  ['f.q', 'f', 'L', 'orders'], ['f.r', 'f', 'T', 'admin'], ['f.s', 'f', 'L', 'metrics'], ['ghost', 'nobody', 'L', 'gone'], ['bad', 'a', 'X', 'no side'],
  ...Array.from({ length: 10 }, (_, i) => [`d.${i}`, 'd', 'R', `p${i}`])].map(([id, owner, side, label, valueType]) => ({ id, owner, side, label, valueType }));

test('portsDrawn: a copy, never the layout\'s geometry; each port a node of it, on its side of its owner\'s border', () => {
  const g = geometry(), before = JSON.stringify(g), out = portsDrawn(g, PORTS);
  assert.equal(JSON.stringify(g), before, 'what the layout returned is not edited (§2.4)');
  assert.notEqual(out, g); assert.deepEqual(out.nodes.slice(0, 4), g.nodes, 'the layout\'s nodes kept');
  assert.deepEqual(out.ports, PORTS.filter(p => !['ghost', 'bad'].includes(p.id)).map(p => p.id), 'a port of no owner drawn, or of no side, is left out');
  const by = out.byId, own = { ...g.byId, f: g.families[0] };
  for (const id of out.ports) { const n = by[id], o = own[n.owner], cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    assert.equal(n.shape, 'port'); assert.ok(out.nodes.includes(n));
    const onBorder = { L: Math.abs(cx - o.x) < .01 && cy > o.y && cy < o.y + o.h, R: Math.abs(cx - o.x - o.w) < .01 && cy > o.y && cy < o.y + o.h,
      T: Math.abs(cy - o.y) < .01 && cx > o.x && cx < o.x + o.w, B: Math.abs(cy - o.y - o.h) < .01 && cx > o.x && cx < o.x + o.w }[n.side];
    assert.ok(onBorder, `${id}: centred on its owner's ${n.side} border, ${JSON.stringify(n)}`); }
  assert.deepEqual(['x', 'y', 'w', 'h'].map(k => by['a.p1'][k]), [214, 144, 12, 22], 'a port with lines: the box its lines record, longer for its second line');
  assert.deepEqual(['x', 'y', 'w', 'h'].map(k => by['a.p3'][k]), [154, 214, 12, 12], 'with no box recorded: a square round its line\'s end');
  assert.equal(by['a.p1'].aria, 'Port requests : OrderApi of A'); assert.equal(by['f.q'].aria, 'Port orders of F');
  assert.equal(portsDrawn(g, [{ ...PORTS[0], aria: 'Said by the type' }]).byId['a.p1'].aria, 'Said by the type');
  for (const n of out.nodes.slice(4)) assert.ok(n.x >= out.bounds.x && n.y >= out.bounds.y && n.x + n.w <= out.bounds.x + out.bounds.w && n.y + n.h <= out.bounds.y + out.bounds.h, `${n.id} in the bounds`);
  assert.deepEqual(portsDrawn(g, []).nodes, g.nodes); assert.equal(portsDrawn(g, []).edges.length, 5);
  assert.deepEqual(portsDrawn({ nodes: [], edges: [] }, PORTS), { nodes: [], edges: [], byId: {}, ports: [] }, 'an empty view');
});

test('portsDrawn: ports with no line keep 8 px apart, and from the ports with lines, within their side\'s free span', () => {
  const out = portsDrawn(geometry(), PORTS), by = out.byId, gap = (p, q, v) => v ? Math.max(q.y - p.y - p.h, p.y - q.y - q.h) : Math.max(q.x - p.x - p.w, p.x - q.x - q.w);
  const groups = {}; out.ports.forEach(id => (groups[by[id].owner + by[id].side] ||= []).push(by[id]));
  for (const [k, list] of Object.entries(groups)) { const v = /[LR]$/.test(k);
    list.forEach((p, i) => list.slice(i + 1).forEach(q => assert.ok(gap(p, q, v) >= 8 - .01, `${k}: ${p.id} and ${q.id} ${gap(p, q, v)} px apart`))); }
  const f = { x: 600, y: 60, w: 300, h: 260 };
  ['a.p2', 'a.p4', 'a.p5', 'a.p6'].forEach(id => assert.ok(by[id].y >= 100 + 8 && by[id].y + 12 <= 100 + 120 - 8, `${id}: 8 px off a node's corners`));
  ['f.s'].forEach(id => assert.ok(by[id].y >= f.y + 40 && by[id].y + 12 <= f.y + f.h - 16, `${id}: below a box's title`));
  assert.ok(by['f.r'].x >= f.x + 20 && by['f.r'].x + 12 <= f.x + f.w - 20);
  assert.equal(groups.dR.length, 10, 'ten ports on one side');
  // at its place in the order: the three on a's left in members order, top to bottom, spread over the side
  assert.ok(by['a.p4'].y < by['a.p5'].y && by['a.p5'].y < by['a.p6'].y);
  assert.deepEqual(groups.dR.map(p => p.id), groups.dR.slice().sort((p, q) => p.y - q.y).map(p => p.id));
});

test('portsDrawn: each port\'s line ends move 6 px onto its square\'s outer face, an inner line\'s onto its inner face; other lines kept', () => {
  const g = geometry(), out = portsDrawn(g, PORTS), E = id => out.edges.find(e => e.id === id);
  assert.deepEqual(E('e1').pts, [[226, 150], [400, 150]], 'out of a\'s right side: the outer face, 6 px right');
  assert.deepEqual(E('e2').pts[0], [226, 160]); assert.deepEqual(E('e2').pts.at(-1), [448, 168], 'its end on b, no port, kept');
  assert.deepEqual(E('e3').pts[0], [160, 226], 'out of the bottom: 6 px down');
  assert.deepEqual(E('e4').pts[0], [606, 168], 'an inner line leaves f\'s left border rightwards: the inner face');
  assert.deepEqual(E('e5').pts.at(-1), [594, 180], 'a line into f\'s port from outside: the outer face');
  assert.deepEqual(g.edges[0].pts, [[220, 150], [400, 150]], 'the layout\'s points kept');
  assert.equal(E('e1').lbl, g.edges[0].lbl);
});

test('portsDrawn: each name `name : Type` beside its port, outside its owner, clear of every line, node, port, line label and other name', () => {
  const out = portsDrawn(geometry(), PORTS), by = out.byId, own = { ...geometry().byId, f: geometry().families[0] };
  const segs = out.edges.flatMap(e => e.pts.slice(1).map((q, k) => { const p = e.pts[k]; return { id: e.id, x: Math.min(p[0], q[0]) - .5, y: Math.min(p[1], q[1]) - .5, w: Math.abs(q[0] - p[0]) + 1, h: Math.abs(q[1] - p[1]) + 1 }; }));
  const names = out.ports.map(id => by[id].nameBox);
  assert.equal(by['a.p1'].nameBox.text, 'requests : OrderApi'); assert.equal(by['a.p5'].nameBox.text, 'a forty character port name for the tests');
  out.ports.forEach((id, i) => { const b = by[id].nameBox, o = own[by[id].owner], p = by[id];
    assert.ok(b && b.w === Math.round((textW(b.text, 10) + 6) * 100) / 100 && b.h === 14, `${id}: named`);
    assert.ok(!meets(b, o), `${id}: its name outside its owner`);
    out.nodes.forEach(n => assert.ok(!meets(b, n), `${id}: its name ${JSON.stringify(b)} over ${n.id}`));
    segs.forEach(s => assert.ok(!meets(b, s), `${id}: its name ${JSON.stringify(b)} over line ${s.id}`));
    assert.ok(!meets(b, out.edges[0].lbl), `${id}: over e1's label`);
    names.slice(i + 1).forEach((c, j) => assert.ok(!meets(b, c), `${id}: its name over ${out.ports[i + 1 + j]}'s`));
    const far = Math.max(b.x - p.x - p.w, p.x - b.x - b.w, b.y - p.y - p.h, p.y - b.y - b.h); assert.ok(far <= 60, `${id}: its name ${far} px from its port`); });
  // beside its first line out: a.p1's name above e1, starting 4 px out from the square
  assert.ok(by['a.p1'].nameBox.x >= 226 + 4 - .01 && by['a.p1'].nameBox.y + 14 <= 150);
  assert.equal(portsDrawn(geometry(), [{ ...PORTS[1], label: ' ' }]).byId['a.p2'].nameBox, undefined, 'no name, none drawn');
});

/* ---- the shared rules (§10.1, §10.3) ---- */
const M = (nodes, edges, shown) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.component', nodeIds: shown || nodes.map(n => n.id) }] });
const port = id => ({ id, type: 'uml.Port', label: id });
const run = (m, view = m.views[0]) => structProblems(m, view).map(p => `${p.level} ${p.rule} ${p.path} ${p.ids.join(',')}`);
const CLEAN = () => M([{ id: 'c', type: 'uml.Component', label: 'Shop', members: [port('c1')] }, { id: 'k', type: 'uml.Class', members: [port('k1'), { id: 'op', type: 'uml.Operation' }] },
  { id: 'art', type: 'uml.Artifact' }, { id: 'spec', type: 'uml.DeploymentSpecification' }, { id: 'i', type: 'uml.Interface' }],
[{ id: 'm1', type: 'uml.Manifestation', from: 'art', to: 'c' }, { id: 'm2', type: 'uml.Manifestation', from: 'spec', to: 'c' }, { id: 'r', type: 'uml.InterfaceRealization', from: 'c1', to: 'i' }]);

test('the shared rules pass a clean model and the target examples 05 and 06, and name what they check', () => {
  assert.deepEqual(Object.keys(STRUCT_RULES), ['port-owner', 'manifest-ends']);
  assert.deepEqual(run(CLEAN()), []); assert.deepEqual(structProblems(CLEAN()), []);
  for (const f of ['05-component', '06-deployment']) { const ex = JSON.parse(readFileSync(new URL(`../docs/diagrams/examples/${f}.json`, import.meta.url)));
    assert.deepEqual(structProblems(ex), [], f); ex.views.forEach(v => assert.deepEqual(structProblems(ex, v), [], `${f} ${v.id}`)); }
});

test('port-owner: a port on an interface, a collaboration or any non-encapsulated classifier, or a port as a node, is an error; with a view, only an owner it shows', () => {
  const m = CLEAN(); m.nodes.push({ id: 'col', type: 'uml.Collaboration', label: 'Sale', members: [port('x1')] }, { id: 'lone', type: 'uml.Port', label: 'lone' });
  m.nodes[4].members = [{ id: 'op2', type: 'uml.Operation' }, port('i1')]; m.views[0].nodeIds.push('col', 'lone');
  assert.deepEqual(run(m), ['error port-owner nodes[4].members[1] i1,i', 'error port-owner nodes[5].members[0] x1,col', 'error port-owner nodes[6] lone']);
  const p = structProblems(m, m.views[0]).find(q => q.ids[0] === 'x1');
  assert.equal(p.message, 'port-owner: port x1 ("x1") is a member of collaboration col ("Sale"); a port is a member of a component or a class');
  assert.deepEqual(run(m, { ...m.views[0], nodeIds: ['c', 'k'] }), [], 'owners not shown are not checked');
  assert.equal(structProblems(m).length, 3, 'with no view, the whole model');
});

test('manifest-ends: a manifestation from anything but an artifact is an error, to anything but a component a warning', () => {
  const m = CLEAN(); m.edges.push({ id: 'bad', type: 'uml.Manifestation', from: 'c', to: 'art' }, { id: 'odd', type: 'uml.Manifestation', from: 'art', to: 'k' }, { id: 'lost', type: 'uml.Manifestation', from: 'gone', to: 'c' });
  assert.deepEqual(run(m), ['error manifest-ends edges[3] bad,c', 'warning manifest-ends edges[3] bad,art', 'warning manifest-ends edges[4] odd,k', 'error manifest-ends edges[5] lost,gone']);
  const say = structProblems(m, m.views[0]).map(p => p.message);
  assert.ok(say.includes('manifest-ends: bad runs from component c ("Shop"): a manifestation runs from an artifact'));
  assert.ok(say.includes('manifest-ends: odd runs to class k: «manifest» is drawn to a component only'));
  assert.ok(say.includes('manifest-ends: lost runs from nothing: a manifestation runs from an artifact'));
  assert.deepEqual(run(m, { ...m.views[0], nodeIds: ['i'] }), [], 'lines touching nothing shown are not checked');
});

test('the shapes and helpers ship in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ['function portsDrawn(', 'function portSides(', 'SHAPE.ball = {', 'function structProblems(']) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});
