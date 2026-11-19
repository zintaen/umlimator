// Icons for render(): it draws the icons a model's `icons` table carries, and fetches nothing itself. The line icons in
// icons/ ship with the repository (Lucide, ISC). Brand logos don't (they are their owners' marks), so a card that names
// one keeps its kind's mark in these pages; the CLI downloads logos into the pages it writes.
// The model's own table is kept for its inline glyphs (`g`, which render() draws as inert shapes), a Lucide icon of the
// same name drawn in its place. An image (`src`) is an address these pages would fetch, which a model pasted or shared
// in a link must never make them do (risks.md S1, S2): it is left out, and so is an entry with no glyph, each said in
// `said` as a warning at its path (audit 44: the whole table was replaced, a model's own glyphs lost without a word).
export async function withIcons(model, base = new URL('../icons/', import.meta.url), said = []) {
  const manifest = await (await fetch(new URL('manifest.json', base))).json();
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
  const cards = [...arr(model.nodes), ...arr(model.views).flatMap(v => (obj(v) ? [...arr(v.nodes), ...(obj(v.nodeOverrides) ? Object.values(v.nodeOverrides) : [])] : []))];
  const names = [...new Set(cards.map(n => (obj(n) ? n.icon : null)))].filter(n => typeof n === 'string' && Object.hasOwn(manifest, n) && manifest[n]?.source === 'lucide');
  const inner = async n => (await (await fetch(new URL(manifest[n].file, base))).text()).replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').trim();
  const own = [];
  if (model.icons != null && !obj(model.icons)) said.push({ level: 'warning', path: 'icons', message: 'icons is not a table of icons by name: left out' });
  else for (const [k, I] of Object.entries(model.icons || {})) {
    const at = `icons.${k}`;
    if (obj(I) && typeof I.g === 'string' && I.g) {
      own.push([k, { g: I.g, ...(typeof I.name === 'string' ? { name: I.name } : {}) }]);
      if (I.src != null) said.push({ level: 'warning', path: `${at}.src`, message: 'an image, which this page never loads from a model: left out (its glyph in g is drawn)' });
    } else said.push({ level: 'warning', path: at, message: obj(I) && I.src != null ? 'an image, which this page never loads from a model: left out (only a glyph in g is drawn)' : 'no glyph in g: left out' });
  }
  return { ...model, icons: Object.fromEntries([...own, ...await Promise.all(names.map(async n => [n, { g: await inner(n) }]))]) };
}
