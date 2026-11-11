import { textW } from '../core/text.js';

/* wire kinds on maps: colour says what the line means; state reads/writes stay light */
const WIRES = [['calls', 'calls', 'runs or invokes it'], ['feeds', 'feeds', 'hands work on'], ['triggers', 'triggers', 'suggests, offers, fires'], ['state', 'state', 'reads or writes a file, board, config'], ['guard', 'guard', 'a hook steps in']];
// a node's badges: `badges` (strings or {text, tone}), else the single `badge`
const badgesOf = n => (Array.isArray(n.badges) && n.badges.length ? n.badges : n.badge ? [n.badge] : [])
  .map(b => b && typeof b === 'object' ? { text: String(b.text ?? ''), tone: b.tone } : { text: String(b ?? '') }).filter(b => b.text);
const toneOf = b => { if (b.tone) return 'var(--um-' + String(b.tone).replace(/[^\w-]/g, '') + ')'; const w = b.text.toUpperCase().split('·')[0].trim();
  return 'var(--um-' + (['BUILT', 'DECIDED'].includes(w) ? 'green' : ['PARTIAL', 'OPEN', 'OPT-IN'].includes(w) ? 'amber' : w === 'NOT BUILT' ? 'rose'
    : ['PROPOSED', 'AGREED', 'TARGET'].includes(w) ? 'accent' : 'slate') + ')'; };
// the tabs on a card's top border, left to right: its badges, else what its kind says (public, external, lane)
const mapTabs = (n, c) => { const tw = t => t.toUpperCase().length * 6.4 + 10, b = badgesOf(n); // the text as given: the sheet upper-cases it (#43)
  if (b.length) return b.map((x, i) => ({ text: x.text, fill: toneOf(x), badge: i, w: tw(x.text) }));
  const t = n.k === 'm-public' ? 'PUBLIC' : n.k === 'm-ext' ? 'EXTERNAL' : n.k === 'm-lane' ? 'LANE' : ''; return t ? [{ text: t, fill: c, w: tw(t) }] : []; };
const mapNodeW = n => {
  const px = n.emphasis ? 15 : 13;
  const sub = n.sub || n.sublabel || '', chips = (n.verbs || []).reduce((a, v) => a + textW(v, 9.5) + 14, -4); // its chips as svgOf draws them: each verb and 10 px, 4 px apart (#84)
  return Math.min(n.emphasis ? 205 : 386, Math.max(n.emphasis ? 146 : 138,
    Math.ceil(textW(n.label, px) + 70), badgesOf(n).length ? Math.ceil(badgesOf(n).reduce((a, b) => a + b.text.length * 6.4 + 10, 0) + (badgesOf(n).length - 1) * 4 + 120) : 0,
    Math.min(386, Math.ceil(Math.max(textW(sub, 10), chips) + 70))));
};

export { WIRES, badgesOf, toneOf, mapTabs, mapNodeW };
