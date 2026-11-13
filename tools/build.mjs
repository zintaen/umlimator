// Builds lib/umlimator.js from src/: the sources in the order below, each without its imports and its closing
// `export { … };`, every other line as written. No dependency. `npm run build`; CI fails when lib/ is stale.
// The rules a source keeps are in docs/diagrams/notes/stage-1.md §2.2.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ORDER = [
  'core/model', 'core/registry', 'core/warn', 'core/text', 'core/history', 'core/apply',
  'draw/shapes', 'draw/lines', 'draw/svg',
  'layout/layered', 'layout/audit',
  'map/kinds', 'map/typed', 'map/cards', 'map/context', 'map/api', 'map/validate', 'map/diff', 'map/insight', 'map/lens',
  'canvas/styles', 'canvas/camera', 'canvas/edit', 'canvas/render', 'canvas/pieces',
  'page/page', 'page/print',
];

const HEADER = `/*! umlimator: embeddable, layered architecture maps. MIT, see LICENSE.
 *
 *   import { render, layout, mountPage } from './umlimator.js';
 *   const map = render(element, model, { on: { select: e => ... } });   // map.update(model), map.destroy()
 *
 * Derived from the /visual page template of super-board by Eric Tech (MIT, THIRD_PARTY_NOTICES.md), whose section
 * layout adapts BuilderIO/skills (MIT) and whose diagram style, router approach and viewer UX (camera with reading
 * depths, minimap, node focus, finder, export) adapt tt-a1i/archify (MIT). See THIRD_PARTY_NOTICES.md.
 * Built from src/ by tools/build.mjs: edit the sources, not this file. No dependencies, no network calls;
 * docs/module-api.md describes the API.
 */`;

const root = new URL('../', import.meta.url);

// a source without its imports (one line each, at the top) and its export list (one line, at the end)
function body(name) {
  const lines = readFileSync(new URL(`src/${name}.js`, root), 'utf8').trimEnd().split('\n');
  let i = 0; while (i < lines.length && (lines[i].startsWith('import ') || lines[i] === '')) i++;
  let j = lines.length; if (lines[j - 1].startsWith('export {')) j--;
  return lines.slice(i, j).join('\n').trimEnd();
}

// two whole files from the same sources (stage 1 note §2.5): the core and the map, for hosts that draw maps; and every
// diagram family too, which the standalone page inlines. A family's files are listed here only, so umlimator.js does not grow;
// so is src/typed/, what only a registered type's geometry takes (the hooks in TYPED, registry.js: risks.md C5)
const ALL = [...ORDER, 'typed/layout', 'typed/draw', 'typed/edit', 'uml/owners', 'uml/class', 'uml/package', 'uml/object', 'readers/mermaid-class',
  // stage 3 (notes/stage-3.md §11, 3.0): empty until their work packages fill them, in this load order
  'layout/timeaxis', 'uml/frame', 'uml/interaction', 'uml/sequence', 'uml/communication', 'uml/convert', 'readers/mermaid-sequence',
  // stage 4 (notes/stage-4.md §19, 4.0): empty until their work packages fill them, in this load order
  'uml/transition', 'uml/flow', 'layout/lanes', 'uml/usecase', 'uml/activity', 'uml/state', 'uml/overview', 'readers/mermaid-state',
  // stage 5 (notes/stage-5.md §16, 5.0): empty until their work packages fill them, in this load order
  'uml/structure', 'uml/component', 'uml/deployment', 'uml/composite',
  // stage 6 (notes/stage-6.md §15, 6.0): empty until their work packages fill them, in this load order
  'uml/stereotypes', 'uml/profile', 'layout/timeruler', 'uml/timing'];

// every source is in ALL, and every name in ALL is a source: a file left out would be missing from lib/ silently
const found = readdirSync(new URL('src/', root), { recursive: true }).filter(f => f.endsWith('.js')).map(f => f.replaceAll('\\', '/').slice(0, -3)).sort();
if (found.join() !== [...ALL].sort().join()) throw new Error(`tools/build.mjs: ORDER and ALL list ${[...ALL].sort().join(', ')}; src/ has ${found.join(', ')}`);
for (const [name, list, what] of [['umlimator.js', ORDER, ''], ['umlimator-all.js', ALL, ' This file adds every diagram family to umlimator.js.']]) {
  const out = new URL('lib/' + name, root);
  const head = what ? HEADER.replace(/\n \*\/$/, `\n *${what}\n */`) : HEADER;
  writeFileSync(out, [head, ...list.map(body)].join('\n') + '\n');
  execFileSync(process.execPath, ['--check', fileURLToPath(out)], { stdio: 'inherit' }); // it parses
}
