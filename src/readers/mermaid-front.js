/* ---------- What the seven Mermaid readers share (audit 24): a front-matter title, and text cut to a length ----------
   They share one scope in lib/umlimator-all.js, so this file is loaded before them.
   Mermaid reads front matter with js-yaml: a value is plain, "double quoted" (with backslash escapes) or 'single quoted'
   ('' is a quote), and a # after a space, or at the start, begins a comment.

   mermaidTitle(val) -> { title, rest }: val is the text after `title:`, trimmed. title is the value; rest is what a
   line holds after a closed quote that is no comment (the caller says it is not read), cut to 60 letters, or null. A
   plain value ends at its comment. A double-quoted value is read as JSON reads it, which covers YAML's common escapes;
   one JSON does not read keeps its text between the quotes. A quote never closed on its line is read to the line's end. */
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

// s cut to its first n UTF-16 units, one less where the cut would fall between the two halves of an astral letter, so
// an id or a report never ends in a lone surrogate, which no UTF-8 file, SVG or XML holds
const mermaidCut = (s, n) => (s.length > n && /[\uD800-\uDBFF]/.test(s[n - 1]) ? s.slice(0, n - 1) : s.slice(0, n));
// a report's quote of the source: up to 60, else its first 57 and ...
const mermaidClip = s => (s.length > 60 ? mermaidCut(s, 57) + '...' : s);

export { mermaidTitle, mermaidCut, mermaidClip };
