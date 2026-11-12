import { esc, fit, textW } from '../core/text.js';
import { SHAPE, r2 } from '../draw/shapes.js';
import '../typed/draw.js'; // SHAPE.classifier, the lifeline's head
import { TA } from '../layout/timeaxis.js';

/* ---------- frames and lifelines (work package 3.2, notes/stage-3.md §4.2) ----------
   The shapes a time-axis view draws as nodes, so the canvas selects, names and focuses them as it does any node:
   - lifeline: the classifier with no compartment ("name : Type", «actor» over it), and inside its group a transparent strip
     24 px wide down its stem (n.stem: layoutTimeAxis's stem), cut at the stem's gaps, so a click on the stem lands on the
     lifeline and one on a message, its arrowhead or a loop lands on the message (S3);
   - frame: a combined fragment's pentagon tag (n.label, the operator) and a transparent outline to hit;
   - operand: its guard, "[label]", at (n.gx, n.gy), on a backing;
   - use: an interaction use's "ref" tag and its name, centred, on a backing, over a transparent box to hit.
   Outlines, dividers and a use's box are not the nodes': frame() draws them, in the type's `under` layer, before the bars.
   Every text sits on a backing in the stage's colour, so a bar under it never hides it (spike R1). The sizes these draw
   are tagSize(), guardSize() and useSize(), which the type measures with and gives layoutTimeAxis. Only lib/umlimator-all.js
   holds this file. */

const FR = { tag: 11, guard: 10.5, name: 11, tagH: 17, guardH: 14, cut: 5 }; // font sizes; the tag's and the guard's height; the tag's cut corner
const FR_LINE = 'var(--um-muted)'; // 3:1 or more on the stage in both themes, as a typed view's lines (1.11)
const tagSize = t => ({ w: Math.ceil(textW(t, FR.tag) + 14), h: FR.tagH });
const guardSize = t => (t == null || t === '' ? { w: 0, h: 0 } : { w: Math.ceil(textW(`[${t}]`, FR.guard) + 6), h: FR.guardH });
const useSize = t => ({ w: Math.ceil(2 * (tagSize('ref').w + TA.gx) + textW(t, FR.name) + 6), h: 2 * FR.tagH + 4 });
const frText = (x, y, t, px, w = 600, a = 'start') => `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${a}" fill="var(--um-text)" style="font:${w} ${px}px var(--um-sans)">${esc(t)}</text>`;

// UML's frame without its tag: the outline and a dashed divider at each y, for the `under` layer. Stage 4's inline
// interactions, state regions and partitions draw theirs with it too
function frame(x, y, w, h, dividers = []) {
  return `<g class="frame-box"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="none" stroke="${FR_LINE}" stroke-width="1.2"/>`
    + dividers.map(d => `<path d="M${r2(x)} ${r2(d)}H${r2(x + w)}" stroke="${FR_LINE}" stroke-width="1.2" stroke-dasharray="5 4"/>`).join('') + '</g>';
}
// the pentagon tag at a frame's top left corner, max: the room it may take (its text is cut to it)
function frameTag(x, y, t, max = Infinity) {
  const s = tagSize(t), w = Math.min(s.w, max), h = s.h;
  return `<path d="M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h - FR.cut)}L${r2(x + w - FR.cut)} ${r2(y + h)}H${r2(x)}Z" class="n-body f-tag" fill="var(--um-stage-bg)" stroke="${FR_LINE}"/>`
    + frText(x + 6, y + 12.5, fit(t, FR.tag, w - 12), FR.tag);
}
const frameNode = (n, shape, said, inner) => `<g class="node ${shape}" data-id="${esc(n.id)}" data-shape="${shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || said)}">${inner}</g>`;

SHAPE.lifeline = {
  size: n => SHAPE.classifier.size({ ...n, compartments: [] }),
  draw(n, c, f) {
    const head = SHAPE.classifier.draw({ ...n, compartments: [], type: n.type || 'uml.Lifeline' }, c, f), S = n.stem, cuts = [];
    if (S) { let at = S.y1; [...(S.gaps || []), { y1: S.y2, y2: S.y2 }].forEach(g => { if (g.y1 > at) cuts.push(`M${r2(S.x)} ${r2(at)}V${r2(g.y1)}`); at = Math.max(at, g.y2); }); }
    const strip = cuts.length ? `<path d="${cuts.join('')}" class="ll-hit" fill="none" stroke="transparent" stroke-width="${2 * TA.hit}"/>` : '';
    // the classifier's group, named a lifeline, with the strip inside it
    return head.replace('class="node classifier"', 'class="node lifeline"').replace('data-shape="classifier"', 'data-shape="lifeline"')
      .replace(/aria-label="[^"]*"/, m => (n.aria ? `aria-label="${esc(n.aria)}"` : m)).replace(/<\/g>$/, strip + '</g>');
  },
};
SHAPE.frame = {
  draw: n => frameNode(n, 'frame', `Combined fragment ${n.label ?? ''}`, `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="f-hit" fill="none" stroke="transparent" stroke-width="8"/>${frameTag(n.x, n.y, String(n.label ?? ''), n.w)}`),
};
SHAPE.operand = {
  draw(n) { const t = n.label == null || n.label === '' ? '' : `[${n.label}]`, s = guardSize(n.label), w = Math.min(s.w, n.x + n.w - n.gx - 2);
    return frameNode(n, 'operand', `Operand ${n.label ?? ''}`, `<rect x="${r2(n.gx)}" y="${r2(n.gy)}" width="${r2(Math.max(w, 24))}" height="${FR.guardH}" class="f-guard" fill="${t ? 'var(--um-stage-bg)' : 'transparent'}"/>`
      + (t ? frText(n.gx + 3, n.gy + 10.5, fit(t, FR.guard, w - 6), FR.guard, 500) : '')); },
};
SHAPE.use = {
  draw(n) { const t = String(n.label ?? ''), cx = n.x + n.w / 2, cy = n.y + n.h / 2, room = n.w - 2 * (tagSize('ref').w + TA.gx), nw = Math.min(textW(t, FR.name), room);
    return frameNode(n, 'use', `Interaction use ${t}`, `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="f-hit" fill="transparent"/>${frameTag(n.x, n.y, 'ref')}`
      + `<rect x="${r2(cx - nw / 2 - 3)}" y="${r2(cy - 8)}" width="${r2(nw + 6)}" height="16" class="f-name" fill="var(--um-stage-bg)"/>${frText(cx, cy + 4, fit(t, FR.name, room), FR.name, 600, 'middle')}`); },
};

export { frame, frameTag, tagSize, guardSize, useSize };
