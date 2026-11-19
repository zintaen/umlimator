// Writes the examples' pages of the documentation site (VitePress, docs/), so that they share the Guide's and the API's
// layout, top nav and themes:
//   docs/examples.md (the site's /umlimator/examples.html), the index, in three parts:
//     Diagrams: one card per diagram type, the map first, then the 28 in docs/types.md's order under their families. Each
//       card opens the type's docs page and lists the type's examples, each straight to its view;
//     Atlas: real-world use cases, each a multi-view model of a real system. For now one: the Umlimator Atlas;
//     In an app: the module inside host pages;
//   docs/gallery/<type>.md, a page per type (the map and the 28): its title and what it draws, its type page
//     (examples/types/<type>.html, tools/types.mjs, one multi-view page whose overview has a card per example and variant
//     of the type) live in a frame, then each example with its card's text and a link to its view;
//   docs/gallery/atlas.md, the Umlimator Atlas's page, in the same way;
//   docs/.vitepress/gallery.json, the sidebar of those pages (config.mts reads it);
//   examples/index.html, the old address (/umlimator/examples/): a redirect to /umlimator/examples.html that keeps the
//     #fragment, so that a link to a card (#type-<id>) lands on it.
// The rendered pages, their stills and PDFs are not VitePress pages: the site job (.github/workflows/check.yml) builds them
// under /umlimator/examples/, and the docs pages link them with plain hrefs (target="_self", past the router). No
// dependency. `node tools/gallery.mjs` writes the files; tests/gallery.test.mjs fails when a committed file is not what
// this writes, and when a link, picture or frame names a file the site does not serve.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spec as typeSpec, build as buildType } from './types.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stop = msg => { throw new Error(`tools/gallery.mjs: ${msg}`); };
// tools/types.json's text: plain, with `code` in backticks
const prose = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

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

// the examples' families: docs/types.md's, with UML's split in two (the structure diagrams, then the behaviour ones)
const UML_STRUCTURE = new Set(['uml-class', 'uml-object', 'uml-package', 'uml-composite-structure', 'uml-component', 'uml-deployment', 'uml-profile']);
const familyOf = t => t.family !== 'UML' ? t.family : UML_STRUCTURE.has(t.id) ? 'UML structure' : 'UML behaviour';

// each type with its page's cards, in order: [{ family, id, name, text, covers, alt, title, cards: [{ view, title, sub, what }] }]
export function inventory() {
  const G = json('tools/gallery.json'), S = typeSpec();
  const T = [{ family: 'Maps', id: 'map', name: G.map.name, text: G.map.text, covers: G.map.covers },
    ...types().map(t => ({ ...t, family: familyOf(t), covers: `docs/conformance/${t.id}.md` }))];
  return T.map(t => {
    const s = S.types[t.id] || stop(`tools/types.json has no type ${t.id}`), m = buildType(t.id);
    const cards = m.views.find(v => v.id === 'overview').nodeIds.map(id => { const c = m.nodes.find(n => n.id === id);
      return { view: c.opensView, title: m.views.find(v => v.id === c.opensView).title || c.label, sub: c.sublabel || '', what: c.what || '' }; });
    return { ...t, title: s.title, alt: G.alts[t.id] || stop(`tools/gallery.json has no alt for the ${t.id} card`), cards };
  });
}

// where the site job puts the rendered pages, and a link to one of them: past VitePress's router, which serves only its
// own pages
export const EX = '/umlimator/examples/';
const out = (path, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(EX + path)}" target="_self">${text}</a>`;
// each link carries its card's name, hidden but read out, so that a links list tells the many Open, PDF and Model apart
const hidden = name => `<span class="visually-hidden"> (${esc(name)})</span>`;
const links = (xs, name) => `<div class="ex-links">${xs.map(([t, h, own]) => own ? `<a href="${esc(h)}">${esc(t)}${hidden(name)}</a>` : out(h, `${esc(t)}${hidden(name)}`)).join('')}</div>`;
// a docs page's other links: the conformance note or the model guide, from docs/gallery/ (up) or docs/ (here)
const docLink = (covers, up) => `${up ? '../' : './'}${covers.slice(5).replace(/\.md$/, '.html')}`;

function index() {
  const G = json('tools/gallery.json'), A = G.atlas, inv = inventory(), atlas = json(`examples/${A.file}.json`);
  const families = [...new Set(inv.map(t => t.family))];
  const nav = families.map(f => `<li><b>${esc(f)}</b> ${inv.filter(t => t.family === f).map(t => `<a href="#type-${t.id}">${esc(t.name)}</a>`).join(' ')}</li>`).join('\n');
  // a family's cards under its heading; a card's picture is the first example on its type's page
  const card = t => `<article class="ex-card" id="type-${t.id}">
<a class="ex-still" href="./gallery/${t.id}.html" tabindex="-1" aria-hidden="true"><img :src="'${EX}types/stills/${t.id}/${t.cards[0].view}.png'" alt="${esc(t.alt)}" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/${t.id}.html">${esc(t.name)}</a></h4>
<p>${esc(t.text)} ${t.cards.length === 1 ? 'One example' : `${t.cards.length} examples`}.</p>
<p class="ex-views">Examples: ${t.cards.map(c => out(`types/${t.id}.html#view=${c.view}`, esc(c.title))).join(', ')}</p>
${links([['Open', `./gallery/${t.id}.html`, true], [t.id === 'map' ? 'The model guide' : 'Conformance', docLink(t.covers), true], ['PDF', `types/${t.id}.pdf`], ['Model', `types/${t.id}.json`]], t.name)}
</article>`;
  const groups = families.map(f => `### ${esc(f)} {#family-${slug(f)}}

<div class="ex-grid">
${inv.filter(t => t.family === f).map(card).join('\n')}
</div>`).join('\n\n');
  const byType = [...new Set(atlas.views.map(groupOf))].map(g => { const t = inv.find(x => x.id === g);
    return `${esc(t.name)} (${atlas.views.filter(v => groupOf(v) === g).map(v => out(`${A.file}.html#view=${v.id}`, esc(v.title))).join(', ')})`; });
  const atlasCard = `<article class="ex-card ex-wide" id="atlas-${A.file}">
<a class="ex-still" href="./gallery/atlas.html" tabindex="-1" aria-hidden="true"><img :src="'${EX}stills/${A.file}/${atlas.root}.png'" alt="${esc(A.alt)}" loading="lazy" width="640" height="320"></a>
<div>
<h3><a href="./gallery/atlas.html">${esc(A.name)}</a></h3>
<p>${A.text}</p>
<p class="ex-views">Its views, by type: ${byType.join('; ')}.</p>
${links([['Open', './gallery/atlas.html', true], ...A.stories.map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]], A.name)}
</div>
</article>`;
  const apps = [
    ['playground.html', 'Playground', 'Edit a model and see the map, its problems (<code>validate()</code>), its broken rules (<code>rules()</code>) and its layout check (<code>check()</code>); share it by link.'],
    ['element.html', 'The element', '<code>&lt;umlimator-map src="..."&gt;</code>: a map from HTML alone, its still shown until it is drawn; the block a docs site (VitePress, Docusaurus, MkDocs) turns into it.'],
    ['embed.html', 'A host page', '<code>render()</code> with the standalone page\'s pieces (views list, details panel, legend, hint line), views loaded when opened, SVG and PNG export, themes and the minimap.'],
    ['live.html', 'Live traffic', '<code>overlay()</code> every second: flow as fast as the traffic, errors that pulse, slow lines that glow, lag on each card; the model never changes.'],
    ['ask.html', 'Ask the map', 'Questions answered with words, the paths or reach they are about lit, and a tour; the view in sentences (<code>describe()</code>) for an AI model.'],
    ['replay.html', 'Trace replay', 'An OpenTelemetry trace played on the map: each call along its line at its time, with its duration.'],
    ['edit.html', 'Editing', 'The map emits <code>change</code> events; the host applies them and keeps an undo history.'],
    ['class-editor.html', 'A class diagram editor', 'A class diagram emits <code>edit</code> events, each a transaction of commands; the host applies them with <code>apply()</code> and keeps <code>history()</code> for undo and redo.'],
    ['timelapse.html', 'A time-lapse', 'Four releases on a slider: new cards fade in, removed ones fade out, moved ones glide; <code>diff()</code> says what changed.'],
    ['drift.html', 'Drawn vs. seen', '<code>drift()</code>: the map against a week of traffic; lines that ran undrawn come in, idle ones fade.'],
  ].map(([h, t, d]) => `<tr><th scope="row">${out(h, t)}</th><td>${d}</td></tr>`);
  apps.push('<tr><th scope="row"><a href="https://github.com/zintaen/umlimator/blob/main/examples/layout.mjs">In Node</a></th><td><code>layout()</code> without a browser, as a check a host can run in CI on maps it generates.</td></tr>');
  return `---
title: Examples
description: "Every diagram type umlimator draws, each on one page with all its examples, and the Atlas: umlimator's own model in many views."
aside: false
pageClass: examples-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Examples

Diagrams has a card for every type umlimator draws. Each opens the type's page, which holds every example and variant of that type live: its overview has a card per example, and each card opens it. Atlas shows a real system, umlimator itself, modelled in many views that open into each other. In an app, at the end, shows the module inside host pages. On any diagram you can pan, zoom, select and go into the cards that stack.

## Diagrams {#diagrams}

The map, then the 28 types in the order of the [Diagram types](./types.md) page. Each card opens the type's page; its list goes straight to one example.

<nav class="ex-jump" aria-label="Diagram types"><ul>
${nav}
</ul></nav>

${groups}

## Atlas {#atlas}

A real system modelled in many views of the types above, joined by cards that open them. For now it holds one: umlimator itself.

<div class="ex-grid">
${atlasCard}
</div>

## In an app {#apps}

<table class="ex-apps">
${apps.join('\n')}
</table>
`;
}

// a type's page, or the atlas's: the live page in a frame, with a link to it full screen, then its views
const frame = (path, title) => `<div class="ex-frame"><iframe src="${esc(EX + path)}" title="${esc(title)}, live" loading="lazy"></iframe></div>`;

function typePage(t) {
  const n = t.cards.length;
  const list = t.cards.map(c => `<article class="ex-variant" id="view-${esc(c.view)}">
<h3>${out(`types/${t.id}.html#view=${c.view}`, esc(c.title))}</h3>
${c.sub ? `<p class="ex-sub">${prose(c.sub)}</p>\n` : ''}<p>${prose(c.what)}</p>
</article>`).join('\n');
  return `---
title: ${JSON.stringify(t.title)}
description: ${JSON.stringify(`${t.text.replace(/\.$/, '')}: ${n === 1 ? 'one example' : `${n} examples`}, live.`)}
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# ${esc(t.title)}

<p class="ex-lead">${esc(t.text)} The page below holds ${n === 1 ? 'its one example' : `its ${n} examples`}: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

${frame(`types/${t.id}.html`, t.title)}
${links([['Open full screen', `types/${t.id}.html`], [t.id === 'map' ? 'The model guide' : 'Conformance', docLink(t.covers, true), true], ['PDF', `types/${t.id}.pdf`], ['Model', `types/${t.id}.json`]], t.name)}

## The examples {#examples}

<div class="ex-variants">
${list}
</div>
`;
}

function atlasPage() {
  const A = json('tools/gallery.json').atlas, atlas = json(`examples/${A.file}.json`), inv = inventory();
  const list = atlas.views.map(v => { const t = inv.find(x => x.id === groupOf(v));
    return `<article class="ex-variant" id="view-${esc(v.id)}">
<h3>${out(`${A.file}.html#view=${v.id}`, esc(v.title))}</h3>
<p class="ex-sub">${esc(t.name)}</p>
<p>${A.views[v.id] || stop(`tools/gallery.json has no text for the atlas's view ${v.id}`)}</p>
</article>`; }).join('\n');
  return `---
title: ${JSON.stringify(A.name)}
description: Umlimator's own model, drawn with umlimator, in many views that open into each other.
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# ${esc(A.name)}

<p class="ex-lead">${A.text}</p>

${frame(`${A.file}.html`, A.name)}
${links([['Open full screen', `${A.file}.html`], ...A.stories.map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]], A.name)}

## Its views {#views}

<div class="ex-variants">
${list}
</div>
`;
}

// the sidebar of the examples' pages: the index, the types by family, the atlas
export function sidebar() {
  const inv = inventory(), A = json('tools/gallery.json').atlas;
  return [
    { text: 'Examples', items: [{ text: 'All examples', link: '/examples' }] },
    ...[...new Set(inv.map(t => t.family))].map(f => ({ text: f, collapsed: false,
      items: inv.filter(t => t.family === f).map(t => ({ text: t.name, link: `/gallery/${t.id}` })) })),
    { text: 'Atlas', items: [{ text: A.name, link: '/gallery/atlas' }] },
  ];
}

// the old address of the examples: kept, as a redirect that keeps the #fragment (a script; a meta refresh and a link
// without it)
export const redirect = () => `<!doctype html>
<html lang="en">
<!-- Written by tools/gallery.mjs: the examples are on the documentation site's Examples page (docs/examples.md). -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>umlimator examples</title>
<link rel="canonical" href="../examples.html">
<script>location.replace('../examples.html' + location.hash);</script>
<meta http-equiv="refresh" content="0; url=../examples.html">
<main>
  <h1>umlimator examples</h1>
  <p>The examples are on the <a href="../examples.html">Examples page</a>.</p>
</main>
`;

// every file this writes: { path: text }
export function files() {
  const f = { 'docs/examples.md': index(), 'docs/gallery/atlas.md': atlasPage(), 'docs/.vitepress/gallery.json': JSON.stringify(sidebar(), null, 1) + '\n', 'examples/index.html': redirect() };
  for (const t of inventory()) f[`docs/gallery/${t.id}.md`] = typePage(t);
  return f;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = files();
  mkdirSync(new URL('docs/gallery/', ROOT), { recursive: true });
  for (const old of readdirSync(new URL('docs/gallery/', ROOT))) if (!f[`docs/gallery/${old}`]) rmSync(new URL(`docs/gallery/${old}`, ROOT));
  for (const [p, s] of Object.entries(f)) writeFileSync(new URL(p, ROOT), s);
  console.log(`${Object.keys(f).length} files written: ${Object.keys(f).join(', ')}`);
}
