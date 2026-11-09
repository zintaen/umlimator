// layout() in Node, with no DOM and no browser: lays out every view of the example models and reports each view's
// longest line against its direct route. A host can run the same on the maps it generates, in CI.
//   node examples/layout.mjs [--max 3] [model.json ...]     exits 1 when a line runs more than --max times its direct route
import { readFileSync } from 'node:fs';
import { layout } from '../lib/umlimator.js';

const args = process.argv.slice(2), at = args.indexOf('--max'), max = at >= 0 ? Number(args.splice(at, 2)[1]) : 3;
const files = args.length ? args : ['bookshop', 'bike-share', 'weather', 'assistant', 'clinic'].map(n => new URL(`${n}.json`, import.meta.url));
const length = pts => pts.slice(1).reduce((a, p, i) => a + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]), 0);

let worst = 0;
for (const file of files) {
  const model = JSON.parse(readFileSync(file, 'utf8'));
  for (const view of model.views) {
    const g = layout(model, view.id);   // in Node, text widths are a font-independent estimate
    let top = { ratio: 1 };
    for (const e of g.edges) {
      const [a, b] = [e.pts[0], e.pts.at(-1)], ratio = length(e.pts) / Math.max(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
      if (ratio > top.ratio) top = { ratio, line: `${e.from} -> ${e.to}` };
    }
    worst = Math.max(worst, top.ratio);
    console.log(`${model.title.padEnd(32)} ${view.id.padEnd(11)} ${String(g.nodes.length).padStart(2)} cards ${String(g.edges.length).padStart(2)} lines` +
      `  longest ${top.ratio.toFixed(2)}x its direct route${top.line ? ` (${top.line})` : ''}`);
  }
}
if (worst > max) { console.error(`a line runs ${worst.toFixed(2)} times its direct route; the limit is ${max}`); process.exit(1); }
