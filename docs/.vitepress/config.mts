// The documentation site (GitHub Pages, under /umlimator/): one Docs with one sidebar (sidebar.json), in reading order:
// Start, Diagrams, Maps and atlases, Use it, Reference. The Diagrams pages (types/) and the atlases' (atlas/) and the
// sidebar are written by tools/gallery.mjs; the rendered example pages, their pictures and PDFs are built beside the site
// by CI's site job, at /umlimator/examples/, and links to them leave the site's router (target="_self").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { defineConfig } from 'vitepress';
import umlimator from '../../lib/umlimator-markdown-it.js';

const REPO = 'https://github.com/zintaen/umlimator';
const BASE = '/umlimator/';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
// the one sidebar: written by tools/gallery.mjs
export const sidebar = JSON.parse(readFileSync(new URL('./sidebar.json', import.meta.url), 'utf8'));
// docs/ files the site leaves out: their links go to GitHub
const EXCLUDED = ['diagrams/**', 'editing.md', 'module-api.md'];   // module-api.md's releases are shown by changelog.md
// a page tools/gallery.mjs writes: it holds that script's HEAD note
const generated = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').includes('<!-- Written by tools/gallery.mjs ');
const excluded = (p: string) => p.startsWith('diagrams/') || p === 'editing.md' || p === 'module-api.md';

// A heading's id as GitHub makes it, for the pages written for GitHub: a link to "#0210-..." there goes to "_0-21-0-..."
// here (a core rule after the headings get their ids, as a link's renderer sees only its line)
function ghAnchors(md) {
  md.core.ruler.push('gh-anchors', s => {
    const ids = new Map(), seen = new Map(), ours = new Set();
    s.tokens.forEach((t, j) => {
      const id = t.type === 'heading_open' && t.attrGet('id');
      if (!id) return;
      const text = (s.tokens[j + 1].children || []).filter(c => c.type === 'text' || c.type === 'code_inline').map(c => c.content).join('').trim(); // less the anchor's space
      const g = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-'), n = seen.get(g) || 0;
      seen.set(g, n + 1); ids.set(n ? `${g}-${n}` : g, id); ours.add(id);
    });
    for (const t of s.tokens) for (const c of t.children || []) {
      const href = c.type === 'link_open' && c.attrGet('href');
      if (!href || !href.startsWith('#')) continue;
      let h; try { h = decodeURIComponent(href.slice(1)); } catch { continue; }
      if (!ours.has(h) && ids.has(h)) c.attrSet('href', `#${ids.get(h)}`);
    }
  });
}

// A relative link to a file outside docs/, or to a docs/ file that is not a page here, goes to GitHub; a link to
// /examples/... goes to the gallery beside the site, past the router.
function links(md) {
  const open = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    const t = tokens[i], href = t.attrGet('href') || '';
    if (href.startsWith('/examples/')) {
      t.attrSet('href', BASE + href.slice(1));
      t.attrSet('target', '_self');
    } else if (href && !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) {
      const [path, hash = ''] = href.split(/(?=#)/), to = posix.normalize(posix.join(posix.dirname(env.relativePath), path));
      if (to === 'module-api.md' && !hash) t.attrSet('href', '/changelog.md');   // with an anchor: the design note's, on GitHub
      else if (to.startsWith('../')) t.attrSet('href', `${REPO}/blob/main/${to.slice(3)}${hash}`);
      else if (!to.endsWith('.md') || excluded(to)) t.attrSet('href', `${REPO}/blob/main/docs/${to}${hash}`);
    }
    return open(tokens, i, options, env, self);
  };
}

// The changelog (module-api.md's releases) and the conformance notes (the last part of each type's page, from its marker
// on) are written for GitHub and shown here as they are: a placeholder such as "<label>" in their prose is text, not a
// tag, and nothing in them is a Vue template (v-pre).
const NOTE = '<!-- the conformance note, as written:';
const asIs = (p: string) => p === 'changelog.md' || /^types\/(?!index\.md$)[\w-]+\.md$/.test(p);
// docs/module-api.md from its first release section (the API reference covers the design note above it), read at each
// build since the file grows at its end; the host application an early release was checked in is not named here.
const RELEASES = '<!-- the releases: docs/module-api.md from its first "## 0." section, put here by config.mts -->';
function releases() {
  const lines = readFileSync(new URL('../module-api.md', import.meta.url), 'utf8').split('\n'), first = lines.findIndex(l => l.startsWith('## 0.'));
  return lines.slice(first).join('\n').replace(/(?<!SQL)Alchemy/g, 'the host');
}
function changelog(md) {
  // before parsing, so the page, its outline and the local search index (which renders the page too) all get it
  md.core.ruler.before('normalize', 'changelog', s => { if (s.env.relativePath === 'changelog.md') s.src = s.src.replace(RELEASES, releases); });
}

function plain(md) {
  md.core.ruler.push('as-is', s => {
    if (!asIs(s.env.relativePath || '')) return;
    const from = s.env.relativePath === 'changelog.md' ? 0 : s.tokens.findIndex(t => t.type === 'html_block' && t.content.startsWith(NOTE));
    if (from < 0) return;
    for (const t of s.tokens.slice(from)) for (const c of t.children || []) if (c.type === 'html_inline' && c.content.startsWith('<')) c.type = 'text';
    const open = new s.Token('html_block', '', 0), close = new s.Token('html_block', '', 0);
    open.content = '<div v-pre>\n';
    close.content = '</div>\n';
    s.tokens.splice(from, 0, open);
    s.tokens.push(close);
  });
}

export default defineConfig({
  title: 'umlimator',
  description: 'Layered architecture maps and 28 diagram types you can click through, from one JSON model.',
  lang: 'en',
  base: BASE,
  cleanUrls: false,
  srcExclude: EXCLUDED,
  lastUpdated: false,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }]],
  // links to the gallery and its pages, built beside the site by CI
  ignoreDeadLinks: [/^\/examples\//],
  // one contentinfo landmark per page: a doc page has its own footer (VPDocFooter), and the site footer (themeConfig.footer)
  // shows beside it on a page with no sidebar, so the site footer is a home page's only (audit 17)
  transformPageData(page) {
    if (page.frontmatter.layout !== 'home') page.frontmatter.footer ??= false;
    // a page tools/gallery.mjs writes (types/, atlas/) has no edit link: its next run would overwrite the edit, and
    // tests/gallery.test.mjs fails on it until then (audit 57)
    if (generated(page.filePath)) page.frontmatter.editLink = false;
  },
  markdown: {
    // code blocks at WCAG AA (4.5:1) on VitePress's block background in both themes: Shiki's default github-light and
    // github-dark have keywords, parameters and comments under it (audit 17)
    theme: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
    config: md => {
      md.core.ruler.before('normalize', 'version', s => { s.src = s.src.replaceAll('@@VERSION@@', version); });
      md.use(changelog).use(umlimator).use(links).use(ghAnchors).use(plain);
    },
  },
  vite: {
    build: { chunkSizeWarningLimit: 1000 },   // the changelog's page is about 700 kB
    // the home page and the 404 page in a main landmark: VPContent's VPHome and NotFound, each a <div>, drawn inside
    // <main> (theme/VPHomeMain.vue, audit 17; theme/NotFoundMain.vue, audit 18)
    resolve: { alias: [
      { find: /^\.\/VPHome\.vue$/, replacement: fileURLToPath(new URL('./theme/VPHomeMain.vue', import.meta.url)) },
      { find: /^\.\.\/NotFound\.vue$/, replacement: fileURLToPath(new URL('./theme/NotFoundMain.vue', import.meta.url)) },
      // a collapsible sidebar group is one button with aria-expanded, not a button in a button (theme/VPSidebarItem.vue, audit 57)
      { find: /^\.\/VPSidebarItem\.vue$/, replacement: fileURLToPath(new URL('./theme/VPSidebarItem.vue', import.meta.url)) },
    ] },
  },
  vue: { template: { compilerOptions: { isCustomElement: t => t.startsWith('umlimator-') } } },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Docs', link: '/', activeMatch: '^/(?!atlas/)' },
      { text: 'Atlas', link: '/atlas/', activeMatch: '^/atlas/' },
      { text: `v${version}`, items: [
        { text: 'Changelog', link: '/changelog' },
        { text: 'npm', link: 'https://www.npmjs.com/package/umlimator' },
        { text: 'Releases', link: `${REPO}/releases` },
      ] },
    ],
    sidebar,
    socialLinks: [
      { icon: 'github', link: REPO },
      // the maintainers' Buy Me a Coffee page (also .github/FUNDING.yml and package.json's funding), drawn as a cup
      { icon: { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8zm13 1h1.5a2.5 2.5 0 0 1 0 5H17v-1.6h1.5a.9.9 0 0 0 0-1.8H17V9zM3 20h16v1.5H3V20zM8 2.5c.8.8.8 1.7 0 2.5s-.8 1.7 0 2.5H6.6c-.8-.8-.8-1.7 0-2.5s.8-1.7 0-2.5H8zm4 0c.8.8.8 1.7 0 2.5s-.8 1.7 0 2.5h-1.4c-.8-.8-.8-1.7 0-2.5s.8-1.7 0-2.5H12z"/></svg>' },
        link: 'https://buymeacoffee.com/cyberskill', ariaLabel: 'Buy Me a Coffee' },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    // the changelog's releases are docs/module-api.md's, put in by changelog(): its link edits them there (audit 57).
    // VitePress serializes this function for the browser, so it names the repository itself
    editLink: { pattern: ({ filePath }) => `https://github.com/zintaen/umlimator/edit/main/docs/${filePath === 'changelog.md' ? 'module-api.md' : filePath}`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'Released under the MIT License. Not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.',
      copyright: 'Like umlimator? Support it on <a href="https://buymeacoffee.com/cyberskill">Buy Me a Coffee</a> or <a href="https://github.com/sponsors/zintaen">GitHub Sponsors</a>.',
    },
  },
});
