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
