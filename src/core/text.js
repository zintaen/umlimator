// Text width. Without a measurer: a monospace estimate (font-independent, so layouts are the same on every machine;
// the bench and layout() in Node use it). render() measures in the host's own font while it lays out a view: measured().
let measureText = null;
const measured = (M, f) => { const prev = measureText; measureText = M; try { return f(); } finally { measureText = prev; } };
/* markup-safe text: & < > " ' as entities, and a character no XML document may hold (a C0 control but tab, line feed and carriage
   return; U+FFFE, U+FFFF; a lone surrogate) as U+FFFD, as the readers write one (MERMAID_RAWS): a label pasted with one drew it
   raw into <text>, <title> and aria-label, and the page's Export SVG and a still's .svg were no well-formed XML (audit 53).
   One code unit for one: a text is as wide, and wraps where it did */
const XML_BAD = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/u, XML_BADS = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/gu;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(XML_BADS, '\uFFFD');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const md = s => String(s ?? '').trim().split(/\n{2,}/).map(b => /^\s*[-*] /.test(b)
    ? '<ul>' + b.split(/\n/).map(l => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>'
    : '<p>' + inline(b).replace(/\n/g, '<br>') + '</p>').join('');
// a Markdown text (md()'s: `code`, **bold**, ==mark==, [links](https://…), - bullets, blank-line paragraphs) as plain words, its
// first sentence only: what a tooltip and an accessible name say for it (audit 49: a weighted line read its markers aloud)
const mdPlain = s => String(s ?? '').replace(/^\s*[-*] /gm, '').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1').replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0];
const textW = (s, px) => measureText ? measureText(String(s ?? ''), px) : String(s ?? '').length * px * 0.6;
// a text's lines where its author broke it (a Mermaid <br>, F2's Shift+Enter), one line where it has none: each drawn on its
// own line, not as a space (audit 22, as flowWrap since audit 21); a broken text is as wide as its widest line (audit 24)
// the largest f(x) over xs (-Infinity for none), in a loop: Math.max(...xs) spreads every x as an argument, and a text
// broken on some 120,000 lines (a file under 1 MiB) throws a RangeError there (audit 25)
const widest = (xs, f) => { let w = -Infinity; for (const x of xs) w = Math.max(w, f(x)); return w; };
const brLines = t => String(t ?? '').split(/\r\n?|[\n\u2028\u2029]/), linesW = (s, px) => widest(brLines(s), l => textW(l, px));
const sansW = (s, px, k) => measureText ? measureText(String(s ?? ''), px) : textW(s, px) * k; // k: the estimate's sans correction
let ctx2d; // the 2D context text is measured on, probed once per module: jsdom has none, and says so on every try
function hostMeasure(el) { // widths in the font the host gives the map (--um-sans), memoised; null without a 2D canvas (jsdom)
  if (ctx2d === undefined) ctx2d = document.createElement('canvas').getContext('2d');
  const c = ctx2d; if (!c) return null;
  const cs = getComputedStyle(el), family = cs.getPropertyValue('--um-sans').trim() || cs.fontFamily || 'sans-serif', memo = new Map();
  return (s, px) => { const k = px + '\u0000' + s; let w = memo.get(k); if (w === undefined) { c.font = `600 ${px}px ${family}`; w = c.measureText(s).width; memo.set(k, w); } return w; };
}
/* the last i in [lo, hi] where ok(i) holds, ok true up to some i and false after it; lo - 1 when it holds for none. A text's
   width grows as words or characters are added, so wrap2() and fit() search their cut in a few measures rather than
   measuring every one: a card's 'what' or name of some thousands of characters froze render() for seconds (audit 26) */
const lastOk = (lo, hi, ok) => { let r = lo - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ok(m)) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
// a text on two lines: split at the word where the wider line is narrowest (the first such word), each line then fit to max
function wrap2(s, px, max) { const w = String(s ?? '').split(' '), n = w.length; if (n < 2) return null;
  const A = i => textW(w.slice(0, i).join(' '), px), B = i => textW(w.slice(i).join(' '), px), m = i => Math.max(A(i), B(i));
  // the first line widens and the second narrows as the split moves on: the narrowest wider line is where they cross
  const c = lastOk(1, n - 1, i => A(i) < B(i)) + 1; let i = c > n - 1 ? n - 1 : c > 1 && m(c - 1) <= m(c) ? c - 1 : c;
  if (m(i) > max) i = Math.max(1, lastOk(2, n - 1, j => A(j) <= max)); // too wide all the same: as much on the first line as fits
  return [fit(w.slice(0, i).join(' '), px, max, true), fit(w.slice(i).join(' '), px, max, true)]; }
// a text fits its room when its width is within a hair of it: a room worked out by subtraction (an ER row's, its entity sized
// to hold the widest name) loses 1e-14 to floating point, and the name the box was made for must not be cut (audit 33)
const fits = (s, px, max) => textW(s, px) <= max + 1e-6;
function clauseFit(s, px, max) { s = String(s ?? ''); if (fits(s, px, max)) return s; for (const sep of ['; ', ', ', ' (']) { const q = s.split(sep); let o = q[0]; if (textW(o, px) > max) continue; for (const x of q.slice(1)) { if (textW(o + sep + x, px) > max) break; o += sep + x; } return o; } return fit(s, px, max, true); }
function fit(s, px, max, words) { s = String(s ?? ''); if (fits(s, px, max)) return s; // words: cut between words where it can (a card's texts)
  let k; if (measureText) k = s.length <= 3 ? s.length : lastOk(4, s.length, j => textW(s.slice(0, j) + '…', px) <= max); // 3: none fits
  else k = Math.max(Math.floor(max / (px * 0.6)) - 1, 3);
  if (/[\uD800-\uDBFF]/.test(s[k - 1])) k--; // never half an emoji: a lone surrogate draws as a broken glyph
  const w = words ? s.slice(0, k + 1).replace(/\S*$/, '').replace(/[\s,;:]+$/, '') : '';
  return (w || s.slice(0, k)) + '…'; }

// A model's icon glyph (icons[k].g) as inert vector shapes (risks.md S2: an icon's SVG may carry script and is never
// inlined as it comes). Kept: the shape elements and their geometry and presentation attributes, each tag as written when
// all of it passes (a Lucide glyph comes back unchanged); a value holds plain characters only (no url(), entity or quote).
// Dropped: every other element and attribute (an event handler, href, style; image, use, foreignObject, script, a comment)
// and text, which a glyph never draws. A tag left open is closed, so a glyph never swallows the card's own marks (audit 18).
const GLYPH_EL = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g']);
const GLYPH_AT = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'pathLength',
  'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'vector-effect']);
const GLYPH_TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const GLYPH_ATTR = /\s+([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
const glyphs = new Map();
function glyph(g) {
  const s = typeof g === 'string' ? g : ''; let o = glyphs.get(s); if (o !== undefined) return o;
  const open = []; o = '';
  for (let i = 0; i < s.length;) {
    if (s[i] !== '<') { if (/\s/.test(s[i])) o += s[i]; i++; continue; }
    GLYPH_TAG.lastIndex = i; const m = GLYPH_TAG.exec(s);
    if (!m) { i++; continue; }
    i = GLYPH_TAG.lastIndex; const [tag, close, el, attrs, self] = m;
    if (!GLYPH_EL.has(el)) continue;
    if (close) { if (open[open.length - 1] === el) { open.pop(); o += tag; } continue; }
    const kept = [...attrs.matchAll(GLYPH_ATTR)].map(([, k, v]) => [k, v == null ? '' : /^["']/.test(v) ? v.slice(1, -1) : v])
      .filter(([k, v]) => GLYPH_AT.has(k) && /^[\w\s.,#%+\-()]*$/.test(v) && !/url\s*\(/i.test(v));
    o += kept.length === [...attrs.matchAll(GLYPH_ATTR)].length ? tag : `<${el}${kept.map(([k, v]) => ` ${k}="${v}"`).join('')}${self ? '/' : ''}>`;
    if (!self) open.push(el);
  }
  o += open.reverse().map(el => `</${el}>`).join('');
  if (glyphs.size < 512) glyphs.set(s, o);
  return o;
}

// a line break in a typed view's line label: each part its own line, EDGE_LH px below the one before (audit 22)
const EDGE_BREAK = /\r\n?|[\n\u2028\u2029]/, EDGE_LH = 12;
/* s without its leading and trailing '-', by index: `.replace(/^-+|-+$/g, '')` retries `-+$` at each dash of an inner run the slug
   kept, so a typed name of 200k dashes froze an add for 16 s (audit 54) */
const trimDash = s => { let i = 0, j = s.length; while (i < j && s[i] === '-') i++; while (j > i && s[j - 1] === '-') j--; return s.slice(i, j); };
export { trimDash, measureText, measured, esc, XML_BAD, inline, md, mdPlain, textW, widest, brLines, linesW, sansW, hostMeasure, wrap2, clauseFit, fit, glyph, EDGE_BREAK, EDGE_LH };
