import { textW } from '../core/text.js';
import { hit } from './layered.js';

// an issue's message, and what it is about (the cards, lines and boxes it names) when the caller keeps a list of that: check()
// turns those into Refs; the page's check reads only the messages
const teller = (issues, refs) => (message, ...about) => { issues.push(message); if (refs) refs.push(about); };
// a label's box L across one of box f's borders
const onBorder = (L, f) => { const xin = L.x + L.w > f.x && L.x < f.x + f.w, yin = L.y + L.h > f.y && L.y < f.y + f.h;
  return (xin && [f.y, f.y + f.h].some(u => L.y < u && L.y + L.h > u)) || (yin && [f.x, f.x + f.w].some(u => L.x < u && L.x + L.w > u)); };
// a detour: a route 2.5 times longer than the straight distance between its ends, or than 100 px; [its length, that distance]
const detour = pts => { const len = pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]), 0);
  const d = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]); return len > 2.5 * Math.max(d, 100) ? [len, d] : null; };
// behind a card a line meets on its side `side` (R, L, T or B): past the opposite side
const behind = (n, side, [x, y]) => side === 'R' ? x < n.x - .5 : side === 'L' ? x > n.x + n.w + .5 : side === 'B' ? y < n.y - .5 : y > n.y + n.h + .5;
// [the end, its side] that a line runs round: its route goes behind one of its own ends while its other end is not there. A
// long line passed the detour rule however it went round (clinic's reminder: over the patient, down its far side, under it)
const roundEnd = e => [[e.s, e.fs, e.pts[e.pts.length - 1]], [e.t, e.ts, e.pts[0]]].find(([n, side, far]) => n && side && !behind(n, side, far) && e.pts.some(p => behind(n, side, p)));
function routeAudit(geo, where, only, refs) { // only: a set of edges; counts just the issues that involve one of them
  const sk = e => only && !only.has(e);
  const issues = [], say = teller(issues, refs);
  // routes: no crossings, no shared runs, no label lying across another route
  const segs = geo.edges.map(e => e.pts.slice(0, -1).map((a, i) => [a, e.pts[i + 1]]));
  const name = e => `${e.s.label}→${e.t.label}`;
  const crossing = ([a, b], [c, d]) => {
    const av = a[0] === b[0], cv = c[0] === d[0];
    if (av === cv) { // parallel: overlapping collinear run = shared trunk
      if (av && Math.abs(a[0] - c[0]) < 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1 ? 'share' : null;
      if (!av && Math.abs(a[1] - c[1]) < 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1 ? 'share' : null;
      return null;
    }
    const [v, hz] = av ? [[a, b], [c, d]] : [[c, d], [a, b]];
    const x = v[0][0], y = hz[0][1];
    const inV = y > Math.min(v[0][1], v[1][1]) + .5 && y < Math.max(v[0][1], v[1][1]) - .5, inH = x > Math.min(hz[0][0], hz[1][0]) + .5 && x < Math.max(hz[0][0], hz[1][0]) - .5;
    return inV && inH ? 'cross' : null;
  };
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    if (geo.edges[i].fixed && geo.edges[j].fixed) continue; // one comb: its branches share the trunk by design
    if (sk(geo.edges[i]) && sk(geo.edges[j])) continue;
    let found = null;
    for (const s1 of segs[i]) { for (const s2 of segs[j]) { found = crossing(s1, s2); if (found) break; } if (found) break; }
    if (found === 'cross') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} cross`, geo.edges[i], geo.edges[j]);
    if (found === 'share') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} share a line`, geo.edges[i], geo.edges[j]);
  }
  geo.edges.forEach((e, i) => { if (!e.lbl) return; const L = { x: e.lbl.x + 1, y: e.lbl.y + 1, w: e.lbl.w - 2, h: e.lbl.h - 2 };
    geo.edges.forEach((o, j) => { if (j !== i && !(sk(e) && sk(o)) && segs[j].some(([a, b]) => Math.max(a[0], b[0]) > L.x && Math.min(a[0], b[0]) < L.x + L.w && Math.max(a[1], b[1]) > L.y && Math.min(a[1], b[1]) < L.y + L.h)) say(`${where}: label "${e.lbl.text || e.lbl.step}" lies on edge ${name(o)}`, e, o); }); });
  const segHit = (r, i) => segs[i].some(([a, b]) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h);
  if (geo.map) {
    const ex = 12, drawn = new Set(geo.edges.map(e => e.from + '>' + e.to)); // A→B and B→A both drawn: a pair the view keeps apart
    geo.edges.forEach((e, i) => {
      // clearance: a route keeps 12+ px from every node it does not connect
      geo.nodes.forEach(n => { if (n.id === e.from || n.id === e.to) return;
        if (segHit({ x: n.x - ex + .5, y: n.y - ex + .5, w: n.w + 2 * ex - 1, h: n.h + 2 * ex - 1 }, i)) say(`${where}: edge ${name(e)} passes within ${ex}px of node "${n.label}"`, e, n); });
      const dt = detour(e.pts); if (dt) say(`${where}: edge ${name(e)} takes a detour (${Math.round(dt[0])}px for ${Math.round(dt[1])}px)`, e);
      const r = roundEnd(e); if (r) say(`${where}: edge ${name(e)} runs round its own end "${r[0].label}"`, e, r[0].box ? (geo.families || []).find(f => f.id === r[0].id) : r[0]);
      // reading order: every wire runs left to right, except one that closes a loop or answers its pair (keepPairs)
      if (!e.back && !e.both && !drawn.has(e.to + '>' + e.from) && e.t.x + e.t.w / 2 <= e.s.x + e.s.w / 2) say(`${where}: edge ${name(e)} runs right-to-left`, e);
    });
    if (geo.hub) { // hub views: one visible line into each callee
      const into = {}; geo.edges.forEach(e => { (into[e.to] ||= []).push(e); });
      Object.entries(into).forEach(([id, es]) => { es = es.filter(e => !e.back); if (es.some(e => e.from === geo.hub) && es.length > 1) say(`${where}: hub callee "${(geo.byId[id] || {}).label || id}" has ${es.length} incoming lines`, geo.byId[id]); });
    }
  }
  // author name tags hang under their card: no route may run through one
  (geo.nodes || []).forEach(n => { if (!n.tag) return; const r = { x: n.tag.x + 1, y: n.tag.y + 1, w: n.tag.w - 2, h: n.tag.h - 2 };
    geo.edges.forEach((o, j) => { if (segHit(r, j)) say(`${where}: name tag "${n.tag.text}" lies on edge ${name(o)}`, n, o); }); });
  // lanes: every part sits inside its own lane, lanes never overlap, no route crosses a lane header
  const lanes = geo.lanes || [];
  lanes.forEach((l, i) => {
    lanes.slice(i + 1).forEach(m => { if (hit(l, m, -1)) say(`${where}: lanes "${l.title}" and "${m.title}" overlap`); });
    (geo.nodes || []).forEach(n => {
      if (n.lane === i && (n.x < l.x || n.x + n.w > l.x + l.w || n.y < l.y || n.y + n.h + (n.tag ? 14 : 0) > l.y + l.h)) say(`${where}: lane "${l.title}": node "${n.label}" sticks out`, n);
      if (n.lane != null && n.lane !== i && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${n.label}" of another lane sits in it`, n);
      if (n.lane == null && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${n.label}" belongs to no lane but sits in it`, n);
    });
  });
  (geo.blocks || []).forEach(b => geo.edges.forEach((o, j) => { if (segHit({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }, j)) say(`${where}: lane "${b.title || ''}": header crossed by edge ${name(o)}`, o); }));
  const families = geo.families || [], inside = (a,b) => b.x > a.x && b.y > a.y && b.x+b.w < a.x+a.w && b.y+b.h < a.y+a.h;
  families.forEach(f => {
    const parent = families.find(p => p.id === f.parent);
    if (f.parent && (!parent || !inside(parent,f))) say(`${where}: family "${f.label}" sticks out of its parent`, f);
    (f.nodeIds || []).forEach(id => { const n = geo.byId[id]; if (n && !inside(f,n)) say(`${where}: family "${f.label}" does not contain "${n.label}"`, f, n); });
    families.filter(g => g !== f && g.parent === f.parent && g.id > f.id).forEach(g => { if (hit(f,g,-1)) say(`${where}: families "${f.label}" and "${g.label}" overlap`, f, g); });
    geo.edges.forEach((e,i) => { if (segHit({x:f.x+8,y:f.y+3,w:Math.min(f.w-16,textW(f.label || f.id,11)+16),h:22},i)) say(`${where}: family "${f.label}": header crossed by edge ${name(e)}`, f, e); });
    geo.edges.forEach((e,i) => { if (segs[i].some(([a,b]) => { const v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];
      const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);
      return hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8); })) say(`${where}: edge ${name(e)} runs along the border of family "${f.label}"`, e, f); });
    geo.edges.forEach(e => { const L = e.lbl; if (L && onBorder(L, f)) say(`${where}: label "${L.text || L.step}" sits on the border of family "${f.label}"`, e, f); });
  });
  return issues;
}

/* The layout check's geometry, which needs no fonts: check() runs it on layout()'s geometry, and the page adds what it
   measures in the DOM (text against its card, a lane's or box's title, edge labels against each other). */
const box = n => ({ x: n.x, y: n.y, w: n.w, h: n.h });
function overlapIssues(geo, where, refs) {
  const issues = [], nodes = geo.nodes, say = teller(issues, refs);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(box(nodes[i]), box(nodes[j]), -1)) say(`${where}: nodes "${nodes[i].label}" and "${nodes[j].label}" overlap`, nodes[i], nodes[j]);
  return issues;
}
function leaveIssues(geo, where, refs) {
  const issues = [], say = teller(issues, refs);
  // a numbered line's label with no room on it: only its step shows, its words in the line's title and the details only
  if (geo.map) geo.edges.forEach(e => { if (e.label && e.lbl && e.lbl.short) say(`${where}: label "${e.label}" has no room on edge ${e.s.label}→${e.t.label}: only its step ${e.lbl.step} shows`, e); });
  if (geo.map) geo.edges.forEach(e => { const L = e.lbl; if (!L || (!e.label && L.step == null) || !e.pts) return; // a label, or a step's mark, must leave some of its own line visible
    const c = [L.x + L.w / 2, L.y + L.h / 2], P = e.pts; let s = 0, at = null, half = 0, tot = 0;
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (at == null) { const onH = a[1] === b[1] && Math.abs(c[1] - a[1]) < 2 && c[0] >= Math.min(a[0], b[0]) - 1 && c[0] <= Math.max(a[0], b[0]) + 1;
        const onV = a[0] === b[0] && Math.abs(c[0] - a[0]) < 2 && c[1] >= Math.min(a[1], b[1]) - 1 && c[1] <= Math.max(a[1], b[1]) + 1;
        if (onH || onV) { at = tot + Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]); half = onH ? L.w / 2 : L.h / 2; } }
      tot += len; }
    if (at == null) return; const room = Math.min(at - half, tot - at - half);
    if (room < 16) say(`${where}: label "${e.label || L.step}" leaves its line ${Math.max(0, Math.round(room))} px (${e.s.label}→${e.t.label})`, e); });
  return issues;
}

/* label-overlap audit used by `visual.py check` (world coordinates, real font metrics) */
function auditSvg(svg, geo, where) {
  const issues = overlapIssues(geo, where), R = box;
  const T = [...svg.querySelectorAll('text[data-t]')].map(t => { let b; try { b = t.getBBox(); } catch (_) { return null; } return { t: t.dataset.t, o: t.dataset.o, txt: t.textContent, b: { x: b.x, y: b.y, w: b.width, h: b.height } }; }).filter(x => x && x.b.w);
  const nodes = geo.nodes, faces = Object.fromEntries([...svg.querySelectorAll('.node[data-face]')].map(g => [g.dataset.id, g.dataset.face.split(' ').map(Number)])); // a shape's face (0.15.0)
  T.forEach(a => {
    if (a.t === 'lt' || a.t === 'ft') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: lane "${a.txt}": header covers node "${n.label}"`); });
      if (a.t === 'ft') { const f = (geo.families || []).find(f => f.id === a.o); if (f && (a.b.x < f.x || a.b.x+a.b.w > f.x+f.w)) issues.push(`${where}: family title "${a.txt}" overflows its box`); }
    } else if (a.t === 'el') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: edge label "${a.txt}" covers node "${n.label}"`); });
    } else {
      const own = geo.byId[a.o];
      if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text "${a.txt}" overflows node "${own.label}"`);
      const face = own && faces[own.id], fy = face ? (face[0] + face[1]) / 2 : own && own.y + own.h / 2; // a shape's mark and text keep to its face
      if (own && geo.map && (a.t === 'nl' || a.t === 'ns') && hit(a.b, { x: own.x + 11, y: fy - 17, w: 34, h: 34 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${own.label}"`);
      if (face && (a.b.y < face[0] - 1 || a.b.y + a.b.h > face[1] + 1)) issues.push(`${where}: text "${a.txt}" overflows the shape of node "${own.label}"`);
      nodes.forEach(n => { if (n !== own && hit(a.b, R(n), -1)) issues.push(`${where}: text "${a.txt}" overlaps node "${n.label}"`); });
    }
  });
  svg.querySelectorAll('rect.verb-chip').forEach(r => { const own = geo.byId[r.closest('[data-id]').dataset.id], x = +r.getAttribute('x'); // a chip's pill, not only its text (#84)
    if (own && (x < own.x + 1 || x + +r.getAttribute('width') > own.x + own.w - 1)) issues.push(`${where}: chip "${r.nextElementSibling.textContent}" overflows node "${own.label}"`); });
  issues.push(...routeAudit(geo, where), ...leaveIssues(geo, where));
  const els = T.filter(a => a.t === 'el');
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (hit(els[i].b, els[j].b, -1)) issues.push(`${where}: edge labels "${els[i].txt}" and "${els[j].txt}" overlap`);
  return issues;
}

export { onBorder, detour, behind, routeAudit, overlapIssues, leaveIssues };
