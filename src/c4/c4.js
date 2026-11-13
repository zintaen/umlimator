import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, portsOn, r2, sidePorts } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import '../uml/class.js'; // SHAPE.note, a comment's look
import { flowWrap } from '../uml/flow.js';
import { ownersOn, readingOrder } from '../uml/owners.js';

/* ---------- C4's elements and static views, c4.landscape, c4.context, c4.container, c4.component (work package M2.6,
   notes/milestone-2.md §5.1, §5.2, §6.1, §6.5, §7.5, §7.5.1) ----------
   People, software systems, containers and components, each drawn in the map's card shape its props.shape names (a person
   `person`, the rest `box`, by default: S11) with C4's three lines over it: its name, [Container: technology], its
   description; an external element grey. A view's subject, when it lists it, is a dashed boundary holding what it owns
   that the view shows (ownersOn). A relationship whose end the view does not show is drawn between the nearest owners it
   shows, one implied line a pair, dashed, unless a relationship joins them already (§5.2): derived when drawn, never stored,
   its id `<from>-><to>`. Each view kind checks what it may show (§5.1). D on a software system or a container that opens
   no view makes its container or component view (§6.1). One definition, registered under the four view names; the
   dynamic and deployment views are src/c4/views.js's, on the helpers exported here. Laid out by layoutTyped from the
   host's ranking, repair and reroute off (§11). Ships in lib/umlimator-all.js only. */

const C4_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), C4_ARR = x => (Array.isArray(x) ? x : []);
const C4_HAS = x => x != null && String(x).trim() !== '';
const C4_P = x => (C4_OBJ(x.props) ? x.props : {});
const c4Name = x => String(x.label ?? x.id);
const c4Plural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const C4_WORD = { 'c4.Person': 'Person', 'c4.SoftwareSystem': 'Software system', 'c4.Container': 'Container', 'c4.Component': 'Component',
  'c4.DeploymentNode': 'Deployment node', 'c4.ContainerInstance': 'Container instance', 'uml.Comment': 'Comment' };
const C4_TAG = { 'c4.Person': 'Person', 'c4.SoftwareSystem': 'Software System', 'c4.Container': 'Container', 'c4.Component': 'Component' };
const c4Word = x => (Object.hasOwn(C4_WORD, x.type) ? C4_WORD[x.type] : String(x.type ?? '').split('.').pop());
const C4_STATIC = ['c4.Person', 'c4.SoftwareSystem', 'c4.Container', 'c4.Component'], C4_DEPLOY = ['c4.DeploymentNode', 'c4.ContainerInstance'];
// the map's card shapes an element may name (S11): all but UML's node, which is the deployment view's
const C4_SHAPES = ['box', 'person', 'robot', 'browser', 'window', 'terminal', 'mobile', 'cylinder', 'pipe', 'folder', 'document', 'hexagon'];
const c4Shape = x => { const s = String(C4_P(x).shape ?? '').toLowerCase(); return C4_SHAPES.includes(s) ? s : x.type === 'c4.Person' ? 'person' : 'box'; };
const c4Ext = x => C4_P(x).external === true;
// "[Container: Python, FastAPI]", "[Software System]", "[Person]"
const c4TagOf = x => { const t = C4_TAG[x.type] || c4Word(x), tech = C4_P(x).technology; return `[${t}${C4_HAS(tech) && x.type !== 'c4.Person' && x.type !== 'c4.SoftwareSystem' ? ': ' + tech : ''}]`; };

/* ---- the element (§7.5): the map shape's outline, det and face, sized by its text ---- */
const C4 = { name: 13, nlh: 17, tag: 10, tlh: 14, d: 11, dlh: 14, dw: 220, dk: 4, minW: 160, maxW: 280, px: 14, py: 10, gap: 4 };
const C4_TOP = { person: 26, robot: 16, browser: 14, window: 14, terminal: 14, folder: 9 }, C4_SIDE = { mobile: 12, pipe: 12, hexagon: 12 };
function c4Parts(n) {
  const pad = C4.px + (C4_SIDE[n.sh] || 0), max = C4.maxW - 2 * pad, name = flowWrap(n.label, C4.name, max, 2), tag = fit(n.tag || '', C4.tag, max);
  const desc = C4_HAS(n.desc) ? flowWrap(n.desc, C4.d, Math.min(C4.dw, max), C4.dk) : [];
  const w = Math.ceil(Math.min(C4.maxW, Math.max(C4.minW, Math.max(...name.map(t => textW(t, C4.name) * 1.05), textW(tag, C4.tag), ...desc.map(t => textW(t, C4.d))) + 2 * pad)));
  const text = Math.max(1, name.length) * C4.nlh + C4.tlh + (desc.length ? C4.gap + desc.length * C4.dlh : 0), body = text + 2 * C4.py;
  let h = (C4_TOP[n.sh] || 0) + body, top = C4_TOP[n.sh] || 0;
  if (n.sh === 'cylinder') { for (let k = 0; k < 4; k++) h = body + 3 * Math.max(5, Math.round(h * .11)); top = 2 * Math.max(5, Math.round(h * .11)); } // the lid above, its rim below
  return { name, tag, desc, w, h: Math.ceil(h), top, text, pad };
}
const c4Text = (x, y, t, px, wt, fill, cls, more = '') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="middle" class="${cls}"${more} fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
const C4_EL = {
  size: n => { const p = c4Parts(n); return { w: p.w, h: p.h }; },
  out: (n, d = 0) => SHAPE[n.sh || 'box'].out(n, d), face: n => SHAPE[n.sh || 'box'].face(n),
  inset: (n, s, t) => SHAPE[n.sh || 'box'].inset(n, s, t),
  // its outline, the map shape's details (a person's head, a cylinder's lid) and C4's three lines, centred under its top
  draw(n, c, f) {
    const S = SHAPE[n.sh || 'box'], P = c4Parts(n), cx = n.x + n.w / 2, max = n.w - 2 * P.pad, bottom = n.sh === 'cylinder' ? P.top / 2 : 0;
    let y = n.y + P.top + (n.h - P.top - bottom - P.text) / 2;
    const tx = [];
    P.name.forEach((t, i) => { tx.push(c4Text(cx, y + 13, fit(t, C4.name, max), C4.name, 600, 'var(--um-text)', 'c-name', i ? '' : ` data-o="${esc(n.id)}"`)); y += C4.nlh; });
    tx.push(c4Text(cx, y + 10, fit(P.tag, C4.tag, max), C4.tag, 400, 'var(--um-muted)', 'c-st')); y += C4.tlh + C4.gap;
    P.desc.forEach(t => { tx.push(c4Text(cx, y + 11, fit(t, C4.d, max), C4.d, 400, 'var(--um-text)', 'c-desc')); y += C4.dlh; });
    return `<g class="node c4${n.ext ? ' c4-ext' : ''}" data-id="${esc(n.id)}" data-shape="c4" data-c4="${n.sh}" tabindex="-1" role="img" aria-label="${esc(n.aria || `${c4Word(n)} ${n.label ?? ''}`)}">`
      + `<path d="${S.out(n)}" class="n-mask"/><path d="${S.out(n)}" class="n-body" fill="${f}" stroke="${c}"/>${S.det ? S.det(n, c, n.k) : ''}<g class="c-head">${tx.join('')}</g></g>`;
  },
};
C4_EL.ports = (n, side, k = 1) => portsOn(C4_EL, n, side, k);
SHAPE.c4 = C4_EL;
// a boundary (§7.5.1): a dashed box titled "<name> [Software System]", as C4 draws it
SHAPE['c4-boundary'] = { frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="none" stroke="var(--um-muted)" stroke-dasharray="6 4"/>`
  + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 18)}" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 24))}</text>` };

/* ---- the model read: elements by id, their owners, relationships ---- */
function c4Index(model) {
  const at = new Map(); C4_ARR(model && model.nodes).forEach(n => { if (C4_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const E = C4_ARR(model && model.edges).filter(e => C4_OBJ(e) && typeof e.id === 'string'), rels = E.filter(e => e.type === 'c4.Relationship');
  // the chain of owners, nearest first; a cycle (the core's error) stops it
  const chain = id => { const out = [], seen = new Set([id]); for (let p = (at.get(id) || {}).parent; p != null && at.has(p) && !seen.has(p); p = at.get(p).parent) { seen.add(p); out.push(p); } return out; };
  const kids = (id, type) => [...at.values()].filter(n => n.parent === id && n.type === type).map(n => n.id);
  return { at, E, rels, chain, kids };
}
const C4_LOOK = { boxTypes: ['c4.SoftwareSystem', 'c4.Container'], qualify: false, shape: () => 'c4-boundary', word: c4Word };
// the view's picture: its boxes, titled as C4 titles a boundary, each named by what it holds
function c4Pic(model, view) {
  const pic = ownersOn(model, view, C4_LOOK), I = c4Index(model);
  const boxes = pic.boxes.map(b => { const x = pic.at.get(b.id), held = pic.holds(b.id).map(id => pic.at.get(id)), k = new Map();
    held.forEach(y => { const w = c4Word(y).toLowerCase(); k.set(w, (k.get(w) || 0) + 1); });
    return { ...b, title: `${c4Name(x)} [${C4_TAG[x.type]}]`, aria: `${c4Word(x)} ${c4Name(x)}, a boundary holding ${[...k].map(([w, c]) => c4Plural(c, w)).join(', ') || 'nothing'}` }; });
  return { ...pic, I, boxes };
}

/* ---- the lines drawn (§5.2): the view's own relationships between shown elements, then one implied line a pair ---- */
// a relationship's end lifted to what the view shows of it: itself, else its nearest shown owner; null when the first shown
// thing up its chain is a boundary (a boundary is no end) or nothing is shown
function c4Lift(pic, id) {
  for (const x of [id, ...pic.I.chain(id)]) if (pic.ids.includes(x)) return pic.open.has(x) ? null : x;
  return null;
}
function c4Lines(model, view, pic) {
  const ends = new Set(pic.ids.filter(id => !pic.open.has(id))), byId = new Map(pic.I.E.map(e => [e.id, e]));
  const listed = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? byId.get(x) : x)).filter(C4_OBJ) : null;
  const own = (listed || pic.I.E.filter(e => e.type === 'c4.Relationship' || e.type === 'uml.CommentLink')).filter(e => typeof e.id === 'string' && ends.has(e.from) && ends.has(e.to));
  // a pair a relationship joins already, drawn or hidden by the view's list, takes no implied line
  const joined = new Set([...own, ...pic.I.rels].filter(e => ends.has(e.from) && ends.has(e.to)).map(e => e.from + '\n' + e.to)), implied = new Map();
  pic.I.rels.forEach(r => { if (ends.has(r.from) && ends.has(r.to)) return; // shown as itself, or hidden from the view: never lifted
    const a = c4Lift(pic, r.from), b = c4Lift(pic, r.to), k = a + '\n' + b;
    if (a == null || b == null || a === b || joined.has(k)) return;
    if (!implied.has(k)) implied.set(k, { id: `${a}->${b}`, from: a, to: b, of: [] });
    implied.get(k).of.push(r); });
  return { own, implied: [...implied.values()] };
}
const c4LineLabel = e => [e.label, C4_HAS(C4_P(e).technology) ? `[${C4_P(e).technology}]` : ''].filter(C4_HAS).join(' ');
// accessible names (A1): "Container Shop API, Python, FastAPI: Catalogue, basket, checkout and accounts as a JSON API"
function c4NodeName(x) {
  if (x.type === 'uml.Comment') return 'Comment: ' + c4Name(x);
  const P = C4_P(x), tech = x.type === 'c4.Container' || x.type === 'c4.Component' ? P.technology : null;
  return `${c4Ext(x) ? 'External ' + c4Word(x).toLowerCase() : c4Word(x)} ${c4Name(x)}${C4_HAS(tech) ? ', ' + tech : ''}${C4_HAS(P.description) ? ': ' + P.description : ''}`;
}
// "Relationship from Storefront to Shop API: Reads the catalogue and places orders through [JSON over HTTPS]"; an implied
// line names what it stands for and where they are edited
function c4LineName(e, pic) {
  const nm = id => c4Name(pic.at.get(id) || { id });
  if (e.of) { const said = e.of.map(r => `${c4Name(pic.at.get(r.from) || { id: r.from })} to ${c4Name(pic.at.get(r.to) || { id: r.to })}${C4_HAS(r.label) ? ', ' + r.label : ''}`);
    return `Implied relationship from ${nm(e.from)} to ${nm(e.to)}, standing for ${c4Plural(e.of.length, 'relationship')}: ${said.join('; ')}. Edit them where their own ends are shown`; }
  if (e.type === 'uml.CommentLink') return `Comment link from ${nm(e.from)} to ${nm(e.to)}`;
  const said = c4LineLabel(e); return `Relationship from ${nm(e.from)} to ${nm(e.to)}${said ? ': ' + said : ''}`;
}

/* ---- the key (§7.5): each element type and shape drawn, external, the relationship and the implied line ---- */
const C4_LINE_LOOK = { rel: { from: 'none', to: 'open' }, implied: { from: 'none', to: 'open', dashed: true }, note: { from: 'none', to: 'none', dashed: true } };
function c4Legend(nodes, edges) {
  const els = [...new Map(nodes.filter(n => n.shape === 'c4').map(n => [`${n.type} ${n.sh} ${n.ext}`, n])).values()];
  const swatch = n => `<rect x="3" y="2" width="22" height="12" rx="3" fill="var(--um-${n.ext ? 'slate' : 'cyan'}-f)" stroke="var(--um-${n.ext ? 'slate' : 'cyan'})"/>`;
  const item = (name, says, svg) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
  const line = dashed => `<g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round" fill="none"><path d="M2 8H25"${dashed ? ' stroke-dasharray="3 2"' : ''}/><path d="M17 4L26 8L17 12"/></g>`;
  return [...els.map(n => item(`${n.ext ? 'External ' + c4Word(n).toLowerCase() : c4Word(n)}${n.sh !== 'box' && !(n.sh === 'person' && n.type === 'c4.Person') ? ', ' + n.sh : ''}`,
    n.ext ? 'outside the system, drawn grey' : `a ${c4Word(n).toLowerCase()}`, swatch(n))),
  ...(edges.some(e => e.type === 'c4.Relationship') ? [item('Relationship', 'uses, with its technology in brackets', line(false))] : []),
  ...(edges.some(e => e.implied) ? [item('Implied relationship', 'stands for relationships between what the two hold', line(true))] : [])];
}

/* ---- the view laid out (§7.5, §11) ---- */
function c4Geo({ model, view, pos, memo }) {
  const pic = c4Pic(model, view), { own, implied } = c4Lines(model, view, pic), P = id => (C4_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const x = pic.at.get(id);
    if (x.type === 'uml.Comment') { const d = { id, label: c4Name(x), type: x.type, kind: 'file', shape: 'note', aria: c4NodeName(x), col: P(id)[0], row: P(id)[1] }; return { ...d, ...SHAPE.note.size(d) }; }
    const ext = c4Ext(x), d = { id, label: c4Name(x), type: x.type || 'c4.SoftwareSystem', kind: ext ? 'external' : 'frontend', shape: 'c4', sh: c4Shape(x), ext, tag: c4TagOf(x), desc: C4_P(x).description,
      aria: c4NodeName(x), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...C4_EL.size(d) }; });
  const edges = [...own.map(e => { const note = e.type === 'uml.CommentLink', label = note ? '' : c4LineLabel(e);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: label || undefined, end: note ? C4_LINE_LOOK.note : C4_LINE_LOOK.rel, aria: c4LineName(e, pic), cut: 280 }; }),
  ...implied.map(e => ({ id: e.id, _id: e.id, type: 'c4.Relationship', from: e.from, to: e.to, implied: e.of.map(r => r.id), end: C4_LINE_LOOK.implied, aria: c4LineName(e, pic), cut: 280,
    label: [e.of[0].label, e.of.length > 1 ? `[+${e.of.length - 1}]` : ''].filter(C4_HAS).join(' ') || undefined }))];
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: view.direction === 'down' ? 'down' : 'right',
    gap: 48, rgap: 64, labelGaps: true, repair: false, reroute: false }, memo);
  // on a copy (stage 4 §2.4): a person's or robot's body starts just above the highest line on its side, as a map card's
  // does (sidePorts), so each such end lands on its outline
  const sp = sidePorts(g), lift = new Map();
  g.nodes.forEach(n => { const p = (n.sh === 'person' || n.sh === 'robot') && sp.get(n), t = p ? Math.min(p.L, p.R) : Infinity; if (t < n.y + 14) lift.set(n, { ...n, portTop: t }); });
  const out = lift.size ? { nodes: g.nodes.map(n => lift.get(n) || n), byId: Object.fromEntries(g.nodes.map(n => [n.id, lift.get(n) || n])),
    edges: g.edges.map(e => (lift.has(e.s) || lift.has(e.t) ? { ...e, s: lift.get(e.s) || e.s, t: lift.get(e.t) || e.t } : e)) } : {};
  return { ...g, ...out, legend: c4Legend(nodes, edges), order: [...readingOrder(pic), ...edges.map(e => e.id)] }; // a new object: what layoutTyped returned is never edited
}

/* ---- validators (§5.1, §6.5). Each problem: { level, rule, path, message, ids } ---- */
const C4_RULES = {
  'c4-level': 'a view shows only what its level draws: a landscape or context view people and software systems; a container view containers too; a component view the components of its subject',
  'c4-subject': 'a context or container view zooms into a software system, a component view into a container; a context view shows its subject',
  'c4-owner': 'a container is owned by a software system, a component by a container, a container instance by a deployment node',
  'c4-instance': 'a container instance names a container',
  'c4-relationship': 'a relationship joins two static elements or two deployment elements, never an element and its own owner',
  'c4-zoom': 'a software system opens a view whose subject is that system, a container one whose subject is that container',
  'c4-description': 'every element has a description',
  'c4-technology': 'every container and component has a technology',
  'c4-label': 'every relationship has a description',
  'c4-title': 'every view has a title',
};
const C4_KIND = { 'c4.landscape': 'landscape', 'c4.context': 'context', 'c4.container': 'container', 'c4.component': 'component' };
// what each static view kind may show (§5.1), and the type its subject is
const C4_SHOWS = { landscape: ['c4.Person', 'c4.SoftwareSystem'], context: ['c4.Person', 'c4.SoftwareSystem'], container: ['c4.Person', 'c4.SoftwareSystem', 'c4.Container'],
  component: ['c4.Person', 'c4.SoftwareSystem', 'c4.Container', 'c4.Component'] };
const C4_SUBJECT = { context: 'c4.SoftwareSystem', container: 'c4.SoftwareSystem', component: 'c4.Container' };
const C4_OWNER = { 'c4.Container': 'c4.SoftwareSystem', 'c4.Component': 'c4.Container', 'c4.ContainerInstance': 'c4.DeploymentNode' };
const c4A = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
function c4Problems(model, view) {
  const out = [], I = c4Index(model), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const q = id => JSON.stringify(I.at.has(id) ? c4Name(I.at.get(id)) : String(id)), kind = id => (I.at.has(id) ? c4Word(I.at.get(id)).toLowerCase() : 'nothing');
  const views = C4_ARR(model && model.views), vi = views.indexOf(view), at = vi >= 0 ? `views[${vi}]` : 'view', K = C4_OBJ(view) ? C4_KIND[view.diagram] : null;
  // the model's rules: said once, whichever view asks (validate() keeps one of each path and message)
  C4_ARR(model && model.nodes).forEach((n, i) => { if (!C4_OBJ(n)) return;
    if (Object.hasOwn(C4_OWNER, n.type) && (I.at.get(n.parent) || {}).type !== C4_OWNER[n.type])
      say('error', 'c4-owner', `nodes[${i}].parent`, [n.id, n.parent], `${q(n.id)}, ${c4A(kind(n.id))}, is owned by ${n.parent != null && I.at.has(n.parent) ? `${q(n.parent)}, ${c4A(kind(n.parent))}` : 'nothing'}: its owner is ${c4A(C4_WORD[C4_OWNER[n.type]].toLowerCase())}`);
    if (n.type === 'c4.DeploymentNode' && n.parent != null && (I.at.get(n.parent) || {}).type !== 'c4.DeploymentNode')
      say('error', 'c4-owner', `nodes[${i}].parent`, [n.id, n.parent], `${q(n.id)}, a deployment node, is owned by ${q(n.parent)}, ${c4A(kind(n.parent))}: its owner is a deployment node or none`);
    if (n.type === 'c4.ContainerInstance' && (I.at.get(C4_P(n).container) || {}).type !== 'c4.Container')
      say('error', 'c4-instance', `nodes[${i}].props.container`, [n.id, C4_P(n).container], `${q(n.id)} is an instance of ${!C4_HAS(C4_P(n).container) ? 'nothing' : I.at.has(C4_P(n).container) ? `${q(C4_P(n).container)}, ${c4A(kind(C4_P(n).container))}` : `${JSON.stringify(String(C4_P(n).container))}, which is no element`}: it names a container`);
    // §6.5: a system's or container's opensView, when it names a C4 view, has that element as its subject
    const ov = (n.type === 'c4.SoftwareSystem' || n.type === 'c4.Container') && n.opensView != null && views.find(v => C4_OBJ(v) && v.id === n.opensView);
    if (ov && /^c4\./.test(String(ov.diagram)) && ov.subject !== n.id)
      say('warning', 'c4-zoom', `nodes[${i}].opensView`, [n.id, ov.subject], `${q(n.id)} opens view ${JSON.stringify(ov.title || ov.id)}, whose subject is ${ov.subject != null ? q(ov.subject) : 'none'}: it zooms into ${q(n.id)}`); });
  C4_ARR(model && model.edges).forEach((e, i) => { if (!C4_OBJ(e) || e.type !== 'c4.Relationship') return;
    const a = I.at.get(e.from), b = I.at.get(e.to), st = x => x && C4_STATIC.includes(x.type), dp = x => x && C4_DEPLOY.includes(x.type);
    if ((st(a) && dp(b)) || (dp(a) && st(b))) say('error', 'c4-relationship', `edges[${i}]`, [e.id, e.from, e.to], `${e.id} joins ${q(e.from)}, ${c4A(kind(e.from))}, and ${q(e.to)}, ${c4A(kind(e.to))}: a static element and a deployment one`);
    else if (a && b && (I.chain(e.from).includes(e.to) || I.chain(e.to).includes(e.from))) say('error', 'c4-relationship', `edges[${i}]`, [e.id, e.from, e.to], `${e.id} joins ${q(e.from)} and its own owner or part ${q(e.to)}`); });
  if (!K) return out;
  // the view's rules (§5.1)
  const ids = C4_ARR(view.nodeIds), S = C4_SUBJECT[K], subj = view.subject != null ? I.at.get(view.subject) : null;
  if (K === 'context' && !(subj && subj.type === S && ids.includes(view.subject)))
    say('warning', 'c4-subject', `${at}.subject`, [view.subject], view.subject == null ? 'a context view names the software system it is about as its subject' : `${q(view.subject)} is ${!subj || subj.type !== S ? 'not a software system' : 'not shown'}: a context view shows its software system`);
  if ((K === 'container' || K === 'component') && !(subj && subj.type === S))
    say('error', 'c4-subject', `${at}.subject`, [view.subject], `${view.subject == null ? 'the view has no subject' : `its subject ${q(view.subject)} is ${c4A(kind(view.subject))}`}: a ${K} view zooms into ${c4A(C4_WORD[S].toLowerCase())}`);
  ids.forEach((id, k) => { const x = I.at.get(id); if (!x || x.type === 'uml.Comment') return;
    const ok = C4_SHOWS[K].includes(x.type) && !(K === 'component' && x.type === 'c4.Component' && x.parent !== view.subject);
    if (!ok) say('error', 'c4-level', `${at}.nodeIds[${k}]`, [id], `${q(id)}, ${c4A(kind(id))}${x.type === 'c4.Component' && K === 'component' ? ` of ${q(x.parent)}` : ''}, is not drawn in a ${K} view`);
    const P = C4_P(x), j = C4_ARR(model.nodes).indexOf(x);
    if (C4_STATIC.includes(x.type) && !C4_HAS(P.description)) say('warning', 'c4-description', `nodes[${j}].props.description`, [id], `${q(id)} has no description`);
    if ((x.type === 'c4.Container' || x.type === 'c4.Component') && !C4_HAS(P.technology)) say('warning', 'c4-technology', `nodes[${j}].props.technology`, [id], `${q(id)}, ${c4A(kind(id))}, has no technology`); });
  const pic = c4Pic(model, view);
  c4Lines(model, view, pic).own.forEach(e => { const j = C4_ARR(model.edges).indexOf(e);
    if (e.type === 'c4.Relationship' && !C4_HAS(e.label)) say('warning', 'c4-label', `edges[${j}].label`, [e.id, e.from, e.to], `${e.id}, from ${q(e.from)} to ${q(e.to)}, has no description`); });
  if (!C4_HAS(view.title)) say('warning', 'c4-title', `${at}.title`, [], `view ${JSON.stringify(view.id)} has no title`);
  return out;
}

/* ---- describe(): the view in sentences, each element in reading order, then each line by its accessible name ---- */
function c4Describe(model, viewId) {
  const v = C4_ARR(model && model.views).find(x => C4_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = c4Pic(model, v), { own, implied } = c4Lines(model, v, pic), K = C4_KIND[v.diagram] || 'C4', box = new Map(pic.boxes.map(b => [b.id, b]));
  return [`${v.title || v.id}: a C4 ${K === 'landscape' ? 'system landscape' : K === 'context' ? 'system context' : K} diagram of ${c4Plural(pic.ids.length, 'element')} and ${c4Plural(own.length + implied.length, 'relationship')}${implied.length ? `, ${implied.length} of them implied` : ''}.`,
    ...readingOrder(pic).map(id => (box.has(id) ? box.get(id).aria : c4NodeName(pic.at.get(id)))), ...[...own, ...implied].map(e => c4LineName(e, pic))].map(t => t.replace(/\.?$/, '.')).join('\n');
}

/* ---- editing (§6.1, §7.5) ---- */
const c4Used = model => { const used = new Set(C4_ARR(model.views).filter(C4_OBJ).map(v => v.id)); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; }); return used; };
const c4Free = (used, base) => { if (!used.has(base)) return base; let k = 2; while (used.has(`${base}-${k}`)) k++; return `${base}-${k}`; };
// D (§6.1): a software system's container view, or a container's component view, made: the element (its boundary), what it
// owns a level down, and what their relationships reach, each lifted to that level; the element then opens it. One transaction
function c4Zoom(model, view, ids) {
  const I = c4Index(model), x = [...ids].reverse().map(id => I.at.get(id)).find(y => y && (y.type === 'c4.SoftwareSystem' || y.type === 'c4.Container') && y.opensView == null);
  if (!x) return null;
  const sys = x.type === 'c4.SoftwareSystem', kids = I.kids(x.id, sys ? 'c4.Container' : 'c4.Component'), inside = new Set(kids);
  // the far end of a relationship, at the new view's level: a person or a software system as it is, a container as it is (a
  // system's own are inside already), a component as its container, anything else not at all
  const level = id => { for (const y of [id, ...I.chain(id)]) { const t = (I.at.get(y) || {}).type;
    if (t === 'c4.Person' || t === 'c4.SoftwareSystem' || t === 'c4.Container') return y === x.id ? null : y; } return null; };
  const reach = []; I.rels.forEach(r => [[r.from, r.to], [r.to, r.from]].forEach(([a, b]) => { const up = [a, ...I.chain(a)].find(y => inside.has(y));
    const far = up && !inside.has(b) && !I.chain(b).some(y => inside.has(y)) ? level(b) : null; if (far && !reach.includes(far)) reach.push(far); }));
  const used = c4Used(model), id = c4Free(used, `${x.id}-${sys ? 'containers' : 'components'}`);
  const v = { id, diagram: sys ? 'c4.container' : 'c4.component', title: `${c4Name(x)}: ${sys ? 'containers' : 'components'}`, parent: view.id, subject: x.id, nodeIds: [x.id, ...kids, ...reach] };
  return { commands: [{ op: 'addView', view: v }, { op: 'set', id: x.id, path: 'opensView', value: id }], say: `Made the view ${v.title}: Enter opens it` };
}
// T: an element's C4 type, picked among the four (c4-owner and c4-level then say what no longer fits)
function c4Retype(model, ids) {
  const I = c4Index(model), x = I.at.get(ids.at(-1)); if (!x || !C4_STATIC.includes(x.type)) return null;
  return { pick: C4_STATIC.map(t => C4_WORD[t]), then: i => (C4_STATIC[i] === x.type ? [] : [{ op: 'set', id: x.id, path: 'type', value: C4_STATIC[i] }]) };
}
const c4Key = (model, view, ids, key) => (key === 'd' || key === 'D' ? c4Zoom(model, view, ids) : key === 't' || key === 'T' ? c4Retype(model, ids) : null);
// add: a container added to a container view, or a component to a component view, is owned by the view's subject
function c4Add(model, view, entry, label) {
  const I = c4Index(model), s = I.at.get(view.subject), K = C4_KIND[view.diagram];
  if (!s || !((K === 'container' && entry.type === 'c4.Container') || (K === 'component' && entry.type === 'c4.Component')) || s.type !== C4_OWNER[entry.type]) return null;
  const base = entry.type.split('.').pop().toLowerCase(), used = c4Used(model); let k = 1; while (used.has(base + k)) k++;
  return [{ op: 'add', element: { id: base + k, type: entry.type, ...(label ? { label } : {}), parent: s.id }, view: view.id }];
}
// the Owner field: a container's software systems, a component's containers
function c4Owners(model, x) {
  if (!C4_OBJ(x) || x.from != null || !Object.hasOwn(C4_OWNER, x.type) || x.type === 'c4.ContainerInstance') return null;
  return C4_ARR(model.nodes).filter(n => C4_OBJ(n) && n.type === C4_OWNER[x.type]).map(n => ({ id: n.id, label: c4Name(n) }));
}

/* ---- the type, under its four static view names ---- */
let c4People = new Set();
const C4_ELEMENT_PROPS = [{ key: 'description', label: 'Description', kind: 'text' }, { key: 'technology', label: 'Technology', kind: 'text' },
  { key: 'external', label: 'External', kind: 'bool' }, { key: 'shape', label: 'Shape', kind: 'enum', options: C4_SHAPES }];
const C4_DEF = {
  title: 'C4 diagram',
  elements: [...C4_STATIC.map(t => ({ type: t, label: C4_WORD[t] })), { type: 'uml.Comment', label: 'Comment' }],
  lines: [{ type: 'c4.Relationship', label: 'Relationship' }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { 'c4.Person': C4_ELEMENT_PROPS.filter(f => f.key !== 'technology'), 'c4.SoftwareSystem': C4_ELEMENT_PROPS.filter(f => f.key !== 'technology'),
    'c4.Container': C4_ELEMENT_PROPS, 'c4.Component': C4_ELEMENT_PROPS, 'c4.Relationship': [{ key: 'technology', label: 'Technology', kind: 'text' }], 'uml.CommentLink': [] },
  layout: c4Geo,
  boxes: (model, view) => { c4People = new Set(C4_ARR(model && model.nodes).filter(n => C4_OBJ(n) && n.type === 'c4.Person').map(n => n.id)); return c4Pic(model, view).boxes; },
  // a line into a person is ranked as if it came from them, so people come first (C4 draws them at the top or left). The host
  // asks boxes() before it ranks a view, which leaves the model's people here. ponytail: module state read by rankFlip,
  // which sees the line alone; a rankFlip(e, model) would lift it
  rankFlip: e => c4People.has(e.to) && !c4People.has(e.from),
  owners: c4Owners,
  validate: c4Problems,
  rules: C4_RULES,
  describe: c4Describe,
  // the PDF's tables (§9): an element's type; its technology and description; a relationship's text, with its technology
  word: (model, id) => { const x = c4Index(model).at.get(id); return x && Object.hasOwn(C4_WORD, x.type) ? C4_WORD[x.type] : null; },
  rows: (model, view, id) => { const x = c4Index(model).at.get(id); if (!x || !C4_STATIC.includes(x.type)) return null; const P = C4_P(x);
    return [...(C4_HAS(P.technology) ? [P.technology] : []), ...(C4_HAS(P.description) ? [P.description] : []), ...(c4Ext(x) ? ['external'] : [])]; },
  text: (model, view, id) => { const e = c4Index(model).rels.find(r => r.id === id); return e ? c4LineLabel(e) || null : null; },
  edits: { add: c4Add, key: c4Key },
};
const C4_TYPES = Object.keys(C4_KIND).map(name => registerDiagramType(name, C4_DEF));

export { C4_TYPES, C4_DEF, C4_RULES, C4_WORD, C4_SHAPES, c4Index, c4Pic, c4Lift, c4Lines, c4Geo, c4Problems, c4Describe, c4NodeName, c4LineName, c4LineLabel, c4Shape, c4TagOf, c4Ext, c4Zoom, c4Key, c4Add, c4Owners };
