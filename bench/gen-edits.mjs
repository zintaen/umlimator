// Writes the edit corpus, bench/edits/edits.json (docs/diagrams/notes/layout-flow.md section 4.3): pairs of a bench model
// before and after one edit, as the apply() commands that make the edit, five per view. Seeded, so the file never drifts;
// it is committed anyway, and `--check` fails when the committed file is not what this writes.
//
//   node bench/gen-edits.mjs            # write bench/edits/edits.json
//   node bench/gen-edits.mjs --check    # exit 1 when the committed file differs from what this would write
//
// The views: every map view of bench/models/*.json of up to 30 cards (the larger ones, b69 and m50's overviews, cost more
// than they tell). The edits, one of each per view: add a card with one line, remove a line, rename a card, add a line
// between two cards that have none, and move a card into a box (a view with no box takes a second added line instead).
// `touched` lists the cards the edit changes (the new card and the ends of a line added or removed, the renamed card, the
// card moved): the `moved` metric counts the other cards only.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { apply, validate } from '../lib/umlimator-all.js';
import { seeded } from '../tools/evolve/args.mjs';
import { isMain } from '../tools/main.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = resolve(ROOT, 'bench/edits/edits.json');
const SEED = 'layout-flow edits 1', CAP = 30;

const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const mapView = (m, v) => m.schemaVersion !== 2 || v.diagram == null || v.diagram === 'map';
// the lines a view draws: its own list of line ids, else every model line between two of its cards
function linesOf(m, v) {
  const ids = new Set(v.nodeIds || []), all = m.edges || [];
  if (Array.isArray(v.edges)) { const own = new Set(v.edges.filter(x => typeof x === 'string')); return all.filter(e => own.has(e.id)); }
  return all.filter(e => ids.has(e.from) && ids.has(e.to));
}
const boxesOf = v => (v.containers || []).filter(b => b && Array.isArray(b.nodeIds));

function editsOf(m, v, rnd, stem) {
  const cards = (v.nodeIds || []).filter(id => (m.nodes || []).some(n => n.id === id)), lines = linesOf(m, v);
  const joined = new Set(lines.flatMap(e => [e.from + '>' + e.to, e.to + '>' + e.from]));
  const tag = `zz-${v.id}`, out = [];
  const addLine = n => {
    const free = [];
    cards.forEach((a, i) => cards.slice(i + 1).forEach(b => { if (!joined.has(a + '>' + b)) free.push([a, b]); }));
    if (!free.length) return null;
    const [a, b] = pick(rnd, free), id = `${tag}-line${n}`;
    const cmds = [{ op: 'add', element: { id, from: a, to: b, label: 'adds' }, view: v.id }];
    if (!Array.isArray(v.edges)) cmds[0] = { op: 'add', element: { id, from: a, to: b, label: 'adds' } };
    return { kind: 'add-line', commands: cmds, touched: [a, b] };
  };
  // 1. a card with one line, from a card of the view
  { const a = pick(rnd, cards), id = `${tag}-card`, lid = `${tag}-card-line`;
    const line = { id: lid, from: a, to: id, label: 'adds' };
    out.push({ kind: 'add-card', commands: [{ op: 'add', element: { id, label: 'New step', kind: 'backend' }, view: v.id },
      Array.isArray(v.edges) ? { op: 'add', element: line, view: v.id } : { op: 'add', element: line }], touched: [id, a] }); }
  // 2. a line removed (one with an id)
  { const e = pick(rnd, lines.filter(x => typeof x.id === 'string'));
    if (e) out.push({ kind: 'remove-line', commands: [{ op: 'delete', id: e.id }], touched: [e.from, e.to] }); }
  // 3. a card renamed
  { const a = pick(rnd, cards), n = m.nodes.find(x => x.id === a);
    out.push({ kind: 'rename', commands: [{ op: 'set', id: a, path: 'label', value: `${n.label || a} (renamed)` }], touched: [a] }); }
  // 4. a line between two cards that have none
  { const e = addLine(1); if (e) out.push(e); }
  // 5. a card into a box, else a second line
  { const bx = boxesOf(v), inBox = new Set(bx.flatMap(b => b.nodeIds)), loose = cards.filter(id => !inBox.has(id) && !bx.some(b => b.id === id));
    if (bx.length && loose.length) {
      const a = pick(rnd, loose), b = pick(rnd, bx);
      const value = (v.containers || []).map(x => x === b ? { ...x, nodeIds: [...x.nodeIds, a] } : x);
      out.push({ kind: 'move-into-box', commands: [{ op: 'set', view: v.id, path: 'containers', value }], touched: [a] });
    } else { const e = addLine(2); if (e) out.push(e); } }
  return out.map((e, i) => ({ id: `${stem}/${v.id}/${i + 1}-${e.kind}`, model: `bench/models/${stem}.json`, view: v.id, ...e }));
}

export function build() {
  const pairs = [];
  for (const f of readdirSync(resolve(ROOT, 'bench/models')).filter(f => f.endsWith('.json')).sort()) {
    const stem = f.slice(0, -5), m = JSON.parse(readFileSync(resolve(ROOT, 'bench/models', f), 'utf8'));
    for (const v of m.views || []) {
      if (!mapView(m, v) || (v.nodeIds || []).length > CAP) continue;
      // each view draws from its own sequence, seeded by the corpus seed and the view's key, so adding or removing a bench
      // model or view leaves every other view's edits as they were
      for (const p of editsOf(m, v, seeded(`${SEED}/${stem}/${v.id}`), stem)) {
        const after = apply(m, p.commands); // throws on a command that cannot run: the corpus is never written broken
        const bad = validate(after).filter(x => x.level === 'error');
        if (bad.length) throw new Error(`${p.id}: the edited model does not validate: ${bad[0].message}`);
        pairs.push(p);
      }
    }
  }
  return { about: 'The edit corpus of docs/diagrams/notes/layout-flow.md section 4.3, written by bench/gen-edits.mjs (do not edit by hand): each pair is a bench model and the apply() commands of one edit; touched lists the cards the edit changes.', seed: SEED, pairs };
}

const text = () => JSON.stringify(build(), null, 1) + '\n';

if (isMain(import.meta.url)) {
  const t = text();
  if (process.argv.includes('--check')) {
    let was = ''; try { was = readFileSync(OUT, 'utf8'); } catch {}
    if (was !== t) { console.error('bench/edits/edits.json is not what bench/gen-edits.mjs writes: run node bench/gen-edits.mjs'); process.exit(1); }
    console.log('bench/edits/edits.json is up to date');
  } else {
    mkdirSync(resolve(ROOT, 'bench/edits'), { recursive: true });
    writeFileSync(OUT, t);
    console.log(`wrote bench/edits/edits.json: ${JSON.parse(t).pairs.length} pairs`);
  }
}
