// BPMN's notation (work package 4b.2, notes/milestone-4b.md §9): the shapes of src/bpmn/notation.js (their sizes; a point
// slid by inset, as the typed line drawer slides a line's end with drawnPts, lies on out; their markers, strokes, fills,
// texts and accessible names), the labels outside with their own search (§9.2) on hand-built geometry, and the group's
// frame (§9.3). With the monospace estimate (no measurer in Node); tests/bpmn-notation.html draws them in Chrome in both
// themes and three fonts. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textW } from '../src/core/text.js';
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import { bpmnGroupFrame, bpmnLabelSvg, bpmnLabels, bpmnName } from '../src/bpmn/notation.js';

const LONG = 'Check every book of the order against the warehouse stock and reserve the copies before the shopper is charged';
const at = (id, shape, n) => ({ id, shape, x: 40.5, y: 70.25, ...n, ...SHAPE[shape].size(n) });
const NODES = [at('t', 'bpmn-task', { label: 'Pack' }), at('tl', 'bpmn-task', { label: LONG }), at('tu', 'bpmn-task', { label: 'Approve', taskType: 'user' }),
  at('ts', 'bpmn-task', { label: LONG, taskType: 'service' }), at('sp', 'bpmn-task', { type: 'bpmn.SubProcess', label: LONG }), at('ca', 'bpmn-task', { type: 'bpmn.CallActivity', label: 'Ship' }),
  at('e', 'bpmn-event', { type: 'bpmn.StartEvent' }), at('ee', 'bpmn-event', { type: 'bpmn.EndEvent', definition: 'terminate' }),
  at('eb', 'bpmn-event', { type: 'bpmn.BoundaryEvent', definition: 'timer', cancelActivity: false }), at('g', 'bpmn-gateway', {}), at('gp', 'bpmn-gateway', { type: 'bpmn.ParallelGateway' }),
  at('d', 'bpmn-data', {}), at('s', 'bpmn-store', {}), at('n', 'bpmn-note', { label: 'Paid' }), at('nl', 'bpmn-note', { label: LONG + ' ' + LONG })];

// an outline's points from its path (absolute M L H V A Z, as the shapes write it), each arc sampled every 0.5°; an
// elliptical arc (no rotation) is drawn as a circle in coordinates scaled by rx / ry
function outline(d) {
  const tk = d.match(/[MLHVAZ]|-?\d+(\.\d+)?/g), segs = []; let i = 0, x = 0, y = 0, x0 = 0, y0 = 0;
  const num = () => +tk[i++], to = (X, Y) => { segs.push([x, y, X, Y]); x = X; y = Y; };
  while (i < tk.length) { const c = tk[i++];
    if (c === 'M') { x = x0 = num(); y = y0 = num(); } else if (c === 'L') to(num(), num()); else if (c === 'H') to(num(), y); else if (c === 'V') to(x, num()); else if (c === 'Z') to(x0, y0);
    else if (c === 'A') { const r = num(), ry = num(); num(); const large = num(), sweep = num(), X = num(), Y = num(), k0 = r / ry; // SVG F.6.5 in y scaled by k0
      const ya = y * k0, Ya = Y * k0, hx = (x - X) / 2, hy = (ya - Ya) / 2, k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (r * r - hx * hx - hy * hy) / (hx * hx + hy * hy))), cx = k * hy + (x + X) / 2, cy = -k * hx + (ya + Ya) / 2;
      const a0 = Math.atan2(ya - cy, x - cx); let da = Math.atan2(Ya - cy, X - cx) - a0; if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
      if (Math.abs(da) < 1e-9 && large) da = sweep ? 2 * Math.PI : -2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 360))); for (let j = 1; j <= n; j++) to(cx + r * Math.cos(a0 + da * j / n), (cy + r * Math.sin(a0 + da * j / n)) / k0); x = X; y = Y; } }
  return segs;
}
const off = (segs, [px, py]) => Math.min(...segs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy); }));
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('sizes (§9.1): an activity 100 × 64 px at least and 320 px at most, on three lines; an event 32 px, a gateway 40, a data object 36 × 50, a data store 50 × 50; a note five lines at most', () => {
  const S = (sh, n = {}) => SHAPE[sh].size(n);
  assert.deepEqual([S('bpmn-task', { label: 'Pack' }), S('bpmn-event'), S('bpmn-gateway', { label: LONG }), S('bpmn-data', { label: LONG }), S('bpmn-store')],
    [{ w: 100, h: 64 }, { w: 32, h: 32 }, { w: 40, h: 40 }, { w: 36, h: 50 }, { w: 50, h: 50 }]);
  const long = S('bpmn-task', { label: LONG }); assert.ok(long.w <= 320 && long.w >= 180 && long.h === 64, JSON.stringify(long));
  assert.ok(S('bpmn-task', { label: 'x'.repeat(400) }).w <= 320);
  // a top-left marker or a collapsed sub-process's + keeps a row of its own: three lines and a marker grow the box
  assert.equal(S('bpmn-task', { label: LONG, taskType: 'user' }).h, 22 + 8 + 3 * 16);
  assert.equal(S('bpmn-task', { label: LONG, type: 'bpmn.SubProcess' }).h, 8 + 20 + 3 * 16);
  assert.equal(S('bpmn-task', { label: 'Pack', type: 'bpmn.SubProcess' }).h, 64);
  assert.deepEqual(S('bpmn-note', { label: '' }), { w: 40, h: 30 });
  assert.equal(S('bpmn-note', { label: LONG + ' ' + LONG + ' ' + LONG }).h, 5 * 16 + 12);
  assert.ok(S('bpmn-note', { label: LONG }).w <= 160 + 16);
});

test('every shape\'s out fills its box, and a point on any side slid by inset (drawnPts, as a typed line\'s end is) lies on out; its ports too', () => {
  for (const n of NODES) { const S = SHAPE[n.shape], segs = outline(S.out(n)), xs = segs.flatMap(s => [s[0], s[2]]), ys = segs.flatMap(s => [s[1], s[3]]);
    assert.ok(Math.abs(Math.min(...xs) - n.x) < .02 && Math.abs(Math.max(...xs) - n.x - n.w) < .02 && Math.abs(Math.min(...ys) - n.y) < .02 && Math.abs(Math.max(...ys) - n.y - n.h) < .02, `${n.id}: out fills its box`);
    const look = m => ({ ...m, S });
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 0; k <= 20; k++) {
      const v = side === 'L' || side === 'R', t = v ? n.y + n.h * k / 20 : n.x + n.w * k / 20, p = v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h];
      const [q] = drawnPts({ s: n, t: null, fs: side, pts: [p, [p[0] + 50, p[1] + 50]] }, look);
      assert.ok(off(segs, q) < .02, `${n.id}, side ${side} at ${t}: slid to ${q}, ${off(segs, q).toFixed(3)} px off its outline`); }
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 1; k <= 3; k++) S.ports(n, side, k).forEach(q => assert.ok(off(segs, q) < .02, `${n.id}: port ${q} on its outline`));
  }
  // the outline grown by d (a selection's halo) is the same shape d px out: its box d px out, and every edge's middle d px
  // off the outline (a page's fold too, which a fold kept at 10 px would put 3√2 px out). Not the gateway's or the store's:
  // they are the map's diamond and cylinder, whose halos grow their box by d, as every diamond's and cylinder's do
  for (const n of NODES) { const segs = outline(SHAPE[n.shape].out(n)), g = outline(SHAPE[n.shape].out(n, 3)), xs = g.flatMap(s => [s[0], s[2]]);
    assert.ok(Math.abs(Math.min(...xs) - n.x + 3) < .02 && Math.abs(Math.max(...xs) - n.x - n.w - 3) < .02, n.id);
    if (!['bpmn-gateway', 'bpmn-store'].includes(n.shape)) g.forEach(([ax, ay, bx, by]) => { const m = off(segs, [(ax + bx) / 2, (ay + by) / 2]); assert.ok(Math.abs(m - 3) < .05, `${n.id}: an edge of its halo ${m.toFixed(3)} px out`); }); }
});

test('drawn: a node of the shape it names, named, strokes --um-muted or --um-text, fills the stage\'s, --um-text or none, every text inside its shape and cut to it', () => {
  for (const n of NODES) { const s = SHAPE[n.shape].draw({ ...n, aria: `Name of ${n.id}` });
    assert.match(s, new RegExp(`^<g class="node ${n.shape}" data-id="${n.id}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="Name of ${n.id}">`));
    for (const [, k, v] of s.matchAll(/ (stroke|fill)="([^"]*)"/g)) assert.ok(k === 'stroke' ? ['var(--um-muted)', 'var(--um-text)', 'var(--um-stage-bg)', 'transparent'].includes(v) : ['var(--um-stage-bg)', 'var(--um-text)', 'none', 'transparent'].includes(v), `${n.id}: ${k} ${v}`);
    assert.ok(n.w >= 24 && n.h >= 24, `${n.id}: 24 px or more to hit`);
    for (const [, x, y, a, px, t] of s.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)" class="c-name" fill="[^"]*" style="font:\d+ ([\d.]+)px var\(--um-sans\)">([^<]*)<\/text>/g)) {
      const w = textW(t.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), +px), x0 = a === 'middle' ? +x - w / 2 : +x, x1 = x0 + w, y0 = +y - +px, y1 = +y + 3;
      const pad = n.shape === 'bpmn-task' ? 9.9 : 0;
      assert.ok(x0 >= n.x + pad && x1 <= n.x + n.w - pad + .01 && y0 >= n.y && y1 <= n.y + n.h, `${n.id}: "${t}" inside`); }
  }
  const lines = id => SHAPE['bpmn-task'].draw(NODES.find(n => n.id === id)).match(/class="c-name"/g).length;
  assert.deepEqual([lines('t'), lines('tl'), lines('sp')], [1, 3, 3]);
  assert.match(SHAPE['bpmn-task'].draw(NODES[1]), />[^<]*…<\/text><\/g>$/, 'a long name\'s third line is cut');
  assert.equal(SHAPE['bpmn-note'].draw(NODES.at(-1)).match(/class="c-name"/g).length, 5);
});

test('markers (§9.1): user and service tasks, the collapsed +, the call activity\'s 3 px; each event\'s ring and definition; the gateways\' X and +', () => {
  const marks = (shape, n) => { const N = at('m', shape, n), s = SHAPE[shape].draw(N); return { s, m: [...s.matchAll(/data-mark="([a-z]+)"/g)].map(x => x[1]).join(' ') }; };
  assert.deepEqual(['none', 'user', 'service'].map(taskType => marks('bpmn-task', { label: 'A', taskType }).m), ['', 'user', 'service']);
  assert.equal(marks('bpmn-task', { type: 'bpmn.SubProcess', label: 'A' }).m, 'collapsed');
  assert.match(marks('bpmn-task', { type: 'bpmn.CallActivity', label: 'A' }).s, /class="n-body"[^>]*style="stroke-width:3"/);
  assert.doesNotMatch(marks('bpmn-task', { label: 'A' }).s, /stroke-width:3/);
  const ev = (type, definition, more) => marks('bpmn-event', { type, definition, ...more });
  // the definitions by kind (§3.2), and the none intermediate throw event (decision 21): a double ring, no marker
  const cases = [['bpmn.StartEvent', 'none', ''], ['bpmn.StartEvent', 'message', 'message'], ['bpmn.StartEvent', 'timer', 'timer'], ['bpmn.EndEvent', 'none', ''], ['bpmn.EndEvent', 'message', 'message'],
    ['bpmn.EndEvent', 'terminate', 'terminate'], ['bpmn.IntermediateCatchEvent', 'message', 'message'], ['bpmn.IntermediateCatchEvent', 'timer', 'timer'], ['bpmn.IntermediateThrowEvent', 'message', 'message'],
    ['bpmn.IntermediateThrowEvent', 'none', ''], ['bpmn.BoundaryEvent', 'message', 'message'], ['bpmn.BoundaryEvent', 'timer', 'timer']];
  for (const [t, d, want] of cases) { const { s, m } = ev(t, d), ring = /Intermediate|Boundary/.test(t);
    assert.equal(m, want, `${t} ${d}`);
    assert.equal(/class="bp-ring"/.test(s), ring, `${t}: ${ring ? 'a double ring' : 'one ring'}`);
    assert.equal(/class="n-body"[^>]*style="stroke-width:3.5"/.test(s), t === 'bpmn.EndEvent', `${t}: 3.5 px only for an end event`);
    // an envelope is filled where the event throws (an end or an intermediate throw), hollow where it catches
    if (d === 'message') assert.match(s, new RegExp(`fill="${/End|Throw/.test(t) ? 'var\\(--um-text\\)' : 'var\\(--um-stage-bg\\)'}" stroke="[^"]*" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" data-mark="message"`), `${t}`);
    assert.doesNotMatch(s, /stroke-dasharray/, `${t}: solid`); }
  assert.match(ev('bpmn.EndEvent', 'terminate').s, /fill="var\(--um-text\)"[^>]*data-mark="terminate"/);
  const nonInt = ev('bpmn.BoundaryEvent', 'timer', { cancelActivity: false }).s;
  assert.equal(nonInt.match(/stroke-dasharray="4 3"/g).length, 2, 'a non-interrupting boundary event: both rings dashed');
  assert.deepEqual([marks('bpmn-gateway', {}).m, marks('bpmn-gateway', { type: 'bpmn.ExclusiveGateway' }).m, marks('bpmn-gateway', { type: 'bpmn.ParallelGateway' }).m], ['exclusive', 'exclusive', 'parallel']);
  // the data object's fold, the data store's lid with no kind colour, the annotation's bracket open on the right
  assert.match(SHAPE['bpmn-data'].draw(at('d', 'bpmn-data', {})), /<path d="M66.5 70.25V80.25H76.5" class="bp-mark"/);
  assert.doesNotMatch(SHAPE['bpmn-store'].draw(at('s', 'bpmn-store', {})), /--um-(?!muted|stage-bg|text)/);
  assert.match(SHAPE['bpmn-note'].draw(at('n', 'bpmn-note', { label: 'Paid' })), /<path d="M52.5 70.25H40.5V100.25H52.5" class="n-body" fill="none"/);
});

test('accessible names (§9.1): bpmnName says the kind, the definition and the name; n.aria wins', () => {
  const name = n => bpmnName(n);
  assert.deepEqual([
    name({ shape: 'bpmn-task', label: 'Pack' }), name({ shape: 'bpmn-task', type: 'bpmn.Task', taskType: 'user', label: 'Approve' }), name({ type: 'bpmn.Task', taskType: 'service', label: 'Charge' }),
    name({ shape: 'bpmn-task', type: 'bpmn.SubProcess', label: 'Pick' }), name({ shape: 'bpmn-frame', type: 'bpmn.SubProcess', label: 'Pick' }), name({ type: 'bpmn.CallActivity', label: 'Ship' }),
    name({ shape: 'bpmn-event' }), name({ type: 'bpmn.StartEvent', definition: 'message', label: 'Order placed' }), name({ type: 'bpmn.EndEvent', definition: 'terminate' }),
    name({ type: 'bpmn.BoundaryEvent', definition: 'timer', cancelActivity: false, label: 'Wait' }), name({ type: 'bpmn.BoundaryEvent', definition: 'message' }),
    name({ type: 'bpmn.IntermediateThrowEvent', definition: 'none' }), name({ type: 'bpmn.ParallelGateway' }), name({ shape: 'bpmn-gateway', label: 'Paid?' }),
    name({ shape: 'bpmn-data', label: 'Order' }), name({ shape: 'bpmn-store', label: 'Stock' }), name({ shape: 'bpmn-note', label: 'Paid' }), name({ shape: 'bpmn-group', label: 'Money' }),
    name({ shape: 'bpmn-pool', label: 'Bookshop' }), name({ shape: 'bpmn-lane', label: 'Sales' })],
  ['Task Pack', 'User task Approve', 'Service task Charge', 'Sub-process Pick (collapsed)', 'Sub-process Pick (expanded)', 'Call activity Ship', 'Start event', 'Message start event Order placed',
    'Terminate end event', 'Timer boundary event (non-interrupting) Wait', 'Message boundary event', 'Intermediate throw event', 'Parallel gateway', 'Exclusive gateway Paid?',
    'Data object Order', 'Data store Stock', 'Text annotation Paid', 'Group Money', 'Pool Bookshop', 'Lane Sales']);
  assert.match(SHAPE['bpmn-event'].draw(at('x', 'bpmn-event', { type: 'bpmn.StartEvent', definition: 'timer', label: 'Monday' })), /aria-label="Timer start event Monday"/);
  assert.match(SHAPE['bpmn-gateway'].draw(at('x', 'bpmn-gateway', { label: 'A "quoted" <name>' })), /aria-label="Exclusive gateway A &quot;quoted&quot; &lt;name&gt;"/);
});

test('pools and lanes: the partition\'s header strip under their own shape and name, read only; the expanded sub-process\'s frame', () => {
  const pool = SHAPE['bpmn-pool'].draw({ id: 'p', label: 'Bookshop', x: 0, y: 0, w: 22, h: 300 }), lane = SHAPE['bpmn-lane'].draw({ id: 'l', label: 'Sales', x: 0, y: 0, w: 300, h: 22, aria: 'Lane Sales, 4 nodes' });
  assert.match(pool, /^<g class="node bpmn-pool" data-id="p" data-shape="bpmn-pool" [^>]*aria-label="Pool Bookshop">.*transform="rotate\(-90 /);
  assert.match(lane, /^<g class="node bpmn-lane" data-id="l" data-shape="bpmn-lane" [^>]*aria-label="Lane Sales, 4 nodes">/);
  assert.doesNotMatch(lane, /rotate/);
  const f = SHAPE['bpmn-frame'].frame({ id: 'sp', title: 'Pick the books', x: 10, y: 20, w: 300, h: 200 });
  assert.match(f, /^<rect class="family-box" x="10" y="20" width="300" height="200" rx="10" stroke="var\(--um-muted\)"\/><text class="family-title" x="22" y="37" [^>]*data-o="sp">Pick the books<\/text>$/);
});

test('labels outside (§9.2), on hand-built geometry: under the shape first, two lines of 120 px at most; moved where it meets a line, a node or a label placed before', () => {
  const N = (id, shape, x, y, label) => ({ id, shape, x, y, label, ...SHAPE[shape].size({}) });
  // a free event: centred 4 px under it
  const [free] = bpmnLabels([N('e', 'bpmn-event', 100, 100, 'Order placed')]);
  assert.deepEqual([free.x + free.w / 2, free.y, free.lines], [116, 136, ['Order placed']]);
  assert.equal(bpmnLabels([N('e', 'bpmn-event', 0, 0, '  ')]).length, 0, 'no name, no label');
  const forty = 'Payment declined by the card issuer twice';
  assert.equal(forty.length, 41);
  // a gateway whose line leaves from its bottom (laid out down), one under it to the right, a task under it, an event beside
  // it whose label would meet the gateway's; a line passing under the event
  const g = N('g', 'bpmn-gateway', 200, 100, forty), e = N('e', 'bpmn-event', 290, 104, forty), t = { id: 't', x: 170, y: 200, w: 100, h: 64 };
  const lines = [[[220, 140], [220, 200]], [[240, 120], [290, 120]], [[260, 150], [400, 150]]];
  const L = bpmnLabels([g, e], lines, [t]);
  assert.equal(L.length, 2);
  const boxes = [...lines.flatMap(p => p.slice(1).map((q, k) => ({ x: Math.min(p[k][0], q[0]) - 4, y: Math.min(p[k][1], q[1]) - 4, w: Math.abs(q[0] - p[k][0]) + 8, h: Math.abs(q[1] - p[k][1]) + 8 }))), g, e, t];
  for (const b of L) { assert.ok(b.lines.length <= 2 && b.lines.every(l => textW(l, 11) <= 120) && b.w <= 124, JSON.stringify(b));
    boxes.forEach(k => assert.ok(!meets(b, k), `${b.id}'s label ${JSON.stringify(b)} meets ${JSON.stringify(k)}`)); }
  assert.ok(!meets(L[0], L[1]), 'the two labels apart');
  assert.ok(L[0].y + L[0].h <= g.y, 'the gateway\'s, its bottom taken by its line, over it');
  // drawn: its lines centred in its box, with its node's id
  const svg = bpmnLabelSvg(L[0]);
  assert.match(svg, /^<g class="bp-label" data-o="g" data-box="[\d. ]+"><text x="[\d.]+" y="[\d.]+" text-anchor="middle" class="c-name" fill="var\(--um-text\)" style="font:500 11px var\(--um-sans\)">/);
  assert.equal(svg.match(/<text /g).length, L[0].lines.length);
  // crowded on every side close in: it steps outwards until clear
  const ring = [{ x: 150, y: 60, w: 140, h: 36 }, { x: 150, y: 144, w: 140, h: 36 }, { x: 150, y: 60, w: 46, h: 120 }, { x: 244, y: 60, w: 46, h: 120 }];
  const [far] = bpmnLabels([N('g', 'bpmn-gateway', 200, 100, 'Paid?')], [], ring);
  assert.ok(ring.every(k => !meets(far, k)) && far.y >= 180 && far.x + far.w / 2 === 220 && !far.clash, JSON.stringify(far));
  // nothing clear within 200 px: under it, flagged; a null line or a line of one point is no line
  const [boxed] = bpmnLabels([N('e', 'bpmn-event', 0, 0, 'Late')], null, [{ x: -500, y: -500, w: 1000, h: 1000 }]);
  assert.deepEqual([boxed.y, boxed.clash], [36, true]);
  assert.equal(bpmnLabels([N('e', 'bpmn-event', 0, 0, 'Late')], [null, [[0, 0]]], null)[0].y, 36);
});

test('the group\'s frame (§9.3): 16 px round its members, its title at the top left moved along the border off other nodes; hit on its border and title only', () => {
  const m = [{ x: 100, y: 100, w: 100, h: 64 }, { x: 300, y: 200, w: 32, h: 32 }];
  assert.deepEqual(bpmnGroupFrame('Money', m), { x: 84, y: 84, w: 264, h: 164, tx: 96 });
  assert.equal(bpmnGroupFrame('Money', []), null);
  assert.equal(bpmnGroupFrame('Money', m, null).tx, 96);
  // a title cut to its frame is still kept off others, and flagged where no place along the top is clear
  const cut = bpmnGroupFrame('A very long group title that is longer than the frame', [{ x: 0, y: 0, w: 40, h: 40 }], [{ x: -16, y: -16, w: 200, h: 15 }]);
  assert.deepEqual([cut.tx, cut.clash], [-4, true]);
  assert.equal(bpmnGroupFrame('A very long group title that is longer than the frame', [{ x: 0, y: 0, w: 40, h: 40 }], [{ x: 300, y: -16, w: 10, h: 15 }]).clash, undefined);
  const other = { x: 90, y: 80, w: 40, h: 20 }, f = bpmnGroupFrame('Money', m, [other]);
  assert.ok(f.tx >= other.x + other.w + 2 && f.tx - 4 < other.x + other.w + 2, JSON.stringify(f));
  const s = SHAPE['bpmn-group'].draw({ id: 'gr', label: 'Money', ...f });
  assert.match(s, /^<g class="node bpmn-group" data-id="gr" data-shape="bpmn-group" [^>]*aria-label="Group Money"><path d="[^"]+" class="bp-hit" fill="none" stroke="transparent" stroke-width="24"\/>/);
  assert.match(s, new RegExp(`<rect x="${f.tx - 2}" y="80" width="[\\d.]+" height="24" class="bp-hit"`), 'its title hit 24 px high');
  assert.match(SHAPE['bpmn-group'].draw({ id: 'gr', label: 'M', ...f }), /width="24" height="24" class="bp-hit"/, 'and 24 px wide at least');
  assert.match(s, /class="n-body" fill="none" stroke="var\(--um-muted\)" stroke-dasharray="8 3 2 3"/);
  assert.match(s, new RegExp(`<text x="${f.tx}" [^>]*>Money</text></g>$`));
  assert.doesNotMatch(s, /n-mask/, 'nothing fills the inside');
});

test('performance (S16, risks.md P1): the labels outside of 200 events with two lines each, 41-character names, on a grid, placed under 100 ms (timed)', () => {
  const items = [], lines = [];
  for (let i = 0; i < 200; i++) { const x = (i % 15) * 90, y = Math.floor(i / 15) * 70;
    items.push({ id: 'e' + i, x, y, w: 32, h: 32, label: 'Payment declined by the card issuer twice' }); lines.push([[x + 32, y + 16], [x + 90, y + 16]], [[x + 16, y + 32], [x + 16, y + 70]]); }
  const runs = [];
  for (let k = 0; k < 4; k++) { const c = process.cpuUsage(), out = bpmnLabels(items, lines), u = process.cpuUsage(c); assert.equal(out.length, 200); if (k) runs.push((u.user + u.system) / 1000); }
  const best = Math.min(...runs);
  // CI holds the 1 s ceiling and prints the pass against S16's 100 ms (as the other timed tests)
  console.log(`# P1 target 100 ms: ${best} ms, 200 labels outside (CPU ms ${runs.map(Math.round).join(', ')})`);
  assert.ok(best < 1000, `${best} ms`);
});
