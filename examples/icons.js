// Icons for render(): it draws the icons a model's `icons` table carries, and fetches nothing itself. The line icons in
// icons/ ship with the repository (Lucide, ISC). Brand logos don't (they are their owners' marks), so a card that names
// one keeps its kind's mark in these pages; the CLI downloads logos into the pages it writes.
export async function withIcons(model, base = new URL('../icons/', import.meta.url)) {
  const manifest = await (await fetch(new URL('manifest.json', base))).json();
  const names = [...new Set(model.nodes.map(n => n.icon))].filter(n => manifest[n]?.source === 'lucide');
  const inner = async n => (await (await fetch(new URL(manifest[n].file, base))).text()).replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').trim();
  return { ...model, icons: Object.fromEntries(await Promise.all(names.map(async n => [n, { g: await inner(n) }]))) };
}
