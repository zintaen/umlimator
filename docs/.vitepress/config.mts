// The documentation site (GitHub Pages, under /umlimator/). The examples gallery and pages are built beside it by CI's
// site job, at /umlimator/examples/, and keep their URLs; links to them leave the site's router (target="_self").
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { defineConfig } from 'vitepress';
import umlimator from '../../lib/umlimator-markdown-it.js';

const REPO = 'https://github.com/zintaen/umlimator';
const BASE = '/umlimator/';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
// docs/ files the site leaves out: their links go to GitHub
const EXCLUDED = ['diagrams/**', 'editing.md', 'module-api.md'];   // module-api.md's releases are shown by changelog.md
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
      else if (to === 'conformance' || to === 'conformance/') t.attrSet('href', '/types.md');   // the notes' folder: the types page lists them
      else if (to.startsWith('../')) t.attrSet('href', `${REPO}/blob/main/${to.slice(3)}${hash}`);
      else if (!to.endsWith('.md') || excluded(to)) t.attrSet('href', `${REPO}/blob/main/docs/${to}${hash}`);
    }
    return open(tokens, i, options, env, self);
  };
}

// The changelog (module-api.md's releases) and the conformance notes are written for GitHub and shown here as they are: a placeholder such as
// "<label>" in their prose is text, not a tag, and nothing in them is a Vue template (v-pre).
const asIs = (p: string) => p === 'changelog.md' || p.startsWith('conformance/');
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
    for (const t of s.tokens) for (const c of t.children || []) if (c.type === 'html_inline' && c.content.startsWith('<')) c.type = 'text';
    const open = new s.Token('html_block', '', 0), close = new s.Token('html_block', '', 0);
    open.content = '<div v-pre>\n';
    close.content = '</div>\n';
    s.tokens.unshift(open);
    s.tokens.push(close);
  });
}

const guide = [
  ['Getting started', 'getting-started'], ['The model', 'model'], ['Views and layers', 'views-and-layers'],
  ['Embedding', 'embedding'], ['The standalone page', 'standalone-page'], ['Editing', 'editing'],
  ['Stories, lenses and live data', 'stories-lenses-live'], ['Command line', 'cli'], ['GitHub Action and diff', 'github-action'],
  ['MCP server', 'mcp'], ['Import and export', 'import-export'], ['Icons and icon packs', 'icon-packs'],
];
const api = [
  ['Overview', 'index'], ['render', 'render'], ['Model and schema', 'model-and-schema'], ['Apply and commands', 'apply-and-commands'],
  ['Events and state', 'events-and-state'], ['Element and plugins', 'element-and-plugins'], ['Typed diagrams', 'typed-diagrams'],
];
const conformance = [
  'uml-class', 'uml-object', 'uml-package', 'uml-composite-structure', 'uml-component', 'uml-deployment', 'uml-profile',
  'uml-use-case', 'uml-activity', 'uml-state-machine', 'uml-sequence', 'uml-communication', 'uml-interaction-overview',
  'uml-timing', 'uml-information-flow', 'sysml-requirement', 'sysml-block-definition', 'sysml-internal-block',
  'sysml-parametric', 'er', 'flowchart', 'dfd', 'c4', 'bpmn', 'mindmap', 'aws', 'gcp', 'azure',
];
const NAMES = { er: 'ER', dfd: 'Data flow', c4: 'C4', bpmn: 'BPMN', aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure', uml: 'UML', sysml: 'SysML' };
const label = (slug: string) => slug.split('-').map((w, i) => NAMES[w] || (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

export const sidebar = {
  '/guide/': [
    { text: 'Guide', items: [{ text: 'Overview', link: '/guide/' }, ...guide.map(([text, s]) => ({ text, link: `/guide/${s}` }))] },
    { text: 'Reference', items: [{ text: 'API', link: '/api/' }, { text: 'Diagram types', link: '/types' }, { text: 'Changelog', link: '/changelog' }] },
  ],
  '/api/': [{ text: 'API', items: api.map(([text, s]) => ({ text, link: s === 'index' ? '/api/' : `/api/${s}` })) }],
  '/conformance/': [
    { text: 'Diagram types', items: [{ text: 'All 28 types', link: '/types' }] },
    { text: 'Conformance notes', items: conformance.map(s => ({ text: label(s), link: `/conformance/${s}` })) },
  ],
};

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
  markdown: {
    config: md => {
      md.core.ruler.before('normalize', 'version', s => { s.src = s.src.replaceAll('@@VERSION@@', version); });
      md.use(changelog).use(umlimator).use(links).use(ghAnchors).use(plain);
    },
  },
  vite: { build: { chunkSizeWarningLimit: 1000 } },   // the changelog's page is about 700 kB
  vue: { template: { compilerOptions: { isCustomElement: t => t.startsWith('umlimator-') } } },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/guide/' },
      { text: 'API', link: '/api/', activeMatch: '^/api/' },
      { text: 'Diagram types', link: '/types', activeMatch: '^/(types|conformance/)' },
      { text: 'Examples', link: '/examples/index.html', target: '_self' },
      { text: `v${version}`, items: [
        { text: 'Changelog', link: '/changelog' },
        { text: 'npm', link: 'https://www.npmjs.com/package/umlimator' },
        { text: 'Releases', link: `${REPO}/releases` },
      ] },
    ],
    sidebar,
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'MIT licence. Not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.',
    },
  },
});
