// Types for lib/umlimator-remark.js, `umlimator/remark` (#92).
/** A remark plugin: each ```umlimator fenced block becomes a <umlimator-map> element (a node with data.hName, which MDX
 *  and remark-rehype draw as it). remarkPlugins: [umlimator] */
export default function umlimator(): (tree: any) => void;
