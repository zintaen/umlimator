import { unreadable, jsonText } from '../core/model.js';
import { mermaidFrontTitle, mermaidClip, mermaidSay, mermaidSort, mermaidText } from './mermaid-front.js';
/* ---------- Mermaid classDiagram: a reader and a writer (plan.md 1.10; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's class diagram page (docs/syntax/classDiagram.md, read 11 Nov 2026). Internal: the CLI
   (`umlimator.py import`) imports this file through Node; a host gets it once the registry is public.

   readMermaidClass(text) -> { model, report }: a version-2 model with one `uml.class` view, in docs/diagrams/model.md's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). The reader is hand-written and linear, and refuses text over MC_LIMIT characters (R2). Ids come
   from the source's names (a class's, a namespace's; a member is <class>.<name>, a relation <from>-<to>, a note
   note-<n>; a repeated one -2, -3 ...; a name with "->" has it as "-", reported), so the same source always gives the
   same ids (R3). It never throws.

   writeMermaidClass(model, viewId?) -> text: one class view as Mermaid. What Mermaid cannot carry is kept in its comments:
   an id the reader would not derive, as `%% id: <id>` (and `%% link-id:` for a note's line) above its statement; an
   element the subset leaves out, as `%% not written: <id> (<type>)`, and a property of one Mermaid has no place for, as
   `%% not written: <id>: <what>` (navigable on an end with a diamond, a parent the view does not show or that is not a
   namespace, a note's parent, an unknown visibility, a stereotype the reader would read as something else). A namespace
   with no class in it is not written, as Mermaid reads no empty one. A member whose text has a line break is not
   written, nor a line that ends on a member. A model with views is written through its uml.class view; with none of them,
   the text is one `%% not written:` line. A view's layout and present are not written.

   How UML maps onto Mermaid's text, both ways:
   - classes: `<<interface>>`, `<<enumeration>>`, `<<dataType>>`, `<<primitive>>` pick the type, `<<abstract>>` sets
     isAbstract; any other annotation is a stereotype. As Mermaid's addMember, a member's text (a body line, a one-line
     body, `Name : text`) that both starts with << and ends with >> is an annotation, and a `<<x>>` in front of any
     other is the member's stereotype (written back so);
   - attributes: `+name : Type[0..1] = default`, `/` for derived, a closing `$` for static; Mermaid's own `Type name`
     is read too (a :: is part of a type: `-std::string owner`). Operations: `+name(p : T, out q : U) Return` (a parameter's
     `= default`, as `int amount = 0`, is cut off and reported, a parameter having none in the model), a closing `*` abstract, `$` static, or one right after
     the `)` (`draw()$ bool`). `List~int~` is List<int>. In an enumeration a bare name is a literal;
   - relations: `--` an association (`*`, `o` its aggregation, `<`, `>` its navigability, a quoted cardinality
     "role multiplicity" by each end), `--|>` a generalization, `..|>` an interface realization, `..>` a dependency,
     its label `«stereotype» text` after `:`. A relation runs left to right, so a child is on the left of `--|>`;
   - what `..|>` and a lollipop point to is an interface, reported when it is not declared one; Mermaid's `n` and `many`
     are the multiplicity *, reported;
   - a member named twice in one class (an operation with the same parameters' types) is read once, the other reported;
     an interface that realizes another specializes it, and a class that specializes an interface realizes it, reported;
     any other inheritance between two kinds (an interface specializing a class) is skipped, reported;
   - namespaces are packages, dotted (`A.B`) or nested by braces. Mermaid 12.3.0 draws nested braces as nested
     namespaces (docs/syntax/classDiagram.md, "Nested Namespaces (v11.15.0+)"; ClassDB.addNamespace, which names one
     inside P as P.<name>), so a namespace is known by its parent and its name here too. The writer nests by braces, and
     writes dotted, at the top, a namespace whose id is its parent's dotted path (what the reader makes of `A.B`). Mermaid
     splits any namespace's name at its dots, in backticks too, so a dotted id written otherwise (in braces, or at the top
     under a parent the view does not show, which its `%% not written:` line then says Mermaid draws) gives Mermaid a
     namespace the reader does not;
   - notes are comments, `note for` a comment with its line; `direction TB` is down (the default),
     `LR` right; a %%{ ... }%% directive, on one line or several, is passed over. */
const MC_LIMIT = 1 << 20; // characters; a class diagram a person writes is a few kilobytes
const MC_DOTS = 32; // a dotted namespace name's parts: each is a namespace whose id is its path, so a name of n parts costs n * n (R2)
const mcTable = o => Object.assign(Object.create(null), o); // a lookup table: "constructor" or "__proto__" finds nothing in it
// the words the reader dispatches on at a line's start: a class so named is written in backticks
const MC_KEYWORDS = new Set(['note', 'class', 'classDef', 'cssClass', 'direction', 'namespace', 'style', 'click', 'link', 'callback', 'accTitle', 'accDescr']);
const MC_VIS = mcTable({ '+': 'public', '-': 'private', '#': 'protected', '~': 'package' });
const MC_TYPES = mcTable({ interface: 'uml.Interface', enumeration: 'uml.Enumeration', enum: 'uml.Enumeration', datatype: 'uml.DataType', primitive: 'uml.PrimitiveType', primitivetype: 'uml.PrimitiveType' });
const MC_VIEW = 'class-diagram'; // the view's id when the source does not name it
const mcWord = c => c != null && /[\p{L}\p{N}_]/u.test(c);
const mcId = name => String(name).replace(/->+/g, '-'); // an id never holds "->", which names a map's lines by position ("->>" too)

// the first of base, base-2, base-3 ... not in used; where it stopped is kept in next, so asking for one base again
// resumes there and n repeats of a name cost n steps, not n * n (R2)
function mcFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// a multiplicity as UML writes it, Mermaid's n and many read as *; null when the text is not one, or its lower bound is
// above its upper
function mcBounds(t) {
  const m = /^(\d+|\*|n|many)(?:\.\.(\d+|\*|n|many))?$/.exec(t);
  if (!m) return null;
  const star = x => (x === 'n' || x === 'many' ? '*' : x), lo = star(m[1]), hi = m[2] == null ? null : star(m[2]);
  if (hi != null && (lo === '*' || (hi !== '*' && +lo > +hi))) return null;
  return hi == null ? lo : `${lo}..${hi}`;
}

// Mermaid's ~generic~ as <generic>: a ~ between two word characters opens, any other one closes an open one
function mcGeneric(s) {
  let out = '', depth = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c !== '~') out += c;
    else if (mcWord(s[k - 1]) && mcWord(s[k + 1])) { out += '<'; depth++; }
    else if (depth > 0) { out += '>'; depth--; }
    else out += c;
  }
  return out;
}

// text in a label, a note or a cardinality: Mermaid's line breaks and entity codes (#quot; #lt; #35;)
function mcText(s) {
  return s.replace(/<br\s?\/?>|\\n/gi, '\n').replace(/#(quot|lt|gt|amp|\d{1,6});/g, (_, e) =>
    ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? String.fromCodePoint(Math.min(Number(e), 0x10ffff)));
}

// where whitespace ends
function mcSkip(s, k) { while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++; return k; }

// a name at k: `quoted in backticks`, or word characters with single dashes (and dots, for a namespace) between them
function mcName(s, k, dots) {
  if (s[k] === '`') { const e = s.indexOf('`', k + 1); return e > k + 1 ? [s.slice(k + 1, e), e + 1, true] : null; }
  let e = k;
  while (e < s.length && (mcWord(s[e]) || ((s[e] === '-' || (dots && s[e] === '.')) && mcWord(s[e - 1]) && mcWord(s[e + 1])))) e++;
  return e > k ? [s.slice(k, e), e, false] : null;
}

// where a ~generic~ that opens at k ends (after its last ~), or -1: a ~ between word characters opens one more
function mcTilde(s, k) {
  for (let e = k, depth = 0; e < s.length; e++) if (s[e] === '~') { if (mcWord(s[e - 1]) && mcWord(s[e + 1]) || e === k) depth++; else if (--depth === 0) return e + 1; }
  return -1;
}

// a name at k as a relation or a member line writes it, its ~generic~ (Square~Shape~) after it: [name, after, generic]
function mcNameG(s, k) {
  const n = mcName(s, k), e = n && !n[2] && s[n[1]] === '~' ? mcTilde(s, n[1]) : -1;
  return e < 0 ? n && [n[0], n[1], ''] : [n[0], e, s.slice(n[1], e)];
}

// a "quoted" string at k: [text, after]
function mcQuoted(s, k) { if (s[k] !== '"') return null; const e = s.indexOf('"', k + 1); return e < 0 ? null : [s.slice(k + 1, e), e + 1]; }

// the last whitespace outside <...>, or -1: where `Type name` splits
function mcLastSpace(s) {
  let depth = 0, at = -1;
  for (let k = 0; k < s.length; k++) { const c = s[k]; if ('<[('.includes(c)) depth++; else if ('>])'.includes(c)) depth = Math.max(0, depth - 1); else if ((c === ' ' || c === '\t') && depth === 0) at = k; }
  return at;
}

// a type with its multiplicity: "String[0..1]" -> ["String", "0..1"], "int[0..n]" -> ["int", "0..*", "0..n"] (as
// written, when that differs); "int[]" and "int[5..2]" stay types
function mcMult(type) {
  const t = type.trim(), lb = t.lastIndexOf('[');
  if (!t.endsWith(']') || lb < 0) return [t, undefined];
  const inner = t.slice(lb + 1, -1).replace(/\s/g, ''), mult = mcBounds(inner);
  return mult ? [t.slice(0, lb).trim(), mult, mult === inner ? undefined : inner] : [t, undefined];
}

// the first : that is not one of a :: (C++'s std::string is a type, so `-std::string owner` is Mermaid's `Type name`), or -1:
// where `name : Type` splits (audit 42)
function mcColon(s) { const m = /(?<!:):(?!:)/.exec(s); return m ? m.index : -1; }

// the first = outside <...> [...] (...) {...} and quotes that is not one of => == != (a function type, a comparison), or -1:
// where a default value begins (audit 42)
function mcEq(s) {
  for (let k = 0, depth = 0, q = ''; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c;
    else if ('<[({'.includes(c)) depth++; else if ('>])}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === '=' && depth === 0 && s[k + 1] !== '>' && s[k + 1] !== '=' && s[k - 1] !== '=' && s[k - 1] !== '!') return k;
  }
  return -1;
}

// `name : Type` or Mermaid's `Type name` or `name`, generics already turned to <>: { name, valueType?, multiplicity? }
function mcTyped(s, colonFirst) {
  let name, type = '';
  const colon = colonFirst ? mcColon(s) : -1;
  if (colon >= 0) { name = s.slice(0, colon).trim(); type = s.slice(colon + 1); }
  else { const sp = mcLastSpace(s.trim()); name = sp < 0 ? s.trim() : s.trim().slice(sp + 1); type = sp < 0 ? '' : s.trim().slice(0, sp); }
  const [valueType, multiplicity, written] = mcMult(type);
  return { name, ...(valueType ? { valueType } : {}), ...(multiplicity ? { multiplicity } : {}), ...(written ? { written } : {}) };
}

// one member's text: an operation (it has parentheses), a literal (a bare name in an enumeration) or an attribute
function mcMember(raw, inEnum) {
  let t = raw.trim();
  if (inEnum && /^[\p{L}\p{N}_]+$/u.test(t)) return { type: 'uml.EnumerationLiteral', label: t };
  let isStatic = false, isAbstract = false;
  for (;;) {
    if (t.endsWith('$')) isStatic = true; else if (t.endsWith('*')) isAbstract = true; else break;
    t = t.slice(0, -1).trimEnd();
  }
  const props = {};
  if (MC_VIS[t[0]]) { props.visibility = MC_VIS[t[0]]; t = t.slice(1).trimStart(); }
  t = mcGeneric(t);
  const open = t.indexOf('(');
  if (open >= 0) {
    const close = t.lastIndexOf(')'), inner = t.slice(open + 1, close > open ? close : t.length);
    let ret = close > open ? t.slice(close + 1) : '', mk = ret[0];
    if (mk == '$' || mk == '*') { mk == '$' ? isStatic = true : isAbstract = true; ret = ret.slice(1); } // Mermaid's marker right after )
    ret = ret.trim();
    if (ret.startsWith(':')) ret = ret.slice(1).trim();
    const parameters = [], dropped = []; // dropped: a parameter's default, which the model has no place for, reported
    let depth = 0, from = 0, q = '';
    for (let k = 0; k <= inner.length; k++) {
      const c = inner[k];
      if (q && k < inner.length) { if (c === q) q = ''; continue; } // a , in a quoted default does not split (audit 42)
      if (c === '"' || c === "'") q = c;
      else if (c && '<[('.includes(c)) depth++; else if (c && '>])'.includes(c)) depth = Math.max(0, depth - 1); // Dict[str, int], (a, b) => c
      else if (k === inner.length || (c === ',' && depth === 0)) {
        let p = inner.slice(from, k).trim(); from = k + 1;
        if (!p) continue;
        const sp = p.search(/\s/), first = sp < 0 ? '' : p.slice(0, sp), direction = ['in', 'out', 'inout', 'return'].includes(first) ? first : undefined;
        if (direction) p = p.slice(sp).trim();
        // `int amount = 0` and `amount : int = 0`: the default is cut off before the name and type split (audit 42)
        const eq = mcEq(p);
        if (eq >= 0) { dropped.push(['', p.slice(eq + 1).trim()]); p = p.slice(0, eq).trim(); if (!p) continue; } // `= 5` names none
        const { name, valueType } = mcTyped(p, true);
        if (eq >= 0) dropped[dropped.length - 1][0] = name;
        parameters.push({ name, ...(valueType ? { valueType } : {}), ...(direction ? { direction } : {}) });
      }
    }
    if (parameters.length) props.parameters = parameters;
    if (ret) props.returnType = ret;
    if (isStatic) props.isStatic = true;
    if (isAbstract) props.isAbstract = true;
    return { type: 'uml.Operation', label: t.slice(0, open).trim(), props, ...(dropped.length ? { paramDefaults: dropped } : {}) };
  }
  if (t.startsWith('/')) { props.isDerived = true; t = t.slice(1).trimStart(); }
  const eq = mcEq(t), colon = mcColon(t);
  let head = t, def;
  if (colon >= 0 && (eq < 0 || colon < eq)) { const r = t.slice(colon + 1), e = mcEq(r); head = t.slice(0, colon + 1) + (e < 0 ? r : r.slice(0, e)); def = e < 0 ? undefined : r.slice(e + 1).trim(); }
  else if (eq >= 0) { head = t.slice(0, eq); def = t.slice(eq + 1).trim(); }
  const { name, valueType, multiplicity, written } = mcTyped(head, true);
  Object.assign(props, valueType ? { valueType } : {}, multiplicity ? { multiplicity } : {}, def !== undefined ? { default: def } : {}, isStatic ? { isStatic: true } : {});
  return { type: 'uml.Property', label: name, props, abstractField: isAbstract, multWritten: written };
}

// a relation: A ["c1"] arrow ["c2"] B [: label], or null when the text is not one
function mcRelation(s) {
  const a = mcNameG(s, 0); if (!a) return null;
  let k = mcSkip(s, a[1]), c1, c2, left = '', right = '';
  const q1 = mcQuoted(s, k); if (q1) { c1 = q1[0]; k = mcSkip(s, q1[1]); }
  for (const m of ['<|', '()', '*', 'o', '<']) if (s.startsWith(m, k)) { left = m; k += m.length; break; }
  const line = s.startsWith('--', k) ? 'solid' : s.startsWith('..', k) ? 'dashed' : null;
  if (!line) return null;
  k += 2;
  for (const m of ['|>', '()', '*', 'o', '>']) if (s.startsWith(m, k) && (!'*o'.includes(m) || k + 1 >= s.length || ' \t"'.includes(s[k + 1]))) { right = m; k += m.length; break; }
  k = mcSkip(s, k);
  const q2 = mcQuoted(s, k); if (q2) { c2 = q2[0]; k = mcSkip(s, q2[1]); }
  const b = mcNameG(s, k); if (!b) return null;
  k = mcSkip(s, b[1]);
  if (k < s.length && s[k] !== ':') return null;
  return { a: a[0], b: b[0], ga: a[2], gb: b[2], c1, c2, left, right, line, label: k < s.length ? s.slice(k + 1).trim() : '' };
}

// a cardinality's text as an end: "1", "0..*", "lines 1..*", "lines"; Mermaid's "many" and "n" are *
function mcEnd(text, say) {
  const t = mcText(text).trim(), sp = t.lastIndexOf(' '), last = sp < 0 ? t : t.slice(sp + 1), role = sp < 0 ? '' : t.slice(0, sp).trim();
  const mult = mcBounds(last);
  if (mult && mult !== last) say('approximated', `cardinality "${last}" is read as the multiplicity ${mult}`);
  return mult ? { ...(role ? { role } : {}), multiplicity: mult } : t ? { role: t } : {};
}

function readMermaidClass(text) {
  const report = [], say = mermaidSay(report);
  const empty = () => ({ model: { schemaVersion: 2, root: MC_VIEW, nodes: [], edges: [], views: [{ id: MC_VIEW, diagram: 'uml.class', nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MC_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MC_LIMIT}: nothing read`); return empty(); }
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
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
        const ft = mermaidFrontTitle(lines, j); // a comment after it is not the title (audit 24); over its lines (audit 25)
        title = ft.title;
        if (ft.rest) say(j + 1, 'skipped', `front matter title: ${ft.rest}, after the quoted title, is not read`);
        j = ft.end;
      } else say(j + 1, 'skipped', `front matter ${key}: Mermaid's configuration is not read`);
    }
    if (j >= lines.length) { say(i + 1, 'skipped', 'the front matter is never closed with ---: nothing read'); return empty(); }
    i = j + 1;
  }

  const classes = new Map(), packages = [], topNs = new Map(), order = [], relations = [], notes = [], stack = [];
  let viewId, direction = 'down', started = false, hint = {}, block = null;
  // classes and namespaces by their names, their ids given once all are read (a name that is not an id needs the others)
  const cls = (name, no) => {
    if (!classes.has(name)) { const rec = { kind: 'class', name, no, node: { id: undefined, type: 'uml.Class', label: name }, anns: [], raw: [] }; classes.set(name, rec); order.push(rec); }
    return classes.get(name);
  };
  const where = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].kind === 'package') return stack[k]; return null; };
  const annotate = (rec, s) => { const e = s.indexOf('>>', 2); rec.anns.push((e < 0 ? s.slice(2) : s.slice(2, e)).trim()); return e < 0 ? s.length : e + 2; };
  const generic = (rec, g, no, again) => { // a class's ~generic~ in its label, once (its class line's, else the first that names it)
    if (!g || !again && rec.node.label !== rec.name) return rec;
    rec.node.label = mcGeneric(rec.name + g);
    say(no, 'approximated', `class ${rec.name}'s type parameter is kept in its name only, ${rec.node.label} (templates are not in the subset)`);
    return rec;
  };
  const take = k => { const h = hint[k]; delete hint[k]; return h; }; // a hint its line uses; one left is said where it is dropped
  const drop = no => { for (const k in hint) say(no, 'skipped', `%% ${k === 'id' ? 'id' : 'link-id'}: ${hint[k]} is above a line that takes none: not read`); hint = {}; };
  /* a member's text, from a body line, a one-line body or `Name : text`, as Mermaid's classDb.addMember takes it: one that
     starts with << and ends with >> is an annotation of the class; any other is a member, a <<x>> in front of it read as
     its stereotype (audit 17) */
  const member = (rec, s, no) => {
    let t = s.trim();
    if (!t) return;
    if (t.length >= 4 && t.startsWith('<<') && t.endsWith('>>')) { rec.anns.push(t.slice(2, -2).trim()); return; }
    const st = [];
    for (let e; t.startsWith('<<') && (e = t.indexOf('>>', 2)) >= 0;) { st.push(t.slice(2, e).trim()); t = t.slice(e + 2).trimStart(); }
    rec.raw.push({ text: t, line: no, hint: take('id'), st: st.filter(Boolean) });
  };

  for (; i < lines.length; i++) {
    const no = i + 1;
    let s = lines[i].trim();
    if (!s) continue;
    if (block) { if (s.includes('}')) block = null; continue; } // inside accDescr { ... }
    if (s.startsWith('%%')) {
      const c = s.slice(2).trim();
      if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!s.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      }
      else if (/^(id|link-id):\s*$/.test(c)) say(no, 'skipped', `%% ${c} holds no id: not read`); // a blank hint is none (audit 19)
      else if (c.startsWith('id:')) hint.id = c.slice(3).trim();
      else if (c.startsWith('link-id:')) hint.link = c.slice(8).trim();
      continue;
    }
    if (!started) {
      if (!/^classDiagram(-v2)?$/.test(s)) { say(no, 'skipped', 'not a Mermaid classDiagram: nothing read'); return empty(); }
      started = true; viewId = hint.id; hint = {}; continue;
    }
    // Mermaid closes a block at any }, as a member is [^{}\n]*: a line that ends in one, with no { to open, is its
    // statement, then that } read again on its own on the same line (audit 15)
    if (s.length > 1 && s.endsWith('}') && !s.includes('{')) { lines[i--] = '}'; s = s.slice(0, -1).trim(); }
    const top = stack[stack.length - 1];
    const cut = s.search(/[\s{:("[<`]/), word = cut < 0 ? s : s.slice(0, cut);
    if (top && top.kind === 'class') { // a class body
      if (s === '}') stack.pop();
      else member(top.rec, s, no);
    } else if (s === '}') {
      if (top) stack.pop(); else say(no, 'skipped', 'a } that closes nothing');
    } else if (word === 'direction') {
      const d = s.slice(9).trim();
      if (d === 'TB' || d === 'TD') direction = 'down';
      else if (d === 'LR') direction = 'right';
      else if (d === 'BT' || d === 'RL') { direction = d === 'BT' ? 'down' : 'right'; say(no, 'approximated', `direction ${d} is drawn ${direction === 'down' ? 'top to bottom' : 'left to right'}`); }
      else say(no, 'skipped', `direction ${d}: not a direction`);
    } else if (word === 'class') {
      const n = mcName(s, mcSkip(s, 5));
      if (!n) { say(no, 'skipped', 'a class with no name'); drop(no); continue; }
      const rec = cls(n[0], no), pkg = where();
      if (pkg) rec.pkg = pkg;
      let k = n[1], rest = '';
      while (k < s.length) {
        k = mcSkip(s, k);
        if (k >= s.length) break;
        if (s[k] === '~') {
          const e = mcTilde(s, k);
          generic(rec, s.slice(k, e < 0 ? s.length : e), no, true);
          k = e < 0 ? s.length : e;
        } else if (s.startsWith('["', k)) {
          const q = mcQuoted(s, k + 1); if (!q || s[q[1]] !== ']') { rest = s.slice(k); break; }
          rec.node.label = mcText(q[0]); k = q[1] + 1;
        } else if (s.startsWith('<<', k)) k = annotate(rec, s.slice(k)) + k;
        else if (s.startsWith(':::', k)) {
          const c = mcName(s, k + 3); say(no, 'skipped', `:::${c ? c[0] : ''} on class ${n[0]}: styling is not read`); k = c ? c[1] : k + 3;
        } else if (s[k] === '{') {
          // the first } closes the body; what follows it is read again, as a namespace's } on the same line (audit 16)
          const after = s.slice(k + 1), c = after.indexOf('}');
          if (c < 0) { stack.push({ kind: 'class', rec }); member(rec, after.trim(), no); break; }
          const body = after.slice(0, c).trim(), tail = after.slice(c + 1).trim();
          if (body) member(rec, body, no);
          if (tail) lines[i--] = tail;
          break;
        } else { rest = s.slice(k); break; }
      }
      if (rest) say(no, 'skipped', `class ${n[0]}: "${rest}" is not read`);
    } else if (word === 'namespace') {
      const n = mcName(s, mcSkip(s, 9), true);
      if (!n) { say(no, 'skipped', 'a namespace with no name'); drop(no); continue; }
      let k = mcSkip(s, n[1]), label;
      if (s.startsWith('["', k)) { const q = mcQuoted(s, k + 1); if (q && s[q[1]] === ']') { label = mcText(q[0]); k = mcSkip(s, q[1] + 1); } }
      let segs = n[2] ? [n[0]] : n[0].split('.');
      if (segs.length > MC_DOTS) { say(no, 'approximated', `namespace ${n[0]}: over ${MC_DOTS} dotted parts, so read as one name`); segs = [n[0]]; }
      // a namespace is known by its parent and its name, as Mermaid's own qualified id (A inside P is P.A); its id is
      // the name as written, a dotted path from its first part
      let parent = where(), path = '';
      for (const seg of segs) {
        path = path ? `${path}.${seg}` : seg;
        const kids = parent ? (parent.kids ??= new Map()) : topNs;
        if (!kids.has(seg)) {
          const rec = { kind: 'package', name: path, no, pkg: parent, node: { id: undefined, type: 'uml.Package', label: seg } };
          kids.set(seg, rec); packages.push(rec); order.push(rec);
        }
        parent = kids.get(seg);
      }
      if (label) parent.node.label = label;
      if (s[k] === '{') { // what follows its { on the line is read inside it, as the next statement (audit 15)
        const after = s.slice(k + 1).trim();
        if (after !== '}') { stack.push(parent); if (after) lines[i--] = after; }
      }
      else say(no, 'skipped', `namespace ${n[0]} has no {: what follows is not inside it`);
    } else if (word === 'note') {
      let k = mcSkip(s, 4), target;
      if (s.startsWith('for ', k)) { const n = mcName(s, mcSkip(s, k + 4)); if (n) { target = cls(n[0], no); k = mcSkip(s, n[1]); } }
      const q = mcQuoted(s, k);
      if (!q) say(no, 'skipped', 'a note with no "text"');
      else {
        if (where()) say(no, 'approximated', `a note in namespace ${where().name} is read outside it`);
        const rec = { kind: 'note', node: { type: 'uml.Comment', label: mcText(q[0]) }, target, hint: take('id'), linkHint: take('link'), no };
        notes.push(rec); order.push(rec);
      }
    } else if (s.startsWith('<<')) {
      const e = s.indexOf('>>'), n = e < 0 ? null : mcName(s, mcSkip(s, e + 2));
      if (n) annotate(cls(n[0], no), s); else say(no, 'skipped', `${s}: an annotation names no class`);
    } else if (['click', 'link', 'callback'].includes(word)) say(no, 'skipped', `${word}: links and callbacks are not read`);
    else if (['style', 'classDef', 'cssClass'].includes(word)) say(no, 'skipped', `${word}: styling is not read`);
    else if (word.startsWith('accTitle') || word.startsWith('accDescr')) {
      say(no, 'skipped', `${word.startsWith('accTitle') ? 'accTitle' : 'accDescr'}: accessibility text is not read`);
      if (word.startsWith('accDescr') && s.includes('{') && !s.includes('}')) block = true;
    } else {
      const r = mcRelation(s);
      if (r) { relations.push({ ...r, no, hint: take('id'), from: generic(cls(r.a, no), r.ga, no), to: generic(cls(r.b, no), r.gb, no) }); drop(no); continue; }
      const n = mcNameG(s, 0), k = n ? mcSkip(s, n[1]) : -1;
      if (n && s[k] === ':') member(generic(cls(n[0], no), n[2], no), s.slice(k + 1), no);
      else if (n && k >= s.length) generic(cls(n[0], no), n[2], no);
      else say(no, 'skipped', `"${mermaidClip(s)}" is not understood`);
    }
    drop(no);
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid classDiagram: nothing read'); return empty(); }
  for (const open of stack) say(lines.length, 'approximated', `${open.kind === 'class' ? 'class ' + open.rec.name : 'namespace ' + open.name} is never closed: read to the end`);

  // ids: a class's name, then a namespace's; a namespace with a class's name is <name>-namespace, and one with another
  // namespace's name (inside another parent) or a name the id rule changes (no "->") is made unique, each reported. Later
  // members, relations and notes, in the order they come, made unique
  const used = new Set(), next = new Map(), uniq = name => { const id = mcFree(used, next, mcId(name)); used.add(id); return id; };
  const hinted = (h, base, no, what) => { // a %% id: that is taken or holds "->" is said, as the state reader says it
    const id = uniq(h ?? base);
    if (h != null && id !== h) say(no, 'approximated', mcId(h) === h ? `%% id: ${h} is taken, so ${what} is ${id}` : `%% id: ${h}: an id holds no "->", so ${what} is ${id}`);
    return id;
  };
  const named = [...classes.values(), ...packages];
  for (const rec of named) if (mcId(rec.name) === rec.name && !used.has(rec.name)) { rec.node.id = rec.name; used.add(rec.name); }
  for (const rec of named) if (rec.node.id === undefined) {
    const kept = mcId(rec.name) === rec.name, cls = kept && classes.has(rec.name);
    const what = rec.kind === 'class' ? `class ${rec.name}` : `namespace ${rec.name}${rec.pkg ? ' in ' + rec.pkg.node.id : ''}`;
    rec.node.id = uniq(cls ? rec.name + '-namespace' : rec.name);
    say(rec.no, 'approximated', cls ? `${what} has a class's name: it is ${rec.node.id}` : kept ? `${what} has another namespace's name: it is ${rec.node.id}` : `${what}: an id holds no "->", so it is ${rec.node.id}`);
  }
  for (const rec of named) if (rec.pkg) rec.node.parent = rec.pkg.node.id;

  // the relations, as UML's
  const edges = [];
  for (const r of relations) {
    const at = (status, message) => say(r.no, status, message), tri = x => x === '<|' || x === '|>', what = `${r.a} ${r.left}${r.line === 'solid' ? '--' : '..'}${r.right} ${r.b}`;
    let e = null;
    if (r.left === '()' || r.right === '()') {
      const [iface, impl] = r.left === '()' ? [r.from, r.to] : [r.to, r.from];
      if ((r.left && r.right) || r.line === 'dashed') at('skipped', `${what}: a lollipop joins a class by a solid line`);
      else { iface.forced = 'uml.Interface'; e = { type: 'uml.InterfaceRealization', from: impl.node.id, to: iface.node.id }; at('approximated', `${what}: the lollipop ${iface.node.id} is an interface ${impl.node.id} realizes, drawn as a box`); }
    } else if (r.line === 'solid' && !tri(r.left) && !tri(r.right)) {
      const ends = {};
      [['from', r.left, r.c1], ['to', r.right, r.c2]].forEach(([k, mark, card]) => {
        const end = card != null ? mcEnd(card, at) : {};
        if (mark === '*') end.aggregation = 'composite'; else if (mark === 'o') end.aggregation = 'shared'; else if (mark) end.navigable = true;
        if (Object.keys(end).length) ends[k] = end;
      });
      e = { type: 'uml.Association', from: r.from.node.id, to: r.to.node.id, ...(Object.keys(ends).length ? { props: { ends } } : {}) };
    } else {
      const kind = r.line === 'solid' ? 'uml.Generalization' : tri(r.left) || tri(r.right) ? 'uml.InterfaceRealization' : 'uml.Dependency';
      const mark = kind === 'uml.Generalization' || kind === 'uml.InterfaceRealization' ? tri : x => x === '<' || x === '>';
      if (mark(r.left) && !r.right) e = { type: kind, from: r.to.node.id, to: r.from.node.id };
      else if (mark(r.right) && !r.left) e = { type: kind, from: r.from.node.id, to: r.to.node.id };
      else if (!r.left && !r.right) { e = { type: kind, from: r.from.node.id, to: r.to.node.id }; at('approximated', `${what}: a dashed link with no arrow is read as a dependency from ${r.a} to ${r.b}`); }
      else at('skipped', `${what}: ${r.left && r.right ? 'a two-way' : 'this'} ${kind === 'uml.Dependency' ? 'dashed relation' : kind === 'uml.Generalization' ? 'inheritance' : 'realization'} has no counterpart in UML's class diagram`);
      if (e && (r.c1 != null || r.c2 != null)) at('skipped', `${what}: a cardinality is read on an association only`);
      if (e && kind === 'uml.InterfaceRealization') { // what is realized is an interface, as a lollipop's is
        const sup = mark(r.left) ? r.from : r.to;
        if (!sup.forced && !sup.anns.some(a => a.toLowerCase() === 'interface')) at('approximated', `${what}: ${sup.node.id} is realized, so it is read as an interface`);
        sup.forced = 'uml.Interface';
      }
    }
    if (!e) continue;
    let label = r.label;
    const stereotypes = []; // taken before the text is decoded: an encoded #lt;#lt; or « is the label's own text
    for (;;) {
      label = label.trim();
      const [o, c] = label.startsWith('«') ? ['«', '»'] : label.startsWith('<<') ? ['<<', '>>'] : [];
      const end = o ? label.indexOf(c, o.length) : -1;
      if (end < 0) break;
      stereotypes.push(mcText(label.slice(o.length, end)).trim()); label = label.slice(end + c.length);
    }
    label = mcText(label);
    if (stereotypes.length) e.props = { ...e.props, stereotypes };
    if (label) e.label = label;
    edges.push({ e, hint: r.hint, at, no: r.no, what });
  }

  // finish the classes: their type from the annotations, then their members
  for (const rec of classes.values()) {
    const n = rec.node, stereotypes = [];
    let type = rec.forced;
    for (const a of rec.anns) {
      const k = a.toLowerCase();
      if (k === 'abstract') n.props = { ...n.props, isAbstract: true };
      else if (MC_TYPES[k]) type = type || MC_TYPES[k];
      else stereotypes.push(a);
    }
    if (type) n.type = type;
    if (stereotypes.length) n.props = { ...n.props, stereotypes };
  }
  // an interface does not realize one: it specializes it (an interface by its annotation, or as what is realized elsewhere)
  const typeOf = new Map([...classes.values()].map(c => [c.node.id, c.node.type]));
  for (const { e, at, what } of edges) if (e.type === 'uml.InterfaceRealization' && typeOf.get(e.from) === 'uml.Interface') {
    e.type = 'uml.Generalization'; at('approximated', `${what}: ${e.from} is an interface, so it specializes ${e.to}`);
  }
  // a generalization joins two classifiers of one kind: one to an interface from what is not one is a realization;
  // any other mismatch (an interface or enumeration specializing a class...) has no counterpart, so it is skipped (audit 38)
  const kindWord = t => (t || 'uml.Class').slice(4).replace(/^[A-Z]/, c => c.toLowerCase()).replace(/Type$/, ' type');
  for (const x of edges) { const { e, at, what } = x, a = typeOf.get(e.from), b = typeOf.get(e.to);
    if (e.type !== 'uml.Generalization' || a === b) continue;
    if (b === 'uml.Interface') { e.type = 'uml.InterfaceRealization'; at('approximated', `${what}: ${e.to} is an interface, so ${e.from} realizes it`); }
    else { x.drop = true; at('skipped', `${what}: ${kindWord(a)} ${e.from} cannot specialize ${kindWord(b)} ${e.to}`); }
  }

  for (const rec of classes.values()) {
    const members = [], seen = new Set(); // a member's name, an operation's with its parameters' types (overloading)
    for (const r of rec.raw) {
      const { abstractField, multWritten, paramDefaults, ...x } = mcMember(r.text, rec.node.type === 'uml.Enumeration');
      if (!x.label) { say(r.line, 'skipped', `"${r.text.trim()}": a member with no name`); continue; }
      if (abstractField) say(r.line, 'approximated', `${rec.node.id}.${x.label}: an attribute is not abstract, so its * is not read`);
      if (multWritten) say(r.line, 'approximated', `${rec.node.id}.${x.label}: multiplicity [${multWritten}] is read as [${x.props.multiplicity}]`);
      for (const [p, d] of paramDefaults || []) p ? say(r.line, 'approximated', `${rec.node.id}.${x.label}: parameter ${p}'s default ${d} is not kept, as a parameter has no default in the model`)
        : say(r.line, 'skipped', `${rec.node.id}.${x.label}: a parameter with no name, = ${d}, is not read`);
      const key = x.type === 'uml.Operation' ? `${x.label}(${(x.props.parameters || []).map(a => a.valueType ?? '').join(',')})` : x.label;
      if (seen.has(key)) { say(r.line, 'skipped', `${rec.node.id}.${x.label}: ${rec.node.id} has a member ${key} already`); continue; }
      seen.add(key);
      if (r.st.length) {
        x.props = { ...x.props, stereotypes: [...r.st, ...((x.props && x.props.stereotypes) || [])] };
        say(r.line, 'approximated', `${rec.node.id}.${x.label}: ${r.st.map(t => `<<${t}>>`).join(' ')} in front of it is read as its stereotype${r.st.length > 1 ? 's' : ''}`);
      }
      if (x.props && !Object.keys(x.props).length) delete x.props;
      members.push({ id: hinted(r.hint, `${rec.node.id}.${x.label}`, r.line, `${rec.node.id}.${x.label}`), ...x });
    }
    if (members.length) rec.node.members = members;
  }
  const out = edges.filter(x => !x.drop).map(({ e, hint, no, what }) => ({ id: hinted(hint, `${e.from}-${e.to}`, no, what), ...e }));
  notes.forEach((rec, k) => {
    rec.node = { id: hinted(rec.hint, `note-${k + 1}`, rec.no, `note ${k + 1}`), ...rec.node };
    if (rec.target) out.push({ id: hinted(rec.linkHint, `${rec.node.id}-link`, rec.no, `note ${k + 1}'s link`), type: 'uml.CommentLink', from: rec.node.id, to: rec.target.node.id });
  });

  const nodes = order.map(x => x.node), view = { id: viewId || MC_VIEW, diagram: 'uml.class', ...(title ? { title } : {}), ...(direction === 'down' ? { direction } : {}), nodeIds: nodes.map(n => n.id) };
  mermaidSort(report); // by line, stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges: out, views: [view] }, report };
}

function writeMermaidClass(model, viewId) {
  // the model as validate() reads it: a value String() throws on (JSON's {"toString":1}) left out (audit 23)
  model = unreadable(model).model;
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  // text of any value: an object whose toString is no function (JSON's {"toString":1}) gives its tag, not a throw (audit 23)
  const txt = s => { try { return String(s); } catch { return Object.prototype.toString.call(s); } };
  const flat = s => txt(s).replace(/\r\n|\r|\n/g, '\\n'), nl = s => /[\r\n]/.test(txt(s)); // a comment is one line
  const badId = id => nl(id) || txt(id).trim() !== txt(id); // the reader trims a hint and a name: an id with a space at either end comes back as another
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'uml.class');
  // a model with views is written through its class view; one with none, whole
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (views.length && !view) return '%% not written: the model, which has no uml.class view\n';
  if (view && view.diagram !== 'uml.class') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a uml.class one\n`;
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  if (view) for (const n of arr(view.nodes)) if (isObj(n) && !byId.has(n.id)) byId.set(n.id, n); // a card the view alone holds (view.nodes), written as a model one (audit 22)
  const shown = (view ? arr(view.nodeIds) : [...byId.keys()]).filter(id => byId.has(id));
  const KIND = mcTable({ 'uml.Class': '', 'uml.Interface': 'interface', 'uml.Enumeration': 'enumeration', 'uml.DataType': 'dataType', 'uml.PrimitiveType': 'primitive' });
  const VIS = mcTable({ public: '+', private: '-', protected: '#', package: '~' });
  const ARROW = mcTable({ 'uml.Generalization': '--|>', 'uml.InterfaceRealization': '..|>', 'uml.Dependency': '..>' });
  const has = x => x != null && x !== '', gen = s => String(s).replace(/[<>]/g, '~');
  const enc = s => String(s).replace(/[#\\]/g, c => (c === '#' ? '#35;' : '#92;')).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\n/g, '<br>');
  // a statement keyword in backticks too: the reader takes a line's first word as one (`note -- Order` is a note)
  const name = id => (/^[\p{L}\p{N}_]+(-[\p{L}\p{N}_]+)*$/u.test(id) && !MC_KEYWORDS.has(id) ? id : '`' + id + '`');
  // what Mermaid cannot carry: an element, as `<id> (<type>)`, or one property of one, as `<id>: <what>`
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  // the keys and props Mermaid has a place for; any other (ext, tags) is named, as the ER writer does
  const extra = (x, keys, props = []) => { for (const k of Object.keys(x)) if (!keys.includes(k)) {
    if (k === 'props' && isObj(x.props)) { for (const p of Object.keys(x.props)) if (!props.includes(p)) lose(x.id, `property ${p}`); } else lose(x.id, k); } };
  // the title as text (a number or true too, audit 23), as it is only when YAML reads it as text: a letter first, and
  // not one of YAML's null or boolean words; a title that is no text is not written
  const word = x => ['string', 'number', 'boolean'].includes(typeof x) ? String(x) : '', title = word(view && view.title) || word(m.title);
  const yamlText = t => /^\p{L}[\p{L}\p{N} _.,()-]*$/u.test(t) && !t.endsWith(' ') && !/^(null|true|false|yes|no|on|off|y|n)$/i.test(t) ? t : JSON.stringify(t);
  if (title) out.push('---', `title: ${yamlText(title)}`, '---');
  if (view && view.id !== MC_VIEW) { if (badId(view.id)) lose(view.id, "the view's id, which a hint cannot carry"); else out.push(`%% id: ${view.id}`); }
  out.push('classDiagram', view && view.direction === 'down' ? '  direction TB' : '  direction LR');

  // what is written, in the reader's order: namespaces and classes as a tree, then relations, then notes
  const shownSet = new Set(shown), isPkg = n => n.type === 'uml.Package';
  const kids = new Map(), roots = [], notes = [], tree = [], boxes = [], splits = [];
  for (const id of shown) {
    const n = byId.get(id), up = shownSet.has(n.parent) ? byId.get(n.parent) : null;
    // an owner the view does not show is not written, and the element is written at the top (notes/stage-2.md §11)
    const hidden = has(n.parent) && !up && `its parent ${n.parent}, which the ${byId.has(n.parent) ? 'view does not show' : 'model does not have'}`;
    if (n.type === 'uml.Comment') {
      if (badId(n.id)) skip(n);
      else { notes.push(n); if (has(n.parent)) lose(n.id, hidden || `its parent ${n.parent}: a note is written outside namespaces`); }
    } else if ((!isPkg(n) && !(n.type in KIND)) || badId(n.id) || String(n.id).includes('`')) skip(n); // a name is one line, in `...` at most
    else if (up && isPkg(up)) { boxes.push(n); if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    else {
      // Mermaid splits a namespace's name at its dots, in backticks too, so one whose id is its hidden parent's dotted path
      // has that parent drawn all the same; the line says so once the namespace is known to be written
      if (hidden && isPkg(n) && String(n.id).startsWith(`${n.parent}.`)) splits.push([notWritten.length, n]);
      if (up || hidden) lose(n.id, hidden || `its parent ${n.parent}, a ${up.type}, which only a namespace can be`);
      roots.push(n);
    }
  }
  // parents first, by a stack: a model nested thousands deep is written, not a call stack overflowed
  for (const st = [...roots].reverse(); st.length;) { const n = st.pop(), ks = kids.get(n.id) || []; tree.push(n); for (let k = ks.length - 1; k >= 0; k--) st.push(ks[k]); }
  const inTree = new Set(tree);
  for (const n of boxes) if (!inTree.has(n)) skip(n); // under a namespace that is not written, or in a cycle of parents
  // Mermaid reads no empty namespace (its grammar wants a statement between the braces): one with no class in it, at any
  // depth, is not written. The tree is parents first, so read backwards a namespace's contents come before it
  const full = new Set();
  for (let k = tree.length - 1; k >= 0; k--) if (!isPkg(tree[k]) || full.has(tree[k].id)) full.add(tree[k].parent);
  for (const n of tree) if (isPkg(n)) { if (full.has(n.id)) extra(n, ['id', 'type', 'label', 'parent']); else skip(n); }
  for (const [at, n] of splits) if (full.has(n.id)) notWritten[at] += `, though Mermaid draws ${flat(n.parent)}, as it splits ${flat(n.id)} at its dots`;
  const written = new Set(tree.filter(n => !isPkg(n)).map(n => n.id));
  const used = new Set(tree.filter(n => !isPkg(n) || full.has(n.id)).map(n => n.id)), next = new Map();
  const idOf = (id, base) => { const d = mcFree(used, next, mcId(base)); used.add(id); return d === id ? null : id; }; // the hint, if one is needed

  const heads = new Map(); // a class's annotations and member rows
  for (const n of tree) if (!isPkg(n)) {
    const rows = [], np = isObj(n.props) ? n.props : {};
    if (!has(n.label)) lose(n.id, 'no label, read as its name');
    extra(n, ['id', 'type', 'label', 'members', 'parent'], ['isAbstract', 'stereotypes']);
    const anns = [...(KIND[n.type] ? [KIND[n.type]] : []), ...(np.isAbstract ? ['abstract'] : []), ...arr(np.stereotypes).filter(s => {
      const k = String(s).toLowerCase(), ok = !badId(s) && s !== '' && !String(s).includes('>>') && !String(s).endsWith('>') && k !== 'abstract' && !(k in MC_TYPES); // one the reader reads back as itself
      if (!ok) lose(n.id, `stereotype ${s}`);
      return ok;
    })];
    for (const x of arr(n.members).filter(isObj)) {
      const p = isObj(x.props) ? x.props : {};
      for (const t of [p.valueType, p.returnType, ...arr(p.parameters).filter(isObj).map(a => a.valueType)]) if (has(t) && String(t).trim() !== String(t)) lose(x.id, `type ${t}, read back trimmed`);
      let text, vis = '';
      if (has(p.visibility)) { if (p.visibility in VIS) vis = VIS[p.visibility]; else lose(x.id, `visibility ${p.visibility}`); }
      // a label that is a number or true is written as its text, as the other writers write one (audit 30); another value
      // (an object) is not text a member line holds, so the member is not written and is said
      const lab = mermaidText(x.label);
      if (x.type === 'uml.EnumerationLiteral') text = typeof lab === 'string' ? lab : null;
      else if (x.type === 'uml.Operation') {
        const params = arr(p.parameters).filter(isObj).map(a => (has(a.direction) ? a.direction + ' ' : '') + (a.name ?? '') + (has(a.valueType) ? ' : ' + gen(a.valueType) : ''));
        text = `${vis}${x.label}(${params.join(', ')})${has(p.returnType) ? ' ' + gen(p.returnType) : ''}${p.isAbstract ? '*' : ''}${p.isStatic ? '$' : ''}`;
      } else if (x.type === 'uml.Property') {
        const colon = has(p.valueType) || has(p.multiplicity) || /\s/.test(x.label);
        // a type ending in * or $ would read as the abstract or static marker at the line's end: Mermaid's `char* data` keeps it
        if (/[*$]$/.test(String(p.valueType ?? '').trim())) text = `${vis}${p.isDerived ? '/' : ''}${gen(p.valueType)}${has(p.multiplicity) ? `[${p.multiplicity}]` : ''} ${x.label}${p.default != null ? ' = ' + p.default : ''}${p.isStatic ? '$' : ''}`;
        else text = `${vis}${p.isDerived ? '/' : ''}${x.label}${colon ? ' :' + (has(p.valueType) ? ' ' + gen(p.valueType) : '') : ''}${has(p.multiplicity) ? `[${p.multiplicity}]` : ''}${p.default != null ? ' = ' + p.default : ''}${p.isStatic ? '$' : ''}`;
      }
      // a member is one line of the class's body, which a line break, a lone }, a << or a %% would end or turn into another
      // statement (as does a } at its end with no { before it, which the reader takes for the body's end, audit 19); and one the
      // reader would read as another member (a name holding : ( ) ~ =, or led by + - # ~) is not written
      const back = text != null && mcMember(text, n.type === 'uml.Enumeration');
      // and one that reads back with another type, static or abstract mark or parameters (a return type char* reads as abstract)
      const bp = back ? back.props ?? {} : {}, same = (a, b) => (has(a) ? String(a).trim() : '') === (has(b) ? String(b).trim() : '');
      const drift = back && x.type !== 'uml.EnumerationLiteral' && (!!bp.isStatic !== !!p.isStatic || (x.type === 'uml.Property' ? back.abstractField || !same(bp.valueType, p.valueType)
        : !!bp.isAbstract !== !!p.isAbstract || !same(bp.returnType, p.returnType) || JSON.stringify(arr(bp.parameters).map(a => [a.name ?? '', a.valueType ?? ''])) !== JSON.stringify(arr(p.parameters).filter(isObj).map(a => [String(a.name ?? '').trim(), has(a.valueType) ? String(a.valueType).trim() : '']))));
      if (!back || drift || back.type !== x.type || back.label !== lab || badId(x.id) || nl(text) || /^(\}$|<<|%%)/.test(text.trim()) || (text.trim().endsWith('}') && !text.includes('{'))) { skip(x); continue; }
      // its stereotypes as <<x>> in front, which the reader takes off as them (audit 17); one it would not read back as itself is said
      const st = arr(p.stereotypes).filter(s => { const ok = typeof s === 'string' && s !== '' && s.trim() === s && !nl(s) && !s.includes('>>') && !s.endsWith('>') && !s.startsWith('<') && !text.trim().endsWith('>>');
        if (!ok) lose(x.id, `stereotype ${s}`); return ok; });
      extra(x, ['id', 'type', 'label'], [...(x.type === 'uml.Property' ? ['visibility', 'valueType', 'multiplicity', 'default', 'isStatic', 'isDerived']
        : x.type === 'uml.Operation' ? ['visibility', 'parameters', 'returnType', 'isAbstract', 'isStatic'] : []), 'stereotypes']);
      rows.push([idOf(x.id, `${n.id}.${x.label}`), st.map(s => `<<${s}>> `).join('') + text]);
    }
    heads.set(n.id, [anns, rows]);
  }

  const byEdge = new Map();
  for (const x of arr(m.edges)) if (isObj(x) && !byEdge.has(x.id)) byEdge.set(x.id, x); // the first of an id, as find gave
  const edgeOf = e => (typeof e === 'string' ? byEdge.get(e) : e);
  const owner = new Map(shown.flatMap(id => arr(byId.get(id).members).filter(isObj).map(x => [x.id, id])));
  const inView = id => shownSet.has(id) || owner.has(id); // a line may end on a member, which Mermaid cannot draw
  const lines = (view && Array.isArray(view.edges) ? view.edges.map(edgeOf) : arr(m.edges).filter(e => isObj(e) && inView(e.from) && inView(e.to))).filter(isObj);
  const relations = [], links = [];
  for (const e of lines) {
    if (e.type === 'uml.CommentLink') { if (badId(e.id)) skip(e); else links.push(e); continue; }
    if (!(written.has(e.from) && written.has(e.to)) || !(e.type === 'uml.Association' || e.type in ARROW) || badId(e.id)) { skip(e); continue; }
    const p = isObj(e.props) ? e.props : {}, ends = isObj(p.ends) ? p.ends : {};
    extra(e, ['id', 'type', 'from', 'to', 'label'], ['ends', 'stereotypes']);
    // the label's own « and its spaces at either end as entities: the reader takes its «stereotypes» before it decodes, and trims
    // a stereotype's » as an entity too, or it would end there; the reader trims one, so one with spaces at its ends is not written;
    // and a } at its end, which the reader would take for a block's end (audit 19)
    const label = [...arr(p.stereotypes).filter(s => String(s).trim() === String(s) || (lose(e.id, `stereotype ${s}`), false)).map(s => `«${enc(s).replace(/»/g, c => `#${c.codePointAt(0)};`)}»`), ...(has(e.label) ? [enc(e.label).replace(/^\s|\s$|«|\}$/g, c => `#${c.codePointAt(0)};`)] : [])].join(' ');
    let arrow = ARROW[e.type], c1 = '', c2 = '';
    if (!arrow) { // an end has one mark: a diamond, or else an arrowhead
      const mark = (end, nav, w) => {
        const dia = end.aggregation === 'composite' ? '*' : end.aggregation === 'shared' ? 'o' : '';
        if (dia && end.navigable) lose(e.id, `navigable at the ${w} end, which has a ${end.aggregation} diamond`);
        return dia || (end.navigable ? nav : '');
      };
      const card = end => { const t = [end.role, end.multiplicity].filter(has).join(' '); return t ? ` "${enc(t)}"` : ''; };
      const f = isObj(ends.from) ? ends.from : {}, t = isObj(ends.to) ? ends.to : {};
      arrow = mark(f, '<', 'from') + '--' + mark(t, '>', 'to'); c1 = card(f); c2 = card(t);
    }
    relations.push([idOf(e.id, `${e.from}-${e.to}`), `${name(e.from)}${c1} ${arrow}${c2} ${name(e.to)}${label ? ' : ' + label : ''}`]);
  }
  const linksFrom = new Map(), noteIds = new Set(notes.map(n => n.id)); // by note, once: a note's links are not a scan of all
  for (const e of links) { if (!linksFrom.has(e.from)) linksFrom.set(e.from, []); linksFrom.get(e.from).push(e); }
  const noteLines = notes.map((n, k) => {
    const its = linksFrom.get(n.id) || [], mine = its.filter(e => written.has(e.to));
    its.filter(e => e !== mine[0]).forEach(skip);
    const hint = idOf(n.id, `note-${k + 1}`), link = mine[0] ? idOf(mine[0].id, `${n.id}-link`) : null;
    extra(n, ['id', 'type', 'label', 'parent']); if (mine[0]) extra(mine[0], ['id', 'type', 'from', 'to']);
    return [hint, link, `note ${mine[0] ? `for ${name(mine[0].to)} ` : ''}"${enc(n.label ?? '')}"`];
  });
  links.filter(e => !noteIds.has(e.from)).forEach(skip);

  const labelled = (n, as = n.id) => (has(n.label) && n.label !== as ? `["${enc(n.label)}"]` : '');
  // Mermaid names a namespace inside P as P.<name>, and splits a name at its dots, in backticks too. So a namespace whose
  // id is its parent's, a dot and a plain name, under a parent written so too or plain at the top, is written at the top
  // by that dotted id, which Mermaid and the reader both read as that nesting with those ids; and one whose block would
  // hold only such namespaces is written by them alone
  // a written namespace's name clashes only with a written namespace beside it: the reader, as Mermaid, keys namespaces
  // by their parent and their name, apart from classes
  const plain = id => /^[\p{L}\p{N}_]+(-[\p{L}\p{N}_]+)*$/u.test(id), top = new Set(roots), dotted = new Set();
  const nsKids = new Map([...kids].map(([p, ks]) => [p, new Set(ks.filter(k => isPkg(k) && full.has(k.id)).map(k => String(k.id)))]));
  for (const n of tree) if (isPkg(n) && full.has(n.id) && !top.has(n)) {
    const id = String(n.id), up = String(n.parent), seg = id.slice(up.length + 1), parts = id.split('.').length; // the reader reads MC_DOTS at most
    if (id === `${up}.${seg}` && plain(seg) && parts <= MC_DOTS && (dotted.has(n.parent) || (top.has(byId.get(n.parent)) && plain(up))) && !nsKids.get(n.parent).has(seg)) dotted.add(n.id);
  }
  // by a stack, as the tree is walked: a namespace's opening line, what it holds, then its } (a string on the stack)
  const emit = (first, pad0) => {
    for (const st = [[first, pad0]]; st.length;) {
      const [n, pad] = st.pop();
      if (typeof n === 'string') { out.push(n); continue; }
      if (isPkg(n)) {
        const inner = (kids.get(n.id) || []).filter(k => !isPkg(k) || (full.has(k.id) && !dotted.has(k.id)));
        const as = dotted.has(n.id) ? String(n.id).slice(String(n.parent).length + 1) : n.id; // the name the reader gives its label
        if (!full.has(n.id)) continue;
        if (!inner.length) { if (has(n.label) && n.label !== as) lose(n.id, `its label ${typeof n.label === 'string' ? n.label : jsonText(n.label)}: it holds only namespaces, written by their dotted names`); continue; }
        out.push(`${pad}namespace ${dotted.has(n.id) ? n.id : name(n.id)}${labelled(n, as)} {`);
        st.push([`${pad}}`]);
        const in2 = pad.length < 64 ? pad + '  ' : pad; // indented 32 deep at most, so a deep model's text is not deep * deep long
        for (let k = inner.length - 1; k >= 0; k--) st.push([inner[k], in2]);
        continue;
      }
      const [anns, rows] = heads.get(n.id), head = `${pad}class ${name(n.id)}${labelled(n)}`;
      if (!anns.length && !rows.length) { out.push(head); continue; }
      out.push(head + ' {', ...anns.map(a => `${pad}  <<${a}>>`));
      for (const [hint, text] of rows) out.push(...(hint ? [`${pad}  %% id: ${hint}`] : []), `${pad}  ${text}`);
      out.push(`${pad}}`);
    }
  };
  roots.forEach(n => emit(n, '  '));
  for (const n of tree) if (dotted.has(n.id)) emit(n, '  ');
  for (const [hint, text] of relations) out.push(...(hint ? [`  %% id: ${hint}`] : []), `  ${text}`);
  for (const [hint, link, text] of noteLines) out.push(...(hint ? [`  %% id: ${hint}`] : []), ...(link ? [`  %% link-id: ${link}`] : []), `  ${text}`);
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  // unindented when indented text would be over the reader's own limit; text still over it (long ids, a state or class
  // declared again) cannot be read again, and says so in its last line
  const text = out.join('\n') + '\n', t = text.length > MC_LIMIT ? text.replace(/^[ \t]+/gm, '') : text;
  return t.length > MC_LIMIT ? t + `%% not written: text the reader reads back: this is ${t.length} characters, over its limit of ${MC_LIMIT}\n` : t;
}

export { readMermaidClass, writeMermaidClass };
