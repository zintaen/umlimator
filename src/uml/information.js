import { registerDiagramType } from '../core/registry.js';
import { esc, fit } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.classifier and SHAPE.note
import './structure.js'; // SHAPE.component
import './usecase.js'; // SHAPE.actor

/* ---------- the information flow diagram, uml.information-flow (work package M2.5, notes/milestone-2.md §7.4) ----------
   Classes and interfaces (the class type's classifier, name only), components (src/uml/structure.js's look) and actors (the
   use case type's figure), each read only; information items, a classifier with a small filled triangle at its top right
   (UML 2.5.1 §20.2.4); comments. Information flows: a dashed line with an open arrow, its label «flow» then what it conveys
   by name (`Order, Card details`), after its own name when it has one (`place: Order`), cut at 280; comment links.
   props.conveyed is a declared reference (refs: drop), so deleting an element drops it from every flow. Laid out by
   layoutTyped from the host's ranking: gap 48 with gapAfter's widening, labelGaps, repair and reroute off (S19). Ships in
   lib/umlimator-all.js only. */

const IF_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), IF_ARR = x => (Array.isArray(x) ? x : []);
const IF_HAS = x => x != null && x !== '';
const ifName = x => String(x.label ?? x.id);
const ifStereo = x => IF_ARR(IF_OBJ(x.props) ? x.props.stereotypes : null).filter(IF_HAS).map(String);
const ifPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const ifAnd = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const IF_ENDS = ['uml.Class', 'uml.Interface', 'uml.Component', 'uml.Actor']; // what a flow joins (§3, §13)
// what a flow may convey: an information item or a classifier
const IF_CONVEY = ['uml.InformationItem', ...IF_ENDS, 'uml.DataType', 'uml.Enumeration', 'uml.PrimitiveType'];
const IF_LINES = ['uml.InformationFlow', 'uml.CommentLink'];
const IF_WORD = { 'uml.Class': 'Class', 'uml.Interface': 'Interface', 'uml.Component': 'Component', 'uml.Actor': 'Actor', 'uml.InformationItem': 'Information item', 'uml.Comment': 'Comment',
  'uml.DataType': 'Data type', 'uml.Enumeration': 'Enumeration', 'uml.PrimitiveType': 'Primitive type' };

/* ---- the information item: the classifier, 32 px wider, its name kept 24 px clear of the triangle at its top right ---- */
const IF_IT = { pad: 8, name: 13, more: 32 };
// the classifier's own markup, named by n.aria (A1) and by its shape
const ifClassifier = (n, c, f, shape = 'classifier') => SHAPE.classifier.draw(n, c, f).replace(/data-shape="classifier" tabindex="-1" role="img" aria-label="[^"]*"/,
  `data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || '')}"`);
SHAPE['information-item'] = { ...SHAPE.classifier,
  size: n => { const s = SHAPE.classifier.size(n); return { w: s.w + IF_IT.more, h: s.h }; },
  draw(n, c, f) { const x = n.x + n.w - 16, y = n.y + 6, tri = `<path d="M${r2(x)} ${r2(y)}L${r2(x + 10)} ${r2(y + 5)}L${r2(x)} ${r2(y + 10)}Z" class="if-icon" fill="${c}" stroke="${c}" stroke-linejoin="round"/>`;
    return ifClassifier({ ...n, label: fit(String(n.label ?? ''), IF_IT.name, n.w - 2 * IF_IT.pad - IF_IT.more / 2 - 16) }, c, f, 'information-item').replace(/<\/g>$/, tri + '</g>'); },
};

/* ---- the model read ---- */
function ifIndex(model) {
  const at = new Map(); IF_ARR(model && model.nodes).forEach(n => { if (IF_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const E = IF_ARR(model && model.edges).filter(e => IF_OBJ(e) && typeof e.id === 'string');
  const conveyed = e => IF_ARR(IF_OBJ(e.props) ? e.props.conveyed : null);
  const nm = id => (at.has(id) ? ifName(at.get(id)) : String(id)); // a conveyed id that is gone: said as itself (conveyed-kind)
  return { at, E, conveyed, nm, flowsOf: id => E.filter(e => e.type === 'uml.InformationFlow' && conveyed(e).includes(id)) };
}
// what a flow says: its name, then what it conveys by name ("place: Order, Card details"); the PDF's line text (S17)
const ifSays = (I, e) => `${IF_HAS(e.label) ? e.label + ': ' : ''}${I.conveyed(e).map(I.nm).join(', ')}`;
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two elements it shows
function ifLines(I, view, shown) {
  const by = new Map(I.E.map(e => [e.id, e])), list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? by.get(x) : x)) : I.E.filter(e => IF_LINES.includes(e.type));
  return list.filter(e => IF_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to));
}
const ifShown = (I, view) => [...new Set(IF_ARR(view && view.nodeIds))].filter(id => I.at.has(id));

/* ---- accessible names (§7.4): "Information item Order, conveyed by 4 flows"; "Information flow from Shopper to Storefront,
   conveys Order and Card details" ---- */
function ifNodeName(I, n) {
  if (n.type === 'uml.Comment') return 'Comment: ' + ifName(n);
  const st = ifStereo(n), w = Object.hasOwn(IF_WORD, n.type) ? IF_WORD[n.type] : String(n.type ?? '').split('.').pop(), k = I.flowsOf(n.id).length;
  return `${w} ${ifName(n)}${st.length ? ` (${st.join(', ')})` : ''}${k ? `, conveyed by ${ifPlural(k, 'flow')}` : ''}`;
}
function ifLineName(I, e) {
  const ends = `from ${I.nm(e.from)} to ${I.nm(e.to)}`;
  if (e.type === 'uml.CommentLink') return `Comment link ${ends}`;
  if (e.type !== 'uml.InformationFlow') return `Line ${ends}`;
  const c = I.conveyed(e).map(I.nm);
  return `Information flow${IF_HAS(e.label) ? ' ' + e.label : ''} ${ends}${c.length ? ', conveys ' + ifAnd(c) : ''}`;
}

/* ---- the legend. ponytail: copies class.js's legendItem, which it does not export ---- */
const IF_SAYS = { 'uml.InformationFlow': ['Information flow', '«flow»: what travels from one end to the other'], 'uml.CommentLink': ['Comment link', 'what a comment is about'] };
const ifLegend = edges => IF_LINES.filter(t => edges.some(e => e.type === t)).map(t => { const [name, says] = IF_SAYS[t], flow = t === 'uml.InformationFlow';
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${flow ? 17 : 26}" stroke-dasharray="3 2"/>${flow ? '<path d="M17 4L26 8L17 12" fill="none"/>' : ''}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; });

/* ---- the view laid out ----
   A flow back over two columns or more (a reply that closes a loop: an email to the shopper) leaves its source's bottom and
   comes into its target's bottom, in the layout's axes, under the rows it passes: through the middle it crosses the lines
   between them (15-information-flow.json, right and down). ponytail: one fixed side, not a search; a view whose long back
   flows still cross would take the router's side choice (reroute), which S19 leaves off for the edits' time */
function ifGeo({ model, view, pos, memo }) {
  const I = ifIndex(model), ids = ifShown(I, view), lines = ifLines(I, view, new Set(ids)), P = id => (IF_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = ids.map(id => { const n = I.at.get(id), st = ifStereo(n), pr = IF_OBJ(n.props) ? n.props : {};
    const look = n.type === 'uml.Comment' ? { shape: 'note' } : n.type === 'uml.Actor' ? { shape: 'actor', stereotypes: st } : n.type === 'uml.Component' ? { shape: 'component', stereotypes: st, keyword: !!pr.keyword }
      : n.type === 'uml.InformationItem' ? { shape: 'information-item', stereotypes: st, compartments: [] } : { shape: 'classifier', stereotypes: [...(n.type === 'uml.Interface' ? ['interface'] : []), ...st], compartments: [] };
    const d = { id, label: ifName(n), type: n.type || 'uml.Class', kind: 'file', ...look, aria: ifNodeName(I, n), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...SHAPE[d.shape].size(d) }; });
  const edges = lines.map(e => { const flow = e.type === 'uml.InformationFlow', label = flow ? '«flow» ' + ifSays(I, e) : e.label;
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: IF_HAS(label) ? label : undefined, end: flow ? { from: 'none', to: 'open', dashed: true } : { from: 'none', to: 'none', dashed: true },
      aria: ifLineName(I, e), cut: 280, ...(P(e.from)[0] - P(e.to)[0] > 1 ? { fromSide: 'bottom', toSide: 'bottom' } : {}), ...(IF_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  const g = layoutTyped({ nodes, edges, direction: view.direction === 'down' ? 'down' : 'right', gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  return { ...g, legend: ifLegend(g.edges), order: [...ids, ...lines.map(e => e.id)] }; // a new object: what layoutTyped returned is never edited (§2.6)
}

/* ---- validators (§7.4). Each problem: { level, rule, path, message, ids } ---- */
const IF_RULES = {
  'conveyed-some': 'an information flow conveys one element at least',
  'conveyed-kind': 'each element a flow conveys is an information item or a classifier of the model',
  'flow-ends': 'an information flow joins two classes, interfaces, components or actors, never an information item or a comment',
};
function ifProblems(model) {
  const out = [], I = ifIndex(model), say = (rule, path, ids, msg) => out.push({ level: 'error', rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const q = id => JSON.stringify(I.nm(id)), kind = id => (I.at.has(id) ? (IF_WORD[I.at.get(id).type] || String(I.at.get(id).type ?? 'untyped').split('.').pop()).toLowerCase() : 'nothing');
  IF_ARR(model && model.edges).forEach((e, i) => { if (!IF_OBJ(e) || e.type !== 'uml.InformationFlow') return; const path = `edges[${i}]`, c = I.conveyed(e);
    if (!c.length) say('conveyed-some', path, [e.id], `${e.id} conveys nothing: a flow conveys one element at least`);
    c.forEach((id, j) => { if (!I.at.has(id) || !IF_CONVEY.includes(I.at.get(id).type))
      say('conveyed-kind', `${path}.props.conveyed[${j}]`, [e.id, typeof id === 'string' ? id : null], I.at.has(id) ? `${e.id} conveys ${q(id)}, a ${kind(id)}: it conveys information items and classifiers` : `${e.id} conveys ${JSON.stringify(id)}, which the model does not hold`); });
    if (!IF_ENDS.includes((I.at.get(e.from) || {}).type) || !IF_ENDS.includes((I.at.get(e.to) || {}).type))
      say('flow-ends', path, [e.id, e.from, e.to], `${e.id} runs from ${q(e.from)} (${kind(e.from)}) to ${q(e.to)} (${kind(e.to)}): a flow joins two classes, interfaces, components or actors`); });
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name in the view's order, then each line ---- */
function ifDescribe(model, viewId) {
  const v = IF_ARR(model && model.views).find(x => IF_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const I = ifIndex(model), ids = ifShown(I, v), lines = ifLines(I, v, new Set(ids));
  return [`${v.title || v.id}: an information flow diagram of ${ifPlural(ids.length, 'element')} and ${ifPlural(lines.length, 'line')}.`,
    ...ids.map(id => ifNodeName(I, I.at.get(id)) + '.'), ...lines.map(e => ifLineName(I, e) + '.')].join('\n');
}

/* ---- editing (§7.4) ---- */
// the elements a flow may convey, information items first, then classifiers, each in the model's order
const ifConveyable = I => [...I.at.values()].filter(n => IF_CONVEY.includes(n.type)).sort((a, b) => (b.type === 'uml.InformationItem') - (a.type === 'uml.InformationItem'));
// connect: a flow between two classifiers or actors asks which element it conveys; other ends are refused, said on the hint line
function ifConnect(model, view, from, to, at, line) {
  if (!IF_OBJ(line) || line.type !== 'uml.InformationFlow') return null;
  const I = ifIndex(model);
  if (![from, to].every(id => IF_ENDS.includes((I.at.get(id) || {}).type))) return { error: 'An information flow joins two classes, interfaces, components or actors' };
  const can = ifConveyable(I); if (!can.length) return { error: 'Add an information item for the flow to convey first' };
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has('flow' + k)) k++;
  return { pick: can.map(ifName), then: i => [{ op: 'add', element: { id: 'flow' + k, type: 'uml.InformationFlow', from, to, props: { conveyed: [can[i].id] } }, view: view.id }] };
}
// rename (F2, a double-click on a selected flow): the flow's text as drawn, `[name:] element, element`, «flow» left out or not;
// each element by its name (an information item first), else by its id. Sets conveyed and the name, each when it changed
function ifRename(model, view, id, text) {
  const I = ifIndex(model), e = I.E.find(x => x.id === id); if (!e || e.type !== 'uml.InformationFlow') return null;
  const t = String(text ?? '').replace(/^\s*«flow»\s*/, ''), k = t.indexOf(':'), name = k < 0 ? '' : t.slice(0, k).trim();
  const names = (k < 0 ? t : t.slice(k + 1)).split(',').map(s => s.trim()).filter(Boolean), can = ifConveyable(I), ids = [];
  if (!names.length) return { error: 'A flow conveys one element at least' };
  for (const s of names) { const x = can.find(n => ifName(n) === s) || can.find(n => n.id === s); if (!x) return { error: `No information item or classifier is named ${s}` }; ids.push(x.id); }
  return [...(JSON.stringify(ids) !== JSON.stringify(I.conveyed(e)) ? [{ op: 'set', id, path: 'props.conveyed', value: ids }] : []),
    ...(name !== (e.label ?? '') ? [{ op: 'set', id, path: 'label', value: name || undefined }] : [])];
}

const IF_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const IF_TYPE = registerDiagramType('uml.information-flow', {
  title: 'information flow diagram',
  elements: [['Class', 'Class'], ['Interface', 'Interface'], ['Component', 'Component'], ['Actor', 'Actor'], ['InformationItem', 'Information item'], ['Comment', 'Comment']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['InformationFlow', 'Information flow'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: { 'uml.Class': [IF_STEREO], 'uml.Interface': [IF_STEREO], 'uml.Component': [IF_STEREO], 'uml.Actor': [IF_STEREO], 'uml.InformationItem': [], 'uml.InformationFlow': [], 'uml.CommentLink': [] },
  refs: { 'uml.InformationFlow': { 'props.conveyed': 'drop' } }, // a deleted element leaves every flow that conveys it
  layout: ifGeo,
  validate: ifProblems,
  rules: IF_RULES,
  describe: ifDescribe,
  edits: { connect: ifConnect, rename: ifRename },
  // the PDF (§9): an element's kind; an information item's rows, the flows that convey it; a flow's text, what it conveys
  word: (model, id) => { const x = ifIndex(model).at.get(id); return x && Object.hasOwn(IF_WORD, x.type) ? IF_WORD[x.type] : null; },
  rows: (model, view, id) => { const I = ifIndex(model), x = I.at.get(id); return x && x.type === 'uml.InformationItem' ? I.flowsOf(id).map(e => `${I.nm(e.from)} → ${I.nm(e.to)}`) : null; },
  text: (model, view, id) => { const I = ifIndex(model), e = I.E.find(x => x.id === id); return e && e.type === 'uml.InformationFlow' ? ifSays(I, e) : null; },
});

export { IF_TYPE, IF_RULES, ifGeo, ifProblems, ifDescribe, ifConnect, ifRename };
