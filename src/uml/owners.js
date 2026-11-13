import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import '../typed/draw.js'; // SHAPE.classifier, whose ports the closed package takes

/* ---------- owners on the picture (work package 2.2, notes/stage-2.md §4 to §7) ----------
   What the class, package and object views share: which shown package is a box and what it holds (§4.1), the names drawn
   with the owners the view does not show (§6), the package's shape, open and closed (§5), and the rules about owners and
   boxes (§7, §10.3). Only lib/umlimator-all.js holds this file. */

const OWN_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), OWN_ARR = x => (Array.isArray(x) ? x : []);
const OWN_BOXES = ['uml.Package', 'uml.Profile']; // the node types that may be a box (§4.1, 1); a profile is a package (notes/stage-6.md §4.1)
// the types of rows 1 to 3 whose owner is a package (rule owner-kinds); comments are not checked
const OWNED = ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.Package', 'uml.InstanceSpecification'];
const ownName = x => String(x.label ?? x.id);
const stereoOf = x => OWN_ARR(OWN_OBJ(x.props) ? x.props.stereotypes : null).filter(t => t != null && t !== '').map(String);

// every node of a model by id (the first of an id), and the chain of its owners, nearest first. An ownership cycle (the
// core's error) is broken: an element on one has no owner, and one under one stops at the first element of it it meets.
// members: the member types indexed too (a state's regions, notes/stage-4.md §6.1), each owned by its node
function ownIndex(model, members = []) {
  const at = new Map(), up = new Map(), mems = new Set(), put = (x, p) => { if (OWN_OBJ(x) && typeof x.id === 'string' && !at.has(x.id)) { at.set(x.id, x); up.set(x.id, p); return true; } };
  OWN_ARR(OWN_OBJ(model) ? model.nodes : null).forEach(n => put(n, n.parent));
  if (members.length) [...at.values()].forEach(n => OWN_ARR(n.members).forEach(m => { if (OWN_OBJ(m) && members.includes(m.type) && put(m, n.id)) mems.add(m.id); }));
  const chain = id => { const out = [], seen = new Set([id]);
    for (let p = up.get(id); p != null && at.has(p); p = up.get(p)) { if (seen.has(p)) return p === id ? [] : out.slice(0, out.indexOf(p) + 1); seen.add(p); out.push(p); }
    return out; };
  return { at, chain, up, mems };
}

/* A view's picture of its owners: { ids, owner(id), holds(o), boxes, name(id), full(id) }. ids: the nodes it shows; owner(id): an
   element's owner on the picture, its nearest shown owner that may be a box, or null (§4.1, 2); holds(o): the shown elements
   whose owner on the picture o is (null: the top), in the view's order; boxes: the open packages, in
   the registry's format (registry.js boxes), each holding exactly the shown elements whose owner on the picture it is, and
   the boxes nested in it by `parent`; name(id): the drawn name, with the owners between it and its owner on the picture,
   or with none from the view's subject when that is one of its owners, else from the top (§6); full(id): from the top.
   look (notes/stage-4.md §8.2, §6.1), each field optional: boxTypes, the node types that may be a box (OWN_BOXES); qualify
   false, names drawn without their owners; members, member types that are boxes too (a state's regions): one is shown when
   its node is and it holds something shown, and is a box when its node has two or more in the model (with one, what it
   holds sits in the node's box); shape(x) and word(x), a box's shape and the word its accessible name starts with ('package', 'Package') */
function ownersOn(model, view, look = {}) {
  const { boxTypes = OWN_BOXES, qualify = true, members = [], shape = () => 'package', word = x => (x.type === 'uml.Profile' ? 'Profile' : 'Package') } = look;
  const { at, chain, up, mems } = ownIndex(model, members), ids = OWN_ARR(OWN_OBJ(view) ? view.nodeIds : null).filter(id => at.has(id) && !mems.has(id)), seen = new Set(ids);
  const live = new Set(ids.flatMap(id => chain(id).filter(p => mems.has(p) && seen.has(up.get(p))))), place = m => OWN_ARR(at.get(up.get(m)).members).indexOf(at.get(m)); // members holding something shown
  const many = m => OWN_ARR(at.get(up.get(m)).members).filter(x => OWN_OBJ(x) && members.includes(x.type)).length > 1; // §6.1, 2: two or more in the model
  const kept = [...live].filter(many).sort((a, b) => place(a) - place(b)), all = [...ids, ...kept], shown = new Set(all);
  const ow = new Map(all.map(id => [id, chain(id).find(p => shown.has(p) && (mems.has(p) || boxTypes.includes(at.get(p).type))) ?? null])), owner = id => ow.get(id) ?? null;
  const upTo = (id, stop) => { const c = chain(id), k = c.indexOf(stop); return [...(k < 0 ? c : c.slice(0, k)).reverse(), id].map(x => ownName(at.get(x))).join('::'); };
  const full = id => upTo(id, null), subject = OWN_OBJ(view) ? view.subject : null;
  const name = id => { const o = owner(id); return !qualify ? ownName(at.get(id)) : upTo(id, o != null ? o : chain(id).includes(subject) ? subject : null); };
  const by = new Map(); all.forEach(id => { const o = owner(id); if (!by.has(o)) by.set(o, []); by.get(o).push(id); }); // grouped once: a view of 10,000 elements
  const holds = o => by.get(o) || [], open = new Set([...by.keys()].filter(x => x != null));
  const boxes = all.filter(id => open.has(id)).map(id => { const p = at.get(id), st = stereoOf(p), held = holds(id), o = owner(id), nm = name(id);
    return { id, label: ownName(p), title: [...(p.type === 'uml.Profile' ? ['«profile»'] : []), ...st.map(t => `«${t}»`), nm].join(' '), nodeIds: held.filter(x => !open.has(x)), ...(o != null ? { parent: o } : {}), shape: shape(p),
      aria: `${word(p)} ${nm}${st.length ? ` (${st.join(', ')})` : ''}, holding ${held.length} element${held.length === 1 ? '' : 's'}` }; });
  return { ids, owner, holds, boxes, name, full, open, chain, at };
}

// the reading order of a view's elements (§5): each box, then what it holds, depth first; the rest in the view's order
function readingOrder(pic) {
  const out = [], put = o => pic.holds(o).forEach(id => { out.push(id); if (pic.open.has(id)) put(id); });
  put(null);
  return out;
}

// a line between a package and something it holds, at any depth, or from a box to itself (§7): a, b node ids
const holdsLine = (pic, a, b) => (a === b && pic.open.has(a)) || [[a, b], [b, a]].some(([p, x]) => OWN_BOXES.includes((pic.at.get(p) || {}).type) && pic.chain(x).includes(p));

// the Owner field (registry.js owners): every package and profile of the model by its name from the top, for an element a
// package may own; a stereotype's and a metaclass's: every profile (notes/stage-6.md §4.2)
function ownerChoices(model, x) {
  const def = OWN_OBJ(x) && (x.type === 'uml.Stereotype' || x.type === 'uml.MetaclassReference');
  if (!OWN_OBJ(x) || !(OWNED.includes(x.type) || x.type === 'uml.Comment' || def) || x.from != null) return null;
  const { at, chain } = ownIndex(model), full = id => [...chain(id).reverse(), id].map(k => ownName(at.get(k))).join('::');
  return [...at.values()].filter(n => (def ? n.type === 'uml.Profile' : OWN_BOXES.includes(n.type))).map(n => ({ id: n.id, label: full(n.id) }));
}

/* ---- the rules about owners and boxes (§9.3, §10.3). Each problem: { level, rule, path, message, ids } ---- */
const OWNER_RULES = {
  'owner-kinds': 'a classifier, package or instance is owned by a package',
  'line-inside': 'a line between a package and something it holds, or from an open package to itself, is not drawn',
  'own-boxes': 'a view\'s hand-written containers are ignored where the type gives boxes',
};
// model: the owner-kinds rule; view (the type's view): line-inside and own-boxes for it, lines as `drawn(model, view)` gives
// them ({ e, from, to }, the ends as nodes, before a line between a package and what it holds is left out)
function ownerProblems(model, view, lines) {
  const out = [], say = (rule, path, ids, msg) => out.push({ level: 'warning', rule, path, ids, message: `${rule}: ${msg}` });
  const all = new Map(), put = (x, kind) => { if (OWN_OBJ(x) && typeof x.id === 'string' && !all.has(x.id)) { all.set(x.id, { x, kind }); OWN_ARR(x.members).forEach(m => put(m, 'member')); } };
  OWN_ARR(model.nodes).forEach(n => put(n, 'node')); const q = id => JSON.stringify(ownName((all.get(id) || { x: { id } }).x));
  OWN_ARR(model.nodes).forEach((n, i) => { if (!OWN_OBJ(n) || !OWNED.includes(n.type) || n.parent == null || !all.has(n.parent)) return;
    const p = all.get(n.parent).x; if (!OWN_BOXES.includes(p.type)) say('owner-kinds', `nodes[${i}].parent`, [n.id, p.id], `${q(n.id)} is owned by ${q(p.id)}, a ${String(p.type).split('.').pop()}, not a package`); });
  if (!view) return out;
  const vi = OWN_ARR(model.views).indexOf(view), pic = ownersOn(model, view);
  lines.forEach(({ e, from, to }) => { if (holdsLine(pic, from, to)) say('line-inside', `views[${vi}]`, from === to ? [e.id, from] : [e.id, from, to],
    `${e.id}, ${from === to ? `from ${q(from)} to itself, a box,` : `between ${q(from)} and ${q(to)}, which one holds,`} is not drawn in view ${JSON.stringify(view.id)}`); });
  if (OWN_ARR(view.containers).length) say('own-boxes', `views[${vi}].containers`, [view.id], `view ${JSON.stringify(view.id)} draws its packages as boxes; its own containers are ignored`);
  return out;
}

/* ---- the package's shape (§5): SHAPE.package, closed as a node, open as a box's frame ---- */
const PK = { pad: 12, gap: 10, name: 13, st: 11, sth: 14, nl: 18, tab: 8, minW: 96, maxW: 320 }, pkTabW = n => Math.min(48, Math.round(n.w * .4));
const pkTexts = n => [...OWN_ARR(n.stereotypes).map(t => [`«${t}»`, PK.st]), [n.label ?? '', PK.name]];
SHAPE.package = {
  // closed: a folder, its body the node's box and its empty tab above it (UML 2.5.1, 12.2.4), the stereotypes and the name
  // centred in the body; as wide as its widest text, within 96 and 320 px (a longer one is cut)
  size: n => ({ w: Math.ceil(Math.min(PK.maxW, Math.max(PK.minW, ...pkTexts(n).map(([t, px]) => textW(t, px) + 2 * PK.pad)))), h: 2 * PK.gap + OWN_ARR(n.stereotypes).length * PK.sth + PK.nl }),
  out: SHAPE.classifier.out, face: n => [n.y, n.y + n.h], inset: () => 0, ports: SHAPE.classifier.ports,
  draw(n, c, f) {
    const { x, y, w, h } = n, tw = pkTabW(n), tabX = n.tabX ?? x, cx = r2(x + w / 2), st = OWN_ARR(n.stereotypes); let ty = y + PK.gap;
    const tx = st.map(t => { const s = `<text x="${cx}" y="${r2(ty + 11)}" text-anchor="middle" class="c-st" fill="var(--um-muted)" style="font:400 ${PK.st}px var(--um-sans)">${esc(fit(`«${t}»`, PK.st, w - 2 * PK.pad))}</text>`; ty += PK.sth; return s; });
    tx.push(`<text x="${cx}" y="${r2(ty + 14)}" text-anchor="middle" class="c-name" fill="var(--um-text)" style="font:600 ${PK.name}px var(--um-sans)" data-o="${esc(n.id)}">${esc(fit(n.label ?? '', PK.name, w - 2 * PK.pad))}</text>`);
    return `<g class="node package" data-id="${esc(n.id)}" data-shape="package" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Package ' + (n.label ?? ''))}">`
      + `<path d="M${tabX} ${y}V${y - PK.tab}H${r2(tabX + tw)}V${y}" class="n-det" fill="${f}" stroke="${c}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-mask"/>`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="n-body" fill="${f}" stroke="${c}"/><g class="c-head" data-band="${r2(y)} ${r2(y + h)}">${tx.join('')}</g></g>`;
  },
  // open: the box's border, and a tab in its header room at the top left, closed by a line under it and one on its right,
  // holding the stereotypes and the name (the box's title, cut to its width). The border has class family-box, which the
  // canvas outlines on selection and under a drag; the title keeps class family-title, which the audit and the canvas read
  frame(f) {
    const hd = Math.min(f.w - 16, textW(f.title, 11) + 16), tr = r2(f.x + 8 + hd);
    return `<rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" stroke="var(--um-muted)"/><path d="M${f.x} ${r2(f.y + 24)}H${tr}V${f.y}" class="pk-tab" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/>`
      + `<text class="family-title" x="${r2(f.x + 12)}" y="${r2(f.y + 16)}" fill="var(--um-text)" style="font:600 11px var(--um-sans)" data-t="ft" data-o="${esc(f.id)}">${esc(fit(f.title ?? f.label ?? f.id, 11, hd - 4))}</text>`;
  },
};

/* A closed package's tab sits above its box, where the router's ports do not know it is: laid out, the tab moves to where no
   line ends on the top keep 6 px off its edges (an arrowhead's half width and a pixel), over the fewest ends and nearest the
   left corner (n.tabX, when it moves), and a line ending under it ends on the tab's top. g: a laid-out view; a memo hands back
   the same one, changed once */
const TABBED = new WeakSet();
function placeTabs(g) {
  if (TABBED.has(g)) return g; TABBED.add(g);
  g.nodes.filter(n => n.shape === 'package').forEach(n => {
    const ends = g.edges.flatMap(e => [[e, 0, e.from], [e, e.pts.length - 1, e.to]]).filter(([e, k, id]) => id === n.id && e.pts[k][1] === n.y), tw = pkTabW(n);
    if (!ends.length) return;
    const xs = ends.map(([e, k]) => e.pts[k][0]), over = t => xs.filter(p => p >= t && p <= t + tw).length, near = t => xs.filter(p => p > t - 6 && p < t + tw + 6).length - over(t);
    const [tx] = [n.x, ...xs.flatMap(p => [p + 7, p - 7 - tw])].filter(t => t >= n.x && t <= n.x + n.w - tw)
      .sort((a, b) => near(a) - near(b) || over(a) - over(b) || a - b);
    if (tx !== n.x) n.tabX = tx;
    ends.forEach(([e, k]) => { const p = e.pts[k][0]; if (p >= tx && p <= tx + tw) e.pts[k] = [p, n.y - PK.tab]; });
  });
  return g;
}

export { OWN_BOXES, OWNER_RULES, ownersOn, readingOrder, holdsLine, ownerChoices, ownerProblems, placeTabs };
