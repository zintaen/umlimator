import { registerDiagramType } from '../core/registry.js';
import { esc, fit, textW } from '../core/text.js';
import { SHAPE, boxOut, portsOn, r2 } from '../draw/shapes.js';
import { ENDS } from '../typed/draw.js';
import { layoutTyped } from '../typed/layout.js';
import { multBounds } from '../uml/class.js'; // SHAPE.note too, a comment's look

/* ---------- the entity-relationship diagram, er (work package M2.2, notes/milestone-2.md §4, §7.1) ----------
   Entities (tables) with their columns as rows, the key columns first under a divider; relationships from the referenced
   entity to the referring one (model.md rule 7), each end chosen from its multiplicity and drawn in the view's notation:
   crow's foot (the default) or IDEF1X, a repaint on one geometry (§4.3). Identifying solid, non-identifying dashed, in both.
   A column's row reads and prints `name type [PK] [FK table.column] [UK] [NULL]` (S9). Laid out by layoutTyped with a 48 px
   gap, labelGaps and labels cut at 280 px; repair and reroute off (S19). Ships in lib/umlimator-all.js only. */

const ER_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), ER_ARR = x => (Array.isArray(x) ? x : []);
const ER_HAS = x => x != null && x !== '';
const erName = x => String(x.label ?? x.id);
const erProps = x => (ER_OBJ(x.props) ? x.props : {});
const erCols = n => ER_ARR(n.members).filter(c => ER_OBJ(c) && c.type === 'er.Column');
const erPlural = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const erAnd = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1));

// the model read once: nodes by id, every entity's columns by id ({ c, e }), the lines. Each column remembers the model it
// was last read in, which print (the panel's rows, given a column alone) needs to name what it references
const ER_SEEN = new WeakMap();
function erIndex(model) {
  const at = new Map(), col = new Map();
  ER_ARR(model && model.nodes).forEach(n => { if (!ER_OBJ(n) || typeof n.id !== 'string' || at.has(n.id)) return; at.set(n.id, n);
    if (n.type === 'er.Entity') erCols(n).forEach(c => { ER_SEEN.set(c, model); if (typeof c.id === 'string' && !col.has(c.id)) col.set(c.id, { c, e: n }); }); });
  return { at, col, R: ER_ARR(model && model.edges).filter(e => ER_OBJ(e) && typeof e.id === 'string') };
}

/* ---- a column's row (S9): name type [PK] [FK table.column] [UK] [NULL], the flags in any order and either case. FK names
   the referenced column by its entity's and its own labels (or by its id), resolved to its id when the row is read ---- */
const ER_FLAG = { pk: 'primaryKey', fk: 'foreignKey', uk: 'unique', null: 'nullable' };
const ER_SYNTAX = ['dataType', 'primaryKey', 'foreignKey', 'unique', 'nullable', 'references'];
const erFlag = t => Object.hasOwn(ER_FLAG, String(t).toLowerCase());
function erTokens(s) { // split at spaces outside brackets and "quotes": "amount numeric(10, 2) NULL"; null when a bracket is left open or closes none
  const out = []; let depth = 0, cur = '', q = 0;
  for (const ch of s) { if (q) { cur += ch; q = q > 1 ? 1 : ch === '\\' ? 2 : ch !== '"'; continue; }
    if (ch === '"') q = 1; else if ('([{<'.includes(ch)) depth++; else if (')]}>'.includes(ch) && --depth < 0) return null;
    if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch; }
  if (cur) out.push(cur);
  return depth || q ? null : out;
}
// a column named by table.column, its entity's label and its own, when exactly one column has them; else by its id. Labels
// first: an id (`<entity id>.<label>`, erNewId) can read as another column's labels once a table is renamed
function erRef(t, I, was) {
  if (t === was && I.col.has(t)) return t; // the id the row printed for its current target: kept, whatever labels it reads as
  const k = t.indexOf('.'), hit = k > 0 ? [...I.col].filter(([, { c, e }]) => erName(e) === t.slice(0, k) && erName(c) === t.slice(k + 1)) : [];
  return hit.length === 1 ? hit[0][0] : I.col.has(t) ? t : null;
}
// a row's name: its first word, or "in quotes" when it has a space, a quote or a bracket, \" and \\ inside (printColumn writes it so)
function parseColumn(text, I, was) {
  const s = String(text ?? '').trim(), q = /^"((?:[^"\\]|\\.)*)"(?=\s|$)/.exec(s), t = erTokens(q ? s.slice(q[0].length) : s), fail = why => ({ error: `"${s}" is not a column: ${why}` });
  if (!t) return fail('its brackets do not pair');
  if (q ? !q[1].trim() : !t.length) return fail('it is empty');
  const label = q ? q[1].replace(/\\(.)/g, '$1') : t.shift(), props = {}, type = [];
  while (t.length && !erFlag(t[0])) type.push(t.shift()); // a type of several words: "double precision", "timestamp with time zone"
  if (type.length) props.dataType = type.join(' ');
  while (t.length) { const k = t.shift(), f = erFlag(k) && ER_FLAG[k.toLowerCase()];
    if (!f) return fail(`"${k}" is left over: write name type [PK] [FK table.column] [UK] [NULL]`);
    if (props[f]) return fail(`${k.toUpperCase()} is written twice`);
    props[f] = true;
    if (f === 'foreignKey' && t.length && !erFlag(t[0])) { const r = t.shift(), u = /^"((?:[^"\\]|\\.)*)"$/.exec(r), id = erRef(u ? u[1].replace(/\\(.)/g, '$1') : r, I, was); if (id == null) return fail(`FK ${r} names no column (table.column)`); props.references = id; } }
  return { label, props };
}
function printColumn(c, I = erIndex(ER_SEEN.get(c))) {
  const p = erProps(c), r = ER_HAS(p.references) && I.col.get(p.references), pair = r && `${erName(r.e)}.${erName(r.c)}`;
  const ref = r && !/[\s.]/.test(erName(r.e) + erName(r.c)) && erRef(pair, I) === p.references ? pair : p.references, q = x => (/^$|[\s"()[\]{}<>]/.test(x) ? `"${x.replace(/["\\]/g, '\\$&')}"` : x);
  return [q(erName(c)), ER_HAS(p.dataType) && String(p.dataType), p.primaryKey === true && 'PK', (p.foreignKey === true || ER_HAS(ref)) && 'FK', ER_HAS(ref) && q(String(ref)), p.unique === true && 'UK', p.nullable === true && 'NULL'].filter(x => typeof x === 'string' && x !== '').join(' ');
}

/* ---- the entity (§7.1): its name in a 24 px header, then its key columns, a divider, the rest; each row its marks (PK, FK,
   UK, ? for a nullable column) in a left column, its name, its type in --um-muted; 120 to 320 px wide, every text cut with
   fit. present.<id>.rows and collapsed (the sections 'keys', 'columns') as the classifier's. Drawing input: label;
   sections [{ name, rows: [{ marks, name, type }] }]; dep: IDEF1X's dependent entity, drawn with rounded corners ---- */
const ER = { pad: 8, head: 24, name: 13, px: 11, fpx: 9, rl: 15, gap: 4, empty: 10, sep: 8, minW: 120, maxW: 320, round: 8 };
const ER_MARK = [['primaryKey', 'PK'], ['foreignKey', 'FK'], ['unique', 'UK'], ['nullable', '?']];
function erParts(n) {
  const cap = Number.isFinite(n.rows) ? Math.max(0, Math.floor(n.rows)) : Infinity, hidden = new Set(ER_ARR(n.collapsed));
  const secs = ER_ARR(n.sections).filter(S => !hidden.has(S.name)).map(S => ({ name: S.name, rows: S.rows.slice(0, cap), more: Math.max(0, S.rows.length - cap) }));
  const rows = secs.flatMap(S => S.rows), W = (k, px) => Math.max(0, ...rows.map(r => textW(r[k], px)));
  const fw = W('marks', ER.fpx), nw = W('name', ER.px), tw = W('type', ER.px), lead = fw ? fw + ER.sep : 0;
  const w = Math.ceil(Math.min(ER.maxW, Math.max(ER.minW, 2 * ER.pad + lead + nw + (tw ? ER.sep + tw : 0), textW(n.label ?? '', ER.name) + 2 * ER.pad,
    ...secs.filter(S => S.more).map(S => 2 * ER.pad + lead + textW(`+${S.more} more`, ER.px)))));
  const tall = S => { const k = S.rows.length + (S.more ? 1 : 0); return k ? 2 * ER.gap + k * ER.rl : ER.empty; };
  return { secs, fw, nw, tw, lead, w, tall, h: ER.head + secs.reduce((a, S) => a + tall(S), 0) };
}
function erSvg(n, c, f) {
  const P = erParts(n), { x, y, w, h } = n, avail = w - 2 * ER.pad - P.lead, nx = x + ER.pad + P.lead, tx = nx + (P.tw ? Math.min(P.nw + ER.sep, Math.max(avail * 0.6, avail - P.tw)) : avail);
  const rx = n.dep ? ` rx="${ER.round}"` : '', box = `x="${x}" y="${y}" width="${w}" height="${h}"${rx}`;
  const txt = (X, Y, t, px, wt, fill, cls, max) => `<text x="${r2(X)}" y="${r2(Y)}" class="${cls}" fill="${fill}" style="font:${wt} ${px}px var(--um-sans)">${esc(fit(t, px, max))}</text>`;
  const out = [`<rect ${box} class="n-mask"/><rect ${box} class="n-body" fill="${f}" stroke="${c}"/>`,
    `<g class="c-head" data-band="${r2(y)} ${r2(y + ER.head)}"><text x="${r2(x + w / 2)}" y="${r2(y + 16.5)}" text-anchor="middle" class="c-name" fill="var(--um-text)" style="font:600 ${ER.name}px var(--um-sans)" data-o="${esc(n.id)}">${esc(fit(n.label ?? '', ER.name, w - 2 * ER.pad))}</text></g>`];
  let top = y + ER.head;
  P.secs.forEach(S => { const at = j => top + ER.gap - 1 + j * ER.rl + 11.5;
    const rows = S.rows.map((r, j) => (r.marks ? txt(x + ER.pad, at(j), r.marks, ER.fpx, 600, 'var(--um-muted)', 'er-mark', P.fw) : '')
      + txt(nx, at(j), r.name, ER.px, 400, 'var(--um-text)', 'c-row', P.tw ? tx - nx - ER.sep : avail) + (r.type ? txt(tx, at(j), r.type, ER.px, 400, 'var(--um-muted)', 'er-type', x + w - ER.pad - tx) : ''));
    if (S.more) rows.push(txt(nx, at(S.rows.length), `+${S.more} more`, ER.px, 400, 'var(--um-muted)', 'c-more', avail));
    out.push(`<g class="c-comp" data-comp="${S.name}" data-band="${r2(top)} ${r2(top + P.tall(S))}"><path d="M${x} ${r2(top)}H${x + w}" class="n-det" stroke="${c}"/>${rows.join('')}</g>`);
    top += P.tall(S); });
  return `<g class="node entity" data-id="${esc(n.id)}" data-shape="entity" tabindex="-1" role="img" aria-label="${esc(n.aria || 'Table ' + (n.label ?? ''))}">${out.join('')}</g>`;
}
const ENTITY = { size: n => { const P = erParts(n); return { w: P.w, h: P.h }; }, out: boxOut(0), face: n => [n.y, n.y + n.h], inset: () => 0, draw: erSvg };
ENTITY.ports = (n, side, k = 1) => portsOn(ENTITY, n, side, k);
SHAPE.entity = ENTITY;

/* ---- the ends (§4.1, §4.2): six rows of src/typed/draw.js's table, pointing right with the tip on the entity's outline.
   Crow's foot's are 18 px long, a ring hollow (the stage's background); IDEF1X's dot is a filled 6 px circle, its letter an
   end label; its diamond, at an optional parent, hollow ---- */
const ER_RING = 'M1 7A4 4 0 1 0 9 7A4 4 0 1 0 1 7Z';
Object.assign(ENDS, { 'cf-one': [18, 7, 'M0 7H18M8 0V14M12 0V14', 'none'], 'cf-zero-one': [18, 7, `M0 7H1M9 7H18M13 0V14${ER_RING}`, 'hollow'],
  'cf-one-many': [18, 7, 'M0 7H18M4 0V14M8 7L18 0M8 7L18 14', 'none'], 'cf-zero-many': [18, 7, `M0 7H1M9 7H18M10 7L18 0M10 7L18 14${ER_RING}`, 'hollow'],
  'idef-dot': [6, 3, 'M0 3A3 3 0 1 0 6 3A3 3 0 1 0 0 3Z', 'line'], 'idef-diamond': [12, 5, 'M0 5L6 0L12 5L6 10Z', 'hollow'] });

// a multiplicity's bounds when a relationship's end can have them (an upper bound of 1 or more, the lower not above it)
const erBounds = t => { const b = ER_HAS(t) ? multBounds(t) : null; return b && b.upper >= 1 && b.lower <= b.upper ? b : null; };
const ER_FORMS = { '1 1': ['cf-one', 'exactly one', '1'], '0 1': ['cf-zero-one', 'zero or one', 'Z'], '1 Infinity': ['cf-one-many', 'one or more', 'P'], '0 Infinity': ['cf-zero-many', 'zero or more', undefined] };
const erForm = b => ER_FORMS[`${b.lower} ${b.upper}`];
const erMult = (e, w) => { const E = erProps(e).ends; return ER_OBJ(E) && ER_OBJ(E[w]) ? E[w].multiplicity : undefined; };
const erSay = t => { const b = erBounds(t); return b && erForm(b) ? erForm(b)[1] : ER_HAS(t) ? String(t) : 'no multiplicity'; };
// an end as drawn: [its name in ENDS, its end label]. Crow's foot: the nearest of the four by its bounds, the text written
// when it is none of them; IDEF1X: at the parent (from) nothing for 1, a diamond for 0..1, else a dot; at the child a dot,
// with 1, Z, P, nothing or the text. Unreadable: no end, the text as its label
function erEnd(e, w, idef) {
  const t = erMult(e, w), b = erBounds(t), s = ER_HAS(t) ? String(t) : undefined;
  if (!b) return ['none', s];
  const F = erForm(b);
  if (!idef) return [ER_FORMS[`${b.lower ? 1 : 0} ${b.upper > 1 ? 'Infinity' : 1}`][0], F ? undefined : s];
  if (w === 'from' && b.upper === 1) return [b.lower ? 'none' : 'idef-diamond'];
  return ['idef-dot', F ? F[2] : s];
}
const erIdentifying = e => erProps(e).identifying === true;
function erLook(e, idef) {
  if (e.type !== 'er.Relationship') return { from: 'none', to: 'none', dashed: true }; // a comment link
  const [f, fl] = erEnd(e, 'from', idef), [t, tl] = erEnd(e, 'to', idef);
  return { from: f, to: t, dashed: !erIdentifying(e), labels: { from: { mult: fl }, to: { mult: tl } } };
}

/* ---- names (A1) and the view's words ---- */
function erNodeName(n) {
  if (n.type === 'uml.Comment') return 'Comment: ' + erName(n);
  const cs = erCols(n), keys = cs.filter(c => erProps(c).primaryKey === true).map(erName);
  return `Table ${erName(n)}, ${keys.length ? 'key ' + erAnd(keys) : 'no key'}, ${erPlural(cs.length, 'column')}`;
}
// an entity's name and its rows, whole (a row cut in the drawing is read here): its accessible name and describe()'s line
const erFull = (n, I) => { const cs = erCols(n); return erNodeName(n) + (cs.length ? ': ' + cs.map(c => printColumn(c, I)).join('; ') : ''); };
// "Identifying relationship contains from order (exactly one) to order_line (one or more)"
function erLineName(e, I) {
  const nm = id => (I.at.has(id) ? erName(I.at.get(id)) : String(id));
  if (e.type !== 'er.Relationship') return `Comment link from ${nm(e.from)} to ${nm(e.to)}`;
  return `${erIdentifying(e) ? 'Identifying' : 'Non-identifying'} relationship ${ER_HAS(e.label) ? e.label + ' ' : ''}from ${nm(e.from)} (${erSay(erMult(e, 'from'))}) to ${nm(e.to)} (${erSay(erMult(e, 'to'))})`;
}
const erShown = (model, view) => { const I = erIndex(model); return { I, ids: [...new Set(ER_ARR(view.nodeIds))].filter(id => I.at.has(id)) }; };
// the lines drawn: those the view lists, or with no list the model's relationships and comment links, between two it shows
function erLines(view, I, ids) {
  const shown = new Set(ids), E = new Map(I.R.map(e => [e.id, e]));
  const list = Array.isArray(view.edges) ? view.edges.map(x => (typeof x === 'string' ? E.get(x) : x)) : I.R.filter(e => e.type === 'er.Relationship' || e.type === 'uml.CommentLink');
  return list.filter(e => ER_OBJ(e) && typeof e.id === 'string' && shown.has(e.from) && shown.has(e.to));
}

/* ---- the legend: the two line looks drawn, then each end drawn, a small copy of its ENDS row ---- */
const ER_SAYS = { 'cf-one': ['Exactly one', 'one and only one at that end'], 'cf-zero-one': ['Zero or one', 'at most one at that end'],
  'cf-one-many': ['One or more', 'at least one at that end'], 'cf-zero-many': ['Zero or more', 'any number at that end'],
  'idef-dot': ['Child end', 'zero or more; P one or more, Z zero or one, a number exactly that many'], 'idef-diamond': ['Optional parent', 'zero or one parent'] };
const erGlyph = (end, dashed, name, says) => { const E = end !== 'none' && ENDS[end], k = 0.7, L = E ? E[0] * k : 0;
  const mark = E ? `<g transform="translate(${r2(26 - L)} ${r2(8 - E[1] * k)}) scale(${k})"><path d="${E[2]}" fill="${E[3] === 'line' ? 'var(--um-muted)' : E[3] === 'hollow' ? 'var(--um-panel)' : 'none'}"/></g>` : '';
  return `<span class="lgi" title="${esc(name + ' — ' + says)}"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><g stroke="var(--um-muted)" stroke-width="1.4" stroke-linejoin="round"><path d="M2 8H${r2(26 - L)}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${mark}</g></svg><b>${esc(name)}</b><span>${esc(says)}</span></span>`; };
function erLegend(edges, dep) {
  const rel = edges.filter(e => e.type === 'er.Relationship'), ends = new Set(rel.flatMap(e => [e.end.from, e.end.to]));
  return [...(rel.some(e => !e.end.dashed) ? [erGlyph('none', false, 'Identifying', 'the child\'s key holds the parent\'s key')] : []),
    ...(rel.some(e => e.end.dashed) ? [erGlyph('none', true, 'Non-identifying', 'the child refers to the parent outside its key')] : []),
    ...Object.keys(ER_SAYS).filter(k => ends.has(k)).map(k => erGlyph(k, false, ...ER_SAYS[k])),
    ...(dep ? [`<span class="lgi" title="Dependent entity — its key holds its parent's"><svg class="lgs" viewBox="0 0 28 16" aria-hidden="true"><rect x="3" y="2" width="22" height="12" rx="4" fill="none" stroke="var(--um-muted)" stroke-width="1.4"/></svg><b>Dependent entity</b><span>rounded corners: its key holds its parent's</span></span>`] : []),
    ...(edges.some(e => e.type === 'uml.CommentLink') ? [erGlyph('none', true, 'Comment link', 'what a comment is about')] : [])];
}

/* ---- the view laid out: one geometry for both notations (§4.3): the notation picks the ends and IDEF1X's rounded corners,
   neither in the geometry key, so a switch repaints ---- */
const erPick = (o, k) => (ER_OBJ(o) && Object.hasOwn(o, k) ? o[k] : undefined);
function erSections(n) {
  const row = c => { const p = erProps(c); return { name: erName(c), type: ER_HAS(p.dataType) ? String(p.dataType) : '', marks: ER_MARK.filter(([k]) => p[k] === true).map(m => m[1]).join(' ') }; };
  const cs = erCols(n), keys = cs.filter(c => erProps(c).primaryKey === true), rest = cs.filter(c => erProps(c).primaryKey !== true);
  return [...(keys.length ? [{ name: 'keys', rows: keys.map(row) }] : []), ...(rest.length || !keys.length ? [{ name: 'columns', rows: rest.map(row) }] : [])];
}
// IDEF1X's dependent entity: the child of an identifying relationship (its key holds the parent's)
const erDependent = (I, id) => I.R.some(e => e.type === 'er.Relationship' && e.to === id && erIdentifying(e));
function erGeo({ model, view, pos, memo }) {
  const { I, ids } = erShown(model, view), idef = view.notation === 'idef1x', lines = erLines(view, I, ids), P = id => erPick(pos, id) || [0, 0];
  const nodes = ids.map(id => { const n = I.at.get(id), pr = ER_OBJ(erPick(view.present, id)) ? view.present[id] : {};
    const d = n.type === 'uml.Comment' ? { shape: 'note' } : { shape: 'entity', sections: erSections(n), collapsed: ER_ARR(pr.collapsed), ...(Number.isFinite(pr.rows) ? { rows: pr.rows } : {}), ...(idef && erDependent(I, id) ? { dep: true } : {}) };
    const x = { id, label: erName(n), type: n.type || 'er.Entity', kind: 'file', ...d, aria: erFull(n, I), col: P(id)[0], row: P(id)[1] };
    return { ...x, ...SHAPE[x.shape].size(x) }; });
  const edges = lines.map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: ER_HAS(e.label) ? String(e.label) : undefined, end: erLook(e, idef), aria: erLineName(e, I), cut: 280,
    ...(ER_OBJ(e.style) || typeof e.style === 'string' ? { style: e.style } : {}) }));
  const g = layoutTyped({ nodes, edges, direction: view.direction === 'down' ? 'down' : 'right', gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false }, memo);
  return { ...g, legend: erLegend(g.edges, nodes.some(n => n.dep)), order: [...ids, ...lines.map(e => e.id)] }; // a new object: what layoutTyped returned is not edited
}

/* ---- validators (§7.1). Each problem: { level, rule, path, message, ids } ---- */
const ER_RULES = {
  'pk-exists': 'an entity has a primary key column',
  'column-names': 'column names are unique within an entity',
  'fk-target': 'a column\'s references names a column of an entity (an error), one that is a key or unique (a warning)',
  'fk-flag': 'a column with references is a foreign key, and a foreign key has references',
  'relationship-fk': 'a relationship from A to B has a column of B that references a column of A',
  'identifying-key': 'an identifying relationship\'s foreign key columns are part of the child\'s primary key',
  'identifying-parent': 'an identifying relationship\'s parent end is 1',
  'relationship-ends': 'each end\'s multiplicity is readable (an error), and one of 1, 0..1, 1..* and 0..* (a warning)',
  'relationship-tables': 'a relationship joins two tables',
  'notation': 'an er view\'s notation is crowsfoot or idef1x',
};
// the columns of entity b that reference a column of entity a
const erFks = (I, a, b) => erCols(I.at.get(b) || {}).filter(c => { const r = I.col.get(erProps(c).references); return r && r.e.id === a; });
function erProblems(model) {
  const out = [], I = erIndex(model), say = (level, rule, path, ids, msg) => out.push({ level, rule, path, ids: ids.filter(x => x != null), message: `${rule}: ${msg}` });
  const q = id => JSON.stringify(I.at.has(id) ? erName(I.at.get(id)) : String(id)), qc = r => JSON.stringify(`${erName(r.e)}.${erName(r.c)}`);
  ER_ARR(model && model.nodes).forEach((n, i) => { if (!ER_OBJ(n) || n.type !== 'er.Entity' || I.at.get(n.id) !== n) return;
    const seen = new Map();
    if (!erCols(n).some(c => erProps(c).primaryKey === true)) say('warning', 'pk-exists', `nodes[${i}]`, [n.id], `${q(n.id)} has no primary key column`);
    ER_ARR(n.members).forEach((c, j) => { if (!ER_OBJ(c) || c.type !== 'er.Column') return;
      const path = `nodes[${i}].members[${j}]`, p = erProps(c), me = qc({ e: n, c }), was = seen.get(erName(c));
      if (was) say('error', 'column-names', path, [n.id, was, c.id], `${q(n.id)} has two columns named ${JSON.stringify(erName(c))} (${was}, ${c.id})`); else seen.set(erName(c), c.id);
      if (ER_HAS(p.references)) { const r = I.col.get(p.references);
        if (!r) say('error', 'fk-target', `${path}.props.references`, [c.id], `${me} references ${JSON.stringify(String(p.references))}, which is no column of an entity`);
        else if (erProps(r.c).primaryKey !== true && erProps(r.c).unique !== true) say('warning', 'fk-target', `${path}.props.references`, [c.id, r.c.id], `${me} references ${qc(r)}, which is neither a key nor unique`); }
      if (ER_HAS(p.references) && p.foreignKey !== true) say('warning', 'fk-flag', path, [c.id], `${me} references a column but is not marked FK`);
      if (p.foreignKey === true && !ER_HAS(p.references)) say('warning', 'fk-flag', path, [c.id], `${me} is a foreign key that references no column`); }); });
  ER_ARR(model && model.edges).forEach((e, i) => { if (!ER_OBJ(e) || e.type !== 'er.Relationship') return;
    const path = `edges[${i}]`, A = e.from, B = e.to, ent = id => (I.at.get(id) || {}).type === 'er.Entity';
    ['from', 'to'].forEach(w => { const t = erMult(e, w), b = erBounds(t);
      if (!b) say('error', 'relationship-ends', `${path}.props.ends.${w}.multiplicity`, [e.id], `the ${w} end of ${e.id} has ${ER_HAS(t) ? `multiplicity ${JSON.stringify(String(t))}, which is not readable` : 'no multiplicity'}`);
      else if (!erForm(b)) say('warning', 'relationship-ends', `${path}.props.ends.${w}.multiplicity`, [e.id], `the ${w} end of ${e.id} has multiplicity ${JSON.stringify(String(t))}, none of 1, 0..1, 1..* and 0..*: drawn as the nearest, with its text`); });
    if (!ent(A) || !ent(B)) { const not = [A, B].filter(id => I.at.has(id) && !ent(id)); // a missing end is the core's to say
      if (not.length) say('error', 'relationship-tables', path, [e.id, ...not], `${e.id} joins ${erAnd(not.map(q))}, which ${not.length === 1 ? 'is not a table' : 'are not tables'}`);
      return; }
    const fks = erFks(I, A, B);
    if (!fks.length) say('warning', 'relationship-fk', path, [e.id, A, B], `${e.id} runs from ${q(A)} to ${q(B)}, and no column of ${q(B)} references a column of ${q(A)}`);
    if (!erIdentifying(e)) return;
    const b = erBounds(erMult(e, 'from'));
    if (b && (b.lower !== 1 || b.upper !== 1)) say('error', 'identifying-parent', `${path}.props.ends.from.multiplicity`, [e.id, A], `${e.id} is identifying, so its parent end at ${q(A)} is 1, not ${JSON.stringify(String(erMult(e, 'from')))}`);
    // a column out of the key may be another relationship's of the pair, a non-identifying one: then one in the key will do.
    // ponytail: the model does not say which columns are which relationship's; a relationship naming its columns would
    const out2 = fks.filter(c => erProps(c).primaryKey !== true), shared = I.R.some(x => x !== e && x.type === 'er.Relationship' && x.from === A && x.to === B && !erIdentifying(x));
    if (out2.length && (!shared || out2.length === fks.length)) say('error', 'identifying-key', path, [e.id, B, ...out2.map(c => c.id)], `${e.id} is identifying, but ${erAnd(out2.map(erName))} of ${q(B)} ${out2.length === 1 ? 'is' : 'are'} not in its primary key`); });
  ER_ARR(model && model.views).forEach((v, i) => { if (ER_OBJ(v) && v.diagram === 'er' && v.notation != null && v.notation !== 'crowsfoot' && v.notation !== 'idef1x')
    say('warning', 'notation', `views[${i}].notation`, [v.id], `${JSON.stringify(String(v.id))} has notation ${JSON.stringify(String(v.notation))}, drawn as crowsfoot: write crowsfoot or idef1x`); });
  return out;
}

/* ---- describe(): the view in sentences, each element by its accessible name and an entity's rows, in reading order, then
   each line ---- */
function erDescribe(model, viewId) {
  const v = ER_ARR(model && model.views).find(x => ER_OBJ(x) && x.id === viewId); if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  const { I, ids } = erShown(model, v), lines = erLines(v, I, ids), say = n => erFull(n, I);
  return [`${v.title || v.id}: an entity-relationship diagram of ${erPlural(ids.length, 'element')} and ${erPlural(lines.length, 'line')}.`,
    ...ids.map(id => say(I.at.get(id)) + '.'), ...lines.map(e => erLineName(e, I) + '.')].join('\n');
}

/* ---- editing (§7.1) ---- */
const erNewId = (model, base) => { const used = new Set(); JSON.stringify(model, (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
  let k = 2, id = base; while (used.has(id)) id = `${base}-${k++}`; return id; };
// a row of the panel's Members, read as S9's: a new column, or a column's name and syntax props set (its other props kept)
function erMember(model, view, owner, id, text) {
  const I = erIndex(model); if ((I.at.get(owner) || {}).type !== 'er.Entity') return null;
  const r = parseColumn(text, I, erProps((I.col.get(id) || {}).c || {}).references); if (r.error) return r;
  if (id == null) return [{ op: 'add', element: { id: erNewId(model, `${owner}.${r.label}`), type: 'er.Column', label: r.label, ...(Object.keys(r.props).length ? { props: r.props } : {}) }, owner }];
  const m = (I.col.get(id) || {}).c; if (!m) return null;
  const keep = Object.fromEntries(Object.entries(erProps(m)).filter(([k]) => !ER_SYNTAX.includes(k)));
  return [{ op: 'set', id, path: 'label', value: r.label }, { op: 'set', id, path: 'props', value: { ...keep, ...r.props } }];
}
// connect: a relationship joins two tables (the palette's entry gives it 1 to 0..*, non-identifying); else said
function erConnect(model, view, from, to, at, line) {
  if (!ER_OBJ(line) || line.type !== 'er.Relationship') return null;
  const I = erIndex(model), ent = id => (I.at.get(id) || {}).type === 'er.Entity';
  return ent(from) && ent(to) ? null : { error: 'A relationship joins two tables' };
}

/* ---- the type ---- */
const erMultField = w => ({ key: `ends.${w}.multiplicity`, path: ['ends', w, 'multiplicity'], label: `${w === 'from' ? 'Parent' : 'Child'} multiplicity`, kind: 'text' });
const ER_TYPE = registerDiagramType('er', {
  title: 'entity-relationship diagram',
  elements: [{ type: 'er.Entity', label: 'Table' }, { type: 'uml.Comment', label: 'Comment' }],
  lines: [{ type: 'er.Relationship', label: 'Relationship', props: { identifying: false, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } } }, { type: 'uml.CommentLink', label: 'Comment link' }],
  props: { 'er.Entity': [], 'uml.Comment': [], 'uml.CommentLink': [],
    'er.Column': [['dataType', 'Type', 'text'], ['primaryKey', 'Primary key', 'bool'], ['foreignKey', 'Foreign key', 'bool'], ['references', 'References (column id)', 'text'], ['unique', 'Unique', 'bool'], ['nullable', 'Nullable', 'bool']].map(([key, label, kind]) => ({ key, label, kind })),
    'er.Relationship': [{ key: 'identifying', label: 'Identifying', kind: 'bool' }, erMultField('from'), erMultField('to')] },
  refs: { 'er.Column': { 'props.references': 'drop' } }, // a deleted column leaves the columns that referenced it
  layout: erGeo,
  // ponytail: the panel's member.print is given a column alone; the panel asks owners, with the live model, just before it,
  // so that model is read here and print names a referenced column by labels. No Owner field (null). A hook given the model ends this
  owners: model => (erIndex(model), null),
  member: { print: c => printColumn(c), holds: n => n.type === 'er.Entity' }, // rows are read by edits.member, which has the model
  validate: erProblems,
  rules: ER_RULES,
  describe: erDescribe,
  // the PDF's tables (§9): an entity's word and its columns as S9 prints them; a relationship's multiplicities
  word: (model, id) => ((erIndex(model).at.get(id) || {}).type === 'er.Entity' ? 'Table' : null),
  rows: (model, view, id) => { const I = erIndex(model), n = I.at.get(id); return n && n.type === 'er.Entity' ? erCols(n).map(c => printColumn(c, I)) : null; },
  text: (model, view, id) => { const e = erIndex(model).R.find(x => x.id === id);
    return e && e.type === 'er.Relationship' ? `${ER_HAS(e.label) ? e.label + ': ' : ''}${erMult(e, 'from') ?? '?'} to ${erMult(e, 'to') ?? '?'}, ${erIdentifying(e) ? 'identifying' : 'non-identifying'}` : null; },
  edits: { member: erMember, connect: erConnect },
});

export { ER_TYPE, ER_RULES, erGeo, erProblems, erDescribe, erMember, erConnect, erEnd, parseColumn, printColumn };
