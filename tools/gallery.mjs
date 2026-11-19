// Writes examples/index.html, the examples' page (the site's /umlimator/examples/), in three parts:
//   Diagrams: one card per diagram type, the map first, then the 28 in docs/types.md's order under its families. Each
//     card opens the type's own page, examples/types/<type>.html (tools/types.mjs), one multi-view page whose overview
//     has a card per example and variant of the type, and lists those views;
//   Atlas: real-world use cases, each a multi-view model of a real system. For now one: the Umlimator Atlas;
//   In an app: the module inside host pages.
// The site job (.github/workflows/check.yml) builds each page's HTML, PDF and pictures. No dependency.
// `node tools/gallery.mjs` writes the page; tests/gallery.test.mjs fails when the committed page is not what this writes,
// and when a link or picture names a file the site does not serve.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spec as typeSpec, build as buildType } from './types.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unesc = s => s.replace(/&(lt|gt|quot|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', amp: '&' })[e]);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

// each type with its page's cards, in order: [{ family, id, name, text, covers, alt, title, cards: [{ view, title }] }]
export function inventory() {
  const G = json('tools/gallery.json'), S = typeSpec();
  const T = [{ family: 'Maps', id: 'map', name: G.map.name, text: G.map.text, covers: G.map.covers },
    ...types().map(t => ({ ...t, covers: `docs/conformance/${t.id}.md` }))];
  return T.map(t => {
    const s = S.types[t.id] || stop(`tools/types.json has no type ${t.id}`), m = buildType(t.id);
    const cards = m.views.find(v => v.id === 'overview').nodeIds.map(id => { const c = m.nodes.find(n => n.id === id);
      return { view: c.opensView, title: m.views.find(v => v.id === c.opensView).title || c.label }; });
    return { ...t, title: s.title, alt: G.alts[t.id] || stop(`tools/gallery.json has no alt for the ${t.id} card`), cards };
  });
}

// each link carries its card's name, hidden but read out, so that a links list tells the many Open, PDF and Model apart
const links = (xs, name) => `<span class="links">${xs.map(([t, h]) => `<a href="${esc(h)}">${esc(t)}<span class="vh"> (${esc(name)})</span></a>`).join('')}</span>`;
const viewList = (page, vs) => `<p class="views">Examples: ${vs.map(v => `<a href="${esc(page)}#view=${esc(v.view)}">${esc(v.title)}</a>`).join(', ')}</p>`;
const card = ({ id, img, alt, title, text, list = '', ls }) => `      <article class="card"${id ? ` id="${id}"` : ''}><img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" width="640" height="320">
        <div><h4>${title}</h4><p>${text}</p>${list}
          ${links(ls, unesc(title.replace(/<[^>]+>/g, '')))}</div></article>`;

export function page() {
  const G = json('tools/gallery.json'), A = G.atlas, inv = inventory(), atlas = json(`examples/${A.file}.json`);
  const families = [...new Set(inv.map(t => t.family))];
  const nav = families.map(f => `      <li><b>${esc(f)}</b> ${inv.filter(t => t.family === f).map(t => `<a href="#type-${t.id}">${esc(t.name)}</a>`).join(' ')}</li>`).join('\n');
  // a family's cards under its heading; a card's picture is the first example on its type's page
  const groups = families.map(f => `    <section class="family" aria-labelledby="family-${slug(f)}-h">
      <h3 id="family-${slug(f)}-h">${esc(f)}</h3>
      <div class="grid">
${inv.filter(t => t.family === f).map(t => card({ id: `type-${t.id}`, img: `types/stills/${t.id}/${t.cards[0].view}.png`, alt: t.alt, title: esc(t.name),
    text: `${esc(t.text)} ${t.cards.length === 1 ? 'One example' : `${t.cards.length} examples`}.`,
    list: viewList(`types/${t.id}.html`, t.cards),
    ls: [['Open', `types/${t.id}.html`], [t.id === 'map' ? 'The model guide' : 'Conformance', `../${t.covers.slice(5).replace(/\.md$/, '.html')}`], ['PDF', `types/${t.id}.pdf`], ['Model', `types/${t.id}.json`]] })).join('\n')}
      </div>
    </section>`).join('\n');
  const byType = [...new Set(atlas.views.map(groupOf))].map(g => { const t = inv.find(x => x.id === g);
    return `${esc(t.name)} (${atlas.views.filter(v => groupOf(v) === g).map(v => `<a href="${A.file}.html#view=${esc(v.id)}">${esc(v.title)}</a>`).join(', ')})`; });
  const atlasCard = `      <article class="card wide"><img src="stills/${A.file}/${atlas.root}.png" alt="${esc(A.alt)}" loading="lazy" width="640" height="320">
        <div><h3>${esc(A.name)}</h3><p>${A.text}</p>
          <p class="views">Its views, by type: ${byType.join('; ')}.</p>
          ${links([['Open the atlas', `${A.file}.html`], ...A.stories.map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]], A.name)}</div></article>`;
  return `<!doctype html>
<html lang="en">
<!-- The examples' gallery, written by tools/gallery.mjs from the models and tools/gallery.json: edit those, not this file.
     The site job (.github/workflows/check.yml) builds each model's page, PDF and pictures next to it. -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>umlimator examples</title>
<meta name="description" content="Every diagram type umlimator draws, each on one page with all its examples, and the Atlas: umlimator's own model in many views.">
<link rel="stylesheet" href="../lib/umlimator-theme.css">
<style>
  html { scroll-behavior: smooth; scroll-padding-top: 56px; } @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { margin: 0; background: var(--um-bg); color: var(--um-text); font: 15px/1.55 var(--um-sans); }
  main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 56px; }
  h1 { font-size: 28px; margin: 0 0 6px; } h2 { font-size: 22px; margin: 40px 0 8px; }
  h3 { font-size: 18px; margin: 0 0 4px; } h4 { font-size: 16px; margin: 0; }
  p { overflow-wrap: anywhere; } p.lead { color: var(--um-muted); margin: 0; max-width: 680px; }
  a { color: var(--um-accent); }
  a:focus-visible { outline: 2px solid var(--um-accent); outline-offset: 2px; border-radius: 2px; }
  .jump { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 20px -16px 0; padding: 10px 16px;
    background: var(--um-bg); border-bottom: 1px solid var(--um-border); font-weight: 600; }
  .types { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; font-size: 14px; }
  .types li { display: flex; flex-wrap: wrap; gap: 2px 12px; } .types b { color: var(--um-muted); font-weight: 600; min-width: 11em; }
  section.family { margin-top: 28px; } section.family > h3 { margin: 0 0 12px; }
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
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-top: 1px solid var(--um-border); padding: 8px 10px 8px 0; vertical-align: top; } th { text-align: left; font-weight: 400; white-space: nowrap; }
  code { font: 13px var(--um-mono); }
  footer { margin-top: 40px; color: var(--um-muted); font-size: 13px; }
  @media (max-width: 560px) { th { white-space: normal; } .types b { min-width: 0; width: 100%; } }
</style>
<main>
  <h1>umlimator examples</h1>
  <p class="lead">Diagrams has a card for every type umlimator draws. Each opens one page holding every example and
    variant of that type: its overview has a card per example, and each card opens it. Atlas shows a real system,
    umlimator itself, modelled in many views that open into each other. In an app, at the end, shows the module inside
    host pages. On any page you can pan, zoom, select and go into the cards that stack.
    Source: <a href="https://github.com/zintaen/umlimator">the repository</a>.</p>
  <nav class="jump" aria-label="Sections"><a href="#diagrams">Diagrams</a><a href="#atlas">Atlas</a><a href="#apps">In an app</a></nav>

  <section id="diagrams" aria-labelledby="diagrams-h">
    <h2 id="diagrams-h">Diagrams</h2>
    <p>The map, then the 28 types in the order of the <a href="../types.html">Diagram types</a> page. Each card opens
      the type's page; its list goes straight to one example.</p>
    <nav aria-label="Diagram types"><ul class="types">
${nav}
    </ul></nav>
${groups}
  </section>

  <section id="atlas" aria-labelledby="atlas-h">
    <h2 id="atlas-h">Atlas</h2>
    <p>A real system modelled in many views of the types above, joined by cards that open them. For now it holds one:
      umlimator itself.</p>
    <div class="grid">
${atlasCard}
    </div>
  </section>

  <section id="apps" aria-labelledby="apps-h">
    <h2 id="apps-h">In an app</h2>
    <table>
      <tr><th scope="row"><a href="playground.html">Playground</a></th><td>Edit a model and see the map, its problems (<code>validate()</code>), its broken rules (<code>rules()</code>) and its layout check (<code>check()</code>); share it by link.</td></tr>
      <tr><th scope="row"><a href="element.html">The element</a></th><td><code>&lt;umlimator-map src="..."&gt;</code>: a map from HTML alone, its still shown until it is drawn; the block a docs site (VitePress, Docusaurus, MkDocs) turns into it.</td></tr>
      <tr><th scope="row"><a href="embed.html">A host page</a></th><td><code>render()</code> with the standalone page's pieces (views list, details panel, legend, hint line), views loaded when opened, SVG and PNG export, themes and the minimap.</td></tr>
      <tr><th scope="row"><a href="live.html">Live traffic</a></th><td><code>overlay()</code> every second: flow as fast as the traffic, errors that pulse, slow lines that glow, lag on each card; the model never changes.</td></tr>
      <tr><th scope="row"><a href="ask.html">Ask the map</a></th><td>Questions answered with words, the paths or reach they are about lit, and a tour; the view in sentences (<code>describe()</code>) for an AI model.</td></tr>
      <tr><th scope="row"><a href="replay.html">Trace replay</a></th><td>An OpenTelemetry trace played on the map: each call along its line at its time, with its duration.</td></tr>
      <tr><th scope="row"><a href="edit.html">Editing</a></th><td>The map emits <code>change</code> events; the host applies them and keeps an undo history.</td></tr>
      <tr><th scope="row"><a href="class-editor.html">A class diagram editor</a></th><td>A class diagram emits <code>edit</code> events, each a transaction of commands; the host applies them with <code>apply()</code> and keeps <code>history()</code> for undo and redo.</td></tr>
      <tr><th scope="row"><a href="timelapse.html">A time-lapse</a></th><td>Four releases on a slider: new cards fade in, removed ones fade out, moved ones glide; <code>diff()</code> says what changed.</td></tr>
      <tr><th scope="row"><a href="drift.html">Drawn vs. seen</a></th><td><code>drift()</code>: the map against a week of traffic; lines that ran undrawn come in, idle ones fade.</td></tr>
      <tr><th scope="row"><a href="https://github.com/zintaen/umlimator/blob/main/examples/layout.mjs">In Node</a></th><td><code>layout()</code> without a browser, as a check a host can run in CI on maps it generates.</td></tr>
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
