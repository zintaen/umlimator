// node --test tests/line-weight.test.mjs   (no browser: the markup from svgOf and the rules in STYLES)
// A map line's weight shows on hover, selection and keyboard focus only, and its title and name say why (19 Nov 2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../lib/umlimator.js';
import { svgOf } from '../src/draw/svg.js';
import { STYLES } from '../src/canvas/styles.js';

const model = { root: 'v', nodes: [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']].map(([id, label]) => ({ id, label, kind: 'backend' })),
  edges: [{ from: 'a', to: 'b', weight: 1, what: 'one import' }, { from: 'a', to: 'c', weight: 2, what: '60 imports' }, { from: 'a', to: 'd', weight: 3 }],
  views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }] };

// the --um-ew a line of weight w gets in the given states, read from the sheet's rules (a selector applies when its weights
// and states are all the line's own)
const STATES = ['.hov', '.hot', '.key-on', ':hover', ':focus-visible'];
const rules = [...STYLES.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const ew = (w, states, el = 'edge-g') => {
  let v = 1;
  for (const r of rules) { const d = /--um-ew:\s*([\d.]+)/.exec(r.body); if (!d) continue;
    for (const part of r.sel.split(/,(?![^(]*\))/).map(x => x.trim())) {
      if (!part.includes(el)) continue;
      const wts = [...part.matchAll(/\.wt-(\d)/g)].map(m => +m[1]); if (!wts.length || wts.some(x => x !== w)) continue;
      const need = STATES.filter(s => part.includes(s));
      const any = /:is\(([^)]*)\)/.exec(part), alts = any && STATES.some(s => any[1].includes(s)) ? any[1].split(',').map(x => x.trim()) : null;
      if (alts ? alts.some(a => states.includes(a)) : need.every(s => states.includes(s))) v = +d[1]; } }
  return v; };

test("at rest a map line of weight 1, 2 or 3 is drawn alike: the same width and the normal arrowhead", () => {
  const s = svgOf(layout(model, 'v'));
  const groups = [...s.matchAll(/<g class="edge-g[^"]*"[^>]*>[\s\S]*?<\/g>/g)].map(m => m[0]);
  assert.equal(groups.length, 3);
  for (const g of groups) assert.match(g, /class="edge[^"]*"[^>]*marker-end="url\(#g\d+-[a-z]+\)"/, `the normal arrowhead at rest: ${g.slice(0, 300)}`);
  assert.deepEqual([1, 2, 3].map(w => ew(w, [])), [1, 1, 1], 'one width at rest');
});

test("on hover, selection and keyboard focus a weighted line grows to its weight's width, with its heavier arrowhead", () => {
  for (const st of ['.hov', '.hot', '.key-on', ':hover']) {
    assert.equal(ew(1, [st]), 1, `weight 1 ${st}`);
    assert.equal(ew(2, [st]), 1.75, `weight 2 ${st}`);
    assert.equal(ew(3, [st]), 2.5, `weight 3 ${st}`); }
  assert.equal(ew(3, [':focus-visible'], 'line-key'), 2.5, "the focus ring is as wide as the grown line");
  assert.match(STYLES, /\.edge-g:is\(\.wt-2, \.wt-3\):is\(\.hov, \.hot, \.key-on\) \.edge[^{]*\{[^}]*marker-end: var\(--um-mk\)/, 'the heavy arrowhead in those states');
  const s = svgOf(layout(model, 'v')), mk = [...s.matchAll(/--um-mk: url\(#(g\d+-[a-z]+-w(\d))\)/g)];
  assert.deepEqual(mk.map(m => +m[2]).sort(), [2, 3], 'a weighted line names its heavy arrowhead');
  for (const m of mk) assert.ok(s.includes(`<marker id="${m[1]}"`), `${m[1]} is defined`);
});

test("a weighted line's title and accessible name say its what, else its weight; a weight-1 line says nothing new", () => {
  const s = svgOf(layout(model, 'v'));
  const title = to => new RegExp(`data-to="${to}"[\\s\\S]*?<title>([\\s\\S]*?)</title>`).exec(s)[1];
  const name = to => [...s.matchAll(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]).find(x => x.includes(`to ${to.toUpperCase()}`));
  assert.equal(title('b'), 'A → B'); assert.equal(name('b'), 'Line from A to B');
  assert.equal(title('c'), 'A → C\n60 imports'); assert.equal(name('c'), 'Line from A to C, 60 imports');
  assert.equal(title('d'), 'A → D\nweight 3 of 3'); assert.equal(name('d'), 'Line from A to D, weight 3 of 3');
});

// audit 49: a weighted line's `what` is Markdown for the details panel; its title and accessible name read its markers aloud
test("a weighted line's title and accessible name say its Markdown what as plain words, its first sentence only", () => {
  const whats = [['Carries **every** ride.\n\nSee [the runbook](https://example.com/runbook) and `rides.v2`.\n\n- MQTT\n- REST', 'Carries every ride.'],
    ['- `rides.v2` over ==MQTT==\n- REST', 'rides.v2 over MQTT REST'], ['See [the runbook](https://example.com/r) first', 'See the runbook first'], ['60 imports', '60 imports'], ['- ', 'weight 2 of 3']];
  for (const [what, said] of whats) {
    const m = { root: 'v', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', weight: 2, what }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
    const s = svgOf(layout(m, 'v'));
    assert.equal(/<g class="edge-g[\s\S]*?<title>([\s\S]*?)<\/title>/.exec(s)[1], `A → B\n${said}`, what);
    assert.equal(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/.exec(s)[1], `Line from A to B, ${said}`, what); }
});
