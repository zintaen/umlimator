import { esc, fit, textW } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { endLabels } from '../typed/draw.js';

/* ---------- structure notation: what the component, deployment and composite structure types share (work package 5.3,
   notes/stage-5.md §4, §9.1) ----------
   Four shapes, each with size(n), out(n, d), inset(n, side, t), face(n), ports(n, side, k) and draw(n), as src/uml/flow.js's;
   strokes --um-muted, fills the stage's background (T2), every text cut with fit; hit areas 24 px at least (E8):
   - port: a 12 px square centred on its owner's border, longer along it where the router gave it several lines (§4.1);
     its name, n.nameBox, beside it (portsDrawn);
   - component: a rectangle, UML's component icon (16 × 12) at the top right, «component» (n.keyword) and n.stereotypes
     over the name; as a box's frame (frame(f)), its name and icon in the header room;
   - ball: a 16 px circle, its name under it cut at 160 px; a line's end slides onto the circle (src/typed/draw.js);
   - artifact: a rectangle, UML's document icon (12 × 14) at the top right, «artifact» («deployment spec» for
     n.type uml.DeploymentSpecification) over the name.
   Then: each port's side, chosen before the layout from the host's ranking (portSides, §4.2), and the room its owner needs
   (portFit); after the layout, on a copy of the geometry (§2.4), the ports with no line, every port as a node and its name
   (portsDrawn, §4.3, §4.5); the shared rules (port-owner, manifest-ends) and the accessible names. Ships in
   lib/umlimator-all.js only. */

const SN_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), SN_ARR = x => (Array.isArray(x) ? x : []);
const SN = { line: 'var(--um-muted)', ink: 'var(--um-text)', bg: 'var(--um-stage-bg)', port: 12, ball: 16, pad: 10, name: 12, nlh: 16, st: 11, sth: 14, minW: 96, maxW: 320, minH: 48, bmax: 160, bpx: 11 };
const snPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const snNode = (n, shape, said, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || said)}">${inner}</g>`;
const snText = (x, y, t, px, wt, fill, cls) => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="middle" class="${cls}" fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
const snBody = d => `<path d="${d}" class="n-mask"/><path d="${d}" class="n-body" fill="${SN.bg}" stroke="${SN.line}"/>`;
const snHit = (x, y, w, h) => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" class="st-hit" fill="transparent"/>`;
const snRect = boxOut(0);

/* ---- the accessible names (§10.1, §10.3): each look's, which the types write into n.aria ---- */
const SN_SAY = {
  // "Component Shop API (service), 2 ports, holding 1 component, 2 artifacts"; holds: a word for each element held
  component(label, { stereotypes = [], ports = 0, holds = [] } = {}) { const k = new Map(); holds.forEach(w => k.set(w, (k.get(w) || 0) + 1));
    return [`Component ${label ?? ''}${stereotypes.length ? ` (${stereotypes.join(', ')})` : ''}`, ...(ports ? [snPlural(ports, 'port')] : []),
      ...(k.size ? ['holding ' + [...k].map(([w, c]) => snPlural(c, w)).join(', ')] : [])].join(', '); },
  // "Port orders : OrderApi of Shop API, provides Orders, requires Payments"
  port: (label, owner, { valueType, provides = [], requires = [] } = {}) => `Port ${label ?? ''}${valueType ? ' : ' + valueType : ''}${owner ? ' of ' + owner : ''}`
    + (provides.length ? ', provides ' + provides.join(', ') : '') + (requires.length ? ', requires ' + requires.join(', ') : ''),
  // "Interface Orders, as a ball, provided by Shop API, required by Storefront"
  iface: (label, { ball, providers = [], requirers = [] } = {}) => `Interface ${label ?? ''}${ball ? ', as a ball' : ''}`
    + (providers.length ? ', provided by ' + providers.join(', ') : '') + (requirers.length ? ', required by ' + requirers.join(', ') : ''),
  // "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API"
  artifact: (label, { spec, on, manifests = [] } = {}) => `${spec ? 'Deployment specification' : 'Artifact'} ${label ?? ''}${on ? ', on ' + on : ''}${manifests.length ? ', manifests ' + manifests.join(', ') : ''}`,
};

/* ---- the port: its square, a 24 px area to hit, and its name (n.nameBox, placed by portsDrawn) ---- */
SHAPE.port = {
  size: () => ({ w: SN.port, h: SN.port }), out: snRect, inset: () => 0,
  draw(n) { const w = Math.max(24, n.w), h = Math.max(24, n.h), b = n.nameBox;
    return snNode(n, 'port', SN_SAY.port(n.label), snHit(n.x + n.w / 2 - w / 2, n.y + n.h / 2 - h / 2, w, h) + snBody(snRect(n))
      + (b ? `<text x="${r2(b.x + b.w / 2)}" y="${r2(b.y + 10.5)}" text-anchor="middle" class="port-name" data-box="${b.x} ${b.y} ${b.w} ${b.h}" fill="${SN.line}" style="font:500 10px var(--um-sans)">${esc(b.text)}</text>` : '')); },
};

/* ---- the component and the artifact: an icon's band at the top, then the keywords and stereotypes, then the name ---- */
const snIconBand = 24;
const snParts = (n, kw) => { const st = [...(kw ? [kw] : []), ...SN_ARR(n.stereotypes).filter(t => String(t ?? '').trim() !== '')].map(t => `«${t}»`), name = String(n.label ?? '');
  return { st, name, w: Math.ceil(Math.min(SN.maxW, Math.max(SN.minW, ...st.map(t => textW(t, SN.st) + 2 * SN.pad), textW(name, SN.name) + 2 * SN.pad))),
    h: Math.max(SN.minH, snIconBand + st.length * SN.sth + SN.nlh + 8) }; };
const snKeyword = n => (n.shape === 'artifact' ? (n.type === 'uml.DeploymentSpecification' ? 'deployment spec' : 'artifact') : n.keyword ? 'component' : null);
// UML's component icon: a rectangle with two small tabs on its left; the document icon: a page with its corner folded
const snCompIcon = (x, y) => `<path d="M${r2(x + 3)} ${r2(y)}H${r2(x + 16)}V${r2(y + 12)}H${r2(x + 3)}Z M${r2(x)} ${r2(y + 2)}H${r2(x + 6)}V${r2(y + 5)}H${r2(x)}Z M${r2(x)} ${r2(y + 7)}H${r2(x + 6)}V${r2(y + 10)}H${r2(x)}Z" class="n-det st-icon" fill="${SN.bg}" stroke="${SN.line}"/>`;
const snDocIcon = (x, y) => `<path d="M${r2(x)} ${r2(y)}H${r2(x + 8)}L${r2(x + 12)} ${r2(y + 4)}V${r2(y + 14)}H${r2(x)}Z M${r2(x + 8)} ${r2(y)}V${r2(y + 4)}H${r2(x + 12)}" class="n-det st-icon" fill="${SN.bg}" stroke="${SN.line}"/>`;
function snClassifier(shape, said, icon) {
  const S = {
    size: n => { const p = snParts(n, snKeyword({ ...n, shape })); return { w: p.w, h: p.h }; },
    out: snRect, inset: () => 0,
    draw(n) { const p = snParts(n, snKeyword({ ...n, shape })), cx = n.x + n.w / 2, max = n.w - 2 * SN.pad;
      let y = n.y + snIconBand + (n.h - snIconBand - p.st.length * SN.sth - SN.nlh - 8) / 2;
      const tx = p.st.map(t => { const s = snText(cx, y + 11, fit(t, SN.st, max), SN.st, 400, SN.line, 'c-st'); y += SN.sth; return s; });
      tx.push(snText(cx, y + 12, fit(p.name, SN.name, max), SN.name, 600, SN.ink, 'c-name').replace('<text ', `<text data-o="${esc(n.id)}" `));
      return snNode(n, shape, said(n), snBody(snRect(n)) + icon(n.x + n.w - 22, n.y + 6) + tx.join('')); },
  };
  return S;
}
SHAPE.component = snClassifier('component', n => SN_SAY.component(n.label), snCompIcon);
SHAPE.artifact = snClassifier('artifact', n => SN_SAY.artifact(n.label, { spec: n.type === 'uml.DeploymentSpecification' }), (x, y) => snDocIcon(x + 4, y - 1));
// a component that holds something shown is a box: its border, its name at the top left of the 24 px header room, its icon at the top right
SHAPE.component.frame = f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" stroke="${SN.line}"/>`
  + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 17)}" fill="${SN.ink}" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 44))}</text>`
  + snCompIcon(f.x + f.w - 26, f.y + 6);

/* ---- the ball: the circle at the top, centred, its name under it; a line's end slides onto the circle ---- */
const snBallName = n => fit(String(n.label ?? ''), SN.bpx, SN.bmax);
const snBallBox = n => ({ x: n.x + n.w / 2 - SN.ball / 2, y: n.y, w: SN.ball, h: SN.ball });
const snCircleIn = (b, s, t) => { const r = b.w / 2, u = t - (s === 'L' || s === 'R' ? b.y + r : b.x + r); return r - Math.sqrt(Math.max(0, r * r - u * u)); };
const snCircle = (b, d = 0) => { const r = b.w / 2 + d, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`; };
const SN_CIRCLE = { face: b => [b.y, b.y + b.h], inset: snCircleIn };
SHAPE.ball = {
  size: n => { const t = snBallName(n); return t ? { w: Math.ceil(Math.max(SN.ball, textW(t, SN.bpx) + 4)), h: SN.ball + 4 + SN.sth } : { w: SN.ball, h: SN.ball }; },
  out: (n, d = 0) => snCircle(snBallBox(n), d), face: n => [n.y, n.y + SN.ball],
  // the box's side to the circle: its own offset in the box, then the circle's depth. ponytail: a line the router ends on the
  // left or right below the circle (beside the name) slides to the circle's centre line; the component type gives every line to
  // a ball its side (notes/stage-5.md §9.2), so none does
  inset(n, s, t) { const b = snBallBox(n); return (s === 'L' ? b.x - n.x : s === 'R' ? n.x + n.w - b.x - b.w : s === 'B' ? n.y + n.h - b.y - b.h : 0) + snCircleIn(b, s, t); },
  ports: (n, side, k = 1) => portsOn(SN_CIRCLE, snBallBox(n), side, k),
  draw(n) { const b = snBallBox(n), t = snBallName(n), cx = n.x + n.w / 2;
    return snNode(n, 'ball', SN_SAY.iface(n.label, { ball: true }), `<circle cx="${r2(cx)}" cy="${r2(b.y + 8)}" r="12" class="st-hit" fill="transparent"/>` + snBody(snCircle(b))
      + (t ? snText(cx, b.y + SN.ball + 4 + 11, t, SN.bpx, 500, SN.ink, 'c-name') : '')); },
};
for (const k of ['port', 'component', 'artifact']) { const S = SHAPE[k]; S.face = n => [n.y, n.y + n.h]; S.ports = (n, side, j = 1) => portsOn(S, n, side, j); }

/* ---- a port's side, chosen before the layout (§4.2) ---- */
const SN_SIDES = ['L', 'R', 'T', 'B'], SN_PIN = { left: 'L', right: 'R', top: 'T', bottom: 'B' }, SN_TURN = { L: 'T', R: 'B', T: 'L', B: 'R' };
const SN_OUT = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
const portLen = k => SN.port + 10 * (Math.max(1, k || 1) - 1); // a port with k lines on its face (§4.1)
/* ports: [{ id, owner, pin, far }] in members order: pin, the view's present.<port>.side ('left', 'right', 'top', 'bottom');
   far: the ids of the far ends of its lines. pos: the ranking, id -> [col, row], a box's the mean of what it holds (the type's).
   A pinned port takes its pin; else the side facing most far ends, by column, then by row (down: a later column is below);
   a port with none takes its owner's side with fewest ports, left first. Returns { id: 'L' | 'R' | 'T' | 'B' } */
function portSides(ports, pos, down = false) {
  const out = {}, count = {}, P = id => (SN_OBJ(pos) && Object.hasOwn(pos, id) && Array.isArray(pos[id]) ? pos[id] : null), later = [];
  const put = (p, s) => { out[p.id] = s; (count[p.owner] ||= { L: 0, R: 0, T: 0, B: 0 })[s]++; };
  SN_ARR(ports).forEach(p => { if (Object.hasOwn(SN_PIN, p.pin)) return put(p, SN_PIN[p.pin]);
    const o = P(p.owner), votes = { L: 0, R: 0, T: 0, B: 0 };
    SN_ARR(p.far).forEach(id => { const f = P(id); if (!o || !f) return; const dc = f[0] - o[0], dr = f[1] - o[1], s = dc ? (dc > 0 ? 'R' : 'L') : dr ? (dr > 0 ? 'B' : 'T') : null;
      if (s) votes[down ? SN_TURN[s] : s]++; });
    const best = SN_SIDES.reduce((a, s) => (votes[s] > votes[a] ? s : a), 'L');
    if (votes[best]) put(p, best); else later.push(p); });
  later.forEach(p => { const c = count[p.owner] || { L: 0, R: 0, T: 0, B: 0 }; put(p, SN_SIDES.reduce((a, s) => (c[s] < c[a] ? s : a), 'L')); });
  return out;
}
// the least size of each port's owner (a node, not a box): on each side 16 + Σ (port length + 8) px; ports: [{ id, owner, lines }]
function portFit(ports, sides) {
  const sum = {}; SN_ARR(ports).forEach(p => { const s = sides[p.id]; if (s) (sum[p.owner] ||= { L: 16, R: 16, T: 16, B: 16 })[s] += portLen(p.lines) + 8; });
  return Object.fromEntries(Object.entries(sum).map(([o, k]) => [o, { w: Math.max(k.T, k.B), h: Math.max(k.L, k.R) }]));
}

/* ---- after the layout, on a copy (§4.3, §4.5) ----
   g: what layoutTyped returned, never edited. ports: [{ id, owner, side, label, valueType, aria }] in members order, side as
   portSides gave it; id is the port's geometry id (`<part>-><port>` on a part, §6), the one its lines name as fromPort or
   toPort. A port with lines is where the router's port hook put it (e.fpb, e.tpb: its box on that end; with neither, a 12 px
   square round the line's end); those with none go on their side in members order, 8 px clear of each other and of the
   ports with lines, within the side's free span (a node's less 8 px at each corner; a box's 40 px below its top and 16 px
   above its bottom, 20 px off its corners: stage 2's), or past its end where it cannot hold them. Each port's line ends move 6 px
   along the side they leave by, onto the square's outer face (its inner face, for a line inward). Each port becomes a node
   of the copy (shape 'port'), with its name `name : Type` placed by the end labels' search (endLabels) beside its first
   line out, or where a line straight out would be: clear of lines, nodes, ports, line labels and the names before it */
function portsDrawn(g, ports) {
  const fams = SN_ARR(g.families), owner = id => (g.byId && g.byId[id]) || fams.find(f => f.id === id), isBox = id => !(g.byId && g.byId[id]);
  const slide = (p, s) => [r2(p[0] + 6 * SN_OUT[s][0]), r2(p[1] + 6 * SN_OUT[s][1])];
  const edges = SN_ARR(g.edges).map(e => { if (!e.pts || !(e.fromPort || e.toPort)) return e; const pts = e.pts.map(p => p.slice());
    if (e.fromPort && SN_OUT[e.fs]) pts[0] = slide(pts[0], e.fs); if (e.toPort && SN_OUT[e.ts]) pts[pts.length - 1] = slide(pts[pts.length - 1], e.ts); return { ...e, pts }; });
  const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  const lined = p => { let r = null; // the union of the boxes its lines record: one port, longer for more lines on its face
    SN_ARR(g.edges).forEach(e => [[e.fromPort, e.fpb, e.pts && e.pts[0]], [e.toPort, e.tpb, e.pts && e.pts[e.pts.length - 1]]].forEach(([id, b, end]) => {
      const q = id !== p.id ? null : SN_OBJ(b) ? b : end ? { x: end[0] - 6, y: end[1] - 6, w: 12, h: 12 } : null; if (q) r = r ? union(r, q) : { ...q }; }));
    return r; };
  const at = new Map(), onSide = new Map(), boxesOn = (o, s) => onSide.get(o + '|' + s) || onSide.set(o + '|' + s, []).get(o + '|' + s); // a port's box; each owner's side's
  const list = SN_ARR(ports).filter(p => owner(p.owner) && SN_OUT[p.side]);
  list.forEach(p => { const r = lined(p); if (r) { at.set(p.id, r); boxesOn(p.owner, p.side).push(r); } });
  // the ports with no line, side by side: evenly over the span in members order, then pushed forwards and, at the span's end,
  // back, 20 px centre to centre (12 + 8), each past a port with lines it would come within 8 px of
  [...new Set(list.filter(p => !at.has(p.id)).map(p => p.owner + '|' + p.side))].forEach(key => {
    const mine = list.filter(p => !at.has(p.id) && p.owner + '|' + p.side === key), o = owner(mine[0].owner), s = mine[0].side, v = s === 'L' || s === 'R', held = boxesOn(mine[0].owner, s);
    const [a, b] = isBox(mine[0].owner) ? (v ? [o.y + 40, o.y + o.h - 16] : [o.x + 20, o.x + o.w - 20]) : (v ? [o.y + 8, o.y + o.h - 8] : [o.x + 8, o.x + o.w - 8]);
    const hit = t => held.find(r => { const lo = v ? r.y : r.x, hi = lo + (v ? r.h : r.w); return t + 14 > lo + .01 && t - 14 < hi - .01; }), end = r => (v ? r.y + r.h : r.x + r.w);
    const ts = []; mine.forEach((p, i) => { let t = Math.max(a + (b - a) * (i + 1) / (mine.length + 1), a + 6, i ? ts[i - 1] + 20 : -Infinity), r; while ((r = hit(t))) t = end(r) + 14; ts.push(t); });
    for (let i = mine.length - 1; i >= 0; i--) { let t = Math.min(ts[i], b - 6, i < mine.length - 1 ? ts[i + 1] - 20 : Infinity), r; while ((r = hit(t))) t = (v ? r.y : r.x) - 14; ts[i] = t; }
    const edge = s === 'L' ? o.x : s === 'R' ? o.x + o.w : s === 'T' ? o.y : o.y + o.h;
    mine.forEach((p, i) => { const t = ts[i], r = v ? { x: r2(edge - 6), y: r2(t - 6), w: 12, h: 12 } : { x: r2(t - 6), y: r2(edge - 6), w: 12, h: 12 }; at.set(p.id, r); held.push(r); });
  });
  // the names: obstacles are the nodes, the ports, every line's segments and labels, and the names placed before
  const segs = edges.filter(e => e.pts).flatMap(e => e.pts.slice(1).map((q, k) => { const p = e.pts[k]; return { x: Math.min(p[0], q[0]) - 3, y: Math.min(p[1], q[1]) - 3, w: Math.abs(q[0] - p[0]) + 6, h: Math.abs(q[1] - p[1]) + 6 }; }));
  const keep = [...SN_ARR(g.nodes).map(n => ({ x: n.x - 2, y: n.y - 2, w: n.w + 4, h: n.h + 4 })), ...[...at.values()].map(r => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 })), ...segs, ...edges.filter(e => e.lbl).map(e => e.lbl)];
  const nodes = list.map(p => { const r = at.get(p.id), o = owner(p.owner), s = p.side, text = `${p.label ?? ''}${p.valueType ? ' : ' + p.valueType : ''}`;
    const out = edges.find(e => e.pts && ((e.fromPort === p.id && e.fs === s) || (e.toPort === p.id && e.ts === s)));
    const v = s === 'L' || s === 'R', face = [r.x + r.w / 2 + (v ? r.w / 2 * SN_OUT[s][0] : 0), r.y + r.h / 2 + (v ? 0 : r.h / 2 * SN_OUT[s][1])];
    const pts = out ? (out.fromPort === p.id && out.fs === s ? out.pts : out.pts.slice().reverse()) : [face, [face[0] + 30 * SN_OUT[s][0], face[1] + 30 * SN_OUT[s][1]]];
    const [nameBox] = text.trim() ? endLabels({ end: { labels: { from: { role: text } } }, s: o, t: null }, pts, keep) : [];
    if (nameBox) keep.push(nameBox);
    return { id: p.id, label: p.label, type: 'uml.Port', shape: 'port', kind: 'file', k: 'file', owner: p.owner, side: s, col: o.col ?? 0, row: o.row ?? 0, ...r, aria: p.aria || SN_SAY.port(p.label, o.label, { valueType: p.valueType }), ...(nameBox ? { nameBox } : {}) }; });
  const all = [g.bounds, ...nodes, ...nodes.map(n => n.nameBox)].filter(Boolean);
  return { ...g, nodes: [...SN_ARR(g.nodes), ...nodes], byId: { ...g.byId, ...Object.fromEntries(nodes.map(n => [n.id, n])) }, edges, ports: nodes.map(n => n.id), ...(all.length ? { bounds: all.reduce(union) } : {}) };
}

/* ---- the shared rules (§10.1, §10.3): each problem { level, rule, path, message, ids }, as src/uml/flow.js's; with a view,
   only a port whose owner it shows and a manifestation that touches what it shows ---- */
const STRUCT_RULES = {
  'port-owner': 'a port is a member of a component or a class',
  'manifest-ends': 'a manifestation runs from an artifact (an error), to a component (a warning)',
};
const SN_ARTIFACTS = ['uml.Artifact', 'uml.DeploymentSpecification'];
const snWord = t => String(t ?? '').split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); // 'uml.ExecutionEnvironment': "execution environment"
function structProblems(model, view) {
  const out = [], at = new Map(), shown = new Set(SN_ARR(view && view.nodeIds)), seen = id => !view || shown.has(id);
  SN_ARR(model && model.nodes).forEach(n => { if (SN_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  const nm = x => (x ? `${snWord(x.type)} ${x.id}${x.label != null && x.label !== '' ? ` ("${x.label}")` : ''}` : 'nothing');
  const say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  SN_ARR(model && model.nodes).forEach((n, i) => { if (!SN_OBJ(n) || !seen(n.id)) return;
    if (n.type === 'uml.Port') say('error', 'port-owner', `nodes[${i}]`, [n.id], `${nm(n)} is a node; a port is a member of a component or a class`);
    SN_ARR(n.members).forEach((m, j) => { if (SN_OBJ(m) && m.type === 'uml.Port' && n.type !== 'uml.Component' && n.type !== 'uml.Class')
      say('error', 'port-owner', `nodes[${i}].members[${j}]`, [m.id, n.id], `${nm(m)} is a member of ${nm(n)}; a port is a member of a component or a class`); }); });
  SN_ARR(model && model.edges).forEach((e, i) => { if (!SN_OBJ(e) || e.type !== 'uml.Manifestation' || !(seen(e.from) || seen(e.to))) return;
    const f = at.get(e.from), t = at.get(e.to);
    if (!f || !SN_ARTIFACTS.includes(f.type)) say('error', 'manifest-ends', `edges[${i}]`, [e.id, e.from], `${e.id} runs from ${nm(f)}: a manifestation runs from an artifact`);
    if (!t || t.type !== 'uml.Component') say('warning', 'manifest-ends', `edges[${i}]`, [e.id, e.to], `${e.id} runs to ${nm(t)}: «manifest» is drawn to a component only`); });
  return out;
}

export { SN_SAY, portLen, portSides, portFit, portsDrawn, STRUCT_RULES, structProblems };
