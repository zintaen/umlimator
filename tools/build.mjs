// Builds lib/umlimator.js from src/: the sources in the order below, each without its imports and its closing
// `export { … };`, every other line as written. No dependency. `npm run build`; CI fails when lib/ is stale.
// The rules a source keeps are in docs/diagrams/notes/stage-1.md §2.2.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ORDER = [
  'core/model', 'core/registry', 'core/warn', 'core/text', 'core/history',
  'draw/shapes', 'draw/lines', 'draw/svg',
  'layout/layered', 'layout/audit',
  'map/kinds', 'map/typed', 'map/cards', 'map/context', 'map/api', 'map/validate', 'map/diff', 'map/insight', 'map/lens',
  'canvas/styles', 'canvas/camera', 'canvas/render', 'canvas/pieces',
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

// every source is in ORDER, and every name in ORDER is a source: a file left out would be missing from lib/ silently
const found = readdirSync(new URL('src/', root), { recursive: true }).filter(f => f.endsWith('.js')).map(f => f.replaceAll('\\', '/').slice(0, -3)).sort();
if (found.join() !== [...ORDER].sort().join()) throw new Error(`tools/build.mjs: ORDER lists ${[...ORDER].sort().join(', ')}; src/ has ${found.join(', ')}`);

const out = new URL('lib/umlimator.js', root);
writeFileSync(out, [HEADER, ...ORDER.map(body)].join('\n') + '\n');
execFileSync(process.execPath, ['--check', fileURLToPath(out)], { stdio: 'inherit' }); // it parses
