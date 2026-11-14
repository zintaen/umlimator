// Checks the target examples against docs/diagrams/model.md: node docs/diagrams/examples/check.mjs
// Structure only: the library's typed core checks (ids, types, ownership, ends), then what model.md says of each type
// (diagram names, props that name elements), then a registered type's own validators' errors (a sequence's order is the
// type's: notes/spike-sequence.md risk 4.8; a timing view's changes and constraints are the timing type's, 6.6). It
// draws nothing. An example whose type draws moves to examples/ (plan.md §2, item 10) and is listed in MOVED, where it is
// checked as before.
// What a registered type's props
// name comes from its own declaration (the registry's `refs`); model.md's hand list covers the types not registered yet.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typedProblems } from '../../../src/core/model.js';
import { diagramOf } from '../../../src/core/registry.js';
import '../../../src/uml/class.js'; // registers uml.class
import '../../../src/uml/sequence.js'; // registers uml.sequence
import '../../../src/uml/usecase.js'; // registers uml.use-case
import '../../../src/uml/activity.js'; // registers uml.activity
import '../../../src/uml/state.js'; // registers uml.state-machine
import '../../../src/uml/overview.js'; // registers uml.interaction-overview
import '../../../src/uml/component.js'; // registers uml.component
import '../../../src/uml/deployment.js'; // registers uml.deployment
import '../../../src/uml/composite.js'; // registers uml.composite-structure
import '../../../src/uml/profile.js'; // registers uml.profile
import '../../../src/uml/timing.js'; // registers uml.timing
import '../../../src/mindmap/mindmap.js'; // registers mindmap (4a.7)
import '../../../src/cloud/cloud.js'; // registers gcp and azure; aws only under CLOUD_AWS (4a.7)
import '../../../src/bpmn/process.js'; // registers bpmn (4b.5)

const DIAGRAMS = ['uml.class', 'uml.object', 'uml.package', 'uml.composite-structure', 'uml.component', 'uml.deployment', 'uml.profile',
  'uml.use-case', 'uml.activity', 'uml.state-machine', 'uml.sequence', 'uml.communication', 'uml.interaction-overview', 'uml.timing',
  'uml.information-flow', 'sysml.requirement', 'sysml.block-definition', 'sysml.internal-block', 'sysml.parametric', 'er', 'flowchart',
  'dfd', 'c4', 'bpmn', 'mindmap', 'aws', 'gcp', 'azure']; // in file order: 01 to 28
const C4 = ['c4.landscape', 'c4.context', 'c4.container', 'c4.component', 'c4.dynamic', 'c4.deployment'];
const TYPE = /^[a-z0-9]+\.[A-Z][A-Za-z0-9]*$/; // in the examples every element is typed, though a version-2 model may hold untyped cards
const REF = ['replyTo', 'attachedTo', 'references', 'container'], REFS = ['conveyed', 'covers', 'extensionPoints', 'categoryValueRef']; // props that name elements

// the target examples that moved to examples/ when their type drew: the name they had here, and where they are now
export const MOVED = { '01-class.json': '../../../examples/sales-classes.json', '02-object.json': '../../../examples/order-objects.json', '03-package.json': '../../../examples/bookshop-packages.json', '11-sequence.json': '../../../examples/checkout-sequence.json', '12-communication.json': '../../../examples/checkout-communication.json',
  '08-use-case.json': '../../../examples/shopping-use-cases.json', '09-activity.json': '../../../examples/fulfil-activity.json', '10-state-machine.json': '../../../examples/order-states.json',
  '13-interaction-overview.json': '../../../examples/buy-book-overview.json',
  '04-composite-structure.json': '../../../examples/order-service-structure.json', '05-component.json': '../../../examples/bookshop-components.json', '06-deployment.json': '../../../examples/bookshop-deployment.json',
  '07-profile.json': '../../../examples/bookshop-profile.json', '14-timing.json': '../../../examples/bookshop-timing.json',
  '15-information-flow.json': '../../../examples/order-information-flow.json', '20-entity-relationship.json': '../../../examples/bookshop-schema.json',
  '21-flowchart.json': '../../../examples/returns-flowchart.json', '22-data-flow.json': '../../../examples/bookshop-data-flow.json', '23-c4.json': '../../../examples/bookshop-c4.json',
  '16-requirement.json': '../../../examples/ebike-requirements.json', '17-block-definition.json': '../../../examples/ebike-blocks.json',
  '18-internal-block.json': '../../../examples/ebike-structure.json', '19-parametric.json': '../../../examples/ebike-range.json',
  '24-bpmn.json': '../../../examples/bookshop-order-to-shipment.json',
  '25-mindmap.json': '../../../examples/bookshop-opening-plan.json', '27-gcp.json': '../../../examples/bookshop-gcp.json', '28-azure.json': '../../../examples/bookshop-azure.json' };

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
  arr(model.edges).forEach(e => { if (e && e.type == null) ['from', 'to'].forEach(k => has(e[k], `edge ${e.id}.${k}`)); }); // an untyped edge: the core leaves it to the map's checks
  const T = diagramOf({ diagram: expected }), declared = T && T.refs; // a registered type's refs, else the hand list
  all.forEach(x => { const p = x.props || {}; // props that name other elements, or a view
    if (declared) Object.keys(Object.hasOwn(declared, x.type) ? declared[x.type] : {}).forEach(k => [].concat(k.split('.').reduce((o, j) => o && o[j], x)).forEach(id => has(id, `${x.id}.${k}`)));
    else { REF.forEach(k => has(p[k], `${x.id}.props.${k}`)); REFS.forEach(k => arr(p[k]).forEach(id => has(id, `${x.id}.props.${k}`))); }
    if (p.refersTo != null && !vids.has(p.refersTo)) say(`${x.id}.props.refersTo: ${p.refersTo} is not a view`); });
  if (!views.length) say('no views');
  if (model.root != null && !vids.has(model.root)) say(`root ${model.root} is not a view`);
  views.forEach(v => {
    const at = `view ${v.id}`, ok = expected === 'c4' ? C4.includes(v.diagram) : DIAGRAMS.includes(v.diagram) || C4.includes(v.diagram);
    if (!ok) say(`${at}: diagram ${JSON.stringify(v.diagram)} is not one of model.md's`);
    if (v.parent != null && !vids.has(v.parent)) say(`${at}: parent ${v.parent} is not a view`);
    const VT = diagramOf(v); // a registered type's rules: its errors (a sequence's operands, order and covers among them)
    if (VT && VT.validate && VT.validate.length >= 2) VT.validate(model, v).forEach(p => { if (p.level === 'error') say(`${p.path}: ${p.message}`); });
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
