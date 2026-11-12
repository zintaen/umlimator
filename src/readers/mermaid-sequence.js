/* ---------- Mermaid sequenceDiagram: a reader and a writer (notes/stage-3.md §8, S10; risks.md R1 to R4, R7) ----------
   Written against Mermaid 12.3.0's sequence diagram page (docs/syntax/sequenceDiagram.md, read 12 Nov 2026), as the class
   reader is against its class page. Internal: the CLI (`umlimator.py import`) imports this file through Node; a host
   gets it once the registry is public. Its helpers are its own (ms...): mermaid-class.js exports only its two functions,
   and both files share one scope in lib/umlimator-all.js.

   readMermaidSequence(text) -> { model, report }: a version-2 model with one `uml.sequence` view, in model.md row 11's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). The reader is hand-written and linear, and refuses text over MS_LIMIT characters (R2). Ids come
   from the source's names (R3): a lifeline's is its name; a message is <from>-<to>, then -2, -3 ... for each pair, so
   inserting one renames only the later messages of its own pair; a fragment <operator>-<n>, an operand <fragment>.<k>.
   `%% id: <id>` above a statement gives that element its id instead (`%% operand-id:` the first operand of a fragment's
   line). It never throws.

   writeMermaidSequence(model, viewId?) -> text: one sequence view as Mermaid. What Mermaid cannot carry is kept in its
   comments, as the class writer does: an id the reader would not derive as `%% id:`; an interaction use as
   `%% use: <id> refersTo=<id>` above `Note over <first>,<last>: ref <label>`; an element the subset leaves out as
   `%% not written: <id> (<type>)`, and a property Mermaid has no place for as `%% not written: <id>: <what>`.

   How UML maps onto Mermaid's text, both ways:
   - `participant A`, `actor A` (stereotype actor), `as <label>`; an alias `name : Type` is the label and `represents`
     (an encoded colon, #58;, stays in the label). `@{ "type": ... }` is read as a stereotype, approximated;
   - `->>` call, `-)` async, `-->>` reply, its `replyTo` the latest unanswered call from its receiver to its sender (a
     call answered only in another operand of an alt is unanswered); `create participant B` makes the next message to
     B a create, `destroy B` the next message to B a delete. Other arrows are read as the nearest, approximated;
   - `+`, `-`, `activate`, `deactivate`: activations are derived, so nothing is read; reported where they disagree;
   - `alt`/`else`, `opt`, `loop`, `par`/`and`, `break` ... `end` are fragments and operands, the text their guard (a bare
     `else` is the guard else). `critical`/`option` and `rect` are read as their content; `box` as its participants;
   - `;` ends a statement as a line does (an entity such as #59; does not); `<br>` is a line break in text. */
const MS_LIMIT = 1 << 20; // characters; a sequence diagram a person writes is a few kilobytes
const MS_VIEW = 'sequence-diagram'; // the view's id when the source does not name it
const MS_OPS = ['alt', 'opt', 'loop', 'par', 'break'];
// arrows, a longer one before its prefix: [text, sort, what is not drawn]
const MS_ARROWS = [['<<-->>', 'reply', 'its arrowhead at the sender is not drawn'], ['<<->>', 'call', 'its arrowhead at the sender is not drawn'],
  ['-->>', 'reply'], ['->>', 'call'], ['--)', 'async', 'its dotted line is drawn solid'], ['-)', 'async'],
  ['--x', 'async', 'its dotted line and its cross are not drawn'], ['-x', 'async', 'its cross is not drawn'],
  ['-->', 'reply', 'it has no arrowhead, and is drawn with one'], ['->', 'call', 'it has no arrowhead, and is drawn with one']];
// Mermaid's keywords (case-insensitive, whole words): a lifeline's name the writer gives never starts with one
const MS_KEYWORDS = new Set(['participant', 'actor', 'create', 'destroy', 'activate', 'deactivate', 'note', 'alt', 'else', 'opt', 'loop', 'par', 'and',
  'break', 'critical', 'option', 'rect', 'box', 'end', 'autonumber', 'title', 'acctitle', 'accdescr', 'link', 'links', 'properties', 'details',
  'left', 'right', 'over', 'as', 'off', 'sequencediagram']);
const msId = name => String(name).replace(/->+/g, '-'); // an id never holds "->" (model.md rule 5)

// the first of base, base-2, base-3 ... not in used, resuming where the last ask for base stopped (R2)
function msFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k);
  return id;
}

// text: Mermaid's line breaks and entity codes (#quot; #lt; #59; ...); a named one Mermaid knows and this does not stays
function msDecode(s) {
  return s.replace(/<br\s?\/?>|\\n/gi, '\n').replace(/#(quot|lt|gt|amp|\d{1,6});/g, (_, e) =>
    ({ quot: '"', lt: '<', gt: '>', amp: '&' })[e] ?? String.fromCodePoint(Math.min(Number(e), 0x10ffff)));
}

// a line's statements: `;` ends one, unless it closes an entity such as #59;
function msStatements(line) {
  const out = [];
  let from = 0, ent = -1;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === '#') ent = k;
    else if (c === ';') { if (!(ent >= 0 && k - ent > 1)) { out.push(line.slice(from, k)); from = k + 1; } ent = -1; }
    else if (!/\w/.test(c)) ent = -1;
  }
  out.push(line.slice(from));
  return out.map(x => x.trim()).filter(Boolean);
}

// the keyword a statement starts with, lower-case, or '' (a keyword is a whole word, as Mermaid's lexer reads it)
function msWord(s) {
  let e = 0;
  while (e < s.length && /[A-Za-z]/.test(s[e])) e++;
  return e && !/\w/.test(s[e] ?? ' ') ? s.slice(0, e).toLowerCase() : '';
}

// a message: A [()] arrow [+|-] [()] B : text, or null
function msMessage(s) {
  let k = 0, arrow;
  for (; k < s.length && s[k] !== ':'; k++) if ((s[k] === '-' || s[k] === '<') && (arrow = MS_ARROWS.find(a => s.startsWith(a[0], k)))) break;
  if (!arrow) return null;
  let a = s.slice(0, k).trim(), j = k + arrow[0].length, central = false, plus = false, minus = false;
  if (a.endsWith('()')) { central = true; a = a.slice(0, -2).trim(); }
  for (;; j++) {
    while (s[j] === ' ' || s[j] === '\t') j++;
    if (s[j] === '+') plus = true; else if (s[j] === '-') minus = true; else if (s.startsWith('()', j)) { central = true; j++; } else break;
  }
  const colon = s.indexOf(':', j), b = (colon < 0 ? s.slice(j) : s.slice(j, colon)).trim();
  return a && b ? { a, b, arrow, central, plus, minus, text: colon < 0 ? '' : s.slice(colon + 1).trim() } : null;
}

// participant NAME [@{ ... }] [as ALIAS]: { name, type, alias }
function msParticipant(rest) {
  let name = rest, type, alias, after = '';
  const at = rest.indexOf('@{');
  if (at >= 0) {
    const close = rest.indexOf('}', at), cfg = rest.slice(at + 2, close < 0 ? rest.length : close);
    name = rest.slice(0, at); after = close < 0 ? '' : rest.slice(close + 1).trim();
    type = /"type"\s*:\s*"([^"]*)"/.exec(cfg)?.[1];
    alias = /"alias"\s*:\s*"([^"]*)"/.exec(cfg)?.[1];
    if (after.startsWith('as ')) alias = after.slice(3);
  } else {
    const m = /\sas\s/.exec(rest);
    if (m) { name = rest.slice(0, m.index); alias = rest.slice(m.index + m[0].length); }
  }
  return { name: name.trim(), type, alias: alias?.trim() };
}

// which call each reply answers, the same for the reader and the writer: the latest call from the reply's receiver to its
// sender that has no reply yet, where a reply in another operand of an alt does not count. occ: [{ from, to, sort, parent }]
// in time order; fragments: [{ parent, props: { operator }, members: [{ id }] }]. Returns Map reply -> call.
// ponytail: an operand's chain stops at 64 levels and one reply looks at 256 earlier answers at most, so hostile text
// stays linear (R2); past that a reply finds no call, which the reader reports. Raise both if real diagrams need it
function msMatch(occ, fragments) {
  const fragOf = new Map();
  for (const f of fragments) for (const o of f.members) fragOf.set(o.id, f);
  const chain = p => { const c = [], seen = new Set(); while (fragOf.has(p) && !seen.has(p) && c.length < 64) { seen.add(p); c.push(p); p = fragOf.get(p).parent; } return c; };
  const stacks = new Map(), out = new Map();
  for (const x of occ) {
    if (x.sort === 'call') {
      const key = `${x.from}\0${x.to}`;
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push({ x, chain: chain(x.parent), answers: [], closed: false });
    } else if (x.sort === 'reply') {
      const st = stacks.get(`${x.to}\0${x.from}`) || [], c = chain(x.parent), at = new Map(c.map(o => [fragOf.get(o), o]));
      // two answers are apart when they lie in different operands of one alt
      const apart = a => a.some(o => { const f = fragOf.get(o), y = at.get(f); return y !== undefined && y !== o && f.props?.operator === 'alt'; });
      while (st.length && st.at(-1).closed) st.pop();
      let budget = 256;
      for (let k = st.length - 1; k >= 0 && budget > 0; k--) {
        const call = st[k];
        if (call.closed || call.answers.some(a => --budget < 0 || !apart(a))) continue;
        out.set(x, call.x); call.answers.push(c);
        if (c.every(o => call.chain.includes(o))) call.closed = true; // answered where it was made, or outside it: no later reply sees it
        break;
      }
    }
  }
  return out;
}

function readMermaidSequence(text) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const empty = () => ({ model: { schemaVersion: 2, root: MS_VIEW, nodes: [], edges: [], views: [{ id: MS_VIEW, diagram: 'uml.sequence', nodeIds: [], edges: [] }] }, report });
  if (typeof text !== 'string') { say(1, 'skipped', 'the input is not text: nothing read'); return empty(); }
  if (text.length > MS_LIMIT) { say(1, 'skipped', `the input is ${text.length} characters, over the limit of ${MS_LIMIT}: nothing read`); return empty(); }
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

  const lifelines = new Map(), order = [], items = [], stack = [], creating = new Map(), destroying = new Map();
  let viewId, started = false, hint = {}, block = false, last = null;
  const life = (name, no) => {
    if (!lifelines.has(name)) { const rec = { name, no, node: { id: undefined, type: 'uml.Lifeline', label: name } }; lifelines.set(name, rec); order.push(rec); }
    return lifelines.get(name);
  };
  const cur = () => (stack.length ? stack[stack.length - 1].cur : null); // the operand an element lies in
  const declare = (rest, actor, no, created) => {
    const p = msParticipant(rest);
    if (!p.name) return say(no, 'skipped', `a ${actor ? 'actor' : 'participant'} with no name`);
    if (created && lifelines.has(p.name)) return say(no, 'skipped', `create ${p.name}: ${p.name} is in the diagram already, so it is not created`);
    const rec = life(p.name, no), n = rec.node, stereotypes = [...(actor ? ['actor'] : []), ...(p.type ? [p.type] : [])];
    if (hint.id != null) rec.hint = hint.id;
    if (p.type) say(no, 'approximated', `${p.name}'s type ${p.type} is read as a stereotype, shown as text`);
    if (p.alias != null) {
      const c = p.alias.indexOf(':'), label = msDecode(c < 0 ? p.alias : p.alias.slice(0, c)).trim(), type = c < 0 ? '' : msDecode(p.alias.slice(c + 1)).trim();
      n.label = label;
      if (type) n.props = { ...n.props, represents: type };
    }
    if (stereotypes.length) n.props = { ...n.props, stereotypes };
    if (created) creating.set(p.name, no);
  };
  const open = (operator, guard, no) => {
    const frag = { kind: 'frag', operator, no, hint: hint.id, parent: cur(), ops: [] };
    const op = { kind: 'op', frag, label: guard ? msDecode(guard) : undefined, hint: hint.operand };
    frag.ops.push(op); items.push(frag, op); stack.push({ frag, cur: op, no });
  };

  for (; i < lines.length; i++) {
    const no = i + 1, line = lines[i].trim();
    if (!line) continue;
    if (block) { if (line.includes('}')) block = false; continue; } // inside accDescr { ... }
    if (line.startsWith('%%')) {
      const c = line.slice(2).trim();
      if (c.startsWith('{')) {
        say(no, 'skipped', 'a %%{init}%% directive: Mermaid\'s configuration is not read');
        if (!line.includes('}%%')) while (i + 1 < lines.length && !lines[++i].includes('}%%')); // over several lines: to its }%%
      }
      else if (c.startsWith('id:')) hint.id = c.slice(3).trim();
      else if (c.startsWith('operand-id:')) hint.operand = c.slice(11).trim();
      else if (c.startsWith('use:')) {
        const u = c.slice(4).trim(), r = u.indexOf(' refersTo=');
        hint.use = r < 0 ? { id: u } : { id: u.slice(0, r).trim(), refersTo: u.slice(r + 10).trim() };
      }
      continue;
    }
    for (const s of msStatements(line)) {
      if (!started) {
        if (s !== 'sequenceDiagram') { say(no, 'skipped', 'not a Mermaid sequenceDiagram: nothing read'); return empty(); }
        started = true; viewId = hint.id; hint = {}; continue;
      }
      const word = msWord(s), rest = s.slice(word.length).trim(), was = last, top = stack[stack.length - 1];
      last = null;
      if (word === 'participant' || word === 'actor') declare(rest, word === 'actor', no, false);
      else if (word === 'create') {
        const w = msWord(rest);
        if (w === 'participant' || w === 'actor') declare(rest.slice(w.length).trim(), w === 'actor', no, true);
        else say(no, 'skipped', `create ${rest}: not a participant or an actor`);
      } else if (word === 'destroy') { if (rest) destroying.set(rest, no); else say(no, 'skipped', 'destroy names no participant'); }
      else if (word === 'activate' || word === 'deactivate') {
        const on = was && (word === 'activate' ? was.to : was.from).name === rest;
        if (on) { was[word === 'activate' ? 'plus' : 'minus'] = true; last = was; }
        else say(no, 'approximated', `${word} ${rest}: activations are derived from the messages, so it is not read`);
      } else if (MS_OPS.includes(word)) open(word, rest, no);
      else if (word === 'else' || word === 'and') {
        if (top && top.frag && top.frag.operator === (word === 'else' ? 'alt' : 'par')) {
          const op = { kind: 'op', frag: top.frag, label: rest ? msDecode(rest) : word === 'else' ? 'else' : undefined, hint: hint.id };
          top.frag.ops.push(op); items.push(op); top.cur = op;
        } else say(no, 'skipped', `${word} outside ${word === 'else' ? 'an alt' : 'a par'}: not read`);
      } else if (word === 'critical') { stack.push({ what: 'critical', cur: cur(), no }); say(no, 'approximated', `critical ${rest}: its content is read, with no frame (critical is not in the subset)`); }
      else if (word === 'option') {
        if (top && top.what === 'critical') say(no, 'approximated', `option ${rest}: read as the critical region's content, with no frame`);
        else say(no, 'skipped', 'option outside a critical region: not read');
      } else if (word === 'rect') { stack.push({ what: 'rect', cur: cur(), no }); say(no, 'skipped', `rect ${rest}: a background colour is not read; its content is`); }
      else if (word === 'box') { stack.push({ what: 'box', cur: cur(), no }); say(no, 'skipped', `box ${rest}: a group of participants is not read; the participants are`); }
      else if (word === 'end') { if (top) stack.pop(); else say(no, 'skipped', 'an end that closes nothing'); }
      else if (word === 'note') {
        const c = rest.indexOf(':'), where = (c < 0 ? rest : rest.slice(0, c)).trim(), body = c < 0 ? '' : rest.slice(c + 1).trim();
        const names = where.replace(/^(over|left of|right of)\s+/i, '').split(',').map(x => x.trim()).filter(Boolean);
        if (hint.use && names.length) {
          const t = body === 'ref' ? '' : body.startsWith('ref ') ? body.slice(4).trim() : body, label = msDecode(t);
          items.push({ kind: 'use', no, id: hint.use.id, refersTo: hint.use.refersTo, label, covers: names.map(x => life(x, no)), parent: cur() });
        } else say(no, 'skipped', 'a note is not read (notes are not in the subset)');
      } else if (word === 'title') title = msDecode(rest.replace(/^:/, '').trim());
      else if (word === 'autonumber') say(no, 'skipped', 'autonumber: message numbers are not drawn in a sequence view');
      else if (['link', 'links', 'properties', 'details'].includes(word)) say(no, 'skipped', `${word}: actor menus are not read`);
      else if (word === 'acctitle' || word === 'accdescr') {
        say(no, 'skipped', `${word === 'acctitle' ? 'accTitle' : 'accDescr'}: accessibility text is not read`);
        if (word === 'accdescr' && s.includes('{') && !s.includes('}')) block = true;
      } else {
        const m = msMessage(s), what = m && `${m.a}${m.arrow[0]}${m.b}`;
        if (!m) {
          const half = /-(\|[\\/]|\\\\|\/\/)|(\/\||\/\/|\\\\)-/.test(s); // Mermaid's half arrows (v11.12.3+)
          say(no, 'skipped', `"${s.length > 60 ? s.slice(0, 57) + '...' : s}" is not understood${half ? ': a half arrow is not in the subset' : ''}`); hint = {}; continue;
        }
        const from = life(m.a, no), to = life(m.b, no);
        let sort = m.arrow[1];
        if (creating.has(to.name)) { sort = 'create'; creating.delete(to.name); }
        else if (creating.has(from.name)) { say(creating.get(from.name), 'skipped', `create ${from.name}: the next message is from it, so nothing creates it`); creating.delete(from.name); }
        if (destroying.has(to.name)) { sort = 'delete'; destroying.delete(to.name); }
        else if (destroying.has(from.name)) { say(destroying.get(from.name), 'skipped', `destroy ${from.name}: the next message is from it, so its stem is not ended`); destroying.delete(from.name); }
        if (sort === m.arrow[1] && m.arrow[2]) say(no, 'approximated', `${what}: read as ${sort === 'async' ? 'an' : 'a'} ${sort}; ${m.arrow[2]}`);
        if (m.central) say(no, 'approximated', `${what}: the central connection is not drawn`);
        const msg = { kind: 'msg', no, what, from, to, sort, label: msDecode(m.text), hint: hint.id, parent: cur(), plus: m.plus, minus: m.minus };
        items.push(msg); last = msg;
      }
      hint = {};
    }
  }
  if (!started) { say(1, 'skipped', 'not a Mermaid sequenceDiagram: nothing read'); return empty(); }
  for (const o of stack) say(o.no, 'approximated', `${o.frag ? o.frag.operator : o.what} is never closed: read to the end`);
  for (const [name, no] of creating) say(no, 'skipped', `create ${name}: no message to it follows`);
  for (const [name, no] of destroying) say(no, 'skipped', `destroy ${name}: no message to it follows`);

  // ids: lifelines first, by name; then, in the order they come, messages, uses, fragments and operands
  const used = new Set(), next = new Map(), uniq = name => { const id = msFree(used, next, msId(name)); used.add(id); return id; };
  for (const rec of order) {
    rec.node.id = uniq(rec.hint ?? rec.name);
    if (rec.hint == null && rec.node.id !== rec.name) say(rec.no, 'approximated', `participant ${rec.name}: an id holds no "->", so it is ${rec.node.id}`);
  }
  const seen = new Map();
  for (const x of items) {
    if (x.kind === 'msg') x.id = uniq(x.hint ?? `${x.from.node.id}-${x.to.node.id}`);
    else if (x.kind === 'use') x.id = uniq(x.id || 'use');
    else if (x.kind === 'frag') { const n = (seen.get(x.operator) || 0) + 1; seen.set(x.operator, n); x.id = uniq(x.hint ?? `${x.operator}-${n}`); }
    else x.id = uniq(x.hint ?? `${x.frag.id}.${x.frag.ops.indexOf(x) + 1}`);
  }

  const nodes = order.map(r => r.node), at = new Map(nodes.map((n, k) => [n.id, k]));
  const frags = items.filter(x => x.kind === 'frag').map(f => ({ id: f.id, type: 'uml.CombinedFragment', ...(f.parent ? { parent: f.parent.id } : {}), props: { operator: f.operator },
    members: f.ops.map(o => ({ id: o.id, type: 'uml.InteractionOperand', ...(o.label != null ? { label: o.label } : {}) })) }));
  const occ = items.filter(x => x.kind === 'msg' || x.kind === 'use');
  const replies = msMatch(occ.filter(x => x.kind === 'msg').map(x => ({ x, from: x.from.node.id, to: x.to.node.id, sort: x.sort, parent: x.parent?.id })), frags);
  const answer = new Map([...replies].map(([r, c]) => [r.x, c.x])), lastReply = new Map();
  for (const [r, c] of answer) lastReply.set(c, r);
  const edges = occ.map(x => {
    if (x.kind === 'use') {
      const ks = x.covers.map(r => at.get(r.node.id)), lo = ks.reduce((a, b) => Math.min(a, b)), hi = ks.reduce((a, b) => Math.max(a, b));
      return { id: x.id, type: 'uml.InteractionUse', ...(x.label ? { label: x.label } : {}), ...(x.parent ? { parent: x.parent.id } : {}),
        props: { covers: nodes.slice(lo, hi + 1).map(n => n.id), ...(x.refersTo ? { refersTo: x.refersTo } : {}) } };
    }
    const call = answer.get(x);
    if (x.sort === 'reply' && !call) say(x.no, 'approximated', `${x.what}: a reply with no call from ${x.to.name} to ${x.from.name} before it answers none`);
    if (x.plus && x.sort !== 'call') say(x.no, 'approximated', `${x.what}: its + is not read: activations are derived, and ${x.sort === 'async' ? 'an' : 'a'} ${x.sort} opens none`);
    if (x.minus && !(call && lastReply.get(call) === x)) say(x.no, 'approximated', `${x.what}: its - is not read: activations are derived, and a bar ends at the last reply to its call`);
    return { id: x.id, type: 'uml.Message', from: x.from.node.id, to: x.to.node.id, ...(x.label ? { label: x.label } : {}), ...(x.parent ? { parent: x.parent.id } : {}),
      props: { sort: x.sort, ...(call ? { replyTo: call.id } : {}) } };
  });

  const view = { id: viewId || MS_VIEW, diagram: 'uml.sequence', ...(title ? { title } : {}), nodeIds: nodes.map(n => n.id), edges, ...(frags.length ? { fragments: frags } : {}) };
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: view.id, nodes, edges: [], views: [view] }, report };
}

function writeMermaidSequence(model, viewId) {
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => !!x && typeof x === 'object';
  const flat = s => String(s).replace(/\r\n|\r|\n/g, '\\n'), nl = s => /[\r\n]/.test(String(s)), has = x => x != null && x !== '';
  const views = arr(m.views).filter(isObj);
  const view = viewId != null ? views.find(v => v.id === viewId) : views.find(v => v.diagram === 'uml.sequence');
  if (viewId != null && !view) return `%% not written: view ${flat(viewId)}, which the model does not have\n`;
  if (!view) return '%% not written: the model, which has no uml.sequence view\n';
  if (view.diagram !== 'uml.sequence') return `%% not written: view ${flat(view.id)}, a ${flat(view.diagram)} view, not a uml.sequence one\n`;
  const enc = s => String(s).replace(/[#;<>\\]/g, c => ({ '#': '#35;', ';': '#59;', '<': '#lt;', '>': '#gt;', '\\': '#92;' })[c]).replace(/\r\n|\r|\n/g, '<br>');
  const encA = s => enc(s).replace(/:/g, '#58;'); // an alias: its first colon splits the label from what it represents
  const out = [], notWritten = [], skip = x => notWritten.push(`${flat(x.id)} (${flat(x.type)})`), lose = (id, what) => notWritten.push(`${flat(id)}: ${flat(what)}`);
  const title = has(view.title) ? view.title : m.title;
  if (has(title)) out.push('---', `title: ${/^[\p{L}\p{N}][\p{L}\p{N} _.,()-]*$/u.test(title) && !title.endsWith(' ') ? title : JSON.stringify(String(title))}`, '---');
  if (view.id !== MS_VIEW) { if (nl(view.id)) lose(view.id, "the view's id, which has a line break"); else out.push(`%% id: ${view.id}`); }
  out.push('sequenceDiagram');

  // what is written: lifelines, occurrences (messages and uses) and fragments of the view
  const byId = new Map(arr(m.nodes).filter(isObj).map(n => [n.id, n]));
  const lifes = [];
  for (const id of arr(view.nodeIds)) { const n = byId.get(id); if (!n) continue; if (n.type === 'uml.Lifeline' && !nl(n.id)) lifes.push(n); else skip(n); }
  const isLife = new Set(lifes.map(n => n.id));
  const edgeOf = e => (typeof e === 'string' ? arr(m.edges).find(x => isObj(x) && x.id === e) : e);
  const occ = [];
  for (const x of arr(view.edges).map(edgeOf).filter(isObj)) {
    const ok = !nl(x.id) && (x.type === 'uml.Message' ? isLife.has(x.from) && isLife.has(x.to)
      : x.type === 'uml.InteractionUse' && arr(x.props?.covers).length > 0 && arr(x.props.covers).every(c => isLife.has(c)) && !nl(x.props.refersTo ?? ''));
    if (ok) occ.push(x); else skip(x);
  }
  const SORTS = ['call', 'async', 'reply', 'create', 'delete'];
  const frags = [], opOf = new Map();
  for (const f of arr(view.fragments).filter(isObj)) {
    const ops = arr(f.members).filter(isObj), op = f.props?.operator;
    if (!MS_OPS.includes(op) || !ops.length || (ops.length > 1 && op !== 'alt' && op !== 'par') || nl(f.id) || ops.some(o => nl(o.id))) { skip(f); ops.forEach(skip); continue; }
    if (has(f.label)) lose(f.id, `label ${f.label}`);
    frags.push(f); ops.forEach((o, i) => opOf.set(o.id, { f, i }));
  }
  // where an element sits: the operands from the top down, through fragments that are written
  const chain = p => { const c = [], seen = new Set(); while (opOf.has(p) && !seen.has(p)) { seen.add(p); c.push(opOf.get(p)); p = opOf.get(p).f.parent; } return c.reverse(); };
  const full = new Set(), kids = new Map(); // fragments with an occurrence in them; the empty ones by the operand they end
  for (const x of occ) for (const { f } of chain(x.parent)) full.add(f);
  for (const f of frags) if (!full.has(f)) { const c = chain(f.parent), p = c.length ? c.at(-1).f.members[c.at(-1).i].id : null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(f); }

  // the sorts as written, and the replies' calls as the reader will find them
  const sortOf = new Map(), touched = new Set(), created = [];
  for (const x of occ) {
    if (x.type !== 'uml.Message') { arr(x.props.covers).forEach(c => touched.add(c)); continue; }
    let s = x.props?.sort;
    if (!SORTS.includes(s)) { lose(x.id, has(s) ? `sort ${s}, written as a call` : 'no sort, written as a call'); s = 'call'; }
    if (s === 'create' && (touched.has(x.to) || x.from === x.to)) { lose(x.id, 'sort create: the lifeline is in the diagram before it, written as a call'); s = 'call'; }
    if (s === 'create') created.push(x.to);
    touched.add(x.from); touched.add(x.to); sortOf.set(x, s);
  }
  const msgs = occ.filter(x => sortOf.has(x));
  const found = msMatch(msgs.map(x => ({ x, from: x.from, to: x.to, sort: sortOf.get(x), parent: x.parent })), frags);
  const callOf = new Map([...found].map(([r, c]) => [r.x, c.x])), lastReply = new Map(), answered = new Set();
  for (const [r, c] of callOf) { lastReply.set(c, r); answered.add(c); }
  for (const x of msgs) if (sortOf.get(x) === 'reply' && (callOf.get(x)?.id ?? undefined) !== (x.props?.replyTo ?? undefined)) {
    lose(x.id, has(x.props?.replyTo) ? `replyTo ${x.props.replyTo}, which is not the call the reader finds` : 'no replyTo, though the reader finds a call');
  }

  // lifelines: those not created up front, in the view's order, then the created ones where they are created
  const isCreated = new Set(created), written = [...lifes.filter(n => !isCreated.has(n.id)), ...created.map(id => byId.get(id))];
  if (written.some((n, k) => n !== lifes[k])) lose(view.id, 'the order of its lifelines: Mermaid places a lifeline a message creates after the others');
  const used = new Set(), next = new Map(), names = new Map(), taken = new Set(lifes.map(n => n.id)), takenNext = new Map();
  const idOf = (id, base) => { const d = msFree(used, next, msId(base)); used.add(id); return d === id ? null : id; }; // the hint, if one is needed
  const safe = id => /^[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*$/u.test(id) && !/-x/i.test(id) && !MS_KEYWORDS.has(msWord(id));
  const heads = new Map();
  for (const n of written) {
    let name = String(n.id);
    if (!safe(name)) { let base = name.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, ''); if (!safe(base)) base = 'L_' + base; name = msFree(taken, takenNext, base); taken.add(name); }
    names.set(n.id, name);
    const p = isObj(n.props) ? n.props : {}, st = arr(p.stereotypes), actor = st[0] === 'actor';
    st.slice(actor ? 1 : 0).forEach(s => lose(n.id, `stereotype ${s}`));
    const label = has(n.label) ? String(n.label) : '', alias = label !== name || has(p.represents) ? encA(label) + (has(p.represents) ? ' : ' + encA(p.represents) : '') : '';
    if (!has(n.label)) lose(n.id, 'no label, read as its name');
    heads.set(n.id, [idOf(n.id, name), `${actor ? 'actor' : 'participant'} ${name}${alias.trim() ? ' as ' + alias : ''}`]);
  }
  for (const n of lifes) if (!isCreated.has(n.id)) { const [hint, text] = heads.get(n.id); out.push(...(hint ? [`  %% id: ${hint}`] : []), `  ${text}`); }

  // the occurrences in time order, opening and closing fragments around them; an empty fragment ends its operand
  const stack = [], done = new Set(), broken = new Set(), count = new Map();
  const put = (depth, ...xs) => out.push(...xs.map(x => '  '.repeat(depth + 1) + x));
  const guard = o => (has(o.label) ? ' ' + enc(o.label) : '');
  const begin = f => {
    const op = f.props.operator, n = (count.get(op) || 0) + 1, o = f.members[0], fh = idOf(f.id, `${op}-${n}`), oh = idOf(o.id, `${f.id}.1`);
    count.set(op, n);
    put(stack.length, ...(fh ? [`%% id: ${fh}`] : []), ...(oh ? [`%% operand-id: ${oh}`] : []), op + guard(o));
    stack.push({ f, i: 0 }); done.add(f);
  };
  const ends = o => { for (const k of kids.get(o.id) || []) if (!done.has(k)) { begin(k); finish(); } };
  const advance = () => {
    const top = stack.at(-1), f = top.f;
    ends(f.members[top.i]);
    const o = f.members[++top.i], h = idOf(o.id, `${f.id}.${top.i + 1}`), alt = f.props.operator === 'alt';
    if (alt && !has(o.label)) lose(o.id, 'no guard, read as else');
    put(stack.length - 1, ...(h ? [`%% id: ${h}`] : []), alt ? (o.label === 'else' ? 'else' : 'else' + guard(o)) : 'and' + guard(o));
  };
  const finish = () => { const top = stack.at(-1); while (top.i < top.f.members.length - 1) advance(); ends(top.f.members[top.i]); stack.pop(); put(stack.length, 'end'); };
  const arrows = { call: '->>', async: '-)', reply: '-->>', create: '->>', delete: '-x' };
  for (const x of occ) {
    const c = chain(x.parent);
    let k = 0;
    while (k < stack.length && k < c.length && stack[k].f === c[k].f && stack[k].i === c[k].i) k++;
    const on = k < stack.length && k < c.length && stack[k].f === c[k].f && c[k].i > stack[k].i;
    while (stack.length > k + (on ? 1 : 0)) finish();
    if (on) while (stack[k].i < c[k].i) advance();
    for (let j = stack.length; j < c.length; j++) {
      if (done.has(c[j].f)) { if (!broken.has(c[j].f)) { broken.add(c[j].f); lose(c[j].f.id, 'its occurrences are not one run in the view\'s edges'); } break; }
      begin(c[j].f);
      while (stack.at(-1).i < c[j].i) advance();
    }
    const d = stack.length;
    if (x.type === 'uml.InteractionUse') {
      const cov = x.props.covers, ks = cov.map(id => written.findIndex(n => n.id === id)), lo = ks.reduce((a, b) => Math.min(a, b)), hi = ks.reduce((a, b) => Math.max(a, b));
      if (written.slice(lo, hi + 1).some((n, j) => n.id !== cov[j]) || cov.length !== hi - lo + 1) lose(x.id, `covers ${cov.join(', ')}, which are not lifelines next to each other in order`);
      idOf(x.id, x.id);
      const ends2 = lo === hi ? names.get(written[lo].id) : `${names.get(written[lo].id)},${names.get(written[hi].id)}`;
      put(d, `%% use: ${x.id}${has(x.props.refersTo) ? ' refersTo=' + x.props.refersTo : ''}`, `Note over ${ends2}: ref${has(x.label) ? ' ' + enc(x.label) : ''}`);
      continue;
    }
    const s = sortOf.get(x);
    if (s === 'create') { const [hint, text] = heads.get(x.to); put(d, ...(hint ? [`%% id: ${hint}`] : []), 'create ' + text); }
    if (s === 'delete') put(d, `destroy ${names.get(x.to)}`);
    const h = idOf(x.id, `${x.from}-${x.to}`), plus = s === 'call' && answered.has(x) ? '+' : '', minus = s === 'reply' && lastReply.get(callOf.get(x)) === x ? '-' : '';
    put(d, ...(h ? [`%% id: ${h}`] : []), `${names.get(x.from)}${arrows[s]}${plus}${minus}${names.get(x.to)}:${has(x.label) ? ' ' + enc(x.label) : ''}`);
  }
  while (stack.length) finish();
  for (const f of kids.get(null) || []) if (!done.has(f)) { begin(f); finish(); }
  for (const x of notWritten) out.push(`  %% not written: ${x}`);
  return out.join('\n') + '\n';
}

export { readMermaidSequence, writeMermaidSequence };
