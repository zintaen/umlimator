/* ---------- Mermaid requirementDiagram: a reader and a writer (notes/milestone-3.md §12, M3.6; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's requirement diagram page (docs/syntax/requirementDiagram.md, read 14 Nov 2026), as the
   other readers are against theirs. Internal: the CLI (`umlimator.py import`) imports this file through Node; a host gets it
   once the registry is public. Its helpers are its own (mq...), since the readers share one scope in lib/umlimator-all.js.

   readMermaidRequirement(text) -> { model, report }: a version-2 model with one `sysml.requirement` view, `requirements`,
   listing every element, in model.md row 16's vocabulary, and a report of what was not read as written, each item { line,
   status, message }, status `skipped` or `approximated` (R1). The reader is hand-written and linear, one pass over the
   lines and no regular expression with nested repetition, and refuses text over MQ_LIMIT characters (R2). Ids come from
   the source's names (R3): the name itself when it is an id (letters, digits, _ . -), else a slug of it; when that is taken,
   the next free of base-2, base-3 ...; a relationship <from>-<kind>-<to>. `%% id: <id>` above a definition, a relationship
   or `requirementDiagram` gives that element (or the view) its id instead, before any id is derived; `%% name: <JSON>` and
   `%% text: <JSON>` above a definition give its label and its text, which Mermaid's quotes cannot hold whole. The comments
   are untrusted: a bad one is reported and not applied. Every lookup table is a Map or a Set, so `__proto__` and
   `constructor` are ordinary names. It never throws.

   writeMermaidRequirement(model, viewId?) -> text: one sysml.requirement view as Mermaid. What Mermaid cannot carry is kept
   in the comments above, and what the subset leaves out is named as `%% not written: <id> (<type>)` or `%% not written:
   <id>: <what>` (a comment and its link, a package, a parent that is not written).

   How the requirement diagram maps onto Mermaid's text, both ways (§12.1):
   - `requirement name { id: …, text: …, risk: …, verifymethod: … }` and its five other kinds a sysml.Requirement, a kind
     other than `requirement` stored as its stereotype; risk and verify method lowercased when they are Mermaid's words,
     else kept as written and reported;
   - `element name { type: …, docref: … }` a sysml.TestCase when its type starts `test` (case ignored), else a sysml.Block;
     the type (but Block and TestCase) and docref kept under ext.mermaid, reported once;
   - `a - contains -> b` (or `b <- contains - a`) b's parent a; a second container, or one that would close a cycle (one
     colouring pass after reading), skipped; the six other relationships edges from the arrow's tail to its head, skipped
     when their ends break the requirement type's errors (notes/milestone-3.md §6.3), so every import passes check.mjs;
   - `direction TB` down, `LR` right (none: unset, Mermaid's TB); BT and RL approximated; styling skipped, once per kind;
     quoted names and text kept as written, Markdown and all (reported once). */
const MQ_LIMIT = 1 << 20; // characters; a requirement diagram a person writes is a few kilobytes
const MQ_VIEW = 'requirements'; // the view's id when the source does not name it
const MQ_DIAGRAM = 'sysml.requirement';
const MQ_KINDS = new Map(['requirement', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint'].map(k => [k.toLowerCase(), k]));
const MQ_TYPE = new Map([['contains', ''], ['copies', 'sysml.Copy'], ['derives', 'sysml.DeriveReqt'], ['satisfies', 'sysml.Satisfy'], ['verifies', 'sysml.Verify'], ['refines', 'sysml.Refine'], ['traces', 'sysml.Trace']]);
const MQ_WORD = new Map([...MQ_TYPE].filter(([, t]) => t).map(([w, t]) => [t, w])); // the writer's word for each edge type
const MQ_FIELDS = { requirement: ['id', 'text', 'risk', 'verifymethod'], element: ['type', 'docref'] };
const MQ_RISK = ['low', 'medium', 'high'], MQ_METHOD = ['analysis', 'inspection', 'test', 'demonstration'];
const MQ_SHOWN = ['sysml.Requirement', 'sysml.Block', 'sysml.TestCase'];
// the words of Mermaid's grammar: the writer writes no bare name that is one
const MQ_WORDS = new Set([...MQ_KINDS.keys(), ...MQ_TYPE.keys(), ...MQ_FIELDS.requirement, ...MQ_FIELDS.element, ...MQ_RISK, ...MQ_METHOD,
  'element', 'style', 'classdef', 'class', 'direction', 'requirementdiagram', 'acctitle', 'accdescr']);
// the rules of notes/milestone-3.md §6.3 a relationship's ends can break as errors: its word, the rule, what it says, the test
const MQ_REQ = r => r.kind === 'requirement';
const MQ_RULE = new Map([['derives', ['derive-ends', 'a deriveReqt runs from a requirement to a requirement', (a, b) => MQ_REQ(a) && MQ_REQ(b)]],
  ['copies', ['copy-ends', 'a copy runs from a requirement to a requirement', (a, b) => MQ_REQ(a) && MQ_REQ(b)]],
  ['satisfies', ['satisfy-ends', 'a satisfy runs to a requirement', (a, b) => MQ_REQ(b)]], ['verifies', ['verify-ends', 'a verify runs to a requirement', (a, b) => MQ_REQ(b)]],
  ['contains', ['requirement-nested', 'what a requirement contains is a requirement', (a, b) => !MQ_REQ(a) || MQ_REQ(b)]]]);
const mqSkip = (s, k) => { while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++; return k; };
const mqShort = s => (s.length > 60 ? s.slice(0, 57) + '...' : s);
const mqMarkdown = s => /\*\*|__|`|(?:^|\s)[*_]\S/.test(s); // emphasis or code: reported once, kept as written
// the id a name gives: the name when it is one, else a slug of it
const mqWant = name => (/^[\p{L}\p{N}_.-]+$/u.test(name) ? name : name.replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'element');
// a name Mermaid reads bare: a word of letters, digits, _ and ., not one of its grammar's
const mqBare = name => /^\w[\w.]*$/.test(name) && !MQ_WORDS.has(name.toLowerCase());

// the first of base, base-2, base-3 ... not in used, resuming where the last ask for base stopped (R2)
function mqFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// a name at k: "in quotes" (not empty), or bare up to one of { < > - = or ::: (Mermaid's unqString), trimmed: { text, end, quoted }
function mqName(s, k) {
  if (s[k] === '"') { const e = s.indexOf('"', k + 1); return e > k + 1 ? { text: s.slice(k + 1, e), end: e + 1, quoted: true } : null; }
  let e = k;
  while (e < s.length && !'{<>-='.includes(s[e]) && !(s[e] === ':' && s.startsWith(':::', e))) e++;
  const t = s.slice(k, e).trim();
  return t ? { text: t, end: e } : null;
}

function readMermaidRequirement(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: MQ_VIEW, nodes: [], edges: [], views: [{ id: MQ_VIEW, diagram: MQ_DIAGRAM, nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MQ_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MQ_LIMIT}: nothing read`); return empty(); }
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0, title;

  // front matter: its title; Mermaid's configuration is not read
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && lines[i].trim().replace(/^﻿/, '') === '---') {
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

  const defs = new Map(), list = [], rels = [], once = new Set();
  let started = false, viewHint = {}, direction, hint = null, block = null, acc = false;
  const sayOnce = (key, no, status, message) => { if (!once.has(key)) { once.add(key); say(no, status, message); } };
  const markdown = (s, no) => { if (mqMarkdown(s)) sayOnce('md', no, 'approximated', 'Markdown in quoted text is kept as written, its marks and all'); };
  // the hints above a statement it does not take: reported, not applied
  const WHAT = { id: 'definition or relationship', name: 'definition', text: 'requirement' };
  const leftover = (h, keep) => { for (const k of ['id', 'name', 'text']) if (h[k] !== undefined && !keep.includes(k)) say(h[k + 'No'], 'skipped', `%% ${k}: ${mqShort(h[k])} is above no ${WHAT[k]}: not read`); };
  // %% name: and %% text: hold a JSON string
  const json = (raw, no, what) => {
    let v;
    try { v = JSON.parse(raw); } catch { /* reported below */ }
    if (typeof v === 'string') return v;
    say(no, 'skipped', `%% ${what}: ${mqShort(raw)} is not a JSON string: ${what === 'text' ? "the field's own text" : 'the name'} is kept`);
  };
  const notRead = (t, no) => say(no, 'skipped', `"${mqShort(t)}" is not understood`);

  // a line in a definition's block: a field, or its }
  const field = (t, no) => {
    if (t === '}') { block = null; return; }
    if (block.skip) return;
    const c = t.indexOf(':'), key = c < 0 ? '' : t.slice(0, c).trim().toLowerCase();
    if (!MQ_FIELDS[block.kind].includes(key)) { say(no, 'skipped', `"${mqShort(t)}" in ${block.name}'s block is not a field of ${block.kind === 'element' ? 'an element' : 'a requirement'}`); return; }
    let v = t.slice(c + 1).trim();
    if (v.length > 1 && v[0] === '"' && v.endsWith('"')) { v = v.slice(1, -1); markdown(v, no); }
    if (block.f.has(key)) say(no, 'approximated', `${block.name}'s ${key} is given twice: the last is kept`);
    block.f.set(key, [v, no]);
  };

  // one statement: a definition, a relationship, a direction, styling or accessibility text
  const statement = (t, no, h) => {
    const word = /^[A-Za-z]+/.exec(t), w = word ? word[0].toLowerCase() : '', after = word ? t[word[0].length] : '';
    const d = /^direction\s+(TB|BT|LR|RL)$/i.exec(t);
    if (d) {
      const v = d[1].toUpperCase();
      direction = v === 'TB' || v === 'BT' ? 'down' : 'right';
      if (v === 'BT' || v === 'RL') say(no, 'approximated', `direction ${v} is drawn ${direction === 'down' ? 'top to bottom' : 'left to right'}`);
      return leftover(h, []);
    }
    const a11y = /^(accTitle|accDescr)\s*([:{])/i.exec(t);
    if (a11y) {
      say(no, 'skipped', `${a11y[1]}: accessibility text is not read`);
      if (a11y[2] === '{' && !t.includes('}')) acc = true;
      return leftover(h, []);
    }
    if ((w === 'style' || w === 'classdef' || w === 'class') && /\s/.test(after || '')) {
      sayOnce(w, no, 'skipped', `${word[0]}: styling is not read`);
      return leftover(h, []);
    }
    const style = (k, name) => { // :::a,b after a name: styling, skipped; where reading goes on
      if (!t.startsWith(':::', k)) return k;
      let e = k + 3;
      while (e < t.length && !/[\s{]/.test(t[e])) e++;
      sayOnce(':::', no, 'skipped', `${t.slice(k, e)} on ${name}: styling is not read`);
      return mqSkip(t, e);
    };
    if (word && t.endsWith('{') && /\s/.test(after || '')) { // a definition: kind name [:::class] {
      const n = mqName(t, mqSkip(t, word[0].length)), kind = w === 'element' ? 'element' : MQ_KINDS.has(w) ? 'requirement' : null;
      block = { skip: true, no, name: n ? n.text : t };
      if (!n || style(mqSkip(t, n.end), n.text) !== t.length - 1) { notRead(t, no); return leftover(h, []); }
      if (!kind) { say(no, 'skipped', `${word[0]} ${n.text}: ${word[0]} is no kind of Mermaid's requirement diagram: its block is not read`); return leftover(h, []); }
      if (defs.has(n.text)) { say(no, 'skipped', `${n.text} is defined twice: the first (line ${defs.get(n.text).no}) is kept`); return leftover(h, []); }
      const r = { name: n.text, kind, word: kind === 'element' ? 'element' : MQ_KINDS.get(w), no, f: new Map() };
      if (n.quoted) markdown(n.text, no);
      if (h.id !== undefined) { r.hint = h.id; r.hintNo = h.idNo; }
      if (h.name !== undefined) r.label = json(h.name, h.nameNo, 'name');
      if (h.text !== undefined && kind === 'requirement') r.text = json(h.text, h.textNo, 'text');
      leftover(h, kind === 'requirement' ? ['id', 'name', 'text'] : ['id', 'name']);
      defs.set(r.name, r); list.push(r); block = r;
      return;
    }
    // a relationship, a - kind -> b or b <- kind - a; or a name and its classes
    const a = mqName(t, 0);
    if (!a) { notRead(t, no); return leftover(h, []); }
    let k = mqSkip(t, a.end);
    if (t.startsWith(':::', k)) { if (style(k, a.text) !== t.length) notRead(t, no); return leftover(h, []); }
    const back = t.startsWith('<-', k);
    if (!back && t[k] !== '-') { notRead(t, no); return leftover(h, []); }
    k = mqSkip(t, k + (back ? 2 : 1));
    const kw = /[A-Za-z]+/y;
    kw.lastIndex = k;
    const rw = kw.exec(t);
    if (rw) k = mqSkip(t, k + rw[0].length);
    const arrow = back ? '-' : '->';
    const b = rw && t.startsWith(arrow, k) ? mqName(t, mqSkip(t, k + arrow.length)) : null;
    if (!b || mqSkip(t, b.end) !== t.length) { notRead(t, no); return leftover(h, []); }
    const kind = rw[0].toLowerCase();
    if (!MQ_TYPE.has(kind)) { say(no, 'skipped', `${rw[0]}: no relationship of Mermaid's requirement diagram is called that`); return leftover(h, []); }
    if (a.quoted) markdown(a.text, no);
    if (b.quoted) markdown(b.text, no);
    rels.push({ from: back ? b.text : a.text, to: back ? a.text : b.text, kind, no, hint: h.id, hintNo: h.idNo });
    leftover(h, ['id']);
  };

  for (; i < lines.length; i++) {
    const no = i + 1, t = lines[i].trim();
    if (!t) continue;
    if (acc) { if (t.includes('}')) acc = false; continue; }
    if (t.startsWith('%%')) {
      const c = t.slice(2).trim(), m = /^(id|name|text):/.exec(c);
      if (c.startsWith('{')) {
        say(no, 'skipped', "a %%{init}%% directive: Mermaid's configuration is not read");
        if (!t.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      } else if (m) { hint ??= {}; hint[m[1]] = c.slice(m[0].length).trim(); hint[m[1] + 'No'] = no; }
      continue;
    }
    const h = hint || {};
    hint = null;
    if (!started) {
      if (!/^﻿?requirementDiagram$/i.test(t)) { say(no, 'skipped', 'not a Mermaid requirementDiagram: nothing read'); return empty(); }
      started = true; viewHint = h; leftover(h, ['id']); continue;
    }
    if (block) { leftover(h, []); field(t, no); } else statement(t, no, h);
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid requirementDiagram: nothing read'); return empty(); }
  if (block) say(lines.length, 'approximated', `${block.name}'s { (line ${block.no}) is never closed: read to the end`);
  if (hint) leftover(hint, []);

  // fields as props
  for (const r of list) {
    const f = key => (r.f.has(key) ? r.f.get(key)[0] : undefined), at = key => r.f.get(key)[1];
    r.props = {};
    if (r.kind === 'requirement') {
      r.type = 'sysml.Requirement';
      if (f('id') !== undefined) r.props.reqId = f('id');
      if (r.text !== undefined) r.props.text = r.text; else if (f('text') !== undefined) r.props.text = f('text');
      for (const [key, prop, words] of [['risk', 'risk', MQ_RISK], ['verifymethod', 'verifyMethod', MQ_METHOD]]) {
        const v = f(key);
        if (v === undefined) continue;
        if (words.includes(v.toLowerCase())) { r.props[prop] = v.toLowerCase(); continue; }
        r.props[prop] = v;
        say(at(key), 'approximated', `${r.name}'s ${key} ${mqShort(v)} is none of ${words.join(', ')}: kept as written`);
      }
      if (r.word !== 'requirement') r.props.stereotypes = [r.word];
    } else {
      const ty = f('type'), me = {};
      r.type = ty !== undefined && ty.toLowerCase().startsWith('test') ? 'sysml.TestCase' : 'sysml.Block';
      if (ty !== undefined && ty !== 'Block' && ty !== 'TestCase') me.type = ty;
      if (f('docref') !== undefined) me.docref = f('docref');
      if (Object.keys(me).length) {
        r.ext = { mermaid: me };
        sayOnce('ext', r.no, 'approximated', `${r.name}: an element's type and docref are kept under ext.mermaid and not drawn, as every other element's`);
      }
    }
  }

  // relationships: both ends defined, and not breaking the type's errors; a contains is a parent, one per element
  const edges0 = [];
  for (const r of rels) {
    const says = `${r.from} - ${r.kind} -> ${r.to}`, a = defs.get(r.from), b = defs.get(r.to), rule = MQ_RULE.get(r.kind);
    if (!a || !b) { say(r.no, 'skipped', `${says}: ${!a ? r.from : r.to} is not defined`); continue; }
    if (rule && !rule[2](a, b)) { say(r.no, 'skipped', `${says}: ${rule[1]} (${rule[0]})`); continue; }
    if (r.kind === 'copies' && a.props.text !== b.props.text) say(r.no, 'approximated', `${says}: ${r.from}'s text is not ${r.to}'s, which a copy's client has (copy-text): read as written`);
    if (r.kind !== 'contains') { r.a = a; r.b = b; edges0.push(r); continue; }
    if (r.hint !== undefined) say(r.hintNo, 'skipped', `%% id: ${mqShort(r.hint)} is above a contains, which is a parent, not an element: not read`);
    if (b.owner) say(r.no, 'skipped', `${says}: ${r.to} is contained by ${b.owner.name} already, and an element has one owner`);
    else { b.owner = a; b.ownNo = r.no; }
  }
  // a containment that closes a cycle: one colouring pass over the owner links (white, grey on the walk, black done), each
  // cycle losing its last contains in the file: linear, with no recursion
  const colour = new Map();
  for (const r of list) {
    const path = [];
    let x = r;
    while (x && !colour.has(x)) { colour.set(x, 1); path.push(x); x = x.owner; }
    if (x && colour.get(x) === 1) {
      let last = x;
      for (let k = path.indexOf(x); k < path.length; k++) if (path[k].ownNo > last.ownNo) last = path[k];
      say(last.ownNo, 'skipped', `${last.owner.name} - contains -> ${last.name}: it would close a cycle of containment`);
      last.owner = null;
    }
    for (const p of path) colour.set(p, 2);
  }

  // ids: the hints first, each one valid and free; then each definition's name, each relationship's ends and kind
  const used = new Set(), next = new Map();
  const hinted = (x, what) => {
    if (x.hint === undefined) return;
    const bad = x.hint === '' || x.hint.includes('->');
    if (bad || used.has(x.hint)) say(x.hintNo, 'skipped', `%% id: ${mqShort(x.hint)} ${bad ? 'breaks the id rule (not empty, no "->")' : 'is taken'}: ${what} takes its own`);
    else { x.id = x.hint; used.add(x.id); }
  };
  for (const r of list) hinted(r, r.name);
  for (const e of edges0) hinted(e, `${e.from} - ${e.kind} -> ${e.to}`);
  for (const r of list) if (r.id === undefined) { r.id = mqFree(used, next, mqWant(r.name)); used.add(r.id); }
  for (const e of edges0) if (e.id === undefined) { e.id = mqFree(used, next, `${e.a.id}-${e.kind}-${e.b.id}`); used.add(e.id); }

  const nodes = list.map(r => ({ id: r.id, type: r.type, label: r.label ?? r.name, ...(r.owner ? { parent: r.owner.id } : {}),
    ...(Object.keys(r.props).length ? { props: r.props } : {}), ...(r.ext ? { ext: r.ext } : {}) }));
  const edges = edges0.map(e => ({ id: e.id, type: MQ_TYPE.get(e.kind), from: e.a.id, to: e.b.id }));
  let vid = MQ_VIEW;
  if (viewHint.id !== undefined) {
    if (viewHint.id !== '' && !viewHint.id.includes('->')) vid = viewHint.id;
    else say(viewHint.idNo, 'skipped', `%% id: ${mqShort(viewHint.id)} breaks the id rule (not empty, no "->"): the view is ${MQ_VIEW}`);
  }
  const view = { id: vid, diagram: MQ_DIAGRAM, ...(title ? { title } : {}), ...(direction ? { direction } : {}), nodeIds: nodes.map(n => n.id) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges, views: [view] }, report };
}

function writeMermaidRequirement(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), nl = s => /[\r\n]/.test(String(s)); // a comment is one line
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === MQ_DIAGRAM);
  // a model with views is written through its requirement view; one with none, whole
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (views.length && !view) return `%% not written: the model, which has no ${MQ_DIAGRAM} view\n`;
  if (view && view.diagram !== MQ_DIAGRAM) return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a ${MQ_DIAGRAM} one\n`;
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const once = (seen, id) => { if (!seen.has(id)) return seen.add(id); lose(id, 'listed twice in the view, written once'); return false; };
  const seenNodes = new Set(), shown = (view ? arr(view.nodeIds) : [...byId.keys()]).filter(id => byId.has(id) && once(seenNodes, id));
  // an id the reader keeps as a hint: a string of one line, trimmed (as a hint is read), not empty, with no ->
  const keeps = id => typeof id === 'string' && id !== '' && !nl(id) && id.trim() === id && !id.includes('->');
  // the keys and props Mermaid has a place for; any other is named
  const extra = (x, keys, props = []) => {
    for (const k of Object.keys(x)) if (!keys.includes(k)) {
      if (k === 'props' && isObj(x.props)) { for (const p of Object.keys(x.props)) if (!props.includes(p)) lose(x.id, `property ${p}`); }
      else lose(x.id, k);
    }
  };
  // a field's value: bare when Mermaid's unquoted string reads it (a word character first), else in quotes; one holding a
  // quote or a line break, or empty (Mermaid's quotes hold no empty string), is not written
  const value = (id, what, v) => {
    if (v === '') { lose(id, `${what} "", which Mermaid cannot write empty`); return null; }
    if (typeof v === 'string' && !nl(v) && !v.includes('"')) return /^\w[\w./]*$/.test(v) ? v : `"${v}"`;
    lose(id, `${what} ${v}, which Mermaid's quotes cannot hold`);
    return null;
  };
  const title = view && view.title != null && view.title !== '' ? view.title : m.title;
  // as it is only when YAML reads it as text: a letter first, and not one of YAML's null or boolean words
  const plain = t => /^\p{L}[\p{L}\p{N} _.,()-]*$/u.test(t) && !t.endsWith(' ') && !/^(null|true|false|yes|no|on|off|y|n)$/i.test(t);
  if (m.title != null && m.title !== title) notWritten.push(`the model's title ${flat(m.title)}, read back as the view's`);
  if (m.root != null && m.root !== (view ? view.id : MQ_VIEW)) notWritten.push(`the model's root ${flat(m.root)}, read back as the view's id`);
  if (title != null && title !== '') out.push('---', `title: ${plain(title) ? title : JSON.stringify(String(title))}`, '---');
  if (view && view.id !== MQ_VIEW) { if (keeps(view.id)) out.push(`%% id: ${view.id}`); else lose(view.id, "the view's id, which the reader would not keep"); }
  out.push('requirementDiagram');
  if (view && view.direction != null) {
    const d = view.direction === 'down' ? 'TB' : view.direction === 'right' ? 'LR' : null; // no table: "constructor" is no direction
    if (!d) lose(view.id, `direction ${view.direction}: written as Mermaid's TB`);
    out.push(`  direction ${d || 'TB'}`);
  }

  // each element's name: its label with what Mermaid's quotes cannot hold taken out, made unique; the label whole in %% name:
  const nodes = shown.map(id => byId.get(id)).filter(n => { const ok = MQ_SHOWN.includes(n.type) && keeps(n.id); if (!ok) skip(n); return ok; });
  const names = new Map(), taken = new Set(), made = new Map();
  for (const n of nodes) {
    let name = (typeof n.label === 'string' ? n.label : n.id).replace(/["\r\n]/g, '') || 'element';
    if (taken.has(name)) name = mqFree(taken, made, name);
    taken.add(name);
    names.set(n.id, name);
  }
  const tok = id => { const name = names.get(id); return mqBare(name) ? name : `"${name}"`; };
  for (const n of nodes) {
    const name = names.get(n.id), p = isObj(n.props) ? n.props : {}, req = n.type === 'sysml.Requirement', head = [], body = [];
    if (n.id !== mqWant(name)) head.push(`%% id: ${n.id}`);
    if (typeof n.label !== 'string') lose(n.id, n.label == null ? 'no label, read as its name' : `label ${n.label}, which is not text`);
    else if (n.label !== name) head.push(`%% name: ${JSON.stringify(n.label)}`);
    if (isObj(n.props) && !Object.keys(n.props).length) lose(n.id, 'props, which are empty');
    if (Array.isArray(p.stereotypes) && !p.stereotypes.length) lose(n.id, 'stereotypes, an empty list');
    extra(n, ['id', 'type', 'label', 'parent', ...(req ? [] : ['ext'])], req ? ['reqId', 'text', 'risk', 'verifyMethod', 'stereotypes'] : []);
    let word = 'element';
    if (req) {
      const kinds = arr(p.stereotypes).filter(s => MQ_KINDS.get(String(s).toLowerCase()) === s && s !== 'requirement');
      word = kinds[0] || 'requirement';
      for (const s of arr(p.stereotypes)) if (s !== kinds[0]) lose(n.id, `stereotype ${s}`);
      if (p.stereotypes !== undefined && !Array.isArray(p.stereotypes)) lose(n.id, 'stereotypes, which are not a list');
      if (p.reqId !== undefined) { const v = value(n.id, 'reqId', p.reqId); if (v !== null) body.push(`id: ${v}`); }
      if (typeof p.text === 'string') {
        const clean = p.text.replace(/["\r\n]/g, '');
        if (clean !== p.text || clean === '') head.push(`%% text: ${JSON.stringify(p.text)}`);
        if (clean !== '') body.push(`text: "${clean}"`); // Mermaid's quotes hold no empty string: %% text: carries it
      } else if (p.text !== undefined) lose(n.id, `text ${p.text}, which is not text`);
      for (const [prop, key, words] of [['risk', 'risk', MQ_RISK], ['verifyMethod', 'verifymethod', MQ_METHOD]]) if (p[prop] !== undefined) {
        if (words.includes(p[prop])) body.push(`${key}: ${p[prop]}`); else lose(n.id, `${prop} ${p[prop]}, which is none of Mermaid's ${words.join(', ')}`);
      }
    } else {
      // the type: ext.mermaid's when the reader reads it back as this element's kind, else Block or TestCase
      const ext = isObj(n.ext) ? n.ext : {}, me = isObj(ext.mermaid) ? ext.mermaid : {}, test = n.type === 'sysml.TestCase', t = me.type;
      if (Object.keys(ext).some(k => k !== 'mermaid') || Object.keys(me).some(k => k !== 'type' && k !== 'docref')) lose(n.id, 'ext, but for ext.mermaid.type and docref');
      const kind = typeof t === 'string' && t.trim() === t && t !== '' && t.toLowerCase().startsWith('test') === test, fits = kind && t !== 'Block' && t !== 'TestCase';
      if (kind && !fits) lose(n.id, `ext.mermaid.type ${t}, which the reader reads back as none`);
      else if (t !== undefined && !fits) lose(n.id, `ext.mermaid.type ${t}, which the reader would not read back as a ${test ? 'test case' : 'block'}`);
      const v = fits ? value(n.id, 'ext.mermaid.type', t) : null;
      body.push(`type: ${v ?? (test ? 'TestCase' : 'Block')}`);
      if (me.docref !== undefined) { const d = typeof me.docref === 'string' && me.docref.trim() === me.docref ? value(n.id, 'ext.mermaid.docref', me.docref) : (lose(n.id, `ext.mermaid.docref ${me.docref}`), null); if (d !== null) body.push(`docref: ${d}`); }
    }
    out.push(...head.map(l => '  ' + l), `  ${word} ${tok(n.id)} {`, ...body.map(l => '    ' + l), '  }');
  }
  // containment: each written element's parent, when it is written
  for (const n of nodes) if (n.parent != null) {
    if (names.has(n.parent)) out.push(`  ${tok(n.parent)} - contains -> ${tok(n.id)}`);
    else lose(n.id, `parent ${n.parent}, which is not written`);
  }

  const byEdge = new Map();
  for (const x of arr(m.edges)) if (isObj(x) && !byEdge.has(x.id)) byEdge.set(x.id, x); // the first of an id, as find gave
  const edgeOf = e => (typeof e === 'string' ? byEdge.get(e) : e);
  const listed = view && Array.isArray(view.edges);
  const lines = (listed ? view.edges.map(edgeOf) : arr(m.edges).filter(e => isObj(e) && seenNodes.has(e.from) && seenNodes.has(e.to))).filter(isObj);
  const seenEdges = new Set();
  for (const e of lines) {
    if (listed && !once(seenEdges, e.id)) continue;
    const word = MQ_WORD.get(e.type);
    if (!word || !keeps(e.id) || !names.has(e.from) || !names.has(e.to)) { skip(e); continue; }
    extra(e, ['id', 'type', 'from', 'to']);
    if (e.id !== `${e.from}-${word}-${e.to}`) out.push(`  %% id: ${e.id}`);
    out.push(`  ${tok(e.from)} - ${word} -> ${tok(e.to)}`);
  }
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  return out.join('\n') + '\n';
}

export { readMermaidRequirement, writeMermaidRequirement };
