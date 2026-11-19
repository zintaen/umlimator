import { unreadable, jsonText } from '../core/model.js';
import { mermaidFrontTitle, mermaidClip, mermaidChar, mermaidBadChar, mermaidSay, mermaidSort, mermaidText, mermaidScrub } from './mermaid-front.js';
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
   <id>: <what>` (a comment and its link, a package, a parent that is not written, a relationship or a containment whose
   ends the reader refuses, audit 34, a containment that would close a cycle, audit 35).

   How the requirement diagram maps onto Mermaid's text, both ways (§12.1):
   - `requirement name { id: …, text: …, risk: …, verifymethod: … }` and its five other kinds a sysml.Requirement, a kind
     other than `requirement` stored as its stereotype; risk and verify method lowercased when they are Mermaid's words,
     else kept as written and reported;
   - `element name { type: …, docref: … }` a sysml.TestCase when its type starts `test` (case ignored), else a sysml.Block;
     the type (but Block and TestCase) and docref kept under ext.mermaid, reported once;
   - `a - contains -> b` (or `b <- contains - a`) b's parent a; a second container, or one that would close a cycle (one
     colouring pass after reading), skipped; the six other relationships edges from the arrow's tail to its head, skipped
     when their ends break the requirement type's errors (notes/milestone-3.md §6.3), so an import passes check.mjs but for
     one: a copy between requirements whose texts differ is read as written, reported, and left to check's copy-text error;
   - `direction TB` down, `LR` right (none: unset, Mermaid's TB); BT and RL approximated; styling skipped, once per kind;
     quoted names and text kept as written, Markdown and all (reported once), but for Mermaid's entity codes (#quot; #lt;
     #gt; #amp; #35;), which a name or a field's value reads as their characters, as Mermaid draws them and the other
     Mermaid readers read them (audit 48); a code naming a character XML cannot hold is U+FFFD, said. The writer writes a #
     that would read as a code as #35;. */
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
const mqShort = mermaidClip;
const mqMarkdown = s => /\*\*|__|`|(?:^|\s)[*_]\S/.test(s); // emphasis or code: reported once, kept as written
// Mermaid's entity codes in a name or a field's value as their characters; a code naming none XML holds as U+FFFD, bad(code) told
const MQ_CODE = /#(quot|lt|gt|amp|\d{1,6});/g;
const mqText = (s, bad) => s.replace(MQ_CODE, (all, e) => ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? mermaidChar(Number(e), all, bad));
// a # the reader would read as the start of a code, written as #35; (audit 48)
const mqCode = s => s.replace(/#(?=(?:quot|lt|gt|amp|\d{1,6});)/g, '#35;');
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

// a name at k: "in quotes" (not empty), or bare up to one of { < > - = or ::: (Mermaid's unqString), trimmed: { text, end,
// quoted }, its text through decode (its entity codes read) when one is given
function mqName(s, k, decode = x => x) {
  if (s[k] === '"') { const e = s.indexOf('"', k + 1); return e > k + 1 ? { text: decode(s.slice(k + 1, e)), end: e + 1, quoted: true } : null; }
  let e = k;
  while (e < s.length && !'{<>-='.includes(s[e]) && !(s[e] === ':' && s.startsWith(':::', e))) e++;
  const t = s.slice(k, e).trim();
  return t ? { text: decode(t), end: e } : null;
}

function readMermaidRequirement(text) {
  const report = [], say = mermaidSay(report);
  const empty = () => ({ model: { schemaVersion: 2, root: MQ_VIEW, nodes: [], edges: [], views: [{ id: MQ_VIEW, diagram: MQ_DIAGRAM, nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MQ_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MQ_LIMIT}: nothing read`); return empty(); }
  text = mermaidScrub(text, say); // a raw character XML cannot hold as U+FFFD, said (audit 48)
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
        const ft = mermaidFrontTitle(lines, j); // a comment after it is not the title (audit 24); over its lines (audit 25)
        title = ft.title;
        if (ft.rest) say(j + 1, 'skipped', `front matter title: ${ft.rest}, after the quoted title, is not read`);
        j = ft.end;
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
  const decode = (s, no) => mqText(s, code => say(no, 'approximated', mermaidBadChar(code)));

  // a line in a definition's block: a field, or its }
  const field = (t, no) => {
    if (t === '}') { block = null; return; }
    if (block.skip) return;
    const c = t.indexOf(':'), key = c < 0 ? '' : t.slice(0, c).trim().toLowerCase();
    if (!MQ_FIELDS[block.kind].includes(key)) { say(no, 'skipped', `"${mqShort(t)}" in ${block.name}'s block is not a field of ${block.kind === 'element' ? 'an element' : 'a requirement'}`); return; }
    let v = t.slice(c + 1).trim();
    if (v.length > 1 && v[0] === '"' && v.endsWith('"')) { v = v.slice(1, -1); markdown(v, no); }
    v = decode(v, no);
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
      const n = mqName(t, mqSkip(t, word[0].length), s => decode(s, no)), kind = w === 'element' ? 'element' : MQ_KINDS.has(w) ? 'requirement' : null;
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
    const a = mqName(t, 0, s => decode(s, no));
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
    const b = rw && t.startsWith(arrow, k) ? mqName(t, mqSkip(t, k + arrow.length), s => decode(s, no)) : null;
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

  // relationships: both ends defined, and not breaking the type's errors; a contains is a parent, one per element. A contains
  // that would close a cycle (its container's topmost owner is the element, which has none yet) is skipped as it is met, so a
  // later contains of the same element is still read, and a report never names an owner the model drops (audit 36). The
  // topmost owner by union-find (up links, halved as they are walked): near linear, with no recursion
  const edges0 = [];
  const top = x => { while (x.up) { if (x.up.up) x.up = x.up.up; x = x.up; } return x; };
  for (const r of rels) {
    const says = `${r.from} - ${r.kind} -> ${r.to}`, a = defs.get(r.from), b = defs.get(r.to), rule = MQ_RULE.get(r.kind);
    if (!a || !b) { say(r.no, 'skipped', `${says}: ${!a ? r.from : r.to} is not defined`); continue; }
    if (rule && !rule[2](a, b)) { say(r.no, 'skipped', `${says}: ${rule[1]} (${rule[0]})`); continue; }
    if (r.kind === 'copies' && a.props.text !== b.props.text) say(r.no, 'approximated', `${says}: ${r.from}'s text is not ${r.to}'s, which a copy's client has (copy-text): read as written`);
    if (r.kind !== 'contains') { r.a = a; r.b = b; edges0.push(r); continue; }
    if (r.hint !== undefined) say(r.hintNo, 'skipped', `%% id: ${mqShort(r.hint)} is above a contains, which is a parent, not an element: not read`);
    if (b.owner) say(r.no, 'skipped', `${says}: ${r.to} is contained by ${b.owner.name} already, and an element has one owner`);
    else if (top(a) === b) say(r.no, 'skipped', `${says}: it would close a cycle of containment`);
    else { b.owner = a; b.up = a; }
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
  mermaidSort(report); // by line, stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges, views: [view] }, report };
}

function writeMermaidRequirement(model, viewId) {
  // the model as validate() reads it: a value String() throws on (JSON's {"toString":1}) left out (audit 23)
  model = unreadable(model).model;
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  // text of any value: an object whose toString is no function (JSON's {"toString":1}) gives its tag, not a throw (audit 23)
  const txt = s => { try { return String(s); } catch { return Object.prototype.toString.call(s); } };
  const flat = s => txt(s).replace(/\r\n|\r|\n/g, '\\n'), nl = s => /[\r\n]/.test(txt(s)); // a comment is one line
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === MQ_DIAGRAM);
  // a model with views is written through its requirement view; one with none, whole
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (views.length && !view) return `%% not written: the model, which has no ${MQ_DIAGRAM} view\n`;
  if (view && view.diagram !== MQ_DIAGRAM) return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a ${MQ_DIAGRAM} one\n`;
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  if (view) for (const n of arr(view.nodes)) if (isObj(n) && !byId.has(n.id)) byId.set(n.id, n); // a card the view alone holds (view.nodes), written as a model one (audit 22)
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const once = (seen, id) => { if (!seen.has(id)) return seen.add(id); lose(id, 'listed twice in the view, written once'); return false; };
  const said = v => (typeof v === 'string' ? v : jsonText(v)); // a value in a note: text as it is, else as validate() quotes it (audit 32)
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
    v = mermaidText(v); // a number or true as its text, as the view draws it (audit 33)
    if (v === '') { lose(id, `${what} "", which Mermaid cannot write empty`); return null; }
    if (typeof v === 'string' && !nl(v) && !v.includes('"')) return /^\w[\w./]*$/.test(v) ? v : `"${mqCode(v)}"`;
    lose(id, `${what} ${said(v)}, which Mermaid's quotes cannot hold`);
    return null;
  };
  // the title as text (a number or true too, audit 23), as it is only when YAML reads it as text: a letter first, and
  // not one of YAML's null or boolean words; a title that is no text is not written
  const word = x => ['string', 'number', 'boolean'].includes(typeof x) ? String(x) : '', title = word(view && view.title) || word(m.title);
  const yamlText = t => /^\p{L}[\p{L}\p{N} _.,()-]*$/u.test(t) && !t.endsWith(' ') && !/^(null|true|false|yes|no|on|off|y|n)$/i.test(t) ? t : JSON.stringify(t);
  if (title) out.push('---', `title: ${yamlText(title)}`, '---');
  if (m.title != null && word(m.title) !== title) notWritten.push(`the model's title ${flat(m.title)}, read back as the view's`);
  if (m.root != null && m.root !== (view ? view.id : MQ_VIEW)) notWritten.push(`the model's root ${flat(m.root)}, read back as the view's id`);
  if (view && view.id !== MQ_VIEW) { if (keeps(view.id)) out.push(`%% id: ${view.id}`); else lose(view.id, "the view's id, which the reader would not keep"); }
  out.push('requirementDiagram');
  if (view && view.direction != null) {
    const d = view.direction === 'down' ? 'TB' : view.direction === 'right' ? 'LR' : null; // no table: "constructor" is no direction
    if (!d) lose(view.id, `direction ${view.direction}: written as Mermaid's LR, as it is drawn`);
    out.push(`  direction ${d || 'LR'}`);
  }

  // each element's name: its label with what Mermaid's quotes cannot hold taken out, made unique; the label whole in %% name:
  const nodes = shown.map(id => byId.get(id)).filter(n => { const ok = MQ_SHOWN.includes(n.type) && keeps(n.id); if (!ok) skip(n); return ok; });
  const names = new Map(), taken = new Set(), made = new Map();
  for (const n of nodes) {
    const lab = mermaidText(n.label); // a number or true as its text (audit 31)
    let name = (typeof lab === 'string' ? lab : n.id).replace(/["\r\n]/g, '') || 'element';
    if (taken.has(name)) name = mqFree(taken, made, name);
    taken.add(name);
    names.set(n.id, name);
  }
  const tok = id => { const name = names.get(id); return mqBare(name) ? name : `"${mqCode(name)}"`; };
  for (const n of nodes) {
    const name = names.get(n.id), p = isObj(n.props) ? n.props : {}, req = n.type === 'sysml.Requirement', head = [], body = [];
    if (n.id !== mqWant(name)) head.push(`%% id: ${n.id}`);
    const lab = mermaidText(n.label);
    if (typeof lab !== 'string') lose(n.id, lab == null ? 'no label, read as its name' : `label ${said(lab)}, which is not text`);
    else if (lab !== name) head.push(`%% name: ${JSON.stringify(lab)}`);
    if (isObj(n.props) && !Object.keys(n.props).length) lose(n.id, 'props, which are empty');
    if (Array.isArray(p.stereotypes) && !p.stereotypes.length) lose(n.id, 'stereotypes, an empty list');
    extra(n, ['id', 'type', 'label', 'parent', ...(req ? [] : ['ext'])], req ? ['reqId', 'text', 'risk', 'verifyMethod', 'stereotypes'] : []);
    let word = 'element';
    if (req) {
      const kinds = arr(p.stereotypes).filter(s => MQ_KINDS.get(String(s).toLowerCase()) === s && s !== 'requirement');
      word = kinds[0] || 'requirement';
      for (const s of arr(p.stereotypes)) if (s !== kinds[0]) lose(n.id, `stereotype ${said(s)}`);
      if (p.stereotypes !== undefined && !Array.isArray(p.stereotypes)) lose(n.id, 'stereotypes, which are not a list');
      if (p.reqId !== undefined) { const v = value(n.id, 'reqId', p.reqId); if (v !== null) body.push(`id: ${v}`); }
      const text = mermaidText(p.text); // a number or true as its text, as the view draws it (audit 33)
      if (typeof text === 'string') {
        const clean = text.replace(/["\r\n]/g, '');
        if (clean !== text || clean === '') head.push(`%% text: ${JSON.stringify(text)}`);
        if (clean !== '') body.push(`text: "${mqCode(clean)}"`); // Mermaid's quotes hold no empty string: %% text: carries it
      } else if (p.text !== undefined) lose(n.id, `text ${said(p.text)}, which is not text`);
      for (const [prop, key, words] of [['risk', 'risk', MQ_RISK], ['verifyMethod', 'verifymethod', MQ_METHOD]]) if (p[prop] !== undefined) {
        if (words.includes(p[prop])) body.push(`${key}: ${p[prop]}`); else lose(n.id, `${prop} ${said(p[prop])}, which is none of Mermaid's ${words.join(', ')}`);
      }
    } else {
      // the type: ext.mermaid's when the reader reads it back as this element's kind, else Block or TestCase
      const ext = isObj(n.ext) ? n.ext : {}, me = isObj(ext.mermaid) ? ext.mermaid : {}, test = n.type === 'sysml.TestCase', t = me.type;
      if (Object.keys(ext).some(k => k !== 'mermaid') || Object.keys(me).some(k => k !== 'type' && k !== 'docref')) lose(n.id, 'ext, but for ext.mermaid.type and docref');
      const kind = typeof t === 'string' && t.trim() === t && t !== '' && t.toLowerCase().startsWith('test') === test, fits = kind && t !== 'Block' && t !== 'TestCase';
      if (kind && !fits) lose(n.id, `ext.mermaid.type ${t}, which the reader reads back as none`);
      else if (t !== undefined && !fits) lose(n.id, `ext.mermaid.type ${said(t)}, which the reader would not read back as a ${test ? 'test case' : 'block'}`);
      const v = fits ? value(n.id, 'ext.mermaid.type', t) : null;
      body.push(`type: ${v ?? (test ? 'TestCase' : 'Block')}`);
      if (me.docref !== undefined) { const d = typeof me.docref === 'string' && me.docref.trim() === me.docref ? value(n.id, 'ext.mermaid.docref', me.docref) : (lose(n.id, `ext.mermaid.docref ${said(me.docref)}`), null); if (d !== null) body.push(`docref: ${d}`); }
    }
    out.push(...head.map(l => '  ' + l), `  ${word} ${tok(n.id)} {`, ...body.map(l => '    ' + l), '  }');
  }
  // a relationship the reader refuses for its ends (MQ_RULE, §6.3's errors) is named, not written as a line that reads back as
  // nothing: each written element as the reader defines it, a requirement or an element (audit 34)
  const def = id => ({ kind: byId.get(id).type === 'sysml.Requirement' ? 'requirement' : 'element' });
  const refused = (word, from, to) => { const rule = MQ_RULE.get(word); return rule && !rule[2](def(from), def(to)) ? `${rule[1]} (${rule[0]})` : ''; };
  // containment: each written element's parent, when it is written
  const own = new Map();
  for (const n of nodes) if (n.parent != null) {
    const no = names.has(n.parent) && refused('contains', n.parent, n.id);
    if (no) lose(n.id, `parent ${said(n.parent)}: ${no}`);
    else if (names.has(n.parent)) own.set(n.id, { n, k: own.size });
    else lose(n.id, `parent ${said(n.parent)}, which is not written`);
  }
  // a cycle of parents (one a parent of itself too) loses its last contains in the text, as the reader drops it: named, not
  // written, so the text reads back with nothing skipped (audit 35); one colouring pass, linear, as the reader's
  const colour = new Map(), cut = new Set();
  for (const id of own.keys()) {
    const path = [];
    let x = id;
    while (own.has(x) && !colour.has(x)) { colour.set(x, 1); path.push(x); x = own.get(x).n.parent; }
    if (colour.get(x) === 1) {
      let last = x;
      for (let k = path.indexOf(x); k < path.length; k++) if (own.get(path[k]).k > own.get(last).k) last = path[k];
      cut.add(last);
    }
    for (const p of path) colour.set(p, 2);
  }
  for (const [id, { n }] of own) {
    if (cut.has(id)) lose(id, `parent ${said(n.parent)}: it would close a cycle of containment`);
    else out.push(`  ${tok(n.parent)} - contains -> ${tok(id)}`);
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
    const no = refused(word, e.from, e.to);
    if (no) { lose(e.id, no); continue; }
    extra(e, ['id', 'type', 'from', 'to']);
    if (e.id !== `${e.from}-${word}-${e.to}`) out.push(`  %% id: ${e.id}`);
    out.push(`  ${tok(e.from)} - ${word} -> ${tok(e.to)}`);
  }
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  const t = out.join('\n') + '\n'; // over the reader's limit, it cannot be read again, and says so in its last line
  return t.length > MQ_LIMIT ? t + `%% not written: text the reader reads back: this is ${t.length} characters, over its limit of ${MQ_LIMIT}\n` : t;
}

export { readMermaidRequirement, writeMermaidRequirement };
