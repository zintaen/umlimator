import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import './class.js'; // SHAPE.note, a comment's look
import { ownersOn, readingOrder } from './owners.js';
import { SN_SAY, structProblems } from './structure.js'; // SHAPE.artifact and SHAPE.component too

/* ---------- the deployment diagram, uml.deployment (work package 5.5, notes/stage-5.md §10.3) ----------
   Nodes, devices and execution environments (UML's cube: a front face with a top and a right face 10 px deep), each a box
   when it holds something shown, nested to any depth; artifacts and deployment specifications (src/uml/structure.js's
   artifact), deployed by nesting or by a «deploy» line; components, what an artifact manifests (the component look);
   communication paths with their labels, dependencies and comments. Laid out by layoutTyped from the host's ranking with a
   small gap, gapAfter's per-column widening, labelGaps and paths cut at 280 px (§8); repair and reroute off (§14). A line
   ending on a cube box's top or right side is drawn on to the face outside its border, on a copy (§2.4). Ships in
   lib/umlimator-all.js only. */

const DP_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), DP_ARR = x => (Array.isArray(x) ? x : []);
const DP_HAS = x => x != null && x !== '';
const dpName = x => String(x.label ?? x.id);
const dpStereo = x => DP_ARR(DP_OBJ(x.props) ? x.props.stereotypes : null).filter(DP_HAS).map(String);
const dpPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const DP_TARGETS = ['uml.Node', 'uml.Device', 'uml.ExecutionEnvironment'], DP_ARTIFACTS = ['uml.Artifact', 'uml.DeploymentSpecification'];
const DP_LINES = ['uml.Deployment', 'uml.Manifestation', 'uml.CommunicationPath', 'uml.Dependency', 'uml.CommentLink'];
const DP_WORD = { 'uml.Node': 'Node', 'uml.Device': 'Device', 'uml.ExecutionEnvironment': 'Execution environment', 'uml.Artifact': 'Artifact',
  'uml.DeploymentSpecification': 'Deployment specification', 'uml.Component': 'Component', 'uml.Comment': 'Comment' };
const dpWord = x => (Object.hasOwn(DP_WORD, x.type) ? DP_WORD[x.type] : String(x.type ?? '').split('.').pop());
const DP_KW = { 'uml.Device': 'device', 'uml.ExecutionEnvironment': 'executionEnvironment' };

/* ---- the cube (§9.1): SHAPE.node's outline and inset, 10 px deep, in the typed look's paint; closed a node, open a frame ---- */
const DP = { d: 10, pad: 10, name: 12, nlh: 16, st: 11, sth: 14, minW: 120, maxW: 320, minH: 60 };
const dpParts = n => { const st = [...(DP_KW[n.type] ? [DP_KW[n.type]] : []), ...DP_ARR(n.stereotypes)].map(t => `«${t}»`), name = String(n.label ?? '');
  return { st, name, w: Math.ceil(Math.min(DP.maxW, Math.max(DP.minW, ...st.map(t => textW(t, DP.st) + 2 * DP.pad), textW(name, DP.name) + 2 * DP.pad)) + DP.d),
    h: Math.max(DP.minH, DP.d + 16 + st.length * DP.sth + DP.nlh) }; };
const dpOut = (n, g = 0) => { const p = DP.d, x = n.x - g, y = n.y - g, w = n.w + 2 * g, h = n.h + 2 * g;
  return `M${r2(x)} ${r2(y + p)}L${r2(x + p)} ${r2(y)}H${r2(x + w)}V${r2(y + h - p)}L${r2(x + w - p)} ${r2(y + h)}H${r2(x)}Z`; };
const dpText = (x, y, t, px, wt, fill, cls, more = '') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="middle" class="${cls}"${more} fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
SHAPE.cube = {
  size: n => { const p = dpParts(n); return { w: p.w, h: p.h }; },
  out: dpOut, face: n => [n.y + DP.d, n.y + n.h],
  inset(n, s, t) { const p = DP.d; return s === 'L' ? Math.max(0, n.y + p - t) : s === 'R' ? Math.max(0, t - n.y - n.h + p) : s === 'T' ? Math.max(0, n.x + p - t) : Math.max(0, t - n.x - n.w + p); },
  draw(n) {
    const { x, y, w, h } = n, p = DP.d, P = dpParts(n), cx = x + (w - p) / 2, max = w - p - 2 * DP.pad;
    let ty = y + p + (h - p - P.st.length * DP.sth - DP.nlh) / 2;
    const tx = P.st.map(t => { const s = dpText(cx, ty + 11, fit(t, DP.st, max), DP.st, 400, 'var(--um-muted)', 'c-st'); ty += DP.sth; return s; });
    tx.push(dpText(cx, ty + 12, fit(P.name, DP.name, max), DP.name, 600, 'var(--um-text)', 'c-name', ` data-o="${esc(n.id)}"`));
    return `<g class="node cube" data-id="${esc(n.id)}" data-shape="cube" tabindex="-1" role="img" aria-label="${esc(n.aria || `${dpWord(n)} ${n.label ?? ''}`)}">`
      + `<path d="${dpOut(n)}" class="n-mask"/><path d="${dpOut(n)}" class="n-body" fill="var(--um-stage-bg)" stroke="var(--um-muted)"/>`
      + `<path d="M${r2(x)} ${r2(y + p)}H${r2(x + w - p)}V${r2(y + h)}M${r2(x + w - p)} ${r2(y + p)}L${r2(x + w)} ${r2(y)}" class="n-det" fill="none" stroke="var(--um-muted)"/>`
      + `<g class="c-head" data-band="${r2(y + p)} ${r2(y + h)}">${tx.join('')}</g></g>`;
  },
  // open: the box's border is the front face; the top and right faces lie outside it, in the 32 px between boxes, and the
  // keyword, stereotypes and name (the box's title) sit at the top left of its 24 px header room
  frame: f => { const p = DP.d, { x, y, w, h } = f;
    return `<rect class="family-box" x="${x}" y="${y}" width="${w}" height="${h}" stroke="var(--um-muted)"/>`
      + `<path d="M${r2(x)} ${r2(y)}L${r2(x + p)} ${r2(y - p)}H${r2(x + w + p)}V${r2(y + h - p)}L${r2(x + w)} ${r2(y + h)}M${r2(x + w)} ${r2(y)}L${r2(x + w + p)} ${r2(y - p)}" class="dp-face" fill="none" stroke="var(--um-muted)"/>`
      + `<text class="family-title" x="${r2(x + 12)}" y="${r2(y + 17)}" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, w - 24))}</text>`; },
};
// how far a line's end on a cube box's side lies inside the faces' outline, at t along the side (only the top and right have faces)
const dpFaceAt = (f, s, t) => (s === 'T' ? Math.min(DP.d, Math.max(0, t - f.x)) : s === 'R' ? Math.min(DP.d, Math.max(0, f.y + f.h - t)) : 0);

/* ---- the view read: its boxes (§7), its lines, and every element's words ---- */
const DP_LOOK = { boxTypes: DP_TARGETS, qualify: false, shape: () => 'cube', word: dpWord };
function dpIndex(model) {
  const at = new Map(); DP_ARR(model && model.nodes).forEach(n => { if (DP_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const E = DP_ARR(model && model.edges).filter(e => DP_OBJ(e) && typeof e.id === 'string');
  const into = (t, id) => E.filter(e => e.type === t && e.to === id), outOf = (t, id) => E.filter(e => e.type === t && e.from === id);
  // what is deployed on a target: the artifacts it owns, then those a «deploy» line brings, each once
  const deployed = id => [...new Set([...[...at.values()].filter(n => n.parent === id && DP_ARTIFACTS.includes(n.type)).map(n => n.id), ...into('uml.Deployment', id).map(e => e.from).filter(x => at.has(x))])];
  return { at, E, into, outOf, deployed };
}
// the view's boxes, each titled with its keyword and stereotypes and named as §10.3 says
function dpPic(model, view) {
  const pic = ownersOn(model, view, DP_LOOK), I = dpIndex(model);
  const boxes = pic.boxes.map(b => { const x = pic.at.get(b.id); return { ...b, title: [...[...(DP_KW[x.type] ? [DP_KW[x.type]] : []), ...dpStereo(x)].map(t => `«${t}»`), dpName(x)].join(' '), aria: dpNodeName(x, pic, I) }; });
  return { ...pic, I, boxes };
}
// the lines drawn: those the view lists, or with no list the model's of this type's kinds, between two elements it shows; a
// line from a box to what it holds is left out (the router refuses it)
function dpLines(model, view, pic) {
  const E = new Map(pic.I.E.map(e => [e.id, e])), shown = new Set(pic.ids), list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : pic.I.E.filter(e => DP_LINES.includes(e.type));
  return list.filter(e => DP_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to)
    && ![[e.from, e.to], [e.to, e.from]].some(([b, x]) => pic.open.has(b) && (b === x || pic.chain(x).includes(b))));
}
const DP_KEYWORD = { 'uml.Deployment': '«deploy»', 'uml.Manifestation': '«manifest»' };
const dpLineLabel = e => [DP_KEYWORD[e.type], ...dpStereo(e).map(t => `«${t}»`), e.label].filter(DP_HAS).join(' ');
const DP_LINE_LOOK = { 'uml.Deployment': { from: 'none', to: 'open', dashed: true }, 'uml.Manifestation': { from: 'none', to: 'open', dashed: true },
  'uml.CommunicationPath': { from: 'none', to: 'none' }, 'uml.Dependency': { from: 'none', to: 'open', dashed: true }, 'uml.CommentLink': { from: 'none', to: 'none', dashed: true } };
const DP_LINE_WORD = { 'uml.Deployment': 'Deployment', 'uml.Manifestation': 'Manifestation', 'uml.CommunicationPath': 'Communication path', 'uml.Dependency': 'Dependency', 'uml.CommentLink': 'Comment link' };
// accessible names (§10.3): "Device Application server, holding 1 execution environment"; "Execution environment Java 21 runtime,
// in Application server, 3 artifacts deployed"; "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API"
function dpNodeName(n, pic, I) {
  if (n.type === 'uml.Comment') return 'Comment: ' + dpName(n);
  const nm = id => dpName(I.at.get(id)), st = dpStereo(n), up = n.parent != null && I.at.get(n.parent);
  if (DP_ARTIFACTS.includes(n.type)) return SN_SAY.artifact(dpName(n), { spec: n.type === 'uml.DeploymentSpecification',
    on: [...new Set([...(up && DP_TARGETS.includes(up.type) ? [up.id] : []), ...I.outOf('uml.Deployment', n.id).map(e => e.to).filter(x => I.at.has(x))])].map(nm).join(', ') || null,
    manifests: I.outOf('uml.Manifestation', n.id).map(e => e.to).filter(x => I.at.has(x)).map(nm) });
  if (n.type === 'uml.Component') return SN_SAY.component(dpName(n), { stereotypes: st });
  const out = [`${dpWord(n)} ${dpName(n)}${st.length ? ` (${st.join(', ')})` : ''}`];
  if (!DP_TARGETS.includes(n.type)) return out[0];
  if (up && pic.ids.includes(up.id)) out.push(`in ${dpName(up)}`);
  const k = new Map(); pic.holds(n.id).map(id => I.at.get(id)).filter(x => !DP_ARTIFACTS.includes(x.type)).forEach(x => { const w = dpWord(x).toLowerCase(); k.set(w, (k.get(w) || 0) + 1); });
  if (k.size) out.push('holding ' + [...k].map(([w, c]) => dpPlural(c, w)).join(', '));
  const d = I.deployed(n.id).length; if (d) out.push(`${dpPlural(d, 'artifact')} deployed`);
  return out.join(', ');
}
// "Communication path HTTPS from Shopper's device to Edge proxy"; "Deployment from routes.conf to Edge proxy"
function dpLineName(e, pic) {
  const nm = id => dpName(pic.at.get(id)), word = Object.hasOwn(DP_LINE_WORD, e.type) ? DP_LINE_WORD[e.type] : 'Line', said = [...dpStereo(e).map(t => `«${t}»`), e.label].filter(DP_HAS).join(' ');
  return e.type === 'uml.CommunicationPath' ? `${word} ${said ? said + ' ' : ''}from ${nm(e.from)} to ${nm(e.to)}` : `${word} from ${nm(e.from)} to ${nm(e.to)}${said ? ': ' + said : ''}`;
}

/* ---- the legend: each line kind drawn. ponytail: copies class.js's legendItem and ends, which it does not export ---- */
const DP_ENDS = { none: '', open: '<path d="M17 4L26 8L17 12" fill="none"/>' };
const DP_SAYS = { 'uml.Deployment': '«deploy»: the artifact runs on the target', 'uml.Manifestation': '«manifest»: the artifact is built from the component',
  'uml.CommunicationPath': 'the two exchange messages', 'uml.Dependency': 'uses the one it points to', 'uml.CommentLink': 'what a comment is about' };
const dpLegend = edges => DP_LINES.filter(t => edges.some(e => e.type === t)).map(t => { const L = DP_LINE_LOOK[t], name = DP_LINE_WORD[t], says = DP_SAYS[t];
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${L.to === 'none' ? 26 : 17}"${L.dashed ? ' stroke-dasharray="3 2"' : ''}/>${DP_ENDS[L.to]}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; });

/* ---- the view laid out (§10.3) ---- */
function dpGeo({ model, view, pos, memo }) {
  const pic = dpPic(model, view), lines = dpLines(model, view, pic), P = id => (DP_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = pic.at.get(id), st = dpStereo(n);
    const shape = n.type === 'uml.Comment' ? 'note' : DP_TARGETS.includes(n.type) ? 'cube' : DP_ARTIFACTS.includes(n.type) ? 'artifact' : n.type === 'uml.Component' ? 'component' : 'classifier';
    const d = { id, label: dpName(n), type: n.type || 'uml.Node', kind: 'file', shape, stereotypes: st, ...(shape === 'classifier' ? { compartments: [] } : {}), aria: dpNodeName(n, pic, pic.I), col: P(id)[0], row: P(id)[1] };
    return { ...d, ...SHAPE[shape].size(d) }; });
  const edges = lines.map(e => { const label = dpLineLabel(e);
    return { id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: label || undefined, end: Object.hasOwn(DP_LINE_LOOK, e.type) ? DP_LINE_LOOK[e.type] : { from: 'none', to: 'arrow' }, aria: dpLineName(e, pic),
      ...(e.type === 'uml.CommunicationPath' ? { cut: 280 } : {}), ...(DP_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }; });
  // a small gap with gapAfter's widening, and labelGaps for a label left with no spot (§8, decision 9); stage 2's 12 px padding:
  // a deployment view has no ports (§7)
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: view.direction === 'down' ? 'down' : 'right',
    gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  // on a copy: a line's end on a cube box's top or right side goes on to the face drawn outside the border
  const fams = new Map((g.families || []).map(f => [f.id, f]));
  const out = g.edges.map(e => { const a = fams.get(e.from), b = fams.get(e.to), da = a && e.pts && dpFaceAt(a, e.fs, e.fs === 'T' ? e.pts[0][0] : e.pts[0][1]), db = b && e.pts && dpFaceAt(b, e.ts, e.ts === 'T' ? e.pts.at(-1)[0] : e.pts.at(-1)[1]);
    if (!da && !db) return e;
    const pts = e.pts.map(p => p.slice()), mv = (p, s, k) => { if (s === 'T') p[1] -= k; else p[0] += k; };
    if (da) mv(pts[0], e.fs, da); if (db) mv(pts[pts.length - 1], e.ts, db); return { ...e, pts }; });
  return { ...g, edges: out, legend: dpLegend(g.edges), order: [...readingOrder(pic), ...lines.map(e => e.id)] }; // a new object: what layoutTyped returned is never edited (§2.4)
}

/* ---- validators (§10.3). Each problem: { level, rule, path, message, ids } ---- */
const DP_RULES = {
  'deploy-ends': 'a deployment runs from an artifact or deployment specification to a node, device or execution environment',
  'deployed-twice': 'an artifact nested in one target is not also deployed by a line to another',
  'nest-kinds': 'a node, device or execution environment is owned by one of the three (an error), in a usual pair (a warning): an execution environment in any, a device in a node or a device, a node in a node',
  'path-ends': 'a communication path joins two nodes, devices or execution environments',
  'manifest-ends': 'a manifestation runs from an artifact (an error), to a component (a warning)',
};
const DP_USUAL = { 'uml.ExecutionEnvironment': DP_TARGETS, 'uml.Device': ['uml.Node', 'uml.Device'], 'uml.Node': ['uml.Node'] };
function dpProblems(model, view) {
  const out = [], I = dpIndex(model), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const ty = id => (I.at.get(id) || {}).type, q = id => JSON.stringify(I.at.has(id) ? dpName(I.at.get(id)) : String(id)), kind = id => (I.at.has(id) ? dpWord(I.at.get(id)).toLowerCase() : 'nothing');
  DP_ARR(model && model.nodes).forEach((n, i) => { if (!DP_OBJ(n) || !DP_TARGETS.includes(n.type) || n.parent == null || !I.at.has(n.parent)) return;
    const p = I.at.get(n.parent);
    if (!DP_TARGETS.includes(p.type)) say('error', 'nest-kinds', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)}, a ${kind(n.id)}, is owned by ${q(p.id)}, a ${kind(p.id)}: its owner is a node, a device or an execution environment`);
    else if (!DP_USUAL[n.type].includes(p.type)) say('warning', 'nest-kinds', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)}, a ${kind(n.id)}, is in ${q(p.id)}, a ${kind(p.id)}: an unusual pair`); });
  DP_ARR(model && model.edges).forEach((e, i) => { if (!DP_OBJ(e)) return; const path = `edges[${i}]`, ends = [e.id, e.from, e.to];
    if (e.type === 'uml.Deployment') {
      if (!DP_ARTIFACTS.includes(ty(e.from)) || !DP_TARGETS.includes(ty(e.to))) say('error', 'deploy-ends', path, ends, `${e.id} runs from ${q(e.from)} (${kind(e.from)}) to ${q(e.to)} (${kind(e.to)}): from an artifact or deployment specification to a node, device or execution environment`);
      else { const a = I.at.get(e.from); if (a.parent != null && DP_TARGETS.includes(ty(a.parent)) && a.parent !== e.to)
        say('warning', 'deployed-twice', path, [e.id, e.from, a.parent, e.to], `${q(e.from)} is nested in ${q(a.parent)} and deployed by ${e.id} to ${q(e.to)} as well`); } }
    if (e.type === 'uml.CommunicationPath' && (!DP_TARGETS.includes(ty(e.from)) || !DP_TARGETS.includes(ty(e.to)) || e.from === e.to))
      say('error', 'path-ends', path, ends, `${e.id} joins ${q(e.from)} (${kind(e.from)}) and ${q(e.to)} (${kind(e.to)}): a communication path joins two nodes, devices or execution environments`); });
  return [...out, ...structProblems(model, view).filter(p => p.rule === 'manifest-ends')];
}

/* ---- describe(): the view in sentences, each element by its accessible name in reading order, then each line ---- */
function dpDescribe(model, viewId) {
  const v = DP_ARR(model && model.views).find(x => DP_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = dpPic(model, v), lines = dpLines(model, v, pic), by = new Map(lines.map(e => [e.id, e]));
  return [`${v.title || v.id}: a deployment diagram of ${dpPlural(pic.ids.length, 'element')} and ${dpPlural(lines.length, 'line')}.`,
    ...[...readingOrder(pic), ...lines.map(e => e.id)].map(id => (by.has(id) ? dpLineName(by.get(id), pic) : dpNodeName(pic.at.get(id), pic, pic.I)) + '.')].join('\n');
}

/* ---- editing (§12) ---- */
// the Owner field: an artifact's, a deployment specification's or a target's: every node, device and execution environment by
// its name (the core leaves out the element and what it holds)
function dpOwners(model, x) {
  if (!DP_OBJ(x) || x.from != null || ![...DP_TARGETS, ...DP_ARTIFACTS].includes(x.type)) return null;
  return DP_ARR(model.nodes).filter(n => DP_OBJ(n) && DP_TARGETS.includes(n.type)).map(n => ({ id: n.id, label: dpName(n) }));
}
// connect: a deployment drawn from a target to an artifact, or a manifestation from a component to an artifact, is added from
// the artifact; a deployment or a communication path between ends it cannot join is refused, said on the hint line
function dpConnect(model, view, from, to, at, line) {
  const ty = id => (DP_ARR(model.nodes).find(n => DP_OBJ(n) && n.id === id) || {}).type, t = DP_OBJ(line) ? line.type : null;
  const flip = (t === 'uml.Deployment' && DP_TARGETS.includes(ty(from)) && DP_ARTIFACTS.includes(ty(to))) || (t === 'uml.Manifestation' && ty(from) === 'uml.Component' && DP_ARTIFACTS.includes(ty(to)));
  if (t === 'uml.Deployment' && !flip && !(DP_ARTIFACTS.includes(ty(from)) && DP_TARGETS.includes(ty(to)))) return { error: 'A deployment runs from an artifact to a node, a device or an execution environment' };
  if (t === 'uml.CommunicationPath' && (!DP_TARGETS.includes(ty(from)) || !DP_TARGETS.includes(ty(to)) || from === to)) return { error: 'A communication path joins two nodes, devices or execution environments' };
  if (!flip) return null;
  const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  const base = t === 'uml.Deployment' ? 'deployment' : 'manifestation'; let k = 1; while (used.has(base + k)) k++;
  return [{ op: 'add', element: { id: base + k, type: t, from: to, to: from }, view: view.id }];
}
// remove: a target deleted from the model takes what it owns with it (apply()); the hint line counts what goes (§10.4)
function dpRemove(model, view, ids, fromModel) {
  const I = dpIndex(model), ts = fromModel ? ids.filter(id => DP_TARGETS.includes((I.at.get(id) || {}).type)) : [];
  const under = id => { for (let p = (I.at.get(id) || {}).parent, seen = new Set(); p != null && !seen.has(p); p = (I.at.get(p) || {}).parent) { if (ts.includes(p)) return true; seen.add(p); } return false; };
  const held = [...I.at.keys()].filter(id => !ids.includes(id) && under(id)).length;
  if (!held) return null;
  return { commands: ids.map(id => ({ op: 'delete', id })), say: `Deleted ${ts.length === 1 ? `${dpWord(I.at.get(ts[0])).toLowerCase()} ${dpName(I.at.get(ts[0]))}` : dpPlural(ts.length, 'target')} and the ${dpPlural(held, 'element')} ${ts.length === 1 ? 'it' : 'they'} held` };
}

/* ---- the type ---- */
const DP_STEREO = { key: 'stereotypes', label: 'Stereotypes', kind: 'list' };
const DP_TYPE = registerDiagramType('uml.deployment', {
  title: 'deployment diagram',
  elements: [['Node', 'Node'], ['Device', 'Device'], ['ExecutionEnvironment', 'Execution environment'], ['Artifact', 'Artifact'], ['DeploymentSpecification', 'Deployment specification'], ['Component', 'Component'], ['Comment', 'Comment']]
    .map(([t, label]) => ({ type: 'uml.' + t, label })),
  lines: [['Deployment', 'Deployment'], ['Manifestation', 'Manifestation'], ['CommunicationPath', 'Communication path'], ['Dependency', 'Dependency'], ['CommentLink', 'Comment link']].map(([t, label]) => ({ type: 'uml.' + t, label })),
  props: Object.fromEntries([...DP_TARGETS, ...DP_ARTIFACTS, 'uml.Component', ...DP_LINES.filter(t => t !== 'uml.CommentLink')].map(t => [t, [DP_STEREO]]).concat([['uml.CommentLink', []]])),
  layout: dpGeo,
  boxes: (model, view) => dpPic(model, view).boxes,
  owners: dpOwners,
  validate: dpProblems,
  rules: DP_RULES,
  describe: dpDescribe,
  // the PDF's tables (§11): an element's kind; a target's rows, what is deployed on it, by nesting or by a line; an artifact's, what it manifests
  word: (model, id) => { const x = dpIndex(model).at.get(id); return x && Object.hasOwn(DP_WORD, x.type) ? DP_WORD[x.type] : null; },
  rows: (model, view, id) => { const I = dpIndex(model), x = I.at.get(id), nm = k => dpName(I.at.get(k));
    if (x && DP_TARGETS.includes(x.type)) return I.deployed(id).map(a => (I.at.get(a).parent === id ? nm(a) : `${nm(a)}, by «deploy»`));
    if (x && DP_ARTIFACTS.includes(x.type)) return I.outOf('uml.Manifestation', id).filter(e => I.at.has(e.to)).map(e => `manifests ${nm(e.to)}`);
    return null; },
  edits: { connect: dpConnect, remove: dpRemove },
});

export { DP_TYPE, DP_RULES, dpGeo, dpProblems, dpDescribe, dpConnect, dpRemove, dpOwners };
