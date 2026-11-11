import { WIRE_KINDS, arrOf, endsIn, picks } from './validate.js';

/* a lens (#94): what it lights on a view, as a layer of marks. Without `line`, the cards its pick picks and the lines
   between two of them; with `line` (line kinds), the lines of those kinds between two cards the rest of it picks, and the
   cards at their ends. The rest dims. With color 'owner', each lit card is ringed in its owner's tone, the same on every
   view (owners in name order); `owners`: the view's lit owners and their tones, for a legend. */
const OWNER_TONES = ['cyan', 'violet', 'green', 'amber', 'fuchsia', 'orange', 'rose', 'slate'];
function lensOf(ctx, vid, lens) {
  const v = ctx.V[vid], s = lens.pick && typeof lens.pick === 'object' && !Array.isArray(lens.pick) ? lens.pick : {}, { end } = endsIn(ctx, v), ok = id => picks(s, end(id));
  const kinds = s.line == null ? null : [s.line].flat(), cards = arrOf(v.nodeIds).filter(id => ctx.N[id]), all = ctx.viewEdges(v);
  const lines = all.filter(e => (!kinds || kinds.includes(WIRE_KINDS.includes(e.kind) ? e.kind : 'calls')) && ok(e.from) && ok(e.to));
  const lit = new Set(kinds ? lines.flatMap(e => [e.from, e.to]) : cards.filter(ok));
  // ponytail: eight tones, so the ninth owner shares the first's; a host that needs more rings cards itself with overlay()
  const names = [...new Set([...ctx.nodes, ...ctx.views.flatMap(w => Object.values(w.nodeOverrides || {}))].map(n => n && n.owner).filter(o => typeof o === 'string'))].sort();
  const tone = o => lens.color === 'owner' && names.includes(o) ? OWNER_TONES[names.indexOf(o) % OWNER_TONES.length] : null;
  const nodes = Object.fromEntries(cards.filter(id => lit.has(id)).map(id => [id, tone(end(id).owner) ? { tone: tone(end(id).owner) } : {}]));
  const owners = [...new Set(Object.keys(nodes).map(id => end(id).owner).filter(tone))].sort().map(o => [o, tone(o)]);
  const dim = Object.keys(nodes).length < cards.length || lines.length < all.length; // a lens that lights everything leaves the selection its own dimming
  return { layer: { nodes, edges: Object.fromEntries(lines.map(e => [e._id, {}])), dim }, owners };
}

export { lensOf };
