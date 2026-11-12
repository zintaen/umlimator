// Control nodes, actions and flows (work package 4.2, notes/stage-4.md §4.1, §7.3, §9.3): the six shapes of src/uml/flow.js
// (their sizes; a point slid by inset, as the typed line drawer slides a line's end with drawnPts, lies on out; their hit
// areas, colours and names), the shared flow rules with a passing and a failing case each at S21's levels, and a flow's
// label. With the monospace estimate (no measurer in Node); tests/flow.html draws the shapes in Chrome in both themes and
// three fonts. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textW } from '../src/core/text.js';
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import { FLOW_CONTROL, FLOW_RULES, flowProblems, flowText, flowWrap, parseFlow, printFlow } from '../src/uml/flow.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const LONG = 'Take the next order from the queue and check every book against the warehouse stock before it is packed for the carrier';
// each shape on nodes of the sizes it gives, placed off the origin
const at = (shape, n) => ({ id: `${shape}-${JSON.stringify(n).length}`, shape, x: 40.5, y: 70.25, ...n, ...SHAPE[shape].size(n) });
const NODES = [at('initial', {}), at('final', {}), at('flow-final', {}), at('diamond', {}), at('diamond', { label: 'In stock?' }), at('diamond', { label: 'All books in stock for this order?' }),
  at('diamond', { label: LONG }), at('bar', {}), at('bar', { down: true }), at('bar', { busy: 5 }), at('bar', { busy: 7, down: true }),
  at('rounded', { label: 'Pack' }), at('rounded', { label: LONG }), at('rounded', { label: 'Charge the card', stereotypes: ['external', 'payment'] })];

// an outline's points from its path (absolute M L H V A Z, as the shapes write it), each arc sampled every 0.5°
function outline(d) {
  const tk = d.match(/[MLHVAZ]|-?\d+(\.\d+)?/g), segs = []; let i = 0, x = 0, y = 0, x0 = 0, y0 = 0;
  const num = () => +tk[i++], to = (X, Y) => { segs.push([x, y, X, Y]); x = X; y = Y; };
  while (i < tk.length) { const c = tk[i++];
    if (c === 'M') { x = x0 = num(); y = y0 = num(); } else if (c === 'L') to(num(), num()); else if (c === 'H') to(num(), y); else if (c === 'V') to(x, num()); else if (c === 'Z') to(x0, y0);
    else if (c === 'A') { const r = num(); num(); num(); const large = num(), sweep = num(), X = num(), Y = num(); // circular arcs only (SVG F.6.5)
      const hx = (x - X) / 2, hy = (y - Y) / 2, k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (r * r - hx * hx - hy * hy) / (hx * hx + hy * hy))), cx = k * hy + (x + X) / 2, cy = -k * hx + (y + Y) / 2;
      const a0 = Math.atan2(y - cy, x - cx); let da = Math.atan2(Y - cy, X - cx) - a0; if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
      if (Math.abs(da) < 1e-9 && large) da = sweep ? 2 * Math.PI : -2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 360))); for (let j = 1; j <= n; j++) to(cx + r * Math.cos(a0 + da * j / n), cy + r * Math.sin(a0 + da * j / n)); x = X; y = Y; } }
  return segs;
}
const off = (segs, [px, py]) => Math.min(...segs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy); }));

test('sizes (§4.1): circles 20 and 22 px, a bare diamond 28 px, a bar max(48, 16 × (busy + 1)) across the flow, a rounded box 96 to 320 px', () => {
  const S = (sh, n = {}) => SHAPE[sh].size(n);
  assert.deepEqual([S('initial'), S('final'), S('flow-final'), S('diamond'), S('diamond', { label: '  ' })], [{ w: 20, h: 20 }, { w: 22, h: 22 }, { w: 22, h: 22 }, { w: 28, h: 28 }, { w: 28, h: 28 }]);
  assert.deepEqual([S('bar'), S('bar', { down: true }), S('bar', { busy: 2 }), S('bar', { busy: 5, down: true })], [{ w: 6, h: 48 }, { w: 48, h: 6 }, { w: 6, h: 48 }, { w: 96, h: 6 }]);
  assert.deepEqual(S('rounded', { label: 'Pack' }), { w: 96, h: 36 });
  const long = S('rounded', { label: LONG }); assert.ok(long.w <= 320 && long.w >= 180 && long.h === 2 * 8 + 3 * 16, JSON.stringify(long));
  assert.ok(S('rounded', { label: 'x'.repeat(300) }).w <= 320);
  assert.equal(S('rounded', { label: 'Pack', stereotypes: ['a', 'b'] }).h, 2 * 8 + 2 * 14 + 16);
  // a diamond with text: one line up to 80 px, else two, each at most 160 px; the text's box fits inside it
  for (const label of ['In stock?', 'All books in stock for this order?', LONG]) { const s = S('diamond', { label }), w2 = SHAPE.diamond.size({ label: label + ' and more words here' });
    assert.ok(s.w > 28 && s.h >= 28 && w2.w <= 2 * 160 + 12, label); }
  assert.equal(S('diamond', { label: 'In stock?' }).h, 32);
  assert.equal(S('diamond', { label: 'All books in stock for this order?' }).h, 60);
});

test('every shape\'s out fills its box, and a point on any side slid by inset (drawnPts, as a typed line\'s end is) lies on out', () => {
  for (const n of NODES) { const S = SHAPE[n.shape], segs = outline(S.out(n)), xs = segs.flatMap(s => [s[0], s[2]]), ys = segs.flatMap(s => [s[1], s[3]]);
    assert.ok(Math.abs(Math.min(...xs) - n.x) < .02 && Math.abs(Math.max(...xs) - n.x - n.w) < .02 && Math.abs(Math.min(...ys) - n.y) < .02 && Math.abs(Math.max(...ys) - n.y - n.h) < .02, `${n.id}: out fills its box`);
    const look = m => ({ ...m, S });
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 0; k <= 20; k++) {
      const v = side === 'L' || side === 'R', t = v ? n.y + n.h * k / 20 : n.x + n.w * k / 20, p = v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h];
      const [q] = drawnPts({ s: n, t: null, fs: side, pts: [p, [p[0] + 50, p[1] + 50]] }, look);
      assert.ok(off(segs, q) < .02, `${n.id}, side ${side} at ${t}: slid to ${q}, ${off(segs, q).toFixed(3)} px off its outline`); }
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 1; k <= 5; k++) S.ports(n, side, k).forEach(q => assert.ok(off(segs, q) < .02, `${n.id}: port ${q} on its outline`));
  }
});

test('drawn: a node of the shape it names, its accessible name, a hit area 24 px or more, strokes --um-muted and fills the stage\'s or --um-text, texts inside', () => {
  for (const n of NODES) { const s = SHAPE[n.shape].draw({ ...n, aria: `Name of ${n.id}` });
    assert.match(s, new RegExp(`^<g class="node ${n.shape}" data-id="${n.id}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="Name of ${n.id}">`));
    for (const [, k, v] of s.matchAll(/ (stroke|fill)="([^"]*)"/g)) assert.ok(k === 'stroke' ? ['var(--um-muted)', 'var(--um-text)'].includes(v) : ['var(--um-stage-bg)', 'var(--um-text)', 'var(--um-muted)', 'transparent'].includes(v), `${n.id}: ${k} ${v}`);
    const hit = /class="fl-hit"/.test(s) ? (/r="(\d+)"/.exec(s.slice(s.indexOf('fl-hit') - 60)) || [])[1] : null;
    if (['initial', 'final', 'flow-final'].includes(n.shape)) assert.equal(hit, '12', `${n.id}: a 24 px circle to hit`);
    if (n.shape === 'bar') assert.match(s, /(width|height)="24"[^>]*class="fl-hit"/, `${n.id}: a band 24 px thick to hit`);
    if (['diamond', 'rounded'].includes(n.shape)) assert.ok(n.w >= 24 && n.h >= 24, `${n.id}: itself, 24 px or more`);
    // each text's estimated box inside the shape: the rounded box less its padding; the diamond, by its corners
    for (const [, x, y, px, t] of s.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle" class="[^"]*" fill="[^"]*" style="font:\d+ ([\d.]+)px var\(--um-sans\)">([^<]*)<\/text>/g)) {
      const w = textW(t.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), +px), x0 = +x - w / 2, x1 = +x + w / 2, y0 = +y - +px, y1 = +y + 3;
      if (n.shape === 'rounded') assert.ok(x0 >= n.x + 9.9 && x1 <= n.x + n.w - 9.9 && y0 >= n.y && y1 <= n.y + n.h, `${n.id}: "${t}" inside`);
      else { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([u, v]) => assert.ok(Math.abs(u - cx) / (n.w / 2) + Math.abs(v - cy) / (n.h / 2) <= 1, `${n.id}: "${t}" inside its diamond`)); } }
  }
  assert.match(SHAPE.initial.draw({ ...NODES[0] }), /aria-label="Initial node"/, 'a name of its own with no aria');
  assert.match(SHAPE.diamond.draw({ ...NODES[4] }), /aria-label="Decision In stock\?"/);
  const long = 'Take the next order from the queue and check that every line is in stock';
  assert.match(SHAPE.diamond.draw({ ...NODES[4], label: long }), new RegExp(`aria-label="Decision ${long}"`), 'the whole label, not the cut lines');
  assert.match(SHAPE.rounded.draw({ ...NODES[12], label: ' ' }), /aria-label="Action"/);
  assert.equal(SHAPE.rounded.size({ stereotypes: [' '] }).h, SHAPE.rounded.size({}).h, 'a blank stereotype is not drawn');
  assert.equal((SHAPE.rounded.draw(NODES[12]).match(/class="c-name"/g) || []).length, 3, 'three lines, the last cut');
  assert.match(SHAPE.rounded.draw(NODES[12]), /…<\/text><\/g>$/);
  assert.deepEqual(flowWrap('aa bb cc dd ee', 12, textW('aa bb', 12), 2), ['aa bb', 'cc…'], 'the last line holds the rest, cut between words');
  assert.deepEqual(flowWrap('', 12, 100, 3), []);
});

/* ---- the shared flow rules (§9.3, S21) ---- */
const ENDS = [...FLOW_CONTROL, 'uml.Action', 'uml.ObjectNode'];
const N = (id, type, more = {}) => ({ id, type, ...more }), F = (id, from, to, guard, type = 'uml.ControlFlow') => ({ id, type, from, to, ...(guard != null ? { props: { guard } } : {}) });
const model = (nodes, edges, shown) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.activity', nodeIds: shown || nodes.map(n => n.id) }] });
const run = m => flowProblems(m, m.views[0], ENDS).map(p => `${p.level} ${p.rule} ${p.ids.join(',')}`);
// a clean activity: initial, fork into two actions, join, decision with two guarded exits (one else) into a merge, final
const CLEAN = () => model([N('i', 'uml.InitialNode'), N('fk', 'uml.ForkNode'), N('a', 'uml.Action', { label: 'Pick' }), N('b', 'uml.Action'), N('jn', 'uml.JoinNode'),
  N('d', 'uml.DecisionNode', { label: 'Paid?' }), N('x', 'uml.Action'), N('y', 'uml.Action'), N('mg', 'uml.MergeNode'), N('o', 'uml.ObjectNode'), N('f', 'uml.ActivityFinalNode'), N('ff', 'uml.FlowFinalNode')],
[F('e1', 'i', 'fk'), F('e2', 'fk', 'a'), F('e3', 'fk', 'b'), F('e4', 'a', 'jn'), F('e5', 'b', 'jn'), F('e6', 'jn', 'd'), F('e7', 'd', 'x', 'paid'), F('e8', 'd', 'y', 'else'),
  F('e9', 'x', 'mg'), F('e10', 'y', 'o', null, 'uml.ObjectFlow'), F('e11', 'o', 'mg', null, 'uml.ObjectFlow'), F('e12', 'mg', 'f')]);
const plus = (m, nodes, edges) => ({ ...m, nodes: [...m.nodes, ...nodes], edges: [...m.edges, ...edges], views: [{ ...m.views[0], nodeIds: [...m.views[0].nodeIds, ...nodes.map(n => n.id)] }] });

test('the shared rules pass a clean activity and the target examples 09 and 13, and name what they check', () => {
  assert.deepEqual(Object.keys(FLOW_RULES), ['flow-ends', 'initial-flows', 'final-flows', 'fork-join', 'decision-merge', 'decision-guards']);
  assert.deepEqual(run(CLEAN()), []);
  const ex = read('../docs/diagrams/examples/09-activity.json'), ov = read('../docs/diagrams/examples/13-interaction-overview.json');
  const act = [...FLOW_CONTROL, 'uml.Action', 'uml.CallBehaviorAction', 'uml.SendSignalAction', 'uml.AcceptEventAction', 'uml.ObjectNode', 'uml.DataStoreNode'];
  ex.views.forEach(v => assert.deepEqual(flowProblems(ex, v, act), [], v.id));
  assert.deepEqual(flowProblems(ov, ov.views.find(v => v.diagram === 'uml.interaction-overview'), [...FLOW_CONTROL, 'uml.InteractionUse', 'uml.Interaction']), []);
});

test('flow-ends: a flow to a partition or a comment is an error; flows touching no shown node are not checked', () => {
  const m = plus(CLEAN(), [N('p', 'uml.ActivityPartition', { label: 'Warehouse' }), N('c', 'uml.Comment')], [F('bad1', 'x', 'p'), F('bad2', 'c', 'y')]);
  assert.deepEqual(run(m).filter(s => s.includes('flow-ends')), ['error flow-ends bad1,p', 'error flow-ends bad2,c']);
  const p = flowProblems(m, m.views[0], ENDS).find(q => q.ids[0] === 'bad1');
  assert.deepEqual([p.path, p.message], ['edges[12]', 'flow-ends: bad1 ends on activity partition p ("Warehouse"), which a flow may not end on']);
  const hidden = { ...m, views: [{ ...m.views[0], nodeIds: m.views[0].nodeIds.filter(id => !['x', 'p', 'c', 'y'].includes(id)) }] };
  assert.deepEqual(run(hidden).filter(s => s.includes('flow-ends')), []);
});

test('initial-flows: an incoming flow or a second outgoing is an error, none outgoing a warning', () => {
  const m = CLEAN();
  assert.deepEqual(run(plus(m, [N('a2', 'uml.Action')], [F('in', 'a2', 'i')])).filter(s => s.includes('initial')), ['error initial-flows i,in']);
  assert.deepEqual(run(plus(m, [], [F('second', 'i', 'a')])).filter(s => s.includes('initial')), ['error initial-flows i,e1,second']);
  assert.deepEqual(run(plus(m, [N('i2', 'uml.InitialNode')], [])).filter(s => s.includes('initial')), ['warning initial-flows i2']);
});

test('final-flows: a flow out of an activity final or a flow final is an error; flows in are fine', () => {
  assert.deepEqual(run(plus(CLEAN(), [], [F('o1', 'f', 'x'), F('in2', 'b', 'ff'), F('o2', 'ff', 'y')])).filter(s => s.includes('final')), ['error final-flows f,o1', 'error final-flows ff,o2']);
});

test('fork-join: a second flow into a fork or out of a join is an error; fewer than two out of a fork or into a join a warning', () => {
  const m = plus(CLEAN(), [N('fk2', 'uml.ForkNode'), N('jn2', 'uml.JoinNode')], [F('g1', 'x', 'fk2'), F('g2', 'fk2', 'y'), F('g3', 'y', 'jn2'), F('g4', 'jn2', 'x')]);
  assert.deepEqual(run(m).filter(s => s.includes('fork-join')), ['warning fork-join fk2,g2', 'warning fork-join jn2,g3']);
  const n = plus(CLEAN(), [], [F('h1', 'x', 'fk'), F('h2', 'jn', 'y')]);
  assert.deepEqual(run(n).filter(s => s.includes('fork-join')), ['error fork-join fk,e1,h1', 'error fork-join jn,e6,h2']);
  assert.match(flowProblems(n, n.views[0], ENDS).find(p => p.rule === 'fork-join').message, /fork node fk has 2 incoming flows \(e1, h1\); it may have one/);
});

test('decision-merge: a second flow into a decision or out of a merge is an error; fewer than two out of a decision or into a merge a warning', () => {
  const m = plus(CLEAN(), [N('d2', 'uml.DecisionNode'), N('m2', 'uml.MergeNode')], [F('k1', 'x', 'd2'), F('k2', 'd2', 'y', 'g'), F('k3', 'y', 'm2'), F('k4', 'm2', 'x')]);
  assert.deepEqual(run(m).filter(s => s.includes('decision-merge')), ['warning decision-merge d2,k2', 'warning decision-merge m2,k3']);
  const n = plus(CLEAN(), [], [F('h1', 'x', 'd'), F('h2', 'mg', 'y')]);
  assert.deepEqual(run(n).filter(s => s.includes('decision-merge')), ['error decision-merge d,e6,h1', 'error decision-merge mg,e12,h2']);
});

test('decision-guards: an exit with no guard, or two guarded else, is a warning', () => {
  const bare = plus(CLEAN(), [], [F('n1', 'd', 'a'), F('n2', 'd', 'b', ' ')]);
  assert.deepEqual(run(bare).filter(s => s.includes('guards')), ['warning decision-guards d,n1,n2']);
  assert.deepEqual(run(plus(CLEAN(), [], [F('n3', 'd', 'a', 'else')])).filter(s => s.includes('guards')), ['warning decision-guards d,e8,n3']);
  assert.match(flowProblems(bare, bare.views[0], ENDS).find(p => p.rule === 'decision-guards').message, /2 outgoing flows of decision node d \("Paid\?"\) have no guard \(n1, n2\)/);
});

test('a flow\'s label (§7.2, §7.3): "name [guard]", an effect refused, a name holding / not printable', () => {
  assert.equal(flowText('ship', 'paid'), 'ship [paid]'); assert.equal(flowText(undefined, 'else'), '[else]'); assert.equal(flowText('ship'), 'ship');
  assert.equal(printFlow('ship', 'paid'), 'ship [paid]'); assert.equal(printFlow('a/b'), null); assert.equal(flowText('a/b', 'g'), 'a/b [g]');
  assert.deepEqual(parseFlow('ship [paid]'), { name: 'ship', guard: 'paid' }); assert.deepEqual(parseFlow('[else]'), { name: undefined, guard: 'else' });
  assert.match(parseFlow('ship / email').error, /^a flow is name \[guard\]: it has an effect/);
  for (const t of ['ship /', '/', '[g] /']) assert.match(parseFlow(t).error, /^a flow is name \[guard\]: it has an effect/, t);
  assert.match(parseFlow('ship [paid').error, /^a flow is name \[guard\]: /);
});
