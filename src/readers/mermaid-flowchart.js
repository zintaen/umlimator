/* ---------- Mermaid flowchart: a reader and a writer (notes/milestone-2.md §8, §8.2, M2.9; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's flowchart page (docs/syntax/flowchart.md) and its shapes' names and aliases
   (rendering-elements/shapes.ts), both read on Mermaid's repository 14 Nov 2026, and ported from the map
   importer's grammar (`flowchart()` in umlimator_import.py): node groups with &, links with their text in pipes or inline,
   subgraphs, statements split by ; outside quotes. On the file of every construct (tests/import/flowchart.mmd) it reads
   every node and link the importer reads, with the same ids; it reads more (Mermaid's @{ shape: ... } form and edge ids),
   and keeps each node's shape as its flowchart type. Internal: the CLI imports it through Node (M2.12); its helpers are
   its own (mf...), since the readers share one scope in lib/umlimator-all.js.

   readMermaidFlowchart(text) -> { model, report }: a version-2 model with one `flowchart` view, in model.md row 21's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). Hand-written and linear; text over MF_LIMIT characters is refused, and links past MF_FLOWS are not
   read (R2). Ids come from the source's names (R3): a node is its Mermaid id, a link its edge id (`A e1@--> B`), else
   <from>-<to>, the next free of base, base-2, base-3 ... `%% id: <id>` above a statement gives its first link that id, or,
   when it has no link, its first node; above the header, the view. It never throws.

   writeMermaidFlowchart(model, viewId?) -> text: one flowchart view as Mermaid: each node declared on its own line, then
   each flow, its label quoted in pipes. An id Mermaid cannot carry as a name is written as a name made of it with
   `%% id:` above, as is a flow's id the reader would not derive; an element or property the subset leaves out is named in
   `%% not written:` lines (a comment: Mermaid's flowchart has no note).

   How the flowchart's symbols map onto Mermaid's shapes, both ways (§8.2): ([ ]) a terminator, [ ] a process, { } a
   decision, [/ /] and [\ \] input/output, [[ ]] a predefined process, [( )] a database, (( )) a connector; doc,
   manual-input and delay by @{ shape: ... } only, with the aliases Mermaid's page lists. Mermaid's other shapes are read
   as processes, approximated. A link is a flow; one with no arrowhead, dotted, thick, or with a circle or cross end is
   approximated, <-->, o--o and x--x are two flows, ~~~ is not read. A subgraph's nodes are read, the group is not (row 21 has none). */
const MF_LIMIT = 1 << 20; // characters; a flowchart a person writes is a few kilobytes
const MF_FLOWS = 100000; // the most links read: a & b & ... --> c & d & ... makes the product of its groups (R2)
const MF_VIEW = 'flowchart'; // the view's id when the source does not name it, as the importer's
const mfTable = o => Object.assign(Object.create(null), o); // a lookup table: "constructor" or "__proto__" finds nothing in it
// the bracket forms, longest first, as the importer's SHAPES: open, close, type (null: a process, approximated) and what Mermaid calls it
const MF_BRACKETS = [['(((', ')))', null, 'a double circle'], ['([', '])', 'flow.Terminator'], ['[[', ']]', 'flow.PredefinedProcess'], ['[(', ')]', 'flow.Database'],
  ['((', '))', 'flow.Connector'], ['{{', '}}', null, 'a hexagon'], ['[/', '/]', 'flow.InputOutput'], ['[/', '\\]', null, 'a trapezoid'], ['[\\', '\\]', 'flow.InputOutput'],
  ['[\\', '/]', null, 'an upside-down trapezoid'], ['[', ']', 'flow.Process'], ['(', ')', null, 'a rounded box'], ['{', '}', 'flow.Decision'], ['>', ']', null, 'an asymmetric shape']];
// @{ shape: ... }: the names and aliases in Mermaid's shapes.ts of the shapes a flowchart symbol has; any other is a process, approximated
const MF_SHAPES = mfTable({
  stadium: 'flow.Terminator', terminal: 'flow.Terminator', pill: 'flow.Terminator',
  rect: 'flow.Process', rectangle: 'flow.Process', proc: 'flow.Process', process: 'flow.Process',
  diam: 'flow.Decision', diamond: 'flow.Decision', decision: 'flow.Decision', question: 'flow.Decision',
  'lean-r': 'flow.InputOutput', 'lean-right': 'flow.InputOutput', 'in-out': 'flow.InputOutput', 'lean-l': 'flow.InputOutput', 'lean-left': 'flow.InputOutput', 'out-in': 'flow.InputOutput',
  subproc: 'flow.PredefinedProcess', subprocess: 'flow.PredefinedProcess', subroutine: 'flow.PredefinedProcess', 'fr-rect': 'flow.PredefinedProcess', 'framed-rectangle': 'flow.PredefinedProcess',
  doc: 'flow.Document', document: 'flow.Document',
  cyl: 'flow.Database', cylinder: 'flow.Database', database: 'flow.Database', db: 'flow.Database',
  'manual-input': 'flow.ManualInput', 'sl-rect': 'flow.ManualInput', 'sloped-rectangle': 'flow.ManualInput',
  delay: 'flow.Delay', 'half-rounded-rectangle': 'flow.Delay',
  circle: 'flow.Connector', circ: 'flow.Connector' });
// what the writer writes for each type: a bracket form, or a shape name for the three the brackets lack
const MF_WRITE = mfTable({ 'flow.Terminator': ['([', '])'], 'flow.Process': ['[', ']'], 'flow.Decision': ['{', '}'], 'flow.InputOutput': ['[/', '/]'], 'flow.PredefinedProcess': ['[[', ']]'],
  'flow.Database': ['[(', ')]'], 'flow.Connector': ['((', '))'], 'flow.Document': 'doc', 'flow.ManualInput': 'manual-input', 'flow.Delay': 'delay' });
const MF_NODE = /\s*([\p{L}\p{N}_$]+(?:[.-][\p{L}\p{N}_$]+)*)/uy; // a node's id, as the importer's NODE (Python's \w)
const MF_NAME = /^[\p{L}\p{N}_$]+(?:[.-][\p{L}\p{N}_$]+)*$/u;
const MF_PLAIN = /\s*([<ox]?(?:-{2,}[->ox]|={2,}[=>ox]|-?\.+-[>ox]?|~{3,}))/y; // a link with no text in it
const MF_OPEN = /\s*([<ox]?(?:--|==|-\.))\s*/y; // a link's start, its text after it (-- text -->)
const MF_PIPE = /\s*(?:\|("[^"]*"|[^|]*)\|)?/y; // a quoted text may hold |
const MF_EDGE_ID = /\s*([^\s"@&|]+)@(?=[^{"])/y; // A e1@--> B
// statements Mermaid reads and this reader does not; the importer passes over the same words (FLOW_QUIET)
const MF_QUIET = /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)(?![\p{L}\p{N}_])/u;
const MF_WORDS = /^(end|subgraph|graph|flowchart|classDef|class|style|linkStyle|click|direction|accTitle|accDescr|default|call|href)(?![\p{L}\p{N}_])/u; // no name the writer gives starts so
const mfId = s => String(s).replace(/->+/g, '-'); // an id never holds "->" (model.md rule 5)
const mfClip = s => (s.length > 60 ? s.slice(0, 57) + '...' : s);

function mfFree(used, next, base) { // the first of base, base-2, ... not in used, resuming where the last ask stopped (R2)
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// text: quotes and a Markdown string's backticks taken off (as the importer's text()), Mermaid's <br> and entity codes read
function mfText(raw, md) {
  let s = raw.trim();
  if (s.length > 1 && s[0] === '"' && s.at(-1) === '"') {
    s = s.slice(1, -1);
    if (s.length > 1 && s[0] === '`' && s.at(-1) === '`') { s = s.slice(1, -1); md?.(); }
  }
  return s.replace(/<br\s?\/?>|\\n/gi, '\n').replace(/#(quot|lt|gt|amp|\d{1,6});/g, (_, e) =>
    ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? String.fromCodePoint(Math.min(Number(e), 0x10ffff)));
}

// where a link's close (-->, ==>, .->, ---) ends when it starts at p, else -1: -{2,}[->ox], ={2,}[=>ox] or \.+-[>ox]?, greedy
function mfCloseAt(s, p) {
  const c = s[p];
  let q = p;
  while (s[q] === c) q++;
  if (c === '.') return s[q] !== '-' ? -1 : q + 1 + (q + 1 < s.length && '>ox'.includes(s[q + 1]) ? 1 : 0);
  if (c !== '-' && c !== '=') return -1;
  if (q - p >= 2 && q < s.length && '>ox'.includes(s[q])) return q + 1;
  return q - p >= 3 ? q : -1;
}
// a link at i: { arrow, text, pipe, end }, or null. The importer's LINK, with its text's close found by one scan: the
// first close after the text, and no | before it ([^|]+? then \s* then the close)
function mfLink(s, i) {
  MF_PLAIN.lastIndex = i;
  let m = MF_PLAIN.exec(s), arrow, text, j;
  if (m) { arrow = m[1]; j = MF_PLAIN.lastIndex; } else {
    MF_OPEN.lastIndex = i;
    if (!(m = MF_OPEN.exec(s))) return null;
    const a = MF_OPEN.lastIndex, from = m.index + m[0].trimEnd().length; // the text starts at a; it may start in the spaces before
    let at = -1, end = -1;
    for (let p = a + 1; p < s.length && s[p] !== '|';) {
      end = mfCloseAt(s, p);
      if (end >= 0) { at = p; break; }
      const c = s[p];
      if (c === '-' || c === '=' || c === '.') while (s[p] === c) p++; else p++; // no close starts inside a run that fails
    }
    if (at < 0 && a > from && s[a] !== '|' && (end = mfCloseAt(s, a)) >= 0) at = a; // text of spaces only
    if (at < 0) return null;
    text = s.slice(a, at); arrow = m[1] + s.slice(at, end); j = end;
  }
  MF_PIPE.lastIndex = j;
  const p = MF_PIPE.exec(s);
  return { arrow, text, pipe: p[1], end: MF_PIPE.lastIndex, raw: s.slice(i, MF_PIPE.lastIndex).trim() };
}

// @{ key: value, ... } at i (the @ itself): its fields and where it ends, or null when it is not closed
function mfFields(s, i) {
  const out = new Map();
  let k = i + 2, key = '', val = '', inKey = true, q = null, quoted = false;
  const put = () => { if (key.trim()) out.set(key.trim(), quoted ? val : val.trim()); key = ''; val = ''; inKey = true; quoted = false; };
  for (; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\' && k + 1 < s.length) val += s[++k]; else if (c === q) q = null; else val += c; continue; }
    if (c === '}') { put(); return { fields: out, end: k + 1 }; }
    if (inKey) { if (c === ':') inKey = false; else if (c === ',') put(); else key += c; continue; }
    if (c === ',') put();
    else if ((c === '"' || c === "'") && !val.trim()) { q = c; quoted = true; val = ''; } else val += c;
  }
  return null;
}

// a node at i: { id, label, type, odd, fields, cls, end }, or null (the importer's fnode, with @{ } read too). find is
// the statement's indexOf, which remembers where each string was not found, so unclosed brackets cost one scan (R2)
function mfNode(s, i, find) {
  MF_NODE.lastIndex = i;
  const n = MF_NODE.exec(s);
  if (!n) return null;
  const out = { id: n[1], end: MF_NODE.lastIndex };
  i = out.end;
  for (const [o, c, type, odd] of MF_BRACKETS) {
    if (!s.startsWith(o, i)) continue;
    const q = s[i + o.length] === '"' ? find('"', i + o.length + 1) : -1;
    const k = find(c, q >= 0 ? q + 1 : i + o.length);
    if (k > 0) { out.label = s.slice(i + o.length, k); out.type = type || 'flow.Process'; out.odd = type ? null : odd; i = k + c.length; break; }
  }
  if (out.label === undefined && s.startsWith('@{', i)) {
    const f = mfFields(s, i);
    if (f) { out.fields = f.fields; i = f.end; }
  }
  if (s.startsWith(':::', i)) {
    let k = i + 3;
    while (k < s.length && /[\p{L}\p{N}_-]/u.test(s[k])) k++;
    if (k > i + 3) { out.cls = s.slice(i + 3, k); i = k; }
  }
  out.end = i;
  return out;
}

// node groups (a & b) joined by links, or null: the importer's statement()
function mfStatement(s) {
  const groups = [], links = [], miss = new Map();
  const find = (c, from) => {
    if (from >= (miss.get(c) ?? Infinity)) return -1;
    const k = s.indexOf(c, from);
    if (k < 0) miss.set(c, from);
    return k;
  };
  let i = 0;
  for (;;) {
    const grp = [];
    for (let n; (n = mfNode(s, i, find));) {
      grp.push(n); i = n.end;
      const amp = /\s*&/y; amp.lastIndex = i;
      if (!amp.exec(s)) break;
      i = amp.lastIndex;
    }
    if (!grp.length) return null;
    groups.push(grp);
    if (!s.slice(i).trim()) return { groups, links };
    MF_EDGE_ID.lastIndex = i;
    const eid = MF_EDGE_ID.exec(s), lk = mfLink(s, eid ? MF_EDGE_ID.lastIndex : i);
    if (!lk) return null;
    if (eid) lk.id = eid[1];
    links.push(lk); i = lk.end;
  }
}

// ; outside quotes ends a statement, as the importer splits a line
function mfSplit(line) {
  const out = [];
  let from = 0, q = false;
  for (let k = 0; k < line.length; k++) {
    if (line[k] === '"') q = !q;
    else if (line[k] === ';' && !q) { out.push(line.slice(from, k)); from = k + 1; }
  }
  out.push(line.slice(from));
  return out.map(x => x.trim());
}

function readMermaidFlowchart(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: MF_VIEW, nodes: [], edges: [], views: [{ id: MF_VIEW, diagram: 'flowchart', direction: 'down', nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MF_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MF_LIMIT}: nothing read`); return empty(); }
  const lines = text.replace(/^﻿/, '').split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0, title;

  // front matter: its title; Mermaid's configuration is not read
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && lines[i].trim() === '---') {
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

  const nodes = new Map(), links = [], subs = [], closed = new Set(), edgeIds = new Set();
  let viewId, direction = 'down', started = false, hint = null, hintNo = 0, block = false, flows = 0, over = false;
  const statement = (s, no) => {
    if (!s) return;
    const sg = /^subgraph\s+(?:([^\s["]+)\s*\[([^\]]*)\]|"(.+)"|(\S+)$|(.+))/.exec(s);
    if (sg) { // its id as the importer's ident(): the name when it is plain, else a slug of its title
      const label = mfText(sg[2] ?? sg[3] ?? sg[4] ?? sg[5]), raw = (sg[1] ?? sg[4] ?? label).trim();
      subs.push({ id: /^[\p{L}\p{N}_.-]+$/u.test(raw) ? raw : raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x', no });
      say(no, 'skipped', `subgraph ${subs.at(-1).id}: the group is not read, the nodes in it are`);
      return;
    }
    if (s === 'end') { if (subs.length) closed.add(subs.pop().id); else say(no, 'skipped', 'an end that closes no subgraph'); return; }
    const quiet = MF_QUIET.exec(s);
    if (quiet) {
      const w = quiet[1];
      if (w === 'direction') {
        const d = s.slice(9).trim().toUpperCase();
        if (subs.length) say(no, 'approximated', `direction ${d} inside a subgraph is not kept: the view has one direction`);
        else say(no, 'skipped', `direction ${d} outside a subgraph is not read: the header gives the view's direction`);
      } else if (w === 'accTitle' || w === 'accDescr') {
        say(no, 'skipped', `${w}: accessibility text is not read`);
        if (w === 'accDescr' && /^accDescr\s*\{/.test(s) && !s.includes('}')) block = true;
      } else say(no, 'skipped', `${mfClip(s)}: styles and interaction are not read`);
      return;
    }
    const p = mfStatement(s);
    if (!p) { say(no, 'skipped', `not read: ${mfClip(s)}`); return; }
    if (p.groups.length === 1 && p.groups[0].length === 1 && edgeIds.has(p.groups[0][0].id) && p.groups[0][0].fields) { // e1@{ animate: true }
      say(no, 'skipped', `${p.groups[0][0].id}@{ ... }: a link's animation is not read`);
      return;
    }
    for (const n of p.groups.flat()) {
      let rec = nodes.get(n.id);
      if (!rec) { rec = { name: n.id, no, label: n.id, type: 'flow.Process' }; nodes.set(n.id, rec); }
      if (hint != null && !p.links.length && rec.hint === undefined) { rec.hint = hint; rec.hintNo = no; hint = null; }
      if (n.cls) say(no, 'skipped', `${n.id}:::${n.cls}: a style class is not read`);
      if (n.label !== undefined) {
        rec.label = mfText(n.label, () => say(no, 'approximated', `${n.id}: a Markdown string is read as plain text`)); rec.type = n.type;
        if (n.odd) say(no, 'approximated', `${n.id}: ${n.odd} is read as a process`);
      } else if (n.fields) {
        for (const [k, v] of n.fields) {
          if (k === 'label') rec.label = mfText(v, () => say(no, 'approximated', `${n.id}: a Markdown string is read as plain text`));
          else if (k === 'shape') {
            const t = MF_SHAPES[v];
            rec.type = t || 'flow.Process';
            if (!t) say(no, 'approximated', `${n.id}: shape ${v} is read as a process`);
          } else say(no, 'skipped', `${n.id}: ${k} is not read`);
        }
      }
    }
    p.links.forEach((lk, k) => {
      const arrow = lk.arrow;
      if (arrow.startsWith('~')) { say(no, 'skipped', `${p.groups[k].map(n => n.id).join(' & ')} ~~~ ${p.groups[k + 1].map(n => n.id).join(' & ')}: an invisible link is not read`); return; }
      if (lk.id) edgeIds.add(lk.id);
      const label = lk.pipe !== undefined ? mfText(lk.pipe) : lk.text !== undefined ? mfText(lk.text) : undefined, head = arrow.at(-1), tail = arrow[0];
      const two = '<ox'.includes(tail), how = [...(arrow.includes('.') ? ['dotted'] : []), ...(arrow.includes('=') ? ['thick'] : []), ...('>ox'.includes(head) ? [] : ['no arrowhead']),
        ...(head === 'o' || tail === 'o' ? ['a circle end'] : []), ...(head === 'x' || tail === 'x' ? ['a cross end'] : []), ...(two ? ['an arrowhead at each end'] : [])];
      for (const a of p.groups[k]) for (const b of p.groups[k + 1]) {
        if (flows >= MF_FLOWS) { if (!over) { over = true; say(no, 'skipped', `over ${MF_FLOWS} links: the rest are not read`); } return; }
        flows++;
        if (how.length) say(no, 'approximated', `${a.id} ${lk.raw} ${b.id}: ${how.join(', ')}: read as ${two ? 'two flows' : 'a flow'}`);
        links.push({ from: a.id, to: b.id, label, no, hint: hint ?? lk.id, eid: hint == null && lk.id != null }); hint = null;
        if (two) links.push({ from: b.id, to: a.id, label, no });
      }
    });
  };
  // a hint applies to the statement directly below it; one that statement does not take is reported, not carried on
  const unused = () => { if (hint != null) say(hintNo, 'skipped', `%% id: ${hint}: the statement below it takes no id from it`); hint = null; };

  for (; i < lines.length; i++) {
    const no = i + 1, s = lines[i].trim();
    if (!s) continue;
    if (block) { if (s.includes('}')) block = false; continue; } // inside accDescr { ... }
    if (s.startsWith('%%')) {
      const c = s.slice(2).trim();
      if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!s.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      } else if (c.startsWith('id:')) { unused(); hint = c.slice(3).trim(); hintNo = no; }
      continue;
    }
    if (!started) {
      const h = /^(flowchart-elk|flowchart|graph)(?![\w-])\s*(TB|TD|BT|RL|LR)?\s*;?/.exec(s);
      if (!h) { say(no, 'skipped', 'not a Mermaid flowchart: nothing read'); return empty(); }
      started = true; viewId = hint; hint = null;
      if (viewId != null && mfId(viewId) !== viewId) { say(no, 'approximated', `%% id: ${viewId}: an id holds no "->", so the view is ${mfId(viewId)}`); viewId = mfId(viewId); }
      const d = h[2];
      if (d === 'LR') direction = 'right';
      else if (d === 'BT' || d === 'RL') { direction = d === 'BT' ? 'down' : 'right'; say(no, 'approximated', `direction ${d} is drawn ${direction === 'down' ? 'top to bottom' : 'left to right'}`); }
      for (const x of mfSplit(s.slice(h[0].length))) { statement(x, no); unused(); }
      continue;
    }
    for (const x of mfSplit(s)) { statement(x, no); unused(); }
  }
  unused();
  if (!started) { say(1, 'skipped', 'not a Mermaid flowchart: nothing read'); return empty(); }
  for (const sg of subs) say(sg.no, 'approximated', `subgraph ${sg.id} is never closed: read to the end`);

  // ids: nodes by their names first, a subgraph's id naming none (the importer's box); then the links in order
  const used = new Set(), next = new Map();
  const take = (h, base, no, what, how = '%% id:') => {
    if (h != null && h !== '') {
      const t = mfId(h);
      if (t !== h) say(no, 'approximated', `${how} ${h}: an id holds no "->", so it is ${t}`);
      if (!used.has(t)) { used.add(t); return t; }
      const id = mfFree(used, next, base); used.add(id);
      say(no, 'approximated', `${how} ${t} is taken, so ${what} is ${id}`);
      return id;
    }
    const id = mfFree(used, next, base); used.add(id);
    return id;
  };
  const out = [], idOf = new Map();
  for (const rec of nodes.values()) {
    if (closed.has(rec.name)) continue;
    const id = take(rec.hint, rec.name, rec.hintNo ?? rec.no, `node ${rec.name}`);
    if (rec.hint == null && id !== rec.name) say(rec.no, 'approximated', `node ${rec.name}: its name is another's id, so it is ${id}`);
    idOf.set(rec.name, id);
    out.push({ id, type: rec.type, label: rec.label });
  }
  const edges = [];
  for (const l of links) {
    const bad = [l.from, l.to].find(x => !idOf.has(x));
    if (bad) { say(l.no, 'skipped', `${l.from} --> ${l.to}: ${bad} is a subgraph, which is not read`); continue; }
    const from = idOf.get(l.from), to = idOf.get(l.to);
    const e = { id: take(l.hint, mfId(`${from}-${to}`), l.no, `${l.from} --> ${l.to}`, l.eid ? 'the edge id' : undefined), type: 'flow.Flow', from, to };
    if (l.label !== undefined) e.label = l.label;
    edges.push(e);
  }
  const view = { id: viewId || MF_VIEW, diagram: 'flowchart', ...(title ? { title } : {}), direction, nodeIds: out.map(n => n.id) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes: out, edges, views: [view] }, report };
}

function writeMermaidFlowchart(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), has = x => x != null && x !== '', str = x => typeof x === 'string';
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'flowchart');
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (!view) return '%% not written: the model, which has no flowchart view\n';
  if (view.diagram !== 'flowchart') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a flowchart one\n`;
  // text, always quoted: Mermaid's own characters as entity codes, a line break as <br>, a space at either end as an
  // entity, which the reader's trim keeps; # first, so no other text reads as a code
  const ent = c => `#${c.codePointAt(0)};`;
  const enc = s => `"${String(s).replace(/[#"|;<>\\`\r]/g, ent).replace(/\n/g, '<br>').replace(/^\s|\s$/g, ent)}"`; // \r too, so it reads back
  const okId = id => str(id) && id !== '' && id.trim() === id && !/[\r\n]/.test(id); // a hint keeps it
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const title = String(has(view.title) ? view.title : m.title ?? '');
  if (has(title)) out.push('---', `title: ${/^[\p{L}\p{N}][\p{L}\p{N} _.,()-]*$/u.test(title) && !title.endsWith(' ') ? title : JSON.stringify(title)}`, '---');
  if (has(view.id) && view.id !== MF_VIEW) { if (/[\r\n]/.test(view.id)) lose(view.id, "the view's id, which has a line break"); else out.push(`%% id: ${view.id}`); }
  out.push(`flowchart ${view.direction === 'right' ? 'LR' : 'TD'}`);

  const byId = new Map();
  for (const n of arr(m.nodes)) if (isObj(n) && !byId.has(n.id)) byId.set(n.id, n);
  const nodes = [], shown = new Set();
  for (const id of arr(view.nodeIds)) {
    const n = byId.get(id);
    if (!n || shown.has(id)) continue;
    shown.add(id);
    if (okId(n.id) && MF_WRITE[n.type]) nodes.push(n); else skip(n);
  }
  // names: an id Mermaid and the reader read as one name, else one made of it (and its id as a hint)
  const safe = id => MF_NAME.test(id) && !MF_WORDS.test(id);
  const names = new Map(), taken = new Set(nodes.map(n => n.id).filter(safe));
  for (const n of nodes) {
    if (safe(n.id)) { names.set(n.id, n.id); continue; }
    let base = n.id.replace(/[^\p{L}\p{N}_$]+/gu, '_').replace(/^_+|_+$/g, ''), name, k = 1;
    if (!safe(base)) base = 'N_' + base;
    for (name = base; taken.has(name); name = `${base}_${++k}`);
    taken.add(name); names.set(n.id, name);
  }
  for (const n of nodes) {
    const w = MF_WRITE[n.type], name = names.get(n.id);
    if (!str(n.label)) lose(n.id, has(n.label) ? 'its label, which is not text' : 'no label, read as an empty one');
    const label = enc(str(n.label) ? n.label : '');
    out.push(...(name !== n.id ? [`  %% id: ${n.id}`] : []), `  ${name}${typeof w === 'string' ? `@{ shape: ${w}, label: ${label} }` : w[0] + label + w[1]}`);
    for (const k of Object.keys(n)) if (!['id', 'type', 'label'].includes(k)) lose(n.id, k === 'props' || k === 'ext' ? `its ${k}` : `property ${k}`);
  }
  // the flows, each with its id when the reader would derive another (it derives them in this order, after the nodes)
  const isNode = new Set(nodes.map(n => n.id)), used = new Set(isNode), next = new Map(), seen = new Set();
  for (const e of arr(m.edges)) {
    if (!isObj(e) || seen.has(e.id) || !(shown.has(e.from) || shown.has(e.to))) continue;
    seen.add(e.id);
    if (e.type !== 'flow.Flow' || !isNode.has(e.from) || !isNode.has(e.to) || !okId(e.id) || used.has(e.id)) { skip(e); continue; }
    const d = mfFree(used, next, mfId(`${e.from}-${e.to}`));
    used.add(e.id);
    if (has(e.label) && !str(e.label)) lose(e.id, 'its label, which is not text');
    out.push(...(d !== e.id ? [`  %% id: ${e.id}`] : []), `  ${names.get(e.from)} -->${str(e.label) ? `|${enc(e.label)}|` : ''} ${names.get(e.to)}`);
    for (const k of Object.keys(e)) if (!['id', 'type', 'from', 'to', 'label'].includes(k)) lose(e.id, k === 'props' || k === 'ext' ? `its ${k}` : `property ${k}`);
  }
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  return out.join('\n') + '\n';
}

export { readMermaidFlowchart, writeMermaidFlowchart };
