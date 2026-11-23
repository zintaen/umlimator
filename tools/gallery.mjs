// Writes the pages of the documentation site (VitePress, docs/) that come from the models, and its one sidebar:
//   docs/types/index.md, Diagrams: a card for each of the 28 diagram types, under its family (tools/types.json's families,
//     in order). Each card shows the still of the type's main view and the first items of what it shows, and opens the
//     type's page. The map is no type: its showcase is the Bookshop atlas's overview (tools/gallery.json's map);
//   docs/types/<type>.md, a page per type that holds all the site says of it: its intro, its type page
//     (examples/types/<type>.html, tools/types.mjs: one comprehensive example of the type) live in a frame, opened on its
//     main view, the checklist of what the diagram shows and the alternatives (the same example in another setting), how to
//     write it in the model (tools/types.md's section) and what is drawn and left out (its conformance note,
//     docs/diagrams/conformance/<type>.md, as written: its links made relative to the page);
//   docs/atlas/index.md, the atlases (tools/gallery.json's atlases, in order), whole businesses each one model of many
//     types; docs/atlas/<page>.md, each atlas's page: its model live in a frame, then its views (the map's showcase view
//     with the checklist of what it draws);
//   docs/.vitepress/sidebar.json, the site's one sidebar (config.mts reads it): Start, Diagrams, Maps and atlases, Use it
//     and Reference, the hand-written pages from tools/gallery.json's docs.
// The rendered pages, their stills and PDFs are not VitePress pages: the site job (.github/workflows/check.yml) builds them
// under /umlimator/examples/, and the docs pages link them with plain hrefs (target="_self", past the router). No
// dependency. `node tools/gallery.mjs` writes the files; tests/gallery.test.mjs fails when a committed file is not what
// this writes, and when a link, picture or frame names a file the site does not serve. `node tools/gallery.mjs --docs-of
// <model>` prints the docs page a model's rendered page links back to (docsOf).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { spec as typeSpec, model as typeModel, families } from './types.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stop = msg => { throw new Error(`tools/gallery.mjs: ${msg}`); };
// tools/types.json's text: plain, with `code` in backticks
const prose = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const HEAD = '<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->';

// a view's diagram type as the pages group it: C4's six view kinds are one type, a map view (no diagram) is the map
export const groupOf = view => { const d = view && view.diagram; return !d || d === 'map' ? 'map' : d.startsWith('c4.') ? 'c4' : d.replace('.', '-'); };
// the types, in tools/types.json's families' order: [{ family, id, name, text }]
export function types() {
  const S = typeSpec().types;
  return families().flatMap(f => f.types.map(id => ({ family: f.name, id, name: S[id].name, text: S[id].text })));
}

// the conformance notes, the source of each type page's last part
export const NOTES = 'docs/diagrams/conformance/';
// tools/types.md's sections, by type id: "## <id> <id> ..." heads a section of those types
export function writing() {
  const out = {};
  for (const part of read('tools/types.md').split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n'), body = part.slice(nl + 1).trim();
    for (const id of part.slice(0, nl).trim().split(/\s+/)) out[id] = body;
  }
  return out;
}

// each type with its page: [{ family, id, name, text, alt, title, intro, main, mainTitle, shows,
//   alternatives: [{ view, title, setting }], model, note }]
export function inventory() {
  const G = json('tools/gallery.json'), S = typeSpec(), W = writing();
  return types().map(t => {
    const s = S.types[t.id] || stop(`tools/types.json has no type ${t.id}`), m = typeModel(t.id);
    const title = id => (m.views.find(v => v.id === id) || stop(`examples/types/${t.id}.json has no view ${id}`)).title || id;
    return { ...t, title: s.title, intro: s.intro, main: s.main, mainTitle: title(s.main), shows: s.shows,
      alternatives: (s.alternatives || []).map(a => ({ view: a.view, title: title(a.view), setting: a.setting })),
      alt: G.alts[t.id] || stop(`tools/gallery.json has no alt for the ${t.id} card`),
      model: W[t.id] || stop(`tools/types.md has no section for ${t.id}`), note: `${NOTES}${t.id}.md` };
  });
}
// the atlases, in order
export const atlases = () => json('tools/gallery.json').atlases.list;
// the docs page a model's rendered page belongs to, as its "Back to Docs" link (umlimator.py render --docs), relative to where
// the site job puts that page (EX, EX + 'types/'): a type's model its type page, an atlas its atlas page, another example the
// type page of its first typed view, and a map with none the maps guide. `node tools/gallery.mjs --docs-of <model>` prints it
export function docsOf(file) {
  const p = posix.normalize(String(file).replaceAll('\\', '/')), base = posix.basename(p, '.json');
  if (/(^|\/)examples\/types\/[^/]+\.json$/.test(p)) return `../../types/${base}.html`;
  const A = atlases().find(a => a.file === base); if (A) return `../atlas/${A.page}.html`;
  const v = (json(p).views || []).find(x => x && typeof x.diagram === 'string' && x.diagram !== 'map');
  return v ? `../types/${groupOf(v)}.html` : '../maps/model.html';
}

// where the site job puts the rendered pages, and a link to one of them: past VitePress's router, which serves only its
// own pages
export const EX = '/umlimator/examples/';
const out = (path, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(EX + path)}" target="_self">${text}</a>`;
// each link carries its card's name, hidden but read out, so that a links list tells the many Open, PDF and Model apart
const hidden = name => `<span class="visually-hidden"> (${esc(name)})</span>`;
const links = (xs, name) => `<div class="ex-links">${xs.map(([t, h, own]) => own ? `<a href="${esc(h)}">${esc(t)}${hidden(name)}</a>` : out(h, `${esc(t)}${hidden(name)}`)).join('')}</div>`;
const frame = (path, title) => `<div class="ex-frame"><iframe src="${esc(EX + path)}" title="${esc(title)}, live" loading="lazy"></iframe></div>`;
const front = (title, description) => `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
aside: false
pageClass: gallery-page
---

${HEAD}
`;

// Diagrams: the families, each a heading and its cards
function index() {
  const inv = inventory(), fams = families();
  const nav = fams.map(f => `<li><b>${esc(f.name)}</b> ${f.types.map(id => `<a href="./${id}.html">${esc(inv.find(t => t.id === id).name)}</a>`).join(' ')}</li>`).join('\n');
  const SHOWN = 3;
  const card = t => `<article class="ex-card" id="type-${t.id}">
<a class="ex-still" href="./${t.id}.html" tabindex="-1" aria-hidden="true"><img :src="'${EX}types/stills/${t.id}/${t.main}.png'" alt="${esc(t.alt)}" loading="lazy" width="640" height="320"></a>
<h3><a href="./${t.id}.html">${esc(t.name)}</a></h3>
<p>${esc(t.text)}</p>
<ul class="ex-shows-short">${t.shows.slice(0, SHOWN).map(s => `<li>${prose(s)}</li>`).join('')}${t.shows.length > SHOWN ? `<li><a href="./${t.id}.html#shows">${t.shows.length - SHOWN} more</a></li>` : ''}</ul>
<p class="ex-views">Opens on ${out(`types/${t.id}.html#view=${t.main}`, esc(t.mainTitle))}${t.alternatives.length ? `; also ${t.alternatives.map(a => out(`types/${t.id}.html#view=${a.view}`, esc(a.title))).join(', ')}` : ''}</p>
${links([['Open', `./${t.id}.html`, true], ['PDF', `types/${t.id}.pdf`], ['Model', `types/${t.id}.json`]], t.name)}
</article>`;
  const groups = fams.map(f => `## ${f.name} {#${f.id}}

${f.text}

<div class="ex-grid">
${f.types.map(id => card(inv.find(t => t.id === id))).join('\n')}
</div>`).join('\n\n');
  return `${front('Diagram types', 'The 28 diagram types umlimator draws besides its maps, each with one live example that shows all it draws.')}
# Diagram types

umlimator draws 28 diagram types besides its layered maps. Each is a model of schema version 2 with \`"diagram"\` set on its views, drawn by \`umlimator/all\` ([Typed diagrams](../api/typed-diagrams.md) has what they share). Each type has a page: one example, live, made up for an online bookshop and its delivery cargo e-bike, that shows everything the type draws, with a checklist of what to find in it and the settings that need a view of their own (a layout direction, a notation); then how to write the type in the model, and what of its notation is drawn and left out, and why. The map is not one of them: every [atlas](../atlas/index.md) opens on one, and the [Bookshop atlas's overview](../atlas/bookshop.md#view-overview) shows everything a map draws.

<nav class="ex-jump" aria-label="Diagram types"><ul>
${nav}
</ul></nav>

${groups}
`;
}

// a link in a conformance note, made relative to the type's page: a note's link to a note goes to that type's page
function relink(text, id) {
  const from = posix.dirname(`${NOTES}${id}.md`);
  return text.replace(/\]\(([^)\s]+)\)/g, (all, href) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return all;
    const [path, hash = ''] = href.split(/#(.*)/s);
    if (!path) return all;
    let to = posix.normalize(posix.join(from, path)), h = hash;
    const note = to.startsWith(NOTES) && /^docs\/diagrams\/conformance\/([\w-]+)\.md$/.exec(to);
    if (note) { to = `docs/types/${note[1]}.md`; h = h || 'conformance'; } else if (to === NOTES.slice(0, -1)) to = 'docs/types/index.md';
    let rel = posix.relative('docs/types', to);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `](${rel}${h ? `#${h}` : ''})`;
  });
}
// a conformance note under the page's last heading: its title dropped, its headings one level down (not in code)
function note(t) {
  const lines = read(t.note).split('\n');
  if (!/^# /.test(lines[0])) stop(`${t.note} does not start with its title`);
  let fence = false;
  const body = lines.slice(1).map(l => { if (/^\s*(```|~~~)/.test(l)) fence = !fence; return !fence && /^#{1,5} /.test(l) ? `#${l}` : l; });
  return relink(body.join('\n').trim(), t.id);
}

function typePage(t) {
  const shows = t.shows.map(x => `<li>${prose(x)}</li>`).join('\n');
  const alts = t.alternatives.map(a => `<article class="ex-variant" id="view-${esc(a.view)}">
<h3>${out(`types/${t.id}.html#view=${a.view}`, esc(a.title))}</h3>
<p>${prose(a.setting)}</p>
</article>`).join('\n');
  return `${front(t.title, `${t.text.replace(/\.$/, '')}: one example that shows all it draws, live, how to write it, and what is drawn and left out.`)}
# ${esc(t.title)}

<p class="ex-lead">${esc(t.text)} ${prose(t.intro)} The page below opens on it, ${out(`types/${t.id}.html#view=${t.main}`, esc(t.mainTitle))}, live: pan, zoom, select and go into the cards that stack.</p>

${frame(`types/${t.id}.html`, t.title)}
${links([['Open full screen', `types/${t.id}.html`], ['PDF', `types/${t.id}.pdf`], ['Model', `types/${t.id}.json`]], t.name)}

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
${shows}
</ol>
${alts ? `
## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
${alts}
</div>
` : ''}
## How to write it {#model}

The view's \`diagram\`, the types its elements, members and lines may have, and its props types, which describe \`props\` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

${t.model}

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/${t.id}.md -->

${note(t)}
`;
}

// an atlas's views, by type, with links into its page
function atlasCard(A) {
  const atlas = json(`examples/${A.file}.json`), inv = inventory();
  const byType = [...new Set(atlas.views.map(groupOf))].map(g => { const t = g === 'map' ? { name: 'Map' } : inv.find(x => x.id === g) || stop(`${A.file}: no type ${g}`);
    return `${esc(t.name)} (${atlas.views.filter(v => groupOf(v) === g).map(v => out(`${A.file}.html#view=${v.id}`, esc(v.title))).join(', ')})`; });
  return `<article class="ex-card ex-wide" id="atlas-${A.file}">
<a class="ex-still" href="./${A.page}.html" tabindex="-1" aria-hidden="true"><img :src="'${EX}stills/${A.file}/${atlas.root}.png'" alt="${esc(A.alt)}" loading="lazy" width="640" height="320"></a>
<div>
<h2><a href="./${A.page}.html">${esc(A.name)}</a></h2>
<p>${A.text}</p>
<p class="ex-views">Its views, by type: ${byType.join('; ')}.</p>
${links([['Open', `./${A.page}.html`, true], ...(A.stories || []).map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]], A.name)}
</div>
</article>`;
}

function atlasIndex() {
  const M = json('tools/gallery.json').map, show = atlases().find(A => A.file === M.atlas) || stop(`no atlas ${M.atlas}`);
  return `${front('Atlases', 'Whole businesses, each modelled as one model in many views of many diagram types that open into each other.')}
# Atlases

An atlas is one model of a whole business in many views of many diagram types, joined by cards that open them. Each opens on a map, its first layer: the [${esc(show.name)} atlas's overview](./${show.page}.md#view-${M.main}) is the map's showcase, with a checklist of everything a map draws. On any of them you can pan, zoom, select and go into the cards that stack.

<div class="ex-grid">
${atlases().map(atlasCard).join('\n')}
</div>
`;
}

function atlasPage(A) {
  const atlas = json(`examples/${A.file}.json`), inv = inventory();
  const M = json('tools/gallery.json').map, mapOf = v => M.atlas === A.file && M.main === v.id;
  const list = atlas.views.map(v => { const g = groupOf(v), t = g === 'map' ? { name: 'Map' } : inv.find(x => x.id === g) || stop(`${A.file}: no type ${g}`);
    return `<article class="ex-variant" id="view-${esc(v.id)}">
<h3>${out(`${A.file}.html#view=${v.id}`, esc(v.title))}</h3>
<p class="ex-sub">${g === 'map' ? 'Map' : `<a href="../types/${g}.html">${esc(t.name)}</a>`}</p>
<p>${(A.views || {})[v.id] || stop(`tools/gallery.json has no text for ${A.file}'s view ${v.id}`)}</p>
${mapOf(v) ? `<p>The map's showcase: what it shows, in the order you find it in the picture:</p>
<ol class="ex-shows">
${M.shows.map(x => `<li>${prose(x)}</li>`).join('\n')}
</ol>
` : ''}</article>`; }).join('\n');
  return `${front(A.name, A.description)}
# ${esc(A.name)}

<p class="ex-lead">${A.text}</p>

${frame(`${A.file}.html`, A.name)}
${links([['Open full screen', `${A.file}.html`], ...(A.stories || []).map(([t, id]) => [t, `${A.file}.html#story=${id}&step=1`]), ['PDF', `${A.file}.pdf`], ['Model', `${A.file}.json`]], A.name)}

## Its views {#views}

<div class="ex-variants">
${list}
</div>
`;
}

// the site's one sidebar: Start, Diagrams (a family of one type is its page), Maps and atlases, Use it, Reference
export function sidebar() {
  const D = json('tools/gallery.json').docs, inv = inventory(), items = xs => xs.map(([text, link]) => ({ text, link }));
  const type = id => ({ text: inv.find(t => t.id === id).name, link: `/types/${id}` });
  return [
    { text: 'Start', items: items(D.start) },
    { text: 'Diagrams', items: [{ text: 'All 28 types', link: '/types/' },
      ...families().map(f => f.types.length === 1 ? type(f.types[0]) : { text: f.name, collapsed: true, items: f.types.map(type) })] },
    { text: 'Maps and atlases', items: [...items(D.maps), { text: 'Atlases', link: '/atlas/' }, ...atlases().map(A => ({ text: A.name, link: `/atlas/${A.page}` }))] },
    { text: 'Use it', items: items(D.use) },
    { text: 'Reference', items: items(D.reference) },
  ];
}

// every file this writes: { path: text }
export function files() {
  const f = { 'docs/types/index.md': index(), 'docs/atlas/index.md': atlasIndex(), 'docs/.vitepress/sidebar.json': JSON.stringify(sidebar(), null, 1) + '\n' };
  for (const t of inventory()) f[`docs/types/${t.id}.md`] = typePage(t);
  for (const A of atlases()) {
    if (f[`docs/atlas/${A.page}.md`]) stop(`the atlas ${A.file}'s page ${A.page} is taken`);
    f[`docs/atlas/${A.page}.md`] = atlasPage(A);
  }
  return f;
}
// the folders whose every file this writes
export const DIRS = ['docs/types/', 'docs/atlas/'];

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--docs-of') console.log(docsOf(process.argv[3] ?? stop('--docs-of takes a model\'s path')));
else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = files();
  for (const d of DIRS) {
    mkdirSync(new URL(d, ROOT), { recursive: true });
    for (const old of readdirSync(new URL(d, ROOT))) if (!f[`${d}${old}`]) rmSync(new URL(`${d}${old}`, ROOT));
  }
  for (const [p, s] of Object.entries(f)) writeFileSync(new URL(p, ROOT), s);
  console.log(`${Object.keys(f).length} files written: ${Object.keys(f).join(', ')}`);
}
