// Types for lib/umlimator-markdown-it.js, `umlimator/markdown-it` (#92).
/** A markdown-it plugin: each ```umlimator fenced block becomes a <umlimator-map> element. md.use(umlimator) */
export default function umlimator(md: any): void;
/** A block's text as the element's attributes (src, view, minimap, controls, theme, height), an inline model as a data:
 *  URL in src. Throws on a block the element can't use. */
export function attrs(text: string): Record<string, string>;
