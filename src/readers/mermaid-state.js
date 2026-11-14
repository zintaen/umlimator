import { parseTransition, printTransition, trScan } from '../uml/transition.js';
/* ---------- Mermaid stateDiagram: a reader and a writer (notes/stage-4.md §13, S12, S22; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's state diagram page (docs/syntax/stateDiagram.md, read 13 Nov 2026) and its lexer, as
   the class and sequence readers are against theirs. Internal: the CLI (`umlimator.py import`) imports this file through
   Node; a host gets it once the registry is public. Its helpers are its own (mt...), since the readers share one scope in
   lib/umlimator-all.js.

   readMermaidState(text) -> { model, report }: a version-2 model with one `uml.state-machine` view, in model.md row 10's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). The reader is hand-written and linear, and refuses text over MT_LIMIT characters (R2). Ids come
   from the source's names (R3): states take their names first; then, in the order they come, a scope's initial
   pseudostate is <scope>.start (the top's `start`), its final state <scope>.end, a region <state>.r<k>, a transition
   <from>-<to>, an internal transition <state>.t<k>, a note note-<n> and its line <note>-link, each the next free of
   base, base-2, base-3 ... `%% id: <id>` above a statement gives that element its id instead (`%% link-id:` a note's
   line, `%% start-id:` and `%% end-id:` the scope's [*] first named below, `%% region: <id> [name]` the region it opens),
   and `%% kind: <kind>` above a state makes it a junction, a history, a terminate, an initial pseudostate or a final
   state. It never throws.

   writeMermaidState(model, viewId?) -> text: one state machine view as Mermaid. What Mermaid cannot carry is kept in its
   comments, as the other writers do: an id the reader would not derive, as the hints above; a pseudostate Mermaid has
   no notation for under `%% kind:`, labelled ●, H, H*, ×, as is an initial pseudostate or a final state that is not the
   first of its scope, or whose lines would make [*] name another; `%% warning: Mermaid may not draw this` above a
   transition whose ends lie in different scopes (S22); an element the subset leaves out as `%% not written: <id> (<type>)`,
   and a property Mermaid has no place for as `%% not written: <id>: <what>`.

   How UML maps onto Mermaid's text, both ways:
   - `s1`, `state "Long name" as s1` a state; `state s1 { ... }` a composite state, whose body's `--` divides it into
     regions. Mermaid's names are global: a state's parent is the first body that names it, even when the top named it
     first; a body that names it again, other than one around its own, is reported;
   - `[*] --> s1` the scope's initial pseudostate, `s1 --> [*]` its final state, one of each per scope (a region is a
     scope); `<<fork>>`, `<<join>>`, `<<choice>>` those pseudostates;
   - `s1 --> s2 : text` a transition, its text read as trigger [guard] / effect (§7); `s1 : entry / x` (do, exit) that
     activity; `s1 : evt [g] / act` an internal transition; any other `s1 : text` a comment linked to s1, marked
     ext.mermaid.description, written back as it came; `note right of s1` a comment and its line;
   - `direction LR` right, `TB` down (Mermaid's default); text is decoded from Mermaid's entities (#59; #quot;) and
     <br>, which the writer uses for ; : # " < > \ and line breaks, and for a space at either end. */
const MT_LIMIT = 1 << 20; // characters; a state diagram a person writes is a few kilobytes
const MT_VIEW = 'state-diagram'; // the view's id when the source does not name it
const MT_DEEP = 64; // composites nested deeper are read flat from there (R2)
const MT_WALK = 256; // the most scopes a check walks up; past it, nothing is moved (R2)
const MT_KINDS = { junction: '●', shallowHistory: 'H', deepHistory: 'H*', terminate: '×', initial: '●', final: '◉' }; // %% kind:, and the label Mermaid shows
const MT_FORKS = ['fork', 'join', 'choice'];
const MT_ACTS = ['entry', 'do', 'exit'];
// words a line starts with that Mermaid's lexer (stateDiagram.jison) or this reader take as a statement: no state name the writer gives is one
const MT_KEYWORDS = new Set(['state', 'note', 'direction', 'title', 'classdef', 'class', 'style', 'scale', 'click', 'href', 'default', 'hide', 'acctitle', 'accdescr', 'statediagram']);
const mtId = name => String(name).replace(/->+/g, '-'); // an id never holds "->" (model.md rule 5)
const mtWord = s => { let e = 0; while (e < s.length && /[A-Za-z_]/.test(s[e])) e++; return e && !/\w/.test(s[e] ?? ' ') ? s.slice(0, e).toLowerCase() : ''; };

// the first of base, base-2, base-3 ... not in used, resuming where the last ask for base stopped (R2)
function mtFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// text: Mermaid's line breaks and entity codes (#quot; #lt; #59; ...); a named one Mermaid knows and this does not stays
function mtDecode(s) {
  return s.replace(/<br\s?\/?>|\\n/gi, '\n').replace(/#(quot|lt|gt|amp|\d{1,6});/g, (_, e) =>
    ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? String.fromCodePoint(Math.min(Number(e), 0x10ffff)));
}

// trigger [guard] / effect is src/uml/transition.js's (notes/stage-4.md §7.1); its parts here, the absent ones left out
const mtParts = p => { const o = {}; for (const k of ['trigger', 'guard', 'effect']) if (p[k] !== undefined) o[k] = p[k]; return o; };
const mtSame = (a, b) => a.trigger === b.trigger && a.guard === b.guard && a.effect === b.effect;
// the text of a transition's parts, or null when it would not read back as them exactly (printTransition trims them)
function mtPrint(p) {
  const text = printTransition(p);
  return text !== null && mtSame(parseTransition(text), p) ? text : null;
}
// what `s1 : text` is (§7.2): an activity, an internal transition (a trigger and a /, maybe with nothing after it), or a description
function mtLine(text) {
  const p = trScan(text);
  if (p.error || p.trigger === undefined || p.slash < 0) return { description: true };
  if (MT_ACTS.includes(p.trigger) && p.guard === undefined) return { activity: p.trigger, value: p.effect ?? '' };
  return { internal: mtParts(p) };
}

function readMermaidState(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: MT_VIEW, nodes: [], edges: [], views: [{ id: MT_VIEW, diagram: 'uml.state-machine', direction: 'down', nodeIds: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MT_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MT_LIMIT}: nothing read`); return empty(); }
  const lines = text.replace(/^\uFEFF/, '').split('\n').map(l => l.replace(/\r$/, ''));
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

  // a scope is the top or one part of a composite's body: { owner, k, hint, start, end }; a state's body is the scope
  // that first named it (null: the top)
  const top = { owner: null }, states = new Map(), order = [], items = [], stack = [];
  let viewId, direction = 'down', started = false, hint = {}, block = false, note = null, flat = 0;
  const cur = () => (stack.length ? stack[stack.length - 1].cur : top);
  const up = s => s.owner.body || top;
  const inside = (s, a) => { for (let n = 0; n < MT_WALK; n++) { if (s === a) return true; if (s === top) return false; s = up(s); } return false; }; // a holds s
  const under = (s, rec) => { for (let n = 0; n < MT_WALK; n++) { if (s === top) return false; if (s.owner === rec) return true; s = up(s); } return true; }; // s is in rec's body
  const mention = (name, no) => {
    let rec = states.get(name);
    if (!rec) { rec = { name, no, node: { type: 'uml.State', label: name }, body: null, parts: null, internal: 0, acts: [] }; states.set(name, rec); order.push(rec); }
    const s = cur();
    if (s !== top && rec.body !== s) {
      if (!rec.body) { if (!under(s, rec)) rec.body = s; }
      else if (!inside(rec.body, s) && !under(s, rec)) say(no, 'approximated', `${name} is named in ${rec.body.owner.name}'s body and in ${s.owner.name}'s: it is kept in the first`);
    }
    return rec;
  };
  // a name as written: a style class after ::: is not read; null when it is not one word
  const nameOf = (raw, no, star) => { // star: [*] may stand for itself
    let s = raw.trim();
    const c = s.indexOf(':::');
    if (c >= 0) { say(no, 'skipped', `${s}: a style class is not read`); s = s.slice(0, c).trim(); }
    if (s === '[*]') return star ? s : null;
    return s && !/[\s"{}]/.test(s) ? s : null;
  };
  const open = (rec, no) => {
    if (stack.length >= MT_DEEP) {
      if (!flat++) say(no, 'approximated', `state ${rec.name} is nested over ${MT_DEEP} deep: what it holds is read flat from there`);
      stack.push({ flat: true, cur: cur(), no, rec });
      return;
    }
    if (rec.parts) say(no, 'approximated', `state ${rec.name} { is opened again: what it holds is read into its last region`);
    else { rec.parts = [{ owner: rec, k: 1 }]; rec.opened = no; items.push({ kind: 'region', part: rec.parts[0] }); }
    stack.push({ rec, cur: rec.parts.at(-1), no });
  };
  const kindOf = (rec, no) => {
    const k = hint.kind;
    if (k == null) return;
    if (!Object.hasOwn(MT_KINDS, k)) return say(no, 'skipped', `%% kind: ${k}: not a kind of pseudostate`);
    rec.node = k === 'final' ? { type: 'uml.FinalState' } : { type: 'uml.Pseudostate', props: { kind: k } };
    rec.symbol = MT_KINDS[k];
  };
  const declare = (rec) => { if (hint.id != null && rec.hint === undefined) rec.hint = hint.id; };
  // [*] in the current scope: its initial pseudostate as a source, its final state as a target
  const star = (from, no) => {
    const s = cur(), key = from ? 'start' : 'end';
    if (!s[key]) { s[key] = { kind: key, scope: s, no, hint: from ? hint.start : hint.end, node: from ? { type: 'uml.Pseudostate', props: { kind: 'initial' } } : { type: 'uml.FinalState' } }; items.push(s[key]); }
    return s[key];
  };

  for (; i < lines.length; i++) {
    const no = i + 1;
    let s = lines[i].trim();
    if (note) { // a note's lines, to its end note
      if (/^end note\b/i.test(s)) { items.push(note); note = null; } else note.text.push(s);
      continue;
    }
    if (!s) continue;
    if (block) { if (s.includes('}')) block = false; continue; } // inside accDescr { ... }
    if (s.startsWith('%%')) {
      const c = s.slice(2).trim(), after = w => c.slice(w.length).trim();
      if (c.startsWith('row:') && started && /^[^:\s]+\s*:/.test(after('row:'))) s = after('row:'); // a composite state's text: Mermaid refuses it on the state
      else if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!s.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      } else if (c.startsWith('id:')) hint.id = after('id:');
      else if (c.startsWith('link-id:')) hint.link = after('link-id:');
      else if (c.startsWith('start-id:')) hint.start = after('start-id:');
      else if (c.startsWith('end-id:')) hint.end = after('end-id:');
      else if (c.startsWith('kind:')) hint.kind = after('kind:');
      else if (c.startsWith('region:')) {
        const r = after('region:'), sp = r.search(/\s/), part = cur();
        if (part === top || stack.at(-1).flat) say(no, 'skipped', '%% region: outside a composite state: not read');
        else part.hint = { id: sp < 0 ? r : r.slice(0, sp), name: sp < 0 ? undefined : mtDecode(r.slice(sp).trim()) };
      }
      if (s.startsWith('%%')) continue;
    }
    if (!started) {
      if (!/^stateDiagram(-v2)?$/i.test(s)) { say(no, 'skipped', 'not a Mermaid stateDiagram: nothing read'); return empty(); }
      started = true; viewId = hint.id; hint = {};
      if (viewId != null && mtId(viewId) !== viewId) { say(no, 'approximated', `%% id: ${viewId}: an id holds no "->", so the view is ${mtId(viewId)}`); viewId = mtId(viewId); }
      continue;
    }
    const word = mtWord(s), rest = s.slice(word.length).trim(), arrow = s.indexOf('-->'), colon = s.indexOf(':');
    if (s.startsWith('}')) {
      const o = stack.pop();
      if (!o) say(no, 'skipped', 'a } that closes nothing');
      else if (o.flat) flat--;
    } else if (s === '--') {
      const o = stack.at(-1);
      if (!o || o.flat) say(no, 'skipped', '-- outside a composite state: not read');
      else { const part = { owner: o.rec, k: o.rec.parts.length + 1 }; o.rec.parts.push(part); items.push({ kind: 'region', part }); o.cur = part; }
    } else if (word === 'state') {
      let label, k = 0, name;
      if (rest.startsWith('"')) {
        const q = rest.indexOf('"', 1), as = q < 0 ? null : /^\s*as\s+/i.exec(rest.slice(q + 1));
        if (!as) { say(no, 'skipped', `state ${rest}: a "description" with no as <name>`); hint = {}; continue; }
        label = mtDecode(rest.slice(1, q)); k = q + 1 + as[0].length;
      }
      let e = k;
      while (e < rest.length && !/[\s{]/.test(rest[e])) e++;
      name = nameOf(rest.slice(k, e), no);
      const tail = rest.slice(e).trim(), fork = /^(?:<<(fork|join|choice)>>|\[\[(fork|join|choice)\]\])$/i.exec(tail);
      if (!name || (tail && tail !== '{' && !fork)) { say(no, 'skipped', `state ${rest} is not understood`); hint = {}; continue; }
      const rec = mention(name, no);
      declare(rec);
      if (fork) rec.node = { type: 'uml.Pseudostate', props: { kind: (fork[1] || fork[2]).toLowerCase() } };
      else kindOf(rec, no);
      if (label !== undefined && rec.node.type === 'uml.State') rec.node.label = label;
      else if (label !== undefined && label !== rec.symbol) rec.node.label = label;
      if (tail === '{') open(rec, no);
    } else if (word === 'note') {
      const side = /^(left|right) of\s+/i.exec(rest);
      if (!side) { say(no, 'skipped', `note ${rest}: a note not beside a state is not read`); hint = {}; continue; }
      const after = rest.slice(side[0].length), c = after.indexOf(':'), name = nameOf(c < 0 ? after : after.slice(0, c), no);
      if (!name) { say(no, 'skipped', `note ${rest}: names no state`); hint = {}; continue; }
      if (side[1].toLowerCase() === 'left') say(no, 'approximated', `note left of ${name}: the side is not kept`);
      const rec = { kind: 'note', target: mention(name, no), no, hint: hint.id, link: hint.link, text: [] };
      if (c >= 0) { rec.text.push(after.slice(c + 1).trim()); items.push(rec); } else note = rec;
    } else if (word === 'direction') {
      const d = rest.toUpperCase();
      if (stack.length) say(no, 'approximated', `direction ${rest} inside a composite state is not kept: the view has one direction`);
      else if (d === 'TB' || d === 'TD') direction = 'down';
      else if (d === 'LR') direction = 'right';
      else if (d === 'BT' || d === 'RL') { direction = d === 'BT' ? 'down' : 'right'; say(no, 'approximated', `direction ${d} is drawn ${direction === 'down' ? 'top to bottom' : 'left to right'}`); }
      else say(no, 'skipped', `direction ${rest}: not a direction`);
    } else if (word === 'title') title = mtDecode(rest.replace(/^:/, '').trim());
    else if (['classdef', 'class', 'style'].includes(word)) say(no, 'skipped', `${word === 'classdef' ? 'classDef' : word} ${rest}: styles are not read`);
    else if (word === 'hide' || word === 'scale' || word === 'click') say(no, 'skipped', `${s}: not read`);
    else if (word === 'acctitle' || word === 'accdescr') {
      say(no, 'skipped', `${word === 'acctitle' ? 'accTitle' : 'accDescr'}: accessibility text is not read`);
      if (word === 'accdescr' && s.includes('{') && !s.includes('}')) block = true;
    } else if (arrow >= 0 && !(colon >= 0 && colon < arrow && s.slice(colon, colon + 3) !== ':::')) { // a transition: its label starts at the first : after the target
      const left = s.slice(0, arrow), after = s.slice(arrow + 3);
      let c = -1;
      for (let k = 0; k < after.length && c < 0; k++) if (after[k] === ':') { // past a :::class
        if (!after.startsWith(':::', k)) c = k;
        else for (k += 2; k + 1 < after.length && !/[\s:]/.test(after[k + 1]); k++);
      }
      let target = c < 0 ? after : after.slice(0, c);
      const pct = target.indexOf('%%');
      if (pct >= 0) target = target.slice(0, pct);
      const a = nameOf(left, no, true), b = nameOf(target, no, true);
      if (!a || !b) { say(no, 'skipped', `"${s.length > 60 ? s.slice(0, 57) + '...' : s}" is not understood`); hint = {}; continue; }
      const from = a === '[*]' ? star(true, no) : mention(a, no), to = b === '[*]' ? star(false, no) : mention(b, no);
      items.push({ kind: 'trans', no, from, to, what: `${a} --> ${b}`, text: c < 0 ? '' : mtDecode(after.slice(c + 1).trim()), hint: hint.id });
    } else if (colon > 0) { // s1 : text
      const name = nameOf(s.slice(0, colon), no), rawText = s.slice(colon + 1).trim(), t = mtDecode(rawText);
      if (!name) { say(no, 'skipped', `"${s.length > 60 ? s.slice(0, 57) + '...' : s}" is not understood`); hint = {}; continue; }
      const rec = mention(name, no), line = mtLine(t);
      if (line.activity) {
        if (rec.acts.some(a => a.activity === line.activity)) say(no, 'approximated', `${name} : ${line.activity}: a second ${line.activity} replaces the first`);
        rec.acts.push({ ...line, no });
      } else if (line.internal) items.push({ kind: 'internal', rec, no, props: line.internal, hint: hint.id });
      else items.push({ kind: 'note', target: rec, no, hint: hint.id, link: hint.link, text: [rawText], desc: true });
    } else {
      const pct = s.indexOf('%%'), name = nameOf(pct < 0 ? s : s.slice(0, pct), no);
      if (!name) say(no, 'skipped', `"${s.length > 60 ? s.slice(0, 57) + '...' : s}" is not understood`);
      else { const rec = mention(name, no); declare(rec); kindOf(rec, no); }
    }
    hint = {};
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid stateDiagram: nothing read'); return empty(); }
  if (note) { say(note.no, 'approximated', 'a note with no end note: read to the end'); items.push(note); }
  for (const o of stack) if (!o.flat) say(o.no, 'approximated', `state ${o.rec.name} { is never closed: read to the end`);
  // only a state holds activities, internal transitions and a body: on a pseudostate or a final state they are reported,
  // and what its body holds is read into the scope around it
  const isState = rec => rec.node.type === 'uml.State', what = rec => (rec.node.type === 'uml.FinalState' ? 'a final state' : `${/^[aeiou]/.test(rec.node.props.kind) ? 'an' : 'a'} ${rec.node.props.kind} pseudostate`);
  for (const rec of order) {
    if (isState(rec)) { for (const a of rec.acts) rec.node.props = { ...rec.node.props, [a.activity]: a.value }; continue; }
    for (const a of rec.acts) say(a.no, 'approximated', `${rec.name} : ${a.activity}: ${rec.name} is ${what(rec)}, which has no activity: not read`);
    if (rec.opened) say(rec.opened, 'approximated', `state ${rec.name} {: ${rec.name} is ${what(rec)}, which holds nothing: what its body holds is read into the scope around it`);
  }
  const real = s => { for (let n = 0; n < MT_WALK && s !== top && !isState(s.owner); n++) s = up(s); return s === top || isState(s.owner) ? s : top; }; // the scope a body of a non-state stands for

  // ids: states by their names first; then, in the order they come, regions, [*], transitions, internal transitions, notes
  const used = new Set(), next = new Map();
  const take = (h, base, no, what) => {
    if (h != null && h !== '') {
      const t = mtId(h);
      if (t !== h) say(no, 'approximated', `%% id: ${h}: an id holds no "->", so it is ${t}`);
      if (!used.has(t)) { used.add(t); return t; }
      const id = mtFree(used, next, base); used.add(id);
      say(no, 'approximated', `%% id: ${t} is taken, so ${what} is ${id}`);
      return id;
    }
    const id = mtFree(used, next, base); used.add(id);
    return id;
  };
  for (const rec of order) {
    rec.node.id = take(rec.hint, mtId(rec.name), rec.no, `state ${rec.name}`);
    if (rec.hint == null && rec.node.id !== rec.name) say(rec.no, 'approximated', `state ${rec.name}: ${mtId(rec.name) !== rec.name ? 'an id holds no "->"' : 'its name is another\'s id'}, so it is ${rec.node.id}`);
  }
  const regioned = rec => isState(rec) && rec.parts && (rec.parts.length > 1 || !!rec.parts[0].hint);
  const scopeId = s => (s = real(s), s === top ? '' : regioned(s.owner) ? s.id : s.owner.node.id);
  const nodes = order.map(r => r.node), edges = [];
  let notes = 0;
  for (const x of items) {
    if (x.kind === 'region') {
      if (!regioned(x.part.owner)) continue;
      const p = x.part, o = p.owner.node;
      p.id = take(p.hint?.id, `${o.id}.r${p.k}`, p.owner.no, `a region of ${o.id}`);
      (o.members ||= []).push({ id: p.id, type: 'uml.Region', ...(p.hint?.name ? { label: p.hint.name } : {}) });
    } else if (x.kind === 'start' || x.kind === 'end') {
      const sid = scopeId(x.scope);
      x.node.id = take(x.hint, sid ? `${sid}.${x.kind}` : x.kind, x.no, `the ${x.kind === 'start' ? 'initial' : 'final'} state of ${sid || 'the top'}`);
      if (sid) x.node.parent = sid;
      nodes.push(x.node);
    } else if (x.kind === 'trans') {
      const e = { id: take(x.hint, `${x.from.node.id}-${x.to.node.id}`, x.no, x.what), type: 'uml.Transition', from: x.from.node.id, to: x.to.node.id };
      if (x.text) {
        const p = parseTransition(x.text, 'its text is not trigger [guard] / effect');
        if (p.error) { e.props = { trigger: x.text }; e.ext = { mermaid: { label: x.text } }; say(x.no, 'approximated', `${x.what}: ${p.error}: it is kept as its trigger`); }
        else if (Object.keys(mtParts(p)).length) e.props = mtParts(p);
      }
      edges.push(e);
    } else if (x.kind === 'internal') {
      const o = x.rec.node;
      if (!isState(x.rec)) { say(x.no, 'approximated', `${x.rec.name} : ${mtPrint(x.props) ?? 'an internal transition'}: ${x.rec.name} is ${what(x.rec)}, which has no internal transition: not read`); continue; }
      (o.members ||= []).push({ id: take(x.hint, `${o.id}.t${++x.rec.internal}`, x.rec.no, `an internal transition of ${o.id}`), type: 'uml.InternalTransition', props: x.props });
    } else {
      const label = mtDecode(x.text.join('\n')), c = { id: take(x.hint, `note-${++notes}`, x.no, 'a note'), type: 'uml.Comment', ...(label ? { label } : {}), ...(x.desc ? { ext: { mermaid: { description: true } } } : {}) };
      nodes.push(c);
      edges.push({ id: take(x.link, `${c.id}-link`, x.no, "a note's line"), type: 'uml.CommentLink', from: c.id, to: x.target.node.id });
    }
  }
  for (const rec of order) if (rec.body && scopeId(rec.body)) rec.node.parent = scopeId(rec.body);
  for (const n of nodes) if (n.members) n.members.sort((a, b) => (a.type === b.type ? 0 : a.type === 'uml.Region' ? -1 : 1)); // regions, then internal transitions

  const view = { id: viewId || MT_VIEW, diagram: 'uml.state-machine', ...(title ? { title } : {}), ...(direction === 'down' ? { direction } : {}), nodeIds: nodes.map(n => n.id) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges, views: [view] }, report };
}

function writeMermaidState(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), has = x => x != null && x !== '', str = x => typeof x === 'string';
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'uml.state-machine');
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (!view) return '%% not written: the model, which has no uml.state-machine view\n';
  if (view.diagram !== 'uml.state-machine') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a uml.state-machine one\n`;
  // text: Mermaid's own characters as entities, a line break as <br>, a space at either end as an entity, which the
  // reader's trim keeps, and the space after "direction", which Mermaid's lexer takes anywhere in a line
  const ent = c => `#${c.codePointAt(0)};`;
  const enc = s => String(s).replace(/[#;:"<>\\]/g, ent).replace(/\r\n|\r|\n/g, '<br>').replace(/^\s|\s$/g, ent).replace(/(direction)(\s)/gi, (_, w, c) => w + ent(c));
  const okId = id => str(id) && id !== '' && id.trim() === id && !/[\r\n]/.test(id); // a hint keeps it
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const title = String(has(view.title) ? view.title : m.title ?? '');
  if (has(title)) out.push('---', `title: ${/^[\p{L}\p{N}][\p{L}\p{N} _.,()-]*$/u.test(title) && !title.endsWith(' ') ? title : JSON.stringify(String(title))}`, '---');
  if (view.id !== MT_VIEW) { if (/[\r\n]/.test(view.id)) lose(view.id, "the view's id, which has a line break"); else out.push(`%% id: ${view.id}`); }
  out.push('stateDiagram-v2', view.direction === 'down' ? '  direction TB' : '  direction LR');

  // what is written: the view's states, pseudostates, final states and comments
  const byId = new Map();
  for (const n of arr(m.nodes)) if (isObj(n) && !byId.has(n.id)) byId.set(n.id, n);
  const nodes = [], comments = [], shown = new Set();
  for (const id of arr(view.nodeIds)) {
    const n = byId.get(id);
    if (!n || shown.has(id)) continue;
    const kind = n.props?.kind, ok = okId(n.id) && (n.type === 'uml.State' || n.type === 'uml.FinalState' || n.type === 'uml.Comment'
      || (n.type === 'uml.Pseudostate' && (MT_FORKS.includes(kind) || (kind !== 'final' && Object.hasOwn(MT_KINDS, kind)))));
    if (!ok) { skip(n); continue; }
    shown.add(id); (n.type === 'uml.Comment' ? comments : nodes).push(n);
  }
  const isNode = new Set(nodes.map(n => n.id)), stateOf = new Map(nodes.filter(n => n.type === 'uml.State').map(n => [n.id, n]));
  const regionsOf = new Map(), regionAt = new Map(); // a state's regions; a region's id -> its state
  for (const st of stateOf.values()) {
    const rs = arr(st.members).filter(x => isObj(x) && x.type === 'uml.Region');
    for (const r of rs) if (!okId(r.id) || /\s/.test(r.id) || regionAt.has(r.id) || isNode.has(r.id)) { lose(st.id, `region ${r.id}, whose id the reader cannot carry`); } else regionAt.set(r.id, st);
    regionsOf.set(st.id, rs.filter(r => regionAt.get(r.id) === st));
  }
  // each node's scope: '' the top, a state's id (no regions), or a region's id; a parent the view does not show is the top
  const keyOf = new Map();
  for (const n of nodes) {
    let k = n.parent ?? '';
    if (regionAt.has(k)) { /* a region */ } else if (stateOf.has(k) && k !== n.id) { const rs = regionsOf.get(k); if (rs.length) { lose(n.id, `its parent ${k} has regions: written in the first`); k = rs[0].id; } }
    else { if (k !== '') lose(n.id, `parent ${k}, not a state in the view: written at the top`); k = ''; }
    keyOf.set(n.id, k);
  }
  const ownerOf = k => (regionAt.has(k) ? regionAt.get(k) : stateOf.get(k)); // the state a scope is in
  const outer = k => keyOf.get(ownerOf(k).id); // the scope around the state that holds k
  const depth = new Map([['', 0]]); // a scope's depth in composites, each worked out once; Infinity in a cycle of parents
  const depthOf = k0 => {
    const path = [], on = new Set();
    for (let k = k0; !depth.has(k); k = outer(k)) { if (on.has(k)) { depth.set(k, Infinity); break; } on.add(k); path.push(k); }
    for (let j = path.length - 1; j >= 0; j--) if (!depth.has(path[j])) depth.set(path[j], depth.get(outer(path[j])) + 1);
    return depth.get(k0);
  };
  for (const n of nodes) if (depthOf(keyOf.get(n.id)) > MT_DEEP) { // a cycle of parents, or a nest too deep for the reader, is written at the top
    lose(n.id, `parent ${n.parent}: it is nested over ${MT_DEEP} deep or in itself, so it is written at the top`); keyOf.set(n.id, '');
  }
  const chain = k => { const c = [k]; while (k !== '' && c.length <= MT_DEEP + 1) c.push(k = outer(k)); return c; };
  const kids = new Map();
  for (const n of nodes) { const k = keyOf.get(n.id); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n); }

  // the transitions; each initial pseudostate and final state that can be its scope's [*]
  const edgeById = new Map(), trans = [], links = new Map();
  for (const x of arr(m.edges)) if (isObj(x) && !edgeById.has(x.id)) edgeById.set(x.id, x);
  for (const x of edgeById.values()) {
    if (x.type === 'uml.CommentLink' && shown.has(x.from) && shown.has(x.to)) { if (!links.has(x.from)) links.set(x.from, []); links.get(x.from).push(x); continue; }
    if (!(shown.has(x.from) || shown.has(x.to))) continue;
    if (x.type === 'uml.Transition' && isNode.has(x.from) && isNode.has(x.to) && okId(x.id)) trans.push(x); else skip(x);
  }
  const ins = new Map(), outs = new Map(), push = (map, k, x) => { if (!map.has(k)) map.set(k, []); map.get(k).push(x); };
  for (const t of trans) { push(outs, t.from, t); push(ins, t.to, t); }
  const stars = new Map(), scopeStar = new Set(); // node -> 'start' | 'end'; the scopes whose [*] is taken
  for (const pass of ['start', 'end']) for (const n of nodes) {
    const k = keyOf.get(n.id), initial = pass === 'start';
    if (!(initial ? n.type === 'uml.Pseudostate' && n.props.kind === 'initial' : n.type === 'uml.FinalState') || has(n.label) || n.members || Object.keys(n.props || {}).some(p => p !== 'kind')) continue;
    const mine = initial ? outs.get(n.id) : ins.get(n.id), others = initial ? ins.get(n.id) : outs.get(n.id), key = `${k}\0${pass}`;
    const near = t => { const o = initial ? t.to : t.from; return chain(keyOf.get(o)).includes(k) && (initial || stars.get(o) !== 'start' || keyOf.get(o) === k); };
    if (!mine || others || scopeStar.has(key) || !mine.every(near)) continue;
    stars.set(n.id, pass); scopeStar.add(key);
  }
  // each transition where the reader finds its ends: [*] in its own scope; any other in the scope around both ends (and
  // around a state whose regions it crosses), so it names no state in a body that is not around it
  const transAt = new Map();
  for (const t of trans) {
    let k;
    if (stars.get(t.from) === 'start') k = keyOf.get(t.from);
    else if (stars.get(t.to) === 'end') k = keyOf.get(t.to);
    else { const a = new Set(chain(keyOf.get(t.from))); k = chain(keyOf.get(t.to)).find(x => a.has(x)) ?? ''; }
    push(transAt, k, t);
  }

  // names: an id Mermaid reads as one word, else one made of it (and its id as a hint)
  const safe = id => /^[\p{L}\p{N}_.]+$/u.test(id) && !MT_KEYWORDS.has(mtWord(id));
  const names = new Map(), taken = new Set(nodes.map(n => n.id).filter(safe));
  for (const n of nodes) {
    if (stars.has(n.id)) continue;
    if (safe(n.id)) { names.set(n.id, n.id); continue; }
    let base = n.id.replace(/[^\p{L}\p{N}_.]+/gu, '_').replace(/^[_.]+|[_.]+$/g, ''), name, k = 1;
    if (!safe(base)) base = 'S_' + base;
    for (name = base; taken.has(name); name = `${base}_${++k}`);
    taken.add(name); names.set(n.id, name);
  }

  // the ids as the reader derives them, in the order it meets them: the hint, when one is needed
  const used = new Set(nodes.filter(n => !stars.has(n.id)).map(n => n.id)), next = new Map();
  const idOf = (id, base) => { const d = mtFree(used, next, base); used.add(id); return d === id ? null : id; };
  const put = (depth, ...xs) => out.push(...xs.map(x => '  '.repeat(depth + 1) + x));
  const internals = new Map(), seenStar = new Set();
  let notes = 0;
  const inners = new Set(); // composites, whose text Mermaid 12.3.0 refuses beside a label ("Group nodes can only have label"): written as %% row:
  const textLine = (n, text) => `${inners.has(n.id) ? '%% row: ' : ''}${names.get(n.id)} : ${enc(text)}`;
  const notesOn = new Map(); // a written node -> the comments on it: each with one line, from it
  for (const c of comments) {
    const ls = links.get(c.id) || [], to = ls[0]?.to;
    if (ls.length !== 1 || !okId(ls[0].id) || !isNode.has(to) || stars.has(to)) { skip(c); ls.forEach(skip); continue; }
    push(notesOn, to, c);
  }
  const writeComments = (n, d) => {
    for (const c of notesOn.get(n.id) || []) {
      const link = links.get(c.id)[0], ch = idOf(c.id, `note-${++notes}`), lh = idOf(link.id, `${c.id}-link`), desc = c.ext?.mermaid?.description === true;
      const heads = [...(ch ? [`%% id: ${ch}`] : []), ...(lh ? [`%% link-id: ${lh}`] : [])];
      if (desc && has(c.label) && mtLine(String(c.label)).description) put(d, ...heads, textLine(n, c.label));
      else {
        if (desc) lose(c.id, 'its text reads as an activity or a transition, so it is written as a note');
        if (!has(c.label)) lose(c.id, 'no text');
        put(d, ...heads, `note right of ${names.get(n.id)} : ${has(c.label) ? enc(c.label) : ''}`);
      }
      Object.keys(c).filter(p => !['id', 'type', 'label', 'ext'].includes(p)).forEach(p => lose(c.id, p));
    }
  };
  const writeNode = (n, d) => {
    const name = names.get(n.id), heads = n.id !== name ? [`%% id: ${n.id}`] : [], kind = n.props?.kind;
    if (n.type === 'uml.Pseudostate' && MT_FORKS.includes(kind)) {
      if (has(n.label)) lose(n.id, `label ${n.label}`);
      put(d, ...heads, `state ${name} <<${kind}>>`);
    } else if (n.type !== 'uml.State') {
      const k = n.type === 'uml.FinalState' ? 'final' : kind;
      if (has(n.label) && n.label === MT_KINDS[k]) lose(n.id, `label ${n.label}, read as none`);
      put(d, ...heads, `%% kind: ${k}`, `state "${enc(has(n.label) ? n.label : MT_KINDS[k])}" as ${name}`);
    } else {
      const rs = regionsOf.get(n.id), inner = rs.length > 0 || kids.has(n.id);
      if (inner) inners.add(n.id);
      if (!has(n.label)) lose(n.id, 'no label, read as its name');
      const head = has(n.label) && n.label !== name ? `state "${enc(n.label)}" as ${name}` : inner ? `state ${name}` : name;
      if (!inner) put(d, ...heads, head);
      else {
        put(d, ...heads, head + ' {');
        if (!rs.length) writeScope(n.id, d + 1);
        rs.forEach((r, k) => {
          if (k) put(d + 1, '--');
          const h = idOf(r.id, `${n.id}.r${k + 1}`);
          if (r.label === '') lose(r.id, 'an empty label');
          if (rs.length === 1 || h || has(r.label)) put(d + 1, `%% region: ${r.id}${has(r.label) ? ' ' + enc(r.label) : ''}`);
          writeScope(r.id, d + 1);
        });
        put(d, '}');
      }
      const p = isObj(n.props) ? n.props : {};
      for (const a of MT_ACTS) if (p[a] !== undefined) {
        const v = p[a], line = str(v) && mtLine(`${a} / ${v}`);
        if (line && line.activity === a && line.value === v) put(d, textLine(n, `${a} / ${v}`)); else lose(n.id, `${a} ${flat(v)}`);
      }
      Object.keys(p).filter(a => !MT_ACTS.includes(a)).forEach(a => lose(n.id, `property ${a}`));
      for (const x of arr(n.members)) {
        if (!isObj(x) || x.type === 'uml.Region') continue;
        const q = isObj(x.props) ? x.props : {}, parts = { trigger: q.trigger, guard: q.guard, effect: q.effect };
        const printed = x.type === 'uml.InternalTransition' && okId(x.id) && [q.trigger, q.guard, q.effect].every(v => v === undefined || str(v)) && mtPrint(parts);
        const text = printed && (q.effect === undefined ? printed + ' /' : printed), line = text && mtLine(text);
        if (!line?.internal || !mtSame(line.internal, parts)) { skip(x); continue; }
        const k = (internals.get(n.id) || 0) + 1, h = idOf(x.id, `${n.id}.t${k}`);
        internals.set(n.id, k);
        put(d, ...(h ? [`%% id: ${h}`] : []), textLine(n, text));
      }
    }
    if (n.type !== 'uml.State' && (n.members || Object.keys(n.props || {}).some(p => p !== 'kind'))) lose(n.id, 'its properties and members');
    writeComments(n, d);
  };
  const writeTrans = (t, d) => {
    const lines = [], end = x => {
      const s = stars.get(x);
      if (!s) return names.get(x);
      if (!seenStar.has(x)) { seenStar.add(x); const k = keyOf.get(x), h = idOf(x, k ? `${k}.${s}` : s); if (h) lines.push(`%% ${s}-id: ${h}`); }
      return '[*]';
    };
    const a = end(t.from), b = end(t.to), h = idOf(t.id, `${t.from}-${t.to}`), p = isObj(t.props) ? t.props : {};
    let label = '';
    const raw = t.ext?.mermaid?.label;
    if (str(raw) && raw === p.trigger && p.guard === undefined && p.effect === undefined && parseTransition(raw).error) label = raw;
    else if (Object.keys(p).length) {
      const parts = { trigger: p.trigger, guard: p.guard, effect: p.effect }, printed = [p.trigger, p.guard, p.effect].every(v => v === undefined || str(v)) && mtPrint(parts);
      if (printed) label = printed; else lose(t.id, `its label, which does not read back as trigger [guard] / effect`);
      Object.keys(p).filter(x => !['trigger', 'guard', 'effect'].includes(x)).forEach(x => lose(t.id, `property ${x}`));
    }
    if (keyOf.get(t.from) !== keyOf.get(t.to)) lines.unshift('%% warning: Mermaid may not draw this');
    put(d, ...lines, ...(h ? [`%% id: ${h}`] : []), `${a} --> ${b}${label ? ' : ' + enc(label) : ''}`);
  };
  function writeScope(k, d) {
    for (const n of kids.get(k) || []) if (!stars.has(n.id)) writeNode(n, d);
    for (const t of transAt.get(k) || []) writeTrans(t, d);
  }
  writeScope('', 0);
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  // unindented when indented text would be over the reader's own limit, so what the reader read can be read again
  const text = out.join('\n') + '\n';
  return text.length > MT_LIMIT ? text.replace(/^[ \t]+/gm, '') : text;
}

export { readMermaidState, writeMermaidState };
