// Writes examples/index.html, the examples' gallery (the site's /umlimator/examples/), in two parts:
//   Diagrams: a group per diagram type, the map first, then the 28 in docs/types.md's order, each holding every example
//     and view of that type the repository has: the examples in examples/, the Umlimator Atlas's views of that type, and
//     the type's minimal and stress test models (tests/<type>-minimal.json and -stress.json, which the site job renders
//     into examples/samples/);
//   Atlas: real-world use cases, each a multi-view model of a real system. For now one: the Umlimator Atlas.
// Each card says which aspects of the notation it shows (tools/gallery.json, by file and type) and links its page, its
// PDF and its model, as the site job builds them (.github/workflows/check.yml). No dependency.
// `node tools/gallery.mjs` writes the page; tests/gallery.test.mjs fails when the committed page is not what this writes,
// when an example has no card text, and when a link or picture names a file the site does not serve.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const REPO = 'https://github.com/zintaen/umlimator/blob/main/';
const stop = msg => { throw new Error(`tools/gallery.mjs: ${msg}`); };

// a view's diagram type as the gallery groups it: C4's six view kinds are one type, a map view (no diagram) is the map
export const groupOf = view => { const d = view && view.diagram; return !d || d === 'map' ? 'map' : d.startsWith('c4.') ? 'c4' : d.replace('.', '-'); };
// the types, in docs/types.md's order, under its section headings: [{ family, id, name, text }]
export function types() {
  const out = [];
  for (const part of read('docs/types.md').split(/^## /m).slice(1)) {
    const family = part.slice(0, part.indexOf('\n')).trim();
    for (const [, id, name, text] of part.matchAll(/<h3 id="([\w-]+)">([^<]+)<\/h3>\s*<p>([^<]*)<\/p>/g)) out.push({ family, id, name, text });
  }
  return out;
}
const conformance = id => `docs/conformance/${id}.md`;
const views = (m, g) => (m.views || []).filter(v => groupOf(v) === g);
const firstOf = (m, g) => { const vs = views(m, g); return vs.find(v => v.id === m.root) || vs[0]; };

export function inventory() {
  const G = json('tools/gallery.json');
  const files = readdirSync(new URL('examples/', ROOT)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  for (const n of G.retired.files) if (G.examples[n] || n === G.atlas.file) stop(`examples/${n}.json is retired: it has no card`);
  const atlasName = G.atlas.file, typed = files.filter(n => n !== atlasName && !G.retired.files.includes(n));
  const known = Object.keys(G.examples), order = [...known, ...typed.filter(n => !known.includes(n)).sort()];
  for (const n of typed) if (!G.examples[n]) stop(`examples/${n}.json has no card in tools/gallery.json: give it its text and alt`);
  for (const n of known) if (!typed.includes(n)) stop(`tools/gallery.json has a card for examples/${n}.json, which is not there`);
  const models = Object.fromEntries(order.map(n => [n, json(`examples/${n}.json`)]));
  const atlas = json(`examples/${atlasName}.json`);
  const samples = readdirSync(new URL('tests/', ROOT)).filter(f => /^[a-z0-9-]+-(minimal|stress)\.json$/.test(f)).sort()
    .map(f => ({ name: f.slice(0, -5), kind: f.endsWith('-minimal.json') ? 'minimal' : 'stress', model: json(`tests/${f}`) }));
  const T = [{ family: 'Maps', id: 'map', name: G.map.name, text: G.map.text, covers: G.map.covers },
    ...types().map(t => ({ ...t, covers: conformance(t.id) }))];
  const known2 = new Set(T.map(t => t.id));
  for (const [n, m] of Object.entries(models)) for (const v of m.views || []) if (!known2.has(groupOf(v))) stop(`examples/${n}.json view ${v.id}: no type ${groupOf(v)} in docs/types.md`);
  return T.map(t => ({ ...t,
    examples: order.filter(n => views(models[n], t.id).length).map(n => {
      const m = models[n], c = { ...G.examples[n], ...((G.examples[n].types || {})[(firstOf(m, t.id) || {}).diagram] || {}) }, vs = views(m, t.id), first = firstOf(m, t.id);
      return { file: n, title: m.title, text: c.text, alt: c.alt, links: c.links || [], views: vs.map(v => v.id), still: first.id, rootIs: first.id === m.root };
    }),
    atlas: views(atlas, t.id).map(v => ({ view: v.id, title: v.title, text: G.atlas.views[v.id] || stop(`tools/gallery.json has no text for the atlas's view ${v.id}`) })),
    samples: samples.filter(s => views(s.model, t.id).length).map(s => ({ ...s, views: views(s.model, t.id).map(v => v.id), still: firstOf(s.model, t.id).id })),
  }));
}

const links = xs => `<span class="links">${xs.map(([t, h]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('')}</span>`;
const viewList = (page, ids) => ids.length < 2 ? '' : `<p class="views">Views: ${ids.map(id => `<a href="${esc(page)}#view=${esc(id)}">${esc(id)}</a>`).join(', ')}</p>`;
const card = ({ img, alt, title, text, list = '', ls }) => `      <article class="card"><img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" width="640" height="320">
        <div><h4>${title}</h4><p>${text}</p>${list}
          ${links(ls)}</div></article>`;
const sampleText = s => {
  if (s.kind === 'minimal') return `A test model: the smallest view of this type the tests draw, ${s.views.length === 1 ? 'one view' : `${s.views.length} views`}.`;
  const all = (s.model.views || []).find(v => v.id === 'all' && s.views.includes('all')), edge = s.views.filter(v => v !== 'all');
  return `A test model: what the tests hold the type to, ${edge.length ? `its edge cases (${edge.length === 1 ? 'one view' : `${edge.length} views`})` : ''}${edge.length && all ? ', and ' : ''}${all ? `a view of ${all.nodeIds.length} elements` : ''}.`;
};

export function page() {
  const G = json('tools/gallery.json'), A = G.atlas, inv = inventory(), atlas = json(`examples/${A.file}.json`);
  const families = [...new Set(inv.map(t => t.family))];
  const nav = families.map(f => `      <li><b>${esc(f)}</b> ${inv.filter(t => t.family === f).map(t => `<a href="#type-${t.id}">${esc(t.name)}</a>`).join(' ')}</li>`).join('\n');
  const groups = inv.map(t => {
    const cards = [
      ...t.examples.map(e => card({ img: `stills/${e.file}/${e.still}.png`, alt: e.alt, title: esc(e.title), text: e.text,
        list: viewList(`${e.file}.html`, e.views),
        ls: [['Open', e.rootIs ? `${e.file}.html` : `${e.file}.html#view=${e.still}`], ...e.links, ['PDF', `${e.file}.pdf`], ['Model', `${e.file}.json`]] })),
      ...t.atlas.map(a => card({ img: `stills/${A.file}/${a.view}.png`, alt: `The Umlimator Atlas's view ${a.title}`, title: `Umlimator Atlas: ${esc(a.title)}`, text: a.text,
        ls: [['Open', `${A.file}.html#view=${a.view}`], ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]] })),
      ...t.samples.map(s => card({ img: `samples/stills/${s.name}/${s.still}.png`, alt: `${s.model.title}: the view ${s.still}`, title: esc(s.model.title),
        text: sampleText(s), list: viewList(`samples/${s.name}.html`, s.views),
        ls: [['Open', `samples/${s.name}.html#view=${s.still}`], ['PDF', `samples/${s.name}.pdf`], ['Model', `samples/${s.name}.json`]] })),
    ];
    return `    <section class="type" id="type-${t.id}" aria-labelledby="type-${t.id}-h">
      <h3 id="type-${t.id}-h">${esc(t.name)}</h3>
      <p>${esc(t.text)} <a href="${REPO}${t.covers}">${t.id === 'map' ? 'The model guide' : 'What it covers'}</a></p>
      <div class="grid">
${cards.join('\n')}
      </div>
    </section>`;
  }).join('\n');
  const byType = [...new Set(atlas.views.map(groupOf))].map(g => { const t = inv.find(x => x.id === g);
    return `${esc(t.name)} (${atlas.views.filter(v => groupOf(v) === g).map(v => `<a href="${A.file}.html#view=${esc(v.id)}">${esc(v.title)}</a>`).join(', ')})`; });
  const atlasCard = `      <article class="card wide"><img src="stills/${A.file}/${atlas.root}.png" alt="${esc(A.alt)}" loading="lazy" width="640" height="320">
        <div><h3>${esc(A.name)}</h3><p>${A.text}</p>
          <p class="views">Its views, by type: ${byType.join('; ')}.</p>
          ${links([['Open the atlas', `${A.file}.html`], ...A.stories.map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]])}</div></article>`;
  return `<!doctype html>
<html lang="en">
<!-- The examples' gallery, written by tools/gallery.mjs from the models and tools/gallery.json: edit those, not this file.
     The site job (.github/workflows/check.yml) builds each model's page, PDF and pictures next to it. -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>umlimator examples</title>
<meta name="description" content="Every diagram type umlimator draws, each with all its examples, and the Atlas: real systems modelled in many views.">
<link rel="stylesheet" href="../lib/umlimator-theme.css">
<style>
  html { scroll-behavior: smooth; } @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { margin: 0; background: var(--um-bg); color: var(--um-text); font: 15px/1.55 var(--um-sans); }
  main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 56px; }
  h1 { font-size: 28px; margin: 0 0 6px; } h2 { font-size: 22px; margin: 40px 0 8px; scroll-margin-top: 64px; }
  h3 { font-size: 18px; margin: 0 0 4px; } h4 { font-size: 16px; margin: 0; }
  p { overflow-wrap: anywhere; } p.lead { color: var(--um-muted); margin: 0; max-width: 680px; }
  a { color: var(--um-accent); }
  a:focus-visible { outline: 2px solid var(--um-accent); outline-offset: 2px; border-radius: 2px; }
  .jump { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 20px -16px 0; padding: 10px 16px;
    background: var(--um-bg); border-bottom: 1px solid var(--um-border); font-weight: 600; }
  .types { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; font-size: 14px; }
  .types li { display: flex; flex-wrap: wrap; gap: 2px 12px; } .types b { color: var(--um-muted); font-weight: 600; min-width: 11em; }
  section.type { margin-top: 32px; scroll-margin-top: 56px; } section.type > p { margin: 0 0 12px; color: var(--um-muted); max-width: 760px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; }
  .card { border: 1px solid var(--um-border); border-radius: 10px; background: var(--um-panel); overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
  .card.wide { grid-column: 1 / -1; }
  /* the pictures are the light theme's: a thumbnail shows a view's left part, on the view's own background */
  .card img { display: block; width: 100%; height: auto; aspect-ratio: 2 / 1; object-fit: cover; object-position: left top; background: #fbfcfd; border-bottom: 1px solid var(--um-border); }
  .card.wide img { aspect-ratio: 3 / 1; }
  .card > div { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .card p { margin: 0; color: var(--um-muted); font-size: 14px; } .card div > p:first-of-type { flex: 1; }
  .card p.views { font-size: 13px; }
  .links { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  td { border-top: 1px solid var(--um-border); padding: 8px 10px 8px 0; vertical-align: top; } td:first-child { white-space: nowrap; }
  code { font: 13px var(--um-mono); }
  footer { margin-top: 40px; color: var(--um-muted); font-size: 13px; }
  @media (max-width: 560px) { td:first-child { white-space: normal; } .types b { min-width: 0; width: 100%; } }
</style>
<main>
  <h1>umlimator examples</h1>
  <p class="lead">Diagrams shows every type umlimator draws, each with all the examples of it the repository has, from the
    smallest view the tests draw to the stress test. Atlas shows real systems, each modelled in many views joined by
    drill-down. Open one to pan, zoom, select and go into the cards that stack.
    <a href="https://github.com/zintaen/umlimator">The repository</a>; In an app, at the end, shows the module in host
    pages.</p>
  <nav class="jump" aria-label="Sections"><a href="#diagrams">Diagrams</a><a href="#atlas">Atlas</a><a href="#apps">In an app</a></nav>

  <section id="diagrams" aria-labelledby="diagrams-h">
    <h2 id="diagrams-h">Diagrams</h2>
    <p>One group per diagram type: the map, then the 28 types in the order of the <a href="../types.html">Diagram types</a>
      page. Each card is an example of the type, a view of the Umlimator Atlas, or one of the type's test models.</p>
    <nav aria-label="Diagram types"><ul class="types">
${nav}
    </ul></nav>
${groups}
  </section>

  <section id="atlas" aria-labelledby="atlas-h">
    <h2 id="atlas-h">Atlas</h2>
    <p>Real-world use cases: a real system modelled in many views of the types above, joined by cards that open them.</p>
    <div class="grid">
${atlasCard}
    </div>
  </section>

  <section id="apps" aria-labelledby="apps-h">
    <h2 id="apps-h">In an app</h2>
    <table>
      <tr><td><a href="playground.html">Playground</a></td><td>Edit a model and see the map, its problems (<code>validate()</code>), its broken rules (<code>rules()</code>) and its layout check (<code>check()</code>); share it by link.</td></tr>
      <tr><td><a href="element.html">The element</a></td><td><code>&lt;umlimator-map src="..."&gt;</code>: a map from HTML alone, its still shown until it is drawn; the block a docs site (VitePress, Docusaurus, MkDocs) turns into it.</td></tr>
      <tr><td><a href="embed.html">A host page</a></td><td><code>render()</code> with the standalone page's pieces (views list, details panel, legend, hint line), views loaded when opened, SVG and PNG export, themes and the minimap.</td></tr>
      <tr><td><a href="live.html">Live traffic</a></td><td><code>overlay()</code> every second: flow as fast as the traffic, errors that pulse, slow lines that glow, lag on each card; the model never changes.</td></tr>
      <tr><td><a href="ask.html">Ask the map</a></td><td>Questions answered with words, the paths or reach they are about lit, and a tour; the view in sentences (<code>describe()</code>) for an AI model.</td></tr>
      <tr><td><a href="replay.html">Trace replay</a></td><td>An OpenTelemetry trace played on the map: each call along its line at its time, with its duration.</td></tr>
      <tr><td><a href="edit.html">Editing</a></td><td>The map emits <code>change</code> events; the host applies them and keeps an undo history.</td></tr>
      <tr><td><a href="class-editor.html">A class diagram editor</a></td><td>A class diagram emits <code>edit</code> events, each a transaction of commands; the host applies them with <code>apply()</code> and keeps <code>history()</code> for undo and redo.</td></tr>
      <tr><td><a href="timelapse.html">A time-lapse</a></td><td>Four releases on a slider: new cards fade in, removed ones fade out, moved ones glide; <code>diff()</code> says what changed.</td></tr>
      <tr><td><a href="drift.html">Drawn vs. seen</a></td><td><code>drift()</code>: the map against a week of traffic; lines that ran undrawn come in, idle ones fade.</td></tr>
      <tr><td><a href="https://github.com/zintaen/umlimator/blob/main/examples/layout.mjs">In Node</a></td><td><code>layout()</code> without a browser, as a check a host can run in CI on maps it generates.</td></tr>
    </table>
  </section>

  <footer>Built from <code>main</code> by the repository's CI. MIT licence.</footer>
</main>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('examples/index.html', ROOT), page());
  console.log('examples/index.html written');
}
