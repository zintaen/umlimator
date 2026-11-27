// A small JavaScript tokenizer for the repository's own tools: tools/protect.mjs reads test files with it, and
// tools/evolve/mutate.mjs finds the places it mutates. It knows strings, template literals (with ${} inside), comments,
// regular expression literals, numbers, names and punctuators, which is all these tools need: it is no parser.

const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||',
  '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
// after one of these names a / starts a regular expression, not a division
const BEFORE_RE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const ID_START = /[A-Za-z_$\u0080-￿]/, ID_PART = /[A-Za-z0-9_$\u0080-￿]/;
const NUM = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/;

// tokens: { type: 'ws' | 'comment' | 'str' | 'tpl' | 're' | 'num' | 'id' | 'punct', text, start, end }
export function tokenize(src) {
  const out = [];
  let i = 0, last = null; // last: the last token that is no space or comment
  const push = (type, start, end) => { const t = { type, text: src.slice(start, end), start, end }; out.push(t); if (type !== 'ws' && type !== 'comment') last = t; };
  while (i < src.length) {
    const c = src[i], start = i;
    if (/\s/.test(c)) { while (i < src.length && /\s/.test(src[i])) i++; push('ws', start, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; push('comment', start, i); continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; push('comment', start, i); continue; }
    if (c === '"' || c === "'") { i = endOfString(src, i); push('str', start, i); continue; }
    if (c === '`') { i = endOfTemplate(src, i); push('tpl', start, i); continue; }
    if (c === '/' && regexAllowed(last)) { i = endOfRegex(src, i); push('re', start, i); continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) { const m = NUM.exec(src.slice(i, i + 64)); i += m ? m[0].length : 1; push('num', start, i); continue; }
    if (ID_START.test(c) || c === '#' || (c === '\\' && src[i + 1] === 'u')) { i++; while (i < src.length && (ID_PART.test(src[i]) || src[i] === '\\')) i++; push('id', start, i); continue; }
    const p = PUNCT.find(x => src.startsWith(x, i));
    i += p && !(p === '?.' && /\d/.test(src[i + 2] || '')) ? p.length : 1;
    push('punct', start, i);
  }
  return out;
}

function regexAllowed(last) {
  if (!last) return true;
  if (last.type === 'punct') return ![')', ']', '}'].includes(last.text) && last.text !== '++' && last.text !== '--';
  if (last.type === 'id') return BEFORE_RE.has(last.text);
  return false;
}

function endOfString(src, i) {
  const q = src[i++];
  while (i < src.length && src[i] !== q && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, src.length);
}

function endOfTemplate(src, i) {
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '`') return i + 1;
    if (src[i] === '$' && src[i + 1] === '{') i = endOfBraces(src, i + 2); else i++;
  }
  return src.length;
}

// from just inside a ${, the index after its closing }
function endOfBraces(src, i) {
  let depth = 1, last = { type: 'punct', text: '{' };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = endOfString(src, i); last = { type: 'str' }; continue; }
    if (c === '`') { i = endOfTemplate(src, i); last = { type: 'tpl' }; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && regexAllowed(last)) { i = endOfRegex(src, i); last = { type: 're' }; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    if (!/\s/.test(c)) last = ID_PART.test(c) ? { type: 'id', text: c } : { type: 'punct', text: c };
    i++;
  }
  return src.length;
}

function endOfRegex(src, i) {
  i++;
  let cls = false;
  while (i < src.length && src[i] !== '\n') {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) { i++; break; }
    i++;
  }
  while (i < src.length && ID_PART.test(src[i])) i++; // flags
  return i;
}

// the value of a string literal or of a template literal with no ${}, else null
export function literal(tok) {
  if (!tok || (tok.type !== 'str' && tok.type !== 'tpl')) return null;
  const body = tok.text.slice(1, -1);
  if (tok.type === 'tpl' && /(^|[^\\])\$\{/.test(body)) return null;
  return body.replace(/\\(u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '', '\r\n': '' }[e] ?? e;
  });
}

// the tokens with space and comments taken out, each kept with its index in the full list
export const significant = toks => toks.map((t, k) => ({ ...t, k })).filter(t => t.type !== 'ws' && t.type !== 'comment');

// a stretch of source as its tokens, comments left out, one space between each two, so that a change of layout or of a
// comment reads as no change
export function normalized(toks, from, to) {
  const out = [];
  for (let k = from; k <= to; k++) if (toks[k].type !== 'ws' && toks[k].type !== 'comment') out.push(toks[k].text);
  return out.join(' ');
}

// 1-based line and column of an index
export function lineCol(src, index) {
  let line = 1, at = 0;
  for (let k = src.indexOf('\n'); k >= 0 && k < index; k = src.indexOf('\n', k + 1)) { line++; at = k + 1; }
  return { line, col: index - at + 1 };
}
