/* A markdown-it plugin (VitePress, or any markdown-it), as `umlimator/markdown-it` (#92): a ```umlimator fenced block
   becomes a <umlimator-map> element, which `umlimator/element` draws in the browser. md.use(umlimator)

     ```umlimator
     src: /maps/shop.json
     view: api
     ```

   The block's `key: value` lines are the element's attributes (src, view, minimap, controls, theme, height); after them,
   or instead of src, it may hold a model in JSON. An inline model goes into src as a data: URL, since VitePress compiles
   the page as a Vue template, which drops a <script> child. A block the element can't use fails the build, where it is
   seen. */
const KEYS = ['src', 'view', 'minimap', 'controls', 'theme', 'height'];

/** A block's text as the element's attributes. */
export function attrs(text) {
  const at = text.search(/^\s*\{/m), out = {};
  for (const line of (at < 0 ? text : text.slice(0, at)).split('\n').filter(l => l.trim())) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!m || !KEYS.includes(m[1])) throw new Error(`umlimator block: "${line.trim()}" is not one of ${KEYS.map(k => k + ':').join(' ')} or a model in JSON`);
    out[m[1]] = m[2];
  }
  if ((at >= 0) === !!out.src) throw new Error('umlimator block: give either src: (a model\'s URL) or a model in JSON');
  if (at >= 0) out.src = 'data:application/json,' + encodeURIComponent(JSON.stringify(JSON.parse(text.slice(at)))); // minified; a broken model throws
  return out;
}

const html = text => `<umlimator-map${Object.entries(attrs(text)).map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`).join('')}></umlimator-map>\n`;

export default function umlimator(md) {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, i, ...rest) => tokens[i].info.trim().split(/\s+/)[0] === 'umlimator' ? html(tokens[i].content) : fence(tokens, i, ...rest);
}
