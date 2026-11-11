// Notation (1.5) with no browser: what shapes report (size(), ports()), the classifier's rows, the line ends and the end
// labels, drawn from hand-built geometry of the kind svgOf takes. tests/notation.html checks the same drawing in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE, SHAPE_NAMES } from '../src/draw/shapes.js';
import { endLabels } from '../src/draw/lines.js';
import { svgOf } from '../src/draw/svg.js';
import { mapNodeW } from '../src/map/cards.js';

const prop = (label, props = {}) => ({ type: 'uml.Property', label, props: { visibility: 'public', ...props } });
const op = (label, props = {}) => ({ type: 'uml.Operation', label, props: { visibility: 'public', ...props } });
const order = (more = {}) => ({ id: 'order', shape: 'classifier', type: 'uml.Class', label: 'Order', k: 'backend', stereotypes: ['entity'],
  compartments: [{ name: 'attributes', members: [prop('total', { valueType: 'Money', multiplicity: '1' }), prop('count', { valueType: 'Integer', isDerived: true, isStatic: true })] },
    { name: 'operations', members: [op('place', { parameters: [{ name: 'at', valueType: 'Date' }], returnType: 'Order' })] }], ...more });
const placed = n => ({ ...n, x: 0, y: 0, ...SHAPE.classifier.size(n) });
const geo = (nodes, edges = []) => ({ nodes, edges, groups: [], bounds: { x: -50, y: -50, w: 800, h: 600 }, byId: Object.fromEntries(nodes.map(n => [n.id, n])) });

test('size(): a classifier is as tall as its head and its compartments, as wide as its widest row, within its cap', () => {
  const s = SHAPE.classifier.size(order());
  // head: 5 + one stereotype (14) + the name (18) + 5; attributes: 8 + 2 rows of 15; operations: 8 + 1 row
  assert.deepEqual(s, { w: Math.ceil('+ place(at: Date): Order'.length * 11 * .6 + 16), h: 42 + 38 + 23 });
  assert.equal(SHAPE.classifier.size(order({ collapsed: ['operations'] })).h, 42 + 38, 'a collapsed compartment takes no room, divider and all');
  assert.equal(SHAPE.classifier.size(order({ rows: 1 })).h, 42 + 38 + 23, 'rows: 1 shows one row and "+1 more"');
  assert.equal(SHAPE.classifier.size(order({ rows: 0 })).h, 42 + 23 + 23, 'rows: 0 shows only "+k more"');
  assert.equal(SHAPE.classifier.size({ ...order(), compartments: [{ name: 'attributes', members: [] }] }).h, 42 + 10, 'an empty compartment is drawn empty');
  assert.equal(SHAPE.classifier.size({ label: 'A' }).w, 96, 'at least 96 wide');
  assert.equal(SHAPE.classifier.size({ label: 'x'.repeat(200) }).w, 320, 'at most 320 wide');
});

test('size(): every map shape reports the box layout gives a card, and keeps the 13 shapes', () => {
  assert.equal(SHAPE_NAMES.length, 13);
  assert.ok(!SHAPE_NAMES.includes('classifier'), 'a map never draws a classifier');
  const n = { label: 'Orders service', kind: 'backend' };
  for (const sh of SHAPE_NAMES) assert.deepEqual(SHAPE[sh].size(n), { w: mapNodeW(n), h: 64 }, sh);
});

test('ports(): k line ends spread along a side, on the outline', () => {
  const n = { x: 10, y: 20, w: 120, h: 90 };
  assert.deepEqual(SHAPE.classifier.ports(n, 'L', 2), [[10, 50], [10, 80]]);
  assert.deepEqual(SHAPE.classifier.ports(n, 'B'), [[70, 110]]);
  assert.deepEqual(SHAPE.box.ports(n, 'T', 3), [[40, 20], [70, 20], [100, 20]]);
  const c = { x: 0, y: 0, w: 100, h: 64 }, ry = SHAPE.cylinder.ry(c);
  assert.deepEqual(SHAPE.cylinder.ports(c, 'T', 3)[0], [25, Math.round(ry * (1 - Math.sqrt(.75)) * 100) / 100], "a cylinder's port is on its lid's curve, as its inset says");
  for (const sh of SHAPE_NAMES) for (const side of ['L', 'R', 'T', 'B']) {
    const p = SHAPE[sh].ports(c, side, 3); assert.equal(p.length, 3, sh + side);
    p.forEach(([x, y]) => assert.ok(x >= c.x - .01 && x <= c.x + c.w + .01 && y >= c.y - .01 && y <= c.y + c.h + .01, `${sh} ${side}: ${x},${y} in its box`)); }
});

test('the classifier draws its rows in UML form, escapes every string, and names itself', () => {
  const n = placed(order({ label: 'Order<script>', stereotypes: ['a&b'] }));
  const svg = svgOf(geo([n]));
  assert.match(svg, /&lt;&lt;|«a&amp;b»/);
  assert.ok(!svg.includes('<script>'), 'the label is escaped');
  assert.match(svg, />\+ total: Money \[1\]</);
  assert.match(svg, /text-decoration="underline"[^>]*>\+ \/count: Integer</, 'a static member is underlined, a derived one has "/"');
  assert.match(svg, />\+ place\(at: Date\): Order</);
  assert.match(svg, /aria-label="Class Order&lt;script&gt;, 2 attributes, 1 operation"/);
  const abs = svgOf(geo([placed(order({ abstract: true, rows: 1, collapsed: ['operations'] }))]));
  assert.match(abs, /class="c-name"[^>]*style="font:italic 600/, 'an abstract name is in italics');
  assert.match(abs, />\+1 more</);
  assert.ok(!abs.includes('data-comp="operations"'), 'a collapsed compartment is not drawn');
  assert.match(svgOf(geo([{ ...placed(order()), label: 'x'.repeat(200) }])), />x+…</, 'a name too long is cut');
});

test('line ends: a table of markers, used only by a line that asks; end labels in boxes by each end', () => {
  const a = placed(order()), b = { ...placed(order({ id: 'line', label: 'Line' })), id: 'line', x: 400 };
  const pts = [[a.x + a.w, 40], [400, 40]];
  const plain = svgOf(geo([a, b], [{ from: 'order', to: 'line', s: a, t: b, pts }]));
  assert.ok(!/-(triangle|diamond|open)-/.test(plain), 'a line without e.end draws as before');
  const e = { from: 'order', to: 'line', s: a, t: b, pts, end: { from: 'filled-diamond', to: 'triangle', dashed: true, labels: { from: { role: 'order', mult: '1' }, to: { role: 'lines', mult: '1..*' } } } };
  const svg = svgOf(geo([a, b], [e]));
  assert.match(svg, /marker-end="url\(#g\d+-triangle-d\)"/);
  assert.match(svg, /marker-start="url\(#g\d+-filled-diamond-d\)"/);
  assert.match(svg, /id="g\d+-triangle-d"[^>]*refX="13"[^>]*><path d="M0 0L13 7L0 14Z" fill="var\(--um-stage-bg\)"/, 'a hollow end is the stage\'s background');
  assert.match(svg, /id="g\d+-filled-diamond-d"[^>]*><path [^>]*fill="var\(--um-arrow\)"/, 'a filled end is the line\'s colour');
  assert.match(svg, /class="edge"[^>]*stroke-dasharray="6 4"/);
  const boxes = endLabels(e);
  assert.deepEqual(boxes.map(x => [x.end, x.kind, x.text]), [['from', 'role', 'order'], ['from', 'mult', '1'], ['to', 'role', 'lines'], ['to', 'mult', '1..*']]);
  const [r, m] = boxes;
  assert.ok(r.x === pts[0][0] + 4 && r.y + r.h <= 40 - 8 && m.y >= 40 + 8, 'by the end, above and below the line');
  assert.ok(boxes.slice(2).every(x => x.x + x.w === 400 - 4), 'at the far end, right-aligned 4 px from the outline');
  const down = endLabels({ end: { labels: { to: { role: 'r', mult: 'm' } } } }, [[0, 0], [0, 100]]);
  assert.ok(down[0].x + down[0].w === -8 && down[1].x === 8 && down[0].y + down[0].h === 96, 'a line up or down: role left, multiplicity right');
  assert.ok(svg.includes('class="end-lab"') && (svg.match(/class="end-lab"/g) || []).length === 4);
});
