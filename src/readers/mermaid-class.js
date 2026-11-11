/* ---------- Mermaid classDiagram: a reader and a writer (plan.md 1.10; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's class diagram page (docs/syntax/classDiagram.md, read 11 Nov 2026). Internal: the CLI
   (`umlimator.py import`) imports this file through Node; a host gets it once the registry is public.

   readMermaidClass(text) -> { model, report }: a version-2 model with one `uml.class` view, in docs/diagrams/model.md's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). The reader is hand-written and linear, and refuses text over MC_LIMIT characters (R2). Ids come
   from the source's names (a class's, a namespace's; a member is <class>.<name>, a relation <from>-<to>, a note
   note-<n>), so the same source always gives the same ids (R3). It never throws.

   writeMermaidClass(model, viewId?) -> text: one class view as Mermaid. What Mermaid cannot carry is kept in its comments:
   an id the reader would not derive, as `%% id: <id>` (and `%% link-id:` for a note's line) above its statement; an
   element the subset leaves out, as `%% not written: <id> (<type>)`. A view's layout and present are not written.

   How UML maps onto Mermaid's text, both ways:
   - classes: `<<interface>>`, `<<enumeration>>`, `<<dataType>>`, `<<primitive>>` pick the type, `<<abstract>>` sets
     isAbstract; any other annotation is a stereotype;
   - attributes: `+name : Type[0..1] = default`, `/` for derived, a closing `$` for static; Mermaid's own `Type name`
     is read too. Operations: `+name(p : T, out q : U) Return`, a closing `*` abstract, `$` static. `List~int~` is
     List<int>. In an enumeration a bare name is a literal;
   - relations: `--` an association (`*`, `o` its aggregation, `<`, `>` its navigability, a quoted cardinality
     "role multiplicity" by each end), `--|>` a generalization, `..|>` an interface realization, `..>` a dependency,
     its label `«stereotype» text` after `:`. A relation runs left to right, so a child is on the left of `--|>`;
   - namespaces are packages, notes comments, `note for` a comment with its line; `direction TB` is down, `LR` right. */
const MC_LIMIT = 1 << 20; // characters; a class diagram a person writes is a few kilobytes
const MC_VIS = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const MC_TYPES = { interface: 'uml.Interface', enumeration: 'uml.Enumeration', enum: 'uml.Enumeration', datatype: 'uml.DataType', primitive: 'uml.PrimitiveType', primitivetype: 'uml.PrimitiveType' };
const MC_VIEW = 'class-diagram'; // the view's id when the source does not name it
const mcWord = c => c != null && /[\p{L}\p{N}_]/u.test(c);
const mcId = name => String(name).replaceAll('->', '-'); // an id never holds "->", which names a map's lines by position

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

// a "quoted" string at k: [text, after]
function mcQuoted(s, k) { if (s[k] !== '"') return null; const e = s.indexOf('"', k + 1); return e < 0 ? null : [s.slice(k + 1, e), e + 1]; }

// the last whitespace outside <...>, or -1: where `Type name` splits
function mcLastSpace(s) {
  let depth = 0, at = -1;
  for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '<') depth++; else if (c === '>') depth = Math.max(0, depth - 1); else if ((c === ' ' || c === '\t') && depth === 0) at = k; }
  return at;
}

// a type with its multiplicity: "String[0..1]" -> ["String", "0..1"]; "int[]" stays a type
function mcMult(type) {
  const t = type.trim(), lb = t.lastIndexOf('[');
  if (!t.endsWith(']') || lb < 0) return [t, undefined];
  const inner = t.slice(lb + 1, -1).replace(/\s/g, '');
  return inner && /^[0-9*n.]+$/.test(inner) ? [t.slice(0, lb).trim(), inner] : [t, undefined];
}

// `name : Type` or Mermaid's `Type name` or `name`, generics already turned to <>: { name, valueType?, multiplicity? }
function mcTyped(s, colonFirst) {
  let name, type = '';
  const colon = colonFirst ? s.indexOf(':') : -1;
  if (colon >= 0) { name = s.slice(0, colon).trim(); type = s.slice(colon + 1); }
  else { const sp = mcLastSpace(s.trim()); name = sp < 0 ? s.trim() : s.trim().slice(sp + 1); type = sp < 0 ? '' : s.trim().slice(0, sp); }
  const [valueType, multiplicity] = mcMult(type);
  return { name, ...(valueType ? { valueType } : {}), ...(multiplicity ? { multiplicity } : {}) };
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
    let ret = close > open ? t.slice(close + 1).trim() : '';
    if (ret.startsWith(':')) ret = ret.slice(1).trim();
    const parameters = [];
    let depth = 0, from = 0;
    for (let k = 0; k <= inner.length; k++) {
      const c = inner[k];
      if (c === '<') depth++; else if (c === '>') depth = Math.max(0, depth - 1);
      else if (k === inner.length || (c === ',' && depth === 0)) {
        let p = inner.slice(from, k).trim(); from = k + 1;
        if (!p) continue;
        const sp = p.search(/\s/), first = sp < 0 ? '' : p.slice(0, sp), direction = ['in', 'out', 'inout', 'return'].includes(first) ? first : undefined;
        if (direction) p = p.slice(sp).trim();
        const { name, valueType } = mcTyped(p, true);
        parameters.push({ name, ...(valueType ? { valueType } : {}), ...(direction ? { direction } : {}) });
      }
    }
    if (parameters.length) props.parameters = parameters;
    if (ret) props.returnType = ret;
    if (isStatic) props.isStatic = true;
    if (isAbstract) props.isAbstract = true;
    return { type: 'uml.Operation', label: t.slice(0, open).trim(), props };
  }
  if (t.startsWith('/')) { props.isDerived = true; t = t.slice(1).trimStart(); }
  const eq = t.indexOf('='), colon = t.indexOf(':');
  let head = t, def;
  if (colon >= 0 && (eq < 0 || colon < eq)) { const r = t.slice(colon + 1), e = r.indexOf('='); head = t.slice(0, colon + 1) + (e < 0 ? r : r.slice(0, e)); def = e < 0 ? undefined : r.slice(e + 1).trim(); }
  else if (eq >= 0) { head = t.slice(0, eq); def = t.slice(eq + 1).trim(); }
  const { name, valueType, multiplicity } = mcTyped(head, true);
  Object.assign(props, valueType ? { valueType } : {}, multiplicity ? { multiplicity } : {}, def !== undefined ? { default: def } : {}, isStatic ? { isStatic: true } : {});
  return { type: 'uml.Property', label: name, props, abstractField: isAbstract };
}

// a relation: A ["c1"] arrow ["c2"] B [: label], or null when the text is not one
function mcRelation(s) {
  const a = mcName(s, 0); if (!a) return null;
  let k = mcSkip(s, a[1]), c1, c2, left = '', right = '';
  const q1 = mcQuoted(s, k); if (q1) { c1 = q1[0]; k = mcSkip(s, q1[1]); }
  for (const m of ['<|', '()', '*', 'o', '<']) if (s.startsWith(m, k)) { left = m; k += m.length; break; }
  const line = s.startsWith('--', k) ? 'solid' : s.startsWith('..', k) ? 'dashed' : null;
  if (!line) return null;
  k += 2;
  for (const m of ['|>', '()', '*', 'o', '>']) if (s.startsWith(m, k) && (!'*o'.includes(m) || k + 1 >= s.length || ' \t"'.includes(s[k + 1]))) { right = m; k += m.length; break; }
  k = mcSkip(s, k);
  const q2 = mcQuoted(s, k); if (q2) { c2 = q2[0]; k = mcSkip(s, q2[1]); }
  const b = mcName(s, k); if (!b) return null;
  k = mcSkip(s, b[1]);
  if (k < s.length && s[k] !== ':') return null;
  return { a: a[0], b: b[0], c1, c2, left, right, line, label: k < s.length ? s.slice(k + 1).trim() : '' };
}

// a cardinality's text as an end: "1", "0..*", "lines 1..*", "lines"; Mermaid's "many" is *
function mcEnd(text, say) {
  const t = mcText(text).trim(), sp = t.lastIndexOf(' '), last = sp < 0 ? t : t.slice(sp + 1), role = sp < 0 ? '' : t.slice(0, sp).trim();
  const mult = /^(\d+|\*|n|many)(\.\.(\d+|\*|n))?$/.test(last) ? last : null;
  if (mult === 'many') say('approximated', 'cardinality "many" is read as the multiplicity *');
  const end = mult ? { ...(role ? { role } : {}), multiplicity: mult === 'many' ? '*' : mult } : t ? { role: t } : {};
  return end;
}

function readMermaidClass(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
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
        if (val.startsWith('"')) { try { title = JSON.parse(val); } catch { title = val.slice(1, -1); } }
        else title = val.startsWith("'") ? val.slice(1, -1).replaceAll("''", "'") : val;
      } else say(j + 1, 'skipped', `front matter ${key}: Mermaid's configuration is not read`);
    }
    if (j >= lines.length) { say(i + 1, 'skipped', 'the front matter is never closed with ---: nothing read'); return empty(); }
    i = j + 1;
  }

  const classes = new Map(), packages = new Map(), order = [], relations = [], notes = [], stack = [];
  let viewId, direction = 'down', started = false, hint = {}, block = null;
  const cls = name => {
    const id = mcId(name);
    if (!classes.has(id)) { const rec = { kind: 'class', node: { id, type: 'uml.Class', label: name }, anns: [], raw: [] }; classes.set(id, rec); order.push(rec); }
    return classes.get(id);
  };
  const where = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].kind === 'package') return stack[k]; return null; };
  const annotate = (rec, s) => { const e = s.indexOf('>>', 2); rec.anns.push((e < 0 ? s.slice(2) : s.slice(2, e)).trim()); return e < 0 ? s.length : e + 2; };
  const member = (rec, s, no) => { if (s.trim()) rec.raw.push({ text: s, line: no, hint: hint.id }); };

  for (; i < lines.length; i++) {
    const no = i + 1, s = lines[i].trim();
    if (!s) continue;
    if (block) { if (s.includes('}')) block = null; continue; } // inside accDescr { ... }
    if (s.startsWith('%%')) {
      const c = s.slice(2).trim();
      if (c.startsWith('{')) say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
      else if (c.startsWith('id:')) hint.id = c.slice(3).trim();
      else if (c.startsWith('link-id:')) hint.link = c.slice(8).trim();
      continue;
    }
    if (!started) {
      if (!/^classDiagram(-v2)?$/.test(s)) { say(no, 'skipped', 'not a Mermaid classDiagram: nothing read'); return empty(); }
      started = true; viewId = hint.id; hint = {}; continue;
    }
    const top = stack[stack.length - 1];
    const cut = s.search(/[\s{:("[<`]/), word = cut < 0 ? s : s.slice(0, cut);
    if (top && top.kind === 'class') { // a class body
      if (s === '}') stack.pop();
      else if (s.startsWith('<<')) annotate(top.rec, s);
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
      if (!n) { say(no, 'skipped', 'a class with no name'); hint = {}; continue; }
      const rec = cls(n[0]), pkg = where();
      if (pkg) rec.node.parent = pkg.node.id;
      let k = n[1], rest = '';
      while (k < s.length) {
        k = mcSkip(s, k);
        if (k >= s.length) break;
        if (s[k] === '~') {
          let depth = 0, e = k;
          for (; e < s.length; e++) if (s[e] === '~') { if (mcWord(s[e - 1]) && mcWord(s[e + 1]) || e === k) depth++; else if (--depth === 0) break; }
          rec.node.label = mcGeneric(n[0] + s.slice(k, e + 1));
          say(no, 'approximated', `class ${n[0]}'s type parameter is kept in its name only, ${rec.node.label} (templates are not in the subset)`);
          k = e + 1;
        } else if (s.startsWith('["', k)) {
          const q = mcQuoted(s, k + 1); if (!q || s[q[1]] !== ']') { rest = s.slice(k); break; }
          rec.node.label = mcText(q[0]); k = q[1] + 1;
        } else if (s.startsWith('<<', k)) k = annotate(rec, s.slice(k)) + k;
        else if (s.startsWith(':::', k)) {
          const c = mcName(s, k + 3); say(no, 'skipped', `:::${c ? c[0] : ''} on class ${n[0]}: styling is not read`); k = c ? c[1] : k + 3;
        } else if (s[k] === '{') {
          const after = s.slice(k + 1).trim();
          if (after === '}') break;
          if (after.endsWith('}')) { member(rec, after.slice(0, -1), no); break; }
          stack.push({ kind: 'class', rec }); member(rec, after, no); break;
        } else { rest = s.slice(k); break; }
      }
      if (rest) say(no, 'skipped', `class ${n[0]}: "${rest}" is not read`);
    } else if (word === 'namespace') {
      const n = mcName(s, mcSkip(s, 9), true);
      if (!n) { say(no, 'skipped', 'a namespace with no name'); hint = {}; continue; }
      let k = mcSkip(s, n[1]), label;
      if (s.startsWith('["', k)) { const q = mcQuoted(s, k + 1); if (q && s[q[1]] === ']') { label = mcText(q[0]); k = mcSkip(s, q[1] + 1); } }
      const segs = n[2] ? [n[0]] : n[0].split('.');
      let parent = where();
      segs.forEach((seg, j) => {
        const id = mcId(segs.slice(0, j + 1).join('.'));
        if (!packages.has(id)) {
          const rec = { kind: 'package', node: { id, type: 'uml.Package', label: seg, ...(parent ? { parent: parent.node.id } : {}) } };
          packages.set(id, rec); order.push(rec);
        }
        parent = packages.get(id);
      });
      if (label) parent.node.label = label;
      if (s[k] === '{') { if (s.slice(k + 1).trim() !== '}') stack.push(parent); }
      else say(no, 'skipped', `namespace ${n[0]} has no {: what follows is not inside it`);
    } else if (word === 'note') {
      let k = mcSkip(s, 4), target;
      if (s.startsWith('for ', k)) { const n = mcName(s, mcSkip(s, k + 4)); if (n) { target = cls(n[0]); k = mcSkip(s, n[1]); } }
      const q = mcQuoted(s, k);
      if (!q) say(no, 'skipped', 'a note with no "text"');
      else { const rec = { kind: 'note', node: { type: 'uml.Comment', label: mcText(q[0]) }, target, hint: hint.id, linkHint: hint.link }; notes.push(rec); order.push(rec); }
    } else if (s.startsWith('<<')) {
      const e = s.indexOf('>>'), n = e < 0 ? null : mcName(s, mcSkip(s, e + 2));
      if (n) annotate(cls(n[0]), s); else say(no, 'skipped', `${s}: an annotation names no class`);
    } else if (['click', 'link', 'callback'].includes(word)) say(no, 'skipped', `${word}: links and callbacks are not read`);
    else if (['style', 'classDef', 'cssClass'].includes(word)) say(no, 'skipped', `${word}: styling is not read`);
    else if (word.startsWith('accTitle') || word.startsWith('accDescr')) {
      say(no, 'skipped', `${word.startsWith('accTitle') ? 'accTitle' : 'accDescr'}: accessibility text is not read`);
      if (word.startsWith('accDescr') && s.includes('{') && !s.includes('}')) block = true;
    } else {
      const r = mcRelation(s);
      if (r) { relations.push({ ...r, no, hint: hint.id, from: cls(r.a), to: cls(r.b) }); hint = {}; continue; }
      const n = mcName(s, 0), k = n ? mcSkip(s, n[1]) : -1;
      if (n && s[k] === ':') member(cls(n[0]), s.slice(k + 1), no);
      else if (n && k >= s.length) cls(n[0]);
      else say(no, 'skipped', `"${s.length > 60 ? s.slice(0, 57) + '...' : s}" is not understood`);
    }
    hint = {};
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid classDiagram: nothing read'); return empty(); }
  for (const open of stack) say(lines.length, 'approximated', `${open.kind === 'class' ? 'class ' + open.rec.node.id : 'namespace ' + open.node.id} is never closed: read to the end`);

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
    }
    if (!e) continue;
    let label = mcText(r.label);
    const stereotypes = [];
    for (;;) {
      label = label.trim();
      const [o, c] = label.startsWith('«') ? ['«', '»'] : label.startsWith('<<') ? ['<<', '>>'] : [];
      const end = o ? label.indexOf(c, o.length) : -1;
      if (end < 0) break;
      stereotypes.push(label.slice(o.length, end).trim()); label = label.slice(end + c.length);
    }
    if (stereotypes.length) e.props = { ...e.props, stereotypes };
    if (label) e.label = label;
    edges.push({ e, hint: r.hint });
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

  // ids: classes and namespaces by their names; then members, relations and notes in the order they come, made unique
  const used = new Set(classes.keys()), uniq = name => { const base = mcId(name); let id = base, k = 2; while (used.has(id)) id = `${base}-${k++}`; used.add(id); return id; };
  for (const p of packages.values()) if (classes.has(p.node.id)) {
    const was = p.node.id; p.node.id = uniq(was + '-namespace');
    for (const x of order) if (x.node.parent === was && x.kind !== 'note') x.node.parent = p.node.id;
    say(1, 'approximated', `namespace ${was} has a class's name: it is ${p.node.id}`);
  } else used.add(p.node.id);
  for (const rec of classes.values()) {
    const members = [];
    for (const r of rec.raw) {
      const { abstractField, ...x } = mcMember(r.text, rec.node.type === 'uml.Enumeration');
      if (!x.label) { say(r.line, 'skipped', `"${r.text.trim()}": a member with no name`); continue; }
      if (abstractField) say(r.line, 'approximated', `${rec.node.id}.${x.label}: an attribute is not abstract, so its * is not read`);
      if (x.props && !Object.keys(x.props).length) delete x.props;
      members.push({ id: uniq(r.hint ?? `${rec.node.id}.${x.label}`), ...x });
    }
    if (members.length) rec.node.members = members;
  }
  const out = edges.map(({ e, hint }) => ({ id: uniq(hint ?? `${e.from}-${e.to}`), ...e }));
  notes.forEach((rec, k) => {
    rec.node = { id: uniq(rec.hint ?? `note-${k + 1}`), ...rec.node };
    if (rec.target) out.push({ id: uniq(rec.linkHint ?? `${rec.node.id}-link`), type: 'uml.CommentLink', from: rec.node.id, to: rec.target.node.id });
  });

  const nodes = order.map(x => x.node), view = { id: viewId || MC_VIEW, diagram: 'uml.class', ...(title ? { title } : {}), ...(direction === 'down' ? { direction } : {}), nodeIds: nodes.map(n => n.id) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges: out, views: [view] }, report };
}

function writeMermaidClass(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'uml.class') || views[0];
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  const shown = (view ? arr(view.nodeIds) : [...byId.keys()]).filter(id => byId.has(id));
  const KIND = { 'uml.Class': '', 'uml.Interface': 'interface', 'uml.Enumeration': 'enumeration', 'uml.DataType': 'dataType', 'uml.PrimitiveType': 'primitive' };
  const has = x => x != null && x !== '', gen = s => String(s).replace(/[<>]/g, '~');
  const enc = s => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\n/g, '<br>');
  const name = id => (/^[\p{L}\p{N}_]+(-[\p{L}\p{N}_]+)*$/u.test(id) ? id : '`' + id + '`');
  const out = [], notWritten = [];
  const title = view && has(view.title) ? view.title : m.title;
  if (has(title)) out.push('---', `title: ${/^[\p{L}\p{N}][\p{L}\p{N} _.,()-]*$/u.test(title) && !title.endsWith(' ') ? title : JSON.stringify(String(title))}`, '---');
  if (view && view.id !== MC_VIEW) out.push(`%% id: ${view.id}`);
  out.push('classDiagram', view && view.direction === 'down' ? '  direction TB' : '  direction LR');

  // what is written, in the reader's order: namespaces and classes as a tree, then relations, then notes
  const shownSet = new Set(shown), isPkg = n => n.type === 'uml.Package';
  const kids = new Map(), roots = [], notes = [], tree = [];
  for (const id of shown) {
    const n = byId.get(id);
    if (n.type === 'uml.Comment') notes.push(n);
    else if (!isPkg(n) && !(n.type in KIND)) notWritten.push(n);
    else if (shownSet.has(n.parent) && isPkg(byId.get(n.parent))) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    else roots.push(n);
  }
  const walk = n => { tree.push(n); for (const k of kids.get(n.id) || []) walk(k); };
  roots.forEach(walk);
  const written = new Set(tree.filter(n => !isPkg(n)).map(n => n.id));
  const used = new Set(tree.map(n => n.id));
  const idOf = (id, name) => { const base = mcId(name); let d = base, k = 2; while (used.has(d)) d = `${base}-${k++}`; used.add(id); return d === id ? null : id; }; // the hint, if one is needed

  const memberLines = new Map();
  for (const n of tree) if (!isPkg(n)) {
    const rows = [];
    for (const x of arr(n.members).filter(isObj)) {
      const p = isObj(x.props) ? x.props : {}, vis = { public: '+', private: '-', protected: '#', package: '~' }[p.visibility] || '';
      let text;
      if (x.type === 'uml.EnumerationLiteral') text = x.label;
      else if (x.type === 'uml.Operation') {
        const params = arr(p.parameters).filter(isObj).map(a => (has(a.direction) ? a.direction + ' ' : '') + (a.name ?? '') + (has(a.valueType) ? ' : ' + gen(a.valueType) : ''));
        text = `${vis}${x.label}(${params.join(', ')})${has(p.returnType) ? ' ' + gen(p.returnType) : ''}${p.isAbstract ? '*' : ''}${p.isStatic ? '$' : ''}`;
      } else if (x.type === 'uml.Property') {
        const colon = has(p.valueType) || has(p.multiplicity) || /\s/.test(x.label);
        text = `${vis}${p.isDerived ? '/' : ''}${x.label}${colon ? ' :' + (has(p.valueType) ? ' ' + gen(p.valueType) : '') : ''}${has(p.multiplicity) ? `[${p.multiplicity}]` : ''}${p.default != null ? ' = ' + p.default : ''}${p.isStatic ? '$' : ''}`;
      }
      if (text == null || !has(x.label)) { notWritten.push(x); continue; }
      rows.push([idOf(x.id, `${n.id}.${x.label}`), text]);
    }
    memberLines.set(n.id, rows);
  }

  const edgeOf = e => (typeof e === 'string' ? arr(m.edges).find(x => isObj(x) && x.id === e) : e);
  const lines = (view && Array.isArray(view.edges) ? view.edges.map(edgeOf) : arr(m.edges).filter(e => isObj(e) && shownSet.has(e.from) && shownSet.has(e.to))).filter(isObj);
  const ARROW = { 'uml.Generalization': '--|>', 'uml.InterfaceRealization': '..|>', 'uml.Dependency': '..>' };
  const relations = [], links = [];
  for (const e of lines) {
    if (e.type === 'uml.CommentLink') { links.push(e); continue; }
    if (!(written.has(e.from) && written.has(e.to)) || !(e.type === 'uml.Association' || ARROW[e.type])) { notWritten.push(e); continue; }
    const p = isObj(e.props) ? e.props : {}, ends = isObj(p.ends) ? p.ends : {};
    const label = [...arr(p.stereotypes).map(s => `«${s}»`), ...(has(e.label) ? [e.label] : [])].join(' ');
    let arrow = ARROW[e.type], c1 = '', c2 = '';
    if (!arrow) {
      const mark = (end, nav) => (end.aggregation === 'composite' ? '*' : end.aggregation === 'shared' ? 'o' : end.navigable ? nav : '');
      const card = end => { const t = [end.role, end.multiplicity].filter(has).join(' '); return t ? ` "${enc(t)}"` : ''; };
      const f = isObj(ends.from) ? ends.from : {}, t = isObj(ends.to) ? ends.to : {};
      arrow = mark(f, '<') + '--' + mark(t, '>'); c1 = card(f); c2 = card(t);
    }
    relations.push([idOf(e.id, `${e.from}-${e.to}`), `${name(e.from)}${c1} ${arrow}${c2} ${name(e.to)}${label ? ' : ' + enc(label) : ''}`]);
  }
  const noteLines = notes.map((n, k) => {
    const mine = links.filter(e => e.from === n.id && written.has(e.to));
    links.filter(e => e.from === n.id && e !== mine[0]).forEach(e => notWritten.push(e));
    const hint = idOf(n.id, `note-${k + 1}`), link = mine[0] ? idOf(mine[0].id, `${n.id}-link`) : null;
    return [hint, link, `note ${mine[0] ? `for ${name(mine[0].to)} ` : ''}"${enc(n.label ?? '')}"`];
  });
  links.filter(e => !notes.some(n => n.id === e.from)).forEach(e => notWritten.push(e));

  const labelled = n => (has(n.label) && n.label !== n.id ? `["${enc(n.label)}"]` : '');
  const emit = (n, pad) => {
    if (isPkg(n)) {
      out.push(`${pad}namespace ${name(n.id)}${labelled(n)} {`);
      for (const k of kids.get(n.id) || []) emit(k, pad + '  ');
      return out.push(`${pad}}`);
    }
    const p = isObj(n.props) ? n.props : {}, anns = [...(KIND[n.type] ? [KIND[n.type]] : []), ...(p.isAbstract ? ['abstract'] : []), ...arr(p.stereotypes)];
    const rows = memberLines.get(n.id), head = `${pad}class ${name(n.id)}${labelled(n)}`;
    if (!anns.length && !rows.length) return out.push(head);
    out.push(head + ' {', ...anns.map(a => `${pad}  <<${a}>>`));
    for (const [hint, text] of rows) out.push(...(hint ? [`${pad}  %% id: ${hint}`] : []), `${pad}  ${text}`);
    out.push(`${pad}}`);
  };
  roots.forEach(n => emit(n, '  '));
  for (const [hint, text] of relations) out.push(...(hint ? [`  %% id: ${hint}`] : []), `  ${text}`);
  for (const [hint, link, text] of noteLines) out.push(...(hint ? [`  %% id: ${hint}`] : []), ...(link ? [`  %% link-id: ${link}`] : []), `  ${text}`);
  for (const x of notWritten) out.push(`  %% not written: ${x.id} (${x.type})`);
  return out.join('\n') + '\n';
}

export { readMermaidClass, writeMermaidClass };
