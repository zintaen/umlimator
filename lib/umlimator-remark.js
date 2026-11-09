/* A remark plugin (Docusaurus, MDX, or any remark-rehype pipeline), as `umlimator/remark` (#92): a ```umlimator fenced
   block becomes a <umlimator-map> element, with the attributes umlimator/markdown-it gives it (its header says what a
   block holds). The block's node becomes one that names the element (data.hName, data.hProperties), which MDX and
   remark-rehype both turn into it. remarkPlugins: [umlimator] */
import { attrs } from './umlimator-markdown-it.js';

export default function umlimator() {
  const walk = node => node.children?.forEach((c, i) => {
    if (c.type === 'code' && c.lang === 'umlimator') node.children[i] = { type: 'umlimator', data: { hName: 'umlimator-map', hProperties: attrs(c.value) }, children: [] };
    else walk(c);
  });
  return walk;
}
