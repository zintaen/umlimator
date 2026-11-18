// One name rule for every typed view (audit 35): an element labelled "" is named by its id, as with no label at all, as a map's
// card is. Each type had its own `String(x.label ?? x.id)` helper, which kept "" as an empty name: a blank box head, accessible
// names such as "State " and "Transition from  to shipped", describe() lines, the PDF's rows and validate()'s messages. They all
// go through elName (src/core/model.js) now. The sweep: every example and every type's minimal fixture, each element's label
// set to "" and then removed; the picture, describe(), the PDF's tables and validate() must read the same both ways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);
// every source but the page and the canvas (they need a browser): every type registers itself on import
for (const d of readdirSync(SRC)) if (!['page', 'canvas'].includes(d)) for (const f of readdirSync(new URL(d + '/', SRC))) if (f.endsWith('.js')) await import(new URL(`${d}/${f}`, SRC));
const { mapContext } = await import('../src/map/context.js');
const { describe } = await import('../src/map/insight.js');
const { validate } = await import('../src/map/validate.js');
const { layout } = await import('../src/map/api.js');
const { tablesOf } = await import('../src/page/print.js');
const { elName } = await import('../src/core/model.js');

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const files = [...readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => '../examples/' + f),
  ...readdirSync(new URL('./', import.meta.url)).filter(f => f.endsWith('-minimal.json')).map(f => './' + f)];
// every element's label, its members' and its lines' set to `val` (undefined: removed)
const relabel = (m, val) => { const go = x => { if (x && typeof x === 'object' && x.id != null) { if (val === undefined) delete x.label; else x.label = val; } };
  (m.nodes || []).forEach(n => { go(n); (n.members || []).forEach(go); }); (m.edges || []).forEach(go);
  // and a view's own lines and items (a sequence's messages and interaction uses live there: audit 36)
  (m.views || []).forEach(v => (Array.isArray(v.edges) ? v.edges : []).forEach(go)); return m; };
// what a reader gets of each typed view; a marker's id counts up across renders, so it is left out
const said = m => { const ctx = mapContext(m), out = { validate: validate(m).map(p => p.message) };
  (m.views || []).filter(v => v.diagram).forEach(v => { out[v.id] = { svg: ctx.buildView(v.id).markup.replace(/\bg\d+-/g, 'g-'), describe: describe(m, v.id), pdf: tablesOf(ctx, ctx.V[v.id], layout(m, v.id)) }; });
  return out; };

test('audit 35: elName names an element by its label, a label "" or none by its id, a label 0 as "0"', () => {
  assert.equal(elName({ id: 'paid', label: 'Paid' }), 'Paid');
  assert.equal(elName({ id: 'paid', label: '' }), 'paid');
  assert.equal(elName({ id: 'paid' }), 'paid');
  assert.equal(elName({ id: 'paid', label: null }), 'paid');
  assert.equal(elName({ id: 'n', label: 0 }), '0');
});

test('audit 35: in every typed view, an element labelled "" is drawn, named, described, printed and checked as one with no label', () => {
  const seen = new Set();
  for (const f of files) {
    const m0 = read(f); if (!(m0.views || []).some(v => v.diagram)) continue;
    (m0.views || []).forEach(v => v.diagram && seen.add(v.diagram));
    const none = said(relabel(structuredClone(m0), undefined)), blank = said(relabel(structuredClone(m0), ''));
    assert.deepEqual(blank.validate, none.validate, `${f}: validate()`);
    for (const v of Object.keys(none)) if (v !== 'validate') {
      for (const k of ['describe', 'pdf', 'svg']) assert.deepEqual(blank[v][k], none[v][k], `${f}, view ${v}: ${k}`);
      // and no element is left with an empty name: no blank accessible name, no "from  to", no name missing before a comma
      [...blank[v].svg.matchAll(/aria-label="([^"]*)"/g)].map(x => x[1]).forEach(a => assert.ok(a.trim() && !/ {2}| ,| (of|in|to|from)$/.test(a), `${f}, view ${v}: aria-label ${JSON.stringify(a)}`)); }
  }
  // every registered type was swept: its name in src/ (C4's from its kinds) is among the views drawn
  const names = new Set(), walk = u => readdirSync(u, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(new URL(e.name + '/', u)) : e.name.endsWith('.js') && [...readFileSync(new URL(e.name, u), 'utf8').matchAll(/registerDiagramType\('([^']+)'/g)].forEach(x => names.add(x[1])));
  walk(SRC); ['c4.context', 'c4.container', 'c4.component'].forEach(n => names.add(n)); names.delete('map');
  assert.deepEqual([...names].filter(n => !seen.has(n)), []);
});

// the text a picture draws, each <text> run's words (an attribute may hold '>': data-id="a->b")
const drawnTexts = svg => [...svg.matchAll(/<text(?:\s+[\w:-]+="[^"]*")*\s*>([\s\S]*?)<\/text>/g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'));
test('audit 36: a member the picture names by its id when it has no name, the PDF names by its id too', () => {
  // every member labelled "": a member whose id the picture draws as a word of its text (a port, an extension point, a
  // parameter) is in its owner's Members cell of the PDF, not "port " with nothing after it. Parts with a type and no name
  // (": Battery [1]") and a state's regions are drawn with no name, and printed so: not ids in the picture, not checked. A
  // profile's stereotype draws an attribute as a class does (": String"); the id it draws is a tagged value's, on another element
  const sw = [...files, ...readdirSync(new URL('./', import.meta.url)).filter(f => /^(composite|internal-block|parametric|usecase)-stress\.json$/.test(f)).map(f => './' + f)];
  let n = 0;
  for (const f of sw) {
    const m = read(f); if (!(m.views || []).some(v => v.diagram)) continue;
    (m.nodes || []).forEach(x => (x.members || []).forEach(y => { if (y && typeof y === 'object' && y.id != null) y.label = ''; }));
    const ctx = mapContext(m);
    for (const v of (m.views || []).filter(v => v.diagram && v.diagram !== 'uml.profile')) {
      const words = new Set(drawnTexts(ctx.buildView(v.id).markup).flatMap(t => t.split(/[\s:«»()]+/))), [els] = tablesOf(ctx, ctx.V[v.id], layout(m, v.id));
      for (const id of v.nodeIds || []) { const x = (m.nodes || []).find(y => y.id === id), row = els.rows.find(r => r.includes(`<b>${id}</b>`) || x && typeof x.label === 'string' && r.includes(`<b>${x.label}</b>`));
        if (!x || !row) continue;
        for (const y of x.members || []) if (y && typeof y === 'object' && typeof y.id === 'string' && words.has(y.id)) { n++;
          assert.ok(/<p>([^<]*)<\/p>/.test(row) && [...row.matchAll(/<p>([^<]*)<\/p>/g)].some(p => p[1].split(/[\s:,]+/).includes(y.id)), `${f}, view ${v.id}: ${y.id} of ${id} is drawn by its id, printed ${JSON.stringify(row.slice(0, 300))}`); } }
    }
  }
  assert.ok(n > 5, `members checked: ${n}`);
});

test('audit 43: a typed view\'s panel text field that is not text is said at its own path, in every type: once, when a rule of its type says that path already', () => {
  const O = { z: 3 }, said = m => validate(m).filter(p => / is not text/.test(p.message)).map(p => p.path).sort();
  const one = (d, nodes, edges = [], more = {}) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: d, nodeIds: nodes.map(n => n.id), ...more }] });
  assert.deepEqual(said(one('c4.container', [{ id: 's', type: 'c4.Container', label: 'S', props: { description: O, technology: 'Go' } }, { id: 'p', type: 'c4.Person', label: 'P' }],
    [{ id: 'r', type: 'c4.Relationship', from: 'p', to: 's', label: 'uses', props: { technology: [1] } }])), ['edges[0].props.technology', 'nodes[0].props.description']);
  assert.deepEqual(said(one('dfd', [{ id: 'p', type: 'dfd.Process', label: 'P', props: { number: O } }, { id: 'q', type: 'dfd.Process', label: 'Q', props: { number: 2 } }])), ['nodes[0].props.number']);
  assert.deepEqual(said(one('er', [{ id: 't', type: 'er.Entity', label: 'T', members: [{ id: 't.a', type: 'er.Column', label: 'a', props: { dataType: O } }] }])), ['nodes[0].members[0].props.dataType']);
  assert.deepEqual(said(one('uml.state-machine', [{ id: 'a', type: 'uml.State', label: 'A', props: { entry: O } }, { id: 'b', type: 'uml.State', label: 'B' }],
    [{ id: 't', type: 'uml.Transition', from: 'a', to: 'b', props: { guard: O, effect: 'go' } }])), ['edges[0].props.guard', 'nodes[0].props.entry']);
  assert.deepEqual(said(one('uml.sequence', [{ id: 'a', type: 'uml.Lifeline', label: 'a', props: { represents: O } }])), ['nodes[0].props.represents']);
  assert.deepEqual(said(one('uml.use-case', [{ id: 'a', type: 'uml.UseCase', label: 'A', members: [{ id: 'a.p', type: 'uml.ExtensionPoint', label: 'p' }] }, { id: 'b', type: 'uml.UseCase', label: 'B' }],
    [{ id: 'x', type: 'uml.Extend', from: 'b', to: 'a', props: { extensionPoints: ['a.p'], condition: O } }])), ['edges[0].props.condition']);
  // a line or card the view does not list: not said by the view (the class view's own rule still says an end's role)
  assert.deepEqual(said(one('c4.container', [{ id: 's', type: 'c4.Container', label: 'S' }], [], { nodeIds: [] })), []);
  const off = one('dfd', [{ id: 'p', type: 'dfd.Process', label: 'P' }]); off.nodes.push({ id: 'q', type: 'dfd.Process', label: 'Q', props: { number: O } });
  assert.deepEqual(said(off), []);
  // a multiplicity its type judges is said by that rule alone, not again as text
  const ab = one('uml.class', [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }], [{ id: 'l', type: 'uml.Association', from: 'a', to: 'b', props: { ends: { to: { multiplicity: O } } } }]);
  assert.deepEqual(validate(ab).filter(p => p.path === 'edges[0].props.ends.to.multiplicity').map(p => p.rule), ['multiplicity']);
});

test('audit 43: every example\'s panel text fields and stereotypes, each set to what is not text in turn, are said at their paths', () => {
  const O = { z: 3 }, obj = x => x && typeof x === 'object' && !Array.isArray(x);
  for (const f of readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json'))) {
    const base = read(`../examples/${f}`); if (base.schemaVersion !== 2) continue;
    const spots = new Map(); // one spot a kind and key: the sweep's time
    const walk = (x, at) => { if (!obj(x)) return; if (obj(x.props)) Object.entries(x.props).forEach(([k, v]) => {
        if (typeof v === 'string' && !spots.has(x.type + k)) spots.set(x.type + k, [at, k]);
        if (k === 'stereotypes' && Array.isArray(v) && v.length && !spots.has(x.type + k)) spots.set(x.type + k, [at, 'stereotypes[0]']); });
      (Array.isArray(x.members) ? x.members : []).forEach((m, j) => walk(m, `${at}.members[${j}]`)); };
    base.nodes.forEach((n, i) => walk(n, `nodes[${i}]`)); (base.edges || []).forEach((e, i) => walk(e, `edges[${i}]`));
    for (const [at, k] of spots.values()) {
      const m = structuredClone(base), x = at.match(/\w+\[\d+\]/g).reduce((o, s) => { const [, a, i] = /(\w+)\[(\d+)\]/.exec(s); return o[a][+i]; }, m);
      if (k === 'stereotypes[0]') x.props.stereotypes[0] = O; else x.props[k] = O;
      const drawn = m.views.some(v => { try { return JSON.stringify(layout(m, v.id)).includes('[object Object]'); } catch { return false; } });
      if (drawn) assert.ok(validate(m).some(p => p.path.startsWith(`${at}.props`)), `${f} ${at}.props.${k}: drawn as "[object Object]" and said nowhere`);
    }
  }
});
