/* ---------- Mermaid erDiagram: a reader and a writer (notes/milestone-2.md §8.1, M2.8; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's entity relationship page (docs/syntax/entityRelationshipDiagram.md, read 14 Nov 2026)
   and its lexer (packages/mermaid/src/diagrams/er/parser/erDiagram.jison), as the other readers are against theirs.
   Internal: the CLI (`umlimator.py import`) imports this file through Node (M2.12); a host gets it once the registry is
   public. Its helpers are its own (me...), since the readers share one scope in lib/umlimator-all.js.

   readMermaidEr(text) -> { model, report }: a version-2 model with one `er` view, in model.md row 20's vocabulary, and a
   report of what was not read as written, each item { line, status, message }, status `skipped` or `approximated` (R1).
   The reader is hand-written and linear, and refuses text over ME_LIMIT characters (R2). Ids come from the source's
   names (R3): an entity's name is its id, a column is <entity>.<name>, a relationship <from>-<to>, each the next free of
   base, base-2, base-3 ... (an id holds no "->": a name with one has it as "-"). `%% id: <id>` above a statement or a
   column gives that element its id instead, and above `erDiagram` the view's; `%% references: <column id>` above a
   column sets its `references`, which Mermaid's text has no place for. Every lookup table is keyed by Map or has no
   prototype, so `__proto__` and `constructor` are ordinary names. It never throws.

   writeMermaidEr(model, viewId?) -> text: one er view as Mermaid. What Mermaid cannot carry is kept in its comments, as
   the other writers do: an id the reader would not derive, as `%% id:` (an entity whose id Mermaid cannot write as a
   name is written as `entity`, `entity-2` ... under its `%% id:`), a column's `references` as `%% references:`; an element
   the subset leaves out as `%% not written: <id> (<type>)`, and a property Mermaid has no place for as
   `%% not written: <id>: <what>` (a multiplicity other than the four, written as the nearest; the notation idef1x, as
   Mermaid draws crow's foot). A column is written only when the reader reads its row back as it is.

   How ER maps onto Mermaid's text, both ways:
   - `NAME`, `"a name"`, `NAME[Alias]`, `NAME["An alias"]` an entity, its label the alias, else its name; `NAME { ... }`
     its columns, each `type name [PK, FK, UK] ["comment"]`: a type ending `?` is nullable (v11.16.0+), a name starting
     `*` a primary key, either in backticks taken as written; the comment kept under ext.mermaid.comment (reported once);
   - `A ||--o{ B : label` a relationship from A to B, each end's marker its multiplicity there, on either side: `||` 1,
     `|o` `o|` 0..1, `}|` `|{` 1..*, `}o` `o{` 0..*, and the word forms (`only one`, `one or more`, `many(0)`, `1+`, ...);
     `--` and `to` identifying, `..` `.-` `-.` and `optionally to` not; Mermaid's `u` (a parent marker its page does not
     show) approximated as 1. Mermaid says nothing of which column a foreign key references: `references` is left out,
     reported once (the ER type's fk-flag warns of each);
   - `direction TB` (Mermaid's default) is down, `LR` right (left unset: core's default, so a view's `right` reads back
     unset, drawn the same); BT and RL approximated; subgraphs are not read, the entities in them are, and a
     relationship with a subgraph is skipped; styles, classes and accessibility text are skipped. */
const ME_LIMIT = 1 << 20; // characters; an ER diagram a person writes is a few kilobytes
const ME_VIEW = 'er-diagram'; // the view's id when the source does not name it
const meTable = o => Object.assign(Object.create(null), o); // a lookup table: "constructor" or "__proto__" finds nothing in it
// each end's marker, both sides' forms, and the word forms (Mermaid's lexer reads any of them on either side)
const ME_MULT = meTable({ '|o': '0..1', 'o|': '0..1', '||': '1', '}o': '0..*', 'o{': '0..*', '}|': '1..*', '|{': '1..*', 'zero or more': '0..*',
  'zero or many': '0..*', 'zero or one': '0..1', 'one or zero': '0..1', 'one or more': '1..*', 'one or many': '1..*', 'only one': '1',
  'many(0)': '0..*', 'many(1)': '1..*', many: '0..*', one: '1', '0+': '0..*', '1+': '1..*', 1: '1', u: '1' });
const ME_CARD = /(\|o|o\||\|\||\}o|o\{|\}\||\|\{)|(zero or (?:more|many|one)|one or (?:zero|more|many)|only one|many\([01]\)|many|one)(?!\w)|([01]\+)|(1)(?![\w.])|(u)(?=[.|-])/iy;
const ME_REL = /(--|\.\.|\.-|-\.)|(optionally to|to)(?!\w)/iy;
const ME_SYM = meTable({ 1: ['||', '||'], '0..1': ['|o', 'o|'], '0..*': ['}o', 'o{'], '1..*': ['}|', '|{'] }); // the writer's marker, left and right
const ME_NAME = /(?:[^\x00-\x7F]|[\w.*-])+/y; // a name not in quotes (the lexer's UNICODE_TEXT)
const ME_WORD = /[*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-_[\]().,\u00C0-\uFFFF*]*/y; // a column's type or name (ATTRIBUTE_WORD)
const ME_KEY = /(?:PK|FK|UK)\b/iy;
// a statement's first word that Mermaid's lexer takes as a keyword: the writer writes no name that starts with one
const ME_KEYWORDS = new Set(['one', 'many', 'to', 'end', 'class', 'classdef', 'style', 'subgraph', 'erdiagram']);
const ME_DIRECTION = /direction\s+(TB|BT|RL|LR)/gi; // the lexer takes any line holding this as a direction statement
const meId = name => String(name).replace(/->+/g, '-'); // an id never holds "->" (model.md rule 5)
const meSkip = (s, k) => { while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++; return k; };
const meAt = (re, s, k) => { re.lastIndex = k; const m = re.exec(s); return m; };
const meShort = s => (s.length > 60 ? s.slice(0, 57) + '...' : s);

// the first of base, base-2, base-3 ... not in used, resuming where the last ask for base stopped (R2)
function meFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// text: Mermaid's line breaks and entity codes (#quot; #lt; #35;)
function meDecode(s) {
  return s.replace(/<br\s?\/?>/gi, '\n').replace(/#(quot|lt|gt|amp|\d{1,6});/g, (_, e) =>
    ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? String.fromCodePoint(Math.min(Number(e), 0x10ffff)));
}
// the writer's text in quotes: what would end the quotes, start a comment or an entity code, or make the line a direction
// statement, as entity codes, which Mermaid draws as the characters and the reader decodes
function meEncode(s) {
  return String(s).replace(/[#"%\\<>~]|[\x00-\x09\x0b-\x1f]/g, c => (c === '"' ? '#quot;' : c === '<' ? '#lt;' : c === '>' ? '#gt;' : `#${c.codePointAt(0)};`))
    .replace(/\n/g, '<br>').replace(/(direction)(\s+)(?=TB|BT|RL|LR)/gi, (_, d, w) => d + [...w].map(c => `#${c.codePointAt(0)};`).join(''));
}
// a name the writer writes as it is, or in quotes; else it needs an %% id:
const meBare = id => /^[A-Za-z_\u0080-\uFFFF](?:[^\x00-\x7F]|[\w.*-])*$/.test(id) && !ME_KEYWORDS.has(/^\w*/.exec(id)[0].toLowerCase()) && !/^u[.-]/i.test(id);
const meQuoted = id => /^[^"%\r\n\v\x08\\]+$/.test(id) && !/direction\s+(TB|BT|RL|LR)/i.test(id);

// a name at k: "in quotes" (not empty), or the lexer's UNICODE_TEXT: { text, end }
function meName(s, k) {
  if (s[k] === '"') { const e = s.indexOf('"', k + 1); return e > k + 1 ? { text: s.slice(k + 1, e), end: e + 1 } : null; }
  const m = meAt(ME_NAME, s, k);
  return m ? { text: m[0], end: k + m[0].length } : null;
}

// a column block's attributes from k, as Mermaid's lexer reads them in its block state: { cols, end, closed, bad }, each
// col { type, nullable, name, keys, comment, at }; bad is where an attribute that is not one starts
function meRow(s, k, tilde = s.lastIndexOf('~')) {
  const cols = [];
  let nt = -2, nw = -2; // the next ~ and the next whitespace at or after k, found once each as k moves on (linear)
  const nextTilde = () => { if (nt < k && nt !== -1) nt = s.indexOf('~', k); return nt; };
  const nextWs = () => { if (nw < k) { nw = k; while (nw < s.length && !/\s/.test(s[nw])) nw++; } return nw; };
  const ws = () => { while (k < s.length && /\s/.test(s[k])) k++; };
  const isKey = () => (k === 0 || !/\w/.test(s[k - 1])) && !!meAt(ME_KEY, s, k);
  const word = () => {
    if (isKey()) return null;
    const t = tilde > k ? nextTilde() : -1; // ([^\s]*)~.*~([^\s]*): a ~ in this run and another after it on the line
    if (t >= 0 && t < nextWs() && tilde > t) { let e = tilde + 1; while (e < s.length && !/\s/.test(s[e])) e++; const w = s.slice(k, e); k = e; return { text: w }; }
    if (s[k] === '`') { const e = s.indexOf('`', k + 1); if (e <= k + 1) return null; const w = s.slice(k + 1, e); k = e + 1; return { text: w, quoted: true }; }
    const m = meAt(ME_WORD, s, k); if (!m) return null;
    k += m[0].length;
    return { text: m[0] };
  };
  for (;;) {
    ws();
    if (k >= s.length) return { cols, end: k, closed: false };
    if (s[k] === '}') return { cols, end: k + 1, closed: true };
    const at = k, type = word();
    if (!type) return { cols, end: k, closed: false, bad: at };
    ws();
    let nullable = false;
    if (s[k] === '?') { nullable = true; k++; ws(); }
    const name = word();
    if (!name) return { cols, end: k, closed: false, bad: at };
    const keys = [];
    for (ws(); isKey(); ws()) {
      keys.push(s.slice(k, k + 2).toUpperCase()); k += 2; ws();
      if (s[k] !== ',') break;
      k++; ws();
      if (!isKey()) return { cols, end: k, closed: false, bad: at };
    }
    let comment;
    if (s[k] === '"') { const e = s.indexOf('"', k + 1); if (e < 0) return { cols, end: k, closed: false, bad: at }; comment = s.slice(k + 1, e); k = e + 1; }
    cols.push({ type, nullable, name, keys, comment, at });
  }
}

// a row as the model has it: its label, its props, its comment
function meColumn(c) {
  const star = !c.name.quoted && c.name.text.length > 1 && c.name.text[0] === '*', props = { dataType: c.type.text };
  if (star || c.keys.includes('PK')) props.primaryKey = true;
  if (c.keys.includes('FK')) props.foreignKey = true;
  if (c.keys.includes('UK')) props.unique = true;
  if (c.nullable) props.nullable = true;
  return { label: star ? c.name.text.slice(1) : c.name.text, props, ...(c.comment !== undefined ? { comment: meDecode(c.comment) } : {}) };
}

function readMermaidEr(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: ME_VIEW, nodes: [], edges: [], views: [{ id: ME_VIEW, diagram: 'er', nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > ME_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${ME_LIMIT}: nothing read`); return empty(); }
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0, title;

  // front matter: its title; Mermaid's configuration is not read
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && lines[i].trim().replace(/^\uFEFF/, '') === '---') {
    let j = i + 1;
    for (; j < lines.length && lines[j].trim() !== '---'; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#') || /^\s/.test(l)) continue;
      const c = l.indexOf(':'), key = (c < 0 ? l : l.slice(0, c)).trim(), val = c < 0 ? '' : l.slice(c + 1).trim();
      if (key === 'title') {
        if (val.startsWith('"')) { try { title = JSON.parse(val); } catch { title = val.slice(1, -1); } }
        else title = val.startsWith("'") ? val.slice(1, -1).replaceAll("''", "'") : val;
      } else say(j + 1, 'skipped', `front matter ${key}: Mermaid's configuration is not read`);
    }
    if (j >= lines.length) { say(i + 1, 'skipped', 'the front matter is never closed with ---: nothing read'); return empty(); }
    i = j + 1;
  }

  const ents = new Map(), seen = [], rels = [], groups = new Set(), once = new Set();
  let viewId, viewNo, direction = 'down', started = false, hint = {}, acc = false, depth = 0, block = null;
  const ent = (name, no) => { let r = ents.get(name); if (!r) { r = { name, no, cols: [], names: new Set() }; ents.set(name, r); seen.push(r); } return r; };
  const column = (rec, c, no) => {
    const col = meColumn(c), h = hint;
    hint = {};
    if (rec.names.has(col.label)) { say(no, 'skipped', `${rec.name}.${col.label}: ${rec.name} has a column ${col.label} already`); return; }
    rec.names.add(col.label);
    if (h.references !== undefined) col.props.references = h.references;
    rec.cols.push({ ...col, hint: h.id, no });
    if (col.comment !== undefined && !once.has('comment')) { once.add('comment'); say(no, 'approximated', `${rec.name}.${col.label}: a column's comment is kept under ext.mermaid.comment and not drawn, as every other column's`); }
    if (col.props.foreignKey && h.references === undefined && !once.has('fk')) { once.add('fk'); say(no, 'approximated', `${rec.name}.${col.label}: Mermaid does not say which column a foreign key references, so references is left out, as for every other (fk-flag warns of each)`); }
  };
  // :::a,b after a name: styling, skipped
  const styled = (s, k, name, no) => {
    if (!s.startsWith(':::', k)) return k;
    let e = k + 3; while (e < s.length && !/[\s{[:]/.test(s[e])) e++;
    say(no, 'skipped', `${s.slice(k, e)} on ${name}: styling is not read`);
    return meSkip(s, e);
  };

  // one statement from k on line s (dir: where the line's last direction statement starts, or -1): where reading goes on
  const statement = (s, k, no, dir) => {
    const st = meSkip(s, k);
    if (st >= s.length) return s.length;
    const notRead = () => { say(no, 'skipped', `"${meShort(s.slice(st).trim())}" is not understood`); return s.length; };
    if (dir >= st) {
      const d = meAt(/direction\s+(TB|BT|RL|LR)/iy, s, dir)[1].toUpperCase();
      if (depth) say(no, 'skipped', `direction ${d} inside a subgraph is not kept: the view has one direction`);
      else if (d === 'TB') direction = 'down';
      else if (d === 'LR') direction = 'right';
      else { direction = d === 'BT' ? 'down' : 'right'; say(no, 'approximated', `direction ${d} is drawn ${direction === 'down' ? 'top to bottom' : 'left to right'}`); }
      return s.length;
    }
    const kw = meAt(/(classDef|class|style|subgraph|end)\b|(accTitle)\s*:|(accDescr)\s*([:{])/iy, s, st);
    if (kw) {
      const w = (kw[1] || kw[2] || kw[3]).toLowerCase();
      if (w === 'subgraph') {
        const n = meName(s, meSkip(s, st + 8));
        if (!n) return notRead();
        groups.add(n.text); depth++;
        say(no, 'skipped', `subgraph ${n.text}: a group is not read; the entities in it are`);
      } else if (w === 'end') { if (depth) depth--; else say(no, 'skipped', 'an end that closes no subgraph'); }
      else if (w === 'acctitle' || w === 'accdescr') {
        say(no, 'skipped', `${kw[2] || kw[3]}: accessibility text is not read`);
        if (kw[4] === '{' && !s.includes('}', st)) acc = true;
      } else say(no, 'skipped', `${kw[1]}: styling is not read`);
      return s.length;
    }
    const a = meName(s, st);
    if (!a) return notRead();
    let k2 = styled(s, meSkip(s, a.end), a.text, no);
    const card = meAt(ME_CARD, s, k2);
    if (!card) { // an entity: its alias, its classes, its block
      const rec = ent(a.text, no);
      rec.declared = true;
      if (hint.id !== undefined && rec.hint === undefined) { rec.hint = hint.id; rec.hintNo = no; }
      hint = {};
      if (s[k2] === '[') {
        const q = meSkip(s, k2 + 1), n = s[q] === '"' ? meName(s, q) : null, e = n ? meSkip(s, n.end) : s.indexOf(']', q);
        if (e < 0 || s[e] !== ']' || (!n && !s.slice(q, e).trim())) return notRead();
        const alias = meDecode(n ? n.text : s.slice(q, e).trim());
        if (rec.label === undefined) rec.label = alias;
        else if (rec.label !== alias) say(no, 'skipped', `${a.text}[${alias}]: ${a.text} has an alias already`);
        k2 = styled(s, meSkip(s, e + 1), a.text, no);
      }
      if (s[k2] === '{') { block = rec; return k2 + 1; }
      return k2 < s.length ? notRead() : s.length;
    }
    // a relationship: A card rel card B [: label]
    const end = m => k2 + m[0].length, mult = m => ME_MULT[m[0].toLowerCase()];
    k2 = meSkip(s, end(card));
    const rel = meAt(ME_REL, s, k2);
    if (!rel) return notRead();
    k2 = meSkip(s, end(rel));
    const card2 = meAt(ME_CARD, s, k2);
    if (!card2) return notRead();
    k2 = meSkip(s, end(card2));
    const b = meName(s, k2);
    if (!b) return notRead();
    k2 = styled(s, meSkip(s, b.end), b.text, no);
    let label;
    if (s[k2] === ':') { const t = s.slice(k2 + 1).trim(), q = /^"([^"]*)"$/.exec(t); label = meDecode(q ? q[1] : t); }
    else if (k2 < s.length) return notRead();
    else say(no, 'approximated', `${a.text} ${card[0]}${rel[0]}${card2[0]} ${b.text}: no : label, which Mermaid asks for, so it has none`);
    if (card[5] || card2[5]) say(no, 'approximated', `${a.text} ${card[0]}${rel[0]}${card2[0]} ${b.text}: u, a parent marker Mermaid's page does not show, is read as 1`);
    ent(a.text, no); ent(b.text, no);
    rels.push({ a: a.text, b: b.text, from: mult(card), to: mult(card2), identifying: rel[1] ? rel[1] === '--' : /^to$/i.test(rel[2]), label, no, hint: hint.id });
    hint = {};
    return s.length;
  };

  for (; i < lines.length; i++) {
    const no = i + 1, s = lines[i], t = s.trim();
    if (!t) continue;
    if (acc) { if (t.includes('}')) acc = false; continue; }
    if (t.startsWith('%%')) {
      const c = t.slice(2).trim();
      if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!t.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      } else if (c.startsWith('id:')) { hint.id = c.slice(3).trim(); hint.no = no; }
      else if (c.startsWith('references:')) hint.references = c.slice(11).trim();
      continue;
    }
    if (!started) {
      if (!/^\uFEFF?erDiagram$/i.test(t)) { say(no, 'skipped', 'not a Mermaid erDiagram: nothing read'); return empty(); }
      started = true; viewId = hint.id; viewNo = hint.no; hint = {}; continue;
    }
    const tilde = s.lastIndexOf('~');
    let dir = -1;
    if (!block) for (const m of s.matchAll(ME_DIRECTION)) dir = m.index;
    for (let k = 0; k < s.length;) {
      if (!block) { k = statement(s, k, no, dir); continue; }
      const r = meRow(s, k, tilde);
      for (const c of r.cols) column(block, c, no);
      if (r.bad !== undefined) {
        const e = s.indexOf('}', r.end);
        say(no, 'skipped', `"${meShort(s.slice(r.bad, e < 0 ? s.length : e).trim())}" in ${block.name}'s block is not a column`);
        if (e >= 0) block = null;
        k = e < 0 ? s.length : e + 1;
      } else { k = r.end; if (r.closed) block = null; }
    }
    hint = {};
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid erDiagram: nothing read'); return empty(); }
  if (block) say(lines.length, 'approximated', `${block.name}'s { is never closed: read to the end`);
  if (depth) say(lines.length, 'approximated', `${depth} subgraph${depth > 1 ? 's are' : ' is'} never closed with end: read to the end`);

  // ids: an entity's hint or name, then the next free of it, each reported; then columns and relationships in the order
  // they come, made unique, a hint that is taken or holds -> reported
  const used = new Set(), next = new Map(), list = seen.filter(r => r.declared || !groups.has(r.name));
  for (const r of list) { const want = r.hint ?? r.name; if (meId(want) === want && !used.has(want)) { r.id = want; used.add(want); } }
  for (const r of list) if (r.id === undefined) {
    const want = r.hint ?? r.name;
    r.id = meFree(used, next, meId(want)); used.add(r.id);
    say(r.hintNo ?? r.no, 'approximated', r.hint !== undefined ? `%% id: ${want}${meId(want) !== want ? ': an id holds no "->"' : ' is taken'}, so entity ${r.name} is ${r.id}`
      : `entity ${r.name}${meId(want) !== want ? ': an id holds no "->"' : "'s name is another's id"}, so it is ${r.id}`);
  }
  const take = (h, base, no, what) => {
    const id = meFree(used, next, meId(h ?? base));
    used.add(id);
    if (h !== undefined && id !== h) say(no, 'approximated', `%% id: ${h}${meId(h) !== h ? ': an id holds no "->"' : ' is taken'}, so ${what} is ${id}`);
    return id;
  };
  const nodes = list.map(r => {
    const members = r.cols.map(c => ({ id: take(c.hint, `${r.id}.${c.label}`, c.no, `${r.name}.${c.label}`), type: 'er.Column', label: c.label, props: c.props,
      ...(c.comment !== undefined ? { ext: { mermaid: { comment: c.comment } } } : {}) }));
    return { id: r.id, type: 'er.Entity', label: r.label ?? r.name, ...(members.length ? { members } : {}) };
  });
  const byName = new Map(list.map(r => [r.name, r.id])), edges = [];
  for (const r of rels) {
    const g = [r.a, r.b].find(x => !byName.has(x));
    if (g !== undefined) { say(r.no, 'skipped', `${r.a} -- ${r.b}: ${g} is a subgraph, and a relationship with a group is not read`); continue; }
    const from = byName.get(r.a), to = byName.get(r.b);
    edges.push({ id: take(r.hint, `${from}-${to}`, r.no, `${r.a} -- ${r.b}`), type: 'er.Relationship', from, to, ...(r.label ? { label: r.label } : {}),
      props: { identifying: r.identifying, ends: { from: { multiplicity: r.from }, to: { multiplicity: r.to } } } });
  }
  let vid = viewId || ME_VIEW;
  if (meId(vid) !== vid) { say(viewNo, 'approximated', `%% id: ${vid}: an id holds no "->", so the view is ${meId(vid)}`); vid = meId(vid); }
  const view = { id: vid, diagram: 'er', ...(title ? { title } : {}), ...(direction === 'down' ? { direction } : {}), nodeIds: nodes.map(n => n.id) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges, views: [view] }, report };
}

function writeMermaidEr(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const has = x => x != null && x !== '', flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), nl = s => /[\r\n]/.test(String(s)); // a comment is one line
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'er');
  // a model with views is written through its er view; one with none, whole
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (views.length && !view) return '%% not written: the model, which has no er view\n';
  if (view && view.diagram !== 'er') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not an er one\n`;
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const once = (seen, id) => { if (!seen.has(id)) return seen.add(id); lose(id, 'listed twice in the view, written once'); return false; };
  const shownSet = new Set(), shown = (view ? arr(view.nodeIds) : [...byId.keys()]).filter(id => byId.has(id) && once(shownSet, id));
  // an id the reader keeps as it is: a string of one line, trimmed (as a hint is read), with no ->
  const keeps = id => typeof id === 'string' && id !== '' && !nl(id) && id.trim() === id && meId(id) === id;
  const derives = id => typeof id === 'string' && id !== '' && !nl(id) && meId(id) === id; // an id the reader may derive, needing no hint
  // the keys and props Mermaid has a place for; any other is named
  const extra = (x, keys, props = []) => {
    for (const k of Object.keys(x)) if (!keys.includes(k)) {
      if (k === 'props' && isObj(x.props)) { for (const p of Object.keys(x.props)) if (!props.includes(p)) lose(x.id, `property ${p}`); }
      else lose(x.id, k);
    }
  };
  const title = view && has(view.title) ? view.title : m.title;
  // as it is only when YAML reads it as text: a letter first, and not one of YAML's null or boolean words
  const plain = t => /^\p{L}[\p{L}\p{N} _.,()-]*$/u.test(t) && !t.endsWith(' ') && !/^(null|true|false|yes|no|on|off|y|n)$/i.test(t);
  if (has(title)) out.push('---', `title: ${plain(title) ? title : JSON.stringify(String(title))}`, '---');
  if (view && view.id !== ME_VIEW) { if (keeps(view.id)) out.push(`%% id: ${view.id}`); else lose(view.id, "the view's id, which the reader would not keep"); }
  out.push('erDiagram', view && view.direction === 'down' ? '  direction TB' : '  direction LR');
  if (view && has(view.notation) && view.notation !== 'crowsfoot') lose(view.id, `notation ${view.notation}: Mermaid draws crow's foot`);

  // entities: a name Mermaid writes as it is or in quotes is the id; another id is an %% id: over a name the writer makes
  const ents = shown.map(id => byId.get(id)).filter(n => {
    const ok = n.type === 'er.Entity' && typeof n.id === 'string' && n.id !== '' && !nl(n.id) && meId(n.id) === n.id && (meBare(n.id) || meQuoted(n.id) || n.id.trim() === n.id);
    if (!ok) skip(n);
    return ok;
  });
  const names = new Map(), taken = new Set(ents.filter(n => meBare(n.id) || meQuoted(n.id)).map(n => n.id)), made = new Map();
  for (const n of ents) {
    if (meBare(n.id)) names.set(n.id, [n.id, false]);
    else if (meQuoted(n.id)) names.set(n.id, [`"${n.id}"`, false]);
    else { const w = meFree(taken, made, 'entity'); taken.add(w); names.set(n.id, [w, true]); }
  }
  const used = new Set(ents.map(n => n.id)), next = new Map();
  // the hint, if one is needed: null when the reader derives the id, undefined when it would need one it cannot keep
  const idOf = (id, base) => { const d = meFree(used, next, meId(base)); if (d !== id && !keeps(id)) return undefined; used.add(id); return d === id ? null : id; };
  for (const n of ents) {
    const [name, hinted] = names.get(n.id);
    extra(n, ['id', 'type', 'label', 'members']);
    let alias = '';
    if (typeof n.label === 'string' && n.label !== '') { if (hinted || n.label !== n.id) alias = `["${meEncode(n.label)}"]`; }
    else lose(n.id, n.label === '' ? 'an empty label, read as its name' : n.label == null ? 'no label, read as its name' : `label ${n.label}, which is not text`);
    const rows = [], labels = new Set();
    for (const x of arr(n.members).filter(isObj)) {
      const p = isObj(x.props) ? x.props : {}, ext = isObj(x.ext) ? x.ext : {}, me = isObj(ext.mermaid) ? ext.mermaid : {};
      if (x.type !== 'er.Column' || !derives(x.id) || typeof x.label !== 'string' || !x.label || typeof p.dataType !== 'string' || !p.dataType || labels.has(x.label)) { skip(x); continue; }
      const comment = typeof me.comment === 'string' ? me.comment : undefined;
      const keys = [p.primaryKey === true && 'PK', p.foreignKey === true && 'FK', p.unique === true && 'UK'].filter(Boolean);
      const want = JSON.stringify(Object.entries({ dataType: p.dataType, ...Object.fromEntries(['primaryKey', 'foreignKey', 'unique', 'nullable'].filter(f => p[f] === true).map(f => [f, true])) }).sort());
      // the type and the name as they are, else in backticks (and a ? apart, which a generic type's word would take in):
      // the first row the reader reads back as the column is written
      // (a row is one line: a type or name in backticks holding a line break would be read as two)
      const row = [[0, 0, ''], [1, 0, ''], [0, 1, ''], [1, 1, ''], [0, 0, ' '], [0, 1, ' ']].map(([q, r, sp]) => `${q ? '`' + p.dataType + '`' : p.dataType}${p.nullable === true ? sp + '?' : ''} ${r ? '`' + x.label + '`' : x.label}${keys.length ? ' ' + keys.join(', ') : ''}${comment !== undefined ? ` "${meEncode(comment)}"` : ''}`).find(row => {
        if (nl(row)) return false;
        const r = meRow(row, 0), c = r.cols.length === 1 && r.bad === undefined && r.end === row.length ? meColumn(r.cols[0]) : null;
        return c && c.label === x.label && c.comment === comment && JSON.stringify(Object.entries(c.props).sort()) === want;
      });
      const hint = row ? idOf(x.id, `${n.id}.${x.label}`) : undefined;
      if (hint === undefined) { skip(x); continue; }
      labels.add(x.label);
      extra(x, ['id', 'type', 'label', 'ext'], ['dataType', 'primaryKey', 'foreignKey', 'unique', 'nullable', 'references']);
      for (const f of ['primaryKey', 'foreignKey', 'unique', 'nullable']) if (p[f] !== undefined && p[f] !== true) lose(x.id, `${f} ${p[f]}, read as absent`);
      if (Object.keys(ext).some(k => k !== 'mermaid') || Object.keys(me).some(k => k !== 'comment') || (me.comment !== undefined && comment === undefined)) lose(x.id, 'ext, but for ext.mermaid.comment');
      let ref = null;
      if (p.references !== undefined) { if (keeps(p.references)) ref = p.references; else lose(x.id, `references ${p.references}, which the reader would not keep`); }
      rows.push([hint, ref, row]);
    }
    if (hinted) out.push(`  %% id: ${n.id}`);
    if (!rows.length) { out.push(`  ${name}${alias}`); continue; }
    out.push(`  ${name}${alias} {`);
    for (const [hint, ref, row] of rows) out.push(...(hint ? [`    %% id: ${hint}`] : []), ...(ref ? [`    %% references: ${ref}`] : []), `    ${row}`);
    out.push('  }');
  }

  const edgeOf = e => (typeof e === 'string' ? arr(m.edges).find(x => isObj(x) && x.id === e) : e);
  const lines = (view && Array.isArray(view.edges) ? view.edges.map(edgeOf) : arr(m.edges).filter(e => isObj(e) && shownSet.has(e.from) && shownSet.has(e.to))).filter(isObj);
  const seenEdges = new Set();
  for (const e of lines) {
    if (view && Array.isArray(view.edges) && !once(seenEdges, e.id)) continue;
    const hint = e.type === 'er.Relationship' && derives(e.id) && names.has(e.from) && names.has(e.to) ? idOf(e.id, `${e.from}-${e.to}`) : undefined;
    if (hint === undefined) { skip(e); continue; }
    const p = isObj(e.props) ? e.props : {}, ends = isObj(p.ends) ? p.ends : {};
    extra(e, ['id', 'type', 'from', 'to', 'label'], ['identifying', 'ends']);
    // each end's marker: one of the four, else the nearest by its bounds (0 or 1 below; 1 or many above), named
    const mark = (w, side) => {
      const end = isObj(ends[w]) ? ends[w] : {}, mult = end.multiplicity;
      for (const k of Object.keys(end)) if (k !== 'multiplicity') lose(e.id, `${k} at its ${w} end`);
      if (typeof mult === 'string' && ME_SYM[mult]) return ME_SYM[mult][side];
      const b = /^\s*(\d+|\*)\s*(?:\.\.\s*(\d+|\*)\s*)?$/.exec(typeof mult === 'string' ? mult : ''), lo = b && (b[1] === '*' ? 0 : +b[1]), hi = b && (b[2] ?? b[1]);
      const near = !b ? '1' : (lo === 0 ? '0' : '1') + (hi === '*' || +hi > 1 ? '..*' : lo === 0 ? '..1' : '');
      lose(e.id, `multiplicity ${mult ?? 'none'} at its ${w} end, written as ${near}`);
      return ME_SYM[near][side];
    };
    const left = mark('from', 0), right = mark('to', 1);
    if (typeof p.identifying !== 'boolean') lose(e.id, `identifying ${p.identifying ?? 'unset'}, written as non-identifying`);
    if (e.label === '' || (e.label != null && typeof e.label !== 'string')) lose(e.id, e.label === '' ? 'an empty label, read as none' : `label ${e.label}, which is not text`);
    const label = typeof e.label === 'string' ? meEncode(e.label) : '';
    out.push(...(hint ? [`  %% id: ${hint}`] : []), `  ${names.get(e.from)[0]} ${left}${p.identifying === true ? '--' : '..'}${right} ${names.get(e.to)[0]} : "${label}"`);
  }
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  return out.join('\n') + '\n';
}

export { readMermaidEr, writeMermaidEr };
