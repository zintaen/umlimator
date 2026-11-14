import { registerDiagramType } from '../core/registry.js';
import { esc, fit } from '../core/text.js';
import { SHAPE, r2, sidePorts } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import { ownersOn, readingOrder } from '../uml/owners.js';
import { C4_DEF, C4_RULES, C4_WORD, c4Index, c4Pic, c4Lines, c4Problems, c4Legend, c4NodeName, c4LineName, c4LineLabel, c4Shape, c4TagOf, c4Ext, c4Key, c4Owners, c4Rename } from './c4.js';

/* ---------- C4's dynamic and deployment views, c4.dynamic and c4.deployment (work package M2.7, notes/milestone-2.md §7.5.2,
   §7.5.3, §5.1) ----------
   The dynamic view: its `edges` are model relationships by id, each once, in time order (S13); each is drawn numbered by its
   place, "k · description [technology]" (the layout's step: with no room for its text a label keeps its number), over the
   layered layout of the elements it shows, laid out as src/c4/c4.js lays a static view out (its boundary, people first); only
   steps are drawn, none implied. Alt + arrows on a
   selected step move it one place (moveTo); a relationship drawn by L or the handle between two shown elements is a step,
   the model's own when one joins them already. Its level is its subject's: a software system's as a container view, a
   container's as a component view, none as a landscape. The deployment view: deployment nodes nest as solid boxes
   (ownersOn) titled "<name> [Deployment Node: technology]", a node holding nothing shown drawn as the map's node shape;
   a container instance is drawn as its container (shape, name, technology, description), "Instance of" in its name. Its
   lines are the model's, lifted as §5.2 lifts them. Deleting a container deletes its instances (refs). Ships in
   lib/umlimator-all.js only. */

const V_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), V_ARR = x => (Array.isArray(x) ? x : []);
const V_HAS = x => x != null && String(x).trim() !== '';
const V_P = x => (V_OBJ(x.props) ? x.props : {});
const vName = x => String(x.label ?? x.id);
const vPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const V_RULES = { ...C4_RULES,
  'c4-level': C4_RULES['c4-level'] + '; a dynamic view what its subject\'s level draws; a deployment view deployment nodes and container instances, with a subject only instances of its containers',
  'c4-subject': C4_RULES['c4-subject'] + '; a dynamic view zooms into a software system, a container or nothing; a deployment view into a software system or nothing',
  'c4-steps': 'a dynamic view\'s steps are the model\'s relationships, each once, between elements it shows; it lists at least one' };
const DEP_RULES = { ...V_RULES, 'c4-box-line': 'a deployment view draws no line onto a deployment node drawn as a box: a relationship with an end in or on one is not drawn' };
// every id the model holds, views' too (src/c4/c4.js's c4Used, not exported; src/c4/c4.js is M2.6's)
const vUsed = model => { const used = new Set(V_ARR(model.views).filter(V_OBJ).map(v => v.id)); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; }); return used; };

/* ---- the dynamic view (§7.5.2) ---- */
// its steps drawn: [{ e, k, i }], each model relationship listed (the first time) between two elements the view shows (not a
// boundary), numbered 1, 2, 3 among those drawn (S13), i its place in view.edges
function dynSteps(model, view) {
  if (!V_OBJ(view)) return [];
  const pic = c4Pic(model, view), ends = new Set(pic.ids.filter(id => !pic.open.has(id))), rel = new Map(pic.I.rels.map(r => [r.id, r])), seen = new Set(), out = [];
  V_ARR(view.edges).forEach((x, i) => { const e = typeof x === 'string' ? rel.get(x) : null;
    if (e && !seen.has(e.id) && ends.has(e.from) && ends.has(e.to)) out.push({ e, k: out.length + 1, i }); if (e) seen.add(e.id); });
  return out;
}
// the level a dynamic view draws at: as the static view its subject's type zooms to
const dynLevel = (model, view) => { const t = (c4Index(model).at.get(view.subject) || {}).type;
  return view.subject == null ? 'c4.landscape' : t === 'c4.SoftwareSystem' ? 'c4.container' : t === 'c4.Container' ? 'c4.component' : null; };
// what a dynamic view draws: its steps between two elements it shows (not a boundary), and the comment links it lists
function dynDrawn(model, view) {
  const pic = c4Pic(model, view), ends = new Set(pic.ids.filter(id => !pic.open.has(id))), steps = dynSteps(model, view);
  const notes = [...new Set(V_ARR(view.edges).map(x => (typeof x === 'string' ? pic.I.E.find(e => e.id === x) : null)))].filter(e => e && e.type === 'uml.CommentLink' && ends.has(e.from) && ends.has(e.to));
  return { pic, steps, notes };
}
const dynName = (e, k, pic) => `Step ${k}: ${c4LineName(e, pic)}`;
// the key's items: each element type, shape and tone drawn (as src/c4/c4.js keys them), the relationship and the implied line
const vItem = (name, says, svg) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
const vSwatch = ext => `<rect x="3" y="2" width="22" height="12" rx="3" fill="var(--um-${ext ? 'slate' : 'cyan'}-f)" stroke="var(--um-${ext ? 'slate' : 'cyan'})"/>`;
const vLine = dashed => `<g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none"><path d="M2 8H25"${dashed ? ' stroke-dasharray="3 2"' : ''}/><path d="M17 4L26 8L17 12"/></g>`;
const vLines = (edges, says = 'uses, with its technology in brackets') => [...(edges.some(e => e.type === 'c4.Relationship' && !e.implied) ? [vItem('Relationship', says, vLine(false))] : []),
  ...(edges.some(e => e.implied) ? [vItem('Implied relationship', 'stands for relationships between what the two hold', vLine(true))] : [])];
const V_LINE = { rel: { from: 'none', to: 'open' }, implied: { from: 'none', to: 'open', dashed: true }, note: { from: 'none', to: 'none', dashed: true } };
// an element of a C4 view as src/c4/c4.js draws it (shape c4: its map shape and three lines), or a comment
function vNode(id, x, P, more = {}) {
  if (x.type === 'uml.Comment') { const d = { id, label: vName(x), type: x.type, kind: 'file', shape: 'note', aria: c4NodeName(x), col: P(id)[0], row: P(id)[1] }; return { ...d, ...SHAPE.note.size(d) }; }
  const ext = c4Ext(x), d = { id, label: vName(x), type: x.type, kind: ext ? 'external' : 'frontend', shape: 'c4', sh: c4Shape(x), ext, tag: c4TagOf(x), desc: V_P(x).description, aria: c4NodeName(x), col: P(id)[0], row: P(id)[1], ...more };
  return { ...d, ...SHAPE.c4.size(d) };
}
// laid out as src/c4/c4.js lays a static view out (§11): its boxes, people first, the small gaps, labelGaps, repair and reroute off;
// each step carries its number as the layout's step, so a label with no room keeps its number ("3" for "3 · Charges cards with")
function dynGeo({ model, view, pos, memo }) {
  const { pic, steps, notes } = dynDrawn(model, view), P = id => (V_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => vNode(id, pic.at.get(id), P));
  const edges = [...steps.map(({ e, k }) => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, step: k, label: c4LineLabel(e) || undefined, end: V_LINE.rel, aria: dynName(e, k, pic), cut: 280 })),
    ...notes.map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, end: V_LINE.note, aria: c4LineName(e, pic), cut: 280 }))];
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: view.direction === 'down' ? 'down' : 'right',
    gap: 48, rgap: 64, labelGaps: true, repair: false, reroute: false }, memo);
  // on a copy (stage 4 §2.4): a person's or robot's body starts just above the highest line on its side, as src/c4/c4.js does
  const sp = sidePorts(g), lift = new Map();
  g.nodes.forEach(n => { const p = (n.sh === 'person' || n.sh === 'robot') && sp.get(n), t = p ? Math.min(p.L, p.R) : Infinity; if (t < n.y + 14) lift.set(n, { ...n, portTop: t }); });
  const out = lift.size ? { nodes: g.nodes.map(n => lift.get(n) || n), byId: Object.fromEntries(g.nodes.map(n => [n.id, lift.get(n) || n])),
    edges: g.edges.map(e => (lift.has(e.s) || lift.has(e.t) ? { ...e, s: lift.get(e.s) || e.s, t: lift.get(e.t) || e.t } : e)) } : {};
  const legend = c4Legend(nodes, edges, 'a step, numbered in time order, with its technology in brackets');
  return { ...g, ...out, legend, order: [...readingOrder(pic), ...edges.map(e => e.id)] };
}
function dynProblems(model, view) {
  if (!V_OBJ(view)) return c4Problems(model, view);
  const views = V_ARR(model && model.views), vi = views.indexOf(view), at = vi >= 0 ? `views[${vi}]` : 'view', I = c4Index(model), lvl = dynLevel(model, view);
  const say = (level, rule, path, ids, msg) => ({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` }), q = id => JSON.stringify(I.at.has(id) ? vName(I.at.get(id)) : String(id));
  // the subject's level checked as that static view would be, on a copy of the model whose view says it
  const as = { ...view, diagram: lvl || 'c4.landscape' }, kind = { 'c4.landscape': 'landscape', 'c4.container': 'container', 'c4.component': 'component' }[as.diagram];
  const w = (C4_WORD[(I.at.get(view.subject) || {}).type] || 'element').toLowerCase(), out = lvl ? [] : [say('error', 'c4-subject', `${at}.subject`, [view.subject],
    `its subject ${q(view.subject)} is ${I.at.has(view.subject) ? (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w : 'no element'}: a dynamic view zooms into a software system, a container or nothing`)];
  out.push(...c4Problems({ ...model, views: views.map(v => (v === view ? as : v)) }, as).map(p => (p.rule === 'c4-level' ? { ...p, message: p.message.replace(`in a ${kind} view`, `in a dynamic view${lvl && view.subject != null ? ' of ' + q(view.subject) : ''}`) } : p)));
  // its steps (§5.1): each a model relationship, each once, between elements the view shows
  const pic = c4Pic(model, view), ends = new Set(pic.ids.filter(id => !pic.open.has(id))), rel = new Set(I.rels.map(r => r.id)), seen = new Set();
  V_ARR(view.edges).forEach((x, k) => { const p = `${at}.edges[${k}]`;
    if (V_OBJ(x) && x.type === 'c4.Relationship') return out.push(say('error', 'c4-steps', p, [x.id], `step ${typeof x.id === 'string' ? x.id : `at edges[${k}]`} is written in the view: a step names a relationship of the model`));
    if (V_OBJ(x)) return out.push(say('error', 'c4-steps', p, [typeof x.id === 'string' ? x.id : null], `step ${JSON.stringify(typeof x.id === 'string' ? x.id : null)} is written in the view and is no relationship: a step names a relationship of the model`));
    if (typeof x !== 'string' || !(rel.has(x) || I.E.some(e => e.id === x && e.type === 'uml.CommentLink'))) return out.push(say('error', 'c4-steps', p, [String(x)], `step ${JSON.stringify(String(x))} is no relationship of the model`));
    if (!rel.has(x)) return null;
    if (seen.has(x)) return out.push(say('error', 'c4-steps', p, [x], `${x} is a step twice: each relationship is one step`));
    seen.add(x); const e = I.E.find(r => r.id === x), gone = [e.from, e.to].filter(id => !ends.has(id));
    if (gone.length) out.push(say('warning', 'c4-steps', p, [x, ...gone], `${x}, from ${q(e.from)} to ${q(e.to)}, is not drawn: the view ${gone.map(id => (pic.open.has(id) ? `draws ${q(id)} as a boundary` : `does not show ${q(id)}`)).join(' or ')}`)); return null; });
  if (!V_ARR(view.edges).some(x => typeof x === 'string' && rel.has(x))) out.push(say('warning', 'c4-steps', `${at}.edges`, [], `view ${JSON.stringify(String(view.id))} lists no step: a dynamic view draws its steps alone`));
  return out;
}
function dynDescribe(model, viewId) {
  const v = V_ARR(model && model.views).find(x => V_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const { steps, notes, pic } = dynDrawn(model, v), box = new Map(c4Pic(model, v).boxes.map(b => [b.id, b]));
  return [`${v.title || v.id}: a C4 dynamic diagram of ${vPlural(pic.ids.length, 'element')} and ${vPlural(steps.length, 'step')}.`,
    ...readingOrder(pic).map(id => (box.has(id) ? box.get(id).aria : c4NodeName(pic.at.get(id)))), ...steps.map(({ e, k }) => dynName(e, k, pic)), ...notes.map(e => c4LineName(e, pic))].map(t => t.replace(/\.?$/, '.')).join('\n');
}
/* moveTo(model, view, id, at): a step one place earlier or later (Alt + arrows, { by }), or to { index } in view.edges. A
   card, or a line dropped where there is no slot: null, the canvas's own */
function dynMoveTo(model, view, id, at) {
  if (!V_OBJ(view) || !V_OBJ(at)) return null;
  const steps = dynSteps(model, view), k = steps.findIndex(s => s.e.id === id);
  if (k < 0) return null;
  if (Number.isInteger(at.index)) return at.index === steps[k].i ? [] : [{ op: 'move', id, view: view.id, index: at.index }];
  if (!Array.isArray(at.by)) return null;
  const to = k + Math.sign((+at.by[0] || 0) + (+at.by[1] || 0));
  return to < 0 || to >= steps.length || to === k ? [] : [{ op: 'move', id, view: view.id, index: steps[to].i }];
}
// connect: a relationship between two shown elements is a step: the model's own when one joins them and is not a step yet,
// else a new one (the canvas's add, which lists it last)
function dynConnect(model, view, from, to, at, line) {
  if (!V_OBJ(view) || (V_OBJ(line) && line.type !== 'c4.Relationship')) return null;
  const listed = V_ARR(view.edges), r = c4Index(model).rels.find(e => e.from === from && e.to === to && !listed.includes(e.id));
  return r ? [{ op: 'set', view: view.id, path: 'edges', value: [...listed, r.id] }] : null;
}
// rename: F2 on a step holds its text, "description [technology]": the technology when unchanged, and a number typed before it
// ("3." or "3 ·"), are not the description; what is left is set as its label. Anything else: null, the canvas's own
function dynRename(model, view, id, text) {
  const s = dynSteps(model, view).find(x => x.e.id === id); if (!s) return null;
  return c4Rename(model, view, id, String(text).trim().replace(new RegExp(`^${s.k}\\s*(·|\\.(?!\\S))\\s*`), ''));
}
// add: a container or component added at the view's level (its subject's, §5.1) is owned by the subject, as on that static view
const dynAdd = (model, view, entry, label) => (V_OBJ(view) ? C4_DEF.edits.add(model, { ...view, diagram: dynLevel(model, view) }, entry, label) : null);
const DYN_DEF = { ...C4_DEF,
  title: 'C4 dynamic diagram',
  layout: dynGeo,
  validate: dynProblems,
  rules: V_RULES,
  describe: dynDescribe,
  // the PDF's lines table: a step's number before its text, as drawn
  text: (model, view, id) => { const t = C4_DEF.text(model, view, id), s = dynSteps(model, view).find(x => x.e.id === id); return s ? [String(s.k), t].filter(V_HAS).join(' · ') : t; },
  edits: { ...C4_DEF.edits, add: dynAdd, connect: dynConnect, moveTo: dynMoveTo, rename: dynRename },
};

/* ---- the deployment view (§7.5.3) ---- */
const depTag = x => `[Deployment Node${V_HAS(V_P(x).technology) ? ': ' + V_P(x).technology : ''}]`;
const depOf = (I, x) => { const c = I.at.get(V_P(x).container); return c && c.type === 'c4.Container' ? c : null; };
// "Deployment node Web server, Ubuntu 24.04 LTS: The web tier's server"; "Instance of container Shop API, Python, FastAPI: …"
function depNodeName(I, x) {
  if (x.type === 'c4.DeploymentNode') { const P = V_P(x); return `Deployment node ${vName(x)}${V_HAS(P.technology) ? ', ' + P.technology : ''}${V_HAS(P.description) ? ': ' + P.description : ''}`; }
  if (x.type === 'c4.ContainerInstance') { const c = depOf(I, x), s = c ? c4NodeName(c) : `container ${vName(x)}, of no container`; return 'Instance of ' + s[0].toLowerCase() + s.slice(1); }
  return c4NodeName(x);
}
// a deployment node holding something: a solid box, its name over "[Deployment Node: technology]" in a header as tall as the
// deployment type's (head 15 px more), so the layout measures the title at 12 px and the box is as wide as it
const V_HEAD = 15;
SHAPE['c4-node'] = { frame: f => { const line = (t, dy, wt, px, fill) => `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + dy)}" fill="${fill}" style="font:${wt} ${px}px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(t, px, f.w - 24))}</text>`;
  return `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/>`
    + (f.kw ? line(f.name, 17, 600, 12, 'var(--um-text)') + line(f.kw, 17 + V_HEAD, 400, 11, 'var(--um-muted)') : line(f.title ?? f.label ?? f.id, 17, 600, 12, 'var(--um-text)')); } };
const DEP_LOOK = { boxTypes: ['c4.DeploymentNode'], qualify: false, shape: () => 'c4-node', word: () => 'Deployment node' };
function depPic(model, view) {
  const pic = ownersOn(model, view, DEP_LOOK), I = c4Index(model);
  const boxes = pic.boxes.map(b => { const x = pic.at.get(b.id), held = pic.holds(b.id).map(id => pic.at.get(id)), k = new Map();
    held.forEach(y => { const w = (C4_WORD[y.type] || 'element').toLowerCase(); k.set(w, (k.get(w) || 0) + 1); });
    return { ...b, title: `${vName(x)} ${depTag(x)}`, name: vName(x), kw: depTag(x), head: V_HEAD, aria: `Deployment node ${vName(x)}${V_HAS(V_P(x).technology) ? ', ' + V_P(x).technology : ''}, a box holding ${[...k].map(([w, c]) => vPlural(c, w)).join(', ')}` }; });
  return { ...pic, I, boxes };
}
// the key: a deployment node, each instance's look (as its container's), the relationship and the implied line
function depLegend(nodes, edges, boxes) {
  const els = [...new Map(nodes.filter(n => n.type === 'c4.ContainerInstance').map(n => [`${n.sh} ${n.ext}`, n])).values()];
  return [...(boxes.length || nodes.some(n => n.type === 'c4.DeploymentNode') ? [vItem('Deployment node', 'a host, runtime or device; it holds what runs on it', '<rect x="3" y="2" width="22" height="12" rx="3" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/>')] : []),
    ...els.map(n => vItem(`Container instance${n.sh !== 'box' ? ', ' + n.sh : ''}${n.ext ? ', external' : ''}`, 'a container deployed here, drawn as its container', vSwatch(n.ext))), ...vLines(edges)];
}
function depGeo({ model, view, pos, memo }) {
  const pic = depPic(model, view), I = pic.I, { own, implied } = c4Lines(model, view, pic), P = id => (V_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const x = pic.at.get(id), base = { id, type: x.type, col: P(id)[0], row: P(id)[1], aria: depNodeName(I, x) };
    if (x.type === 'uml.Comment') { const d = { ...base, label: vName(x), kind: 'file', shape: 'note' }; return { ...d, ...SHAPE.note.size(d) }; }
    // an instance as its container; a deployment node holding nothing shown as the map's node; anything else (c4-level's error) as itself
    const c = x.type === 'c4.ContainerInstance' ? depOf(I, x) || x : x, dn = x.type === 'c4.DeploymentNode', ext = !dn && c4Ext(c);
    const d = { ...base, label: vName(c), kind: ext ? 'external' : 'frontend', shape: 'c4', sh: dn ? 'node' : c4Shape(c), ext, tag: dn ? depTag(x) : c === x && x.type === 'c4.ContainerInstance' ? '[Container]' : c4TagOf(c), desc: V_P(dn ? x : c).description };
    return { ...d, ...SHAPE.c4.size(d) }; });
  const edges = [...own.map(e => { const note = e.type === 'uml.CommentLink', label = note ? '' : c4LineLabel(e);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: label || undefined, end: note ? V_LINE.note : V_LINE.rel, aria: c4LineName(e, pic), cut: 280 }; }),
  ...implied.map(e => ({ id: e.id, _id: e.id, type: 'c4.Relationship', from: e.from, to: e.to, implied: e.of.map(r => r.id), end: V_LINE.implied, aria: c4LineName(e, pic), cut: 280,
    label: [e.of[0].label, e.of.length > 1 ? `[+${e.of.length - 1}]` : ''].filter(V_HAS).join(' ') || undefined }))];
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: view.direction === 'down' ? 'down' : 'right',
    gap: 48, rgap: 64, labelGaps: true, repair: false, reroute: false }, memo);
  return { ...g, legend: depLegend(nodes, edges, pic.boxes), order: [...readingOrder(pic), ...edges.map(e => e.id)] };
}
function depProblems(model, view) {
  const out = c4Problems(model, view); if (!V_OBJ(view)) return out;
  const views = V_ARR(model && model.views), vi = views.indexOf(view), at = vi >= 0 ? `views[${vi}]` : 'view', I = c4Index(model);
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` }), q = id => JSON.stringify(I.at.has(id) ? vName(I.at.get(id)) : String(id));
  const kind = id => (C4_WORD[(I.at.get(id) || {}).type] || 'nothing').toLowerCase(), a = w => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w, subj = I.at.get(view.subject);
  if (view.subject != null && (!subj || subj.type !== 'c4.SoftwareSystem')) say('error', 'c4-subject', `${at}.subject`, [view.subject], `its subject ${q(view.subject)} is ${a(kind(view.subject))}: a deployment view is of a software system or of all`);
  V_ARR(view.nodeIds).forEach((id, k) => { const x = I.at.get(id); if (!x || x.type === 'uml.Comment') return;
    if (x.type !== 'c4.DeploymentNode' && x.type !== 'c4.ContainerInstance') return say('error', 'c4-level', `${at}.nodeIds[${k}]`, [id], `${q(id)}, ${a(kind(id))}, is not drawn in a deployment view`);
    const c = x.type === 'c4.ContainerInstance' && depOf(I, x);
    if (c && subj && subj.type === 'c4.SoftwareSystem' && !I.chain(c.id).includes(subj.id))
      say('error', 'c4-level', `${at}.nodeIds[${k}]`, [id, c.id], `${q(id)}, an instance of ${q(c.id)}, is not drawn in a deployment view of ${q(subj.id)}: ${q(c.id)} is not one of its containers`); });
  c4Lines(model, view, depPic(model, view)).own.forEach(e => { if (e.type !== 'c4.Relationship' || V_HAS(e.label)) return;
    const i = V_ARR(model.edges).indexOf(e); say('warning', 'c4-label', `${i >= 0 ? `edges[${i}]` : `${at}.edges[${V_ARR(view.edges).indexOf(e)}]`}.label`, [e.id, e.from, e.to], `${e.id}, from ${q(e.from)} to ${q(e.to)}, has no description`); });
  // a relationship whose end is, or lies in, a node drawn as a box: a line ends on an element, so it is not drawn (§5.2 lifts onto
  // a node holding nothing shown only)
  const dp = depPic(model, view), near = id => { for (const x of [id, ...I.chain(id)]) if (dp.ids.includes(x)) return x; return null; };
  I.rels.forEach(r => { const a = near(r.from), b = near(r.to); if (a == null || b == null || a === b || I.chain(a).includes(b) || I.chain(b).includes(a)) return;
    const box = [a, b].filter(x => dp.open.has(x)); if (!box.length) return;
    const i = V_ARR(model.edges).indexOf(r); say('warning', 'c4-box-line', i >= 0 ? `edges[${i}]` : `${at}.edges`, [r.id, ...box], `${r.id}, from ${q(r.from)} to ${q(r.to)}, is not drawn: the view draws ${box.map(q).join(' and ')} as a box, which no line ends on`); });
  if (!V_HAS(view.title)) say('warning', 'c4-title', `${at}.title`, [], `view ${JSON.stringify(view.id)} has no title`);
  return out;
}
function depDescribe(model, viewId) {
  const v = V_ARR(model && model.views).find(x => V_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = depPic(model, v), { own, implied } = c4Lines(model, v, pic), box = new Map(pic.boxes.map(b => [b.id, b]));
  return [`${v.title || v.id}: a C4 deployment diagram of ${vPlural(pic.ids.length, 'element')} and ${vPlural(own.length + implied.length, 'relationship')}${implied.length ? `, ${implied.length} of them implied` : ''}.`,
    ...readingOrder(pic).map(id => (box.has(id) ? box.get(id).aria : depNodeName(pic.I, pic.at.get(id)))), ...[...own, ...implied].map(e => c4LineName(e, pic))].map(t => t.replace(/\.?$/, '.')).join('\n');
}
// the palette's instance: its container picked, put in the view's first deployment node that holds no other (the Owner field
// or a drop into a box moves it). ponytail: the add hook hears no selection on a layered view (no slots), so not "the node selected"
function depAdd(model, view, entry, label) {
  if (!V_OBJ(entry) || entry.type !== 'c4.ContainerInstance') return null;
  const I = c4Index(model), cs = [...I.at.values()].filter(n => n.type === 'c4.Container'), ids = V_ARR(view.nodeIds).filter(id => (I.at.get(id) || {}).type === 'c4.DeploymentNode');
  const into = ids.find(id => !ids.some(o => (I.at.get(o) || {}).parent === id));
  if (into == null) return { error: 'Add a deployment node first: an instance runs on one' };
  if (!cs.length) return { error: 'The model has no container to deploy' };
  const used = vUsed(model);
  return { pick: cs.map(vName), then: i => { const c = cs[i], b = `${c.id}-instance`; let id = b, k = 2; while (used.has(id)) id = `${b}-${k++}`;
    return [{ op: 'add', element: { id, type: 'c4.ContainerInstance', label: V_HAS(label) ? label : vName(c), parent: into, props: { container: c.id } }, view: view.id }]; } };
}
// T on an instance: its container, picked among the model's; else as on a static view (T, D)
function depKey(model, view, ids, key) {
  const I = c4Index(model), x = I.at.get(ids.at(-1));
  if (!(key === 't' || key === 'T') || !x || x.type !== 'c4.ContainerInstance') return c4Key(model, view, ids, key);
  const cs = [...I.at.values()].filter(n => n.type === 'c4.Container');
  return { pick: cs.map(vName), then: i => (cs[i].id === V_P(x).container ? [] : [{ op: 'set', id: x.id, path: 'props.container', value: cs[i].id }]) };
}
// the Owner field: an instance's and a deployment node's deployment nodes
function depOwners(model, x) {
  if (!V_OBJ(x) || x.from != null || (x.type !== 'c4.ContainerInstance' && x.type !== 'c4.DeploymentNode')) return c4Owners(model, x);
  const I = c4Index(model); // not the node itself nor a node inside it (the core refuses a cycle)
  return V_ARR(model.nodes).filter(n => V_OBJ(n) && n.type === 'c4.DeploymentNode' && n.id !== x.id && !I.chain(n.id).includes(x.id)).map(n => ({ id: n.id, label: vName(n) }));
}
const DEP_DEF = {
  title: 'C4 deployment diagram',
  elements: [{ type: 'c4.DeploymentNode', label: 'Deployment node' }, { type: 'c4.ContainerInstance', label: 'Container instance', name: false }, { type: 'uml.Comment', label: 'Comment' }],
  lines: C4_DEF.lines,
  props: { 'c4.DeploymentNode': [{ key: 'description', label: 'Description', kind: 'text' }, { key: 'technology', label: 'Technology', kind: 'text' }],
    'c4.ContainerInstance': [{ key: 'container', label: 'Container (id; T picks it)', kind: 'text' }], 'c4.Relationship': C4_DEF.props['c4.Relationship'], 'uml.CommentLink': [] },
  layout: depGeo,
  boxes: (model, view) => depPic(model, view).boxes,
  owners: depOwners,
  validate: depProblems,
  rules: DEP_RULES,
  describe: depDescribe,
  // a deleted container takes its instances (§3, Q7); read for every view, whichever type declares it
  refs: { 'c4.ContainerInstance': { 'props.container': 'cascade' } },
  word: C4_DEF.word,
  rows: (model, view, id) => { const I = c4Index(model), x = I.at.get(id); if (!x) return null; const P = V_P(x);
    if (x.type === 'c4.DeploymentNode') return [...(V_HAS(P.technology) ? [P.technology] : []), ...(V_HAS(P.description) ? [P.description] : [])];
    if (x.type !== 'c4.ContainerInstance') return C4_DEF.rows(model, view, id);
    const c = depOf(I, x); return [`Instance of ${c ? vName(c) : 'no container'}`, ...(c ? C4_DEF.rows(model, view, c.id) : [])]; },
  text: C4_DEF.text,
  edits: { add: depAdd, key: depKey, rename: c4Rename },
};

const C4_VIEW_TYPES = [registerDiagramType('c4.dynamic', DYN_DEF), registerDiagramType('c4.deployment', DEP_DEF)];

export { C4_VIEW_TYPES, DYN_DEF, DEP_DEF, V_RULES, DEP_RULES, dynSteps, dynAdd, dynLevel, dynGeo, dynProblems, dynDescribe, dynMoveTo, dynConnect, depPic, depGeo, depProblems, depDescribe, depNodeName, depAdd, depKey, depOwners };
