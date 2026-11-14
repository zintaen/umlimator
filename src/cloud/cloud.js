import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW, wrap2 } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import { layoutTyped } from '../typed/layout.js';
import { ownersOn, readingOrder } from '../uml/owners.js';

/* ---------- the cloud architecture family: aws, gcp and azure (work package 4a.6, notes/milestone-4a.md §5) ----------
   Groups (a project, a region, a VPC, a subnet…) as stage 2's boxes, nested by parent to any depth as the deployment type
   nests its targets; services on a card of the family's own: the vendor's icon at 32 px on the logo tile maps draw, the label
   and under it the service's full name; lines with an open arrow. Laid out by layoutTyped from the host's ranking, repair and
   reroute off (§11). The icons come from the host's `icons` table, keyed `<pack>/<id>` (§4.5): the module never fetches one,
   draws it only through <image> from a data URL, scaled with meet, never clipped, filtered, masked, faded or transformed (S6);
   with none a 24 px outlined square, the glyph. A picture that draws a Google icon draws Google's legal line under it, inside
   its bounds, and its legend and describe() end with it (S9); AWS's trademark line the same, wherever an AWS icon is drawn
   (AWS's acceptance of 14 Nov 2026, work package 4a.8). AWS is registered since AWS accepted (CLOUD_AWS, decision 1, §4.7).
   The build drops this file's exports, so no public surface carries the definitions. Ships in lib/umlimator-all.js only. */

const CLOUD_AWS = true;
// Google's legal line, as icons/packs.json's gcp row holds it (tests/cloud.test.mjs keeps the two equal)
const GCP_LEGAL = 'Google Cloud and the Google Cloud logo are trademarks of Google LLC.';
// AWS's trademark line, as icons/packs.json's aws row holds it (the same test keeps the two equal)
const AWS_LEGAL = 'Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc. or its affiliates.';

const CL_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), CL_ARR = x => (Array.isArray(x) ? x : []);
const CL_HAS = x => x != null && x !== '';
const clName = x => String(x.label ?? x.id);
const clProps = x => (CL_OBJ(x.props) ? x.props : {});
const clPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;

/* ---- the three families (model.md rows 26 to 28, §5.5): group kinds, where each may sit, the dashed ones ---- */
const CL_FAM = {
  aws: { title: 'an AWS diagram', legal: AWS_LEGAL, group: 'aws.Group', key: 'groupType', items: { 'aws.Service': 'Service', 'aws.Resource': 'Resource' }, line: ['aws.Connection', 'Connection'],
    kinds: { cloud: 'Cloud', account: 'Account', region: 'Region', 'availability-zone': 'Availability zone', vpc: 'VPC', 'public-subnet': 'Public subnet', 'private-subnet': 'Private subnet', 'security-group': 'Security group', generic: 'Group' },
    sits: { cloud: [], account: ['cloud', 'account'], region: ['cloud', 'account'], vpc: ['region'], 'availability-zone': ['vpc', 'region'], 'public-subnet': ['availability-zone', 'vpc'],
      'private-subnet': ['availability-zone', 'vpc'], 'security-group': ['public-subnet', 'private-subnet', 'vpc'] } },
  gcp: { title: 'a Google Cloud diagram', legal: GCP_LEGAL, group: 'gcp.Zone', key: 'zoneType', items: { 'gcp.Product': 'Product' }, user: 'gcp.User', line: ['gcp.Path', 'Path'],
    kinds: { project: 'Project', region: 'Region', zone: 'Zone', network: 'Network', subnetwork: 'Subnetwork', generic: 'Group' },
    sits: { project: [], region: ['project'], network: ['project', 'region'], subnetwork: ['network'], zone: ['region', 'subnetwork'] } },
  azure: { title: 'an Azure diagram', group: 'azure.Group', key: 'groupType', items: { 'azure.Service': 'Service' }, line: ['azure.Connector', 'Connector'],
    kinds: { subscription: 'Subscription', 'resource-group': 'Resource group', region: 'Region', 'virtual-network': 'Virtual network', subnet: 'Subnet', generic: 'Group' },
    sits: { subscription: [], 'resource-group': ['subscription'], region: ['subscription', 'resource-group'], 'virtual-network': ['region', 'resource-group'], subnet: ['virtual-network'] } },
};
const CL_DASHED = ['region', 'availability-zone', 'zone'];
const clKindOf = (F, x) => { const k = clProps(x)[F.key]; return typeof k === 'string' && Object.hasOwn(F.kinds, k) ? k : null; };
const clKindWord = (F, x) => { const k = clKindOf(F, x); return k ? F.kinds[k] : 'Group'; };
const clWord = (F, x) => (x.type === F.group ? clKindWord(F, x) : Object.hasOwn(F.items, x.type) ? F.items[x.type] : x.type === F.user ? 'User' : String(x.type ?? '').split('.').pop());
const clThe = w => `the ${w === w.toUpperCase() ? w : w.toLowerCase()}`; // "the VPC", "the resource group"

// a node's icon (S6, S8): its id, the table's entry for it (a data URL only, never markup) and the full name, from the table
// or the id with hyphens and underscores as spaces; null with no props.icon
function clIcon(F, D, n) {
  const id = clProps(n).icon; if (typeof id !== 'string' || !id) return null;
  const T = CL_OBJ(D && D.icons) ? D.icons : {}, k = F.pack + '/' + id, e = Object.hasOwn(T, k) && CL_OBJ(T[k]) ? T[k] : {};
  return { id, src: typeof e.src === 'string' && /^data:image\//.test(e.src) ? e.src : null, dark: e.dark === true, name: CL_HAS(e.name) ? String(e.name) : id.split(/[-_\s]+/).filter(Boolean).join(' ') };
}
// the host gave this family's pack: its legal entry or any icon of it (icon-missing reads only then)
const clGiven = (F, D) => CL_OBJ(D && D.icons) && Object.keys(D.icons).some(k => k.startsWith(F.pack + '/'));

/* ---- the service card (§5.2): the icon on its tile, the label (13 px, two lines of 180 px), the full name under it ---- */
const CLD = { pad: 12, icon: 32, gap: 10, label: 13, llh: 16, name: 11, nlh: 14, text: 180, minW: 180, maxW: 280, minH: 56 }, CL_TILE = CLD.icon * 34 / 28; // svgOf's tile rule
const clWrap = (s, px) => { s = String(s ?? ''); return textW(s, px) <= CLD.text ? [s] : wrap2(s, px, CLD.text) || [fit(s, px, CLD.text, true)]; };
const clText = (x, y, t, px, wt, fill, cls, more = '', anchor = 'start') => `<text x="${r2(x)}" y="${r2(y)}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`} class="${cls}"${more} fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(t)}</text>`;
function clParts(n) {
  const label = clWrap(n.label, CLD.label), name = CL_HAS(n.name) && n.name !== n.label ? clWrap(n.name, CLD.name) : [], left = CLD.pad + CL_TILE + CLD.gap;
  const tw = Math.max(...label.map(t => textW(t, CLD.label)), ...name.map(t => textW(t, CLD.name))), text = label.length * CLD.llh + (name.length ? 2 + name.length * CLD.nlh : 0);
  return { label, name, left, text, w: Math.ceil(Math.min(CLD.maxW, Math.max(CLD.minW, left + tw + CLD.pad))), h: Math.max(CLD.minH, Math.ceil(text + 20)) };
}
const clNodeG = (n, cls, body) => `<g class="node ${cls}" data-id="${esc(n.id)}" data-shape="${cls}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || n.id)}">${body}</g>`;
SHAPE['cloud-card'] = {
  size: n => { const p = clParts(n); return { w: p.w, h: p.h }; },
  out: SHAPE.box.out, face: SHAPE.box.face, inset: SHAPE.box.inset,
  draw(n) {
    const P = clParts(n), o = SHAPE.box.out(n), tx = n.x + CLD.pad, ty = n.y + (n.h - CL_TILE) / 2, max = n.w - P.left - CLD.pad, x = n.x + P.left, I = n.img;
    // the icon unmodified, scaled only (S6); the glyph risks.md §6 asks for where the table has none
    const mark = I ? `<rect x="${r2(tx)}" y="${r2(ty)}" width="${r2(CL_TILE)}" height="${r2(CL_TILE)}" rx="${CLD.icon / 4}" class="n-logo${I.dark ? ' dark' : ''}"/><image class="cl-icon" href="${esc(I.src)}" x="${r2(tx + CLD.icon * 3 / 28)}" y="${r2(ty + CLD.icon * 3 / 28)}" width="${CLD.icon}" height="${CLD.icon}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="${r2(tx + (CL_TILE - 24) / 2)}" y="${r2(n.y + (n.h - 24) / 2)}" width="24" height="24" rx="3" class="cl-glyph" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/>`;
    let y = n.y + (n.h - P.text) / 2; const t = [];
    P.label.forEach((s, i) => { t.push(clText(x, y + 12.5, fit(s, CLD.label, max, true), CLD.label, 600, 'var(--um-text)', 'c-name', i ? '' : ` data-o="${esc(n.id)}"`)); y += CLD.llh; });
    if (P.name.length) y += 2;
    P.name.forEach(s => { t.push(clText(x, y + 10.5, fit(s, CLD.name, max, true), CLD.name, 400, 'var(--um-muted)', 'c-st cl-name')); y += CLD.nlh; });
    return clNodeG(n, 'cloud-card', `<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="var(--um-stage-bg)" stroke="var(--um-muted)"/>${mark}<g class="c-head">${t.join('')}</g>`);
  },
};
// a group (§5.3): open, stage 2's box titled "<label> [<kind>]", dashed by kind; closed (holding nothing shown), a card of that title
const clDash = d => (d ? ' stroke-dasharray="6 4"' : '');
SHAPE['cloud-group'] = {
  size: n => ({ w: Math.ceil(Math.min(CLD.maxW, Math.max(120, textW(n.title, 12) + 24))), h: 44 }),
  out: SHAPE.box.out, face: SHAPE.box.face, inset: SHAPE.box.inset,
  draw: n => { const o = SHAPE.box.out(n);
    return clNodeG(n, 'cloud-group', `<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="var(--um-stage-bg)" stroke="var(--um-muted)"${clDash(n.dashed)}/>`
      + `<g class="c-head">${clText(n.x + n.w / 2, n.y + n.h / 2 + 4, fit(n.title, 12, n.w - 24), 12, 600, 'var(--um-text)', 'c-name', ` data-o="${esc(n.id)}"`, 'middle')}</g>`); },
  frame: f => `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="none" stroke="var(--um-muted)"${clDash(f.dashed)}/>`
    + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 18)}" fill="var(--um-text)" style="font:600 12px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 12, f.w - 24))}</text>`,
};
// a user (gcp.User): the map's person, no icon, its name under the head
SHAPE['cloud-user'] = {
  size: n => { const L = clWrap(n.label, CLD.label); return { w: Math.ceil(Math.min(240, Math.max(120, ...L.map(t => textW(t, CLD.label) + 28)))), h: Math.max(CLD.minH, 40 + L.length * CLD.llh) }; },
  out: (n, d) => SHAPE.person.out(n, d), face: n => SHAPE.person.face(n), inset: (n, s, t) => SHAPE.person.inset(n, s, t),
  draw: n => { const o = SHAPE.person.out(n), L = clWrap(n.label, CLD.label); let y = n.y + 30; const t = [];
    L.forEach((s, i) => { t.push(clText(n.x + n.w / 2, y + 12.5, fit(s, CLD.label, n.w - 24, true), CLD.label, 600, 'var(--um-text)', 'c-name', i ? '' : ` data-o="${esc(n.id)}"`, 'middle')); y += CLD.llh; });
    return clNodeG(n, 'cloud-user', `<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="var(--um-stage-bg)" stroke="var(--um-muted)"/>${SHAPE.person.det(n, 'var(--um-muted)')}<g class="c-head">${t.join('')}</g>`); },
};

/* ---- the model read ---- */
function clIndex(model) {
  const at = new Map(); CL_ARR(model && model.nodes).forEach(n => { if (CL_OBJ(n) && typeof n.id === 'string' && !at.has(n.id)) at.set(n.id, n); });
  // the chain of owners, nearest first; a cycle (the core's error) stops it
  const chain = id => { const out = [], seen = new Set([id]); for (let p = (at.get(id) || {}).parent; p != null && at.has(p) && !seen.has(p); p = at.get(p).parent) { seen.add(p); out.push(p); } return out; };
  return { at, chain, E: CL_ARR(model && model.edges).filter(e => CL_OBJ(e) && typeof e.id === 'string'), holds: (a, b) => chain(b).includes(a) };
}
// the view's boxes: each open group, titled with its kind (decision 10), dashed by kind
function clPic(F, model, view) {
  const pic = ownersOn(model, view, { boxTypes: [F.group], qualify: false, shape: () => 'cloud-group', word: x => clWord(F, x) });
  return { ...pic, boxes: pic.boxes.map(b => { const x = pic.at.get(b.id); return { ...b, title: `${clName(x)} [${clKindWord(F, x)}]`, dashed: CL_DASHED.includes(clKindOf(F, x)) }; }) };
}
// the lines drawn: those the view lists, or with no list the model's of the family's kind, between two elements it shows; one
// between a group and what it holds, or from a group to itself, is left out (line-inside: the router refuses it)
const clInside = (F, I, a, b) => (a === b && (I.at.get(a) || {}).type === F.group) || I.holds(a, b) || I.holds(b, a);
function clLinesOf(F, model, view, pic, I) {
  const E = new Map(I.E.map(e => [e.id, e])), shown = new Set(pic.ids), list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : I.E.filter(e => e.type === F.line[0]);
  return list.filter(e => CL_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to) && !clInside(F, I, e.from, e.to));
}
// accessible names (§5.2): "Product Shop API, Cloud Run"; "Path HTTPS from Shoppers to Load balancer"
function clNodeName(F, D, n) {
  if (n.type === F.group) return `${clKindWord(F, n)} ${clName(n)}`;
  const ic = clIcon(F, D, n), w = clWord(F, n);
  if (n.type === F.user) return `${w} ${clName(n)}`;
  return `${w} ${clName(n)}${ic && ic.name !== clName(n) ? ', ' + ic.name : ''}${ic && ic.src ? '' : ', icon not available'}`;
}
const clLineName = (F, e, I) => { const nm = id => clName(I.at.get(id) || { id }); return `${F.line[1]} ${CL_HAS(e.label) ? e.label + ' ' : ''}from ${nm(e.from)} to ${nm(e.to)}`; };

/* ---- the legend (§5.7): each icon drawn with its full name, the glyph, the group kinds, the user, the line; Google's line ---- */
const clItem = (name, says, svg) => `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true">${svg}</svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`;
function clLegend(F, nodes, boxes, edges, legal) {
  const icons = [...new Map(nodes.filter(n => n.img).map(n => [n.iconId, n])).values()];
  const kinds = [...new Map([...boxes, ...nodes.filter(n => n.shape === 'cloud-group')].map(b => [b.gkind, b])).values()];
  return [...icons.map(n => clItem(n.name, `icon ${n.iconId}`, `<rect x="5" y="-1" width="18" height="18" rx="4" class="n-logo${n.img.dark ? ' dark' : ''}"/><image class="cl-icon" href="${esc(n.img.src)}" x="6" y="0" width="16" height="16" preserveAspectRatio="xMidYMid meet"/>`)),
    ...(nodes.some(n => n.shape === 'cloud-card' && !n.img) ? [clItem('Icon not available', 'the pack is not fetched, or has no such icon', '<rect x="8" y="2" width="12" height="12" rx="2" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/>')] : []),
    ...kinds.map(b => clItem(F.kinds[b.gkind] || 'Group', 'a group, its kind in brackets', `<rect x="3" y="2" width="22" height="12" rx="3" fill="none" stroke="var(--um-muted)" stroke-width="1.4"${b.dashed ? ' stroke-dasharray="3 2"' : ''}/>`)),
    ...(nodes.some(n => n.shape === 'cloud-user') ? [clItem('User', 'a person who uses the system', '<circle cx="14" cy="5" r="3.5" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/><path d="M7 15C7 10 21 10 21 15" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/>')] : []),
    ...(edges.length ? [clItem(F.line[1], 'a request or a flow of data, to the arrow', '<g stroke="var(--um-muted)" stroke-width="1.4" fill="none"><path d="M2 8H25"/><path d="M17 4L26 8L17 12"/></g>')] : []),
    ...(legal ? [`<span class="lgi cl-legal">${esc(F.legal)}</span>`] : [])];
}

/* ---- the view laid out (§5) ---- */
const clGeo = F => ({ model, view, pos, memo }) => {
  const pic = clPic(F, model, view), I = clIndex(model), lines = clLinesOf(F, model, view, pic, I), P = id => (CL_OBJ(pos) && Object.hasOwn(pos, id) ? pos[id] : [0, 0]);
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const n = pic.at.get(id), ic = clIcon(F, model, n), group = n.type === F.group;
    const shape = group ? 'cloud-group' : n.type === F.user ? 'cloud-user' : 'cloud-card';
    // the drawn texts and the icon are the node's, so a name arriving with a fetched pack sizes and lays the view out again (§5.2)
    const d = { id, label: clName(n), type: n.type || F.group, kind: 'file', shape, aria: clNodeName(F, model, n), col: P(id)[0], row: P(id)[1],
      ...(group ? { title: `${clName(n)} [${clKindWord(F, n)}]`, gkind: clKindOf(F, n), dashed: CL_DASHED.includes(clKindOf(F, n)) } : {}),
      ...(shape === 'cloud-card' && ic ? { iconId: ic.id, name: ic.name, ...(ic.src ? { img: { src: ic.src, dark: ic.dark } } : {}) } : {}) };
    return { ...d, ...SHAPE[shape].size(d) }; });
  const boxes = pic.boxes.map(b => ({ ...b, gkind: clKindOf(F, pic.at.get(b.id)) }));
  const edges = lines.map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: CL_HAS(e.label) ? String(e.label) : undefined, end: { from: 'none', to: 'open' }, cut: 280,
    aria: clLineName(F, e, I), ...(CL_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }));
  const g = layoutTyped({ nodes, edges, ...(boxes.length ? { containers: boxes } : {}), direction: view.direction === 'down' ? 'down' : 'right',
    gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  // on a copy (§2.5): the vendor's legal line under the picture, inside its bounds, wherever its icon is drawn (S9; AWS's, 4a.8)
  const B = g.bounds, legal = !!F.legal && nodes.some(n => n.img), tw = legal ? textW(F.legal, 10) : 0;
  const slots = [...g.nodes, ...CL_ARR(g.families)].map(n => ({ after: n.id, parent: null, x: n.x + n.w / 2, y: n.y + n.h / 2 })); // the palette's add hears the selection (profile.js's)
  return { ...g, ...(legal ? { bounds: { ...B, w: Math.max(B.w, tw + 32), h: B.h + 18 }, legal: { x: B.x + 16, y: B.y + B.h + 4, text: F.legal } } : {}),
    slots, legend: clLegend(F, g.nodes, boxes, edges, legal), order: [...readingOrder(pic), ...lines.map(e => e.id)] };
};
const clDraw = g => ({ under: '', over: g.legal ? `<text class="cl-legal" x="${r2(g.legal.x)}" y="${r2(g.legal.y)}" fill="var(--um-muted)" style="font:400 10px var(--um-sans)">${esc(g.legal.text)}</text>` : '' });

/* ---- validators (§5.5). Each problem: { level, rule, path, message, ids } ---- */
const CL_RULES = {
  'group-kind': 'a group\'s kind is one of its family\'s',
  'group-nesting': 'a group sits in a group its kind may sit in; a service sits in a group or in none',
  'line-inside': 'a connection does not join a group and something inside it',
  'icon-set': 'a service, resource or product names its icon',
  'icon-missing': 'where the host gave the icon pack, a node\'s icon is in it',
};
function clProblems(F, model) {
  const out = [], I = clIndex(model), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: [...new Set(ids.filter(x => x != null))], message: `${rule}: ${msg}` });
  const q = id => JSON.stringify(I.at.has(id) ? clName(I.at.get(id)) : String(id)), given = clGiven(F, model), isG = id => (I.at.get(id) || {}).type === F.group;
  CL_ARR(model && model.nodes).forEach((n, i) => { if (!CL_OBJ(n) || I.at.get(n.id) !== n) return; const path = `nodes[${i}]`, up = n.parent != null && I.at.get(n.parent);
    if (n.type === F.group) { const k = clKindOf(F, n);
      if (!k) say('error', 'group-kind', `${path}.props.${F.key}`, [n.id], `${q(n.id)}'s ${F.key} ${JSON.stringify(clProps(n)[F.key] ?? null)} is none of ${Object.keys(F.kinds).join(', ')}`);
      else if (up && k !== 'generic') { const pk = isG(up.id) ? clKindOf(F, up) : null;
        if (!isG(up.id)) say('warning', 'group-nesting', `${path}.parent`, [n.id, up.id], `${q(n.id)}, a ${F.kinds[k]} group, sits in ${q(up.id)}, which is no group`);
        else if (pk && pk !== 'generic' && !F.sits[k].includes(pk)) say('warning', 'group-nesting', `${path}.parent`, [n.id, up.id], `${q(n.id)}, a ${F.kinds[k]} group, sits in ${q(up.id)}, a ${F.kinds[pk]} group: ${F.sits[k].length ? `it sits in ${F.sits[k].map(x => F.kinds[x]).join(' or ')}` : 'it sits in no group'}`); } }
    if (Object.hasOwn(F.items, n.type) || n.type === F.user) {
      if (up && !isG(up.id)) say('warning', 'group-nesting', `${path}.parent`, [n.id, up.id], `${q(n.id)} sits in ${q(up.id)}, which is no group`);
      if (n.type === F.user) return;
      const ic = clIcon(F, model, n);
      if (!ic) say('warning', 'icon-set', `${path}.props.icon`, [n.id], `${q(n.id)} names no icon: it is drawn with a glyph`);
      else if (given && !ic.src) say('warning', 'icon-missing', `${path}.props.icon`, [n.id], `the ${F.pack} pack given has no icon ${JSON.stringify(ic.id)} for ${q(n.id)}: it is drawn with a glyph`); } });
  CL_ARR(model && model.edges).forEach((e, i) => { if (!CL_OBJ(e) || e.type !== F.line[0] || !I.at.has(e.from) || !I.at.has(e.to) || !clInside(F, I, e.from, e.to)) return;
    say('error', 'line-inside', `edges[${i}]`, [e.id, e.from, e.to], `${e.id} joins ${q(e.from)} and ${q(e.to)}, ${e.from === e.to ? 'a group and itself' : 'a group and something inside it'}: it cannot be drawn`); });
  return out;
}

/* ---- describe(): the groups as an outline, each service with its full name, then the connections; Google's line last ---- */
function clDescribe(F, model, viewId) {
  const v = CL_ARR(model && model.views).find(x => CL_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const pic = clPic(F, model, v), I = clIndex(model), lines = clLinesOf(F, model, v, pic, I), box = new Map(pic.boxes.map(b => [b.id, b.aria]));
  const depth = id => { let d = 0; for (let o = pic.owner(id); o != null; o = pic.owner(o)) d++; return d; };
  const legal = !!F.legal && pic.ids.some(id => { const x = pic.at.get(id), ic = Object.hasOwn(F.items, x.type) && clIcon(F, model, x); return ic && ic.src; });
  return [`${v.title || v.id}: ${F.title} of ${clPlural(pic.ids.length, 'element')} and ${clPlural(lines.length, 'connection')}.`,
    ...readingOrder(pic).map(id => '  '.repeat(depth(id)) + (box.get(id) ?? clNodeName(F, model, pic.at.get(id))) + '.'),
    ...lines.map(e => clLineName(F, e, I) + '.'), ...(legal ? [F.legal] : [])].join('\n');
}

/* ---- editing (§5.6) ---- */
const clNewId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 1; while (used.has(base + k)) k++; return base + k; };
// connect: refused between a group and what it holds, or from a group to itself, said on the hint line; else the default
function clConnect(F, model, view, from, to) {
  const I = clIndex(model); if (!clInside(F, I, from, to)) return null;
  const g = from === to || I.holds(from, to) ? from : to;
  return { error: `A line cannot join ${clThe(clKindWord(F, I.at.get(g)))} and what it holds` };
}
// add: the palette's entry (a group's kind in its props) into the group selected, else at the top
function clAdd(F, model, view, entry, label, at) {
  const I = clIndex(model), sel = CL_ARR(at && at.sel).find(id => (I.at.get(id) || {}).type === F.group);
  const base = entry.type === F.group ? String(clProps(entry)[F.key] || 'group') : String(entry.type).split('.').pop().toLowerCase();
  return [{ op: 'add', element: { id: clNewId(model, base), type: entry.type, ...(CL_HAS(label) ? { label } : {}), ...(CL_OBJ(entry.props) ? { props: { ...entry.props } } : {}), ...(sel != null ? { parent: sel } : {}) }, view: view.id }];
}
// remove: a group deleted from the model takes what it holds with it (apply()); the hint line counts what goes. Delete hides it,
// its contents then drawn in the next shown group (ownersOn): the default
function clRemove(F, model, view, ids, fromModel) {
  const I = clIndex(model), gs = fromModel ? ids.filter(id => (I.at.get(id) || {}).type === F.group) : [];
  const held = gs.length ? [...I.at.keys()].filter(id => !ids.includes(id) && I.chain(id).some(p => gs.includes(p))).length : 0;
  if (!held) return null;
  const one = gs.length === 1 && I.at.get(gs[0]);
  return { commands: ids.map(id => ({ op: 'delete', id })), say: `Deleted ${one ? `${clKindWord(F, one)} ${clName(one)}` : clPlural(gs.length, 'group')} and the ${clPlural(held, 'element')} ${one ? 'it' : 'they'} held` };
}

/* ---- a family's definition ---- */
function clDef(pack, F) {
  F.pack = pack;
  const kindField = { key: F.key, label: F.key === 'zoneType' ? 'Zone type' : 'Group type', kind: 'enum', options: Object.keys(F.kinds) }, iconField = { key: 'icon', label: 'Icon', kind: 'text' };
  const mine = x => CL_OBJ(x) && (x.type === F.group || x.type === F.user || Object.hasOwn(F.items, x.type));
  return {
    title: F.title.replace(/^an? /, ''),
    // one palette entry per group kind, then the services (and the user)
    elements: [...Object.entries(F.kinds).map(([k, label]) => ({ type: F.group, label, props: { [F.key]: k } })), ...Object.entries(F.items).map(([type, label]) => ({ type, label })),
      ...(F.user ? [{ type: F.user, label: 'User' }] : [])],
    lines: [{ type: F.line[0], label: F.line[1] }],
    props: { [F.group]: [kindField], ...Object.fromEntries(Object.keys(F.items).map(t => [t, [iconField]])), ...(F.user ? { [F.user]: [] } : {}), [F.line[0]]: [] },
    layout: clGeo(F),
    draw: clDraw,
    boxes: (model, view) => clPic(F, model, view).boxes,
    // the Owner field: every group of the family, its kind in brackets
    owners: (model, x) => (mine(x) && x.from == null ? CL_ARR(model.nodes).filter(n => CL_OBJ(n) && n.type === F.group).map(n => ({ id: n.id, label: `${clName(n)} [${clKindWord(F, n)}]` })) : null),
    validate: model => clProblems(F, model),
    rules: CL_RULES,
    describe: (model, viewId) => clDescribe(F, model, viewId),
    // the PDF's tables (§5.7): a service's kind, a group's kind; a service's full name, icon id and group
    word: (model, id) => { const x = clIndex(model).at.get(id); return mine(x) ? clWord(F, x) : null; },
    rows: (model, view, id) => { const I = clIndex(model), x = I.at.get(id); if (!x || !Object.hasOwn(F.items, x.type)) return null;
      const ic = clIcon(F, model, x), up = x.parent != null && I.at.get(x.parent);
      return [...(ic ? [ic.name, `icon ${ic.id}`] : ['no icon']), ...(up ? [`in ${clName(up)} [${clWord(F, up)}]`] : [])]; },
    edits: { connect: (m, v, from, to) => clConnect(F, m, v, from, to), add: (m, v, entry, label, at) => clAdd(F, m, v, entry, label, at), remove: (m, v, ids, fromModel) => clRemove(F, m, v, ids, fromModel) },
  };
}
const CLOUD_DEFS = Object.fromEntries(Object.entries(CL_FAM).map(([k, F]) => [k, clDef(k, F)]));
const GCP_TYPE = registerDiagramType('gcp', CLOUD_DEFS.gcp), AZURE_TYPE = registerDiagramType('azure', CLOUD_DEFS.azure);
if (CLOUD_AWS) registerDiagramType('aws', CLOUD_DEFS.aws); // on since AWS accepted the maintainer's request (14 Nov 2026, 4a.8)

export { CLOUD_AWS, CLOUD_DEFS, GCP_LEGAL, AWS_LEGAL, GCP_TYPE, AZURE_TYPE, CL_RULES };
