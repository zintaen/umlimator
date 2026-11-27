// The examples' type pages: for each diagram type (tools/types.json's 28), one hand-authored model
// examples/types/<type>.json, the source of truth, committed, and its page examples/types/<type>.html, rendered from it.
//   The model draws ONE comprehensive example of the type: its root and first view is the main view (tools/types.json's
//   "main"), a diagram showing every element kind, line kind, marker, compartment, stereotype and option of the type that
//   can coexist in one picture. A choice that cannot coexist with it (a layout direction, a notation, a per-view
//   presentation option) is an alternative: a view of the SAME model, the main view its parent, listed in
//   tools/types.json's "alternatives" with what differs. tools/types.json also says what the main view shows ("shows",
//   a checklist in reading order), which the docs page (tools/gallery.mjs) lists.
//   node tools/types.mjs                validate and check every type's model, and render its page
//   node tools/types.mjs uml-class ...  those types' only
//   --no-html                           validate and check only (rendering needs python3)
// Any other option is refused with exit 2, before anything is checked or rendered (audit 71: a mistyped --no-html rendered
// every page named).
// It exits 1 when a model has a validate() error, more check() issues than its entry allows, or does not match its entry
// (tests/types.test.mjs checks the same). The pages are not committed (each is the whole module, 2.5 MB): CI's site job
// renders them. No dependency.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));

// a view's diagram type as the pages group it: C4's six view kinds are one type, a map view (no diagram) is the map
export const groupOf = view => { const d = view && view.diagram; return !d || d === 'map' ? 'map' : d.startsWith('c4.') ? 'c4' : d.replace('.', '-'); };
// the types: tools/types.json's families' 28, in order. The map is no type and has no page: its showcase is the first
// layer of every atlas, the Bookshop atlas's overview first (tools/gallery.json's map)
export const families = () => json('tools/types.json').families;
export const typeIds = () => families().flatMap(f => f.types);

// what tools/types.json says of each type:
// { name, text, title, intro, main, alternatives: [{ view, setting }], shows: [string], issues?, why?, pending? }
export const spec = () => json('tools/types.json');
export const modelPath = type => `examples/types/${type}.json`;
export const model = type => json(modelPath(type));

// what is wrong with a type's model against its entry, as sentences ([] when nothing): the entry's fields, the main view
// (the root, first), the alternatives (views of the model under the main view), every view of the type or a child of
// the main view
export function problems(type, m = model(type), T = spec().types[type]) {
  const out = [], say = s => out.push(`${type}: ${s}`);
  if (!T) return [`${type}: no entry in tools/types.json`];
  for (const k of ['name', 'text', 'title', 'intro', 'main']) if (typeof T[k] !== 'string' || !T[k].trim()) say(`its entry needs a ${k}`);
  if (!Array.isArray(T.shows) || !T.shows.length) say('its entry needs a "shows" checklist');
  else T.shows.forEach((s, i) => { if (typeof s !== 'string' || !s.trim()) say(`"shows" item ${i + 1} is empty`); });
  if (!Array.isArray(T.alternatives)) say('its entry needs "alternatives" (an empty list when none)');
  if (T.issues && !(typeof T.why === 'string' && T.why.length > 20)) say(`it allows ${T.issues} layout issues: say why`);
  const views = new Map((m.views || []).map(v => [v.id, v]));
  if (m.root !== T.main) say(`the model's root is ${m.root}, not the main view ${T.main}`);
  if (!m.views || !m.views.length || m.views[0].id !== T.main) say(`the main view ${T.main} is not the model's first view`);
  if (T.pending) return out;   // the old page model, an overview of variant cards, until the type's rework replaces it
  const main = views.get(T.main);
  if (!main) return [...out, `${type}: the model has no main view ${T.main}`];
  if (groupOf(main) !== type) say(`the main view ${T.main} is a ${groupOf(main)} view, not a ${type} one`);
  const alts = new Set();
  for (const a of T.alternatives || []) {
    if (!a || !a.view || !(typeof a.setting === 'string' && a.setting.trim())) { say('an alternative needs its view and its setting'); continue; }
    if (alts.has(a.view)) say(`the alternative ${a.view} is listed twice`);
    alts.add(a.view);
    const v = views.get(a.view);
    if (!v) { say(`the alternative ${a.view} is not a view of the model`); continue; }
    if (a.view === T.main) say('the main view is not an alternative of itself');
  }
  // every other view is reachable from the main view: its parent chain reaches it
  for (const v of m.views || []) if (v.id !== T.main) {
    let p = v, seen = new Set();
    while (p && p.parent && p.parent !== T.main && !seen.has(p.id)) { seen.add(p.id); p = views.get(p.parent); }
    if (!p || p.parent !== T.main) say(`view ${v.id} does not hang under the main view ${T.main}`);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const { validate, check } = await import(new URL('lib/umlimator-all.js', ROOT).href);
  const args = process.argv.slice(2), html = !args.includes('--no-html'), names = args.filter(a => !a.startsWith('-'));
  const unknown = args.find(a => a.startsWith('-') && a !== '--no-html');
  if (unknown !== undefined) { console.error(`tools/types.mjs: unknown option ${unknown}; usage: node tools/types.mjs [--no-html] [type ...]`); process.exit(2); }
  const S = spec(), all = typeIds(), want = names.length ? names : all;
  let bad = 0;
  for (const t of all) if (!S.types[t]) { console.error(`tools/types.json has no type ${t}`); bad++; }
  for (const t of Object.keys(S.types)) if (!all.includes(t)) { console.error(`tools/types.json's type ${t} is in none of its families`); bad++; }
  for (const f of readdirSync(new URL('examples/types/', ROOT)).filter(f => f.endsWith('.json') && !f.startsWith('.')))  // a hidden file is a render's temporary copy, never a type
    if (!all.includes(f.slice(0, -5))) { console.error(`examples/types/${f}: no such type; delete it`); bad++; }
  // a name given that is no type, or a type whose model is missing or not JSON: one line each, not a stack trace (audit 53)
  for (const t of want) if (!all.includes(t)) { console.error(`tools/types.mjs: no type ${t}; the types: ${all.join(', ')}`); bad++; }
  for (const t of want.filter(x => all.includes(x))) {
    let m;
    try { m = model(t); } catch (e) { console.error(`${modelPath(t)}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`); bad++; continue; }
    const T = S.types[t] || {};
    const p = problems(t, m), errs = validate(m).filter(x => x.level === 'error');
    const issues = (m.views || []).flatMap(v => check(m, v.id).map(i => i.message));
    for (const x of p) console.error(x);
    for (const e of errs) console.error(`${t}: ${e.path}: ${e.message}`);
    const allowed = T.pending ? Infinity : T.issues || 0;
    for (const i of issues) console[issues.length > allowed ? 'error' : 'log'](`${t}: ${i}`);
    const ok = !p.length && !errs.length && issues.length <= allowed;
    if (!ok) bad++;
    console.log(`${modelPath(t)}: ${ok ? 'ok' : 'NOT ok'}, ${(m.views || []).length} views, ${issues.length} layout issues (allowed ${allowed})${T.pending ? ', pending' : ''}`);
    if (html) {
      try { execFileSync('python3', ['umlimator.py', 'render', modelPath(t), '--out', `examples/types/${t}.html`, '--no-check'], { cwd: fileURLToPath(ROOT), stdio: 'inherit' }); }
      catch (e) { console.error(`tools/types.mjs: ${t}: ${e.code === 'ENOENT' ? 'no python3 to render the page (--no-html checks only)' : `render failed (exit status ${e.status})`}`); bad++; }
    }
  }
  process.exit(bad ? 1 : 0);
}
