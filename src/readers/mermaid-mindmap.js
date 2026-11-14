/* ---------- Mermaid mindmap: a reader and a writer (notes/milestone-4a.md §8, 4a.5; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's mindmap page (docs/syntax/mindmap.md) and its lexer and database
   (diagrams/mindmap/parser/mindmap.jison, mindmapDb.ts), read on Mermaid's repository 14 Nov 2026. Internal: the CLI
   imports it through Node (umlimator_import.py's TYPED); its helpers are its own (mmr...), since the readers share one
   scope in lib/umlimator-all.js.

   readMermaidMindmap(text) -> { model, report }: a version-2 model with one `mindmap` view, in model.md row 25's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). Hand-written and linear; text over MMR_LIMIT characters is refused (R2). Indentation is the tree:
   a line's parent is the nearest earlier topic with a smaller indent, as mindmapDb's getParent. A tab counts one, as a
   space does: the lexer's indent is a run of [\s]+ and its level that run's length. Topics deeper than MMR_DEEP hang at
   that depth, one report item. Ids (R3): a topic's own (`id[text]`), else one from its text's words, the next free of
   base, base-2 ... `%% id: <id>` above a topic gives it that id, above the header the view's; `%% side: left|right` gives
   a topic `present.<id>.side`, `%% opens: <viewId>` its `opensView`. `[ ]` is the topic itself (the writer's form for an
   id); `( )`, `(( ))`, `)) ((`, `) (` and `{{ }}`, `::icon()`, `:::classes` and a Markdown string are kept under
   `ext.mermaid` and written back, each kind reported `approximated` once. It never throws.

   writeMermaidMindmap(model, viewId?) -> text: one mindmap view, two spaces a level, in `nodeIds` order. A topic is bare
   text when the reader would derive its id from it, else `id[text]`; text quoted with Mermaid's entities where it needs
   it. What Mermaid cannot hold is named in `%% not written:` lines, never written invalid: a further root and what it
   holds, a topic deeper than MMR_DEEP (written at that depth), an element or field the subset leaves out. */
const MMR_LIMIT = 1 << 20; // characters; a mindmap a person writes is a few kilobytes
const MMR_VIEW = 'mindmap'; // the view's id when the source does not name it
const MMR_DEEP = 64; // levels below the root that are read as written; deeper hang at this one (R2)
// the shapes, longest open first: open, close, what ext.mermaid.shape keeps (null: the topic itself), what Mermaid calls it
const MMR_SHAPES = [['((', '))', 'circle', 'a circle'], ['))', '((', 'bang', 'a bang'], ['{{', '}}', 'hexagon', 'a hexagon'],
  ['(', ')', 'rounded', 'a rounded rectangle'], [')', '(', 'cloud', 'a cloud'], ['[', ']', null]];
const MMR_OPEN = new Map(MMR_SHAPES.filter(s => s[2]).map(s => [s[2], s]));
const MMR_ENT = new Map([['quot', '"'], ['lt', '<'], ['gt', '>'], ['amp', '&']]); // a Map: #constructor; is no entity
const MMR_LEAD = /^(%%|:::|::icon\(|mindmap)/i; // a line that starts so is not a topic's name or bare text
const mmrId = s => String(s).replace(/->+/g, '-'); // an id never holds "->" (model.md rule 5)
const mmrClip = s => (s.length > 60 ? s.slice(0, 57) + '...' : s);
// the id a topic's text gives: its words, lower case, joined by -; at most 60 characters
const mmrSlug = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'topic';

function mmrFree(used, next, base) { // the first of base, base-2, ... not in used, resuming where the last ask stopped (R2)
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// text as Mermaid shows it: <br> a line break, its entity codes read; one it does not know kept as written, reported
function mmrText(s, bad) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/#([a-z]+|\d+);/gi, (all, e) => {
    const n = /^\d/.test(e) ? Number(e) : -1, c = n >= 0 ? (n <= 0x10ffff ? String.fromCodePoint(n) : undefined) : MMR_ENT.get(e.toLowerCase());
    if (c === undefined) bad(all);
    return c ?? all;
  });
}

// a topic's line (indent taken off): { id, text, shape, md, quote, after, bare } or { unclosed }. more(): the next line,
// for a Markdown string over several lines, or null. Each search is one indexOf from where the last stopped (R2)
function mmrTopic(s, more) {
  let k = 0;
  while (k < s.length && !'()[]{}'.includes(s[k])) k++;
  if (k === s.length) return { text: s.trim(), bare: true };
  const id = s.slice(0, k).trim(), sh = MMR_SHAPES.find(([o]) => s.startsWith(o, k));
  if (!sh) return { text: s.trim(), bare: true, unclosed: `${s[k]} opens no shape` };
  const [o, c, shape] = sh, j = k + o.length, out = { id, shape };
  let end;
  if (s.startsWith('"`', j)) { // a Markdown string: to its `", over lines if it must
    let q = s.indexOf('`"', j + 2), at = s.length + 1; // `" never spans a line break: each line is searched once
    const parts = [s];
    while (q < 0) { const n = more(); if (n == null) break; parts.push(n); q = n.indexOf('`"'); if (q < 0) at += n.length + 1; else q += at; }
    s = parts.join('\n');
    if (q >= 0 && s.startsWith(c, q + 2)) { out.text = s.slice(j + 2, q); out.md = true; end = q + 2 + c.length; }
    else return { text: parts[0].trim(), bare: true, unclosed: `${o}"\` is not closed by \`"${c}`, rewind: true };
  } else if (s[j] === '"') {
    const q = s.indexOf('"', j + 1);
    if (q >= 0 && s.startsWith(c, q + 1)) { out.text = s.slice(j + 1, q); out.quote = true; end = q + 1 + c.length; }
    else { const e = s.indexOf(c, j); if (e < 0) return { text: s.trim(), bare: true, unclosed: `${o} is not closed by ${c}` }; out.text = s.slice(j, e).trim(); out.openQuote = true; end = e + c.length; }
  } else {
    const e = s.indexOf(c, j);
    if (e < 0) return { text: s.trim(), bare: true, unclosed: `${o} is not closed by ${c}` };
    out.text = s.slice(j, e).trim(); end = e + c.length;
  }
  out.after = s.slice(end).trim();
  return out;
}

function readMermaidMindmap(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: MMR_VIEW, nodes: [], edges: [], views: [{ id: MMR_VIEW, diagram: 'mindmap', nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MMR_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MMR_LIMIT}: nothing read`); return empty(); }
  try { return mmrRead(text, report, say, empty); } catch (e) {
    report.length = 0; say(1, 'skipped', `the reader failed (${mmrClip(String(e && e.message || e))}): nothing read`); return empty();
  }
}

function mmrRead(text, report, say, empty) {
  const lines = text.replace(/^﻿/, '').split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0, title;
  // front matter: its title; Mermaid's configuration (config.layout among it) is not read
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && lines[i].trim() === '---') {
    let j = i + 1, top = '';
    for (; j < lines.length && lines[j].trim() !== '---'; j++) {
      const l = lines[j], t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const c = t.indexOf(':'), key = (c < 0 ? t : t.slice(0, c)).trim(), val = c < 0 ? '' : t.slice(c + 1).trim();
      if (/^\s/.test(l)) { if (top && top !== 'title' && c > 0) say(j + 1, 'skipped', `front matter ${top}.${key}: Mermaid's configuration is not read`); continue; }
      top = val ? '' : key;
      if (key === 'title') {
        if (val.startsWith('"')) { try { title = JSON.parse(val); } catch { title = val.slice(1, -1); } }
        else title = val.startsWith("'") ? val.slice(1, -1).replaceAll("''", "'") : val;
      } else if (val) say(j + 1, 'skipped', `front matter ${key}: Mermaid's configuration is not read`);
    }
    if (j >= lines.length) { say(i + 1, 'skipped', 'the front matter is never closed with ---: nothing read'); return empty(); }
    i = j + 1;
  }

  const topics = [], stack = [], once = new Set(), hints = new Map();
  const first = (key, no, message) => { if (!once.has(key)) { once.add(key); say(no, 'approximated', message); } };
  const unused = () => { for (const [k, h] of hints) say(h.no, 'skipped', `%% ${k}: ${h.v}: no topic below it takes it`); hints.clear(); };
  let started = false, viewId, deep = false, dry = Infinity; // past line dry, no `" is left: an unclosed Markdown string looks no further
  for (; i < lines.length; i++) {
    const no = i + 1, line = lines[i], s = line.trim();
    if (!s) continue;
    if (s.startsWith('%%')) {
      const c = s.slice(2).trim(), h = /^(id|side|opens):(.*)$/.exec(c);
      if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!s.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      } else if (h) {
        const k = h[1], v = h[2].trim(), was = hints.get(k);
        if (was) say(was.no, 'skipped', `%% ${k}: ${was.v}: no topic below it takes it`);
        if (k === 'side' && v !== 'left' && v !== 'right') { hints.delete(k); say(no, 'skipped', `%% side: ${v}: a side is left or right`); } else hints.set(k, { v, no });
      }
      continue;
    }
    if (!started) {
      if (!/^mindmap$/i.test(s)) { say(no, 'skipped', /^mindmap\b/i.test(s) ? `text after mindmap on its line is not read: ${mmrClip(s)}` : 'not a Mermaid mindmap: nothing read'); if (!/^mindmap\b/i.test(s)) return empty(); }
      started = true;
      const h = hints.get('id');
      if (h) { hints.delete('id'); viewId = mmrId(h.v); if (viewId !== h.v) say(h.no, 'approximated', `%% id: ${h.v}: an id holds no "->", so the view is ${viewId}`); }
      unused();
      continue;
    }
    const last = topics.at(-1);
    if (s.startsWith('::icon(')) {
      const e = s.indexOf(')');
      if (!last) { say(no, 'skipped', `${mmrClip(s)}: no topic above it`); continue; }
      (last.mer ||= {}).icon = e < 0 ? s.slice(7) : s.slice(7, e);
      if (e < 0) say(no, 'approximated', `${mmrClip(s)}: ::icon( is not closed, read to the end of the line`);
      first('icon', no, '::icon(): an icon is kept, not drawn');
      continue;
    }
    if (s.startsWith(':::')) {
      if (!last) { say(no, 'skipped', `${mmrClip(s)}: no topic above it`); continue; }
      (last.mer ||= {}).classes = s.slice(3).trim();
      first('classes', no, ':::classes: a class is kept, not drawn');
      continue;
    }
    let ind = 0;
    while (/\s/.test(line[ind])) ind++;
    const t = mmrTopic(line.slice(ind), () => (i + 1 < lines.length && i < dry ? lines[++i].replace(/\r$/, '') : null));
    if (t.rewind) { dry = no - 1; i = no - 1; } // unclosed: the one line read as text, the lines after it read as they are
    if (t.unclosed) say(no, 'approximated', `${mmrClip(t.text)}: ${t.unclosed}, read as text`);
    if (t.after) say(no, 'skipped', `${mmrClip(t.after)}: text after the topic is not read`);
    const bad = e => say(no, 'skipped', `${e}: an entity Mermaid does not know, kept as written`);
    const rec = { no, label: mmrText(t.text, bad), name: t.id || null };
    if (t.openQuote) say(no, 'approximated', `${mmrClip(t.text)}: a quote is not closed, kept as written`);
    if (t.shape) { (rec.mer = {}).shape = t.shape; first(t.shape, no, `${MMR_OPEN.get(t.shape)[3]} ${MMR_OPEN.get(t.shape)[0]} ${MMR_OPEN.get(t.shape)[1]} is kept, drawn as a rounded box`); }
    if (t.md) { (rec.mer ||= {}).markdown = true; first('markdown', no, 'a Markdown string is kept, drawn as plain text'); }
    for (const [k, h] of hints) rec[k] = h;
    hints.clear();
    while (stack.length && stack.at(-1).ind >= ind) stack.pop();
    if (!stack.length && topics.length) say(no, 'approximated', `${mmrClip(rec.label)}: a second root, which Mermaid refuses: read as a topic with no parent`);
    rec.parent = stack.length > MMR_DEEP ? stack[MMR_DEEP - 1] : stack.at(-1) || null;
    if (stack.length > MMR_DEEP && !deep) { deep = true; say(no, 'approximated', `deeper than ${MMR_DEEP} levels: read at level ${MMR_DEEP}`); }
    rec.ind = ind;
    stack.push(rec); topics.push(rec);
  }
  unused();
  if (!started) { say(1, 'skipped', 'not a Mermaid mindmap: nothing read'); return empty(); }

  // ids: a topic's own and hinted ids first, in order; then the rest from their text (or a taken id), in order
  const used = new Set(), next = new Map();
  for (const r of topics) {
    const h = r.id?.v, own = h != null && h !== '' ? h : r.name;
    if (own == null || own === '') continue;
    const t = mmrId(own);
    if (t !== own) say(r.id ? r.id.no : r.no, 'approximated', `${r.id ? '%% id:' : 'topic'} ${own}: an id holds no "->", so it is ${t}`);
    r.base = t;
    if (!used.has(t)) { used.add(t); r.out = t; }
  }
  for (const r of topics) {
    if (r.out) continue;
    r.out = mmrFree(used, next, r.base ?? mmrSlug(r.label)); used.add(r.out);
    if (r.base != null) say(r.id ? r.id.no : r.no, 'approximated', `${r.id ? '%% id:' : 'topic'} ${r.base} is taken, so it is ${r.out}`);
  }
  const vid = viewId || MMR_VIEW, present = new Map();
  const nodes = topics.map(r => {
    const n = { id: r.out, type: 'mindmap.Topic', label: r.label };
    if (r.parent) n.parent = r.parent.out;
    if (r.opens) n.opensView = r.opens.v;
    if (r.mer) n.ext = { mermaid: r.mer };
    if (r.side) present.set(r.out, { side: r.side.v });
    return n;
  });
  const view = { id: vid, diagram: 'mindmap', ...(title ? { title } : {}), nodeIds: nodes.map(n => n.id), ...(present.size ? { present: Object.fromEntries(present) } : {}) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: vid, nodes, edges: [], views: [view] }, report };
}

function writeMermaidMindmap(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), has = x => x != null && x !== '', str = x => typeof x === 'string';
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'mindmap');
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (!view) return '%% not written: the model, which has no mindmap view\n';
  if (view.diagram !== 'mindmap') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a mindmap one\n`;
  const out = [], notWritten = [], lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const title = String(has(view.title) ? view.title : m.title ?? '');
  if (has(title)) out.push('---', `title: ${/^[\p{L}\p{N}][\p{L}\p{N} _.,()-]*$/u.test(title) && !title.endsWith(' ') ? title : JSON.stringify(title)}`, '---');
  const hintable = s => str(s) && s !== '' && s.trim() === s && !/[\r\n]/.test(s);
  if (has(view.id) && view.id !== MMR_VIEW) { if (hintable(view.id)) out.push(`%% id: ${view.id}`); else lose(view.id, "the view's id, which a comment cannot hold"); }
  out.push('mindmap');

  // the shown topics, their children in nodeIds order; the first with no shown parent is the root
  const byId = new Map(), shown = new Map(), kids = new Map(), roots = [];
  for (const n of arr(m.nodes)) if (isObj(n) && !byId.has(n.id)) byId.set(n.id, n);
  for (const id of arr(view.nodeIds)) {
    const n = byId.get(id);
    if (!n || shown.has(id)) continue;
    if (n.type !== 'mindmap.Topic' || !hintable(n.id)) { notWritten.push(`${flat(n.id)} (${flat(n.type)})`); continue; }
    shown.set(id, n);
  }
  for (const n of shown.values()) {
    if (shown.has(n.parent) && n.parent !== n.id) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } else roots.push(n);
  }
  for (const r of roots.slice(1)) lose(r.id, 'a further root, which Mermaid refuses: it and what it holds');
  const ent = c => `#${c.codePointAt(0)};`, enc = s => s.replace(/[#"<`]/g, c => (c === '"' ? '#quot;' : ent(c)));
  const bareOk = s => s !== '' && s.trim() === s && !/[()[\]{}\r\n#<]/.test(s) && !MMR_LEAD.test(s);
  const idOk = s => s.trim() === s && !/[()[\]{}\r\n]/.test(s) && !MMR_LEAD.test(s) && s !== '';
  const present = isObj(view.present) ? view.present : {};
  const stack = roots.map((r, k) => [r, 0, !k]).reverse(), done = new Set(); // a further root's branch is walked, not written
  let deep = false;
  while (stack.length) {
    const [n, d, w] = stack.pop();
    if (done.has(n.id)) continue;
    done.add(n.id);
    if (!w) { for (const k of kids.get(n.id) || []) stack.push([k, d + 1, false]); continue; }
    const pad = '  '.repeat(Math.min(d, MMR_DEEP) + 1), mer = isObj(n.ext) && isObj(n.ext.mermaid) ? n.ext.mermaid : {};
    if (d > MMR_DEEP && !deep) { deep = true; lose(n.id, `deeper than ${MMR_DEEP} levels, so it and what lies below it are written at level ${MMR_DEEP}`); }
    const label = str(n.label) ? n.label : '';
    if (!str(n.label)) lose(n.id, has(n.label) ? 'its label, which is not text' : 'no label, read as an empty one');
    const sh = MMR_OPEN.get(mer.shape), md = mer.markdown === true, side = Object.hasOwn(present, n.id) && isObj(present[n.id]) ? present[n.id].side : undefined;
    if (/\r/.test(label)) lose(n.id, 'a carriage return in its label, written as a line break');
    if (has(mer.shape) && !sh) lose(n.id, `shape ${mer.shape}, which Mermaid's mindmap does not have`);
    if (side === 'left' || side === 'right') out.push(`${pad}%% side: ${side}`);
    if (has(n.opensView)) { if (hintable(n.opensView)) out.push(`${pad}%% opens: ${n.opensView}`); else lose(n.id, 'its opensView, which a comment cannot hold'); }
    if (!sh && !md && bareOk(label) && n.id === mmrSlug(label)) out.push(pad + label);
    else {
      const [o, c] = sh || ['[', ']'];
      const body = md ? `"\`${enc(label)}\`"` : /^[^()[\]{}"#<`\r\n]+$/.test(label) && label.trim() === label ? label : `"${enc(label).replace(/\r\n|\r|\n/g, '<br>')}"`;
      if (!idOk(n.id)) out.push(`${pad}%% id: ${n.id}`);
      out.push(`${pad}${idOk(n.id) ? n.id : 't'}${o}${body}${c}`);
    }
    if (has(mer.icon)) { if (str(mer.icon) && !/[)\r\n]/.test(mer.icon)) out.push(`${pad}::icon(${mer.icon})`); else lose(n.id, 'its icon, which ::icon() cannot hold'); }
    if (has(mer.classes)) { if (str(mer.classes) && mer.classes.trim() === mer.classes && !/[\r\n]/.test(mer.classes)) out.push(`${pad}:::${mer.classes}`); else lose(n.id, 'its classes, which ::: cannot hold'); }
    for (const k of Object.keys(n)) if (!['id', 'type', 'label', 'parent', 'opensView', 'ext'].includes(k)) lose(n.id, k === 'props' ? 'its props' : `property ${k}`);
    if (isObj(n.ext)) for (const k of Object.keys(n.ext)) if (k !== 'mermaid') lose(n.id, `its ext.${k}`);
    for (const k of Object.keys(mer)) if (!['shape', 'icon', 'classes', 'markdown'].includes(k)) lose(n.id, `its ext.mermaid.${k}`);
    const ks = kids.get(n.id) || [];
    for (let k = ks.length - 1; k >= 0; k--) stack.push([ks[k], d + 1, true]);
  }
  for (const n of shown.values()) if (!done.has(n.id)) lose(n.id, 'in a cycle of parents, so no root holds it');
  for (const e of arr(m.edges)) if (isObj(e) && (shown.has(e.from) || shown.has(e.to))) notWritten.push(`${flat(e.id)} (${flat(e.type)}): a mindmap has no lines`);
  for (const x of notWritten) out.push(`%% not written: ${x}`);
  const t = out.join('\n') + '\n'; // over the reader's limit, it cannot be read again, and says so in its last line
  return t.length > MMR_LIMIT ? t + `%% not written: text the reader reads back: this is ${t.length} characters, over its limit of ${MMR_LIMIT}\n` : t;
}

export { readMermaidMindmap, writeMermaidMindmap };
