// Text width. Without a measurer: a monospace estimate (font-independent, so layouts are the same on every machine;
// the bench and layout() in Node use it). render() measures in the host's own font while it lays out a view: measured().
let measureText = null;
const measured = (M, f) => { const prev = measureText; measureText = M; try { return f(); } finally { measureText = prev; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const md = s => String(s ?? '').trim().split(/\n{2,}/).map(b => /^\s*[-*] /.test(b)
    ? '<ul>' + b.split(/\n/).map(l => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>'
    : '<p>' + inline(b).replace(/\n/g, '<br>') + '</p>').join('');
const textW = (s, px) => measureText ? measureText(String(s ?? ''), px) : String(s ?? '').length * px * 0.6;
const sansW = (s, px, k) => measureText ? measureText(String(s ?? ''), px) : textW(s, px) * k; // k: the estimate's sans correction
let ctx2d; // the 2D context text is measured on, probed once per module: jsdom has none, and says so on every try
function hostMeasure(el) { // widths in the font the host gives the map (--um-sans), memoised; null without a 2D canvas (jsdom)
  if (ctx2d === undefined) ctx2d = document.createElement('canvas').getContext('2d');
  const c = ctx2d; if (!c) return null;
  const cs = getComputedStyle(el), family = cs.getPropertyValue('--um-sans').trim() || cs.fontFamily || 'sans-serif', memo = new Map();
  return (s, px) => { const k = px + '\u0000' + s; let w = memo.get(k); if (w === undefined) { c.font = `600 ${px}px ${family}`; w = c.measureText(s).width; memo.set(k, w); } return w; };
}
function wrap2(s, px, max) { const w = String(s ?? '').split(' '); let best = null;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), m = Math.max(textW(a, px), textW(b, px)); if (!best || m < best[2]) best = [a, b, m]; }
  if (best && Math.max(textW(best[0], px), textW(best[1], px)) > max) { let i = 1; while (i < w.length - 1 && textW(w.slice(0, i + 1).join(' '), px) <= max) i++; best = [w.slice(0, i).join(' '), w.slice(i).join(' ')]; }
  return best ? [fit(best[0], px, max, true), fit(best[1], px, max, true)] : null; }
function clauseFit(s, px, max) { s = String(s ?? ''); if (textW(s, px) <= max) return s; for (const sep of ['; ', ', ', ' (']) { const q = s.split(sep); let o = q[0]; if (textW(o, px) > max) continue; for (const x of q.slice(1)) { if (textW(o + sep + x, px) > max) break; o += sep + x; } return o; } return fit(s, px, max, true); }
function fit(s, px, max, words) { s = String(s ?? ''); if (textW(s, px) <= max) return s; // words: cut between words where it can (a card's texts)
  let k; if (measureText) { k = s.length; while (k > 3 && textW(s.slice(0, k) + '…', px) > max) k--; } else k = Math.max(Math.floor(max / (px * 0.6)) - 1, 3);
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

export { measureText, measured, esc, inline, md, textW, sansW, hostMeasure, wrap2, clauseFit, fit, glyph };
