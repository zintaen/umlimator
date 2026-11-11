/* ================= diagram engine (shared by document diagrams and the map) =================
   Style adapted from tt-a1i/archify (MIT): semantic palette, opaque mask under a translucent
   fill, per-kind sigils, grid canvas, orthogonal rounded routes, arrow markers. */
const KIND = {
  frontend: ['cyan', 'Client / UI', 'people and screens'], backend: ['green', 'Service / API', 'runs the logic'], database: ['violet', 'Data store', 'keeps data'],
  cloud: ['amber', 'Infra / Cloud', 'hosts, observability'], security: ['rose', 'Auth / Security', 'checks and holds secrets'], queue: ['orange', 'Queue / Event', 'hands work on'],
  external: ['slate', 'External', 'outside the system'], file: ['slate', 'File / Doc', 'a document or config'], ai: ['fuchsia', 'Agent / AI', 'an agent or model'],
  // map-mode kinds (skill / architecture maps)
  'm-public': ['k-public', 'Public skill', 'you run it'], 'm-lane': ['k-lane', 'Board lane', 'the board starts it'],
  'm-ext': ['k-ext', 'External skill', 'from another pack'], 'm-verb': ['k-verb', 'Impeccable verb', 'a design command'],
  'm-script': ['k-script', 'Script', 'code a skill runs'], 'm-hook': ['k-hook', 'Hook / guard', 'fires on its own'],
  'm-board': ['k-board', 'State', 'board, config, ledgers'],
  'm-step': ['k-public', 'Process step', 'open for implementation details'],
};
const MAPK = { /* umlimator */ public: 'm-public', lane: 'm-lane', script: 'm-script', 'skill-dep': 'm-ext', dep: 'm-ext', verb: 'm-verb', step: 'm-step', hook: 'm-hook', guard: 'm-hook', board: 'm-board', state: 'm-board' };
const ALIAS = { client: 'frontend', ui: 'frontend', web: 'frontend', page: 'frontend', browser: 'frontend', app: 'frontend', person: 'frontend', mobile: 'frontend',
  api: 'backend', service: 'backend', server: 'backend', function: 'backend', endpoint: 'backend', route: 'backend', script: 'backend', cli: 'backend', worker: 'backend', module: 'backend', package: 'backend',
  db: 'database', store: 'database', storage: 'database', cache: 'database', table: 'database', data: 'database',
  infra: 'cloud', cdn: 'cloud', deploy: 'cloud', host: 'cloud', ci: 'cloud',
  auth: 'security', secret: 'security', policy: 'security', guard: 'security', hook: 'security',
  bus: 'queue', event: 'queue', stream: 'queue', webhook: 'queue', cron: 'queue', job: 'queue',
  user: 'external', human: 'external', thirdparty: 'external', vendor: 'external',
  doc: 'file', config: 'file', skill: 'file', md: 'file', template: 'file', output: 'file',
  agent: 'ai', llm: 'ai', model: 'ai' };
const hasKey = (o, k) => Object.hasOwn(o, k); // a table's own key: "constructor" or "__proto__" is no kind, shape or notation
const kindOf = (k, map) => { k = String(k || '').toLowerCase(); if (map && hasKey(MAPK, k)) return MAPK[k]; return hasKey(KIND, k) ? k : hasKey(ALIAS, k) ? ALIAS[k] : map ? 'm-script' : 'backend'; };
const SIGIL = {
  frontend: '<rect x="2" y="3" width="12" height="8.5" rx="1.2"/><path d="M5.5 14h5M8 11.5V14"/>',
  backend: '<rect x="2.5" y="2.5" width="11" height="4.5" rx="1"/><rect x="2.5" y="9" width="11" height="4.5" rx="1"/><path d="M5 4.75h.01M5 11.25h.01"/>',
  database: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
  cloud: '<path d="M4.3 12.5h7.3a2.4 2.4 0 0 0 .2-4.8 4 4 0 0 0-7.5-1.3A3.1 3.1 0 0 0 4.3 12.5Z"/>',
  security: '<path d="M8 2.2 13 4v3.5c0 3.1-1.8 5.4-5 6.5-3.2-1.1-5-3.4-5-6.5V4Z"/><path d="m5.8 8 1.5 1.5 3-3"/>',
  queue: '<path d="M2 5h8M2 8h11M2 11h8"/><path d="m11 3.5 2 1.5-2 1.5M11 9.5l2 1.5-2 1.5"/>',
  external: '<rect x="2.5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M8 2.5h5.5V8M13.5 2.5 7.5 8.5"/>',
  file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3M6 8.5h4M6 11h4"/>',
  ai: '<path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/>',
  'm-public': '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.8"/><path d="m4.6 6.3 2 1.8-2 1.8M8.4 10.4h3"/>',
  'm-lane': '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.2h12M2 9.8h12"/><path d="m9.5 3.4 1.2.95-1.2.95"/>',
  'm-script': '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><path d="m7 8.3-1.5 1.6L7 11.5M9 8.3l1.5 1.6L9 11.5"/>',
  'm-ext': '<path d="M6.6 9.4 9.4 6.6"/><path d="m7.2 4.6 1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.8 11.4l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/>',
  'm-hook': '<path d="M8 2.2 13 4v3.5c0 3.1-1.8 5.4-5 6.5-3.2-1.1-5-3.4-5-6.5V4Z"/><path d="m5.8 8 1.5 1.5 3-3"/>',
  'm-verb': '<path d="M3 13 9.5 6.5M8 3l.7 1.6L10.3 5.3 8.7 6 8 7.6 7.3 6 5.7 5.3 7.3 4.6zM12 8.5l.45 1.05L13.5 10l-1.05.45L12 11.5l-.45-1.05L10.5 10l1.05-.45z"/>',
  'm-step': '<path d="M2 8h11M9 4l4 4-4 4"/>',
  'm-board': '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11M10 2.5v11"/><path d="M3.4 5.2h1.2M7.4 5.2h1.2M7.4 7.6h1.2M11.4 5.2h1.2"/>',
  // a shape's own mark (0.15.0), for a card with no icon whose shape says more than its kind does
  person: '<circle cx="8" cy="5.2" r="2.7"/><path d="M3 13.6c.5-2.7 2.5-4.2 5-4.2s4.5 1.5 5 4.2"/>',
  robot: '<rect x="3" y="5.2" width="10" height="8" rx="1.8"/><path d="M8 5.2V3M6.2 9.2h.01M9.8 9.2h.01M1.6 9.2h1.4M13 9.2h1.4"/>',
  mobile: '<rect x="4.4" y="1.8" width="7.2" height="12.4" rx="1.5"/><path d="M7.3 11.9h1.4"/>',
  terminal: '<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.6"/><path d="m4.6 6.2 2 1.8-2 1.8M8.4 10.2h3"/>',
  folder: '<path d="M2 4.3c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.2c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2H3.2C2.5 13.3 2 12.8 2 12.1Z"/>',
  node: '<path d="M2.4 5.6 5 3h8.6v7.4L11 13H2.4Z"/><path d="M2.4 5.6H11V13M11 5.6 13.6 3"/>',
  // UML's component icon (§11.6.4): a box's mark in the uml notation
  component: '<path d="M4.5 4.5V2.3a.8.8 0 0 1 .8-.8h7.9a.8.8 0 0 1 .8.8v11.4a.8.8 0 0 1-.8.8H5.3a.8.8 0 0 1-.8-.8v-2.2M4.5 7v2"/><rect x="2" y="4.5" width="5" height="2.5" rx=".6"/><rect x="2" y="9" width="5" height="2.5" rx=".6"/>',
};
/* ================= card shapes (0.15.0) =================
   A notation draws each card as a shape: box (the default: every card a rounded box, as before), c4 (people, browser apps,
   phones, databases, queues and files as the C4 model's tools draw them) or uml (UML 2.5's actor, node, artifact, package
   and data store, and the component icon as a box's mark). A card's own `shape` wins in any notation. Each shape is drawn
   inside its card's own box, so layout, routing, widths and the layout check never see it: an outline (for the mask, the
   body, the stack, rings, the minimap and the glow), a face (the rows its mark and text use), details drawn over the body
   (one of them its accent, which lights as something arrives) and inset(side, t), how far inside the box's side the
   outline runs at t, which slides a line's end from the box onto the outline. */
const NOTATIONS = ['box', 'c4', 'uml'];
// what a notation draws: by the kind word the model wrote, then by the kind it means (docs/module-api.md, 0.15.0)
const NOTED = {
  c4: { person: 'person', user: 'person', human: 'person', mobile: 'mobile', agent: 'robot', cli: 'terminal',
    frontend: 'browser', database: 'cylinder', queue: 'pipe', file: 'document', 'm-hook': 'hexagon' },
  uml: { person: 'person', user: 'person', human: 'person', agent: 'robot', module: 'folder', package: 'folder',
    cloud: 'node', database: 'cylinder', file: 'document', 'm-hook': 'hexagon' },
};

export { KIND, MAPK, ALIAS, hasKey, kindOf, SIGIL, NOTATIONS, NOTED };
