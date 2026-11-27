// The class view's lines past its package boxes: a line that runs through a box holding neither of its ends (a «use» line
// from Payable to Money in the card package, under its title) is routed again round it, as a state machine's is.
// tests/fixtures/uml-class-use-line.json is a copy of the class type page's model, where both views drew such a line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/map/typed.js';
import '../src/uml/class.js';
import { layout, check } from '../src/map/api.js';

const M = JSON.parse(readFileSync(new URL('./fixtures/uml-class-use-line.json', import.meta.url)));

// each [line, box] where a segment of the line passes inside a box that holds neither of its ends, at any depth
function throughBoxes(g) {
  const out = [], holds = (f, id) => { for (let x = g.families.find(y => y.nodeIds.includes(id)); x; x = g.families.find(y => y.id === x.parent)) if (x === f) return true; return false; };
  for (const e of g.edges) for (const f of g.families) {
    if (holds(f, e.from) || holds(f, e.to)) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const [a, b] = [e.pts[i - 1], e.pts[i]];
      if (Math.max(a[0], b[0]) > f.x && Math.min(a[0], b[0]) < f.x + f.w && Math.max(a[1], b[1]) > f.y && Math.min(a[1], b[1]) < f.y + f.h) { out.push([e.id, f.id]); break; }
    }
  }
  return out;
}

test('a class view routes no line through a package box that holds neither of its ends: the «use» line from Payable to Money leaves the card package', () => {
  for (const v of ['sales', 'sales-right']) {
    const g = layout(M, v);
    assert.deepEqual(throughBoxes(g), [], v);
    assert.deepEqual(check(M, v), [], `${v}: the check is clean`);
  }
  const g = layout(M, 'sales-right'), use = g.edges.find(e => e.id === 'payable-uses-money'), card = g.families.find(f => f.id === 'card');
  assert.equal(use.label, '«use»');
  assert.ok(use.pts.slice(1).every((b, i) => { const a = use.pts[i]; return a[1] !== b[1] || a[1] < card.y || a[1] > card.y + card.h || Math.max(a[0], b[0]) < card.x || Math.min(a[0], b[0]) > card.x + card.w; }),
    'no run across inside the card box, under its title');
  assert.deepEqual(use.pts[0], [986.5, 37.5], 'it leaves Payable where it did');
  assert.equal(use.pts.at(-1)[1], g.nodes.find(n => n.id === 'money').y, 'and enters Money from its top');
});

// audit 71: seven class views from a seeded sweep (a package or three, up to a dozen classes, associations, generalizations
// and dependencies, right or down), each of which ran a line through a package holding neither of its ends: a class view of
// up to 30 cards takes a crossing over such a line, as the component and cloud views do, and check() names any left
test('audit 71: a small class view routes no line through a package that holds neither of its ends, and check() names none', () => {
  const S = JSON.parse(readFileSync(new URL('./fixtures/uml-class-box-sweep.json', import.meta.url)));
  S.forEach((m, k) => {
    assert.deepEqual(throughBoxes(layout(m, 'v')), [], `model ${k} (${m.views[0].direction})`);
    assert.deepEqual(check(m, 'v').map(p => p.message).filter(s => / which holds neither of its ends$/.test(s)), [], `model ${k}: check()`);
  });
});
