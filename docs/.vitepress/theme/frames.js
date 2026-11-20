// The live diagram frames (.ex-frame, tools/gallery.mjs) follow the site's light/dark switch, not only the system's (audit 58):
// VitePress marks the site dark with html.dark, and each framed page (same origin) takes the site's theme as its data-theme,
// set when the frame loads and again on every switch. The page's own ◐ still works inside the frame.
export function followSiteTheme(doc, Observer = globalThis.MutationObserver) {
  const theme = () => (doc.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const sync = f => { try { const d = f.contentDocument; if (d && d.documentElement) d.documentElement.dataset.theme = theme(); } catch (e) {} }; // another origin: left as it is
  const all = () => doc.querySelectorAll('.ex-frame iframe').forEach(sync);
  const onLoad = e => { const t = e.target; if (t && t.tagName === 'IFRAME' && t.closest && t.closest('.ex-frame')) sync(t); };
  doc.addEventListener('load', onLoad, true); // a frame's load does not bubble: caught on the way down
  const o = Observer ? new Observer(all) : null; if (o) o.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  all();
  return () => { doc.removeEventListener('load', onLoad, true); if (o) o.disconnect(); };
}
