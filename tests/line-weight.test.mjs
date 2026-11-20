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

test("audit 50: a line's flow stops where the arrowhead drawn begins: weight 1's at rest, a weighted line's heavier one on hover", () => {
  const s = svgOf(layout(model, 'v')), end = d => d.trim().split(/[\s,A-Za-z]+/).filter(Boolean).map(Number).slice(-2);
  const groups = [...s.matchAll(/<g class="edge-g[^"]*"[^>]*data-to="(\w)"[^>]*>[\s\S]*?<\/g>/g)].map(m => [m[1], m[0]]);
  for (const [to, g] of groups) {
    const e = end(/<path d="([^"]*)" class="edge[ "]/.exec(g)[1]), cut = c => { const p = end(new RegExp(`<path d="([^"]*)" class="${c}"`).exec(g)[1]); return Math.hypot(e[0] - p[0], e[1] - p[1]); };
    assert.ok(Math.abs(cut('flowline') - 9) < .6, `to ${to}: at rest, trimmed for the normal arrowhead (${cut('flowline')})`);
    const w = { b: 1, c: 2, d: 3 }[to];
    if (w > 1) assert.ok(Math.abs(cut('flowline fl-hv') - 9 * (1 + (w - 1) * .35)) < .6, `to ${to}: the hover flow line, trimmed for the heavy arrowhead`);
    else assert.doesNotMatch(g, /fl-hv/, 'weight 1: one flow line'); }
  assert.match(STYLES, /svg \.fl-hv, svg \.edge-g:is\(\.wt-2, \.wt-3\):is\(\.hov, \.hot, \.key-on\) \.flowline:not\(\.fl-hv\)[^{]*\{ display: none; \}/, 'the hover one hidden at rest, the rest one in those states');
  assert.match(STYLES, /\.edge-g:not\(\.faded\):is\(\.wt-2, \.wt-3\):is\(\.hov, \.hot, \.key-on\) \.fl-hv[^{]*\{ display: inline; \}/, 'and the hover one shown then');
});

// audit 51: the d.ts, the JSON Schema, the map type's checklist (tools/types.json, and the docs page tools/gallery.mjs
// writes from it), the examples' README and monorepo.py still said a weight is drawn as a width, as before 19 Nov; each
// now says what the test above draws: one width at rest, its width on hover, selection and keyboard focus
test('every description of a line\'s weight says it shows on hover, selection and focus, not as a width at rest', async () => {
  const { readFileSync } = await import('node:fs');
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const schema = JSON.parse(read('lib/umlimator.schema.json'));
  const descs = []; JSON.parse(JSON.stringify(schema), (k, v) => { if (v && typeof v === 'object' && v.weight && v.weight.description) descs.push(v.weight.description); return v; });
  assert.ok(descs.length >= 1);
  const dts = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*weight\?:/.exec(read('lib/umlimator.d.ts'));
  assert.ok(dts, 'the d.ts documents weight');
  const map = JSON.parse(read('tools/types.json')).types.map, item = JSON.stringify(map).match(/"(Line weights[^"]*)"/);
  assert.ok(item, 'the map checklist lists weights');
  const said = { schema: descs.join(' '), dts: dts[1], checklist: item[1], page: read('docs/gallery/map.md').match(/<li>Line weights[^<]*<\/li>/)?.[0] ?? '',
    readme: read('examples/README.md').match(/^\| \[`monorepo\.json`\][^\n]*/m)[0], monorepo: read('examples/monorepo.py').split('"""')[1] };
  for (const [where, text] of Object.entries(said)) {
    assert.doesNotMatch(text, /drawn as (its )?widths?|heavier|about 1\.8, 3\.2 and 4\.5 px/, where);
    if (where !== 'monorepo') assert.match(text, /hover/, where);
  }
});

// audit 49: a weighted line's `what` is Markdown for the details panel; its title and accessible name read its markers aloud
test("a weighted line's title and accessible name say its Markdown what as plain words, its first sentence only", () => {
  const whats = [['Carries **every** ride.\n\nSee [the runbook](https://example.com/runbook) and `rides.v2`.\n\n- MQTT\n- REST', 'Carries every ride.'],
    ['- `rides.v2` over ==MQTT==\n- REST', 'rides.v2 over MQTT; REST'], ['See [the runbook](https://example.com/r) first', 'See the runbook first'], ['60 imports', '60 imports'], ['- ', 'weight 2 of 3']];
  for (const [what, said] of whats) {
    const m = { root: 'v', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', weight: 2, what }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
    const s = svgOf(layout(m, 'v'));
    assert.equal(/<g class="edge-g[\s\S]*?<title>([\s\S]*?)<\/title>/.exec(s)[1], `A → B\n${said}`, what);
    assert.equal(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/.exec(s)[1], `Line from A to B, ${said}`, what); }
});

test("audit 54: a weighted line's first sentence ends at no abbreviation, its first paragraph only, a list's items each after a \"; \"", () => {
  const whats = [['Carries orders, e.g. book orders and refunds, to the queue.', 'Carries orders, e.g. book orders and refunds, to the queue.'],
    ['Approx. 100 calls/s at peak.', 'Approx. 100 calls/s at peak.'], ['Roughly 1,000 calls a second, i.e. most of the traffic. More here.', 'Roughly 1,000 calls a second, i.e. most of the traffic.'],
    ['Every order\n\nRetried twice by the worker', 'Every order'], ['- orders\n- refunds\n- stock moves', 'orders; refunds; stock moves'], ['Carries:\n- orders\n- refunds', 'Carries: orders; refunds'],
    ['play() returns null. tour() starts one.', 'play() returns null.']];
  for (const [what, said] of whats) {
    const m = { root: 'v', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', weight: 3, what }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
    const s = svgOf(layout(m, 'v'));
    assert.equal(/<g class="edge-g[\s\S]*?<title>([\s\S]*?)<\/title>/.exec(s)[1], `A \u2192 B\n${said}`, what);
    assert.equal(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/.exec(s)[1], `Line from A to B, ${said}`, what); }
  // a card's sub-line, which the line's words match, ends its first sentence at no abbreviation either
  const c = svgOf(layout({ root: 'v', nodes: [{ id: 'a', label: 'A', what: 'Stores orders, e.g. book orders. Also refunds.' }], views: [{ id: 'v', nodeIds: ['a'] }] }, 'v'));
  assert.ok(c.includes('e.g. book') && !c.includes('Also refunds'), c.match(/Stores[^<]*/)?.[0]);
});

test('audit 54 follow-up: firstSentence checks only a 9-character tail for an abbreviation (constant work per period on any regex engine) and still cuts as before', async () => {
  const { firstSentence } = await import('../src/core/text.js');
  const s = 'x e.g. '.repeat(40000) + 'end. tail';
  const t0 = performance.now();
  const out = firstSentence(s);
  assert.ok(out.endsWith('end.'), 'cuts after the first real sentence');
  assert.ok(performance.now() - t0 < 250, 'under 250 ms');
  assert.equal(firstSentence('Carries orders, e.g. book orders. Then more.'), 'Carries orders, e.g. book orders.');
  assert.equal(firstSentence('vs. this. next'), 'vs. this.');
  assert.equal(firstSentence('Canvas. next'), 'Canvas.');
});

test('audit 55: a first sentence runs past a list number, a capital initial, a letter chain and a title; a bullet item drops its period before the "; "', async () => {
  const { firstSentence, mdPlain } = await import('../src/core/text.js');
  for (const [t, f] of [['1. Validates the basket.\n2. Charges the card.', '1. Validates the basket.'], ['Run by J. Smith in the U.S. office. More.', 'Run by J. Smith in the U.S. office.'],
    ['Sends Dr. Smith the report. Then more.', 'Sends Dr. Smith the report.'], ['Runs at 3 p.m. daily. More.', 'Runs at 3 p.m. daily.'],
    ['Released in 2024. Then more.', 'Released in 2024.'], ['Calls x vs. y. More', 'Calls x vs. y.'], ['Canvas. next', 'Canvas.']]) assert.equal(firstSentence(t), f, t);
  for (const [t, f] of [['- Charges the card.\n- Sends the receipt.\n- Logs the order.', 'Charges the card; Sends the receipt; Logs the order.'], ['Carries:\n- orders.\n- refunds.', 'Carries: orders; refunds.'],
    ['- gift cards etc.\n- maps', 'gift cards etc.; maps'], ['- orders\n- refunds', 'orders; refunds']]) assert.equal(mdPlain(t), f, t);
  // drawn: a card's title and a weighted line's title and name
  const m = { root: 'v', nodes: [{ id: 'a', label: 'Checkout', what: '1. Validates the basket.\n2. Charges the card.' }, { id: 'b', label: 'Gateway', what: 'Run by J. Smith in the U.S. office.' }],
    edges: [{ from: 'a', to: 'b', weight: 3, what: '- Charges the card.\n- Sends the receipt.' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const s = svgOf(layout(m, 'v')), titles = [...s.matchAll(/<title>([^<]*)<\/title>/g)].map(x => x[1]);
  assert.ok(titles.includes('Checkout \u00b7 1. Validates the basket.') && titles.includes('Gateway \u00b7 Run by J. Smith in the U.S. office.'), titles.join(' | '));
  assert.equal(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/.exec(s)[1], 'Line from Checkout to Gateway, Charges the card; Sends the receipt.');
});
