/*! umlimator: embeddable, layered architecture maps. MIT, see LICENSE.
 *
 *   import { render, layout, mountPage } from './umlimator.js';
 *   const map = render(element, model, { on: { select: e => ... } });   // map.update(model), map.destroy()
 *
 * Derived from the /visual page template of super-board by Eric Tech (MIT, THIRD_PARTY_NOTICES.md), whose section
 * layout adapts BuilderIO/skills (MIT) and whose diagram style, router approach and viewer UX (camera with reading
 * depths, minimap, node focus, finder, export) adapt tt-a1i/archify (MIT). See THIRD_PARTY_NOTICES.md.
 * One file, no dependencies, no build step, no network calls; docs/module-api.md describes the API.
 */
const STYLES = `
  /* diagrams */
  figure.dia { margin: 0 0 18px; padding: 18px 18px 14px; overflow: hidden; }
  @media (min-width: 1300px) { #diagram { position: relative; left: 50%; transform: translateX(-50%); width: min(1640px, calc(100vw - 64px)); } }
  figure.dia figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 18px; margin-bottom: 10px; }
  figure.dia .ft { font-weight: 600; font-size: 16px; }
  figure.dia .fc { color: var(--um-muted); font-size: 14px; margin-top: 10px; }
  .canvas { position: relative; overflow: hidden; border-radius: 10px; border: 1px solid var(--um-border); background-color: var(--um-bg-2); touch-action: none; cursor: grab; outline: none;
    background-image: radial-gradient(circle, var(--um-dot) 1.1px, transparent 1.4px), linear-gradient(var(--um-gridline) 1px, transparent 1px), linear-gradient(90deg, var(--um-gridline) 1px, transparent 1px); }
  .canvas:focus-visible { box-shadow: 0 0 0 2px var(--um-cyan); }
  .canvas.grabbing, .stage.grabbing { cursor: grabbing; }
  .canvas svg { display: block; position: absolute; inset: 0; }
  .canvas.full { position: fixed; inset: 12px; z-index: 60; border-radius: 14px; box-shadow: var(--um-shadow); height: auto !important; }
  body.noscroll { overflow: hidden; }
  .cam-hint { position: absolute; left: 10px; bottom: 8px; font: 500 11px var(--um-mono); color: var(--um-dim); pointer-events: none; opacity: 0; transition: opacity .2s; }
  .canvas:hover .cam-hint { opacity: 1; }
  .ctl { position: absolute; right: 10px; bottom: 10px; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 11px; background: var(--um-chrome); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); backdrop-filter: blur(10px); z-index: 4; }
  .ctl button { min-width: 30px; height: 28px; border: 0; background: none; color: var(--um-text); font: 600 13px var(--um-mono); border-radius: 8px; cursor: pointer; padding: 0 7px; }
  .ctl button:hover:not(:disabled) { background: var(--um-panel-2); color: var(--um-cyan); }
  .ctl button:disabled { opacity: .35; cursor: default; }
  .ctl .pct { min-width: 54px; font-weight: 500; color: var(--um-muted); }
  .ctl .sep { width: 1px; height: 18px; background: var(--um-border-2); margin: 0 3px; }
  .ctl .depth { font: 700 10px var(--um-mono); letter-spacing: .12em; color: var(--um-dim); padding: 0 8px; }
  .mini-ctl { opacity: .0; transition: opacity .2s; } .canvas:hover .mini-ctl, .canvas:focus-within .mini-ctl, .canvas.full .mini-ctl { opacity: 1; }
  @media (hover: none) { .mini-ctl { opacity: 1; } }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 600 11px var(--um-mono); color: var(--um-muted); align-items: center; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid; margin-right: 6px; vertical-align: -1px; }
  svg .n-mask { fill: var(--um-mask); }
  svg .n-body { stroke-width: 1.5; transition: stroke-width .15s, filter .15s; }
  svg .n-label { fill: var(--um-text); font: 600 13px var(--um-mono); letter-spacing: -.01em; }
  svg .n-sub { fill: var(--um-muted); font: 10px var(--um-mono); }
  svg .e-label { fill: var(--um-muted); font: 600 10px var(--um-mono); }
  svg .e-lbg { fill: var(--um-bg-2); stroke: var(--um-border); }
  svg .g-label { font: 700 10px var(--um-mono); letter-spacing: .12em; text-transform: uppercase; }
  svg .badge-tx { font: 700 8.5px var(--um-mono); letter-spacing: .08em; }
  /* a line's weight (#44) scales what is drawn for it: --um-ew is 1, 1.75 or 2.5 */
  :host { --um-ew: 1; } svg .wt-2 { --um-ew: 1.75; } svg .wt-3 { --um-ew: 2.5; }
  svg .edge { fill: none; stroke-width: calc(1.6px * var(--um-ew, 1)); stroke-linecap: round; stroke-linejoin: round; transition: stroke-width .15s, opacity .2s; }
  svg .halo { fill: none; stroke: var(--um-bg-2); stroke-width: calc(6px + 1.8px * (var(--um-ew, 1) - 1)); }
  svg .hitline { fill: none; stroke: transparent; stroke-width: calc(12px + 1.8px * (var(--um-ew, 1) - 1)); }
  svg .flowline { fill: none; stroke-width: calc(2.4px * var(--um-ew, 1)); stroke-linecap: round; stroke-dasharray: 10 70; opacity: 0; pointer-events: none; }
  .flowing svg .flowline { opacity: .9; animation: flowdash 2.4s linear infinite; }
  .flowing svg .edge { opacity: .8; }
  @keyframes flowdash { to { stroke-dashoffset: -160; } }
  /* intake badges and the view tour: a ticket dot rides the loop while flow is on */
  svg .n-logo { fill: var(--um-logo-tile); stroke: var(--um-border-2); stroke-width: .8; } svg .n-logo.dark { fill: var(--um-logo-tile-dark); }
  .ph .big.logo { background: var(--um-logo-tile) !important; box-shadow: inset 0 0 0 1px var(--um-border-2); } .ph .big.logo.dark { background: var(--um-logo-tile-dark) !important; }
  svg .intake-chip { fill: var(--um-logo-tile); stroke: var(--um-border-2); stroke-width: 1.2; }
  svg .intake-tx { fill: var(--um-muted); font: 600 10.5px var(--um-sans); }
  svg .intake-chip.dashed { fill: var(--um-panel); stroke: var(--um-w-feeds); stroke-dasharray: 3 3; }
  svg .intake-mark { fill: var(--um-intake-mark); font: 700 13px var(--um-sans); }
  svg .intake-chip.dashed + .intake-mark { fill: var(--um-w-feeds); }
  svg .tour, svg .tour-glow { display: none; pointer-events: none; }
  .flowing svg .tour, .flowing svg .tour-glow { display: inline; }
  svg .tour-glow { fill: none; stroke-width: 7; stroke-linecap: round; filter: blur(2.5px); }
  svg .tour-dot { fill: var(--um-w-feeds); stroke: var(--um-bg-2); stroke-width: 1.5; filter: drop-shadow(0 0 6px var(--um-w-feeds)); }
  svg .tour-packet { fill: var(--um-w-feeds); }
  .flowing svg .node.tour-stop { transform-box: fill-box; transform-origin: center; animation: tour-pulse 8s ease-in-out infinite; }
  @keyframes tour-pulse { 0%, 9%, 100% { transform: none; filter: none; } 4% { transform: scale(1.04); filter: drop-shadow(0 0 10px color-mix(in srgb, var(--um-w-feeds) 60%, transparent)); } }
  .flowing svg .edge-g.back .edge { animation: march 1.1s linear infinite; }
  @keyframes march { to { stroke-dashoffset: -22; } }
  @media (prefers-reduced-motion: reduce) { svg .tour, svg .tour-glow { display: none !important; } .flowing svg .node.tour-stop, .flowing svg .edge-g.back .edge { animation: none; } }
  @media (prefers-reduced-motion: reduce) { .flowing svg .flowline { animation: none; opacity: 0; } .flowing svg .edge { opacity: 1; } }
  .ctl button.on { color: var(--um-cyan); background: var(--um-cyan-f); }
  svg .flow { stroke-dasharray: 6 6; animation: flow 1.2s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  @media (prefers-reduced-motion: reduce) { svg .flow { animation: none; } }
  /* reading depths (archify): far out = shapes + names; closer = subs, verbs, edge labels */
  .depth-read { transition: opacity .18s; }
  [data-depth="map"] .depth-read { opacity: 0; pointer-events: none; }
  /* typed node styles (map) */
  svg .node { cursor: pointer; outline: none; }
  svg .node .n-ring { fill: none; stroke-width: 1.2; stroke-opacity: .38; }
  svg .node.pub .n-body { stroke-width: 2.6; }
  svg .node.pub .n-label { font-weight: 700; }
  svg .node.priv .n-body { stroke-width: 1; stroke-opacity: .7; fill-opacity: .5; }
  svg .node.priv .n-label { fill: var(--um-muted); font-weight: 500; font-size: 11.5px !important; }
  svg .node.priv .n-sub { display: none; }
  svg .node.priv .n-sigil { opacity: .7; }
  svg .node .n-stack { fill: var(--um-mask); stroke-width: 1; stroke-opacity: .45; }
  svg .node .ini-tx { font: 700 7.5px var(--um-mono); }
  svg .node .tab-tx, svg .family .tab-tx { font: 800 8px var(--um-mono); letter-spacing: .14em; fill: var(--um-mask); text-transform: uppercase; } svg .family .pub-tab { cursor: pointer; outline: none; }
  /* focus targets for lines and a card's tabs (#43): outside the cards, never hit by the pointer, a ring when focused by key */
  svg .um-key { outline: none; pointer-events: none; } svg .key-ring { fill: none; stroke: none; }
  svg .line-key:focus-visible .key-ring { stroke: var(--um-cyan); stroke-opacity: .55; stroke-width: calc(7.8px + 1.8px * (var(--um-ew, 1) - 1)); stroke-linecap: round; stroke-linejoin: round; }
  svg .tab-key:focus-visible .key-ring, svg .family .pub-tab:focus-visible rect { stroke: var(--um-cyan); stroke-width: 2; }
  svg .node .verb-chip { fill: var(--um-mask); stroke-width: .9; stroke-opacity: .6; }
  svg .node .verb-tx { font: 600 9.5px var(--um-mono); }
  svg .node.subject .n-body { stroke-dasharray: none; filter: drop-shadow(0 0 10px color-mix(in srgb, currentColor 0%, transparent)); }
  svg .node:hover .n-body, svg .node:focus-visible .n-body { stroke-width: 3; }
  svg .node.priv:hover .n-body { stroke-opacity: 1; }
  svg .node.priv:hover .n-label { fill: var(--um-text); }
  svg .node:focus-visible .n-mask { stroke: var(--um-cyan); stroke-width: 3; }
  svg .edge-g.hov .edge, svg .edge-g.hot .edge { stroke-width: calc(2.6px * var(--um-ew, 1)); }
  .focusing svg .node:not(.sel):not(.nb) { opacity: .28; }
  .focusing svg .edge-g:not(.hot) { opacity: .15; }
  .focusing svg .e-lab:not(.hot) { opacity: .15; }
  svg .node, svg .edge-g, svg .e-lab { transition: opacity .2s; }
  svg .node.sel .n-body { stroke-width: 3.2; }
  svg .node.sel .n-mask { stroke: var(--um-accent); stroke-width: 2; }
  svg .node.sel .n-body { animation: select-glow .65s ease-out; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--um-accent) 40%, transparent)); }
  svg .node.nb .n-body { stroke-width: 2.6; stroke-opacity: 1; }
  svg .n-port { fill: var(--um-panel); stroke-width: 1.5; pointer-events: none; transition: fill .2s, stroke-width .2s; }
  svg .node.sel .n-port, svg .node.nb .n-port.hot { fill: var(--um-accent); stroke: var(--um-accent); stroke-width: 2.2; }
  :host .focusing svg .edge-g.hot .flowline { opacity: .95; stroke-width: calc(3.4px * var(--um-ew, 1)); stroke-dasharray: 8 13; animation: selected-flow 1.1s linear infinite; }
  :host .focusing svg .edge-g.hot .edge { stroke-width: calc(2.8px * var(--um-ew, 1)); }
  @keyframes selected-flow { to { stroke-dashoffset: -42; } }
  @keyframes select-glow { from { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--um-accent) 70%, transparent)); stroke-width: 5; } }
  svg .node.main-step .n-body { stroke-width: 2.2; }
  svg .node.main-step .n-label { font-weight: 800; }
  @media (prefers-reduced-motion: reduce) {
    svg .node, svg .edge-g, svg .e-lab, svg .n-port { transition: none; }
    svg .node.sel .n-body, svg .node.flash .n-mask { animation: none; }
    :host .focusing svg .edge-g.hot .flowline { animation: none; opacity: .8; }
    .panel { animation: none !important; }
  }
  svg .node.flash .n-mask { animation: flash 1.3s ease-out; }
  @keyframes flash { 0%, 40% { stroke: var(--um-amber); stroke-width: 8; } 100% { stroke-width: 0; } }


  /* map: rounded wires with pill labels, lanes, step badges, author name tags */
  :host svg .e-lbg { fill: var(--um-panel); stroke: var(--um-border-2); }
  :host svg .e-label { fill: var(--um-text); font: 600 10.5px var(--um-sans); }
  :host svg .edge { stroke-width: calc(1.8px * var(--um-ew, 1)); }
  :host svg .w-state .edge { stroke-width: calc(1.4px * var(--um-ew, 1)); }
  :host .flowing svg .flowline { opacity: .45; }
  :host .flowing svg .edge { opacity: 1; }
  :host .flowing svg .w-state .flowline { opacity: 0; }
  svg .e-lab.ctag .e-lbg { fill: var(--um-accent-f); stroke: color-mix(in srgb, var(--um-accent) 45%, transparent); } svg .e-lab.ctag .e-label { fill: var(--um-accent); }
  svg .e-lab.w-state .e-label { fill: var(--um-muted); font-weight: 500; }
  svg .e-sub { fill: var(--um-muted); font: 500 9.5px var(--um-sans); }
  .lgi i.w { width: 18px; height: 0; border: 0; border-top: 2px solid; border-radius: 0; }
  .lgi i.w.dash { border-top-style: dashed; }
  svg .e-step { fill: var(--um-accent); } svg .e-step-tx { fill: var(--um-accent-fg); font: 700 9.5px var(--um-sans); }
  svg .lane-box { fill: var(--um-lane); stroke: var(--um-border); }
  svg .lane-num { fill: var(--um-accent); } svg .lane-num-tx { fill: var(--um-accent-fg); font: 700 11px var(--um-sans); }
  svg .lane-t { fill: var(--um-text); font: 700 11px var(--um-sans); } svg .lane-c { fill: var(--um-muted); font: 500 11px var(--um-sans); }
  svg .lane-arrow { fill: var(--um-dim); font: 600 16px var(--um-sans); }
  svg .stp { fill: var(--um-text); } svg .stp-tx { fill: var(--um-bg); font: 700 9.5px var(--um-sans); }
  svg .ntag-bg { fill: var(--um-panel); stroke: var(--um-border-2); }
  svg .ntag-tx { fill: var(--um-muted); font: 600 10px var(--um-sans); }
  svg .ntag-ring { fill: none; stroke-width: 1.6; }
  svg .ini-tx2 { font: 700 9px var(--um-sans); }
  :host svg .n-label, :host svg .e-label { font-family: var(--um-sans); }
  :host svg .n-sub, :host svg .verb-tx { font-family: var(--um-sans); }
  :host svg .n-label { font-weight: 650; letter-spacing: 0; }
  .stage.paused svg, .stage.paused svg * { animation-play-state: paused !important; }
  :host { font: 15px/1.6 var(--um-sans); color: var(--um-text); -webkit-font-smoothing: antialiased; }
  .stage { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; outline: none; background: var(--um-stage-bg); }
  .stage svg.map-svg { position: absolute; inset: 0; display: block; transition: opacity .13s ease; }
  .stage.fading svg.map-svg { opacity: 0; }
  /* controls + minimap, bottom right */
  .mctl { position: absolute; right: 16px; bottom: 40px; z-index: 3; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .minimap { width: 200px; height: 112px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); overflow: hidden; cursor: crosshair; padding: 6px; transition: opacity .2s; }
  .minimap.all { opacity: .6; } .minimap:hover { opacity: 1; }
  .minimap svg { width: 100%; height: 100%; display: block; }
  .minimap .vp { fill: color-mix(in srgb, var(--um-accent) 10%, transparent); stroke: var(--um-accent); }
  .mctl .ctl { position: static; border-radius: 12px; padding: 4px; background: var(--um-panel); border-color: var(--um-border-2); }
  .mctl .ctl button.on { color: var(--um-accent); background: color-mix(in srgb, var(--um-accent) 14%, transparent); }
  .mctl .ctl button:hover:not(:disabled) { color: var(--um-accent); }
  .empty-view { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); text-align: center; width: min(380px, 86%); z-index: 2; }
  .empty-view .ico { font-size: 28px; color: var(--um-dim); }
  .empty-view h4 { margin: 6px 0 4px; font: 650 16px var(--um-sans); }
  .empty-view p { margin: 0 0 12px; color: var(--um-muted); font-size: 13px; }
  svg .family-box { fill: var(--um-panel); fill-opacity: .45; stroke-width: 1.5; }
  svg .family-title { font: 650 11px var(--um-mono); }
  svg .family.sel .family-box { stroke: var(--um-accent); stroke-width: 2; }
  svg .edited-dot { fill: var(--um-edited); stroke: var(--um-mask); stroke-width: 1.5; }
  .um-rename { position: absolute; z-index: 5; box-sizing: border-box; font-family: var(--um-sans); font-weight: 600; color: var(--um-text); background: var(--um-panel); border: 1.5px solid var(--um-accent); border-radius: 6px; padding: 0 6px; outline: none; box-shadow: var(--um-shadow); }
  svg .um-ghost { opacity: .6; pointer-events: none; } svg .um-ghost.um-pending { opacity: .3; }
  svg .family.um-target .family-box { stroke: var(--um-accent); stroke-width: 2.5; stroke-dasharray: 6 4; }
  svg .um-handle circle { fill: var(--um-accent); stroke: var(--um-mask); stroke-width: 2; cursor: crosshair; }
  .um-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .um-still *, .um-still *::before, .um-still *::after { transition: none !important; animation: none !important; }
  svg .um-link { fill: none; stroke: var(--um-accent); stroke-width: 2; stroke-dasharray: 5 4; pointer-events: none; }
  @media (max-width: 820px) { .minimap { display: none; } .mctl { bottom: 14px; right: 12px; } }
` + /* each tone's tint (--um-<tone>-f), mixed at the map from the tone and panel in effect there: mixed on :root (as the theme
     file does, for page chrome) a tint keeps the tone it was mixed from, whatever an ancestor of the map sets later */
  `:host { ${Object.entries({ accent: 12, cyan: 9, green: 9, violet: 9, amber: 10, rose: 8, orange: 9, slate: 8, fuchsia: 8, 'k-public': 8, 'k-lane': 8,
    'k-ext': 7, 'k-verb': 7, 'k-script': 5, 'k-hook': 12, 'k-board': 9 }).map(([t, p]) => `--um-${t}-f: color-mix(in srgb, var(--um-${t}) ${p}%, var(--um-panel));`).join(' ')} }`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const md = s => String(s ?? '').trim().split(/\n{2,}/).map(b => /^\s*[-*] /.test(b)
    ? '<ul>' + b.split(/\n/).map(l => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>'
    : '<p>' + inline(b).replace(/\n/g, '<br>') + '</p>').join('');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
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
const ALIAS = { client: 'frontend', ui: 'frontend', web: 'frontend', page: 'frontend', browser: 'frontend', app: 'frontend',
  api: 'backend', service: 'backend', server: 'backend', function: 'backend', endpoint: 'backend', route: 'backend', script: 'backend', cli: 'backend', worker: 'backend', module: 'backend',
  db: 'database', store: 'database', storage: 'database', cache: 'database', table: 'database', data: 'database',
  infra: 'cloud', cdn: 'cloud', deploy: 'cloud', host: 'cloud', ci: 'cloud',
  auth: 'security', secret: 'security', policy: 'security', guard: 'security', hook: 'security',
  bus: 'queue', event: 'queue', stream: 'queue', webhook: 'queue', cron: 'queue', job: 'queue',
  user: 'external', human: 'external', thirdparty: 'external', vendor: 'external',
  doc: 'file', config: 'file', skill: 'file', md: 'file', template: 'file', output: 'file',
  agent: 'ai', llm: 'ai', model: 'ai' };
const kindOf = (k, map) => { k = String(k || '').toLowerCase(); if (map && MAPK[k]) return MAPK[k]; return KIND[k] ? k : (ALIAS[k] || (map ? 'm-script' : 'backend')); };
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
};
const CHG = { added: ['green', 'NEW'], new: ['green', 'NEW'], modified: ['amber', 'CHANGED'], changed: ['amber', 'CHANGED'], removed: ['rose', 'REMOVED'], planned: ['cyan', 'PLANNED'] };
const NW = 168, CG0 = 84, RG0 = 44;
const pillW = (label, sub, max = 440) => Math.max(sansW(fit(label, 10.5, max), 10.5, .92), sub ? sansW(fit(sub, 9.5, max), 9.5, .92) : 0) + 18; // a line's label, and its sublabel under it (#44)
// Text width. Without a measurer: a monospace estimate (font-independent, so layouts are the same on every machine;
// the bench and layout() in Node use it). render() sets measureText to the host's own font while it lays out a view.
let measureText = null;
const textW = (s, px) => measureText ? measureText(String(s ?? ''), px) : String(s ?? '').length * px * 0.6;
const sansW = (s, px, k) => measureText ? measureText(String(s ?? ''), px) : textW(s, px) * k; // k: the estimate's sans correction
let ctx2d; // the 2D context text is measured on, probed once per module: jsdom has none, and says so on every try
function hostMeasure(el) { // widths in the font the host gives the map (--um-sans), memoised; null without a 2D canvas (jsdom)
  if (ctx2d === undefined) ctx2d = document.createElement('canvas').getContext('2d');
  const c = ctx2d; if (!c) return null;
  const cs = getComputedStyle(el), family = cs.getPropertyValue('--um-sans').trim() || cs.fontFamily || 'sans-serif', memo = new Map();
  return (s, px) => { const k = px + '\u0000' + s; let w = memo.get(k); if (w === undefined) { c.font = `600 ${px}px ${family}`; w = c.measureText(s).width; memo.set(k, w); } return w; };
}
function wrap2(s, px, max) { const w = String(s ?? '').split(' '); let best = null;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), m = Math.max(textW(a, px), textW(b, px)); if (!best || m < best[2]) best = [a, b, m]; }
  if (best && Math.max(textW(best[0], px), textW(best[1], px)) > max) { let i = 1; while (i < w.length - 1 && textW(w.slice(0, i + 1).join(' '), px) <= max) i++; best = [w.slice(0, i).join(' '), w.slice(i).join(' ')]; }
  return best ? [fit(best[0], px, max, true), fit(best[1], px, max, true)] : null; }
function clauseFit(s, px, max) { s = String(s ?? ''); if (textW(s, px) <= max) return s; for (const sep of ['; ', ', ', ' (']) { const q = s.split(sep); let o = q[0]; if (textW(o, px) > max) continue; for (const x of q.slice(1)) { if (textW(o + sep + x, px) > max) break; o += sep + x; } return o; } return fit(s, px, max, true); }
function fit(s, px, max, words) { s = String(s ?? ''); if (textW(s, px) <= max) return s; // words: cut between words where it can (a card's texts)
  let k; if (measureText) { k = s.length; while (k > 3 && textW(s.slice(0, k) + '…', px) > max) k--; } else k = Math.max(Math.floor(max / (px * 0.6)) - 1, 3);
  const w = words ? s.slice(0, k + 1).replace(/\S*$/, '').replace(/[\s,;:]+$/, '') : '';
  return (w || s.slice(0, k)) + '…'; }
function roundPath(pts, r = 9) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += ` L ${x} ${y}`; continue; }
    const ax = x - (x - px) / l1 * rr, ay = y - (y - py) / l1 * rr, bx = x + (nx - x) / l2 * rr, by = y + (ny - y) / l2 * rr;
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1]; return d + ` L ${last[0]} ${last[1]}`;
}
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const warned = new Set(), warn = m => { if (!warned.has(m)) { warned.add(m); console.warn('umlimator: ' + m); } }; // each warning once

/* Layered auto-layout for views that carry no col/row: longest-path layers (cycles broken by DFS),
   barycentre ordering sweeps, integer rows so row gaps stay free as routing channels. */
/* A view about one node: the node sits in the middle, callers to its left, callees to its right,
   each further ring one column out on the side its neighbours are on. */
function hubLayout(ids, edges, hub) {
  const set = new Set(ids), es = edges.filter(e => set.has(e.from) && set.has(e.to) && e.from !== e.to);
  const nb = {}; ids.forEach(i => { nb[i] = new Set(); }); es.forEach(e => { nb[e.from].add(e.to); nb[e.to].add(e.from); });
  if (!nb[hub] || !nb[hub].size) return null;
  const dist = { [hub]: 0 }, q = [hub];
  while (q.length) { const u = q.shift(); nb[u].forEach(v => { if (dist[v] == null) { dist[v] = dist[u] + 1; q.push(v); } }); }
  const ring = [...nb[hub]], callers = ring.filter(i => es.some(e => e.from === i && e.to === hub) && !es.some(e => e.from === hub && e.to === i));
  const callees = ring.filter(i => !callers.includes(i));
  const side = { [hub]: 0 }, capCol = 7;
  callers.forEach(i => { side[i] = -1; });
  const leaves = callees.filter(i => [...nb[i]].every(v => v === hub || dist[v] === 1)).reverse();
  const deep = callees.filter(i => !leaves.includes(i));
  let right = [...deep, ...leaves.slice().reverse()];
  let left = callers.length;
  while (right.length > capCol && left < right.length - 1) { const mv = leaves.find(i => right.includes(i)) || right[right.length - 1]; right = right.filter(i => i !== mv); side[mv] = -1; left++; }
  right.forEach(i => { side[i] = 1; });
  ids.filter(i => dist[i] > 1).sort((a, b) => dist[a] - dist[b]).forEach(i => {
    const s = [...nb[i]].filter(v => side[v] != null && dist[v] < dist[i]).reduce((a, v) => a + Math.sign(side[v]), 0);
    side[i] = (s < 0 ? -1 : 1) * dist[i];
  });
  ids.filter(i => dist[i] === 1).forEach(i => { side[i] = Math.sign(side[i]) || 1; });
  const cols = {}; ids.filter(i => side[i] != null).forEach(i => (cols[side[i]] ||= []).push(i));
  const keys = Object.keys(cols).map(Number).sort((a, b) => Math.abs(a) - Math.abs(b));
  const rowOf = {}; rowOf[hub] = 0;
  keys.forEach(c => { // order by the rows of inner neighbours (barycentre)
    const inner = cols[c].map(i => { const ps = [...nb[i]].filter(v => rowOf[v] != null); return [i, ps.length ? ps.reduce((a, v) => a + rowOf[v], 0) / ps.length : 0]; });
    inner.sort((a, b) => a[1] - b[1]);
    inner.forEach(([i], k) => { rowOf[i] = k - (inner.length - 1) / 2; });
  });
  const pos = {}, minC = Math.min(...keys);
  let maxR = 0; keys.forEach(c => { maxR = Math.max(maxR, cols[c].length); });
  keys.forEach(c => cols[c].forEach(i => { pos[i] = [c - minC, Math.round(rowOf[i] + (maxR - 1) / 2)]; }));
  // resolve rounding collisions inside a column
  keys.forEach(c => { const used = new Set(); cols[c].sort((a, b) => pos[a][1] - pos[b][1]).forEach(i => { while (used.has(pos[i][1])) pos[i][1]++; used.add(pos[i][1]); }); });
  const loose = ids.filter(i => side[i] == null);
  if (loose.length) { const base = Math.max(...Object.values(pos).map(p => p[1])) + 1, per = Math.max(2, keys.length);
    loose.forEach((i, j) => { pos[i] = [j % per, base + Math.floor(j / per)]; }); }
  return pos;
}

function autoLayout(ids, edges, hub) {
  if (hub) { const hp = hubLayout(ids, edges, hub); if (hp) return hp; }
  ids = [...ids];
  const out = {}, inn = {}; ids.forEach(i => { out[i] = []; inn[i] = []; });
  const es = edges.filter(e => out[e.from] && out[e.to] && e.from !== e.to);
  const state = {}, back = new Set();
  const dfs = u => { state[u] = 1; es.filter(e => e.from === u).forEach(e => { if (state[e.to] === 1) back.add(e); else if (!state[e.to]) dfs(e.to); }); state[u] = 2; };
  const roots = ids.filter(i => !es.some(e => e.to === i));
  [hub, ...roots, ...ids].filter(i => i && out[i]).forEach(i => { if (!state[i]) dfs(i); });
  es.filter(e => !back.has(e)).forEach(e => { out[e.from].push(e.to); inn[e.to].push(e.from); });
  const layer = {}, linked = ids.filter(i => out[i].length || inn[i].length);
  const lay = (i, seen = new Set()) => { if (layer[i] != null) return layer[i]; if (seen.has(i)) return 0; seen.add(i);
    return (layer[i] = inn[i].length ? Math.max(...inn[i].map(p => lay(p, seen) + 1)) : 0); };
  if (hub && out[hub] && out[hub].length) { // a view about one node: it leads, its direct callees form the first ring
    layer[hub] = 0; out[hub].forEach(c => { layer[c] = 1; });
    inn[hub].forEach(p => { if (layer[p] == null) layer[p] = 1; });
    const lay2 = (i, seen = new Set()) => { if (layer[i] != null) return layer[i]; if (seen.has(i)) return 2; seen.add(i);
      const ps = inn[i].map(p => lay2(p, seen) + 1); return (layer[i] = Math.max(2, ...ps)); };
    linked.forEach(i => lay2(i));
  }
  linked.forEach(i => lay(i));
  // pull sinks right next to their callers instead of leaving them at layer 0
  if (!hub) linked.forEach(i => { if (!inn[i].length && out[i].length) layer[i] = Math.max(0, Math.min(...out[i].map(c => layer[c])) - 1); });
  const loose = ids.filter(i => !out[i].length && !inn[i].length);
  let maxL = linked.length ? Math.max(...linked.map(i => layer[i])) : -1;
  const below = loose.length && linked.length && (maxL + 2) * 290 > 1.5 * 114 * Math.max(1, ...Object.values(linked.reduce((a, i) => { a[layer[i]] = (a[layer[i]] || 0) + 1; return a; }, {})));
  if (below) ids = ids.filter(i => !loose.includes(i));
  if (loose.length && !below) { // isolated nodes: a compact block of extra columns
    const per = Math.max(3, Math.ceil(Math.sqrt(loose.length * 1.6)));
    loose.forEach((i, j) => { layer[i] = maxL + 1 + Math.floor(j / per); });
    maxL = Math.max(...ids.map(i => layer[i]));
  }
  const cols = Array.from({ length: maxL + 1 }, () => []);
  ids.forEach(i => cols[layer[i]].push(i));
  // split very tall columns so the map stays landscape
  const cap = Math.max(5, Math.ceil(Math.sqrt(ids.length) * 1.4));
  const pos = {};
  for (let sweep = 0; sweep < 6; sweep++) {
    cols.forEach((col, c) => {
      const ref = sweep % 2 ? cols[c + 1] : cols[c - 1]; if (!ref) return;
      const idx = Object.fromEntries(ref.map((n, k) => [n, k]));
      const bc = n => { const nb = (sweep % 2 ? out[n] : inn[n]).filter(x => idx[x] != null); return nb.length ? nb.reduce((a, x) => a + idx[x], 0) / nb.length : null; };
      const keyed = col.map((n, k) => [n, bc(n) ?? k]);
      keyed.sort((a, b) => a[1] - b[1]); cols[c] = keyed.map(x => x[0]);
    });
  }
  let cx = 0; const tallest = Math.min(cap, Math.max(...cols.map(c => c.length)));
  cols.forEach(col => {
    const chunks = []; for (let k = 0; k < col.length; k += cap) chunks.push(col.slice(k, k + cap));
    chunks.forEach(ch => { const off = Math.floor((tallest - ch.length) / 2); ch.forEach((n, r) => { pos[n] = [cx, r + off]; }); cx++; });
  });
  if (below) { // a wide graph keeps its loose nodes in a tidy row underneath
    const per = Math.max(2, cx), base = Math.max(...Object.values(pos).map(p => p[1])) + 1;
    loose.forEach((n, j) => { pos[n] = [j % per + Math.max(0, Math.floor((per - Math.min(per, loose.length)) / 2)), base + Math.floor(j / per)]; });
  }
  return pos;
}

/* wire kinds on maps: colour says what the line means; state reads/writes stay light */
const WIRES = [['calls', 'calls', 'runs or invokes it'], ['feeds', 'feeds', 'hands work on'], ['triggers', 'triggers', 'suggests, offers, fires'], ['state', 'state', 'reads or writes a file, board, config'], ['guard', 'guard', 'a hook steps in']];
// a node's badges: `badges` (strings or {text, tone}), else the single `badge`
const badgesOf = n => (Array.isArray(n.badges) && n.badges.length ? n.badges : n.badge ? [n.badge] : [])
  .map(b => b && typeof b === 'object' ? { text: String(b.text ?? ''), tone: b.tone } : { text: String(b ?? '') }).filter(b => b.text);
const toneOf = b => { if (b.tone) return 'var(--um-' + String(b.tone).replace(/[^\w-]/g, '') + ')'; const w = b.text.toUpperCase().split('·')[0].trim();
  return 'var(--um-' + (['BUILT', 'DECIDED'].includes(w) ? 'green' : ['PARTIAL', 'OPEN', 'OPT-IN'].includes(w) ? 'amber' : w === 'NOT BUILT' ? 'rose'
    : ['PROPOSED', 'AGREED', 'TARGET'].includes(w) ? 'accent' : 'slate') + ')'; };
// the tabs on a card's top border, left to right: its badges, else what its kind says (public, external, lane)
const mapTabs = (n, c) => { const tw = t => t.toUpperCase().length * 6.4 + 10, b = badgesOf(n); // the text as given: the sheet upper-cases it (#43)
  if (b.length) return b.map((x, i) => ({ text: x.text, fill: toneOf(x), badge: i, w: tw(x.text) }));
  const t = n.k === 'm-public' ? 'PUBLIC' : n.k === 'm-ext' ? 'EXTERNAL' : n.k === 'm-lane' ? 'LANE' : ''; return t ? [{ text: t, fill: c, w: tw(t) }] : []; };
const mapNodeW = n => {
  const px = n.emphasis ? 15 : 13;
  const sub = n.sub || n.sublabel || '';
  return Math.min(n.emphasis ? 205 : 386, Math.max(n.emphasis ? 146 : 138,
    Math.ceil(textW(n.label, px) + 70), badgesOf(n).length ? Math.ceil(badgesOf(n).reduce((a, b) => a + b.text.length * 6.4 + 10, 0) + (badgesOf(n).length - 1) * 4 + 120) : 0,
    Math.min(386, Math.ceil(textW(sub, 10) + 70))));
};
/* Geometry: node boxes, ports, orthogonal routes, label slots. A view with lines the router found no route for is laid
   out once more, with room where those lines need it (#40); a view whose lines all route keeps its geometry. */
function layoutGraph(dg, map) {
  const g = layoutPass(dg, map, null);
  if (!g.room) return g;
  const g2 = layoutPass(dg, map, g.room, true); g2.ms.probe = g.ms.probe; return g2;
}
function layoutPass(dg, map, room, last) { // room: { x: { col: px }, y: { row: px } }; last: lay out with it, find no more
  const __ms = { t: performance.now() }, t0 = __ms.t;
  const CG = dg.gap ? dg.gap : map ? (dg.mainSteps && !dg.containers ? 38 : 66) : CG0, RG = dg.rgap ? dg.rgap : map ? 44 : RG0; // family borders also need clearance between columns
  const NH = dg.nodeH || 64, pitch = NH + RG;
  const nodes = (dg.nodes || []).map((n, i) => {
    const k = kindOf(n.kind, map);
    const w = n.w || (map ? mapNodeW(n) : NW);
    return { ...n, k, col: n.col ?? i, row: n.row ?? 0, w, h: n.h || NH };
  });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const cols = dg.abs ? [] : [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const colX = {}, colW = {}; let x = 0;
  // a card with no line, in a row under every card that has one, sits in a row of its own (#46): it never widens a column
  const ends = new Set((dg.edges || []).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), low = Math.max(-Infinity, ...nodes.filter(n => ends.has(n.id)).map(n => n.row));
  if (low === -Infinity) ends.clear(); // no lines at all: no such row
  nodes.forEach(n => { n.aside = map && !dg.abs && !ends.has(n.id) && n.row > low; });
  cols.forEach(c => { const ns = nodes.filter(n => n.col === c && !n.aside); if (ns.length) colW[c] = Math.max(...ns.map(n => n.w)); });
  // a labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side
  const gapAfter = {}, colOf = {}, boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if (map && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);
    // labelled lines that leave (or reach) one card side by side run 16 px apart, too close for their pills to stack,
    // so the pills sit next to each other: the gap fits them all, with 6 px between pills
    const sum = {};
    // a line to a container ends on its box's border, beside the box's nearest column of cards
    const inBox = (b, seen = new Set()) => { const c = !seen.has(b) && seen.add(b) && (dg.containers || []).find(f => f.id === b);
      return c ? [...(c.nodeIds || []), ...(dg.containers || []).filter(k => k.parent === b).flatMap(k => inBox(k.id, seen))] : []; };
    const near = (b, other) => { const cs = inBox(b).map(i => colOf[i]).filter(c => c != null); if (other == null || !cs.length) return null;
      const lo = Math.min(...cs), hi = Math.max(...cs); return other < lo ? lo : other > hi ? hi : null; };
    (dg.edges || []).forEach(e => { const p = colOf[e.from] ?? near(e.from, colOf[e.to]), q = colOf[e.to] ?? near(e.to, colOf[e.from]); if (p == null || q == null || !e.label || Math.abs(p - q) !== 1) return;
      const c = Math.min(p, q), w = pillW(e.label, e.sublabel) + (e.step != null ? 20 : 0), box = boxOf(e.from) !== boxOf(e.to) || !(e.from in colOf) || !(e.to in colOf) ? 48 : 0;
      gapAfter[c] = Math.max(gapAfter[c] || 0, w + 54 + box);
      [e.from, e.to].forEach(id => { const k = c + '|' + id, t = sum[k] ||= { w: -6, box: 0 }; t.w += w + 6; t.box = Math.max(t.box, box); gapAfter[c] = Math.max(gapAfter[c], t.w + 54 + t.box); }); }); }
  const extraX = { ...(room || {}).x }, extraY = { ...(room || {}).y }; // more room after a column (row): for lines with no route, and where a box would touch another box (below)
  const gap = c => Math.max(CG, gapAfter[c] || 0) + (extraX[c] || 0);
  const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + gap(Math.floor(c)));
  const rowY = r => Object.keys(extraY).reduce((y, k) => +k < r ? y + extraY[k] : y, r * pitch);
  const place = () => {
    x = 0; for (let c = Math.floor(cols[0] ?? 0); c <= Math.ceil(cols[cols.length - 1] ?? 0); c++) { colX[c] = x; x += (colW[c] || NW) + gap(c); }
    nodes.forEach(n => { n.x = cx(n.col) + ((colW[n.col] || n.w) - n.w) / 2; n.y = rowY(n.row); if (map && n.k === 'm-script') { n.h = NH - 22; n.y += 11; } });
    let prev = null; // that row in column order: each card at its column, or right of the one before when that one is wider
    nodes.filter(n => n.aside).sort((a, b) => a.row - b.row || a.col - b.col).forEach(n => { if (prev && prev.row === n.row) n.x = Math.max(n.x, prev.x + prev.w + CG); prev = n; });
  };
  if (dg.abs) nodes.forEach(n => { n.x = n.ax; n.y = n.ay; if (map && n.k === 'm-script') { n.h -= 22; n.y += 11; } });
  else place();
  // Family frames enclose ordinary cards, so clicks, ports and focus keep their existing owners.
  // Children contribute their entire frame to their parent's bounds, rather than just their cards.
  const familyDefs = dg.containers || [], tagged = n => map && (n.author || n.k === 'm-ext'); // tagged: a name tag hangs under the card
  const framesNow = () => { const cache = {};
    const frameOf = (f, trail = new Set()) => {
      if (cache[f.id]) return cache[f.id];
      if (trail.has(f.id)) return null;
      const next = new Set([...trail, f.id]);
      const children = familyDefs.filter(c => c.parent === f.id).map(c => frameOf(c, next)).filter(Boolean);
      const members = (f.nodeIds || []).map(id => byId[id]).filter(Boolean);
      const rects = [...members.map(n => ({x:n.x - 36,y:n.y - 14,w:n.w + 72,h:n.h + 44 + (tagged(n) ? 14 : 0)})), ...children];
      if (!rects.length) return null;
      const p = 12, x = Math.min(...rects.map(r => r.x)) - p, y = Math.min(...rects.map(r => r.y)) - p - 24;
      return cache[f.id] = {...f, x, y, w:Math.max(...rects.map(r => r.x+r.w)) + p - x, h:Math.max(...rects.map(r => r.y+r.h)) + p - y};
    };
    const out = familyDefs.map(f => frameOf(f)).filter(Boolean);
    if (map) out.forEach(f => { // the box fits its title and its badges, which are tabs on its top border, at the right
      const tabs = badgesOf(f).map((b, i) => ({ text: b.text, fill: toneOf(b), badge: i, w: b.text.length * 6.4 + 10 })), all = tabs.reduce((a, t) => a + t.w + 4, -4);
      f.w = Math.max(f.w, String(f.label || f.id).length * 6.7 + 32 + (tabs.length ? all + 8 : 0));
      let tx = f.x + f.w - 12 - all; f.tabs = tabs.map(t => { const o = { ...t, x: tx }; tx += t.w + 4; return o; }); });
    return out;
  };
  // Boxes keep apart: a column (row) gap widens wherever a box would come within 32 px of another box, or of a card outside
  // it, so their borders never touch and a line can run between them. Frames are measured again until nothing is too close.
  if (map && !dg.abs && familyDefs.length) for (let pass = 0, BOXGAP = 32; pass < 4; pass++) {
    const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    const span = ns => ns.length ? { c0: Math.min(...ns.map(n => n.col)), c1: Math.max(...ns.map(n => n.col)), r0: Math.min(...ns.map(n => n.row)), r1: Math.max(...ns.map(n => n.row)) } : null;
    const fr = framesNow().map(f => ({ ...f, s: span(nodes.filter(n => within(n, f))) })).filter(f => f.s);
    const cards = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h + (tagged(n) ? 14 : 0), s: span([n]) }));
    const wantX = {}, wantY = {}, want = (o, k, v) => { if (v > 0) o[k] = Math.max(o[k] || 0, Math.ceil(v)); };
    fr.forEach((A, i) => [...fr.slice(i + 1), ...cards].forEach(B => {
      if (within(A, B) || within(B, A) || !hit(A, B, BOXGAP)) return;
      const a = A.s, b = B.s;
      if (a.c1 < b.c0 || b.c1 < a.c0) { const [L, R] = a.c1 < b.c0 ? [A, B] : [B, A]; want(wantX, Math.floor(L.s.c1), L.x + L.w + BOXGAP - R.x); }
      else if (a.r1 < b.r0 || b.r1 < a.r0) { const [T, U] = a.r1 < b.r0 ? [A, B] : [B, A]; want(wantY, Math.floor(T.s.r1), T.y + T.h + BOXGAP - U.y); }
    }));
    if (!Object.keys(wantX).length && !Object.keys(wantY).length) break;
    Object.entries(wantX).forEach(([k, v]) => { extraX[k] = (extraX[k] || 0) + v; }); Object.entries(wantY).forEach(([k, v]) => { extraY[k] = (extraY[k] || 0) + v; });
    place();
  }
  // decorations hanging on a node's top/bottom border (kind tab, step badge, ⤢ badge, author name tag):
  // ports keep off them, routes and labels treat the name tag as an obstacle
  if (map) nodes.forEach(n => {
    n.decoT = []; n.decoB = [];
    let tx = n.x + 12; mapTabs(n).forEach(t => { n.decoT.push([tx - 6, t.w + 12]); tx += t.w + 4; });
    if (n.step) n.decoT.push([n.x - 10, 24]);
    if (n.kids || n.opens) n.decoT.push([n.x + n.w - 46, 40]);
    if (n.author || n.k === 'm-ext') {
      const A = (dg.authors || {})[n.author] || {}, max = n.w - 40;
      let t = n.author ? '@' + n.author : 'unknown';
      while (t.length > 4 && sansW(t, 10, .92) + 42 > max) t = t.slice(0, -2) + '…';
      const w = Math.ceil(sansW(t, 10, .92) + 42);
      n.tag = { x: n.x + n.w - 12 - w, y: n.y + n.h - 9, w, h: 22, text: t, img: A.avatar || '', name: A.name || '' };
      n.decoB.push([n.tag.x - 2, n.tag.w + 4]);
    }
  });
  const tagRects = nodes.filter(n => n.tag).map(n => ({ x: n.tag.x - 2, y: n.tag.y - 2, w: n.tag.w + 4, h: n.tag.h + 6 }));
  const families = framesNow();
  families.forEach(f => (f.tabs || []).forEach(t => tagRects.push({ x: t.x - 2, y: f.y - 10, w: t.w + 4, h: 19 }))); // lines and labels keep off a box's tabs
  // intake sources: brand badges stacked left of the node they feed, each with its own short feeds line
  const intake = map ? (dg.intake || []).filter(b => byId[b.to]).map((b, i, all) => {
    const n = byId[b.to], mine = all.filter(o => o.to === b.to), k = mine.indexOf(b), off = k - (mine.length - 1) / 2;
    const cx = n.x - 72, cy = n.y + n.h / 2 + off * 34, py = n.y + n.h / 2 + off * Math.min(16, (n.h - 20) / Math.max(1, mine.length - 1));
    const ex = n.x - 38 + Math.abs(off) * 6; // nested elbows: an outer badge turns nearer the card, so lines never cross
    return { ...b, cx, cy, r: 14, pts: simplify([[cx + 15, cy], [ex, cy], [ex, py], [n.x, py]]) };
  }) : [];
  intake.forEach(b => tagRects.push({ x: b.cx - b.r - 4, y: b.cy - b.r - 4, w: 2 * b.r + 8, h: 2 * b.r + 8 }));
  /* ---- routing: one orthogonal route per edge, no shared trunks ----
     Ported in approach from archify's router (MIT): renderers/shared/route-quality.mjs
     shortestOrthogonalGridRoute + renderers/architecture/routing.mjs. Each edge gets its own
     port, spread along the node side in the order its far end lies; then a sparse orthogonal
     visibility grid (node edges ± clearance, endpoint stubs, gap centre lines, earlier routes
     ± separation) is searched with Dijkstra, carrying the incoming direction so turns cost a
     bend penalty. Earlier routes may never be overlapped and are crossed only when no clean
     route exists; earlier labels are obstacles, so later routes keep clear of them. */
  // an end may be a container: the line ends on its box's border, whose title the ports keep clear of (not a box and
  // something inside it: that has no line)
  const boxEnd = map ? Object.fromEntries(families.map(f => [f.id, { id: f.id, label: f.label || f.id, box: true, x: f.x, y: f.y, w: f.w, h: f.h,
    decoT: [[f.x + 8, Math.min(f.w - 16, textW(f.label || f.id, 11) + 16)], ...(f.tabs || []).map(t => [t.x - 6, t.w + 12])], decoB: [] }])) : {};
  const end = id => byId[id] || boxEnd[id], holds = (b, n) => b.box && n !== b && n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;
  const edges = (dg.edges || []).filter(e => { const s = end(e.from), t = end(e.to); if (!s || !t || e.from === e.to) return false;
    if (holds(s, t) || holds(t, s)) { warn(`no line for edge ${e.id ?? e.from + '->' + e.to}: it joins the box "${(holds(s, t) ? s : t).id}" and something inside it`); return false; }
    return true; }).map(e => ({ ...e, s: end(e.from), t: end(e.to) }));
  const segsOf = pts => pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
  const segHitsRect = (a, b, r) => { const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]); return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h; };
  const through = (pts, e) => nodes.find(n => n !== e.s && n !== e.t && segsOf(pts).some(([a, b]) => segHitsRect(a, b, { x: n.x + 2, y: n.y + 2, w: n.w - 4, h: n.h - 4 }))); // a card it does not join
  // fixed edges arrive with their route already drawn (the hub comb); the router works around them
  // a loop back out of a family runs under the frames: out the source's right side, down past every
  // frame and card it would cut through, left along the bottom, and up into the target's bottom
  const inFam = n => families.filter(f => n.x >= f.x && n.x + n.w <= f.x + f.w && n.y >= f.y && n.y + n.h <= f.y + f.h);
  edges.filter(e => map && e.back && !e.fixed && (inFam(e.s).length || inFam(e.t).length)).forEach((e, k) => {
    // the source's other outgoing wires keep its middle port; the loop leaves lower down
    const { s, t } = e, sy = s.y + s.h / 2 + (edges.some(o => o !== e && o.from === s.id && !o.back) ? s.h / 4 : 0);
    const xr = Math.max(s.x + s.w + 22, ...inFam(s).map(f => f.x + f.w + 14)) + k * 10;
    const tx = t.tag ? Math.max(t.x + 12, (t.x + t.tag.x - 2) / 2) : t.x + t.w / 2, ty = t.y + t.h + (t.kids || t.opens ? 8 : 0);
    const span = nodes.filter(n => n.x < xr && n.x + n.w > tx), yb = Math.max(...[...inFam(s), ...inFam(t)].map(f => f.y + f.h), ...span.map(n => n.y + n.h + (n.tag ? 22 : 8))) + 24 + k * 10;
    const pts = [[s.x + s.w, sy], [xr, sy], [xr, yb], [tx, yb], [tx, ty]];
    if (!through(pts, e)) { e.fixed = pts; e.under = true; } // one that would cut through a card is left to the router
  });
  const free = edges.filter(e => !e.fixed);
  edges.filter(e => e.fixed).forEach(e => { e.pts = e.fixed; e.p1 = e.pts[0]; e.p2 = e.pts[e.pts.length - 1]; e.fs = 'R'; e.ts = e.under ? 'B' : 'L'; e.stubs = []; e.how = e.under ? 'under' : 'comb'; });
  const sides = {};
  const pushSide = (n, side, e, other) => ((sides[n.id + '|' + side] ||= []).push({ e, other, n }));
  free.forEach(e => {
    const { s, t } = e, sc = s.x + s.w / 2, tc = t.x + t.w / 2, sy = s.y + s.h / 2, ty = t.y + t.h / 2;
    const gapX = tc > sc ? t.x - (s.x + s.w) : s.x - (t.x + t.w), gapY = ty >= sy ? t.y - (s.y + s.h) : s.y - (t.y + t.h);
    if (s.box || t.box ? gapX >= gapY : gapX > 24) { e.fs = tc > sc ? 'R' : 'L'; e.ts = tc > sc ? 'L' : 'R'; } // a box: the sides facing across the wider gap
    else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }
    const SIDE = { left: 'L', right: 'R', top: 'T', bottom: 'B' }; if (SIDE[e.fromSide]) e.fs = SIDE[e.fromSide]; if (SIDE[e.toSide]) e.ts = SIDE[e.toSide];
  });
  // a side holds only as many ports as fit 14px apart; the steepest extras move to the top/bottom side
  const sideSpan = (n, side) => { // longest stretch of a top/bottom border free of decorations
    const decos = side === 'T' ? n.decoT : side === 'B' ? n.decoB : null;
    if (!decos || !decos.length) return null;
    let spans = [[n.x + 8, n.x + n.w - 8]];
    decos.forEach(([dx, dw]) => { spans = spans.flatMap(([a, b]) => { const c = dx - 8, d = dx + dw + 8; if (d <= a || c >= b) return [[a, b]]; return [[a, c], [d, b]].filter(([p, q]) => q - p > 0); }); });
    const best = spans.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    return best && best[1] - best[0] >= 24 ? best : null;
  };
  const PORT = 14, cap = (n, side) => { const sp = sideSpan(n, side); return Math.max(1, Math.floor(((side === 'L' || side === 'R') ? n.h : sp ? sp[1] - sp[0] : n.w) * 0.84 / PORT)); };
  for (let pass = 0; pass < 2; pass++) nodes.forEach(n => {
    ['R', 'L'].forEach(side => {
      const mine = free.filter(e => (e.s === n && e.fs === side) || (e.t === n && e.ts === side));
      const over = mine.length - cap(n, side); if (over <= 0) return;
      const far = e => { const o = e.s === n ? e.t : e.s; return (o.y + o.h / 2) - (n.y + n.h / 2); };
      mine.sort((a, b) => Math.abs(far(b)) - Math.abs(far(a))).slice(0, over).forEach(e => {
        const ns = far(e) < 0 ? 'T' : 'B';
        if (e.s === n) e.fs = ns; else e.ts = ns;
      });
    });
  });
  free.forEach(e => { pushSide(e.s, e.fs, e, e.t); pushSide(e.t, e.ts, e, e.s); });
  const portAt = (it, side, p) => { if (it.n === it.e.s && it.e.fs === side) it.e.p1 = p; else it.e.p2 = p; };
  Object.entries(sides).sort(([, a], [, b]) => !!a[0].n.box - !!b[0].n.box).forEach(([key, list]) => { // cards first: a box's port lines up with them
    const side = key.split('|').pop(), vertical = side === 'L' || side === 'R';
    const n = list[0].n;
    if (n.box) { // each port in line with its line's other end where the border allows (a straight line): below the title on
      // a side, off the title, tabs and corners on top or bottom; in that order, 16 (26) px apart
      const want = it => { const q = it.e.s === n ? it.e.p2 : it.e.p1, o = it.other; return q ? q[vertical ? 1 : 0] : vertical ? o.y + o.h / 2 : o.x + o.w / 2; };
      const sp = vertical ? [n.y + 40, n.y + n.h - 16] : sideSpan(n, side) || [n.x, n.x + n.w];
      let lo = vertical ? sp[0] : Math.max(sp[0], n.x + 20), hi = vertical ? sp[1] : Math.min(sp[1], n.x + n.w - 20); if (hi < lo) lo = hi = (lo + hi) / 2;
      const ws = list.map(want), order = list.map((_, i) => i).sort((a, b) => ws[a] - ws[b]), gap = Math.min(vertical ? 16 : 26, (hi - lo) * 0.84 / list.length);
      const v = order.map(i => Math.min(hi, Math.max(lo, ws[i])));
      for (let k = 1; k < v.length; k++) v[k] = Math.max(v[k], v[k - 1] + gap);
      for (let k = v.length - 1; k >= 0; k--) v[k] = Math.min(v[k], k === v.length - 1 ? hi : v[k + 1] - gap);
      order.forEach((i, k) => portAt(list[i], side, vertical ? [side === 'R' ? n.x + n.w : n.x, v[k]] : [v[k], side === 'T' ? n.y : n.y + n.h]));
      return;
    }
    // order ports by where the far end lies, so neighbouring routes do not cross at the node: on a left or right side by its
    // y; on a top or bottom side by its angle from the side, swept from the side's left end (#49). By x, then a y tie-break
    // in one direction, cards in one column on the left of a bottom side came in the wrong order, and their lines crossed.
    const mx = n.x + n.w / 2, my = n.y + n.h / 2, turn = it => { let a = Math.atan2(it.other.y + it.other.h / 2 - my, it.other.x + it.other.w / 2 - mx) - (side === 'T' ? -Math.PI / 2 : Math.PI / 2);
      while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return side === 'T' ? a : -a; };
    list.sort((a, b) => vertical ? (a.other.y - b.other.y) || ((side === 'R' ? -1 : 1) * (a.other.x - b.other.x)) : turn(a) - turn(b));
    const sp = vertical ? null : sideSpan(n, side);
    const len = vertical ? n.h : sp ? sp[1] - sp[0] : n.w, mid = sp ? (sp[0] + sp[1]) / 2 : n.x + n.w / 2;
    const gap = Math.min(vertical ? 16 : 26, (len * 0.84) / Math.max(1, list.length)), cy = n.y + n.h / 2;
    list.forEach((it, i) => {
      const off = (i - (list.length - 1) / 2) * gap;
      const p = side === 'R' ? [n.x + n.w, cy + off] : side === 'L' ? [n.x, cy + off]
        : side === 'T' ? [mid + off, n.y] : [mid + off, n.y + n.h];
      portAt(it, side, p);
    });
  });
  const C = map ? 16 : 12, STUB = dg.mainSteps ? C : C + 6, SEP = 10, BEND = map ? 60 : 26, CROSS = 900; // maps: 16 px clear of other nodes, few bends
  const OUT = { R: [1, 0], L: [-1, 0], T: [0, -1], B: [0, 1] };
  const nodeRects = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const gapLinesX = [], gapLinesY = [];
  if (dg.abs) {
    (dg.lanes || []).forEach(l => gapLinesX.push(l.x - (dg.laneGap || 32) / 2, l.x + 8, l.x + l.w - 8, l.x + l.w + (dg.laneGap || 32) / 2));
    nodes.forEach(n => gapLinesY.push(n.y - RG / 2, n.y + n.h + RG / 2));
  } else {
    Object.keys(colX).map(Number).forEach(c => gapLinesX.push(colX[c] - CG / 2, colX[c] + (colW[c] || NW) + CG / 2));
    [...new Set(nodes.map(n => n.y))].forEach(y => gapLinesY.push(y - RG / 2, y + NH + RG / 2));
  }
  const routed = [], reserved = [];
  const inRect = (p, r) => p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h;
  const colinear = (a, b, c, d) => {
    if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < SEP - 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 0;
    if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < SEP - 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 0;
    return false;
  };
  const crosses = (p, q, r, s) => { // perpendicular interior crossing
    const pv = p[0] === q[0], rv = r[0] === s[0]; if (pv === rv) return false;
    const [v, hz] = pv ? [[p, q], [r, s]] : [[r, s], [p, q]];
    return hz[0][1] > Math.min(v[0][1], v[1][1]) && hz[0][1] < Math.max(v[0][1], v[1][1]) && v[0][0] > Math.min(hz[0][0], hz[1][0]) && v[0][0] < Math.max(hz[0][0], hz[1][0]); };
  const onSegInterior = (p, a, b) => (a[0] === b[0] && Math.abs(p[0] - a[0]) < 0.5 && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]))
    || (a[1] === b[1] && Math.abs(p[1] - a[1]) < 0.5 && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]));
  function gridRoute(e, allowCross, win) {
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB];
    const en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    // ends that face each other closer than two stubs (a card 32 px beside a box) leave the grid no room: the plain
    // elbow between them is the route, when it keeps off cards and tags and does not run along or across another line
    if (OUT[e.fs][0] === -OUT[e.ts][0] && OUT[e.fs][1] === -OUT[e.ts][1] && (en[0] - st[0]) * OUT[e.fs][0] + (en[1] - st[1]) * OUT[e.fs][1] < 0) {
      const p = fallback(e), lines = routed.flatMap(r => segsOf(r.pts));
      if (segsOf(p).every(([a, b]) => ![...nodeRects, ...tagRects].some(r => segHitsRect(a, b, r)) && !lines.some(([c, d]) => colinear(a, b, c, d) || (!allowCross && crosses(a, b, c, d))))) return p;
    }
    const W = win ? { x: Math.min(st[0], en[0]) - win, y: Math.min(st[1], en[1]) - win, x2: Math.max(st[0], en[0]) + win, y2: Math.max(st[1], en[1]) + win } : null;
    const any = allowCross === 2; // the last resort: only cards and tags stand in the way; crossing or running along a line, or a label, costs
    const obs = [...nodeRects.map(r => ({ x: r.x - C, y: r.y - C, w: r.w + 2 * C, h: r.h + 2 * C })), ...tagRects, ...(any ? [] : reserved.map(r => ({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 })))];
    const avoid = [...routed.flatMap(r => segsOf(r.pts)), ...free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || [])];
    const xs = new Set([st[0], en[0], ...gapLinesX]), ys = new Set([st[1], en[1], ...gapLinesY]);
    obs.forEach(r => { xs.add(r.x - 1); xs.add(r.x + r.w + 1); ys.add(r.y - 1); ys.add(r.y + r.h + 1); });
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) { xs.add(a[0]); xs.add(a[0] - SEP); xs.add(a[0] + SEP); } else { ys.add(a[1]); ys.add(a[1] - SEP); ys.add(a[1] + SEP); } });
    const keep = new Set([st[0], en[0], st[1], en[1]]);
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) keep.add(a[0]); else keep.add(a[1]); }); // a route's own line is never merged away
    const co = vals => vals.filter(v => !W || keep.has(v) || true).sort((a, b) => a - b).filter((v, i, s) => i === 0 || keep.has(v) || v - s[i - 1] >= 5);
    if (map) families.forEach(f => { xs.add(f.x - 16); xs.add(f.x + f.w + 16); ys.add(f.y - 16); ys.add(f.y + f.h + 16); });
    let X = co([...xs]), Y = co([...ys]);
    if (map) { const far = (v, bs) => keep.has(v) || bs.every(u => Math.abs(v - u) >= 8);
      X = X.filter(v => far(v, families.flatMap(f => [f.x, f.x + f.w]))); Y = Y.filter(v => far(v, families.flatMap(f => [f.y, f.y + f.h]))); }
    if (W) { X = X.filter(v => keep.has(v) || (v >= W.x && v <= W.x2)); Y = Y.filter(v => keep.has(v) || (v >= W.y && v <= W.y2)); }
    const nx = X.length, ny = Y.length, N = nx * ny;
    // an end that lies in an obstacle (or, without crossings, on an earlier line) fails the search: say so before building the grid
    const blockedAt = p => obs.some(r => inRect(p, r)) || (!allowCross && avoid.some(([a, b]) => onSegInterior(p, a, b)));
    if (blockedAt(st) || blockedAt(en)) return null;
    const ok = new Uint8Array(N), crossAt = new Uint8Array(N);
    // each obstacle and earlier line marks only the cells and moves near it (found by binary search, then tested
    // exactly as inRect, segHitsRect, onSegInterior and colinear do); every cell testing every obstacle and line
    // made one route cost O(cells x obstacles)
    const from = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] < v) a = m + 1; else b = m; } return a; };
    const inObs = new Uint8Array(N), onAv = new Uint8Array(N), blockH = new Uint8Array(N), blockV = new Uint8Array(N), alongH = any ? new Uint8Array(N) : blockH, alongV = any ? new Uint8Array(N) : blockV;
    for (const r of obs) {
      const i0 = from(X, r.x - 1), j0 = from(Y, r.y - 1), qx = r.x + .5, qy = r.y + .5, qx2 = qx + (r.w - 1), qy2 = qy + (r.h - 1);
      for (let i = i0; i < nx && X[i] <= r.x + r.w + 1; i++) for (let j = j0; j < ny && Y[j] <= r.y + r.h + 1; j++)
        if (X[i] > r.x && X[i] < r.x + r.w && Y[j] > r.y && Y[j] < r.y + r.h) inObs[i * ny + j] = 1;
      const lx = Math.min(qx, qx2), hx = Math.max(qx, qx2), ly = Math.min(qy, qy2), hy = Math.max(qy, qy2);
      for (let i = Math.max(0, from(X, lx - 1) - 1); i < nx - 1 && X[i] <= hx + 1; i++) for (let j = from(Y, ly - 1); j < ny && Y[j] <= hy + 1; j++)
        if (X[i + 1] > qx && X[i] < qx2 && Y[j] > qy && Y[j] < qy2) blockH[i * ny + j] = 1;
      for (let i = from(X, lx - 1); i < nx && X[i] <= hx + 1; i++) for (let j = Math.max(0, from(Y, ly - 1) - 1); j < ny - 1 && Y[j] <= hy + 1; j++)
        if (X[i] > qx && X[i] < qx2 && Y[j + 1] > qy && Y[j] < qy2) blockV[i * ny + j] = 1;
    }
    for (const [c, d] of avoid) {
      const x1 = Math.min(c[0], d[0]), x2 = Math.max(c[0], d[0]), y1 = Math.min(c[1], d[1]), y2 = Math.max(c[1], d[1]);
      if (c[0] === d[0]) { // vertical: cells on its interior; vertical moves alongside it
        for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++) if (Math.abs(X[i] - c[0]) < 0.5) for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++)
          if (Y[j] > y1 && Y[j] < y2) onAv[i * ny + j] = 1;
        for (let i = from(X, x1 - SEP - 1); i < nx && X[i] <= x2 + SEP + 1; i++) if (Math.abs(X[i] - c[0]) < SEP - 1) for (let j = Math.max(0, from(Y, y1 - 1) - 1); j < ny - 1 && Y[j] <= y2 + 1; j++)
          if (Math.min(Y[j + 1], y2) - Math.max(Y[j], y1) > 0) alongV[i * ny + j] = 1;
      }
      if (c[1] === d[1]) { // horizontal: the same, across
        for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++) if (Math.abs(Y[j] - c[1]) < 0.5) for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++)
          if (X[i] > x1 && X[i] < x2) onAv[i * ny + j] = 1;
        for (let j = from(Y, y1 - SEP - 1); j < ny && Y[j] <= y2 + SEP + 1; j++) if (Math.abs(Y[j] - c[1]) < SEP - 1) for (let i = Math.max(0, from(X, x1 - 1) - 1); i < nx - 1 && X[i] <= x2 + 1; i++)
          if (Math.min(X[i + 1], x2) - Math.max(X[i], x1) > 0) alongH[i * ny + j] = 1;
      }
    }
    for (let k = 0; k < N; k++) if (!inObs[k] && (!onAv[k] || allowCross)) { ok[k] = 1; crossAt[k] = onAv[k]; }
    if (any) for (const r of reserved) for (let i = from(X, r.x - 3); i < nx && X[i] < r.x + r.w + 3; i++) for (let j = from(Y, r.y - 3); j < ny && Y[j] < r.y + r.h + 3; j++) crossAt[i * ny + j] = 1;
    const ix = v => X.indexOf(v), iy = v => Y.indexOf(v);
    const s0 = ix(st[0]) * ny + iy(st[1]), t0 = ix(en[0]) * ny + iy(en[1]);
    if (!ok[s0] || !ok[t0]) return null;
    const passable = (i1, j1, i2, j2) => !(i1 !== i2 ? blockH[Math.min(i1, i2) * ny + j1] : blockV[i1 * ny + Math.min(j1, j2)]);
    // a target shut in a small pocket that does not hold the start cannot be reached: flood out from it (moves work
    // both ways) and give up at once, instead of letting the search visit every cell it can reach
    { const seen = new Uint8Array(N), q = [t0]; seen[t0] = 1;
      for (let h = 0; h < q.length && q.length < 4000; h++) { const c = q[h], i = Math.floor(c / ny), j = c % ny;
        if (c === s0) break;
        for (const [i2, j2] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
          const c2 = i2 * ny + j2; if (!seen[c2] && ok[c2] && passable(i, j, i2, j2)) { seen[c2] = 1; q.push(c2); } } }
      if (q.length < 4000 && !seen[s0]) return null; }
    // Dijkstra over (cell, incoming direction)
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
    // a binary heap in typed arrays, with the same sift steps as before, so equal keys pop in the same order
    let hd = new Float64Array(256), hk = new Int32Array(256), hn = 0, pd = 0, pk = 0;
    const hswap = (a, b) => { const d = hd[a], k = hk[a]; hd[a] = hd[b]; hk[a] = hk[b]; hd[b] = d; hk[b] = k; };
    const hpush = (k, d) => { if (hn === hd.length) { const d2 = new Float64Array(hn * 2), k2 = new Int32Array(hn * 2); d2.set(hd); k2.set(hk); hd = d2; hk = k2; }
      let i = hn++; hd[i] = d; hk[i] = k; while (i) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; hswap(p, i); i = p; } };
    const hpop = () => { pd = hd[0]; pk = hk[0]; hn--; if (hn) { hd[0] = hd[hn]; hk[0] = hk[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < hn && hd[l] < hd[m]) m = l; if (r < hn && hd[r] < hd[m]) m = r; if (m === i) break; hswap(m, i); i = m; } } };
    const d0 = DIRS.findIndex(d => d[0] === OUT[e.fs][0] && d[1] === OUT[e.fs][1]);
    const dEnd = DIRS.findIndex(d => d[0] === -OUT[e.ts][0] && d[1] === -OUT[e.ts][1]);
    // A*: the heap is keyed by distance plus the straight distance left, which never overestimates (every move costs
    // at least its length), so each route keeps its cost; the search stops visiting cells far from the target
    const hx = Float64Array.from(X, x => Math.abs(x - en[0])), hy = Float64Array.from(Y, y => Math.abs(y - en[1])), DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
    dist[s0 * 4 + d0] = 0; hpush(s0 * 4 + d0, hx[(s0 / ny) | 0] + hy[s0 % ny]);
    let best = -1;
    while (hn) {
      hpop(); const k = pk, cell = k >> 2, dir = k & 3, i = (cell / ny) | 0, j = cell - i * ny;
      if (pd > dist[k] + (hx[i] + hy[j])) continue;
      const d = dist[k];
      if (cell === t0) { best = k; if (dir === dEnd) break; continue; }
      const xi = X[i], yj = Y[j];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === dir && ((nd >> 1) === (dir >> 1))) continue; // no reversal
        const i2 = i + DI[nd], j2 = j + DJ[nd];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        const c2 = i2 * ny + j2; if (!ok[c2] || (nd < 2 ? blockH[(nd === 0 ? i : i2) * ny + j] : blockV[i * ny + (nd === 2 ? j : j2)])) continue;
        let w = Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj) + (nd === dir ? 0 : BEND) + (crossAt[c2] ? CROSS : 0);
        if (any && (nd < 2 ? alongH[(nd === 0 ? i : i2) * ny + j] : alongV[i * ny + (nd === 2 ? j : j2)])) w += 2 * CROSS + 3 * (Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj));
        if (c2 === t0 && nd !== dEnd) w += BEND;
        const k2 = c2 * 4 + nd; if (d + w < dist[k2]) { dist[k2] = d + w; prev[k2] = k; hpush(k2, d + w + (hx[i2] + hy[j2])); }
      }
    }
    if (best < 0) return null;
    const cells = []; for (let k = best; k >= 0; k = prev[k]) { cells.push(k >> 2); if (k === s0 * 4 + d0) break; }
    const pts = [e.p1, ...cells.reverse().map(c => [X[Math.floor(c / ny)], Y[c % ny]]), e.p2];
    return simplify(pts);
  }
  function simplify(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], a = out[out.length - 1];
      if (Math.abs(p[0] - a[0]) < .01 && Math.abs(p[1] - a[1]) < .01) continue;
      if (out.length > 1) { const b = out[out.length - 2]; if ((b[0] === a[0] && a[0] === p[0]) || (b[1] === a[1] && a[1] === p[1])) out.pop(); }
      out.push(p);
    }
    return out;
  }
  function fallback(e) { // last resort: a plain elbow
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    const horiz = e.fs === 'R' || e.fs === 'L', mid = horiz ? (st[0] + en[0]) / 2 : (st[1] + en[1]) / 2;
    return simplify(horiz ? [e.p1, st, [mid, st[1]], [mid, en[1]], en, e.p2] : [e.p1, st, [st[0], mid], [en[0], mid], en, e.p2]);
  }
  // labels: on the edge's own segment, in free space — never across another route, node, or label
  const placed = [];
  function placeLabel(e) {
    if (!e.label && e.step == null) return;
    const full = map ? fit(e.label || '', 10.5, e.under ? 320 : 440) : fit((e.step != null ? e.step + ' · ' : '') + (e.label || ''), 10, 150);
    const sub = map && e.label && e.sublabel ? fit(e.sublabel, 9.5, e.under ? 320 : 440) : ''; // a second, smaller line under the label (#44)
    const tries = [full]; if (e.step != null && e.label && !dg.abs) tries.push(map ? '' : String(e.step));
    const segs = segsOf(e.pts).map((s, i) => ({ a: s[0], b: s[1], i, l: Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), h: s[0][1] === s[1][1] }));
    const order = [...segs].sort((p, q) => (q.h - p.h) * 40 + (q.l - p.l));
    for (const pass of (map ? [0, 1, 2] : [0])) for (const text of tries) { const relax = pass === 2; // 0 strict, 1 strict but may touch a box border, 2 relaxed
      const two = !!(text && sub), pill = map && e.step != null, w = map ? (text ? pillW(text, two && sub) : 0) + (pill ? (text ? 20 : 22) : 0) : textW(text, 10) + 12, hgt = map ? (two ? 32 : 20) : 18;
      for (const sg of order) {
        if (!relax && sg.h && sg.l < w + 10) continue;
        if (!relax && !sg.h && sg.l < hgt + 14) continue;
        for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : [.5, .32, .68, .2, .8])) {
          const lx = sg.a[0] + (sg.b[0] - sg.a[0]) * f, ly = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
          const box = { x: lx - w / 2, y: ly - hgt / 2, w, h: hgt };
          const grow = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
          if (nodeRects.some(r => hit(relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }, box))) continue; // keep port stubs free
          if (tagRects.some(r => hit(r, grow))) continue;
          if (placed.some(r => (pass === 0 || !r.band) && hit(r, grow))) continue;
          if (!relax && routed.some(r => r !== e && segsOf(r.pts).some(([a, b]) => segHitsRect(a, b, grow)))) continue;
          if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;
          placed.push(box); reserved.push(grow); e.lbl = { ...box, text, ...(two ? { sub } : {}), step: map ? e.step : null, short: text !== full }; return;
        }
      }
    }
  }
  let stats = {};
  free.forEach(e => { // every port's stub is reserved before routing starts
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    e.stubs = [[e.p1, st], [en, e.p2]];
  });
  const runRouting = order => {
    routed.length = 0; reserved.length = 0; placed.length = 0; stats = {};
    (dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });
    if (map) families.forEach(f => { const h = { x: f.x + 8, y: f.y + 3, w: Math.min(f.w - 16, textW(f.label || f.id, 11) + 16), h: 22 }; reserved.push(h); placed.push(h);
      placed.push(...[{ x: f.x, y: f.y - 3, w: f.w, h: 6 }, { x: f.x, y: f.y + f.h - 3, w: f.w, h: 6 }, { x: f.x - 3, y: f.y, w: 6, h: f.h }, { x: f.x + f.w - 3, y: f.y, w: 6, h: f.h }].map(r => ({ ...r, band: true }))); }); // lane headers and arrows stay clear
    edges.filter(e => e.fixed).forEach(e => { routed.push(e); if (e.under) { placeLabel(e); stats.under = (stats.under || 0) + 1; return; } if (e.lbl) { placed.push(e.lbl); reserved.push({ x: e.lbl.x - 3, y: e.lbl.y - 3, w: e.lbl.w + 6, h: e.lbl.h + 6 }); } stats.comb = (stats.comb || 0) + 1; });
    order.forEach(e => {
      let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320) || gridRoute(e, false, 0);
      if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 0); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
      stats[how] = (stats[how] || 0) + 1; e.how = how;
      routed.push(e); placeLabel(e);
    });
    return (stats.cross || 0) + (stats.fallback || 0);
  };
  __ms.place = performance.now() - __ms.t; __ms.t = performance.now();
  let order = [...free].sort((a, b) => (Math.abs(a.p1[0] - a.p2[0]) + Math.abs(a.p1[1] - a.p2[1])) - (Math.abs(b.p1[0] - b.p2[0]) + Math.abs(b.p1[1] - b.p2[1])));
  // lines into one side of a card nest (#49). The router turns a line as late as it can, so the line whose turn must lie
  // nearest the card goes first and each next one takes the track beside it: coming from below, the lowest port first;
  // from above, the highest. Shortest first, the last line found no track left and went round its own column.
  const into = {}; free.forEach(e => (into[e.t.id + '|' + e.ts] ||= []).push(e));
  Object.entries(into).forEach(([k, list]) => { if (list.length < 2) return; const ax = /\|[LR]$/.test(k) ? 1 : 0;
    const nearFirst = e => { const d = e.p1[ax] - e.p2[ax]; return d > 0 ? -e.p2[ax] : d < 0 ? e.p2[ax] - 1e6 : 1e7; };
    const slots = list.map(e => order.indexOf(e)).sort((a, b) => a - b), turns = [...list].sort((a, b) => nearFirst(a) - nearFirst(b));
    slots.forEach((at, i) => { order[at] = turns[i]; }); });
  let bad = runRouting(order);
  // rip-up and reroute: an edge that had to cross goes first next time; keep the best attempt (not when the view is laid
  // out again with room: that layout's tries seldom gained anything, and they cost a third of its time)
  for (let tries = 0; bad && !last && tries < 4; tries++) {
    const stuck = order.filter(e => e.how !== 'grid');
    const next = [...stuck, ...order.filter(e => e.how === 'grid')];
    const snap = order.map(e => [e, e.pts, e.lbl, e.how]), snapStats = stats, snapR = [routed.slice(), reserved.slice(), placed.slice()];
    const b2 = runRouting(next);
    if (b2 < bad) { bad = b2; order = next; }
    else { snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; }); stats = snapStats; routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); break; }
  }
  __ms.route = performance.now() - __ms.t; __ms.t = performance.now(); __ms.rounds = 0; __ms.reroutes = 0;
  // Lines left with no route get room (#40). Each one's route around the cards (the last resort's, below) shows where it
  // would run along another line: that column (row) gap widens by two lanes for it, and the view is laid out again.
  if (!last && !dg.quick && map && !dg.abs && free.some(e => e.how === 'fallback')) {
    const need = { x: {}, y: {} }, cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs));
    const gapAt = (v, vertical) => { if (vertical) return cs.find(c => colX[c] + (colW[c] || NW) < v && v < colX[c + 1]);
      for (let r = r0; r < r1; r++) if (rowY(r) + NH < v && v < rowY(r + 1)) return r; };
    free.filter(e => e.how === 'fallback').forEach(e => { routed.splice(routed.indexOf(e), 1); const p = gridRoute(e, 2, 320) || gridRoute(e, 2, 0), mine = { x: new Set(), y: new Set() };
      segsOf(p || []).forEach(([a, b]) => { if (!routed.some(o => segsOf(o.pts).some(([c, d]) => colinear(a, b, c, d)))) return;
        const v = a[0] === b[0], g = gapAt(v ? a[0] : a[1], v); if (g != null) mine[v ? 'x' : 'y'].add(g); });
      for (const k of ['x', 'y']) mine[k].forEach(g => { need[k][g] = (need[k][g] || 0) + 2 * SEP; }); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) {
      for (const k of ['x', 'y']) Object.entries((room || {})[k] || {}).forEach(([g, v]) => { need[k][g] = (need[k][g] || 0) + v; });
      return { room: need, ms: { probe: performance.now() - t0 } };
    }
  }
  // port repair: two routes that cross next to a shared node side swap ports, keep it if issues drop
  const issueCount = () => routeAudit({ edges }, '').length;
  const endAt = (e, n, side) => (e.s === n && e.fs === side) ? 'p1' : (e.t === n && e.ts === side) ? 'p2' : null;
  let issues = issueCount();
  // a swap re-routes only the two swapped edges (ripped up, then routed after every other route), not the whole
  // graph; a round goes on after an improvement; and repair spends at most 2 routings per free edge, so its cost
  // grows with the graph instead of with crossings x edges x routing (it stalled on 26 nodes / 44 edges)
  const restub = e => { e.stubs = [[e.p1, [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB]], [[e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB], e.p2]]; };
  const ripUp = e => { const i = routed.indexOf(e); if (i >= 0) routed.splice(i, 1); const L = e.lbl; if (!L) return;
    const same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)); if (p >= 0) placed.splice(p, 1); const q = reserved.findIndex(same(3)); if (q >= 0) reserved.splice(q, 1); };
  // a swapped edge tries a clean route near its ends, then one that may cross (near its ends, then anywhere); it
  // skips the clean whole-grid search, which mostly fails here and visits every cell when it does
  const routeOne = e => { let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320);
    if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 320) || gridRoute(e, true, 0); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
    e.how = how; routed.push(e); placeLabel(e); return true; };
  let budget = 2 * free.length, swapped = false;
  for (let round = 0; issues && dg.repair !== false && round < 8 && budget > 0; round++) {
    let fixed = false; __ms.rounds++;
    const segsE = e => e.pts.slice(0, -1).map((p, i) => [p, e.pts[i + 1]]);
    const xing = (a, b) => segsE(a).some(([p, q]) => segsE(b).some(([r, s]) => crosses(p, q, r, s)));
    const pairs = []; edges.forEach((a, i) => edges.slice(i + 1).forEach(b => { if (xing(a, b)) pairs.push([a, b]); }));
    // a crossing pair, or a pair where one shares a node side with the other's crossing partner
    const cand = [], seen = new Set(), add = (a, b) => { const k = a.id + '|' + b.id; if (!seen.has(k)) { seen.add(k); cand.push([a, b]); } }; // each pair once; crossing pairs first
    pairs.forEach(([a, b]) => add(a, b)); pairs.forEach(([a, b]) => free.forEach(o => { if (o !== a && o !== b) { add(a, o); add(b, o); } }));
    outer3: for (const [a, b] of cand.filter(([x, y]) => !x.fixed && !y.fixed)) {
      for (const n of [a.s, a.t]) for (const side of ['L', 'R', 'T', 'B']) {
        const ka = endAt(a, n, side), kb = endAt(b, n, side); if (!ka || !kb) continue;
        if (budget <= 0) break outer3;
        const pa = a[ka], pb = b[kb]; a[ka] = pb; b[kb] = pa; restub(a); restub(b);
        const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how]), snapR = [routed.slice(), reserved.slice(), placed.slice()];
        const ab = new Set([a, b]), was = routeAudit({ edges }, '', ab).length; // issues away from a and b cannot change
        budget -= 2; __ms.reroutes++;
        if (!was) { a[ka] = pa; b[kb] = pb; restub(a); restub(b); continue; } // nothing to gain: the count can only drop by their own issues
        ripUp(a); ripUp(b);
        const now = routeOne(a) && routeOne(b) ? issues - was + routeAudit({ edges }, '', ab).length : Infinity;
        if (now < issues) { issues = now; fixed = swapped = true; if (!issues) break outer3; continue outer3; }
        a[ka] = pa; b[kb] = pb; restub(a); restub(b);
        snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
      }
    }
    if (!fixed) break;
  }
  if (swapped) { ['grid', 'cross', 'fallback'].forEach(k => { delete stats[k]; }); free.forEach(e => { stats[e.how] = (stats[e.how] || 0) + 1; }); }
  // the last resort for a line still with no route: around the cards, across or along other lines if it must (it was a
  // plain elbow through whatever lay in its way, and a card's mask made the line look like a connection to that card)
  if (!dg.quick) free.filter(e => e.how === 'fallback').forEach(e => { ripUp(e); e.pts = gridRoute(e, 2, 320) || gridRoute(e, 2, 0) || e.pts; e.lbl = null; routed.push(e); placeLabel(e); });
  if (!dg.quick) edges.forEach(e => { const n = through(e.pts, e); if (n) warn(`the line for edge ${edgeRefIds(e).join(' / ') || e.from + '->' + e.to} runs through card "${n.id}", which it does not join: no route found around it`); });
  __ms.repair = performance.now() - __ms.t; delete __ms.t;
  const groups = (dg.groups || []).map(g => {
    const ms = (g.nodes || []).map(i => byId[i]).filter(Boolean);
    if (!ms.length) return null;
    const P = 18;
    return { ...g, k: kindOf(g.kind || 'external'), x: Math.min(...ms.map(n => n.x)) - P, y: Math.min(...ms.map(n => n.y)) - P - 16,
      x2: Math.max(...ms.map(n => n.x + n.w)) + P, y2: Math.max(...ms.map(n => n.y + n.h)) + P };
  }).filter(Boolean);
  const xs = [...families.flatMap(f => [f.x,f.x+f.w]), ...(dg.lanes || []).flatMap(l => [l.x, l.x + l.w]), ...nodes.flatMap(n => [n.x - 14, n.x + n.w + 8]), ...groups.flatMap(g => [g.x, g.x2]), ...edges.flatMap(e => e.pts.map(p => p[0])), ...placed.flatMap(p => [p.x, p.x + p.w])];
  const ys = [...families.flatMap(f => [f.y,f.y+f.h]), ...(dg.lanes || []).flatMap(l => [l.y, l.y + l.h]), ...nodes.flatMap(n => [n.y - 14, n.y + n.h + (n.tag ? 18 : 8)]), ...groups.flatMap(g => [g.y, g.y2]), ...edges.flatMap(e => e.pts.map(p => p[1])), ...placed.flatMap(p => [p.y, p.y + p.h])];
  intake.forEach(b => { xs.push(b.cx - b.r - 8 - textW(b.label || '', 10.5), b.cx + b.r); ys.push(b.cy - b.r, b.cy + b.r); });
  const M = 36, minX = Math.min(...xs) - M, minY = Math.min(...ys) - M;
  return { ms: __ms, stats, nodes, edges, subAndChips: !!dg.subAndChips, groups, families, intake, tour: dg.tour || null, byId, map, hub: dg.hub || null, lanes: dg.lanes || [], blocks: dg.blocks || [], bounds: { x: minX, y: minY, w: Math.max(...xs) - minX + M, h: Math.max(...ys) - minY + M } };
}

let svgSeq = 0;
/* SVG markup. opts: { childCount(id) -> n, subject: id, title } */
function svgOf(geo, opts = {}) {
  const id = 'g' + (svgSeq++), { nodes, edges, groups, bounds: B, map } = geo;
  const col = k => `var(--um-${KIND[k][0]})`, fill = k => `var(--um-${KIND[k][0]}-f)`;
  const estyle = e => {
    if (map && e.wk && !e.style) return { c: `var(--um-w-${e.wk})`, m: e.wk, dash: e.back ? '6 5' : '', cls: ' w-' + e.wk + (e.back ? ' back' : '') };
    const st = e.style || (e.change === 'added' ? 'added' : e.change === 'removed' ? 'removed' : '');
    if (st === 'added' || st === 'emphasis') return { c: 'var(--um-green)', m: 'g', dash: '', flow: st === 'added' || e.animate };
    if (st === 'removed') return { c: 'var(--um-rose)', m: 'r', dash: '5 5', op: .7 };
    if (st === 'security') return { c: 'var(--um-rose)', m: 'r', dash: '5 5' };
    if (st === 'dashed' || st === 'async') return { c: 'var(--um-violet)', m: 'v', dash: '4 4' };
    return { c: 'var(--um-arrow)', m: 'd', dash: '' };
  };
  const marker = (n, c, k = 1) => `<marker id="${id}-${n}" markerWidth="${10 * k}" markerHeight="${8 * k}" refX="${9 * k}" refY="${4 * k}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L${10 * k} ${4 * k} L0 ${8 * k} Z" fill="${c}"/></marker>`;
  const MC = { d: 'var(--um-arrow)', g: 'var(--um-green)', r: 'var(--um-rose)', v: 'var(--um-violet)', h: 'var(--um-cyan)', ...Object.fromEntries(WIRES.map(w => [w[0], `var(--um-w-${w[0]})`])) };
  const heavy = [...new Set(edges.filter(e => e.weight > 1).map(e => estyle(e).m + '-w' + e.weight))]; // a heavier line's arrowhead grows with it
  let s = `<svg viewBox="${B.x} ${B.y} ${B.w} ${B.h}" data-w="${B.w}" data-h="${B.h}" role="${map ? 'group' : 'img'}" aria-label="${esc(opts.title || 'Diagram')}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>${marker('d', 'var(--um-arrow)')}${marker('g', 'var(--um-green)')}${marker('r', 'var(--um-rose)')}${marker('v', 'var(--um-violet)')}${marker('h', 'var(--um-cyan)')}${map ? WIRES.map(w => marker(w[0], `var(--um-w-${w[0]})`)).join('') : ''}${heavy.map(m => { const [c, k] = m.split('-w'); return marker(m, MC[c], 1 + (k - 1) * .35); }).join('')}</defs>`;
  const families = geo.families || [], familyDepth = f => f.parent ? 1 + familyDepth(families.find(p => p.id === f.parent) || {}) : 0;
  families.slice().sort((a,b) => familyDepth(a)-familyDepth(b)).forEach(f => {
    s += `<g class="family" data-family="${esc(f.id)}"${f.parent ? ` data-parent="${esc(f.parent)}"` : ''}><rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" stroke="var(--um-${familyDepth(f) ? 'cyan' : 'border-2'})"/>
      <text class="family-title" x="${f.x+12}" y="${f.y+18}" fill="var(--um-muted)" data-t="ft" data-o="${esc(f.id)}">${esc(f.label || f.id)}</text>${(f.tabs || []).map(t => `
      <g class="pub-tab" data-badge="${t.badge}"><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="15" rx="4" fill="${t.fill}"/><text x="${t.x + t.w / 2}" y="${f.y + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`).join('')}</g>`;
  });
  (geo.lanes || []).forEach((l, i) => {
    s += `<g class="lane" data-lane="${i}">${l.bare ? '' : `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" class="lane-box"/>`}
      <circle cx="${l.x + 20}" cy="${l.y + 20}" r="8" class="lane-num"/><text x="${l.x + 20}" y="${l.y + 24}" text-anchor="middle" class="lane-num-tx">${i + 1}</text>
      <text x="${l.x + 34}" y="${l.y + 24}" class="lane-t" data-t="lt" data-o="lane:${i}">${esc(l.title)}</text>
      <text x="${l.x + 34 + sansW(l.title, 11, .95) + 8}" y="${l.y + 24}" class="lane-c">${l.ids.length} ${l.ids.length === 1 ? 'part' : 'parts'}</text></g>`;
    if (!l.bare && i < geo.lanes.length - 1) s += `<text x="${l.x + l.w + (l.gap || 32) / 2}" y="${l.y + 25}" text-anchor="middle" class="lane-arrow">→</text>`;
  });
  groups.forEach(g => {
    s += `<g class="grp"><rect x="${g.x}" y="${g.y}" width="${g.x2 - g.x}" height="${g.y2 - g.y}" rx="12" fill="${fill(g.k)}" fill-opacity=".35" stroke="${col(g.k)}" stroke-opacity=".55" stroke-dasharray="6 4"/>
      <text x="${g.x + 12}" y="${g.y + 16}" class="g-label" fill="${col(g.k)}">${esc(fit(g.label, 10, g.x2 - g.x - 24))}</text></g>`;
  });
  // tour (map): one ticket dot rides the view's loop; each stop pulses and each wire glows as it passes
  const TOUR = 8, f2 = v => +Math.min(1, Math.max(0, v)).toFixed(4), tour = map && opts.tour !== false && (geo.tour || []).length > 1 ? (() => {
    const pts = [], legs = {}, at = {}, ends = [];
    for (let i = 0; i + 1 < geo.tour.length; i++) {
      const a = geo.tour[i], b = geo.tour[i + 1], k = edges.findIndex(e => (e.from === a && e.to === b) || (e.both && e.from === b && e.to === a));
      if (k < 0) return null;
      const p = edges[k].from === a ? edges[k].pts : [...edges[k].pts].reverse();
      if (pts.length) pts.push([pts[pts.length - 1][0], p[0][1]]); // through the card to the next port
      const from = pts.length; pts.push(...p); ends.push([k, from, pts.length - 1, b]);
    }
    const P = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]), L = [0];
    pts.slice(1).forEach((p, i) => L.push(L[i] + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1])));
    const tot = L[L.length - 1] || 1; at[geo.tour[0]] = 0;
    ends.forEach(([k, a, b, to]) => { legs[k] = [L[a] / tot, L[b] / tot]; if (!(to in at)) at[to] = L[b] / tot; });
    return { d: roundPath(P), legs, at };
  })() : null;
  const tourAnim = (vals, times) => `<animate attributeName="opacity" values="${vals}" keyTimes="${times.map(f2).join(';')}" dur="${TOUR}s" repeatCount="indefinite"/>`;
  s += '<g class="edges">';
  (geo.intake || []).forEach(b => {
    s += `<g class="intake"><title>${esc(b.label)} feeds ${esc((geo.byId[b.to] || {}).label || b.to)}</title><path d="${roundPath(b.pts)}" class="edge" stroke="var(--um-w-feeds)" marker-end="url(#${id}-feeds)"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" class="intake-chip${b.dashed ? ' dashed' : ''}"/>${b.logo ? `<image href="${esc(b.logo)}" x="${b.cx - 9}" y="${b.cy - 9}" width="18" height="18"/>` : b.mark ? `<text x="${b.cx}" y="${b.cy + 4.5}" text-anchor="middle" class="intake-mark">${esc(b.mark)}</text>` : ''}
      <text x="${b.cx - b.r - 7}" y="${b.cy + 3.5}" text-anchor="end" class="intake-tx">${esc(b.label)}</text>
      ${tour ? `<circle r="3.2" class="tour tour-packet" opacity="0"><animateMotion path="${roundPath(b.pts)}" keyPoints="0;0;1" keyTimes="0;.86;1" calcMode="linear" dur="${TOUR}s" repeatCount="indefinite"/>${tourAnim('0;0;.8;.8;0', [0, .86, .88, .99, 1])}</circle>` : ''}</g>`;
  });
  edges.forEach((e, i) => {
    const st = estyle(e), d = roundPath(e.pts), mk = st.m + (e.weight > 1 ? '-w' + e.weight : '');
    if (tour && tour.legs[i]) { const [a, b] = tour.legs[i];
      s += `<path d="${d}" class="tour-glow" stroke="${st.c}" opacity="0">${tourAnim('0;0;.55;.55;0;0', [0, a, Math.min(a + .01, b), b, b + .03, 1])}</path>`; }
    s += `<g class="edge-g${st.cls || ''}${e.weight > 1 ? ' wt-' + e.weight : ''}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-i="${i}"><path d="${d}" class="halo"/><path d="${d}" class="hitline"/>
      <path d="${d}" class="edge${st.flow ? ' flow' : ''}" stroke="${st.c}" ${st.dash && !st.flow ? `stroke-dasharray="${st.dash}"` : ''} ${st.op ? `opacity="${st.op}"` : ''} marker-end="url(#${id}-${mk})" ${e.both ? `marker-start="url(#${id}-${mk})"` : ''}/>
      <path d="${d}" class="flowline" stroke="${st.c}"/>${(e.all || [e]).some(x => x.edited) ? (() => { let m = [e.pts[0], e.pts[1]];
        e.pts.slice(1).forEach((p, k) => { const a = e.pts[k]; if (Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) > Math.abs(m[1][0] - m[0][0]) + Math.abs(m[1][1] - m[0][1])) m = [a, p]; });
        return `<circle cx="${(m[0][0] + m[1][0]) / 2}" cy="${(m[0][1] + m[1][1]) / 2}" r="4" class="edited-dot"><title>Edited</title></circle>`; })() : ''}
      <title>${e.step != null ? 'Step ' + e.step + ': ' : ''}${esc(e.s.label)} ${e.both ? '⇄' : '→'} ${esc(e.t.label)}${e.label ? ': ' + esc(e.label) : ''}${e.label && e.sublabel ? ' (' + esc(e.sublabel) + ')' : ''}${e.when ? '\n' + esc(e.when) : ''}</title></g>`;
  });
  s += '</g><g class="nodes">';
  nodes.forEach(n => {
    const c = col(n.k), f = fill(n.k), removed = n.change === 'removed', planned = n.change === 'planned';
    const pub = map && n.k === 'm-public', priv = map && n.k === 'm-script', ext = map && n.k === 'm-ext', verb = map && n.k === 'm-verb', hook = map && n.k === 'm-hook';
    const rx = verb ? n.h / 2 : map ? 10 : 9;
    const kids = n.kids != null ? n.kids : opts.childCount ? opts.childCount(n.id) : 0, stacked = !!(kids || n.opens); // opens a view, loaded or not (#47)
    const subject = opts.subject === n.id;
    const verbs = map && (n.verbs || []).length ? n.verbs : null;
    const subTxt = n.noSub ? '' : n.sub || (map && n.origin ? n.origin : '') || (map ? (n.what ? n.what.replace(/[`*]/g, '').split(/(?<=\.)\s/)[0] : KIND[n.k][1]) : '');
    const third = !!(verbs && subTxt && !priv && geo.subAndChips); // the view's subAndChips: the sub-line, then the chips on a third line (a script card shows no sub-line)
    const sw = map ? n.w - 70 : n.w - 24;  // map cards: text runs from 54 px in (after the mark) to 16 px from the right
    const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > sw && textW(n.label, n.emphasis ? 15 : 13) <= sw ? wrap2(subTxt, 10, sw) : null;
    const sub = subTxt && (!verbs || third) ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, sw)) : '';
    const labelPx = n.emphasis ? 15 : 13;
    const lw = map ? n.w - 70 : n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side
    const two = map && textW(n.label, labelPx) > lw ? wrap2(n.label, labelPx, lw) : null;
    const lpx = two ? labelPx : textW(n.label, labelPx) > lw ? (measureText ? Math.max(11, labelPx * lw / textW(n.label, labelPx)) : Math.max(11, lw / (String(n.label).length * 0.6))) : labelPx;
    const ly = n.y + n.h / 2 + (third ? -14 : sub || verbs ? -3 : 4) - (two ? 8 : 0) - (sub2 ? 6 : 0);
    // A card is a button named by what it shows, in the order it shows it, so its visible text is a run of whole words of its
    // name (WCAG 2.5.3, as axe checks it) at every zoom: what always shows comes first, then the sub-line and chips (faded out
    // when zoomed far out). What is not shown, or not in full, goes in parentheses, which that check leaves out. The card's
    // texts are apart (whitespace between them), so text-based tools read separate words.
    const said = [], plain = t => String(t ?? '').replace(/…/g, '').replace(/\s+/g, ' ').trim();
    const part = (shown, full) => plain(shown) === plain(full) ? plain(full) : `${plain(shown)} (in full: ${plain(full)})`;
    const tx0 = map ? n.x + 54 : n.x + n.w / 2, anchor = map ? 'start' : 'middle', lines = (t, dy) => `<tspan x="${tx0}">${esc(t[0])}</tspan> <tspan x="${tx0}" dy="${dy}">${esc(t[1])}</tspan>`;
    const label = two ? two.join(' ') : fit(n.label, lpx, lw, true), subShown = sub && !priv; // a script card hides its sub-line
    said.push(part(label, n.label) + (subTxt && !subShown ? ` (${subTxt})` : ''));
    const parts = [`<title>${esc(n.label)}${subTxt ? ' · ' + esc(subTxt) : ''}${n.note ? '\n' + esc(n.note) : ''}${stacked ? '\nDouble-click to open' : ''}</title>`];
    if (stacked) parts.push(`<rect x="${n.x + 8}" y="${n.y + 8}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/><rect x="${n.x + 4}" y="${n.y + 4}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/>`);
    if (pub) parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="14" class="n-ring" stroke="${c}"/>`);
    if (hook) { const hx = Math.min(16, n.h / 3), pts = `${n.x + hx},${n.y} ${n.x + n.w - hx},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w - hx},${n.y + n.h} ${n.x + hx},${n.y + n.h} ${n.x},${n.y + n.h / 2}`;
      parts.push(`<polygon points="${pts}" class="n-mask"/><polygon points="${pts}" class="n-body" fill="${f}" stroke="${c}" stroke-linejoin="round"/>`); }
    else parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-mask"/>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-body" fill="${f}" stroke="${c}" ${removed || ext || planned ? 'stroke-dasharray="6 4"' : ''} ${removed ? 'opacity=".6"' : ''}/>`);
    parts.push((() => { const I = (opts.icons || {})[n.icon], x = map ? n.x + 14 : n.x + (verb ? 14 : hook ? 17 : 9), y = map ? n.y + n.h / 2 - 14 : n.y + (priv ? 8 : 11), M = map ? 28 : 16;  // map: one 28 px mark, left, centred
return I && I.src ? `<rect x="${x - M * 3 / 28}" y="${y - M * 3 / 28}" width="${M * 34 / 28}" height="${M * 34 / 28}" rx="${M / 4}" class="n-logo${I.dark ? ' dark' : ''}"/><image href="${I.src}" x="${x}" y="${y}" width="${M}" height="${M}"/>`
  : I && I.g ? `<g transform="translate(${x} ${y}) scale(${M / 24})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 24 / M}" stroke-linecap="round" stroke-linejoin="round">${I.g}</g>`
  : `<g transform="translate(${x} ${y}) scale(${M / 16})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 16 / M}" stroke-linecap="round" stroke-linejoin="round">${SIGIL[n.k]}</g>`; })());
    parts.push(`<text x="${tx0}" y="${ly}" text-anchor="${anchor}" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? 'text-decoration="line-through"' : ''}>${two ? lines(two, 15) : esc(label)}</text>`);
    if (map) { let tx = n.x + 12; mapTabs(n, c).forEach(t => { const tw = t.w; // each badge is its own tab, clickable on its own
      parts.push(`<g class="pub-tab"${t.badge != null ? ` data-badge="${t.badge}"` : ''}><rect x="${tx}" y="${n.y - 8}" width="${tw}" height="15" rx="4" fill="${t.fill}"/><text x="${tx + tw / 2}" y="${n.y + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`);
      said.push(t.badge != null ? badgesOf(n)[t.badge].text : t.text.toLowerCase()); tx += tw + 4; }); }
    if (map && n.edited) parts.push(`<g class="edited"><title>Edited</title><circle cx="${n.x + n.w - 10}" cy="${n.y + n.h - 10}" r="4" class="edited-dot"/></g>`);
    if (map && n.step) { const t = String(n.step), sw = Math.max(20, sansW(t, 9.5, .9) + 10);
      parts.push(`<g class="step"><title>Step ${esc(t)}</title><rect x="${n.x - 10}" y="${n.y - 10}" width="${sw}" height="20" rx="10" class="stp"/><text x="${n.x - 10 + sw / 2}" y="${n.y + 3.5}" text-anchor="middle" class="stp-tx">${esc(t)}</text></g>`);
      said.push(`(step) ${t}`); }
    if (n.tag) { // author name tag under the card: a bigger headshot + @handle (avatar inlined by render)
      const T = n.tag, cxp = T.x + 11, cyp = T.y + 11, cid = 'av-' + id + '-' + String(n.id).replace(/[^\w-]/g, '_');
      const ini = T.img ? '' : String(n.author || '?').split(/[\s_-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      parts.push(`<g class="ntag"><title>${esc(T.name ? 'by ' + T.name + ' (@' + n.author + ')' : n.author ? '@' + n.author : 'author unknown')}</title><rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="${T.h / 2}" class="ntag-bg"/>`
        + (T.img ? `<clipPath id="${cid}"><circle cx="${cxp}" cy="${cyp}" r="13"/></clipPath><image href="${T.img}" x="${cxp - 13}" y="${cyp - 13}" width="26" height="26" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/><circle cx="${cxp}" cy="${cyp}" r="13" class="ntag-ring" stroke="${c}"/>`
          : `<circle cx="${cxp}" cy="${cyp}" r="13" class="n-mask" stroke="${c}" stroke-width="1.4" stroke-dasharray="2 2"/><text x="${cxp}" y="${cyp + 3}" text-anchor="middle" class="ini-tx2" fill="${c}">${esc(ini)}</text> `)
        + `<text x="${T.x + 30}" y="${T.y + 14.5}" class="ntag-tx" data-t="nt" data-o="${esc(n.id)}">${esc(T.text)}</text></g>`);
      said.push(`(by${T.name ? ' ' + T.name : ''}) ${plain([ini, T.text].filter(Boolean).join(' '))}`);
    }
    const hint = stacked && opts.openHint !== false;
    if (hint) { const kx = map ? n.x + n.w - 44 : n.x + n.w - 40, ky = map ? n.y - 8 : n.y + n.h - 11;
      parts.push(`<g class="open-hint${map ? '' : ' depth-read'}"><title>Open the inner view (or double-click the card)</title><rect x="${kx}" y="${ky}" width="36" height="16" rx="8" class="n-mask" stroke="${c}"/><text x="${kx + 18}" y="${ky + 12}" text-anchor="middle" class="badge-tx" fill="${c}">⤢${kids ? ' ' + kids : ''}</text></g>`);
      said.push(kids ? `${kids} (cards inside, opens the inner view)` : '(opens the inner view)'); }
    const ch = CHG[String(n.change || '').toLowerCase()];
    if (ch) {
      const bw = ch[1].length * 6 + 12;
      parts.push(`<rect x="${n.x + n.w - bw - 8}" y="${n.y - 8}" width="${bw}" height="16" rx="8" fill="var(--um-mask)" stroke="var(--um-${ch[0]})"/>
        <text x="${n.x + n.w - bw / 2 - 8}" y="${n.y + 3}" text-anchor="middle" class="badge-tx" fill="var(--um-${ch[0]})">${ch[1]}</text>`);
      said.push(ch[1].toLowerCase());
    }
    if (sub) { parts.push(`<text x="${tx0}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="${anchor}" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? lines(sub2, 12) : esc(sub)}</text>`);
      if (subShown) said.push(part(sub, subTxt)); }
    if (verbs) { // verb chips: the node's public surface, at a glance
      let vx = 0; const chips = [], maxW = third ? sw : n.w - 24; // on a third line they keep to the text's column, clear of the mark
      for (let i = 0; i < verbs.length; i++) {
        const wv = textW(verbs[i], 9.5) + 10, rest = verbs.length - i - 1, more = rest ? textW('+' + rest, 9.5) + 10 : 0;
        if (vx + wv + (rest ? more + 4 : 0) > maxW && i) { chips.push(['+' + (verbs.length - i), textW('+' + (verbs.length - i), 9.5) + 10, true]); break; }
        chips.push([verbs[i], wv]); vx += wv + 4;
      }
      const total = chips.reduce((a, c2) => a + c2[1], 0) + (chips.length - 1) * 4;
      let px = third ? tx0 : n.x + (n.w - total) / 2; const py = third ? ly + 23 + (two ? 15 : 0) : ly + 7;
      parts.push(`<g class="verbs depth-read">${chips.map(([t, wv], ci) => { const m = `<rect x="${px}" y="${py}" width="${wv}" height="14" rx="7" class="verb-chip" data-chip="${ci}" stroke="${c}"/><text x="${px + wv / 2}" y="${py + 10}" text-anchor="middle" class="verb-tx" data-chip="${ci}" data-o="${esc(n.id)}" data-t="nv" fill="${c}">${esc(t)}</text>`; px += wv + 4; return m; }).join('\n')}</g>`);
      chips.forEach(([t, , more], ci) => said.push(more ? `${t} (more: ${verbs.slice(ci).join(', ')})` : t));
    }
    if (map) {
      const ports = new Map();
      edges.forEach((e, i) => { const point = e.from === n.id ? e.p1 : e.to === n.id ? e.p2 : null; if (!point) return;
        const key = point.join(','); const port = ports.get(key) || { point, indices: [] }; port.indices.push(i); ports.set(key, port); });
      ports.forEach(({ point, indices }) => { parts.push(`<circle cx="${point[0]}" cy="${point[1]}" r="3.5" class="n-port" data-edges="${indices.join(',')}" stroke="${c}"/>`); });
    }
    const name = said.join(', ') + (n.edited ? ' (edited)' : '') + (stacked && !hint ? ' (opens inner view)' : '');
    s += `<g class="node${pub ? ' pub' : ''}${priv ? ' priv' : ''}${stacked ? ' has-child' : ''}${subject ? ' subject' : ''}${n.emphasis ? ' main-step' : ''}${planned ? ' planned' : ''}${tour && n.id in tour.at ? ' tour-stop' : ''}"${tour && n.id in tour.at ? ` style="animation-delay:${(tour.at[n.id] * TOUR - .32).toFixed(2)}s"` : ''} data-id="${esc(n.id)}" tabindex="${map ? 0 : -1}" role="${map ? 'button' : 'img'}" aria-label="${esc(name)}">
      ${parts.join('\n')}
    </g>`;
  });
  if (tour) s += `<g class="tour" aria-hidden="true"><circle r="5.5" class="tour-dot"><animateMotion path="${tour.d}" dur="${TOUR}s" repeatCount="indefinite"/></circle></g>`;
  if (map) { // each line's focus target: after the cards, so lines follow them in the Tab order (#43), under the labels; the mouse still hits the line
    s += '</g><g class="keys">';
    edges.forEach((e, i) => { const said = e.label ? `: ${e.label}${e.sublabel ? ` (${e.sublabel})` : ''}` : '';
      const name = `${e.step != null ? `Step ${e.step}: ` : ''}Line ${e.both ? `between ${e.s.label} and ${e.t.label}, both ways` : `from ${e.s.label} to ${e.t.label}`}${said}`;
      s += `<g class="um-key line-key${e.weight > 1 ? ' wt-' + e.weight : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(name)}"><path d="${roundPath(e.pts)}" class="key-ring"/></g>`; });
  }
  s += '</g><g class="labels depth-read">';
  edges.forEach((e, i) => {
    if (!e.lbl) return;
    const L = e.lbl;
    if (map) {
      const st = L.step != null ? `<circle cx="${L.x + 11}" cy="${L.y + L.h / 2}" r="8" class="e-step"/><text x="${L.x + 11}" y="${L.y + L.h / 2 + 3.3}" text-anchor="middle" class="e-step-tx">${esc(L.step)}</text>` : '';
      const ax = L.step != null ? L.x + 23 : L.x + L.w / 2, an = L.step != null ? '' : 'text-anchor="middle"';
      const tx = L.text ? `<text x="${ax}" y="${L.y + 14}" ${an} class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.text)}</text>` : '';
      const sb = L.sub ? `<text x="${ax}" y="${L.y + 26}" ${an} class="e-sub" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.sub)}</text>` : '';
      s += `<g class="e-lab${L.tag ? ' ctag' : ''}${e.wk ? ' w-' + e.wk : ''}" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${Math.min(L.h / 2, 10)}" class="e-lbg"/>${st}${tx}${sb}</g>`;
    } else
    s += `<g class="e-lab" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="5" class="e-lbg"/><text x="${L.x + L.w / 2}" y="${L.y + 12.5}" text-anchor="middle" class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.text)}</text></g>`;
  });
  return s + '</g></svg>';
}

/* ================= camera: wheel/pinch zoom, drag pan, animated moves =================
   Ported in spirit from archify's viewer camera (MIT): reading depths by zoom level
   (map / read / full), fit + 100% presets, keyboard steps. Implemented on the SVG viewBox
   so text stays crisp at every zoom. */
class Camera {
  constructor(el, svg, o = {}) {
    this.el = el; this.svg = svg; this.o = o; this.s = { cx: 0, cy: 0, k: 1 }; this.touched = false;
    this.ptrs = new Map(); this.anim = 0;
    el.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    el.addEventListener('pointerdown', e => this.onDown(e));
    el.addEventListener('pointermove', e => this.onMove(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, e => this.onUp(e)));
    el.addEventListener('click', e => { if (this.dragged) { e.stopPropagation(); e.preventDefault(); this.dragged = false; } }, true);
    el.addEventListener('dblclick', e => { if (e.target.closest('.node')) return; const r = el.getBoundingClientRect(); this.zoomAt(2, e.clientX - r.left, e.clientY - r.top, true); });
  }
  setSvg(svg, bounds) { this.svg = svg; this.b = bounds; }
  size() { return [this.el.clientWidth || 800, this.el.clientHeight || 500]; }
  fitState(pad = 0.94, sets) { // fits the bounds inside the viewport minus the overlay insets (header pill, hint line); sets: these insets instead
    const [W, H] = this.size(), b = this.b, opts = [].concat(sets || (this.o.inset ? this.o.inset() : { t: 0, r: 0, b: 0, l: 0 }));
    const kOf = I => Math.min(Math.max(80, W - I.l - I.r) / b.w, Math.max(80, H - I.t - I.b) / b.h);
    const I = opts.reduce((a, o) => kOf(o) > kOf(a) + 1e-6 ? o : a); // several inset sets: keep the one that leaves the map largest
    const aw = Math.max(80, W - I.l - I.r), ah = Math.max(80, H - I.t - I.b);
    const k = Math.min(Math.min(aw / b.w, ah / b.h) * pad, this.o.maxFit || 1.25);
    const sx = I.l + aw / 2 - W / 2, sy = I.t + ah / 2 - H / 2;
    return { cx: b.x + b.w / 2 - sx / k, cy: b.y + b.h / 2 - sy / k, k };
  }
  limits() { const f = this.fitState(); return [Math.min(f.k * 0.5, 0.2), this.o.max || 4]; }
  clamp(s) {
    const [lo, hi] = this.limits(), b = this.b;
    const k = Math.min(hi, Math.max(lo, s.k)), [W, H] = this.size(), mx = W / (2 * k) * .5, my = H / (2 * k) * .5;
    return { k, cx: Math.min(b.x + b.w + mx, Math.max(b.x - mx, s.cx)), cy: Math.min(b.y + b.h + my, Math.max(b.y - my, s.cy)) };
  }
  apply() {
    const [W, H] = this.size(), { cx, cy, k } = this.s;
    const vx = cx - W / (2 * k), vy = cy - H / (2 * k);
    this.svg.setAttribute('viewBox', `${vx} ${vy} ${W / k} ${H / k}`);
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    const g = 24 * k, G = g * 5;
    this.el.style.backgroundSize = `${g}px ${g}px, ${G}px ${G}px, ${G}px ${G}px`;
    const ox = -vx * k, oy = -vy * k;
    this.el.style.backgroundPosition = `${ox}px ${oy}px, ${ox}px ${oy}px, ${ox}px ${oy}px`;
    this.el.dataset.depth = k < (this.o.mapDepth || 0.5) ? 'map' : k < 1.6 ? 'read' : 'full';
    this.o.onChange && this.o.onChange(this);
  }
  stopAnimation() {
    cancelAnimationFrame(this.anim); this.anim = 0;
    // Resize/refit interrupts camera motion. Navigation awaits that motion, so cancellation
    // must settle its promise too; otherwise go() never releases its busy flag.
    const done = this.animationDone; this.animationDone = null; if (done) done();
  }
  set(s) { this.stopAnimation(); this.s = this.clamp({ ...this.s, ...s }); this.apply(); }
  animate(to, ms = 380) {
    this.stopAnimation();
    const from = { ...this.s }, dest = this.clamp({ ...this.s, ...to });
    if (reducedMotion()) { this.set(dest); return Promise.resolve(); }
    return new Promise(res => {
      this.animationDone = res;
      const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lk0 = Math.log(from.k), lk1 = Math.log(dest.k);
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), e = ease(t);
        this.s = { cx: from.cx + (dest.cx - from.cx) * e, cy: from.cy + (dest.cy - from.cy) * e, k: Math.exp(lk0 + (lk1 - lk0) * e) };
        this.apply();
        if (t < 1) this.anim = requestAnimationFrame(step); else { this.anim = 0; this.animationDone = null; res(); }
      };
      this.anim = requestAnimationFrame(step);
    });
  }
  toWorld(sx, sy) { const [W, H] = this.size(), { cx, cy, k } = this.s; return [cx + (sx - W / 2) / k, cy + (sy - H / 2) / k]; }
  zoomAt(f, sx, sy, anim) {
    const [W, H] = this.size(); if (sx == null) { sx = W / 2; sy = H / 2; }
    const [wx, wy] = this.toWorld(sx, sy), [lo, hi] = this.limits();
    const k = Math.min(hi, Math.max(lo, this.s.k * f));
    const to = { k, cx: wx - (sx - W / 2) / k, cy: wy - (sy - H / 2) / k };
    this.touched = true;
    return anim ? this.animate(to, 220) : this.set(to);
  }
  fit(anim = true) { this.touched = false; return anim ? this.animate(this.fitState()) : this.set(this.fitState()); }
  actual(anim = true) { this.touched = true; return anim ? this.animate({ k: 1 }) : this.set({ k: 1 }); }
  pan(dx, dy, anim) { this.touched = true; const to = { cx: this.s.cx - dx / this.s.k, cy: this.s.cy - dy / this.s.k }; return anim ? this.animate(to, 160) : this.set(to); }
  reveal(r, anim = true) { // pan (no zoom change) until rect r is comfortably inside the viewport
    const [W, H] = this.size(), { cx, cy, k } = this.s, hw = W / (2 * k), hh = H / (2 * k), m = 60 / k;
    let nx = cx, ny = cy;
    if (r.x - m < cx - hw) nx = r.x - m + hw; else if (r.x + r.w + m > cx + hw) nx = r.x + r.w + m - hw;
    if (r.y - m < cy - hh) ny = r.y - m + hh; else if (r.y + r.h + m > cy + hh) ny = r.y + r.h + m - hh;
    if (r.w + 2 * m > 2 * hw) nx = r.x + r.w / 2;
    if (nx !== cx || ny !== cy) return anim ? this.animate({ cx: nx, cy: ny }, 300) : this.set({ cx: nx, cy: ny });
    return Promise.resolve();
  }
  zoomTo(r, fill = 0.9) { const [W, H] = this.size(); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, k: Math.min(W / r.w, H / r.h) * fill }; }
  onWheel(e) {
    const pinch = e.ctrlKey || e.metaKey;
    if (this.o.wheel === 'ctrl' && !pinch && !this.el.classList.contains('full')) return; // page scroll wins in documents
    e.preventDefault();
    const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    const trackpadPan = !pinch && e.deltaMode === 0 && (Math.abs(dx) > 0 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
    if (trackpadPan) return this.pan(-dx, -dy);
    this.zoomAt(Math.exp(-dy * (pinch ? 0.012 : 0.0022)), sx, sy);
  }
  onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.ctl, .minimap, button, a, input, .um-edit') || (this.o.skip && this.o.skip(e))) return;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    this.start = { x: e.clientX, y: e.clientY, s: { ...this.s }, dist: this.pinchDist() };
    this.moved = 0; this.dragged = false;
    cancelAnimationFrame(this.anim);
  }
  pinchDist() { const p = [...this.ptrs.values()]; return p.length > 1 ? Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) : 0; }
  onMove(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.ptrs.size > 1) { // pinch
      const d = this.pinchDist(); if (!this.start.dist) { this.start.dist = d; this.start.s = { ...this.s }; return; }
      const p = [...this.ptrs.values()], r = this.el.getBoundingClientRect();
      this.s = { ...this.start.s }; this.zoomAt(d / this.start.dist, (p[0][0] + p[1][0]) / 2 - r.left, (p[0][1] + p[1][1]) / 2 - r.top);
      this.dragged = true; return;
    }
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    this.moved = Math.max(this.moved, Math.hypot(dx, dy));
    if (this.moved > 4) {
      if (!this.dragged) { this.dragged = true; this.el.classList.add('grabbing'); try { this.el.setPointerCapture(e.pointerId); } catch (_) {} }
      this.touched = true;
      this.set({ cx: this.start.s.cx - dx / this.s.k, cy: this.start.s.cy - dy / this.s.k });
    }
  }
  onUp(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId); this.el.classList.remove('grabbing');
    if (this.ptrs.size === 1) { const [p] = [...this.ptrs.values()]; this.start = { x: p[0], y: p[1], s: { ...this.s }, dist: 0 }; }
    if (!this.dragged) this.dragged = false;
  }
}

function routeAudit(geo, where, only) { // only: a set of edges; counts just the issues that involve one of them
  const sk = e => only && !only.has(e);
  const issues = [];
  // routes: no crossings, no shared runs, no label lying across another route
  const segs = geo.edges.map(e => e.pts.slice(0, -1).map((a, i) => [a, e.pts[i + 1]]));
  const name = e => `${e.s.label}→${e.t.label}`;
  const crossing = ([a, b], [c, d]) => {
    const av = a[0] === b[0], cv = c[0] === d[0];
    if (av === cv) { // parallel: overlapping collinear run = shared trunk
      if (av && Math.abs(a[0] - c[0]) < 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1 ? 'share' : null;
      if (!av && Math.abs(a[1] - c[1]) < 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1 ? 'share' : null;
      return null;
    }
    const [v, hz] = av ? [[a, b], [c, d]] : [[c, d], [a, b]];
    const x = v[0][0], y = hz[0][1];
    const inV = y > Math.min(v[0][1], v[1][1]) + .5 && y < Math.max(v[0][1], v[1][1]) - .5, inH = x > Math.min(hz[0][0], hz[1][0]) + .5 && x < Math.max(hz[0][0], hz[1][0]) - .5;
    return inV && inH ? 'cross' : null;
  };
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    if (geo.edges[i].fixed && geo.edges[j].fixed) continue; // one comb: its branches share the trunk by design
    if (sk(geo.edges[i]) && sk(geo.edges[j])) continue;
    let found = null;
    for (const s1 of segs[i]) { for (const s2 of segs[j]) { found = crossing(s1, s2); if (found) break; } if (found) break; }
    if (found === 'cross') issues.push(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} cross`);
    if (found === 'share') issues.push(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} share a line`);
  }
  geo.edges.forEach((e, i) => { if (!e.lbl) return; const L = { x: e.lbl.x + 1, y: e.lbl.y + 1, w: e.lbl.w - 2, h: e.lbl.h - 2 };
    geo.edges.forEach((o, j) => { if (j !== i && !(sk(e) && sk(o)) && segs[j].some(([a, b]) => Math.max(a[0], b[0]) > L.x && Math.min(a[0], b[0]) < L.x + L.w && Math.max(a[1], b[1]) > L.y && Math.min(a[1], b[1]) < L.y + L.h)) issues.push(`${where}: label "${e.lbl.text || e.lbl.step}" lies on edge ${name(o)}`); }); });
  const segHit = (r, i) => segs[i].some(([a, b]) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h);
  if (geo.map) {
    const ex = 12;
    geo.edges.forEach((e, i) => {
      // clearance: a route keeps 12+ px from every node it does not connect
      geo.nodes.forEach(n => { if (n.id === e.from || n.id === e.to) return;
        if (segHit({ x: n.x - ex + .5, y: n.y - ex + .5, w: n.w + 2 * ex - 1, h: n.h + 2 * ex - 1 }, i)) issues.push(`${where}: edge ${name(e)} passes within ${ex}px of node "${n.label}"`); });
      // no detours: a route stays under 2.5x the straight distance between its ends
      const len = e.pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - e.pts[k][0]) + Math.abs(p[1] - e.pts[k][1]), 0);
      const d = Math.hypot(e.pts[e.pts.length - 1][0] - e.pts[0][0], e.pts[e.pts.length - 1][1] - e.pts[0][1]);
      if (len > 2.5 * Math.max(d, 100)) issues.push(`${where}: edge ${name(e)} takes a detour (${Math.round(len)}px for ${Math.round(d)}px)`);
      // reading order: every wire runs left to right, except one that closes a loop
      if (!e.back && !e.both && e.t.x + e.t.w / 2 <= e.s.x + e.s.w / 2) issues.push(`${where}: edge ${name(e)} runs right-to-left`);
    });
    if (geo.hub) { // hub views: one visible line into each callee
      const into = {}; geo.edges.forEach(e => { (into[e.to] ||= []).push(e); });
      Object.entries(into).forEach(([id, es]) => { es = es.filter(e => !e.back); if (es.some(e => e.from === geo.hub) && es.length > 1) issues.push(`${where}: hub callee "${(geo.byId[id] || {}).label || id}" has ${es.length} incoming lines`); });
    }
  }
  // author name tags hang under their card: no route may run through one
  (geo.nodes || []).forEach(n => { if (!n.tag) return; const r = { x: n.tag.x + 1, y: n.tag.y + 1, w: n.tag.w - 2, h: n.tag.h - 2 };
    geo.edges.forEach((o, j) => { if (segHit(r, j)) issues.push(`${where}: name tag "${n.tag.text}" lies on edge ${name(o)}`); }); });
  // lanes: every part sits inside its own lane, lanes never overlap, no route crosses a lane header
  const lanes = geo.lanes || [];
  lanes.forEach((l, i) => {
    lanes.slice(i + 1).forEach(m => { if (hit(l, m, -1)) issues.push(`${where}: lanes "${l.title}" and "${m.title}" overlap`); });
    (geo.nodes || []).forEach(n => {
      if (n.lane === i && (n.x < l.x || n.x + n.w > l.x + l.w || n.y < l.y || n.y + n.h + (n.tag ? 14 : 0) > l.y + l.h)) issues.push(`${where}: lane "${l.title}": node "${n.label}" sticks out`);
      if (n.lane != null && n.lane !== i && hit(n, l, -1)) issues.push(`${where}: lane "${l.title}": node "${n.label}" of another lane sits in it`);
      if (n.lane == null && hit(n, l, -1)) issues.push(`${where}: lane "${l.title}": node "${n.label}" belongs to no lane but sits in it`);
    });
  });
  (geo.blocks || []).forEach(b => geo.edges.forEach((o, j) => { if (segHit({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }, j)) issues.push(`${where}: lane "${b.title || ''}": header crossed by edge ${name(o)}`); }));
  const families = geo.families || [], inside = (a,b) => b.x > a.x && b.y > a.y && b.x+b.w < a.x+a.w && b.y+b.h < a.y+a.h;
  families.forEach(f => {
    const parent = families.find(p => p.id === f.parent);
    if (f.parent && (!parent || !inside(parent,f))) issues.push(`${where}: family "${f.label}" sticks out of its parent`);
    (f.nodeIds || []).forEach(id => { const n = geo.byId[id]; if (n && !inside(f,n)) issues.push(`${where}: family "${f.label}" does not contain "${n.label}"`); });
    families.filter(g => g !== f && g.parent === f.parent && g.id > f.id).forEach(g => { if (hit(f,g,-1)) issues.push(`${where}: families "${f.label}" and "${g.label}" overlap`); });
    geo.edges.forEach((e,i) => { if (segHit({x:f.x+8,y:f.y+3,w:Math.min(f.w-16,textW(f.label || f.id,11)+16),h:22},i)) issues.push(`${where}: family "${f.label}": header crossed by edge ${name(e)}`); });
    geo.edges.forEach((e,i) => { if (segs[i].some(([a,b]) => { const v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];
      const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);
      return hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8); })) issues.push(`${where}: edge ${name(e)} runs along the border of family "${f.label}"`); });
    geo.edges.forEach(e => { const L = e.lbl; if (!L) return; const xin = L.x + L.w > f.x && L.x < f.x + f.w, yin = L.y + L.h > f.y && L.y < f.y + f.h;
      if ((xin && [f.y, f.y + f.h].some(u => L.y < u && L.y + L.h > u)) || (yin && [f.x, f.x + f.w].some(u => L.x < u && L.x + L.w > u))) issues.push(`${where}: label "${L.text || L.step}" sits on the border of family "${f.label}"`); });
  });
  return issues;
}

/* label-overlap audit used by `visual.py check` (world coordinates, real font metrics) */
function auditSvg(svg, geo, where) {
  const issues = [], R = n => ({ x: n.x, y: n.y, w: n.w, h: n.h });
  const T = [...svg.querySelectorAll('text[data-t]')].map(t => { let b; try { b = t.getBBox(); } catch (_) { return null; } return { t: t.dataset.t, o: t.dataset.o, txt: t.textContent, b: { x: b.x, y: b.y, w: b.width, h: b.height } }; }).filter(x => x && x.b.w);
  const nodes = geo.nodes;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(R(nodes[i]), R(nodes[j]), -1)) issues.push(`${where}: nodes "${nodes[i].label}" and "${nodes[j].label}" overlap`);
  T.forEach(a => {
    if (a.t === 'lt' || a.t === 'ft') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: lane "${a.txt}": header covers node "${n.label}"`); });
      if (a.t === 'ft') { const f = (geo.families || []).find(f => f.id === a.o); if (f && (a.b.x < f.x || a.b.x+a.b.w > f.x+f.w)) issues.push(`${where}: family title "${a.txt}" overflows its box`); }
    } else if (a.t === 'el') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: edge label "${a.txt}" covers node "${n.label}"`); });
    } else {
      const own = geo.byId[a.o];
      if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text "${a.txt}" overflows node "${own.label}"`);
      if (own && geo.map && (a.t === 'nl' || a.t === 'ns') && hit(a.b, { x: own.x + 11, y: own.y + own.h / 2 - 17, w: 34, h: 34 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${own.label}"`);
      nodes.forEach(n => { if (n !== own && hit(a.b, R(n), -1)) issues.push(`${where}: text "${a.txt}" overlaps node "${n.label}"`); });
    }
  });
  issues.push(...routeAudit(geo, where));
  if (geo.map) geo.edges.forEach(e => { const L = e.lbl; if (!L || !e.label || !e.pts) return; // a label must leave some of its own line visible
    const c = [L.x + L.w / 2, L.y + L.h / 2], P = e.pts; let s = 0, at = null, half = 0, tot = 0;
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (at == null) { const onH = a[1] === b[1] && Math.abs(c[1] - a[1]) < 2 && c[0] >= Math.min(a[0], b[0]) - 1 && c[0] <= Math.max(a[0], b[0]) + 1;
        const onV = a[0] === b[0] && Math.abs(c[0] - a[0]) < 2 && c[1] >= Math.min(a[1], b[1]) - 1 && c[1] <= Math.max(a[1], b[1]) + 1;
        if (onH || onV) { at = tot + Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]); half = onH ? L.w / 2 : L.h / 2; } }
      tot += len; }
    if (at == null) return; const room = Math.min(at - half, tot - at - half);
    if (room < 16) issues.push(`${where}: label "${e.label}" leaves its line ${Math.max(0, Math.round(room))} px (${e.s.label}→${e.t.label})`); });
  const els = T.filter(a => a.t === 'el');
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (hit(els[i].b, els[j].b, -1)) issues.push(`${where}: edge labels "${els[i].txt}" and "${els[j].txt}" overlap`);
  return issues;
}

/* Swimlanes for run-order views. A view may set `lanes` ([{title, nodeIds}] or false); otherwise a
   sequence view is read step by step and each part is filed under the first workflow phase its own
   label (then the step's label, then its sub line) names. Phases only move forward, so a lane is a
   contiguous stretch of the run order. Fewer than three lanes, or a lane layout that would need a
   crossing, falls back to the free graph. */
const PHASES = [
  ['Ask', /\b(grill|ask|interview|question|intake|taste|intent|clarif)/i],
  ['Plan', /\b(plan|spec\b|scope|claim|triage|ticket|backlog)/i],
  ['Build', /\b(build|implement|launch|scaffold|develop)/i],
  ['Check', /\b(check|review|detect|shots?\b|screenshot|audit|test|qa\b|verif|critique|lint|scan|grade)/i],
  ['Fix', /\b(fix|polish|refine|repair|patch|rework)/i],
  ['Finish', /\b(pr\b|pull request|merge|ship|publish|release|deploy|human|ledger|manifest|report)/i],
];
function phaseOf(texts) {
  for (const t of texts) {
    let best = null;
    PHASES.forEach((p, i) => { const m = p[1].exec(String(t || '')); if (m && (!best || m.index < best[1])) best = [i, m.index]; });
    if (best) return best[0];
  }
  return null;
}

/* ================= map: one model, many views =================
   Viewer UX ported in spirit from archify (MIT): camera with reading depths, minimap, node focus,
   node finder, export. Drill-down views, swimlanes, breadcrumbs and deep links are super-board's /visual. */

// every model edge gets an id for events: its own, else "<from>-><to>#<n>" (n: its place among edges with the same ends)
function edgeIds(list) {
  const seen = {};
  (list || []).forEach(e => { if (!e || typeof e !== 'object') return; const k = e.from + '->' + e.to, n = seen[k] = (seen[k] ?? -1) + 1; e._id = e.id != null ? String(e.id) : `${k}#${n}`; });
}

/* The model's views and everything that lays one out. Works on its own copy of the model, needs no DOM. */
function mapContext(model, opts = {}) {
  const D = structuredClone(model || {});
  const M = opts.measure || null, withM = f => (...a) => { const prev = measureText; measureText = M; try { return f(...a); } finally { measureText = prev; } };
  edgeIds(D.edges); (D.views || []).forEach(v => { if (Array.isArray(v.edges)) edgeIds(v.edges); });
  const views = (D.views || []).filter(v => v && v.id);
  const nodes = [...(D.nodes || []), ...views.flatMap(v => v.nodes || [])];
  const N = Object.fromEntries(nodes.map(n => [n.id, n]));
  const V = Object.fromEntries(views.map(v => [v.id, v]));
  const viewOfParent = p => V[p] ? p : (views.find(v => v.id === p || v.node === p) || {}).id; // parent may name a node
  views.forEach(v => { if (v.parent) v.parent = viewOfParent(v.parent) || null; });
  const rootId = (D.root && V[D.root]) ? D.root : (views.find(v => !v.parent) || views[0] || {}).id;
  const nodeIn = (nid, vid) => ({ ...(N[nid] || {}), ...((V[vid] || {}).nodeOverrides || {})[nid] });
  const childOf = (nid, vid) => { const n = nodeIn(nid, vid); const o = n.view || n.opensView; return o && V[o] ? o : V[nid] ? nid : (views.find(v => v.node === nid) || {}).id; };
  const opensOf = (nid, vid) => { const n = nodeIn(nid, vid), o = childOf(nid, vid) || n.view || n.opensView; return o != null && String(o) !== vid ? String(o) : null; }; // loaded or not (#47)
  const subjectOf = v => v.node || (N[v.id] ? v.id : null);
  const viewsWith = nid => views.filter(v => (v.nodeIds || []).includes(nid));
  const kidsOf = id => views.filter(x => (x.parent || null) === id);
  const chain = vid => { const out = []; let c = V[vid]; const seen = new Set(); while (c && !seen.has(c.id)) { seen.add(c.id); out.unshift(c.id); c = V[c.parent]; } return out; };
  const viewEdges = v => { // an edge's ends are cards of the view or its containers
    const ids = new Set([...(v.nodeIds || []), ...(v.containers || []).map(c => c && c.id).filter(Boolean)]);
    const list = Array.isArray(v.edges) ? v.edges : (D.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
    return list.map(e => typeof e === 'string' ? (D.edges || []).find(x => x.id === e) : e).filter(e => e && ids.has(e.from) && ids.has(e.to));
  };
  /* ---------- reading order: every view runs left → right ----------
     The trigger sits at the far left; each next step or callee goes one column to the right, branches
     stack inside a column, state (board, config, repo) sits at the end of its column. A view whose
     focus node starts three or more things is a hub: its callees go into phase lanes, and one comb of
     lines feeds them — a single trunk, one split per lane, one short branch per callee with its label
     just left of the callee. A line that closes a loop is the only one allowed to run right to left. */
  const HUB_PHASES = [
    ['Prepare', /\b(grill|ask|interview|plan|spec|scope|shape|sharpen|ladder|docs?\b|reads?\b|design|picks?|init|triage|on-ramp|vocabular|idea|requires|climbs)/i],
    ['Build', /\b(build|implement|routes?|test|tdd|writes?|fix|diagnos|resolv|fetch|runs?\b|prototype|split|code|finds?|drafts?|bridges?|wires?)/i],
    ['Check', /\b(review|verif|proves?|audit|critique|judge|coverage|polish|humaniz|hunts?|checks?|grades?)/i],
    ['Hand off', /\b(pr\b|moves? card|files?\b|board|merges?|gate|closes?|bounces?|ships?|posts?|parks?|ticks|updates|backlog)/i],
  ];
  const latestPhase = texts => { for (const t of texts) { let best = null; HUB_PHASES.forEach((p, i) => { if (p[1].test(String(t || ''))) best = i; }); if (best != null) return best; } return null; };
  const isState = id => (N[id] || {}).kind === 'board';
  function loopsOf(v) { // edges that close a cycle, found depth-first in run order from the roots
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v), back = new Set(), st = {};
    edges.forEach((e, k) => { if (e.loop) back.add(k); }); // an edge marked `loop: true` is the view's loop back
    const dfs = u => { st[u] = 1; edges.forEach((e, k) => { if (e.from !== u || e.from === e.to || e.loop) return; if (st[e.to] === 1) back.add(k); else if (!st[e.to]) dfs(e.to); }); st[u] = 2; };
    [...ids.filter(i => !edges.some(e => e.to === i && e.from !== i && !e.loop)), ...ids].forEach(i => { if (!st[i]) dfs(i); });
    if (v.render === 'sequence') { // run order: a step back to a part an earlier step already reached loops back (state may be written again later)
      const first = {}; edges.forEach((e, k) => { if (first[e.from] == null && !edges.some((x, j) => j < k && x.to === e.from)) first[e.from] = -1; if (first[e.to] == null) first[e.to] = k; });
      edges.forEach((e, k) => { if (first[e.to] < k && !isState(e.to) && e.from !== e.to) back.add(k); });
    }
    return { edges, back, keys: new Set(edges.filter((e, k) => back.has(k)).map(e => e.from + '>' + e.to)) };
  }
  function deriveLanes(v, hub) { // sequence views: lanes named by workflow phase, in run order
    if (v.lanes === false) return null;
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v);
    if (Array.isArray(v.lanes)) {
      const lanes = v.lanes.map(l => ({ title: l.title || l.label || '', ids: (l.nodeIds || []).filter(i => ids.includes(i) && i !== hub) })).filter(l => l.ids.length);
      return lanes.length ? { lanes, explicit: true } : null;
    }
    if (v.render !== 'sequence' || edges.length < 4) return null;
    const lanes = [], laneOf = {}, pending = [];
    let curP = -1, named = 0, filed = 0;
    const file = (id, p) => {
      filed++; if (p != null) named++;
      if (p == null) { if (!lanes.length) { pending.push(id); return; } lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1; return; }
      if (p > curP) { curP = p; lanes.push({ title: PHASES[p][0], ids: [] }); }
      lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1;
    };
    edges.forEach(e => [e.from, e.to].forEach(id => {
      if (id === hub || laneOf[id] != null || pending.includes(id)) return;
      const n = N[id];
      file(id, phaseOf([n.label, id === e.to ? e.label : '', n.sublabel || n.sub]));
    }));
    if (lanes.length < 3 || lanes.length > 6 || named < filed * 0.6) return null; // lanes only when most parts name their phase
    lanes[0].ids.unshift(...pending);
    ids.forEach(i => { if (i !== hub && laneOf[i] == null && !pending.includes(i)) lanes[lanes.length - 1].ids.push(i); });
    return { lanes };
  }
  function hubPlan(v, hub, lp) {
    const ids = (v.nodeIds || []).filter(i => N[i] && i !== hub), seq = v.render === 'sequence';
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    const callees = []; lp.edges.forEach(e => { if (e.from === hub && e.to !== hub && !callees.includes(e.to)) callees.push(e.to); });
    const laneOf = {}; let titles = [], boxed = true;
    const dl = deriveLanes(v, hub);
    if (dl) { titles = dl.lanes.map(l => l.title); dl.lanes.forEach((l, i) => l.ids.forEach(id => { laneOf[id] = i; })); }
    else if (seq) { // run order, three to a column
      boxed = false;
      const stepOf = id => lp.edges.findIndex(e => e.from === hub && e.to === id) + 1;
      callees.forEach((id, k) => { laneOf[id] = Math.floor(k / 3); });
      for (let i = 0; i * 3 < callees.length; i++) { const grp = callees.slice(i * 3, i * 3 + 3).map(stepOf); titles.push(grp.length > 1 ? `Steps ${grp[0]}–${grp[grp.length - 1]}` : `Step ${grp[0]}`); }
    } else { // by the kind of work the line names; unnamed ones follow the previous callee
      let prev = 1;
      lp.edges.forEach(e => { if (e.from !== hub || laneOf[e.to] != null) return; const p = isState(e.to) ? 3 : latestPhase([condTag(e.label) ? 'routes' : e.label, N[e.to].label]); laneOf[e.to] = p == null ? prev : p; prev = laneOf[e.to]; });
      titles = HUB_PHASES.map(p => p[0]);
    }
    const raise = () => { for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || laneOf[e.from] == null) return; if (laneOf[e.to] == null || laneOf[e.to] < laneOf[e.from]) laneOf[e.to] = laneOf[e.from]; }); };
    raise();
    ids.forEach(i => { if (laneOf[i] == null) { const t = fwd.filter(e => e.from === i && laneOf[e.to] != null).map(e => laneOf[e.to]); laneOf[i] = t.length ? Math.min(...t) : 0; } });
    if (!dl && !seq) { const last = Math.max(...ids.map(i => laneOf[i])); ids.forEach(i => { if (isState(i)) laneOf[i] = Math.max(laneOf[i], last); }); raise(); }
    const used = [...new Set(ids.map(i => laneOf[i]))].sort((a, b) => a - b);
    // branches: hub → callee is drawn unless the callee already has another line coming in
    const branch = new Set(callees.filter(c => !isState(c) && !lp.edges.some(e => e.to === c && e.from !== hub)));
    const sub = {}; ids.forEach(i => { sub[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || e.to === hub) return; if (laneOf[e.from] === laneOf[e.to] && sub[e.to] < sub[e.from] + 1) sub[e.to] = Math.min(3, sub[e.from] + 1); });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id); return k < 0 ? 999 + lp.edges.findIndex(e => e.from === id) : k; };
    const lanes = used.map(u => {
      const mine = ids.filter(i => laneOf[i] === u), nCols = Math.max(...mine.map(i => sub[i])) + 1;
      const cols = Array.from({ length: nCols }, (_, j) => mine.filter(i => sub[i] === j)
        .sort((a, b) => (branch.has(b) - branch.has(a)) || (isState(a) - isState(b)) || (seen(a) - seen(b))));
      return { title: titles[u] || `Lane ${u + 1}`, ids: mine, cols };
    });
    return { lanes, branch, boxed: boxed && lanes.length > 1 };
  }
  /* a hub plan made stable against the one before it: a card that was there keeps its lane (by title), column and
     order; a new card takes its place in the fresh plan, after the cards already in that column */
  function keepHub(P, Q) {
    const at = {}; Q.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { at[id] = { t: L.title, j, r }; })));
    const titles = Q.lanes.map(L => L.title);
    P.lanes.forEach((L, i) => { if (titles.includes(L.title)) return; const before = P.lanes.slice(0, i).map(x => x.title).filter(t => titles.includes(t)).pop();
      titles.splice(before == null ? 0 : titles.indexOf(before) + 1, 0, L.title); });
    const lanes = titles.map(title => ({ title, ids: [], cols: [] })), lane = Object.fromEntries(lanes.map(L => [L.title, L]));
    const put = (id, t, j, r) => { const L = lane[t]; L.ids.push(id); (L.cols[j] ||= []).push([r, id]); };
    P.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { const a = at[id]; if (a) put(id, a.t, a.j, a.r); else put(id, L.title, j, 1e6 + r); })));
    lanes.forEach(L => { L.cols = L.cols.filter(c => c && c.length).map(c => c.sort((a, b) => a[0] - b[0]).map(x => x[1])); });
    const out = lanes.filter(L => L.ids.length);
    return { ...P, lanes: out, boxed: Q.boxed && out.length > 1 };
  }
  const planCache = {};
  function planOf(vid) {
    if (vid in planCache) return planCache[vid];
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v);
    const outs = id => lp.edges.filter(e => e.from === id && e.to !== id).length;
    let hub = subjectOf(v); if (hub && !ids.includes(hub)) hub = null;
    const sources = ids.filter(i => outs(i) && !lp.edges.some(e => e.to === i && e.from !== i));
    if (!hub && lp.edges.length && outs(lp.edges[0].from) >= 3 && sources.length === 1 && /^(public|lane|verb|external)$/.test(N[lp.edges[0].from]?.kind || '')) hub = lp.edges[0].from; // one trigger only; an overview with several stays a flow
    if (hub && outs(hub) < 3) hub = null;
    const steps = {}; if (v.render === 'sequence') lp.edges.forEach((e, i) => { (steps[e.to] ||= []).push(i + 1); });
    const flow = { flow: true, backKeys: lp.keys, steps, hub: null };
    if (!hub || v.containers || v.mainSteps || v.render === 'process') return (planCache[vid] = flow);
    planCache[vid] = { ...hubPlan(v, hub, lp), hub, backKeys: lp.keys, steps };
    const was = opts.prev && opts.prev[vid]; // after an update: cards keep the lane, column and order they had
    if (was && was.hub === hub && was.lanes) return (planCache[vid] = keepHub(planCache[vid], was));
    // a hub plan that cannot route cleanly gives way to the plain left-to-right flow, if that does better
    const bad = g => routeAudit(g, '').length + ((g.stats.cross || 0) + (g.stats.fallback || 0)) * 5;
    let hb = bad(buildGeo(vid, undefined, undefined, true));
    if (hb) { // try other orders inside each lane column before giving up on the hub layout
      const P0 = planCache[vid]; let evals = 0;
      for (let pass = 0; pass < 2 && hb && evals < 80; pass++) P0.lanes.forEach(L => L.cols.forEach(col => {
        for (let a = 0; a < col.length && hb && evals < 80; a++) for (let b = a + 1; b < col.length && hb && evals < 80; b++) {
          if (P0.branch.has(col[a]) !== P0.branch.has(col[b])) continue;
          [col[a], col[b]] = [col[b], col[a]]; evals++;
          const nb = bad(buildGeo(vid, undefined, undefined, true)); if (nb < hb) hb = nb; else [col[a], col[b]] = [col[b], col[a]];
        }
      }));
    }
    if (hb) { const keep = planCache[vid]; planCache[vid] = flow; const fb = bad(buildGeo(vid, undefined, undefined, true)); if (fb >= hb) planCache[vid] = keep; }
    return planCache[vid];
  }
  /* a layout may place only some cards: they keep their slots, the rest take their auto-layout slot or the next free
     row below it (a complete layout is used as it is) */
  function fillLayout(vid, L) {
    const ids = (V[vid].nodeIds || []).filter(i => N[i]);
    if (ids.every(i => Array.isArray(L[i]))) return L;
    const auto = autoPos(vid), out = {}, taken = new Set(), key = (c, r) => c + ',' + r;
    ids.forEach(i => { if (Array.isArray(L[i])) { out[i] = L[i]; taken.add(key(...L[i])); } });
    ids.forEach(i => { if (out[i]) return; let [c, r] = auto[i] || [0, 0]; while (taken.has(key(c, r))) r++; out[i] = [c, r]; taken.add(key(c, r)); });
    return out;
  }
  /* plain views: longest-path columns from the roots, state at the bottom of its column */
  /* views with containers: each container is a block in columns of its own, its cards in call order inside it; blocks (and
     cards in no container) run left to right by the lines between them, and those with no line between them stack in the
     same columns. A nested container is a block inside its parent's. */
  function blockPos(vid) {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v), boxes = (v.containers || []).filter(c => c && c.id);
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to), byBox = Object.fromEntries(boxes.map(b => [b.id, b]));
    const home = Object.fromEntries(ids.map(i => [i, (boxes.filter(b => (b.nodeIds || []).includes(i)).pop() || {}).id ?? null])); // the box a card is drawn in
    const up = x => ids.includes(x) ? home[x] : byBox[x] && byBox[byBox[x].parent] ? byBox[x].parent : null; // the box a card or box sits in
    const itemIn = (x, g) => { for (let k = 0; x != null && k < 64; k++, x = up(x)) if (up(x) === g) return x; }; // what in group g holds x
    const holds = (x, y) => { for (let k = 0; y != null && k < 64; k++, y = up(y)) if (y === x) return true; return false; };
    const first = x => { const k = lp.edges.findIndex(e => holds(x, e.from) || holds(x, e.to)); return k < 0 ? Infinity : k; };
    const sink = x => ids.includes(x) && isState(x) && !fwd.some(e => e.from === x); // state that leads nowhere goes last
    const block = g => { // a group's cards at [col, row] from its top left, and its size in slots
      const items = [...ids.filter(i => home[i] === g), ...boxes.filter(b => up(b.id) === g).map(b => b.id)], size = {}, out = {};
      items.forEach(x => { size[x] = ids.includes(x) ? { w: 1, h: 1, pos: { [x]: [0, 0] } } : block(x); out[x] = []; });
      fwd.forEach(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g); if (a !== undefined && b !== undefined && a !== b && !out[a].includes(b)) out[a].push(b); });
      const st = {}, dag = [], into = new Set(Object.values(out).flat()); // lines that close a loop do not order the blocks
      const dfs = u => { st[u] = 1; out[u].forEach(w => { if (st[w] === 1) return; dag.push([u, w]); if (!st[w]) dfs(w); }); st[u] = 2; };
      [...items.filter(x => !into.has(x)), ...items].forEach(x => { if (!st[x]) dfs(x); });
      const rank = Object.fromEntries(items.map(x => [x, 0]));
      for (let it = 0; it < items.length; it++) dag.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) rank[b] = rank[a] + 1; });
      const cols = [], pos = {}; let c0 = 0, h = 0;
      items.forEach(x => (cols[rank[x]] ||= []).push(x));
      cols.forEach(list => { let r0 = 0, w = 0;
        list.sort((a, b) => (sink(a) - sink(b)) || (first(a) - first(b))).forEach(x => { const sz = size[x];
          Object.entries(sz.pos).forEach(([id, [c, r]]) => { pos[id] = [c0 + c, r0 + r]; }); r0 += sz.h; w = Math.max(w, sz.w); });
        c0 += w; h = Math.max(h, r0); });
      return { w: c0, h, pos };
    };
    return block(null).pos;
  }
  const autoPos = vid => ((V[vid] || {}).containers || []).length ? blockPos(vid) : flowPos(vid);
  function flowPos(vid) {
    const v = V[vid], lp = loopsOf(v), fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    // cards with no line go in rows of their own under the view (#46), as wide as its columns; they stacked with the sources
    const all = (v.nodeIds || []).filter(i => N[i]), lined = new Set(lp.edges.filter(e => e.from !== e.to).flatMap(e => [e.from, e.to]));
    const loose = lined.size ? all.filter(i => !lined.has(i)) : [], ids = all.filter(i => !loose.includes(i));
    const rank = {}; ids.forEach(i => { rank[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (rank[e.to] < rank[e.from] + 1) rank[e.to] = rank[e.from] + 1; });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id || e.from === id); return k < 0 ? 999 : k; };
    const sink = i => isState(i) && !fwd.some(e => e.from === i); // state that leads nowhere sits along the bottom
    const cols = {}; ids.forEach(i => (cols[rank[i]] ||= []).push(i));
    const pos = {};
    const height = Math.max(1, ...Object.values(cols).map(c => c.filter(i => !sink(i)).length));
    Object.entries(cols).forEach(([c, list]) => {
      const main = list.filter(i => !sink(i)).sort((a, b) => seen(a) - seen(b)), st = list.filter(sink).sort((a, b) => seen(a) - seen(b));
      main.forEach((i, r) => { pos[i] = [+c, r]; });
      st.forEach((i, r) => { pos[i] = [+c, height + r]; }); // state along the bottom, never above the flow
    });
    const per = Math.max(2, Object.keys(cols).length), under = Math.max(...Object.values(pos).map(p => p[1])) + 1;
    loose.forEach((i, k) => { pos[i] = [k % per, under + Math.floor(k / per)]; });
    return pos;
  }

  function buildView(vid, opts = {}) {
    const g = buildGeo(vid), v = V[vid];
    return { g, markup: svgOf(g, { title: v.title, subject: subjectOf(v), icons: D.icons, ...opts }) };
  }
  const layoutCache = {};
  // the cards a card opens: its inner view's, else the count the host gives for one it has not loaded (opensCount)
  const kidCount = (nid, vid) => { const c = childOf(nid, vid), k = c && c !== vid ? (V[c].nodeIds || []).length : 0, n = +nodeIn(nid, vid).opensCount;
    return k || (opensOf(nid, vid) && n > 0 ? Math.floor(n) : 0); };
  // a line's kind: the first one its edges name (#45); else a hook's line is a guard and a board's is state; else, only where
  // a legend says what the colours mean (the standalone page, or a view's kindsFromLabels), a guess from the label's words
  const wireKind = (e, words) => { const t = N[e.to] || {}, f = N[e.from] || {}, l = String(e.label || '');
    const named = (e.all || [e]).map(x => x.kind).find(k => WIRES.some(w => w[0] === k)); if (named) return named;
    if (f.kind === 'hook') return 'guard';
    if (t.kind === 'board' || f.kind === 'board' || words && /\b(reads?|writes? config|saves?|records?|appends?)\b/i.test(l)) return 'state';
    if (t.kind === 'hook' || words && /\b(trigger|fires|suggests?|offers?|requires|wires)/i.test(l)) return 'triggers';
    if (words && /\b(feeds?|hands? off|routes?|passes|returns|bounces|then)\b/i.test(l)) return 'feeds';
    return 'calls'; };
  function prepEdges(vid, edges, backKeys) {
    const par = {}; // parallel edges between one pair read as one edge listing every relation
    const merged = edges.filter(e => { const k = e.from + '>' + e.to + ((V[vid] || {}).keepPairs ? '#' + e.id : ''), m = par[k]; if (!m) { par[k] = e; e.all = [e]; return true; } m.all.push(e); return false; })
      .map(e => e.all.length < 2 ? e : { ...e, label: (e.label || '') + ' +' + (e.all.length - 1), when: e.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n') });
    const out = merged.map(e => ({ ...e, back: !(V[vid] || {}).keepPairs && backKeys && backKeys.has(e.from + '>' + e.to) }));
    const pair = {}; // A→B plus B→A reads as one two-way edge
    return out.filter(e => { const r = !(V[vid] || {}).keepPairs && pair[e.to + '>' + e.from]; if (r) { r.both = true; r.back = false; r.all = [...(r.all || [r]), ...(e.all || [e])]; if (e.label && e.label !== r.label) r.label = (r.label ? r.label + ' / ' : '') + e.label; if (e.when) r.when = [r.when, e.when].filter(Boolean).join(' · '); return false; } pair[e.from + '>' + e.to] = e; return true; })
      .map(e => { const all = e.all || [e], subs = [...new Set(all.map(x => x.sublabel).filter(x => x != null && x !== '').map(String))];
        return { ...e, wk: wireKind(e, opts.kinds || (V[vid] || {}).kindsFromLabels), weight: Math.max(...all.map(x => [2, 3].includes(+x.weight) ? +x.weight : 1)), sublabel: subs.join(' / ') || undefined }; });
  }
  const condTag = l => { const m = /^(?:routes|on-ramp:?)\s+(\S+)$/i.exec(String(l || '').trim()); return m ? m[1] : null; }; // "routes bug" → a "bug" tag
  // quick: a candidate the layout searches below score and may drop, laid out once, as it was before 0.6.0 (no room for lines
  // with no route, no way round the cards for them, no warning)
  function buildGeo(vid, override, repair = (V[vid] || {}).repair !== false, quick = false) { // a view's repair: false turns port repair off
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]);
    const edges = viewEdges(v).map(e => ({ ...e }));
    if (v.render === 'sequence') edges.forEach((e, i) => { e.step = i + 1; });
    const P = planCache[vid] || { flow: true, backKeys: loopsOf(v).keys, steps: {} };
    if (!override && P.hub) return hubGeo(vid, P, edges, repair, quick);
    const pos = override || (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid)));
    const mainSteps = v.mainSteps || v.render === 'process';
    const stepIds = v.stepIds || ids;
    const dg = { nodeH: mainSteps ? 82 : v.subAndChips ? 80 : 64, subAndChips: !!v.subAndChips, mainSteps, containers: v.containers, nodes: ids.map(i => { const n = nodeIn(i, vid), step = mainSteps && stepIds.includes(i); return { ...n, sub: n.sub || n.sublabel, emphasis: !!step || !!n.emphasis, step: step ? stepIds.indexOf(i) + 1 : null, verbs: step ? [] : n.verbs, kids: kidCount(i, vid), opens: !!opensOf(i, vid), col: (pos[i] || [0, 0])[0], row: (pos[i] || [0, 0])[1] }; }),
      edges: prepEdges(vid, edges, P.backKeys) };
    dg.authors = D.authors; dg.repair = repair; dg.intake = v.intake; dg.tour = v.tour; dg.gap = v.gap; dg.rgap = v.rgap; dg.quick = quick;
    return layoutGraph(dg, true);
  }
  function hubGeo(vid, P, edges, repair, quick) {
    const NH = V[vid].subAndChips ? 80 : 64, CG = 108, RG = 44, pitch = NH + RG, hub = P.hub;
    const all = P.lanes.flatMap(l => l.ids).concat(hub);
    const widths = Object.fromEntries(all.map(i => [i, mapNodeW(nodeIn(i, vid))]));
    const nodeW = widths[hub];
    const stepTxt = id => { const s = (P.steps || {})[id] || []; return s.length > 2 ? s[0] + '+' : s.join('·'); };
    const nodesOut = [{ ...nodeIn(hub, vid), sub: nodeIn(hub, vid).sub || nodeIn(hub, vid).sublabel, kids: kidCount(hub, vid), opens: !!opensOf(hub, vid), ax: 0, ay: 0, w: nodeW, h: NH }];
    const lanes = [], blocks = [], spine = [];
    let x = nodeW + CG, maxRows = 1;
    const rowAt = {};
    P.lanes.forEach((L, li) => {
      const x0 = x; spine[li] = x0 - CG + 28;
      const SUBG = 54; // columns inside a lane carry no branch labels, so they sit closer
      L.cols.forEach((col, j) => {
        const colW = Math.max(...col.map(id => widths[id]));
        const taken = new Set();
        col.forEach((id, r) => { // a follow-on part lines up with the part that leads to it
          let row = r;
          if (j > 0) { const src = edges.find(e => e.to === id && rowAt[e.from] != null && P.lanes[li].ids.includes(e.from)); row = src ? rowAt[src.from] : r; while (taken.has(row)) row++; }
          taken.add(row); rowAt[id] = row; maxRows = Math.max(maxRows, row + 1);
          nodesOut.push({ ...nodeIn(id, vid), sub: nodeIn(id, vid).sub || nodeIn(id, vid).sublabel, kids: kidCount(id, vid), opens: !!opensOf(id, vid), ax: x, ay: row * pitch, w: widths[id], h: NH, lane: li, step: stepTxt(id) });
        });
        x += colW + (j < L.cols.length - 1 ? SUBG : CG);
      });
      const right = x - CG + 16;
      const lx = P.boxed ? x0 - CG + 40 : x0 - 12, lw = P.boxed ? right - lx : right - 4 - lx;
      lanes.push({ title: L.title, ids: L.ids, x: lx, y: -62, w: lw, h: 0, gap: 24, bare: !P.boxed });
      const hx = P.boxed ? lx : x0 - 12;
      blocks.push({ x: hx + 12, y: -52, w: Math.min(lw - 24, 34 + sansW(L.title, 11, .95) + 8 + textW('00 parts', 11)), h: 22, title: L.title });
      if (P.boxed && li < P.lanes.length - 1) blocks.push({ x: lx + lw + 4, y: -48, w: 16, h: 18, title: L.title + ' → next' });
    });
    lanes.forEach(l => { l.h = maxRows * pitch - RG + 30 + 62; });
    // the comb: trunk from the hub, a spine per lane, a branch into each callee with its label at the end
    const yh = NH / 2, yt = -24, hubR = nodeW, byIdLocal = Object.fromEntries(nodesOut.map(n => [n.id, n]));
    const comb = [], others = [];
    const prepared = prepEdges(vid, edges.filter(e => e.from !== hub || P.branch.has(e.to)), P.backKeys);
    prepared.forEach(e => {
      if (e.from !== hub) return others.push(e);
      const c = byIdLocal[e.to]; if (!c) return;
      const li = c.lane, xs = spine[li], yc = c.ay + NH / 2;
      let pts = li === 0 ? [[hubR, yh], [xs, yh], [xs, yc], [c.ax, yc]] : [[hubR, yh], [spine[0], yh], [spine[0], yt], [xs, yt], [xs, yc], [c.ax, yc]];
      pts = pts.filter((p, k) => !k || p[0] !== pts[k - 1][0] || p[1] !== pts[k - 1][1]);
      pts = pts.filter((p, k) => k === 0 || k === pts.length - 1 || !((pts[k - 1][0] === p[0] && p[0] === pts[k + 1][0]) || (pts[k - 1][1] === p[1] && p[1] === pts[k + 1][1])));
      const tag = condTag(e.label), avail = c.ax - 26 - (xs + 10);
      const text = avail >= 44 ? fit(tag || e.label || '', 10.5, Math.max(30, avail - 20) / .92) : '', sub = text && e.sublabel ? fit(e.sublabel, 9.5, Math.max(30, avail - 20) / .92) : '';
      const w = Math.min(avail, pillW(text, sub)), h = sub ? 32 : 20;
      e.fixed = pts; e.lbl = text ? { x: c.ax - 26 - w, y: yc - h / 2, w, h, text, ...(sub ? { sub } : {}), step: null, tag: !!tag } : null;
      comb.push(e);
    });
    return layoutGraph({ nodeH: NH, subAndChips: !!V[vid].subAndChips, abs: true, nodes: nodesOut, edges: [...comb, ...others], lanes, blocks, laneGap: 24, repair, hub, tour: V[vid].tour, authors: D.authors, quick }, true);
  }
  /* crossing-minimising local search over rows and sides; `visual.py render` bakes the result into the page */
  function scoreGeo(g) {
    const bad = routeAudit(g, '').length, len = g.edges.reduce((a, e) => a + e.pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - e.pts[i][0]) + Math.abs(p[1] - e.pts[i][1]), 0), 0);
    const bends = g.edges.reduce((a, e) => a + e.pts.length, 0), drop = g.edges.filter(e => e.label && !e.lbl).length;
    return bad * 1000 + ((g.stats.cross || 0) + (g.stats.fallback || 0)) * 150 + drop * 40 + len / 15 + bends * 12 + g.bounds.w * g.bounds.h / 4e5;
  }
  function optimize(vid, budget = 160) {
    budget = Math.max(budget, Math.min(400, 20 * (V[vid].nodeIds || []).length));
    const t0 = performance.now(); let wall = 4000; // per-view time box, extended while problems remain
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]);
    let pos = JSON.parse(JSON.stringify(autoPos(vid)));
    const boxed = (v.containers || []).length, homeOf = i => ((v.containers || []).filter(c => (c.nodeIds || []).includes(i)).pop() || {}).id; // blocks stay whole
    const lined = new Set(viewEdges(v).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), loose = i => !boxed && lined.size && !lined.has(i);
    let best = scoreGeo(buildGeo(vid, pos, false, true)), evals = 1;
    const hub = subjectOf(v), hubCol = hub && pos[hub] ? pos[hub][0] : null;
    const tryPos = cand => { evals++; const s = scoreGeo(buildGeo(vid, cand, false, true)); if (s < best - 0.5) { best = s; pos = cand; return true; } return false; };
    let improved = true;
    while (improved && evals < budget * (best >= 1000 ? 2.5 : 1) && performance.now() - t0 < (best >= 1000 ? 12000 : wall)) {
      improved = false;
      for (const a of ids) {
        if (evals >= budget * (best >= 1000 ? 2.5 : 1) || performance.now() - t0 > (best >= 1000 ? 12000 : wall)) break;
        if (loose(a)) continue; // the row of cards with no line (#46) routes nothing
        const [ca, ra] = pos[a];
        const moves = [];
        // columns are the reading order, so only the order inside a column may change
        const band = i => isState(i) && !viewEdges(v).some(e => e.from === i);
        const stateFloor = () => Math.max(-1, ...ids.filter(i => !band(i) && !loose(i)).map(i => pos[i][1]));
        ids.forEach(b => { if (b !== a && !loose(b) && pos[b][0] === ca && band(a) === band(b) && (!boxed || homeOf(a) === homeOf(b))) moves.push(['swap', b]); });
        if (!boxed) moves.push(['row', -1], ['row', 1]);
        for (const [kind, arg] of moves) {
          if (evals >= budget) break;
          const c = JSON.parse(JSON.stringify(pos));
          if (kind === 'swap') { if (a === hub) continue; const t2 = c[a]; c[a] = c[arg]; c[arg] = t2; }
          else if (kind === 'col') { const nc = ca + arg; let r = ra; while (ids.some(b => c[b][0] === nc && c[b][1] === r)) r++; c[a] = [nc, r]; }
          else if (kind === 'row') {
            let r = ra + arg;
            if (band(a) && r <= stateFloor()) r = stateFloor() + 1;
            while (ids.some(b => c[b][0] === ca && c[b][1] === r)) r += arg > 0 ? 1 : -1;
            if (r < 0 || (band(a) && r <= stateFloor())) continue;
            c[a][1] = r;
          }
          else { const nc = 2 * hubCol - ca; const occ = ids.find(b => c[b][0] === nc && c[b][1] === ra); if (occ) c[occ][0] = ca; c[a][0] = nc; }
          if (Math.min(...ids.map(i => c[i][0])) < 0) { const m = Math.min(...ids.map(i => c[i][0])); ids.forEach(i => { c[i][0] -= m; }); }
          if (tryPos(c)) { improved = true; break; }
        }
      }
    }
    return { pos, score: best, evals };
  }
  // what a view's picture is drawn from: an update keeps the layout of every view whose key did not change
  const viewKey = vid => {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), ns = ids.map(i => nodeIn(i, vid));
    const icons = [...new Set(ns.map(n => n.icon).filter(Boolean))].map(k => (D.icons || {})[k]), who = [...new Set(ns.map(n => n.author).filter(Boolean))].map(k => (D.authors || {})[k]);
    return JSON.stringify([v, ns, viewEdges(v), ids.map(i => [kidCount(i, vid), opensOf(i, vid)]), icons, who]);
  };
  const geoCache = {};
  return { D, views, nodes, N, V, rootId, nodeIn, childOf, opensOf, subjectOf, viewsWith, kidsOf, chain, viewEdges, isState, planOf: withM(planOf), planCache,
    layoutCache, geoCache, buildGeo: withM(buildGeo), buildView: withM(buildView), optimize: withM(optimize), flowPos, kidCount, viewKey };
}

const edgeRefIds = e => [...new Set((e.all || [e]).map(x => x._id).filter(Boolean))];

/* layout(model, viewId): one view's geometry, as the canvas draws it. No DOM. */
export function layout(model, viewId, options = {}) {
  const ctx = mapContext(model, { measure: options.measure });
  if (!ctx.V[viewId]) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  ctx.planOf(viewId);
  const g = ctx.buildGeo(viewId, undefined, options.repair);
  g.edges.forEach(e => { e.ids = edgeRefIds(e); });
  return g;
}

let INSTANT = false; // the page's own hooks (#check, #still, #shot) draw without animation
const reducedMotion = () => INSTANT || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
let SHEET = null;
const sheet = () => { if (!SHEET) { SHEET = new CSSStyleSheet(); SHEET.replaceSync(STYLES); } return SHEET; };
const INNER = Symbol('umlimator.inner'); // what mountPage needs from render() beyond the public handle

/* render(container, model, options) -> handle: the canvas for one view at a time, with drill-down. */
/* an SVG file drawn onto a canvas: a PNG Blob, or null when there is nothing to draw */
async function pngOf(file) {
  if (!file) return null;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(file); await img.decode();
  const size = k => Math.ceil(+(file.match(new RegExp('^<svg[^>]*?\\s' + k + '="([\\d.]+)"')) || [])[1] || 0); // the file's own size, not the rounded one
  const c = document.createElement('canvas'); c.width = size('width') || img.naturalWidth; c.height = size('height') || img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

export function render(container, model, options = {}) {
  const P = options._page || {}; // the standalone page's hooks: status line, overlay insets, still and reader drawing
  if (P.instant) INSTANT = true;
  const OPS = ['add', 'rename', 'move', 'delete', 'reorder'], ed = options.editable;
  const E = ed === true ? Object.fromEntries(OPS.map(o => [o, true])) : ed && typeof ed === 'object' ? Object.fromEntries(OPS.map(o => [o, !!ed[o]])) : null;
  const can = op => !!(E && E[op]);
  const host = document.createElement('div');
  host.className = 'umlimator'; host.style.cssText = 'display:block;position:relative;width:100%;height:100%;min-height:0';
  container.appendChild(host);
  // text is measured in the host's font (--um-sans); measure: false keeps the font-independent estimate
  const own = typeof options.measure === 'function' ? options.measure : null;
  let measure = options.measure === false ? null : own || hostMeasure(host), current = model;
  let ctx = mapContext(model, { measure, kinds: !!P.kinds }); // kinds: the standalone page guesses line kinds from label words, for its legend
  const root = host.attachShadow({ mode: 'open', delegatesFocus: true }); // host.focus() lands in the map (on the selected card)
  root.adoptedStyleSheets = [sheet()];
  root.innerHTML = `<div class="um-live" role="status" aria-live="polite"></div><div class="stage" tabindex="-1">
      <div class="mctl">${options.minimap ? '<div class="minimap" title="Overview — click or drag to move"></div>' : ''}${options.controls === false ? '' : `
        <div class="ctl">
          <button data-z="up" title="Up one level (Esc)" aria-label="Up one level">↑</button><span class="sep"></span>
          <button data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button data-z="fit" class="pct" title="Fit to screen (0)">100%</button><button data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button><span class="sep"></span>
          <button data-z="one" title="Actual size (1)">1:1</button><button data-z="flow" title="Animate flow direction (F)" aria-label="Animate flow">≋</button>${E && E.add ? '<span class="sep"></span><button data-z="add" title="Add a card (N, or Alt + double-click)" aria-label="Add a card">＋</button>' : ''}<span class="depth" title="Reading depth follows zoom">READ</span>
        </div>`}</div></div>`;
  const stage = root.querySelector('.stage'), q = s => root.querySelector(s);
  const subs = {};
  const emit = (type, e) => { const f = (options.on || {})[type]; if (f) f(e); (subs[type] || []).slice().forEach(fn => fn(e)); };
  let cam = null, geo = null, svg = null, cur = null, sel = null, more = [], busy = false, paused = false, dead = false;
  const timers = new Set(), later = (f, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) f(); }, ms); timers.add(t); return t; };
  const sleep = ms => new Promise(r => later(r, reducedMotion() ? 0 : ms));
  const status = t => P.status && P.status(t);
  const wide = P.wide || (() => (cam ? cam.size()[0] : stage.clientWidth) > 820);

  const upOf = () => (P.upTarget ? P.upTarget() : (ctx.V[cur] || {}).parent) || null;
  const nodeRef = id => ({ type: 'node', id, view: cur });
  const picked = () => sel ? [...more.map(nodeRef), sel] : []; // every selected thing, the latest last (more: other selected cards)
  const say = t => { const l = root.querySelector('.um-live'); if (l) l.textContent = t; };
  const nameOf = id => ctx.nodeIn(id, cur).label || ((geo.families || []).find(f => f.id === id) || {}).label || id;
  const emitSel = () => {
    say(!sel ? 'Nothing selected' : sel.type === 'node' ? nameOf(sel.id) + (more.length ? `, ${more.length + 1} cards selected` : ', selected')
      : sel.type === 'edge' ? (e => e ? `Line from ${nameOf(e.from)} to ${nameOf(e.to)}, selected` : 'Line selected')(geo.edges[edgeIndex(sel)]) : `Box ${(svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"] .family-title`) || {}).textContent || sel.id}, selected`);
    emit('select', { target: sel, targets: picked() });
  };
  const edgeRef = e => ({ type: 'edge', ids: edgeRefIds(e), view: cur });
  const edgeIndex = ref => geo.edges.findIndex(e => { const ids = edgeRefIds(e); return ids.length === ref.ids.length && ids.every((x, i) => x === ref.ids[i]); });
  const exists = ref => !ref ? true : ref.type === 'node' ? !!geo.byId[ref.id] : ref.type === 'edge' ? edgeIndex(ref) >= 0
    : ref.type === 'container' ? (geo.families || []).some(f => f.id === ref.id) : false;

  function mount(vid) {
    cur = vid; ctx.planOf(vid);
    stage.querySelectorAll('svg.map-svg, .empty-view').forEach(s => s.remove());
    const v = ctx.V[vid], empty = !(v.nodeIds || []).some(i => ctx.N[i]);
    if (empty) { // a view with nothing in it gets a friendly card, not a blank canvas
      geo = { nodes: [], edges: [], groups: [], lanes: [], families: [], byId: {}, stats: {}, bounds: { x: 0, y: 0, w: 400, h: 300 } };
      stage.insertAdjacentHTML('afterbegin', '<svg class="map-svg" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"></svg>');
      const p = v.parent;
      stage.insertAdjacentHTML('beforeend', `<div class="empty-view"><div class="ico">◌</div><h4>Nothing here yet</h4><p>This view has no nodes yet.</p>${p ? `<button class="btn" data-v="${esc(p)}">← Back to ${esc(String(ctx.V[p].title || p).split(' · ')[0])}</button>` : ''}</div>`);
    } else {
      const c = ctx.geoCache[vid] ||= ctx.buildView(vid, { tour: P.tour !== false, openHint: P.openHint !== false });
      stage.insertAdjacentHTML('afterbegin', c.markup); geo = c.g;
    }
    svg = stage.querySelector('svg'); svg.classList.add('map-svg'); if (paused) svg.pauseAnimations();
    if (!cam) cam = new Camera(stage, svg, { wheel: 'zoom', maxFit: 1.15, max: 4, mapDepth: 0.3, onChange: onCam, skip: e => !!((can('move') || can('reorder') || can('add')) && e.target.closest && e.target.closest('.node, .um-handle')), inset: () => clearOf([].concat(P.inset ? P.inset() : { t: 16, r: 16, b: 16, l: 16 })) });
    cam.setSvg(svg, geo.bounds);
    const ub = q('[data-z="up"]'); if (ub) ub.disabled = !upOf();
    if (options.minimap) buildMini();
    if (!geo.hub && geo.nodes.length && geo.nodes.every(n => Number.isFinite(n.col) && Number.isFinite(n.row))) placed[vid] = Object.fromEntries(geo.nodes.map(n => [n.id, [n.col, n.row]]));
    const had = sel; sel = null; tabKeys(); paint();
    more = [];
    if (had) emitSel();
    if (P.onMount) P.onMount(inner);
  }

  /* at fit, the zoom controls and the minimap keep off the cards (#50): when a card would sit under one of them, the fit
     also tries room for them at the bottom and at the right, and keeps whichever leaves the map larger */
  let clear = null; // the last answer, for one view, size and set of insets: the camera asks on every frame of a pan or zoom
  function clearOf(base) {
    if (!cam || !geo) return base;
    const [W, H] = cam.size(), key = JSON.stringify([W, H, base]); if (clear && clear.geo === geo && clear.key === key) return clear.sets;
    const boxes = [...stage.querySelectorAll('.ctl, .minimap')].map(x => x.getBoundingClientRect()).filter(r => r.width && r.height);
    let sets = base; // none shown, or no layout (a test DOM): as before
    if (boxes.length) {
      const S = stage.getBoundingClientRect(), top = Math.min(...boxes.map(r => r.top)) - S.top - 8, left = Math.min(...boxes.map(r => r.left)) - S.left - 8;
      const f = cam.fitState(0.94, base), at = (x, y) => [(x - f.cx) * f.k + W / 2 + S.left, (y - f.cy) * f.k + H / 2 + S.top];
      const covered = geo.nodes.some(n => { const [x0, y0] = at(n.x, n.y), [x1, y1] = at(n.x + n.w, n.y + n.h);
        return boxes.some(r => x0 < r.right + 8 && r.left - 8 < x1 && y0 < r.bottom + 8 && r.top - 8 < y1); });
      if (covered) sets = base.flatMap(I => [{ ...I, b: Math.max(I.b, H - top) }, { ...I, r: Math.max(I.r, W - left) }]);
    }
    clear = { geo, key, sets }; return sets;
  }
  function onCam(c) {
    const pct = q('.pct'), depth = q('.depth');
    if (pct) pct.textContent = Math.round(c.s.k * 100) + '%';
    if (depth) depth.textContent = (stage.dataset.depth || 'read').toUpperCase();
    if (mini.vp) {
      const [W, H] = c.size(), k = c.s.k;
      mini.vp.setAttribute('x', c.s.cx - W / (2 * k)); mini.vp.setAttribute('y', c.s.cy - H / (2 * k));
      mini.vp.setAttribute('width', W / k); mini.vp.setAttribute('height', H / k);
      const b = geo.bounds; q('.minimap').classList.toggle('all', W / k >= b.w && H / k >= b.h);
    }
  }

  /* minimap */
  const mini = {};
  function buildMini() {
    const b = geo.bounds, el = q('.minimap');
    const ln = (geo.lanes || []).map(l => `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" fill="none" stroke="var(--um-border-2)" stroke-width="${Math.max(2, b.w / 300)}"/>`).join('');
    const r = geo.nodes.map(n => `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="var(--um-${KIND[n.k][0]})" opacity="${n.k === 'm-public' ? .95 : .55}"/>`).join('');
    const l = geo.edges.map(e => `<polyline points="${e.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--um-arrow)" stroke-width="${Math.max(2, b.w / 260)}" opacity=".6"/>`).join('');
    el.innerHTML = `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">${ln}${l}${r}<rect class="vp" rx="${b.w / 80}"/></svg>`;
    mini.svg = el.firstChild; mini.vp = el.querySelector('.vp');
    mini.vp.setAttribute('stroke-width', Math.max(2, b.w / 160));
    cam && onCam(cam);
  }
  if (options.minimap) {
    const el = q('.minimap'); let down = false;
    const go2 = (e, anim) => { const p = mini.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const w = p.matrixTransform(mini.svg.getScreenCTM().inverse()); cam.touched = true; anim ? cam.animate({ cx: w.x, cy: w.y }, 240) : cam.set({ cx: w.x, cy: w.y }); };
    el.addEventListener('pointerdown', e => { down = true; el.setPointerCapture(e.pointerId); go2(e, true); e.stopPropagation(); });
    el.addEventListener('pointermove', e => { if (down) go2(e, false); });
    el.addEventListener('pointerup', () => { down = false; });
  }

  /* a card's or box's tab is a button only for a host that listens for click (#43): it can act on one. A card's tab gets a
     focus target right after the card, outside it (a button inside the card's button is invalid); a box's tab is one itself. */
  const listening = () => !!((options.on || {}).click || (subs.click || []).length);
  let keysFor = null; // the picture and state the tabs were last set up for: a second listener changes nothing, focus stays
  function tabKeys() {
    const on = listening(); if (!svg || (keysFor && keysFor[0] === svg && keysFor[1] === on)) return; keysFor = [svg, on];
    svg.querySelectorAll('.tab-key').forEach(k => k.remove());
    const cards = Object.fromEntries([...svg.querySelectorAll('.node')].map(g => [g.dataset.id, g]));
    svg.querySelectorAll('.family [data-badge]').forEach(t => { if (on) { t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button'); } else { t.removeAttribute('tabindex'); t.removeAttribute('role'); } });
    if (on && geo.map) geo.nodes.forEach(n => { let tx = n.x + 12, html = '';
      mapTabs(n).forEach(t => { if (t.badge != null) html += `<g class="um-key tab-key" data-node="${esc(n.id)}" data-badge="${t.badge}" tabindex="0" role="button" aria-label="${esc(t.text)}"><rect x="${tx - 2}" y="${n.y - 10}" width="${t.w + 4}" height="19" rx="6" class="key-ring"/></g>`; tx += t.w + 4; });
      if (html && cards[n.id]) cards[n.id].insertAdjacentHTML('afterend', html); });
  }
  const badgeRef = (node, box, i) => { const b = badgesOf(box != null ? boxDef(box) : ctx.nodeIn(node, cur))[i];
    return { type: 'badge', ...(box != null ? { container: box } : { node }), index: i, value: b ? b.text : '', view: cur }; };
  function activate(ref, ev) { // a click on something, or Enter on a tab: the host may take it (preventDefault), else it is selected
    sub = ref && (ref.type === 'chip' || ref.type === 'badge') ? ref : null;
    let keep = false; emit('click', { target: ref, event: ev, preventDefault() { keep = true; } });
    return !keep;
  }

  /* selection: the selected node, its neighbours and wires stay lit; the rest dims */
  function paint() {
    if (!svg) return;
    svg.querySelectorAll('.um-handle').forEach(h => h.remove());
    if (can('add') && sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id];
      svg.insertAdjacentHTML('beforeend', `<g class="um-edit um-handle" data-from="${esc(n.id)}"><title>Drag to another card to add a line</title><circle cx="${n.x + n.w + 12}" cy="${n.y + n.h / 2}" r="6"/></g>`); }
    svg.querySelectorAll('.sel,.nb,.hot').forEach(g => g.classList.remove('sel', 'nb', 'hot')); stage.classList.remove('focusing');
    svg.querySelectorAll('.node').forEach(g => g.setAttribute('aria-pressed', !!sel && sel.type === 'node' && (g.dataset.id === sel.id || more.includes(g.dataset.id))));
    const li = sel && sel.type === 'edge' ? edgeIndex(sel) : -1; svg.querySelectorAll('.line-key').forEach(k => k.setAttribute('aria-pressed', +k.dataset.i === li));
    if (!sel) return;
    if (sel.type === 'node') {
      const nid = sel.id, ups = new Set(), downs = new Set();
      geo.edges.forEach(e => { if (e.to === nid) ups.add(e.from); if (e.from === nid) downs.add(e.to); });
      svg.querySelectorAll('.node').forEach(g => { const id = g.dataset.id; g.classList.toggle('sel', id === nid || more.includes(id)); g.classList.toggle('nb', ups.has(id) || downs.has(id)); });
      svg.querySelectorAll('.edge-g').forEach(g => g.classList.toggle('hot', g.dataset.from === nid || g.dataset.to === nid));
      svg.querySelectorAll('.e-lab').forEach(g => { const e = geo.edges[g.dataset.i]; g.classList.toggle('hot', e.from === nid || e.to === nid); });
      svg.querySelectorAll('.n-port').forEach(p => p.classList.toggle('hot', p.dataset.edges.split(',').some(i => geo.edges[i].from === nid || geo.edges[i].to === nid)));
      stage.classList.add('focusing');
    } else if (sel.type === 'edge') {
      const i = edgeIndex(sel), e = geo.edges[i];
      svg.querySelectorAll(`.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(g => g.classList.add('hot'));
      svg.querySelectorAll('.node').forEach(g => g.classList.toggle('nb', g.dataset.id === e.from || g.dataset.id === e.to));
      stage.classList.add('focusing');
    } else if (sel.type === 'container') {
      const f = svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"]`); if (f) f.classList.add('sel');
    }
  }
  function select(ref, o = {}) {
    if (ref && (ref.type === 'chip' || ref.type === 'badge')) ref = ref.container != null ? { type: 'container', id: ref.container } : nodeRef(ref.node); // a chip or badge: its card (box)
    if (ref && (!geo || !exists(ref))) return;
    const before = JSON.stringify(sel);
    const was = more.length; more = [];
    sel = ref ? { ...ref, view: cur } : null;
    paint();
    if (sel && sel.type === 'node' && o.reveal !== false) { const n = geo.byId[sel.id]; requestAnimationFrame(() => { if (!dead) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); }); }
    if (JSON.stringify(sel) !== before || o.again || was) emitSel();
  }

  /* keyboard: the nearest card in an arrow's direction, by distance along it plus twice the distance across it */
  function nearest(n, k) {
    const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k] || [0, 0], cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    let best = null, bs = Infinity;
    geo.nodes.forEach(m => { if (m.id === n.id) return; const ax = m.x + m.w / 2 - cx, ay = m.y + m.h / 2 - cy, along = ax * dx + ay * dy, across = Math.abs(ax * dy - ay * dx);
      if (along <= 0) return; const sc = along + 2 * across; if (sc < bs) { bs = sc; best = m; } });
    return best;
  }

  /* several cards: Shift (or Cmd / Ctrl) + click adds a card to the selection, or takes it out */
  function toggle(id) {
    if (id === sel.id) { if (!more.length) return select(null); sel = nodeRef(more.pop()); }
    else if (more.includes(id)) more = more.filter(x => x !== id);
    else { more.push(sel.id); sel = nodeRef(id); }
    paint(); emitSel();
  }

  /* navigation: zoom into the card that opens a view, out to the card a view came from */
  async function go(vid, how = {}) {
    if (!ctx.V[vid] || busy || dead) return;
    if (vid === cur) { if (how.select) select(nodeRef(how.select)); return; }
    busy = true;
    const prev = cur, via = how.via;
    let mode = 'jump';
    if (prev && ctx.chain(vid).includes(prev) || how.via) mode = 'in';
    else if (prev && ctx.chain(prev).includes(vid)) mode = 'out';
    if (P.onNavigate) P.onNavigate(vid, prev, mode);
    if (prev && !reducedMotion()) {
      if (mode === 'in' && via && geo.byId[via]) { const n = geo.byId[via]; await cam.animate(cam.zoomTo({ x: n.x, y: n.y, w: n.w, h: n.h }, 1.1), 420); }
      else await cam.animate({ k: cam.s.k * (mode === 'out' ? 0.6 : 1) }, mode === 'out' ? 260 : 1);
      stage.classList.add('fading'); await sleep(130);
    }
    if (dead) return;
    mount(vid);
    const fitS = startView();
    if (prev && !reducedMotion()) {
      if (mode === 'in') cam.set({ ...fitS, k: fitS.k * 0.55 });
      else if (mode === 'out') { const back = geo.nodes.find(n => ctx.childOf(n.id, cur) === prev); cam.set(back ? cam.zoomTo({ x: back.x, y: back.y, w: back.w, h: back.h }, 1.1) : { ...fitS, k: fitS.k * 1.6 }); }
      else cam.set(fitS);
      stage.classList.remove('fading');
      await cam.animate(fitS, mode === 'jump' ? 1 : 460);
    } else { cam.set(fitS); stage.classList.remove('fading'); }
    if (dead) return;
    cam.touched = false;
    if (mode === 'out') { const back = geo.nodes.find(n => ctx.childOf(n.id, cur) === prev); if (back) flash(back.id); }
    if (how.select) select(nodeRef(how.select), { reveal: true });
    busy = false;
    say('Showing ' + (ctx.V[cur].title || cur));
    emit('viewchange', { view: vid, from: prev });
  }
  /* where the camera starts: fit on a desk; on a phone a readable zoom from the top-left corner */
  function startView() {
    const f = cam.fitState();
    if (wide() || f.k >= 0.6) return f;
    const [W, H] = cam.size(), k = 0.6, b = geo.bounds;
    return { k, cx: b.x + (W / 2 - 12) / k, cy: b.y + (H / 2 - 56) / k };
  }
  function open(nid) { // a view the host has not loaded (#47): it can load it, update(), then setView(), or update() right here
    const c = ctx.opensOf(nid, cur);
    if (!c) return status('No inner view for this node');
    let stop = false;
    emit('open', { target: nodeRef(nid), view: c, preventDefault() { stop = true; } });
    if (!stop && ctx.V[c]) go(c, { via: nid });
  }
  const up = () => { const p = upOf(); if (p) go(p); else status('Already at the top'); };
  function flash(nid) { const g = svg.querySelector(`.node[data-id="${CSS.escape(nid)}"]`); if (!g) return; g.classList.add('flash'); later(() => g.classList.remove('flash'), 1400); }
  function setFlow(on) {
    stage.classList.toggle('flowing', on);
    const b = q('[data-z="flow"]'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    if (P.onFlow) P.onFlow(on);
  }
  function pause(on) { paused = on; stage.classList.toggle('paused', on); if (svg) on ? svg.pauseAnimations() : svg.unpauseAnimations(); }

  /* keys on the canvas; the page forwards the same keys when the focus is elsewhere */
  function key(e) {
    const k = e.key, g = e.target && e.target.closest && e.target.closest('.node');
    if (E && editKey(e)) return true;
    if (e.altKey) return false;
    const lk = e.target && e.target.closest && e.target.closest('.line-key'), tk = e.target && e.target.closest && e.target.closest('.tab-key, .family [data-badge]');
    if (k === 'Enter' && lk && geo.edges[+lk.dataset.i]) select(edgeRef(geo.edges[+lk.dataset.i]), { again: true }); // as a click on the line (#43)
    else if (k === 'Enter' && tk) { const fam = tk.closest('.family'), ref = badgeRef(tk.dataset.node, fam ? fam.dataset.family : null, +tk.dataset.badge); if (activate(ref, e)) select(ref); }
    else if (k === '+' || k === '=') cam.zoomAt(1.4, null, null, true);
    else if (k === '-' || k === '_') cam.zoomAt(1 / 1.4, null, null, true);
    else if (k === '0') cam.fit();
    else if (k === '1') cam.actual();
    else if (k === 'Enter' && (g || (sel && sel.type === 'node'))) { // a selected card opens its inner view; without one it is selected again, as a click does
      const id = g ? g.dataset.id : sel.id;
      if (sel && sel.type === 'node' && sel.id === id && ctx.opensOf(id, cur)) open(id); else select(nodeRef(id), { again: true }); }
    else if (k === 'Escape' || k === 'Backspace') { if (sel) select(null); else up(); }
    else if (k === 'f' || k === 'F') setFlow(!stage.classList.contains('flowing'));
    else if (k.startsWith('Arrow') && g && geo.byId[g.dataset.id]) { const to = nearest(geo.byId[g.dataset.id], k); if (!to) return false;
      const tg = svg.querySelector(`.node[data-id="${CSS.escape(to.id)}"]`); tg.focus({ preventScroll: true }); cam.reveal({ x: to.x, y: to.y, w: to.w, h: to.h }); }
    else if (k.startsWith('Arrow')) { const d = 80, m = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[k]; if (!m) return false; cam.pan(m[0], m[1], true); }
    else return false;
    return true;
  }


  /* ---------- editing: a gesture never changes the picture; it emits a `change` the host may apply (then update()) ----------
     Each event carries what the user meant and, apart from it, an optional hint: where the card was dropped. */
  let seq = 0, sub = null, drag = null, conn = null, selectNew = false, swallow = 0;
  const placed = {};  // per view: the slot every card had when last drawn (stable positions across updates; never in the model)
  const hints = {};   // per view: id -> [col, row] where the last move dropped a card, for the next update only
  const slotsH = {};  // per view: id -> [col, row] of a reordered column group (exact), for the next update only
  const addHints = []; // slots of adds not yet seen as new cards
  function change(c, exact) {
    const ev = { id: 'c' + Date.now().toString(36) + '-' + (++seq), view: cur, ...c };
    // only the latest gesture's hint waits for the host: an edit the host never answered leaves no trace
    [hints, slotsH].forEach(o => Object.keys(o).forEach(k => delete o[k])); addHints.length = 0;
    if (exact) slotsH[cur] = exact;
    else if (ev.hint && Number.isFinite(ev.hint.col)) {
      if (c.op === 'add' && c.kind === 'node') addHints.push([ev.hint.col, ev.hint.row]);
      else if (c.target && c.target.type === 'node') (hints[cur] ||= {})[c.target.id] = [ev.hint.col, ev.hint.row];
    }
    if (c.op === 'add' && c.kind === 'node') selectNew = true;
    emit('change', ev);
    return ev;
  }
  const worldOf = e => { const r = stage.getBoundingClientRect(); return cam.toWorld(e.clientX - r.left, e.clientY - r.top); };
  const area = f => f.w * f.h;
  const boxAt = (x, y) => (geo.families || []).filter(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => area(a) - area(b))[0] || null;
  const boxOf = id => (geo.families || []).filter(f => (f.nodeIds || []).includes(id)).sort((a, b) => area(a) - area(b))[0] || null;
  const gridView = () => !geo.hub && geo.nodes.length && geo.nodes.every(n => Number.isFinite(n.col) && Number.isFinite(n.row));
  function hintAt(x, y) { // a point in the view, and on a column view its column and row
    const h = { x: Math.round(x), y: Math.round(y) };
    if (!gridView()) return h;
    const cols = [...new Set(geo.nodes.filter(n => !n.aside).map(n => n.col))].sort((a, b) => a - b); // the row of cards with no line keeps off the columns
    const mid = c => { const ns = geo.nodes.filter(n => n.col === c && !n.aside); return ns.reduce((a, n) => a + n.x + n.w / 2, 0) / ns.length; };
    const first = cols[0], last = cols[cols.length - 1], step = cols.length > 1 ? (mid(last) - mid(first)) / (last - first) : 260;
    let col = first, best = Infinity; cols.forEach(c => { const d = Math.abs(mid(c) - x); if (d < best) { best = d; col = c; } });
    if (x > mid(last) + step / 2) col = last + Math.round((x - mid(last)) / step);
    else if (x < mid(first) - step / 2) col = Math.max(0, first - Math.round((mid(first) - x) / step));
    const a = geo.nodes[0], b = geo.nodes.find(n => n.row !== a.row), pitch = b ? (b.y - a.y) / (b.row - a.row) : 108;
    h.col = col; h.row = Math.max(0, Math.round((y - (a.y - a.row * pitch) - 32) / pitch));
    return h;
  }
  const siblings = n => { const b = boxOf(n.id); return geo.nodes.filter(m => m.col === n.col && !m.aside === !n.aside && boxOf(m.id) === b).sort((p, q) => p.y - q.y); };
  // a reorder rearranges the card's whole column group: the same slots, the card at its new place among them
  const reorderSlots = (n, i) => { const sib = siblings(n), rows = sib.map(m => m.row), order = sib.filter(m => m !== n); order.splice(i, 0, n);
    return Object.fromEntries(order.map((m, k) => [m.id, [n.col, rows[k]]])); };
  const boxDef = id => ((ctx.V[cur] || {}).containers || []).find(c => c && c.id === id) || {};
  const listOf = r => { if (r.container != null) return badgesOf(boxDef(r.container)); const n = ctx.nodeIn(r.node, cur); return r.type === 'badge' ? badgesOf(n) : n.verbs || []; };
  const ofSel = r => !!(r && sel && (sel.type === 'node' ? r.node === sel.id : sel.type === 'container' && r.container === sel.id)); // a chip or badge of the selection
  function editKey(e) {
    const k = e.key;
    if (e.altKey && can('reorder') && k.startsWith('Arrow')) {
      if (ofSel(sub) && (k === 'ArrowLeft' || k === 'ArrowRight')) { // a chip or badge in its list
        const i = sub.index + (k === 'ArrowRight' ? 1 : -1); if (i < 0 || i >= listOf(sub).length) return true;
        change({ op: 'reorder', target: sub, index: i }); return true; }
      if (sel && sel.type === 'node' && gridView() && (k === 'ArrowUp' || k === 'ArrowDown')) { // a card among its column
        const n = geo.byId[sel.id], sib = siblings(n), at = sib.indexOf(n), i = at + (k === 'ArrowDown' ? 1 : -1);
        if (i < 0 || i >= sib.length) return true;
        const o = sib[i]; change({ op: 'reorder', target: nodeRef(n.id), index: i, hint: { x: Math.round(o.x + o.w / 2), y: Math.round(o.y + o.h / 2), col: o.col, row: o.row } }, reorderSlots(n, i)); return true; }
      return false;
    }
    if (e.altKey) return false;
    if (k === 'F2' && sel && can('rename')) { rename(sel); return true; }
    if ((k === 'n' || k === 'N') && can('add')) { addAt(cam.s.cx, cam.s.cy); return true; }
    if (k === 'Delete' && can('delete') && sel && more.length) { picked().forEach(t => change({ op: 'delete', target: t })); return true; } // one event per card
    if (k === 'Delete' && can('delete') && sel) { change({ op: 'delete', target: ofSel(sub) ? sub : sel }); return true; }
    return false;
  }
  /* a text field over the canvas: names a new card, or renames a card, line or container */
  function editor(box, text, done) {
    root.querySelectorAll('.um-rename').forEach(x => x.remove());
    const k = cam.s.k, [W, H] = cam.size(), inp = document.createElement('input');
    inp.className = 'um-edit um-rename'; inp.value = text; inp.setAttribute('aria-label', text ? 'New name' : 'Name of the new card');
    Object.assign(inp.style, { left: (box.x - cam.s.cx) * k + W / 2 + 'px', top: (box.y - cam.s.cy) * k + H / 2 + 'px', width: Math.max(120, box.w * k) + 'px', height: Math.max(22, box.h * k) + 'px', fontSize: Math.max(11, 13 * k) + 'px' });
    stage.appendChild(inp); inp.focus(); inp.select();
    // once only: removing a focused field can fire blur (cancel) in the middle of a commit
    let closed = false;
    const finish = ok => { if (closed) return; closed = true; const v = inp.value.trim(); if (ok && v && v !== text) done(v); inp.remove(); stage.focus({ preventScroll: true }); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    inp.addEventListener('blur', () => finish(false));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    return inp;
  }
  function rename(ref) {
    if (!can('rename') || !ref) return;
    if (ref.type === 'node' && geo.byId[ref.id]) { const n = geo.byId[ref.id]; editor({ x: n.x + 50, y: n.y + n.h / 2 - 13, w: n.w - 58, h: 26 }, String(ctx.nodeIn(n.id, cur).label ?? n.label ?? ''), v => change({ op: 'rename', target: ref, label: v })); }
    else if (ref.type === 'edge') { const e = geo.edges[edgeIndex(ref)]; if (!e) return; const L = e.lbl, m = e.pts[Math.floor(e.pts.length / 2)];
      editor(L ? { x: L.x - 8, y: L.y - 2, w: L.w + 16, h: L.h + 4 } : { x: m[0] - 60, y: m[1] - 12, w: 120, h: 24 }, String((e.all || [e])[0].label || ''), v => change({ op: 'rename', target: ref, label: v })); }
    else if (ref.type === 'container') { const f = (geo.families || []).find(x => x.id === ref.id); if (!f) return; editor({ x: f.x + 8, y: f.y + 2, w: Math.min(f.w - 16, 220), h: 24 }, String(f.label || f.id), v => change({ op: 'rename', target: ref, label: v })); }
  }
  function addAt(x, y) {
    if (!can('add') || !geo) return;
    const hint = hintAt(x, y), box = boxAt(x, y);
    editor({ x: x - 80, y: y - 13, w: 160, h: 26 }, '', label => change({ op: 'add', kind: 'node', label, ...(box ? { container: box.id } : {}), hint }));
  }
  stage.addEventListener('dblclick', e => { if (!can('add') || !e.altKey || e.target.closest('.node, .ctl, .minimap')) return; e.preventDefault(); e.stopPropagation(); const [x, y] = worldOf(e); addAt(x, y); }, true);
  // the click a browser sends after a drag is not a click on the card; a new press ends that, or 400 ms
  stage.addEventListener('click', e => { if (swallow > performance.now()) { swallow = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  /* focus: put it on a card (default: the selected one), else on the canvas. Focus that reaches the canvas from outside
     and not by a press (host.focus(), as a dialog does when it gives focus back) goes on to the selected card. */
  let pressed = false;
  stage.addEventListener('pointerdown', () => { swallow = 0; pressed = true; }, true);
  ['pointerup', 'pointercancel'].forEach(t => stage.addEventListener(t, () => { pressed = false; }, true));
  function focusMap(ref = sel) {
    const line = ref && ref.type === 'edge' && svg && svg.querySelector(`.line-key[data-i="${edgeIndex(ref)}"]`); if (line) return line.focus({ preventScroll: true }); // a line (#43)
    const id = ref && (ref.type === 'node' ? ref.id : ref.node), g = id && svg && [...svg.querySelectorAll('.node')].find(x => x.dataset.id === id); // no CSS.escape: jsdom has none
    if (!g) return stage.focus({ preventScroll: true });
    g.focus({ preventScroll: true }); const n = geo.byId[id]; if (n) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h });
  }
  stage.addEventListener('focus', e => { if (!pressed && sel && (sel.type === 'node' || sel.type === 'edge') && !(e.relatedTarget && root.contains(e.relatedTarget))) focusMap(); });
  stage.addEventListener('focusin', e => { const t = e.target; if (pressed || !cam || !t.closest || !t.closest('.node, .um-key, .family [data-badge]') || typeof t.getBBox !== 'function') return;
    const b = t.getBBox(); cam.reveal({ x: b.x, y: b.y, w: b.width, h: b.height }); }); // Tab to something out of view brings it in
  /* dragging a card: into or out of a container (move), along its column (reorder), or to another spot (move + hint) */
  stage.addEventListener('pointerdown', e => {
    if (!E || e.button !== 0 || e.altKey || !geo) return;
    const hd = e.target.closest('.um-handle');
    if (hd && can('add')) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (_) {} conn = { from: hd.dataset.from, path: null }; return; }
    const g = e.target.closest('.node');
    if (g && geo.byId[g.dataset.id] && (can('move') || can('reorder'))) drag = { id: g.dataset.id, g, x0: e.clientX, y0: e.clientY, on: false, ghost: null, pid: e.pointerId };
  });
  stage.addEventListener('pointermove', e => {
    if (conn) {
      const n = geo.byId[conn.from], [x, y] = worldOf(e);
      if (!conn.path) { svg.insertAdjacentHTML('beforeend', '<path class="um-edit um-link"/>'); conn.path = svg.lastElementChild; }
      conn.path.setAttribute('d', `M ${n.x + n.w + 12} ${n.y + n.h / 2} L ${x} ${y}`);
      return;
    }
    if (!drag) return;
    const k = cam.s.k, dx = (e.clientX - drag.x0) / k, dy = (e.clientY - drag.y0) / k;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.on = true; try { stage.setPointerCapture(drag.pid); } catch (_) {} drag.ghost = drag.g.cloneNode(true); drag.ghost.classList.add('um-ghost'); drag.ghost.classList.remove('sel'); svg.appendChild(drag.ghost); }
    drag.ghost.setAttribute('transform', `translate(${dx} ${dy})`);
    const n = geo.byId[drag.id], into = boxAt(n.x + n.w / 2 + dx, n.y + n.h / 2 + dy);
    svg.querySelectorAll('.family.um-target').forEach(f => f.classList.remove('um-target'));
    if (into) { const f = svg.querySelector(`.family[data-family="${CSS.escape(into.id)}"]`); if (f) f.classList.add('um-target'); }
  });
  const endGesture = e => {
    if (conn) { const c = conn; conn = null; if (c.path) c.path.remove(); swallow = performance.now() + 400;
      const g = root.elementFromPoint(e.clientX, e.clientY), t = g && g.closest && g.closest('.node');
      if (t && t.dataset.id !== c.from && geo.byId[t.dataset.id]) change({ op: 'add', kind: 'edge', from: c.from, to: t.dataset.id });
      return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    swallow = performance.now() + 400;
    svg.querySelectorAll('.family.um-target').forEach(f => f.classList.remove('um-target'));
    const k = cam.s.k, dx = (e.clientX - d.x0) / k, dy = (e.clientY - d.y0) / k, n = geo.byId[d.id];
    const x = n.x + n.w / 2 + dx, y = n.y + n.h / 2 + dy, hint = hintAt(x, y), from = boxOf(n.id), into = boxAt(x, y);
    const fromId = from ? from.id : null, toId = into ? into.id : null;
    let ev = null;
    if (toId !== fromId && can('move')) ev = change({ op: 'move', target: nodeRef(n.id), to: toId, hint });
    else if (gridView() && hint.col === n.col && can('reorder')) {
      const sib = siblings(n), at = sib.indexOf(n), i = sib.filter(m => m !== n && m.y + m.h / 2 < y).length;
      if (i !== at) ev = change({ op: 'reorder', target: nodeRef(n.id), index: i, hint }, reorderSlots(n, i));
    }
    else if (can('move') && (!gridView() || hint.col !== n.col || hint.row !== n.row)) ev = change({ op: 'move', target: nodeRef(n.id), to: fromId, hint });
    if (ev) { d.ghost.classList.add('um-pending'); later(() => d.ghost.remove(), 3000); } // stays at the drop until the host's update, or 3 s
    else d.ghost.remove();
  };
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); if (conn && conn.path) conn.path.remove(); drag = conn = null; });
  /* the model to draw after an update: cards keep the slots they had (the host's own layout wins), a moved or added card
     takes its hint; kept in this handle only, never written to the host's model */
  function withPlaces(m) {
    if (options.stableLayout === false) return m;
    const out = structuredClone(m);
    (out.views || []).forEach(v => {
      const was = placed[v.id], hv = hints[v.id] || {}, ex = slotsH[v.id] || {}, adds = v.id === cur ? addHints.slice() : [];
      if (!was && !Object.keys(hv).length && !Object.keys(ex).length && !adds.length) return;
      const ids = (v.nodeIds || []).filter(id => typeof id === 'string'), mine = v.layout || {}, L = {}, taken = new Set(), key = p => p[0] + ',' + p[1];
      const put = (id, p) => { let [c, r] = p; while (taken.has(key([c, r]))) r++; L[id] = [c, r]; taken.add(key([c, r])); };
      ids.forEach(id => { if (Array.isArray(mine[id])) { L[id] = mine[id]; taken.add(key(mine[id])); } });    // the host's own layout
      ids.forEach(id => { if (!L[id] && ex[id]) put(id, ex[id]); });                                               // a reordered column group
      ids.filter(id => !L[id] && !hv[id] && was && was[id]).sort((a, b) => was[a][0] - was[b][0] || was[a][1] - was[b][1]).forEach(id => put(id, was[id])); // everyone stays
      ids.forEach(id => { if (!L[id] && hv[id]) put(id, hv[id]); });                                              // a moved card: its drop, or the nearest free slot
      ids.filter(id => !L[id] && !(was && was[id])).forEach(id => { if (adds.length) put(id, adds.shift()); });    // a new card likewise
      if (Object.keys(L).length) v.layout = L;
    });
    return out;
  }

  /* events: each clickable thing reports its reference */
  stage.addEventListener('click', e => {
    const t = e.target;
    const bv = t.closest('.empty-view [data-v]'); if (bv) return go(bv.dataset.v);
    if (t.closest('.ctl, .minimap')) return;
    const g = t.closest('.node'), chip = t.closest('[data-chip]'), badge = t.closest('[data-badge]'), eg = t.closest('.edge-g, .e-lab'), fam = t.closest('.family');
    if (g && t.closest('.open-hint')) { if (e.detail <= 1) open(g.dataset.id); return; } // the ⤢ badge opens (a double-click on it opens once)
    let ref = null;
    if (g && badge) ref = badgeRef(g.dataset.id, null, +badge.dataset.badge);
    else if (g && chip) { const i = +chip.dataset.chip, tx = g.querySelector(`text[data-chip="${i}"]`); ref = { type: 'chip', node: g.dataset.id, index: i, value: tx ? tx.textContent : '', view: cur }; }
    else if (g) ref = nodeRef(g.dataset.id);
    else if (eg && geo.edges[+eg.dataset.i]) ref = edgeRef(geo.edges[+eg.dataset.i]);
    else if (fam && badge) ref = badgeRef(null, fam.dataset.family, +badge.dataset.badge);
    else if (fam) ref = { type: 'container', id: fam.dataset.family, view: cur };
    sub = null;
    if (ref) {
      if (!activate(ref, e)) return; // the host took the click (a chip as a link, say): the selection stays as it was
      if (ref.type === 'node' && (e.shiftKey || e.metaKey || e.ctrlKey) && sel && sel.type === 'node') return toggle(ref.id); // several cards
      return select(ref, { again: ref.type === 'node' }); }
    select(null);
    if (P.onBackground) P.onBackground();
  });
  stage.addEventListener('dblclick', e => { const g = e.target.closest('.node'); if (!g) return; e.preventDefault(); if (e.target.closest('.open-hint')) return;
    if (can('rename') && sel && sel.type === 'node' && sel.id === g.dataset.id && e.target.closest('.n-label')) return rename(sel); // a selected card's name edits
    open(g.dataset.id); });
  stage.addEventListener('keydown', e => { if (e.defaultPrevented || e.metaKey || e.ctrlKey || (e.altKey && !E) || e.target.closest('input')) return; if (key(e)) { e.preventDefault(); e.stopPropagation(); } });
  stage.addEventListener('pointerover', e => { const g = e.target.closest('.node'); if (!g) return; svg.querySelectorAll('.edge-g').forEach(x => x.classList.toggle('hov', x.dataset.from === g.dataset.id || x.dataset.to === g.dataset.id)); });
  stage.addEventListener('pointerout', e => { if (e.target.closest('.node')) svg.querySelectorAll('.edge-g.hov').forEach(x => x.classList.remove('hov')); });
  const ctl = q('.ctl');
  if (ctl) ctl.addEventListener('click', e => { const z = e.target.closest('button')?.dataset.z; if (!z) return;
    if (z === 'in') cam.zoomAt(1.4, null, null, true); else if (z === 'out') cam.zoomAt(1 / 1.4, null, null, true); else if (z === 'fit') cam.fit(); else if (z === 'one') cam.actual(); else if (z === 'up') up(); else if (z === 'flow') setFlow(!stage.classList.contains('flowing')); else if (z === 'add') addAt(cam.s.cx, cam.s.cy); });
  setFlow(options.flow ?? !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));

  // the stage changes size with its container: keep the zoom, refit only an untouched view (no ResizeObserver, as in
  // jsdom: the view is fitted once)
  let rz;
  const ro = typeof ResizeObserver === 'function' && new ResizeObserver(() => { if (!cam || dead) return; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (dead) return; if (!cam.touched) cam.set(startView()); else cam.apply(); if (sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id]; cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); } }); });
  if (ro) ro.observe(stage);

  /* the picture as a file: CSS variables resolved into attributes so it stands alone. It is drawn at rest: no
     selection, hover, flow animation or edit handles, whatever the screen shows; the screen is left as it was. */
  function standalone(scale = 1, vid = cur, fontCSS = '') {
    if (!svg || !geo) return '';
    let s = svg, g = geo, off = null;
    if (vid !== cur) { // another view: drawn off screen, inside the shadow root so the same styles apply
      const v = ctx.V[vid]; if (!v || !(v.nodeIds || []).some(i => ctx.N[i])) return '';
      const c = ctx.geoCache[vid] ||= ctx.buildView(vid, { tour: P.tour !== false, openHint: P.openHint !== false });
      off = document.createElement('div'); off.style.cssText = 'position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none';
      off.innerHTML = c.markup; stage.parentNode.appendChild(off); s = off.querySelector('svg'); s.classList.add('map-svg'); g = c.g;
    }
    const s0 = sel, flowing = stage.classList.contains('flowing'), hov = [...svg.querySelectorAll('.hov')];
    sel = null; paint(); stage.classList.remove('flowing'); hov.forEach(x => x.classList.remove('hov')); stage.classList.add('um-still');
    const clone = s.cloneNode(true), b = g.bounds;
    const src = s.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'visibility'];
    const unvar = (t, cs) => t.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (m, n, f) => cs.getPropertyValue(n).trim() || (f || '').trim());
    try { src.forEach((el, i) => { const cs = getComputedStyle(el), d = dst[i];
      [...d.attributes].forEach(a => { if (a.value.includes('var(')) d.setAttribute(a.name, unvar(a.value, cs)); });
      props.forEach(p => { const v = cs.getPropertyValue(p); if (v) d.style.setProperty(p, v); });
      if (cs.textTransform === 'uppercase' && !d.childElementCount) d.textContent = d.textContent.toUpperCase(); }); } // tab text, as drawn
    finally { stage.classList.remove('um-still'); hov.forEach(x => x.classList.add('hov')); if (flowing) stage.classList.add('flowing'); sel = s0; paint(); if (off) off.remove(); }
    clone.querySelectorAll('title, .flowline, .um-edit, .um-ghost, .um-link, .keys, .um-key').forEach(t => t.remove());
    clone.setAttribute('role', 'img'); clone.querySelectorAll('[tabindex], [aria-pressed]').forEach(t => ['tabindex', 'role', 'aria-pressed'].forEach(a => t.removeAttribute(a)));
    clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); clone.setAttribute('width', b.w * scale); clone.setAttribute('height', b.h * scale);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, fill: getComputedStyle(stage).backgroundColor }).forEach(([k2, v]) => bg.setAttribute(k2, v));
    clone.insertBefore(bg, clone.firstChild.nextSibling);
    if (fontCSS) { const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = fontCSS; clone.insertBefore(st, clone.firstChild); } // the host's own @font-face rules, carried into the file
    return new XMLSerializer().serializeToString(clone);
  }

  function update(model2, relayout = false) {
    if (dead) return;
    // an identical model: nothing to redraw, unless the host accepted a move or reorder that only changed a position
    if (!relayout && !Object.keys(hints).length && !Object.keys(slotsH).length && JSON.stringify(model2) === JSON.stringify(current)) { addHints.length = 0; return; }
    const old = ctx, keys = {}, before = new Set(geo ? geo.nodes.map(n => n.id) : []), wantNew = selectNew;
    old.views.forEach(v => { keys[v.id] = relayout ? null : old.viewKey(v.id); });
    current = model2;
    ctx = mapContext(withPlaces(model2), { measure, kinds: !!P.kinds, prev: options.stableLayout === false ? null : old.planCache });
    [hints, slotsH].forEach(o => Object.keys(o).forEach(k => delete o[k])); addHints.length = 0; selectNew = false;
    ctx.views.forEach(v => { const id = v.id; if (keys[id] == null || keys[id] !== ctx.viewKey(id)) return;
      if (id in old.planCache) ctx.planCache[id] = old.planCache[id];
      if (old.layoutCache[id]) ctx.layoutCache[id] = old.layoutCache[id];
      if (old.geoCache[id]) ctx.geoCache[id] = old.geoCache[id]; });
    if (!cur) return;
    if (!ctx.V[cur]) { const from = cur; mount(ctx.rootId); cam.set(startView()); cam.touched = false; emit('viewchange', { view: cur, from }); return; }
    if (ctx.geoCache[cur] && keys[cur] === ctx.viewKey(cur)) return; // this view's picture did not change
    const keep = sel, keepMore = more, touched = cam.touched;
    mount(cur);
    if (touched) cam.set({}); else cam.set(startView());
    cam.touched = touched;
    const fresh = geo.nodes.filter(n => !before.has(n.id));
    if (wantNew && fresh.length === 1) select(nodeRef(fresh[0].id), { reveal: false });
    else if (keep && exists(keep)) { sel = keep; more = keep.type === 'node' ? keepMore.filter(id => geo.byId[id]) : []; paint(); emitSel(); }
  }

  function destroy() {
    if (dead) return;
    dead = true; if (ro) ro.disconnect(); cancelAnimationFrame(rz);
    timers.forEach(clearTimeout); timers.clear();
    if (cam) cam.stopAnimation();
    host.remove();
    Object.keys(subs).forEach(k => delete subs[k]);
  }

  const inner = { ctx: () => ctx, geo: () => geo, cam: () => cam, svg: () => svg, stage, host, go, open, up, flash, setFlow, pause, key, startView, standalone,
    select, busy: () => busy, flowing: () => stage.classList.contains('flowing'), view: () => cur };
  const first = () => {
    if (dead) return;
    const v0 = ctx.V[options.view] ? options.view : ctx.rootId;
    if (!v0) return;
    mount(v0); cam.set(startView()); cam.touched = false;
    if (options.select) select(options.select, { reveal: false });
    if (P.onReady) P.onReady();
  };
  if (P.defer) requestAnimationFrame(() => later(first, 16)); else first();
  // the host's fonts may still be loading: measure again once they are in, and redraw
  if (measure && !own && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (dead) return; measure = hostMeasure(host); update(current, true); });

  return {
    update: m => update(m),
    setView: id => go(id),
    select: ref => select(ref),
    fit: () => { if (cam) cam.fit(); },
    toSVG: (o = {}) => dead ? '' : standalone(o.scale ?? 1, o.view ?? cur, o.fontCSS),
    toPNG: (o = {}) => dead ? Promise.resolve(null) : pngOf(standalone(o.scale ?? 2, o.view ?? cur, o.fontCSS)),
    focus: ref => { if (!dead) focusMap(ref); },
    on(type, fn) { (subs[type] ||= []).push(fn); if (type === 'click') tabKeys();
      return () => { subs[type] = (subs[type] || []).filter(f => f !== fn); if (type === 'click' && !dead) tabKeys(); }; },
    get view() { return cur; },
    get selection() { return sel; },
    get selected() { return picked(); },
    destroy,
    [INNER]: inner,
  };
}

/* ================= the standalone viewer =================
   One-row top bar · column browser of views on the left · map on top · details strip below; built on render().
   It owns the page: the document title, the URL hash (#view=&node=), keyboard shortcuts and saved preferences. */
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('visual-theme', next); } catch (e) {}
}

/* undo for a host: the models it had and has undone, in order. The host makes it, holds it and decides what goes in;
   render() never sees it. `limit` caps how many steps back are kept. */
export function history(model, limit = 100) {
  const past = [], future = []; let now = model;
  return {
    get model() { return now; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(m) { past.push(now); if (past.length > limit) past.shift(); future.length = 0; return (now = m); },
    undo() { if (past.length) { future.push(now); now = past.pop(); } return now; },
    redo() { if (future.length) { past.push(now); now = future.pop(); } return now; },
  };
}

export function mountPage(container, model, options = {}) {
  const Q = options.params || new URLSearchParams();
  if (options.instant) INSTANT = true;
  document.body.classList.add('map-mode');
  let { D, views, nodes, N, V, rootId, nodeIn: nodeIn0, childOf: childOf0, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = mapContext(model);
  const nodeIn = (nid, vid = cur) => nodeIn0(nid, vid), childOf = (nid, vid = cur) => childOf0(nid, vid);
  const shortT = t => String(t || '').split(' · ')[0];
  const root = D.meta && D.meta.root ? D.meta.root.replace(/\/$/, '') : '';
  const base = D.sourcesBase ? String(D.sourcesBase).replace(/\/$/, '') + '/' : '';
  const srcPath = p => p.replace(/:\d+(-\d+)?$/, '');
  // meta.root is the repo root relative to this page (older pages: absolute). `~/…` sources live
  // outside the repo, so they get no link.
  // meta.sourceBase (render --source-base): in-pack sources were rewritten to URLs under it and
  // show as their pack-relative path; any other relative source gets no link on a published page.
  const sb = D.meta && D.meta.sourceBase ? String(D.meta.sourceBase) : '';
  const srcLabel = p => sb && p.startsWith(sb) ? decodeURI(p.slice(sb.length)).replace(/#L(\d+)(?:-L(\d+))?$/, (_, a, b) => ':' + a + (b ? '-' + b : '')) : p;
  const srcHref = p => /^https?:/.test(p) ? p
    : p.startsWith('~') || sb ? ''
    : p.startsWith('/') ? 'file://' + encodeURI(srcPath(p))
    : root.startsWith('/') ? 'file://' + encodeURI(root + '/' + base + srcPath(p))
    : encodeURI((root ? root + '/' : '') + base + srcPath(p));
  const srcList = n => (Array.isArray(n.source) ? n.source : n.source ? [n.source] : []);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const modK = mac ? '⌘K' : 'Ctrl K';
  const touch = matchMedia('(hover: none)').matches;
  const HINT = touch ? '<span>pinch = zoom</span><span>drag = move</span><span>tap = details</span>'
    : `<span>scroll = zoom</span><span>drag = move</span><span>double-click ⤢ = open</span><span>${modK} = search</span><span>? = keys</span>`;
  const ghost = [[10, 26, 22], [40, 18, 24], [40, 46, 24], [10, 60, 22], [70, 32, 20], [70, 70, 20]].map(([l, t, w]) => `<span style="left:${l}%;top:${t}%;width:${w}%"></span>`).join('');

  const app = container; app.className = 'mapapp';
  app.innerHTML = `
    <header class="mbar">
      <button class="ibtn" id="m-outline" title="Views (O)" aria-label="Toggle the views list" aria-expanded="false">☰</button>
      <span class="mbrand"><i></i><span>${esc(D.title || 'Map')}</span></span>
      <nav class="crumbs" id="m-crumbs" aria-label="Breadcrumb"></nav>
      <button class="findbtn" id="m-find" type="button" aria-label="Search nodes and views (${modK})"><span aria-hidden="true">⌕</span><span class="ft">Find a node or view…</span><span class="kbd">${modK}</span></button>
      <button class="ibtn" id="m-theme" title="Light / dark" aria-label="Toggle theme">◐</button>
      <div class="menu"><button class="pbtn" id="m-export" aria-haspopup="true" aria-expanded="false">Export ▾</button>
        <div class="menu-pop" id="m-export-pop" hidden><button data-x="svg">SVG · this view</button><button data-x="png">PNG · this view (2×)</button><button data-x="link">Copy link to view</button><hr><button data-x="json">Map model (JSON)</button></div></div>
      <button class="ibtn" id="m-pause" type="button" title="Pause" aria-label="Pause" aria-pressed="false">❚❚</button>
      <button class="ibtn" id="m-help" title="Keys (?)" aria-label="Keyboard shortcuts" aria-haspopup="true" aria-expanded="false">?</button>
    </header>
    <aside class="outline" id="m-tree" aria-label="Views"></aside>
    <div class="mmain">
      <div class="mstage" id="m-stage">
        <div class="mcanvas" id="m-canvas"></div>
        <div class="ghosts" id="m-ghosts" aria-hidden="true">${ghost}</div>
        <div class="vpill" id="m-vpill"></div>
        <div class="m-legend" id="m-legend"></div>
        <div class="hint" id="m-hint" role="status" aria-live="polite">${HINT}</div>
      </div>
      <aside class="panel" id="m-panel" aria-label="Node details" hidden></aside>
    </div>
    <div class="hpop" id="m-helpbox" role="dialog" aria-label="Keys" hidden><b>Keys</b>
      <dl><dt>/ or ${modK}</dt><dd>search nodes and views</dd><dt>Scroll · pinch</dt><dd>zoom (two-finger drag pans)</dd><dt>Click</dt><dd>details below the map</dd><dt>Double-click · Enter</dt><dd>open a stacked node ⤢</dd>
      <dt>Esc · Backspace</dt><dd>close, then up one level</dd><dt>+ − 0 1</dt><dd>zoom in, out, fit, 100%</dd><dt>← ↑ → ↓</dt><dd>pan</dd><dt>[ ]</dt><dd>previous / next details tab</dd><dt>i</dt><dd>about this view</dd><dt>O</dt><dd>views list</dd><dt>F</dt><dd>flow on/off</dd></dl></div>
    <div class="scrim" id="m-pal" hidden><div class="pal" role="dialog" aria-label="Search">
      <div class="in"><span aria-hidden="true">⌕</span><input id="m-q" type="text" autocomplete="off" spellcheck="false" placeholder="Search nodes and views" aria-label="Search nodes and views" aria-controls="m-res"><span class="kbd">esc</span></div>
      <div class="res" id="m-res" role="listbox"></div>
      <div class="pft"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div></div>`;
  const $ = id => document.getElementById(id);
  const stage = $('m-stage'), panel = $('m-panel');
  let X = null, cam = null, geo = null, svg = null, cur = null, sel = null, stack = [], paused = false, replaceNext = false;
  let tab = 'when'; try { tab = localStorage.getItem('visual-tab') || 'when'; } catch (_) {}
  const status = (t, ms = 1800) => { const el = $('m-hint'); el.textContent = t; el.classList.add('msg'); clearTimeout(status.t); status.t = setTimeout(() => { el.innerHTML = HINT; el.classList.remove('msg'); }, ms); };

  function renderChrome() {
    const v = V[cur];
    $('m-crumbs').innerHTML = stack.map((id, i) => i === stack.length - 1
      ? `<span class="crumb cur" aria-current="page">${esc(V[id].title || id)}</span>`
      : `<button class="crumb" data-v="${esc(id)}">${esc(shortT(V[id].title || id))}</button><span class="crumb-sep">›</span>`).join('');
    const parent = stack.length > 1 ? stack[stack.length - 2] : v.parent;
    renderPill(parent); renderLegend(); renderTree();
    document.title = `${v.title || v.id} · ${D.title || 'map'}`;
  }
  function renderPill(parent) {
    const v = V[cur], mainSteps = v.mainSteps || v.render === 'process', seq = v.render === 'sequence', ve = viewEdges(v), L = planCache[cur] && planCache[cur].hub ? planCache[cur] : null;
    const depth = Math.max(...views.map(x => chain(x.id).length));
    $('m-vpill').innerHTML = `<button class="pill" id="m-pillbtn" aria-expanded="false" aria-controls="m-vpop" title="About this view (i)"><b>${esc(shortT(v.title || v.id))}</b><span class="n">${mainSteps ? (v.stepIds || v.nodeIds || []).length + ' steps' : seq ? ve.length + ' steps' : geo.nodes.length + ' nodes'}</span><span class="kbd">i</span></button>
      ${mainSteps && (v.note || v.caption) ? `<p class="view-note">${inline(v.note || v.caption)}</p>` : ''}
      <div class="vpop" id="m-vpop" hidden>${parent ? `<button class="back" data-v="${esc(parent)}">← ${esc(shortT(V[parent].title || parent))}</button>` : ''}
        <h4>${esc(v.title || v.id)}</h4>${v.caption || v.description ? `<p>${inline(v.caption || v.description)}</p>` : ''}
        ${L ? `<div class="vlanes">${L.lanes.map((l, i) => `${i ? '<i>→</i>' : ''}<span><em>${i + 1}</em>${esc(l.title)} <small>${l.ids.length}</small></span>`).join('')}</div>` : ''}
        ${seq ? `<ol>${ve.map(e => `<li title="${esc((N[e.from] || {}).label || e.from)} → ${esc((N[e.to] || {}).label || e.to)}">${esc(e.label || (N[e.to] || {}).label || e.to)}</li>`).join('')}</ol>` : ''}
        <div class="vm">${geo.nodes.length} nodes · ${geo.edges.length} wires${views.length > 1 ? ` · level ${chain(cur).length} of ${depth}` : ''}</div></div>`;
  }
  const togglePill = force => { const b = $('m-pillbtn'), p = $('m-vpop'); if (!b) return; const on = force != null ? force : p.hidden; p.hidden = !on; b.setAttribute('aria-expanded', on); };
  let legendFolded = false; try { legendFolded = localStorage.getItem('visual-legend') === '0'; } catch (_) {}
  function renderLegend() {
    const used = [...new Set(geo.nodes.map(n => n.k))];
    const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script', 'frontend', 'backend', 'ai', 'queue', 'database', 'security', 'cloud', 'external', 'file'];
    const shape = k => k === 'm-verb' ? 'p' : (k === 'm-ext' || k === 'external') ? 'd' : k === 'm-hook' ? 'h' : '';
    const items = order.filter(k => used.includes(k)).map(k => `<span class="lgi" title="${esc(KIND[k][1] + ' — ' + KIND[k][2])}"><i class="${shape(k)}" style="border-color:var(--um-${KIND[k][0]});background:var(--um-${KIND[k][0]}-f)${k === 'm-hook' ? `;background:var(--um-${KIND[k][0]})` : ''}"></i><b>${KIND[k][1]}</b><span>${KIND[k][2]}</span></span>`)
      .concat(geo.nodes.some(n => n.kids || n.opens) ? ['<span class="lgi"><i class="s"></i><b>⤢ Stacked</b><span>double-click to open</span></span>'] : [])
      .concat(geo.nodes.some(n => n.step) ? ['<span class="lgi"><i class="num">1</i><b>Step</b><span>run order</span></span>'] : [])
      .concat(geo.nodes.some(n => n.tag) ? ['<span class="lgi"><i class="tag"></i><b>@author</b><span>who wrote it</span></span>'] : [])
      .concat(WIRES.filter(w => geo.edges.some(e => e.wk === w[0])).map(w => `<span class="lgi"><i class="w" style="border-color:var(--um-w-${w[0]})"></i><b>${w[1]}</b><span>${w[2]}</span></span>`))
      .concat(geo.edges.some(e => e.back) ? ['<span class="lgi"><i class="w dash" style="border-color:var(--um-w-calls)"></i><b>loops back</b><span>the one line that runs right to left</span></span>'] : []);
    const el = $('m-legend');
    el.hidden = !items.length;
    el.classList.toggle('folded', legendFolded);
    el.innerHTML = `<div class="t"><span>LEGEND</span><button type="button" id="m-lfold" aria-label="${legendFolded ? 'Show' : 'Hide'} legend" aria-expanded="${!legendFolded}">${legendFolded ? '+' : '–'}</button></div>${items.join('')}`;
  }
  function renderTree() { // Readable columns; a declared order may include shortcuts to descendants.
    const ch = chain(cur);
    const roots = views.filter(x => !x.parent), cols = roots.length > 1 ? [{ head: 'Map', items: roots, on: ch[0] }] : [];
    ch.forEach((id, i) => { const order = V[id].browserOrder || [], k = [...new Set([...order, ...kidsOf(id).map(v => v.id)])].map(id => V[id]).filter(Boolean); if (k.length) cols.push({ head: shortT(V[id].title || id), items: k, on: ch[i + 1] }); });
    document.body.style.setProperty('--browser-width', Math.min(448, Math.max(1, cols.length) * 224) + 'px');
    $('m-tree').innerHTML = `<div class="miller">${cols.map(c => `<div class="mcol"><div class="mch" title="${esc(c.head)}">${esc(c.head)}</div>${c.items.map(x => { const n = kidsOf(x.id).length;
      return `<button class="mit${x.id === cur ? ' on' : x.id === c.on ? ' path' : ''}" data-v="${esc(x.id)}" title="${esc(x.title || x.id)}"${x.id === cur ? ' aria-current="page"' : ''}><span>${esc(shortT(x.title || x.id))}</span><em>${(x.nodeIds || []).length}${n ? ' ›' : ''}</em></button>`; }).join('')}</div>`).join('')}</div>`;
    const m = $('m-tree').firstChild, last = m.lastElementChild; m.style.scrollBehavior = 'auto'; m.scrollLeft = last ? Math.max(0, last.offsetLeft + last.offsetWidth - m.clientWidth) : 0; m.style.scrollBehavior = '';
  }
  const setTree = on => { document.body.classList.toggle('tree-open', on); $('m-outline').setAttribute('aria-expanded', on); };

  // Pull concise points from captured prose; retain wording and keep the full point in its tooltip.
  function detailBullets(body) {
    const normalized = String(body || '').replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '').replace(/\n+/g, ' ').trim();
    let parts = normalized.split(/(?<=[.!?])\s+(?=[A-Z`/])|;\s+|\s+[·|]\s+/).filter(Boolean);
    while (parts.length < 2 || parts.some(p => p.length > 160) && parts.length < 4) {
      const index = parts.reduce((best, p, i) => p.length > (parts[best] || '').length ? i : best, 0), value = parts[index];
      if (!value || value.length < 8) break;
      const separators = [...value.matchAll(/:\s+|,\s+|\s+(?=then\b|with\b|before\b|after\b|once\b|to\b|and\b|or\b|during\b|by\b|whose\b|outside\b|on\b|for\b|as\b|whenever\b|into\b|in\b|from\b|when\b|includes\b|typed\b)/g)].map(m => m.index + m[0].length);
      const safe = i => (value.slice(0, i).match(/`/g) || []).length % 2 === 0;
      const cuts = separators.filter(i => i >= 6 && i < value.length - 4 && safe(i));
      if (!cuts.length && parts.length < 2) cuts.push(...[...value.matchAll(/\s+/g)].map(m => m.index).filter(i => i >= 6 && i < value.length - 4 && safe(i)));
      const cut = cuts.sort((a, b) => Math.abs(a - value.length / 2) - Math.abs(b - value.length / 2))[0];
      if (!cut) break;
      parts.splice(index, 1, value.slice(0, cut).replace(/[,;:]\s*$/, '').trim(), value.slice(cut).trim());
    }
    if (parts.length > 4) parts = [...parts.slice(0, 3), parts.slice(3).join(' ')];
    return parts;
  }
  /* selection + details strip */
  /* selection + details strip: the canvas reports, the page shows the panel and records the hash */
  const select = (nid, opts = {}) => X.select({ type: 'node', id: nid }, opts);
  function hidePanel() { panel.hidden = true; }
  const deselect = () => X.select(null);
  function relRows(list, dir) {
    if (!list.length) return `<div class="rel-none">${dir === 'up' ? 'Nothing calls this here' : 'Calls nothing here'}</div>`;
    return '<ul class="relation-list">' + list.map(({ e, id, inView }) => { const o = N[id] || { label: id, kind: '' }, k = kindOf(o.kind, true);
      return `<li><button class="rel" data-n="${esc(id)}" title="${esc((e.when ? e.when + ' — ' : '') + (inView ? 'Select' : 'Find in another view'))}"><i style="background:var(--um-${KIND[k][0]})"></i><span class="rel-l">${esc(o.label)}</span>
        <span class="rel-e">${e.step != null ? esc(e.step) + ' · ' : ''}${esc(e.label || '')}${inView ? '' : ' ↗'}</span></button></li>`; }).join('') + '</ul>';
  }
  const authorChip = login => { const A = (D.authors || {})[login] || {};
    return `<a class="author" href="${esc(A.url || 'https://github.com/' + login)}" target="_blank" rel="noopener">${A.avatar ? `<img src="${A.avatar}" alt="">` : `<i>${esc(login.slice(0, 2).toUpperCase())}</i>`}<span>${esc(A.name || login)} <b>@${esc(login)}</b></span></a>`; };
  function renderPanel(nid) {
    const n = nodeIn(nid), k = kindOf(n.kind, true), c = `var(--um-${KIND[k][0]})`, pub = k === 'm-public', ext = k === 'm-ext';
    const inView = new Set(geo.nodes.map(x => x.id)), seen = new Set();
    const collect = dir => {
      const out = [];
      const add = (e, id, iv) => { const key = dir + id + (e.label || ''); if (seen.has(key)) return; seen.add(key); out.push({ e, id, inView: iv }); };
      geo.edges.forEach(e => { if (dir === 'up' && e.to === nid) add(e, e.from, true); if (dir === 'down' && e.from === nid) add(e, e.to, true); });
      viewEdges(V[cur]).forEach((e, i) => { const e2 = V[cur].render === 'sequence' ? { ...e, step: i + 1 } : e; if (dir === 'up' && e.to === nid) add(e2, e.from, true); if (dir === 'down' && e.from === nid) add(e2, e.to, true); });
      (D.edges || []).forEach(e => { if (dir === 'up' && e.to === nid) add(e, e.from, inView.has(e.from)); if (dir === 'down' && e.from === nid) add(e, e.to, inView.has(e.to)); });
      return out;
    };
    const ups = collect('up'), downs = collect('down'), srcs = srcList(n);
    const child = childOf(nid), canOpen = child && child !== cur;
    const vIn = viewsWith(nid).filter(v => v.id !== cur);
    const by = n.author ? `<span>·</span>${authorChip(n.author)}` : ext ? '<span class="origin">· author unknown</span>' : '';
    const exs = Array.isArray(n.examples) ? n.examples.filter(x => x && (x.thumb || x.href)) : [];
    const tabs = [['when', 'When to use'], ['what', 'What it is'], ['how', 'How it works'], ...(exs.length ? [['examples', 'Example']] : []), ['links', 'Behind the scenes']];
    TABS = tabs.map(t => t[0]);
    if (!TABS.includes(tab)) tab = 'when';
    const text = (h4, body, key) => body ? `<h4>${h4}</h4><ul class="detail-bullets">${detailBullets(body).map(b => `<li title="${esc(b)}">${inline(b)}</li>`).join('')}</ul>` : `<h4>${h4}</h4><div class="pnone">Not written yet — add <code>${key}</code> to this node in the map model.</div>`;
    const verbs = (n.verbs || []).length ? `<div class="pverbs">${n.verbs.map(v => { const vid = N[nid + ':' + v] ? nid + ':' + v : null; return `<${vid ? `button data-n="${esc(vid)}"` : 'span'} class="pverb" style="--c:${c}">${esc(v)}</${vid ? 'button' : 'span'}>`; }).join('')}</div>` : '';
    const srcHtml = srcs.length ? '<ul class="source-list">' + srcs.map(s => `<li class="src">${srcHref(s) ? `<a href="${esc(srcHref(s))}" title="Open ${esc(sb ? srcLabel(s) : base + s)}"${sb ? ' target="_blank" rel="noopener"' : ''}>${esc(srcLabel(s))}</a>` : `<span>${esc(s)}</span>`}<button class="ibtn sm" data-copy="${esc(sb ? srcLabel(s) : base + s)}" title="Copy path" aria-label="Copy path">⧉</button></li>`).join('') + '</ul>' : '<div class="rel-none">No source listed</div>';
    const bodies = {
      when: text('When to use', n.when, 'when'),
      what: text('What it is', n.what, 'what') + verbs,
      how: text('How it works', n.how, 'how'),
      examples: `<h4>Example</h4><ul class="exs">${exs.map((x, i) => `<li class="ex">${x.thumb ? `<button class="ex-thumb" data-ex="${i}" title="Open full size" aria-label="Open ${esc(x.title || 'example')} full size"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>` : ''}<b>${inline(x.title || '')}</b>${x.caption ? `<small>${inline(x.caption)}</small>` : ''}${x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}</li>`).join('')}</ul>`,
      links: `<div class="links"><div><h4>← Comes from</h4>${relRows(ups, 'up')}</div><div><h4>→ Leads to</h4>${relRows(downs, 'down')}</div>
        <div><h4>Source files</h4>${srcHtml}${vIn.length ? `<h4 style="margin-top:10px">Also shown in</h4><ul class="pviews">${vIn.map(v => `<li><button class="pview" data-v="${esc(v.id)}" data-sel="${esc(nid)}">${esc(shortT(v.title || v.id))}</button></li>`).join('')}</ul>` : ''}</div></div>`,
    };
    panel.innerHTML = `<div class="ph" style="--c:${c}">
        ${(() => { const I = (D.icons || {})[n.icon];
  return I && I.src ? `<span class="big logo${I.dark ? ' dark' : ''}" aria-hidden="true"><img src="${I.src}" width="22" height="22" alt=""></span>`
  : `<span class="big" style="background:${c}" aria-hidden="true"><svg viewBox="0 0 ${I && I.g ? 24 : 16} ${I && I.g ? 24 : 16}" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${I && I.g ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round">${I && I.g ? I.g : SIGIL[k]}</svg></span>`; })()}
        <div class="pt"><h3>${esc(n.label || nid)}</h3><small><span>${esc(KIND[k][1])}</span><span class="vis ${pub ? 'pub' : ext ? 'ext' : ''}">${badgesOf(n).length ? badgesOf(n).map(b => esc(b.text.toUpperCase())).join(' · ') : pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>${by}${n.origin ? `<span class="origin">${esc(n.origin)}</span>` : ''}</small></div>
        <div class="acts">${canOpen ? `<button class="obtn" data-open="${esc(child)}" style="--c:${c}">⤢ Open ${esc(shortT(V[child].title || child))} <span>${(V[child].nodeIds || []).length} nodes · Enter</span></button>` : ''}<button class="ibtn x" data-close title="Close (Esc)" aria-label="Close details">×</button></div>
      </div>
      <div class="ptabs" role="tablist" aria-label="Details">${tabs.map(t => `<button class="ptab" role="tab" id="pt-${t[0]}" data-tab="${t[0]}" aria-selected="${t[0] === tab}" aria-controls="m-pbody">${t[1]}${t[2] != null ? `<em>${t[2]}</em>` : ''}</button>`).join('')}
        <span class="pnav"><button class="ibtn sm" data-step="-1" title="Previous ([)" aria-label="Previous tab">‹</button><button class="ibtn sm" data-step="1" title="Next (])" aria-label="Next tab">›</button></span></div>
      <div class="pbody" id="m-pbody" role="tabpanel" aria-labelledby="pt-${tab}">${bodies[tab]}</div>`;
    panel.hidden = false;
    panel.dataset.node = nid;
    panel.querySelectorAll('.clamp').forEach(el => { if (el.scrollHeight > el.clientHeight + 2) el.insertAdjacentHTML('afterend', '<button class="morebtn" data-more>Show all</button>'); });
  }
  let TABS = ['when', 'what', 'how', 'links'];
  function openExample(nid, i) {
    const x = ((nodeIn(nid) || {}).examples || [])[i]; if (!x) return;
    let lb = $('m-lightbox');
    if (!lb) { lb = h(`<div class="lightbox" id="m-lightbox" role="dialog" aria-modal="true" aria-label="Example" hidden></div>`); document.body.appendChild(lb);
      lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('[data-lbclose]')) closeExample(); }); }
    lb.innerHTML = `<figure><img src="${esc(x.full || x.thumb)}" alt="${esc(x.title || '')}"><figcaption><span>${inline(x.title || '')}</span>${x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}<button class="ibtn" data-lbclose title="Close (Esc)" aria-label="Close">×</button></figcaption></figure>`;
    lb.hidden = false; lb.querySelector('[data-lbclose]').focus();
  }
  const closeExample = () => { const lb = $('m-lightbox'); if (lb) lb.hidden = true; };
  const setTab = t => { tab = t; try { localStorage.setItem('visual-tab', t); } catch (_) {} if (sel) renderPanel(sel); };

  /* navigation */
  function setHash(replace) {
    const p = new URLSearchParams(); p.set('view', cur); if (sel) p.set('node', sel);
    ['theme', 'check', 'shot'].forEach(k => Q.get(k) && p.set(k, Q.get(k)));
    const h = '#' + p.toString();
    if (location.hash === h) return;
    if (replace) window.history.replaceState(null, '', h); else window.history.pushState(null, '', h); // window's: history() is this module's undo helper
  }
  const go = (vid, how = {}) => { if (how.replace) replaceNext = true; return X.go(vid, how); };
  const open = nid => X.open(nid), up = () => X.up();
  const findNode = nid => { if (geo.byId[nid]) return select(nid); const vs = viewsWith(nid); const v = vs.find(x => chain(x.id).includes(cur)) || vs[0]; if (v) go(v.id, { select: nid }); };

  /* events */
  stage.addEventListener('click', e => {
    if (e.target.closest('#m-pillbtn')) return togglePill();
    if (e.target.closest('#m-lfold')) { legendFolded = !legendFolded; try { localStorage.setItem('visual-legend', legendFolded ? '0' : '1'); } catch (_) {} renderLegend(); if (!cam.touched) cam.set(X.startView()); return; }
    const bv = e.target.closest('.vpop [data-v]'); if (bv) return go(bv.dataset.v);
  });
  const setFlow = on => X.setFlow(on);
  const closeHelp = () => { $('m-helpbox').hidden = true; $('m-help').setAttribute('aria-expanded', 'false'); };
  const closeExport = () => { $('m-export-pop').hidden = true; $('m-export').setAttribute('aria-expanded', 'false'); };
  panel.addEventListener('click', e => {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if (tb) return setTab(tb.dataset.tab);
    const st = t.closest('[data-step]'); if (st) return setTab(TABS[(TABS.indexOf(tab) + +st.dataset.step + TABS.length) % TABS.length]);
    const mb = t.closest('[data-more]'); if (mb) { mb.previousElementSibling.classList.add('open'); mb.remove(); }
    const ex = t.closest('[data-ex]'); if (ex) return openExample(panel.dataset.node, +ex.dataset.ex);
  });
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]')) return deselect();
    const ob = t.closest('[data-open]'); if (ob) return go(ob.dataset.open, { via: sel });
    const pv = t.closest('.pview'); if (pv) return go(pv.dataset.v, { select: pv.dataset.sel });
    const rn = t.closest('#m-panel [data-n]'); if (rn) return findNode(rn.dataset.n);
    const cv = t.closest('#m-crumbs [data-v], #m-tree [data-v]'); if (cv) { if (innerWidth <= 820) setTree(false); return go(cv.dataset.v); }
    const cp = t.closest('[data-copy]'); if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => status('Path copied'), () => status(cp.dataset.copy)); return; }
    if (!t.closest('.menu')) closeExport();
    if (!t.closest('#m-helpbox, #m-help')) closeHelp();
  });
  $('m-outline').addEventListener('click', () => setTree(!document.body.classList.contains('tree-open')));
  if (innerWidth > 1180 && views.length > 1) setTree(true);
  $('m-help').addEventListener('click', () => { const on = $('m-helpbox').hidden; $('m-helpbox').hidden = !on; $('m-help').setAttribute('aria-expanded', on); });
  $('m-theme').addEventListener('click', toggleTheme);
  $('m-pause').addEventListener('click', e => { paused = !paused; const b = e.currentTarget, l = paused ? 'Play' : 'Pause'; X.pause(paused); b.setAttribute('aria-pressed', paused); b.title = l; b.setAttribute('aria-label', l); b.textContent = paused ? '▶' : '❚❚'; });
  $('m-export').addEventListener('click', () => { const on = $('m-export-pop').hidden; $('m-export-pop').hidden = !on; $('m-export').setAttribute('aria-expanded', on); });
  $('m-export-pop').addEventListener('click', e => { const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; closeExport(); exportView(x); });

  /* ⌘K command box: nodes and views, Enter jumps */
  const nodeIdx = nodes.map(n => ({ n, hay: [n.label, n.id, (n.verbs || []).join(' '), n.what, n.kind, n.author, ((D.authors || {})[n.author] || {}).name, n.origin].join(' ').toLowerCase() }));
  const viewIdx = views.map(v => ({ v, hay: [v.title, v.id, v.caption].join(' ').toLowerCase() }));
  const pal = $('m-pal'), q = $('m-q'), res = $('m-res');
  let hits = [], hi = 0;
  const mark = (s, words) => { let out = esc(s); words.filter(w => w.length > 1).forEach(w => { out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return out; };
  const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
  function drawHits() {
    const qs = q.value.trim().toLowerCase(), words = qs.split(/\s+/).filter(Boolean);
    if (!qs) { // empty query: the views you can jump to, starting from where you are
      hits = [...kidsOf(cur), ...views.filter(v => v.id !== cur && !kidsOf(cur).includes(v))].slice(0, 8).map(v => ({ t: 'v', v }));
    } else {
      const starts = s => String(s || '').toLowerCase().startsWith(qs) ? 0 : 1;
      const ns = nodeIdx.filter(x => words.every(w => x.hay.includes(w))).sort((a, b) => starts(a.n.label) - starts(b.n.label) || (geo.byId[b.n.id] ? 1 : 0) - (geo.byId[a.n.id] ? 1 : 0)).slice(0, 7).map(x => ({ t: 'n', n: x.n }));
      const vs = viewIdx.filter(x => words.every(w => x.hay.includes(w))).slice(0, 5).map(x => ({ t: 'v', v: x.v }));
      hits = [...ns, ...vs];
    }
    hi = Math.min(hi, Math.max(0, hits.length - 1));
    if (!hits.length) {
      const near = nodes.map(n => [n, lev(qs, String(n.label).toLowerCase().replace(/^\//, '').slice(0, qs.length + 2))]).sort((a, b) => a[1] - b[1])[0];
      res.innerHTML = `<div class="none"><div aria-hidden="true">⌕</div><h4>Nothing called “${esc(q.value.trim())}”</h4>${near && near[1] <= Math.max(2, qs.length / 3) ? `Did you mean <button data-fill="${esc(near[0].label)}">${esc(near[0].label)}</button>?` : 'Try a skill, verb, script or view name.'}</div>`;
      return;
    }
    let html = '', last = '';
    hits.forEach((h, i) => {
      const grp = !qs ? 'Views' : h.t === 'n' ? 'Nodes' : 'Views';
      if (grp !== last) { html += `<div class="gt">${grp}</div>`; last = grp; }
      if (h.t === 'n') { const k = kindOf(h.n.kind, true), vs = viewsWith(h.n.id), here = geo.byId[h.n.id];
        html += `<button class="fr${i === hi ? ' on' : ''}" role="option" aria-selected="${i === hi}" data-i="${i}"><i style="background:var(--um-${KIND[k][0]})"></i><b>${mark(h.n.label, words)}</b><span>${esc(KIND[k][1])} · ${here ? 'this view' : esc(vs.map(v => shortT(v.title || v.id)).slice(0, 2).join(', ') || 'no view')}</span></button>`; }
      else html += `<button class="fr${i === hi ? ' on' : ''}" role="option" aria-selected="${i === hi}" data-i="${i}"><i style="background:var(--um-accent)"></i><b>${mark(h.v.title || h.v.id, words)}</b><span>${(h.v.nodeIds || []).length} nodes${h.v.id === cur ? ' · here' : ''}</span></button>`;
    });
    res.innerHTML = html;
    const on = res.querySelector('.fr.on'); on && on.scrollIntoView({ block: 'nearest' });
  }
  const openPal = () => { closeHelp(); closeExport(); pal.hidden = false; q.value = ''; hi = 0; drawHits(); q.focus(); };
  const closePal = () => { pal.hidden = true; q.blur(); };
  const pickHit = h => { if (!h) return; closePal(); if (h.t === 'n') findNode(h.n.id); else go(h.v.id); };
  q.addEventListener('input', () => { hi = 0; drawHits(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { hi = Math.min(hits.length - 1, hi + 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'Enter') { pickHit(hits[hi]); e.preventDefault(); }
    else if (e.key === 'Escape') { closePal(); e.preventDefault(); }
    e.stopPropagation();
  });
  res.addEventListener('click', e => { const f = e.target.closest('[data-fill]'); if (f) { q.value = f.dataset.fill; hi = 0; drawHits(); q.focus(); return; } const b = e.target.closest('[data-i]'); if (b) pickHit(hits[+b.dataset.i]); });
  res.addEventListener('pointermove', e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== hi) { hi = +b.dataset.i; res.querySelectorAll('.fr').forEach(x => { const on = +x.dataset.i === hi; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); } });
  pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
  $('m-find').addEventListener('click', openPal);

  /* keyboard: the page's own keys first (search, help, panels); the map's keys reach the canvas wherever the focus is */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); return pal.hidden ? openPal() : closePal(); }
    if (!X || (e.target.matches && e.target.matches('input, textarea')) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key, inCanvas = e.composedPath().includes(X.stage);
    if (k === 'Escape' || k === 'Backspace') {
      if ($('m-lightbox') && !$('m-lightbox').hidden) closeExample(); else if (!$('m-helpbox').hidden) closeHelp(); else if (!$('m-export-pop').hidden) closeExport(); else if ($('m-vpop') && !$('m-vpop').hidden) togglePill(false);
      else if (!inCanvas) X.key(e); else return;
    }
    else if (k === '/') openPal();
    else if (k === '?') $('m-help').click();
    else if (k === 'i' || k === 'I') togglePill();
    else if ((k === '[' || k === ']') && sel) setTab(TABS[(TABS.indexOf(tab) + (k === ']' ? 1 : -1) + TABS.length) % TABS.length]);
    else if (k === 'o' || k === 'O') setTree(!document.body.classList.contains('tree-open'));
    else if (inCanvas || !X.key(e)) return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  addEventListener('popstate', () => { const p = new URLSearchParams(location.hash.slice(1)); const v = p.get('view') || rootId; if (v !== cur) go(v, { replace: true, select: p.get('node') || undefined }); else if (p.get('node')) select(p.get('node')); else if (sel) deselect(); });

  /* export: resolve CSS variables into attributes so the file stands alone */
  const standalone = scale => X.standalone(scale);
  if (Q.get('still')) { const sv = Q.get('still'), sc = +(Q.get('scale') || 2);
    const tick = async () => { if (!geo || !V[sv]) return setTimeout(tick, 100); if (cur !== sv) { await go(sv, {}); return setTimeout(tick, 200); }
      X.stage.querySelectorAll('.flowline').forEach(e => e.remove()); const out = standalone(sc), b = geo.bounds; document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, w: Math.ceil(b.w * sc), h: Math.ceil(b.h * sc) }));
      document.body.innerHTML = '<div id="still">' + out + '</div>'; document.body.style.margin = '0'; };
    setTimeout(tick, 300); }
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportView(x) {
    const stem = (D.slug || D.title || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + cur.replace(/[^a-z0-9]+/gi, '-');
    if (x === 'svg') download(stem + '.svg', new Blob([standalone(1)], { type: 'image/svg+xml' }));
    else if (x === 'png') {
      pngOf(standalone(2)).then(bl => bl && download(stem + '.png', bl));
    } else if (x === 'link') { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => status('Link copied'), () => status(location.href)); }
    else if (x === 'json') { const { meta, kind, ...model } = D; download(stem.split('-' + cur)[0] + '.json', new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })); }
    if (x !== 'link') status('Exported ' + x.toUpperCase());
  }


  let flowPref = null; try { flowPref = localStorage.getItem('visual-flow'); } catch (_) {}
  const p0 = new URLSearchParams(location.hash.slice(1));
  const v0 = V[p0.get('view')] ? p0.get('view') : rootId;
  const handle = render($('m-canvas'), model, {
    view: v0, minimap: true, flow: flowPref ? flowPref === '1' : undefined,
    _page: {
      instant: options.instant, defer: !INSTANT, tour: !Q.get('still'), openHint: !Q.get('reader'), kinds: true, status,
      wide: () => innerWidth > 820,
      upTarget: () => stack.length > 1 ? stack[stack.length - 2] : (V[cur] || {}).parent,
      inset: () => { const top = Math.max(58, 26 + $('m-vpill').offsetHeight); if (innerWidth <= 820) return { t: top, r: 12, b: 12, l: 12 }; const lg = $('m-legend'), on = lg && !lg.hidden; // the legend box sits bottom left
        return [{ t: top, r: 20, b: 40 + (on ? lg.offsetHeight + 8 : 0), l: 20 }, { t: top, r: 20, b: 40, l: 20 + (on ? lg.offsetWidth + 8 : 0) }]; },
      onNavigate: (vid, prev, mode) => { togglePill(false);
        if (stack.includes(vid)) stack = stack.slice(0, stack.indexOf(vid) + 1); else if (mode === 'in' && prev) stack = [...stack, vid]; else stack = chain(vid); },
      onMount: inner => { X = inner; ({ D, views, nodes, N, V, rootId, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = X.ctx()); nodeIn0 = X.ctx().nodeIn; childOf0 = X.ctx().childOf;
        cam = X.cam(); geo = X.geo(); svg = X.svg(); cur = X.view(); if (paused) X.pause(true);
        if (!stack.length || !stack.includes(cur)) stack = chain(cur);
        renderChrome(); hidePanel(); },
      onBackground: () => togglePill(false),
      onFlow: on => { try { localStorage.setItem('visual-flow', on ? '1' : '0'); } catch (_) {} },
      onReady: () => {
        $('m-ghosts').remove();
        const n0 = p0.get('node') || (Q.get('shot') && cur !== rootId ? subjectOf(V[cur]) || (V[cur].nodeIds || [])[0] : null);
        if (n0 && geo.byId[n0]) select(n0, { reveal: false });
        setHash(true);
      },
    },
  });
  handle.on('select', ({ target }) => { sel = target && target.type === 'node' ? target.id : null; if (sel) renderPanel(sel); else hidePanel(); setHash(true); });
  handle.on('viewchange', () => { setHash(replaceNext); replaceNext = false; });
  return handle;
}
