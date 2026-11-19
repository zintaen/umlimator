/* ---------- What the seven Mermaid readers share (audit 24): a front-matter title, and text cut to a length ----------
   They share one scope in lib/umlimator-all.js, so this file is loaded before them.
   Mermaid reads front matter with js-yaml: a value is plain, "double quoted" (with backslash escapes) or 'single quoted'
   ('' is a quote), and a # after a space, or at the start, begins a comment.

   mermaidTitle(val) -> { title, rest }: val is the text after `title:`, trimmed. title is the value; rest is what a
   line holds after a closed quote that is no comment (the caller says it is not read), cut to 60 letters, or null. A
   plain value ends at its comment. A double-quoted value is read as JSON reads it, which covers YAML's common escapes;
   one JSON does not read keeps its text between the quotes. A quote never closed on its line is read to the line's end.

   mermaidFrontTitle(lines, j) -> { title, rest, end }: the title whose key is on lines[j], read over the lines that
   carry it as js-yaml reads them (audit 25), and end, the last of them. A block scalar (`title: >`, `title: |-`, with
   an indentation digit or not) holds the more-indented lines under it: | keeps their line breaks, > folds them with
   spaces, as YAML folds (a blank line, or a more-indented line, keeps its break). A plain or quoted value goes on over
   the indented lines after it, each joined with one space (a blank line with a line break). Line breaks at the start
   and end of the title are dropped, whatever the chomping indicator says, as a title is drawn on its own. */
function mermaidTitle(val) {
  const q = val[0];
  if (q !== '"' && q !== "'") return { title: val.replace(/(^|\s)#.*$/s, '').trim(), rest: null };
  let k = 1;
  for (; k < val.length; k++) {
    if (q === '"' && val[k] === '\\') k++;
    else if (val[k] === q) { if (q === "'" && val[k + 1] === "'") k++; else break; }
  }
  const span = val.slice(1, k), after = val.slice(k + 1).trim();
  let title = span;
  if (q === "'") title = span.replaceAll("''", "'");
  else { try { title = JSON.parse(`"${span}"`); } catch { /* YAML's own escape, \x41 say: the text as written */ } }
  return { title, rest: after && !after.startsWith('#') ? mermaidClip(after) : null };
}

function mermaidFrontTitle(lines, j) {
  const l = lines[j], val = l.slice(l.indexOf(':') + 1).trim();
  const more = k => k < lines.length && lines[k].trim() !== '---' && (!lines[k].trim() || /^\s/.test(lines[k]));
  let end = j;
  while (more(end + 1)) end++;
  while (end > j && !lines[end].trim()) end--; // blank lines after the value are not its own
  const body = lines.slice(j + 1, end + 1), block = /^([|>])(?:([1-9])[+-]?|[+-]([1-9])?)?(?:\s+#.*)?$/.exec(val);
  if (block) {
    const digit = block[2] || block[3], first = body.find(x => x.trim()); // the indicator's own digit, never one in a comment
    const base = digit ? +digit : first ? first.length - first.trimStart().length : 0;
    let out = '', prev = null, blanks = 0;
    for (let k = 0; k < body.length; k++) {
      const x = body[k];
      if (!x.trim()) { blanks++; continue; }
      if (x.length - x.trimStart().length < base) { end = j + k; break; } // less indented: the block ends (YAML refuses what follows)
      const t = x.slice(base), wide = /^\s/.test(t);
      if (prev === null) out = '\n'.repeat(blanks) + t;
      else if (block[1] === '>' && prev && !wide) out += blanks ? '\n'.repeat(blanks) + t : ' ' + t;
      else out += '\n'.repeat(blanks + 1) + t;
      prev = !wide; blanks = 0;
    }
    return { title: out.replace(/^\n+|\n+$/g, ''), rest: null, end };
  }
  let parts = [val], held = !!val, nl = false; // held: a word read so far; nl: a blank line since the last
  for (const x of body) { // in parts, joined once: a title over many lines is read in linear time (hostile input, R2)
    const y = x.trim();
    if (!y) { parts.push('\n'); nl = true; continue; }
    if (!held) parts = []; // what came before held no word: the title starts here
    parts.push(nl || !held ? y : ` ${y}`);
    held = true; nl = false;
  }
  const ft = mermaidTitle(parts.join(''));
  return { title: ft.title.replace(/^\n+|\n+$/g, ''), rest: ft.rest, end };
}

// s cut to its first n UTF-16 units, one less where the cut would fall between the two halves of an astral letter, so
// an id or a report never ends in a lone surrogate, which no UTF-8 file, SVG or XML holds
const mermaidCut = (s, n) => (s.length > n && /[\uD800-\uDBFF]/.test(s[n - 1]) ? s.slice(0, n - 1) : s.slice(0, n));
// the character a numeric entity code (#n;) names, above U+10FFFF as U+10FFFF; one that XML 1.0 cannot hold (#0;, a C0
// control other than tab, line feed and carriage return, a lone surrogate, U+FFFE or U+FFFF) as U+FFFD, and bad(code)
// told, as the BPMN reader does: a raw one would make the model's SVG and XML exports not well-formed (audit 47)
function mermaidChar(n, code, bad) {
  const v = Math.min(n, 0x10ffff);
  if (v === 9 || v === 10 || v === 13 || (v >= 0x20 && v <= 0xd7ff) || (v >= 0xe000 && v <= 0xfffd) || v >= 0x10000) return String.fromCodePoint(v);
  bad?.(code);
  return '\uFFFD';
}
// the report's message for such a code, said as approximated
const mermaidBadChar = code => `${mermaidClip(code)} names no character SVG or XML can hold: read as U+FFFD`;

// a character written as itself that XML 1.0 cannot hold (a C0 control other than tab, line feed and carriage return,
// U+FFFE, U+FFFF, a lone surrogate): mermaidLegal(s, bad) gives s with each as U+FFFD, and bad(what) told once, naming the
// first, when s held one. The entity codes' rule (mermaidChar) for the raw spelling, which reached the model unsaid: every
// reader (the seven Mermaid ones, Structurizr's, DBML's, BPMN's) passes its text through it (audit 48). Linear
const MERMAID_RAW = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/u, MERMAID_RAWS = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/gu;
function mermaidLegal(s, bad) {
  const m = MERMAID_RAW.exec(s);
  if (!m) return s;
  bad?.(`the character U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  return s.replace(MERMAID_RAWS, '\uFFFD');
}
// the report's message for such a character, said as approximated
const mermaidRawChar = what => `${what}, which SVG or XML cannot hold, is read as U+FFFD`;
// a Mermaid reader's whole text through mermaidLegal, each line that held one said once by say(line, ...)
function mermaidScrub(text, say) {
  if (!MERMAID_RAW.test(text)) return text;
  return text.split('\n').map((l, k) => mermaidLegal(l, what => say(k + 1, 'approximated', mermaidRawChar(what)))).join('\n');
}

// Mermaid's "string" token ("[^"]*") runs over line breaks (audit 49). mermaidOver(lines, say) -> over(i, s): s is line
// i's statement, trimmed, with a string left open; over gives { s, i, rest }: s and the lines after it joined with line
// feeds, to the first that closes every string (an odd count of " on it), its own indent kept, i that line's index, and
// rest the lines after s that are joined; or null when no later line closes it. Which line closes from where is found
// once, on first use: linear in the text. Mermaid takes out a %% comment line (/^\s*%%(?!{)[^\n]+\n?/gm, with the blank
// lines before it) before it reads any string, so such a line is not joined and its " count nothing; said, when a
// say(line, status, message) is given, once per string at its first such line (audit 51)
const MERMAID_COMMENT = /^\s*%%(?!\{)./, mermaidComment = l => MERMAID_COMMENT.test(l);
// the lines of a string after its first, less each %% comment line and the blank lines before it: { kept, cut }, cut the
// index of the first comment line or -1
function mermaidUncomment(ls) {
  const kept = [];
  let cut = -1;
  ls.forEach((l, k) => {
    if (!mermaidComment(l)) { kept.push(l); return; }
    while (kept.length && !kept.at(-1).trim()) kept.pop();
    if (cut < 0) cut = k;
  });
  return { kept, cut };
}
const MERMAID_IN_STRING = 'a %% line inside a "string" is a comment to Mermaid, which takes it out first: not read';
function mermaidOver(lines, say) {
  let next;
  return (i, s) => {
    if (!next) {
      next = new Int32Array(lines.length + 1).fill(-1);
      for (let k = lines.length - 1; k >= 0; k--) next[k] = !mermaidComment(lines[k]) && (lines[k].split('"').length - 1) % 2 ? k : next[k + 1];
    }
    const m = next[i + 1];
    if (m < 0) return null;
    const { kept: rest, cut } = mermaidUncomment(lines.slice(i + 1, m + 1)), kept = [s, ...rest];
    if (cut >= 0 && say) say(i + 2 + cut, 'approximated', MERMAID_IN_STRING);
    return { s: kept.join('\n').trim(), i: m, rest: kept.slice(1) };
  };
}
// whether a " opened in s is left open; stop(k) says where reading ends outside a string (a label's : say)
function mermaidOpen(s, stop = () => false) {
  let open = false;
  for (let k = 0; k < s.length; k++) if (s[k] === '"') open = !open; else if (!open && stop(k)) break;
  return open;
}

// a report's quote of the source: up to 60, else its first 57 and ...
const mermaidClip = s => (s.length > 60 ? mermaidCut(s, 57) + '...' : s);

// a reader's say(line, status, message) into report, which lists MERMAID_REPORT_MAX items, then counts the rest in one
// last item, kept current as more come (audit 30): a report stays proportionate to the input, as DBML's and BPMN's do (R2)
// mermaidSort(report) sorts the items by line, stable, the counting item kept last
// a label that is a number or true is written as its text, as the model draws it (audit 30) and every writer writes it (audit 31);
// any other value is returned as it is, for the writer to refuse
const mermaidText = x => (typeof x === 'number' || typeof x === 'boolean' ? String(x) : x);
const MERMAID_REPORT_MAX = 1000, MERMAID_TAILS = new WeakSet();
function mermaidSort(report) {
  report.sort((a, b) => a.line - b.line); // stable: one line's items keep their order
  const k = report.findIndex(x => MERMAID_TAILS.has(x));
  if (k >= 0) report.push(report.splice(k, 1)[0]);
  return report;
}
function mermaidSay(report) {
  let tail = null, at = -1, more = 0;
  return (line, status, message) => {
    if (report.length < MERMAID_REPORT_MAX) { report.push({ line, status, message }); return; }
    if (report[at] !== tail || !tail) { tail = { line: '', status: 'skipped', message: '' }; MERMAID_TAILS.add(tail); at = report.push(tail) - 1; more = 0; }
    tail.message = `${++more} more items like these: not listed`;
  };
}

export { mermaidTitle, mermaidFrontTitle, mermaidCut, mermaidClip, mermaidChar, mermaidBadChar, mermaidLegal, mermaidRawChar, mermaidScrub, mermaidOver, mermaidOpen, mermaidComment, mermaidUncomment, MERMAID_IN_STRING, mermaidSay, mermaidSort, mermaidText, MERMAID_REPORT_MAX };
