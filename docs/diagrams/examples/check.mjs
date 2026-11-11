// Checks the target examples against docs/diagrams/model.md: node docs/diagrams/examples/check.mjs
// Structure only: the library's typed core checks (ids, types, ownership, ends), then what model.md says of each type
// (diagram names, props that name elements, sequence and timing order). It draws nothing. An example whose type draws
// moves to examples/ (plan.md §2, item 10) and is listed in MOVED, where it is checked as before.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typedProblems } from '../../../src/core/model.js';

const DIAGRAMS = ['uml.class', 'uml.object', 'uml.package', 'uml.composite-structure', 'uml.component', 'uml.deployment', 'uml.profile',
  'uml.use-case', 'uml.activity', 'uml.state-machine', 'uml.sequence', 'uml.communication', 'uml.interaction-overview', 'uml.timing',
  'uml.information-flow', 'sysml.requirement', 'sysml.block-definition', 'sysml.internal-block', 'sysml.parametric', 'er', 'flowchart',
  'dfd', 'c4', 'bpmn', 'mindmap', 'aws', 'gcp', 'azure']; // in file order: 01 to 28
const C4 = ['c4.landscape', 'c4.context', 'c4.container', 'c4.component', 'c4.dynamic', 'c4.deployment'];
const TYPE = /^[a-z0-9]+\.[A-Z][A-Za-z0-9]*$/; // in the examples every element is typed, though a version-2 model may hold untyped cards
const REF = ['replyTo', 'attachedTo', 'references', 'container', 'after'], REFS = ['conveyed', 'covers', 'extensionPoints', 'categoryValueRef']; // props that name elements

// the target examples that moved to examples/ when their type drew: the name they had here, and where they are now
export const MOVED = { '01-class.json': '../../../examples/sales-classes.json' };

// all 28 target examples, those still here and those that moved, in file order: [name, its URL]
export function targets() {
  const here = new URL('./', import.meta.url), names = [...readdirSync(here).filter(f => /^\d\d-.*\.json$/.test(f)), ...Object.keys(MOVED)].sort();
  return names.map(f => [f, new URL(Object.hasOwn(MOVED, f) ? MOVED[f] : f, here)]);
}

export function check(model, expected) {
  // ids, types, ownership, edge ends and typed views: the library's own checks (src/core/model.js)
  const out = typedProblems(model).map(p => `${p.path}: ${p.message}`), say = m => out.push(m), ids = new Set(), all = [], arr = x => (Array.isArray(x) ? x : []);
  if (model.schemaVersion !== 2) say('schemaVersion is not 2');
  const add = (x, typed = true) => { if (!x || typeof x.id !== 'string') return; ids.add(x.id); all.push(x);
    if (typed && !TYPE.test(x.type || '')) say(`${x.id}: type ${JSON.stringify(x.type)} is not <notation>.<Name>`); arr(x.members).forEach(m => add(m)); };
  const views = arr(model.views), vids = new Set(views.map(v => v.id)), inline = v => arr(v.edges).filter(e => e && typeof e === 'object');
  arr(model.nodes).forEach(n => add(n)); arr(model.edges).forEach(e => add(e));
  views.forEach(v => { inline(v).forEach(e => add(e)); arr(v.fragments).forEach(f => add(f)); arr((v.timeline || {}).constraints).forEach(c => add(c)); });
  const has = (id, what) => { if (id != null && !ids.has(id)) say(`${what}: ${JSON.stringify(id)} is not an element`); };
  const N = new Map(arr(model.nodes).map(n => [n.id, n]));
  arr(model.edges).forEach(e => { if (e && e.type == null) ['from', 'to'].forEach(k => has(e[k], `edge ${e.id}.${k}`)); }); // an untyped edge: the core leaves it to the map's checks
  all.forEach(x => { const p = x.props || {}; // props that name other elements, or a view: a type's own checks, later
    REF.forEach(k => has(p[k], `${x.id}.props.${k}`)); REFS.forEach(k => arr(p[k]).forEach(id => has(id, `${x.id}.props.${k}`)));
    if (p.refersTo != null && !vids.has(p.refersTo)) say(`${x.id}.props.refersTo: ${p.refersTo} is not a view`); });
  if (!views.length) say('no views');
  if (model.root != null && !vids.has(model.root)) say(`root ${model.root} is not a view`);
  views.forEach(v => {
    const at = `view ${v.id}`, ok = expected === 'c4' ? C4.includes(v.diagram) : DIAGRAMS.includes(v.diagram) || C4.includes(v.diagram);
    if (!ok) say(`${at}: diagram ${JSON.stringify(v.diagram)} is not one of model.md's`);
    if (v.parent != null && !vids.has(v.parent)) say(`${at}: parent ${v.parent} is not a view`);
    if (v.diagram === 'uml.sequence') { // a message's parent is an operand, and an operand's messages are next to each other in time
      const ops = new Map(arr(v.fragments).flatMap(f => arr(f.members).map(o => [o.id, f]))), msgs = inline(v); // an operand's id, and its fragment
      const inside = (m, o) => { for (let p = m.parent; p != null; p = (ops.get(p) || {}).parent) if (p === o) return true; return false; };
      msgs.forEach(m => { if (m.parent != null && !ops.has(m.parent)) say(`message ${m.id}: its parent ${m.parent} is not an operand of ${at}`); });
      ops.forEach((f, o) => { const i = msgs.map((m, k) => (inside(m, o) ? k : -1)).filter(k => k >= 0);
        if (i.length && i[i.length - 1] - i[0] + 1 !== i.length) say(`operand ${o}: its messages are not next to each other in time`); });
    }
    const t = v.timeline; // a timing view: each change is on a lifeline of the view, in one of its states, no earlier than the one before
    if (t) { const last = {}, changes = new Set(arr(t.changes).map(c => c.id));
      arr(t.changes).forEach(c => { const n = arr(v.nodeIds).includes(c.lifeline) && N.get(c.lifeline);
        if (!n) say(`change ${c.id}: ${JSON.stringify(c.lifeline)} is not a lifeline of ${at}`);
        else if (!arr((n.props || {}).states).includes(c.state)) say(`change ${c.id}: ${JSON.stringify(c.state)} is not one of ${c.lifeline}'s states`);
        if (!(c.at >= (last[c.lifeline] ?? -Infinity))) say(`change ${c.id}: its time is before the change before it`); last[c.lifeline] = c.at; });
      arr(t.constraints).forEach(c => ['from', 'to'].forEach(k => { if (c[k] != null && !changes.has(c[k])) say(`constraint ${c.id}.${k}: ${JSON.stringify(c[k])} is not a change`); })); }
  });
  all.forEach(n => { if (n.opensView != null && !vids.has(n.opensView)) say(`${n.id} opens ${n.opensView}, which is not a view`); });
  const first = views[0] && views[0].diagram;
  if (expected && !(expected === 'c4' ? C4.includes(first) : first === expected)) say(`the first view is ${JSON.stringify(first)}, expected ${expected}`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = targets(), files = all.map(([f]) => f);
  let bad = 0;
  for (const [f, url] of all) {
    let problems;
    try { problems = check(JSON.parse(readFileSync(url, 'utf8')), DIAGRAMS[+f.slice(0, 2) - 1]); } catch (e) { problems = [String(e.message)]; }
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${f}${Object.hasOwn(MOVED, f) ? ' (moved: ' + MOVED[f].replace(/^(\.\.\/)+/, '') + ')' : ''}`); problems.forEach(p => console.log('     ' + p)); bad += problems.length ? 1 : 0;
  }
  const missing = DIAGRAMS.map((d, i) => String(i + 1).padStart(2, '0')).filter(n => !files.some(f => f.startsWith(n + '-')));
  if (missing.length) console.log('no example yet for: ' + missing.join(', '));
  console.log(`${files.length} examples, ${bad} with problems`);
  process.exit(bad || missing.length ? 1 : 0);
}
