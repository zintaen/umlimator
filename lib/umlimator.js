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
  .ctl .depth { font: 700 10px var(--um-mono); letter-spacing: .12em; color: var(--um-muted); padding: 0 8px; }
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
  /* a line's flow: pulses in the canvas colour moving along it, as wide as the line (never a bump on it), and stopping
     where its arrowhead begins (svgOf trims the path), so the arrow keeps its shape */
  svg .flowline { fill: none; stroke: var(--um-bg-2); stroke-width: calc(1.6px * var(--um-ew, 1)); stroke-linecap: round; stroke-dasharray: 10 70; opacity: 0; pointer-events: none; }
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
  /* reduced motion: no flow is drawn, so ≋ isn't offered (as the page hides its ❚❚); the stage's class outranks :host .flowing below */
  @media (prefers-reduced-motion: reduce) { :host .stage.flowing svg .flowline { animation: none; opacity: 0; } .flowing svg .edge { opacity: 1; } .ctl [data-z="flow"] { display: none; } }
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
  svg .tab-key:focus-visible .key-ring, svg .chip-key:focus-visible .key-ring, svg .family .pub-tab:focus-visible rect { stroke: var(--um-cyan); stroke-width: 2; }
  svg .node .verb-chip { fill: var(--um-mask); stroke-width: .9; stroke-opacity: .6; }
  svg .node .verb-tx { font: 600 9.5px var(--um-mono); }
  svg .node.subject .n-body { stroke-dasharray: none; filter: drop-shadow(0 0 10px color-mix(in srgb, currentColor 0%, transparent)); }
  svg .node:hover .n-body, svg .node:focus-visible .n-body { stroke-width: 3; }
  svg .node.priv:hover .n-body { stroke-opacity: 1; }
  svg .node.priv:hover .n-label { fill: var(--um-text); }
  svg .node:focus-visible .n-mask { stroke: var(--um-cyan); stroke-width: 3; }
  svg .edge-g.hov .edge, svg .edge-g.hot .edge { stroke-width: calc(2.6px * var(--um-ew, 1)); }
  .focusing:not(.um-lit) svg .node:not(.sel):not(.nb) { opacity: .28; }
  .focusing:not(.um-lit) svg .edge-g:not(.hot) { opacity: .15; }
  .focusing:not(.um-lit) svg .e-lab:not(.hot) { opacity: .15; }
  svg .node, svg .edge-g, svg .e-lab { transition: opacity .2s; }
  svg .node.sel .n-body { stroke-width: 3.2; }
  svg .node.sel .n-mask { stroke: var(--um-accent); stroke-width: 2; }
  svg .node.sel .n-body { animation: select-glow .65s ease-out; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--um-accent) 40%, transparent)); }
  svg .node.nb .n-body { stroke-width: 2.6; stroke-opacity: 1; }
  svg .n-port { fill: var(--um-panel); stroke-width: 1.5; pointer-events: none; transition: fill .2s, stroke-width .2s; }
  svg .node.sel .n-port, svg .node.nb .n-port.hot { fill: var(--um-accent); stroke: var(--um-accent); stroke-width: 2.2; }
  :host .focusing svg .edge-g.hot .flowline { opacity: .95; stroke-width: calc(2.8px * var(--um-ew, 1)); stroke-dasharray: 8 13; animation: selected-flow 1.1s linear infinite; }
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
  /* card shapes (0.15.0): their details, and their motion: what arrives lights a shape's accent (a head, a lid, a title bar,
     a fold); a queue's floor moves with the flow. Neither under reduced motion, nor in a picture at rest (an export) */
  svg .n-det { fill: none; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
  svg .n-dot { opacity: .75; } svg .n-field, svg .n-screen { fill: var(--um-panel); stroke-opacity: .55; stroke-width: 1; } svg .n-speaker { stroke-width: 1.9; }
  svg .n-prompt { font: 700 9px var(--um-mono); }
  svg .n-floor { fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: .1 7; opacity: 0; transition: opacity .2s; }
  .flowing svg .n-floor { opacity: .7; animation: floor 1.07s linear infinite; }
  @keyframes floor { to { stroke-dashoffset: -71; } }
  svg .node.flash .n-accent { animation: accent 1.3s ease-out; }
  @keyframes accent { 0%, 35% { stroke-width: 3.6; } }
  @media (prefers-reduced-motion: reduce) { svg .node.flash .n-accent, .flowing svg .n-floor { animation: none; } .flowing svg .n-floor { opacity: 0; } }
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
  /* a box with a tone (--um-tone, set on it): a region tinted in the tone, as deep as --um-tint makes the cards, with its
     border dashed and its title in the tone, darkened (lightened in dark) to keep 4.5:1; an unknown tone is slate */
  svg .family.toned .family-box { fill: color-mix(in srgb, var(--um-tone, var(--um-slate)) min(7% * var(--um-tint, 1), 18%), var(--um-panel)); fill-opacity: 1;
    stroke: color-mix(in srgb, var(--um-tone, var(--um-slate)) 60%, transparent); stroke-dasharray: 7 5; }
  svg .family.toned .family-title { fill: color-mix(in srgb, var(--um-tone, var(--um-slate)) 75%, var(--um-text)); }
  svg .family.sel .family-box { stroke: var(--um-accent); stroke-width: 2; }
  svg .fold-hint { cursor: pointer; } svg .fold-hint:hover rect { stroke-width: 2; }
  svg .edited-dot { fill: var(--um-edited); stroke: var(--um-mask); stroke-width: 1.5; }
  svg .rule-mark circle { fill: var(--um-rose); stroke: var(--um-mask); stroke-width: 1.5; } svg .rule-mark text { fill: var(--um-mask); font: 800 10px var(--um-sans); pointer-events: none; }
  svg .edge-g.faded .flowline { display: none; }
  .um-rename { position: absolute; z-index: 5; box-sizing: border-box; font-family: var(--um-sans); font-weight: 600; color: var(--um-text); background: var(--um-panel); border: 1.5px solid var(--um-accent); border-radius: 6px; padding: 0 6px; outline: none; box-shadow: var(--um-shadow); }
  svg .um-ghost { opacity: .6; pointer-events: none; } svg .um-ghost.um-pending { opacity: .3; }
  svg .family.um-target .family-box { stroke: var(--um-accent); stroke-width: 2.5; stroke-dasharray: 6 4; }
  svg .um-handle circle { fill: var(--um-accent); stroke: var(--um-mask); stroke-width: 2; cursor: crosshair; }
  .um-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .um-still *, .um-still *::before, .um-still *::after { transition: none !important; animation: none !important; }
  svg .um-link { fill: none; stroke: var(--um-accent); stroke-width: 2; stroke-dasharray: 5 4; pointer-events: none; }
  @media (max-width: 820px) { .minimap { display: none; } .mctl { bottom: 14px; right: 12px; } }
  /* marks (#63): a ring around a card, a glow under a line, tabs and labels over the map; a layer that dims (um-lit)
     sets how lit each thing is, in place of the selection's dimming */
  svg .um-ring { fill: none; stroke-width: 2.5; opacity: .9; } svg .um-glow { fill: none; stroke-width: calc(8px + 1.8px * (var(--um-ew, 1) - 1)); stroke-linecap: round; stroke-linejoin: round; opacity: .4; }
  svg .um-pulse { animation: um-pulse 1.1s ease-in-out infinite; } @keyframes um-pulse { 50% { opacity: .08; } }
  svg .um-marks .tab-tx { font: 800 8px var(--um-mono); letter-spacing: .14em; fill: var(--um-mask); text-transform: uppercase; }
  svg .um-lab rect { fill: var(--um-panel); stroke: var(--um-border-2); } svg .um-lab text { fill: var(--um-text); font: 600 10px var(--um-sans); }
  svg .um-trip { pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { svg .um-pulse { animation: none; } }
  /* a story's caption bar (#69), bottom left, clear of the controls */
  .um-story { position: absolute; left: 16px; bottom: 40px; z-index: 5; box-sizing: border-box; max-width: min(560px, calc(100% - 290px)); display: flex; align-items: flex-end; gap: 10px; padding: 9px 8px 9px 14px; border-radius: 12px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); color: var(--um-text); font: 13px/1.45 var(--um-sans); }
  .um-story .um-st { display: block; font: 600 11px var(--um-mono); color: var(--um-muted); margin-bottom: 2px; }
  .um-story p { margin: 0; } .um-story .um-sb { display: flex; gap: 2px; flex: none; }
  .um-story button { min-width: 30px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--um-text); font: 600 13px var(--um-mono); cursor: pointer; padding: 0 7px; }
  .um-story button:hover:not([aria-disabled="true"]) { background: var(--um-panel-2); color: var(--um-accent); } .um-story button[aria-disabled="true"] { opacity: .35; cursor: default; }
  @media (max-width: 820px) { .um-story { left: 12px; right: 12px; bottom: 60px; max-width: none; } }
  /* the standalone page's pieces (#99): the views list, the legend, the hint line and the details panel, in the page and,
     when a host asks, in render()'s shadow root, where these first rules give them what the page gives its whole page */
  :where(.outline, .m-legend, .hint, .panel, .lightbox, .um-navbtn), :where(.outline, .m-legend, .hint, .panel, .lightbox, .um-navbtn) * { box-sizing: border-box; }
  :where(.outline, .m-legend, .panel, .lightbox) button:focus-visible, .um-navbtn:focus-visible { outline: 2px solid var(--um-cyan); outline-offset: 2px; }
  :where(.panel, .lightbox) a { color: var(--um-cyan); }
  :where(.panel) code { font-family: var(--um-mono); font-size: .86em; overflow-wrap: anywhere; background: var(--um-panel-2); border: 1px solid var(--um-border); padding: .05em .35em; border-radius: 5px; }
  .ibtn { width: 32px; height: 32px; flex: none; border-radius: 8px; border: 1px solid var(--um-border-2); background: var(--um-panel); color: var(--um-text); cursor: pointer; font: 600 14px var(--um-sans); }
  .ibtn:hover, .ibtn[aria-expanded="true"] { border-color: var(--um-accent); color: var(--um-accent); }
  .ibtn[aria-pressed="true"] { border-color: var(--um-accent); color: var(--um-accent); }
  .ibtn.sm { width: 26px; height: 26px; font-size: 12px; border-radius: 7px; }
  /* views: Finder-style column browser */
  .outline { overflow: hidden; border-right: 1px solid var(--um-border); background: var(--um-bg); visibility: hidden; min-width: 0; }
  .tree-open .outline { visibility: visible; }
  .miller { display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-behavior: smooth; scrollbar-width: thin; }
  .mcol { flex: 0 0 224px; min-width: 224px; border-right: 1px solid var(--um-border); padding: 8px 6px; overflow-y: auto; }
  .mcol:last-child { border-right: 0; flex-grow: 1; }
  .mch { font: 700 10px var(--um-sans); letter-spacing: .08em; text-transform: uppercase; color: var(--um-muted); padding: 2px 8px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mit { display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; min-height: 34px; padding: 7px 8px; border-radius: 6px; border: 0; background: none; color: var(--um-text); font: 500 12.5px/1.4 var(--um-sans); cursor: pointer; text-align: left; }
  .mit span { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
  .mit em { font-style: normal; color: var(--um-muted); font-size: 11px; white-space: nowrap; flex: none; }
  .mit:hover { background: var(--um-panel-2); }
  .mit.path { background: var(--um-panel-2); font-weight: 650; }
  .mit.on { background: var(--um-accent-f); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--um-accent) 40%, transparent); font-weight: 650; }
  /* legend: a box in the corner that folds away */
  .m-legend { position: absolute; left: 16px; bottom: 40px; z-index: 3; background: var(--um-panel); border: 1px solid var(--um-border-2); border-radius: 12px; box-shadow: var(--um-shadow); padding: 8px 12px; font: 11.5px var(--um-sans); display: grid; grid-template-columns: repeat(2, auto); gap: 3px 16px; max-width: calc(100% - 290px); }
  .m-legend .t { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; font: 700 10px var(--um-sans); letter-spacing: .1em; color: var(--um-muted); }
  .m-legend .t button { border: 0; background: none; color: var(--um-muted); cursor: pointer; font: 700 13px var(--um-sans); padding: 0 2px; line-height: 1; }
  .m-legend.folded .lgi { display: none; }
  .lgi { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .lgi i { width: 14px; height: 10px; border: 1.5px solid var(--um-muted); border-radius: 3px; flex: none; }
  .lgi svg.lgs { width: 21px; height: 14px; flex: none; overflow: visible; } .lgs * { vector-effect: non-scaling-stroke; stroke-width: 1.3; } .lgs .n-det, .lgs .n-screen { stroke-width: 1; }
  .lgi i.p { border-radius: 999px; } .lgi i.d { border-style: dashed; } .lgi i.h { border-radius: 0; clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 50%, calc(100% - 3px) 100%, 3px 100%, 0 50%); border: 0; }
  .lgi i.s { box-shadow: 2px 2px 0 -.5px var(--um-panel), 2px 2px 0 .5px var(--um-muted); background: var(--um-panel); }
  .lgi i.num { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--um-text); color: var(--um-bg); font: 700 8px/14px var(--um-sans); text-align: center; font-style: normal; }
  .lgi i.tag { width: 20px; border-radius: 999px; border-width: 1px; }
  .lgi b { font-weight: 650; } .lgi span { color: var(--um-muted); }
  /* help: one quiet line at the bottom */
  .hint { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; gap: 16px; justify-content: center; align-items: center; height: 28px; padding: 0 12px; font: 11.5px var(--um-sans); color: var(--um-muted); background: color-mix(in srgb, var(--um-bg) 88%, transparent); border-top: 1px solid var(--um-border); white-space: nowrap; overflow: hidden; }
  .hint b { color: var(--um-text); font-weight: 600; }
  .hint.msg { color: var(--um-accent); font-weight: 600; }
  /* details: a short strip under the map — compact header, then When to use · What it is · How it works · Example · Behind the scenes tabs */
  .panel { flex: none; height: 234px; max-height: 44%; overflow: auto; border-top: 1px solid var(--um-border-2); background: var(--um-panel); z-index: 5; animation: rise .2s ease; }
  .panel[hidden] { display: none; }
  @keyframes rise { from { transform: translateY(12px); opacity: 0; } }
  .ph { display: flex; align-items: center; gap: 12px; padding: 12px 18px 6px; }
  .ph .big { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: var(--um-accent-fg); flex: none; }
  .ph .pt { min-width: 0; flex: 1; }
  .ph h3 { margin: 0; font: 650 17px var(--um-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph small { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; color: var(--um-muted); font-size: 12.5px; }
  .ph .acts { display: flex; gap: 8px; align-items: center; flex: none; }
  .vis { font: 700 9px var(--um-sans); letter-spacing: .1em; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--um-border-2); color: var(--um-muted); }
  .vis.pub { background: color-mix(in srgb, var(--um-k-public) 8%, var(--um-panel)); border-color: var(--um-k-public); color: var(--um-k-public); } .vis.ext { border-style: dashed; border-color: var(--um-k-ext); color: var(--um-k-ext); }
  .author { display: inline-flex; align-items: center; gap: 6px; padding: 1px 9px 1px 1px; border-radius: 999px; border: 1px solid var(--um-border-2); color: var(--um-text); text-decoration: none; background: var(--um-panel); font-size: 12px; }
  .author:hover { border-color: var(--um-accent); }
  .author img, .author i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font: 700 9px var(--um-sans); font-style: normal; background: var(--um-panel-2); }
  .author b { color: var(--um-muted); font-weight: 500; }
  .origin { color: var(--um-muted); font-size: 12px; }
  .obtn { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 10%, var(--um-panel)); color: var(--um-text); font: 600 13px var(--um-sans); cursor: pointer; white-space: nowrap; }
  .obtn span { font-weight: 500; color: var(--um-muted); font-size: 11.5px; }
  .obtn:hover { background: color-mix(in srgb, var(--c) 20%, var(--um-panel)); }
  .ptabs { display: flex; align-items: center; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--um-border); }
  .ptablist { display: flex; align-items: center; gap: 2px; min-width: 0; } /* only tabs in it: ‹ › stand beside it */
  .ptab { border: 0; border-bottom: 2px solid transparent; background: none; color: var(--um-muted); font: 500 13px var(--um-sans); padding: 7px 10px; cursor: pointer; white-space: nowrap; }
  .ptab em { font-style: normal; font-size: 11px; color: var(--um-muted); margin-left: 4px; }
  .ptab:hover { color: var(--um-text); }
  .ptab[aria-selected="true"] { color: var(--um-text); font-weight: 650; border-bottom-color: var(--um-accent); }
  .pnav { margin-left: auto; display: flex; gap: 4px; }
  .pbody { padding: 10px 18px 14px; }
  .pbody h4 { margin: 0 0 4px; font: 700 10px var(--um-sans); letter-spacing: .1em; text-transform: uppercase; color: var(--um-muted); display: flex; gap: 6px; }
  .pbody h4 span { color: var(--um-muted); }
  .clamp { font-size: 14px; line-height: 1.55; max-width: 980px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .clamp.open { display: block; -webkit-line-clamp: unset; }
  .clamp p { margin: 0 0 6px; } .clamp ul { margin: 0 0 6px; padding-left: 18px; }
  .detail-bullets { margin: 0; padding-left: 18px; max-width: 1100px; font-size: 13px; line-height: 1.65; }
  .detail-bullets li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; }
  .detail-bullets li::before { content: '•'; margin-right: 8px; color: var(--um-accent); }
  .links ul { margin: 0; padding: 0; list-style: none; }
  .links li { margin: 0; }
  .morebtn { border: 0; background: none; color: var(--um-accent); font: 600 12px var(--um-sans); padding: 2px 0 0; cursor: pointer; }
  .pnone { color: var(--um-muted); font-size: 13px; }
  .pverbs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pverb { font: 600 12px var(--um-sans); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); background: color-mix(in srgb, var(--c) 8%, transparent); padding: 1px 9px; border-radius: 999px; }
  button.pverb { cursor: pointer; } button.pverb:hover { background: color-mix(in srgb, var(--c) 18%, transparent); }
  .links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 22px; }
  .src { display: flex; align-items: center; gap: 6px; min-width: 0; } .src a, .src span { font: 12px var(--um-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .rel { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 0 8px; align-items: center; text-align: left; background: none; border: 0; padding: 4px 6px; margin: 0 -6px; width: calc(100% + 12px); border-radius: 6px; cursor: pointer; color: var(--um-text); font: 13px var(--um-sans); }
  .rel:hover { background: var(--um-panel-2); }
  .rel i { width: 8px; height: 8px; border-radius: 50%; }
  .rel-l { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rel-e { font-size: 11.5px; color: var(--um-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
  .rel-none { color: var(--um-muted); font-size: 12.5px; padding: 2px 0; }
  /* one yellow highlighter phrase per section (==text== in the model) */
  .pbody mark { background: var(--um-mark); color: inherit; padding: 0 3px; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  /* Example tab: a data-driven gallery (node.examples = [{title, caption, thumb, full, href}]) */
  .exs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin: 4px 0 0; padding: 0; list-style: none; max-width: 1100px; }
  .ex { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ex-thumb { display: block; padding: 0; border: 1px solid var(--um-border-2); border-radius: 8px; background: var(--um-panel-2); overflow: hidden; cursor: zoom-in; aspect-ratio: 16 / 10; }
  .ex-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
  .ex-thumb:hover, .ex-thumb:focus-visible { border-color: var(--um-accent); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--um-accent) 30%, transparent); }
  .ex b { font: 650 13px var(--um-sans); }
  .ex small { color: var(--um-muted); font-size: 12px; line-height: 1.4; }
  .ex a { color: var(--um-accent); font: 600 12px var(--um-sans); text-decoration: none; }
  .ex a:hover { text-decoration: underline; }
  .lightbox { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px; background: var(--um-scrim); }
  .lightbox[hidden] { display: none; }
  .lightbox figure { margin: 0; max-width: min(1280px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; background: var(--um-panel); border-radius: 12px; padding: 12px; box-shadow: var(--um-shadow); }
  .lightbox img { max-width: 100%; max-height: calc(100dvh - 140px); object-fit: contain; border-radius: 6px; border: 1px solid var(--um-border); background: var(--um-logo-tile); }
  .lightbox figcaption { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font: 600 14px var(--um-sans); }
  .lightbox figcaption span { flex: 1; min-width: 0; }
  .lightbox figcaption a { color: var(--um-accent); text-decoration: none; font-size: 13px; }
  .pviews { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .pview { font: 500 12px var(--um-sans); color: var(--um-muted); background: var(--um-panel-2); border: 1px solid var(--um-border); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .pview:hover { color: var(--um-text); border-color: var(--um-accent); }
  @media (max-width: 820px) {
    .ph { padding-top: 6px; } .ph .obtn span { display: none; }
    .links { grid-template-columns: 1fr; }
    .ptabs, .ptablist { flex-wrap: wrap; } .pnav { display: none; } .ptab { padding: 7px 8px; }
    .detail-bullets li { white-space: normal; overflow: visible; }
    .exs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .m-legend, .hint:not(.msg) { display: none; } /* a message shows, as a toast (issue 134) */
    .hint.msg { left: 12px; right: 12px; bottom: 12px; height: auto; min-height: 28px; padding: 6px 12px; white-space: normal; text-align: center; border: 1px solid var(--um-border); border-radius: 10px; box-shadow: var(--um-shadow); }
  }
  /* render()'s pieces (#99), laid out as the page lays them out: the views list left of the map (☰ or O), the details under
     it, the legend and the hint line over it; while a story is told, the legend gives way to its caption bar */
  .um-frame { position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) / 0 minmax(0, 1fr); transition: grid-template-columns .22s ease; }
  .um-frame.tree-open { grid-template-columns: min(var(--browser-width, 224px), 38%) minmax(0, 1fr); }
  .um-main { grid-area: 1 / 2; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .um-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .um-frame > .outline { grid-area: 1 / 1; }
  .um-navbtn { grid-area: 1 / 2; align-self: start; justify-self: start; margin: 14px 16px; z-index: 4; }
  .um-stage:has(.um-story) > .m-legend { display: none; }
  /* a lens's legend (#94): each owner's tone, over the controls */
  .um-lens { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; box-sizing: border-box; max-width: 300px; padding: 6px 11px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); color: var(--um-text); font: 12px/1.5 var(--um-sans); }
  .um-lens b { font: 700 10px var(--um-sans); letter-spacing: .1em; text-transform: uppercase; color: var(--um-muted); } .um-lens span { white-space: nowrap; }
  .um-lens i { display: inline-block; width: 8px; height: 8px; border: 2.5px solid; border-radius: 4px; margin-right: 6px; vertical-align: -1px; }
` +/* each tone's tint (--um-<tone>-f), mixed at the map from the tone and panel in effect there: mixed on :root (as the theme
     file does, for page chrome) a tint keeps the tone it was mixed from, whatever an ancestor of the map sets later. A kind's
     tint (every tone but the accent) is --um-tint times as deep: 1 by default, 0 for none, never past 18%, where a card's
     sub-line would fall below 4.5:1 */
  `:host { ${Object.entries({ accent: 12, cyan: 9, green: 9, violet: 9, amber: 10, rose: 8, orange: 9, slate: 8, fuchsia: 8, 'k-public': 8, 'k-lane': 8,
    'k-ext': 7, 'k-verb': 7, 'k-script': 5, 'k-hook': 12, 'k-board': 9 }).map(([t, p]) => `--um-${t}-f: color-mix(in srgb, var(--um-${t}) ${t === 'accent' ? p + '%' : `min(${p}% * var(--um-tint, 1), 18%)`}, var(--um-panel));`).join(' ')} }`;

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
const r2 = v => Math.round(v * 100) / 100;
function rrect(x, y, w, h, r) { // a rounded rect's path; r: one radius, or [top left, top right, bottom right, bottom left]
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r], A = (q, X, Y) => q ? `A${r2(q)} ${r2(q)} 0 0 1 ${r2(X)} ${r2(Y)}` : '';
  return `M${r2(x + a)} ${r2(y)}H${r2(x + w - b)}${A(b, x + w, y + b)}V${r2(y + h - c)}${A(c, x + w - c, y + h)}H${r2(x + d)}${A(d, x, y + h - d)}V${r2(y + a)}${A(a, x + a, y)}Z`;
}
const cornerIn = (r, t, a, b) => t < a + r ? r - Math.sqrt(Math.max(0, r * r - (a + r - t) ** 2)) : t > b - r ? r - Math.sqrt(Math.max(0, r * r - (t - b + r) ** 2)) : 0;
const rectIn = (n, s, t, r) => s === 'L' || s === 'R' ? cornerIn(r, t, n.y, n.y + n.h) : cornerIn(r, t, n.x, n.x + n.w);
const ellIn = (e, u, r) => e * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); // an ellipse's depth at u from its axis
const grown = (n, d) => ({ ...n, x: n.x - d, y: n.y - d, w: n.w + 2 * d, h: n.h + 2 * d });
const deeper = (k, p) => `color-mix(in srgb, var(--um-${KIND[k][0]}) ${p}%, var(--um-${KIND[k][0]}-f))`; // a detail's tint, over the card's own
const BAR = 14; // a window's title bar: browser, window, terminal
function chrome(n, c, k, what) { // a tinted title bar, three dots after the card's tabs, then an address field (browser) or a prompt (terminal)
  const { x, y, w } = n, x0 = Math.max(x, n.tabEnd || x), end = n.chromeEnd || x + w - 10;
  const dots = [9, 15.5, 22].map(d => `<circle cx="${r2(x0 + d)}" cy="${y + 7}" r="2.1" class="n-dot depth-read" fill="${c}"/>`).join('');
  const more = what === 'browser' && end - x0 - 30 > 24 ? `<path d="${rrect(x0 + 30, y + 3.5, end - x0 - 30, 7, 3.5)}" class="n-field depth-read" stroke="${c}"/>`
    : what === 'terminal' && end - x0 - 30 > 14 ? `<text x="${r2(x0 + 31)}" y="${y + 10.6}" class="n-prompt" fill="${c}">&gt;_</text>` : '';
  return `<path d="${rrect(x + .75, y + .75, w - 1.5, BAR - .75, [9.25, 9.25, 0, 0])}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + BAR}H${x + w}" class="n-det n-accent" stroke="${c}"/>${dots}${more}`;
}
// where a person's or robot's body starts: b px down, or just above the highest line or feed that ends on its left or right
// side (n.portTop, from the lines as laid out), so each one lands on its outline
const bodyTop = (n, b) => Math.min(n.y + b, (n.portTop ?? Infinity) - 1);
// each card's highest line end on its left side and on its right (a view's feeds end on the left), as laid out
function sidePorts(g) {
  const m = new Map(), at = (n, side, y) => { if (!n || (side !== 'L' && side !== 'R')) return; const o = m.get(n) || { L: Infinity, R: Infinity }; o[side] = Math.min(o[side], y); m.set(n, o); };
  (g.edges || []).forEach(e => { if (e.pts && e.pts.length) { at(e.s, e.fs, e.pts[0][1]); at(e.t, e.ts, e.pts[e.pts.length - 1][1]); } });
  (g.intake || []).forEach(b => at((g.byId || {})[b.to], 'L', b.pts[b.pts.length - 1][1]));
  return m;
}
const boxOut = r => (n, d = 0) => { const g = grown(n, d); return rrect(g.x, g.y, g.w, g.h, r + d); };
const SHAPE = {
  box: { out: boxOut(10), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10) },
  person: { // the C4 model's person: a head over a body with wide, flat shoulders. The body starts 12 px down, or higher where
    // a line ends on its side above that (bodyTop)
    head: 13,
    g(n, d = 0) { const r = 13 + d, cx = n.hx ?? n.x + n.w / 2, hy = n.y + 13, bt = bodyTop(n, 12) - d, sx = 20 + d, sy = 12 + d; return { r, cx, hy, bt, sx, sy, k: Math.sqrt(Math.max(0, r * r - (bt - hy) ** 2)) }; },
    out(n, d = 0) { const { r, cx, hy, bt, sx, sy, k } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + sy)}A${sx} ${sy} 0 0 1 ${r2(x + sx)} ${r2(bt)}H${r2(cx - k)}A${r} ${r} 0 ${bt > hy ? 1 : 0} 1 ${r2(cx + k)} ${r2(bt)}H${r2(x + w - sx)}A${sx} ${sy} 0 0 1 ${r2(x + w)} ${r2(bt + sy)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 12), n.y + n.h], tabY: n => bodyTop(n, 12),
    det(n, c) { const { r, cx, hy, bt, k } = this.g(n); return `<path d="M${r2(cx - k)} ${r2(bt)}A${r} ${r} 0 ${bt < hy ? 1 : 0} 0 ${r2(cx + k)} ${r2(bt)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const { r, cx, hy, bt, sx, sy } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + sy ? ellIn(sx, bt + sy - t, sy) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = t - cx; if (Math.abs(u) < r) return Math.min(hy - Math.sqrt(r * r - u * u), bt) - n.y;
      const e = t < n.x + sx ? n.x + sx - t : t > n.x + n.w - sx ? t - n.x - n.w + sx : 0; return bt - n.y + ellIn(sy, e, sx); } },
  robot: { // Structurizr's robot, and UML's non-human actor: the person's body under a square head with ears
    head: 19,
    // a body that starts higher than 14 px down (bodyTop) has a head as much shorter, its ears and corners with it
    g(n, d = 0) { const B = bodyTop(n, 14), f = (B - n.y) / 14; return { cx: n.hx ?? n.x + n.w / 2, hw: 14 + d, ht: n.y - d, bt: B - d, ew: 19 + d, e0: n.y + 4 * f - d, e1: n.y + 10 * f + d, S: 8 + d, hr: 5 * f + d, ey: n.y + 7.5 * f }; },
    out(n, d = 0) { const { cx, hw, ht, bt, ew, e0, e1, S, hr } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + S)}A${S} ${S} 0 0 1 ${r2(x + S)} ${r2(bt)}H${r2(cx - hw)}V${r2(e1)}H${r2(cx - ew)}V${r2(e0)}H${r2(cx - hw)}V${r2(ht + hr)}A${hr} ${hr} 0 0 1 ${r2(cx - hw + hr)} ${r2(ht)}H${r2(cx + hw - hr)}A${hr} ${hr} 0 0 1 ${r2(cx + hw)} ${r2(ht + hr)}V${r2(e0)}H${r2(cx + ew)}V${r2(e1)}H${r2(cx + hw)}V${r2(bt)}H${r2(x + w - S)}A${S} ${S} 0 0 1 ${r2(x + w)} ${r2(bt + S)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 14), n.y + n.h], tabY: n => bodyTop(n, 14),
    det(n, c) { const { cx, ey } = this.g(n); return [-5.5, 5.5].map(o => `<circle cx="${r2(cx + o)}" cy="${r2(ey)}" r="1.6" class="n-det n-accent" fill="${c}" stroke="${c}"/>`).join(''); },
    inset(n, s, t) { const { cx, hw, ew, e0, bt, S, hr } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + S ? S - Math.sqrt(S * S - (bt + S - t) ** 2) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = Math.abs(t - cx); return u < hw ? cornerIn(hr, u, -1e6, hw) : u < ew ? e0 - n.y : bt - n.y + cornerIn(S, t, n.x, n.x + n.w); } },
  browser: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'browser') },
  window: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'window') },
  terminal: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'terminal') },
  mobile: { // a phone on its side, as the C4 model's example draws its mobile app (MobileDeviceLandscape): a screen, a home button, a speaker
    out: boxOut(14), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 14),
    det(n, c) { const { x, y, w, h } = n, cy = y + h / 2;
      return `<path d="${rrect(x + 11, y + 5, w - 22, h - 10, 5)}" class="n-screen n-accent" stroke="${c}"/><circle cx="${x + 6.6}" cy="${r2(cy)}" r="2.1" class="n-det" stroke="${c}"/><path d="M${r2(x + w - 6.2)} ${r2(cy - 7)}V${r2(cy + 7)}" class="n-det n-speaker" stroke="${c}"/>`; } },
  cylinder: { // a data store: its lid tinted, the lid's front edge its accent
    ry: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const ry = this.ry(n), { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x + w)} ${r2(y + ry)}V${r2(y + h - ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x)} ${r2(y + h - ry)}Z`; },
    face(n) { return [n.y + this.ry(n), n.y + n.h]; },
    det(n, c, k) { const ry = this.ry(n), { x, y, w } = n;
      return `<ellipse cx="${r2(x + w / 2)}" cy="${y + ry}" rx="${r2(w / 2 - .75)}" ry="${ry - .75}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + ry}A${r2(w / 2)} ${ry} 0 0 0 ${r2(x + w)} ${y + ry}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const ry = this.ry(n), rx = n.w / 2; if (s === 'T' || s === 'B') return ellIn(ry, t - n.x - rx, rx);
      const a = n.y + ry, b = n.y + n.h - ry; return t >= a && t <= b ? 0 : ellIn(rx, t < a ? a - t : t - b, ry); } },
  pipe: { // a queue: a cylinder on its side, open at the right where the work leaves; dots on its floor move with the flow
    e: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const e = this.e(n), { x, y, w, h } = grown(n, d); return `M${r2(x + e)} ${r2(y)}H${r2(x + w - e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + w - e)} ${r2(y + h)}H${r2(x + e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + e)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const e = this.e(n), { x, y, w, h } = n;
      return `<ellipse cx="${x + w - e}" cy="${r2(y + h / 2)}" rx="${e - .75}" ry="${r2(h / 2 - .75)}" fill="${deeper(k, 10)}"/><path d="M${x + w - e} ${y}A${e} ${r2(h / 2)} 0 0 0 ${x + w - e} ${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + e + 6} ${r2(y + h - 6.5)}H${x + w - 2 * e - 6}" class="n-floor" stroke="${c}"/>`; },
    inset(n, s, t) { const e = this.e(n), ry = n.h / 2; if (s === 'L' || s === 'R') return ellIn(e, t - n.y - ry, ry);
      const a = n.x + e, b = n.x + n.w - e; return t >= a && t <= b ? 0 : ellIn(ry, t < a ? a - t : t - b, e); } },
  document: { // a file: UML's artifact, a page with its corner folded (and umlimator's own file sigil)
    out(n, d = 0) { const { x, y, w, h } = grown(n, d), R = 10 + d, f = 10;
      return `M${r2(x + R)} ${r2(y)}H${r2(x + w - f)}L${r2(x + w)} ${r2(y + f)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}V${r2(y + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const { x, y, w } = n; return `<path d="M${x + w - 10} ${y}V${y + 7.5}Q${x + w - 10} ${y + 10} ${x + w - 7.5} ${y + 10}H${x + w}Z" fill="${deeper(k, 16)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { if (s === 'R' && t < n.y + 10) return 10 - (t - n.y); if (s === 'T' && t > n.x + n.w - 10) return t - (n.x + n.w - 10); return rectIn(n, s, t, 10); } },
  hexagon: { // the hook card's hexagon, for any card
    hx: n => Math.min(16, n.h / 3),
    out(n, d = 0) { const hx = this.hx(n), { x, y, w, h } = grown(n, d); return `M${r2(x + hx)} ${r2(y)}H${r2(x + w - hx)}L${r2(x + w)} ${r2(y + h / 2)}L${r2(x + w - hx)} ${r2(y + h)}H${r2(x + hx)}L${r2(x)} ${r2(y + h / 2)}Z`; },
    face: n => [n.y, n.y + n.h],
    inset(n, s, t) { const hx = this.hx(n); if (s === 'L' || s === 'R') return hx * Math.abs(t - n.y - n.h / 2) / (n.h / 2);
      const a = n.x + hx, b = n.x + n.w - hx; return t < a ? (a - t) * n.h / 2 / hx : t > b ? (t - b) * n.h / 2 / hx : 0; } },
  folder: { // UML's package: a folder with its tab on top, after the card's own tabs
    tw: n => Math.min(64, Math.round(n.w * .34)),
    out(n, d = 0) { const tw = this.tw(n), x0 = n.tabX ?? n.x, { x, y, w, h } = grown(n, d), r = 4 + d, R = 8 + d, th = 9, X0 = x0 - d, T1 = x0 + tw + d;
      const head = X0 <= x + .5 ? `M${r2(x)} ${r2(y + h - R)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(x + r)} ${r2(y)}`
        : `M${r2(x)} ${r2(y + h - R)}V${r2(y + th + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y + th)}H${r2(X0)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(X0 + r)} ${r2(y)}`;
      return `${head}H${r2(T1 - 3)}Q${r2(T1)} ${r2(y)} ${r2(T1 + 1.5)} ${r2(y + 2.5)}L${r2(T1 + 5)} ${r2(y + th)}H${r2(x + w - R)}A${R} ${R} 0 0 1 ${r2(x + w)} ${r2(y + th + R)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}Z`; },
    face: n => [n.y + 9, n.y + n.h], tabY: n => n.y + 9,
    det(n, c, k) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      return `<path d="M${r2(x0 + .75)} ${n.y + 9}V${n.y + 4}A3.25 3.25 0 0 1 ${r2(x0 + 4)} ${n.y + .75}H${r2(x0 + tw - 3)}Q${r2(x0 + tw)} ${n.y + .75} ${r2(x0 + tw + 1.5)} ${n.y + 3}L${r2(x0 + tw + 4.4)} ${n.y + 9}Z" fill="${deeper(k, 14)}"/><path d="M${r2(x0)} ${n.y + 9}H${r2(x0 + tw + 5)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      if (s === 'T') return t >= x0 && t <= x0 + tw ? 0 : 9 + cornerIn(8, t, x0 > n.x + .5 ? n.x : -1e6, n.x + n.w);
      if (s === 'B') return rectIn(n, s, t, 8);
      // the side's top: a tab at the card's left corner has a 4 px corner at the top; elsewhere the body starts 9 px down, 8 px round
      const top = s === 'L' && x0 <= n.x + .5 ? cornerIn(4, t, n.y, 1e6) : t < n.y + 9 ? null : cornerIn(8, t, n.y + 9, 1e6);
      return top == null || top > 0 ? top : cornerIn(8, t, -1e6, n.y + n.h); } },
  node: { // UML's node: a box seen in perspective, for hosts and devices
    out(n, d = 0) { const p = 7, { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + p)}L${r2(x + p)} ${r2(y)}H${r2(x + w)}V${r2(y + h - p)}L${r2(x + w - p)} ${r2(y + h)}H${r2(x)}Z`; },
    face: n => [n.y + 7, n.y + n.h],
    det(n, c, k) { const p = 7, { x, y, w, h } = n;
      return `<path d="M${x + 1} ${y + p}L${x + p} ${y + 1}H${x + w - 1}L${x + w - p} ${y + p}Z" fill="${deeper(k, 12)}"/><path d="M${x + w - p} ${y + p}L${x + w - 1} ${y + 1}V${y + h - p}L${x + w - p} ${y + h - 1}Z" fill="${deeper(k, 22)}"/>`
        + `<path d="M${x} ${y + p}H${x + w - p}V${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + w - p} ${y + p}L${x + w} ${y}" class="n-det" stroke="${c}"/>`; },
    inset(n, s, t) { const p = 7; return s === 'L' ? Math.max(0, n.y + p - t) : s === 'R' ? Math.max(0, t - n.y - n.h + p) : s === 'T' ? Math.max(0, n.x + p - t) : Math.max(0, t - n.x - n.w + p); } },
};
const SHAPE_NAMES = ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node']; // all 13
// a card's shape in a notation: its own `shape` first; box draws every card as before (a hook stays a hexagon there too)
const shapeOf = (n, notation) => { const sh = String(n.shape ?? '').toLowerCase(); if (SHAPE_NAMES.includes(sh)) return sh;
  const T = hasKey(NOTED, notation) && NOTED[notation], k = String(n.kind ?? '').toLowerCase(); return T ? (hasKey(T, k) && T[k]) || (hasKey(T, n.k) && T[n.k]) || 'box' : 'box'; };
const noteOf = x => NOTATIONS.includes(x) ? x : null;
// a card as its notation draws it (null for a box): its shape, and where its head, folder tab and title bar go, clear of its
// tabs, ⤢ and change badge. Drawing only: layout never sees it. ports: the card's highest line ends on its sides (sidePorts)
function cardLook(n, notation, hint, ports) {
  const sh = shapeOf(n, notation); if (sh === 'box') return null;
  const S = SHAPE[sh], L = { ...n, sh, S, portTop: ports ? Math.min(ports.L, ports.R) : Infinity, portL: ports ? ports.L : Infinity }, tabs = mapTabs(n), spans = []; let tx = n.x + 12;
  // a step keeps 16 px above the highest line into the left side (svgOf): where that is above a person's or robot's shoulder,
  // the shoulder comes up under it, 5 px below its middle (it floated 4 px above the shoulder)
  if (n.step && S.head && L.portL - 16 < S.tabY(L)) L.portTop = Math.min(L.portTop, Math.max(n.y, L.portL - 16) + 6);
  tabs.forEach(t => { spans.push([tx, tx + t.w]); tx += t.w + 4; });
  L.tabEnd = tabs.length ? tx - 2 : 0;
  const right = []; if (hint) right.push([n.x + n.w - 44, n.x + n.w - 8]);
  const ch = CHG[String(n.change || '').toLowerCase()]; if (ch) { const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint ? 40 : 0); right.push([bx, bx + bw]); }
  L.chromeEnd = Math.min(n.x + n.w - 10, ...right.map(s => s[0] - 6));
  const half = (S.head || 0) + 4;
  if (S.head) { // a head in the middle, unless a tab or a badge is there: then in the widest gap they leave
    const all = [...spans, ...right], lo = n.x + 22, hi = n.x + n.w - 22, mid = n.x + n.w / 2;
    let gaps = [[lo, hi]]; all.forEach(([a, b]) => { gaps = gaps.flatMap(([p, q]) => b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v > u)); });
    const fits = gaps.filter(([p, q]) => q - p >= 2 * half), best = fits.find(([p, q]) => p <= mid - half && q >= mid + half) ? [mid - half, mid + half]
      : fits.sort((u, v) => Math.abs((u[0] + u[1]) / 2 - mid) - Math.abs((v[0] + v[1]) / 2 - mid))[0];
    L.hx = best ? Math.min(Math.max(mid, best[0] + half), best[1] - half) : mid;
  }
  if (sh === 'folder') L.tabX = tabs.length ? Math.min(L.tabEnd + 4, n.x + n.w - SHAPE.folder.tw(n) - 14) : n.x;
  // what else is on the tab line after the card's own tabs: ⤢, the change badge, a head (a robot's with its ears), a folder's tab
  L.busy = [...right, ...(S.head ? [[L.hx - S.head, L.hx + S.head]] : []), ...(sh === 'folder' ? [[L.tabX, L.tabX + SHAPE.folder.tw(n) + 5]] : [])];
  return L;
}
// where a tab w wide goes after the card's own tabs (an overlay's or a lens's badge): on a shape, the first place inside the
// card 2 px clear of what L.busy names, else the place inside it that covers least of them; on a box, or where the card's
// own tabs fill it, right after them
function tabAfter(n, L, w) {
  const x0 = mapTabs(n).reduce((a, t) => a + t.w + 4, n.x + 12); if (!L) return x0;
  const max = n.x + n.w - 2 - w, over = x => L.busy.reduce((s, [a, b]) => s + Math.max(0, Math.min(x + w, b + 2) - Math.max(x, a - 2)), 0);
  return [x0, ...L.busy.map(b => b[1] + 4), max].filter(x => x >= x0 && x <= max).reduce((b, x) => over(x) < over(b) ? x : b, x0);
}
// the line a card's tabs, ⤢, change badge and step sit on: a shape's top (a person's shoulders), else the box's
const tabLine = (n, L) => L && L.S.tabY ? L.S.tabY(L) : n.y;
const SIDE_OUT = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
// a line as drawn: its ends slid from the card's box onto the card's outline, along the side's normal (the stub lengthens
// by as much); layout's points stay as they are. look(n): the card's look, or null for a box
function drawnPts(e, look) {
  const a = e.s && !e.s.box ? look(e.s) : null, b = e.t && !e.t.box ? look(e.t) : null;
  if (!a && !b) return e.pts;
  const slide = (L, side, p) => { const [ox, oy] = SIDE_OUT[side] || [0, 0], k = L.S.inset(L, side, side === 'L' || side === 'R' ? p[1] : p[0]) || 0; return [r2(p[0] - ox * k), r2(p[1] - oy * k)]; };
  const pts = e.pts.map(p => p.slice());
  if (a) pts[0] = slide(a, e.fs, pts[0]);
  if (b) pts[pts.length - 1] = slide(b, e.ts, pts[pts.length - 1]);
  return pts;
}
const CHG = { added: ['green', 'NEW'], new: ['green', 'NEW'], modified: ['amber', 'CHANGED'], changed: ['amber', 'CHANGED'], removed: ['rose', 'REMOVED'], planned: ['cyan', 'PLANNED'] };
const NW = 168, CG0 = 84, RG0 = 44;
const pillW = (label, sub, max = 440) => Math.max(sansW(fit(label, 10.5, max), 10.5, .92), sub ? sansW(fit(sub, 9.5, max), 9.5, .92) : 0) + 18; // a line's label, and its sublabel under it (#44)
const stepW = s => String(s).length > 1 ? Math.max(20, sansW(String(s), 9.5, .9) + 8) : 16; // a line's step mark: a 16 px circle, or a pill for 2a, 12 or 4.1 (#82)
// steps in order: numbers by value, text by its leading number and then the rest (2 < 2a < 2b < 3); no step last
const stepKey = s => { const t = String(s ?? ''), m = /^\d+(?:\.\d+)?/.exec(t); return [s == null ? 1 : 0, m ? +m[0] : Infinity, m ? t.slice(m[0].length) : t]; };
const stepOrder = (a, b) => { const p = stepKey(a), q = stepKey(b); return p[0] - q[0] || p[1] - q[1] || (p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : 0); };
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
// pts shortened by a at the start and b at the end, along its own segments: a line's flow stops where an arrowhead begins
const trimLine = (pts, a, b) => {
  const cut = (p, d) => { p = p.map(q => q.slice());
    while (d > 0 && p.length > 1) { const [x0, y0] = p[p.length - 2], [x1, y1] = p[p.length - 1], len = Math.hypot(x1 - x0, y1 - y0);
      if (len > d) { const t = (len - d) / len; p[p.length - 1] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; break; }
      d -= len; p.pop(); }
    return p; };
  return cut(cut(pts, b).reverse(), a).reverse();
};
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
const warned = new Set(), warn = m => { if (hush) hush.push(m); else if (!warned.has(m)) { warned.add(m); console.warn('umlimator: ' + m); } }; // each warning once
let hush = null; // a layout tried and maybe dropped (unfolding, #71) keeps its warnings here: only the one kept says them

/* Layered auto-layout for views that carry no col/row: longest-path layers (cycles broken by DFS),
   barycentre ordering sweeps, integer rows so row gaps stay free as routing channels. */
/* Lines cross as little as the order of the cards in a column allows (#53): a few barycentre sweeps (each card goes where
   its neighbours in the next or previous column lie, its place now breaking ties), and the best order found is kept only
   when it crosses less than the order given. A line that skips columns has a point in each column it passes (Sugiyama's
   dummy nodes), so it orders the cards it runs between too. cols: columns of ids in reading order, changed in place;
   links: [a, b] with b in a later column.
   A box is one item of its column, h(id) rows tall, and a line meets it at the row of its card inside (#86): [a, b, oa, ob]
   leaves a at row oa inside it and reaches b at row ob, as rowsFor's links do (the middle when not given). Each line into a
   box has its own entry, so two that cross on the way in to its cards count as crossing; they all met it at one point.
   fixed: items at a set row in columns of their own, which stay as they are (a box's far ends, in blockPos). */
function untangle(cols, links, h = () => 1, fixed = {}) {
  const colOf = {}; cols.forEach((c, k) => c.forEach(id => { colOf[id] = k; }));
  const segs = [], extra = new Set(), want = {}, hh = id => extra.has(id) ? 1 : h(id), mid = (id, o) => o ?? (hh(id) - 1) / 2;
  const tops = () => { const at = {}; cols.forEach(c => { let r = 0; c.forEach(id => { at[id] = fixed[id] ?? r; r += hh(id); }); }); return at; }; // each item's top row
  const at0 = tops();
  links.forEach(([a, b, oa, ob], n) => {
    const ka = colOf[a], kb = colOf[b]; if (ka == null || kb == null || kb <= ka) return;
    let prev = a, po = mid(a, oa); const ra = at0[a] + po, rb = at0[b] + mid(b, ob);
    for (let k = ka + 1; k < kb; k++) { // a point first goes where the straight line between its ends would be
      const p = '\u0001' + n + '.' + k; extra.add(p); colOf[p] = k; want[p] = ra + (rb - ra) * (k - ka) / (kb - ka);
      segs.push([prev, p, po, 0]); prev = p; po = 0; }
    segs.push([prev, b, po, mid(b, ob)]);
  });
  if (extra.size) cols.forEach((c, k) => { const ps = [...extra].filter(p => colOf[p] === k);
    if (ps.length) cols[k] = [...c.map(id => [id, at0[id], 0]), ...ps.map(p => [p, want[p], 1])].sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(x => x[0]); });
  const ins = {}, outs = {}; segs.forEach(([a, b, oa, ob]) => { (outs[a] ||= []).push([b, ob, oa]); (ins[b] ||= []).push([a, oa, ob]); });
  const crossings = () => { const at = tops(); let n = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const [a, b, oa, ob] = segs[i], [c, d, oc, od] = segs[j];
      if (colOf[a] === colOf[c] && (at[a] + oa - at[c] - oc) * (at[b] + ob - at[d] - od) < 0) n++; }
    return n; };
  let best = segs.length > 1 ? crossings() : 0, keep = cols.map(c => c.slice()); // the order given, unless one crosses less
  for (let it = 0; it < 8 && best; it++) {
    const down = it % 2 === 0, seq = cols.map((_, k) => k).filter(k => (down ? k > 0 : k < cols.length - 1) && !cols[k].every(id => id in fixed));
    if (!down) seq.reverse();
    for (const k of seq) { const at = tops(), side = down ? k - 1 : k + 1; // where each item would be for its lines to run level
      const key = id => { const nb = ((down ? ins : outs)[id] || []).filter(([x]) => colOf[x] === side).map(([x, ox, o]) => at[x] + ox - o);
        return nb.length ? nb.reduce((x, y) => x + y, 0) / nb.length : at[id]; };
      cols[k] = cols[k].map((id, i) => [id, key(id), i]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map(x => x[0]); }
    const n = crossings(); if (n < best) { best = n; keep = cols.map(c => c.slice()); }
  }
  keep.forEach((c, k) => { cols[k] = c.filter(id => !extra.has(id)); });
}
/* A card no line comes into goes just before its nearest callee, not in the first column: its lines get shorter. Returns
   the ranks with it moved, or null when none moves (bestFlow keeps them when they route better). */
function pullSources(ids, links, rank) {
  const into = new Set(links.map(([, b]) => b)); let moved = false; const out = { ...rank };
  ids.forEach(i => { const to = links.filter(([a]) => a === i).map(([, b]) => rank[b]).filter(r => r != null);
    if (to.length && !into.has(i) && Math.min(...to) - 1 > rank[i]) { out[i] = Math.min(...to) - 1; moved = true; } });
  return moved ? out : null;
}
/* Rows for ordered columns: each card level with the cards its lines come from (the median row), then with those they go
   to, then again from the left, as near as the order allows with its height between it and the next (least squares: pool
   adjacent violators); on half rows from 0. A line between cards on one row runs straight, past fewer cards. h: an item's
   height in rows (a box in a view with boxes); a link [a, b, oa, ob] leaves a at row oa inside it and reaches b at row
   ob (a box's card), else at its middle. fixed: items at a set row, in columns of their own that stay (as untangle's). */
function rowsFor(cols, links, h = () => 1, fixed = {}) {
  const row = {}, colOf = {}; cols.forEach((c, k) => { let r = 0; c.forEach(id => { row[id] = fixed[id] ?? r; r += h(id); colOf[id] = k; }); });
  const ins = {}, outs = {}, at = (id, o) => o ?? (h(id) - 1) / 2; // where a link meets an item, in rows from its top
  links.forEach(([a, b, oa, ob]) => { if (colOf[a] == null || colOf[b] == null || colOf[b] <= colOf[a]) return;
    (outs[a] ||= []).push([b, at(b, ob), at(a, oa)]); (ins[b] ||= []).push([a, at(a, oa), at(b, ob)]); });
  const median = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fit = (list, want) => { const blocks = []; let off = 0;
    list.forEach(id => { blocks.push({ ids: [id], sum: want[id] - off, n: 1 }); off += h(id);
      while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).n > blocks.at(-1).sum / blocks.at(-1).n) { const b = blocks.pop(), a = blocks.at(-1); a.ids.push(...b.ids); a.sum += b.sum; a.n += b.n; } });
    off = 0; blocks.forEach(b => b.ids.forEach(id => { row[id] = b.sum / b.n + off; off += h(id); })); };
  for (const [from, to, step] of [[1, cols.length, 1], [cols.length - 2, -1, -1], [1, cols.length, 1]])
    for (let k = from; k !== to; k += step) { if (cols[k].every(id => id in fixed)) continue; const want = {};
      cols[k].forEach(id => { const nb = (step > 0 ? ins : outs)[id] || []; want[id] = nb.length ? median(nb.map(([x, ox, o]) => row[x] + ox - o)) : row[id]; });
      fit(cols[k], want); }
  const low = Math.min(...Object.keys(row).filter(id => !(id in fixed)).map(id => row[id]));
  cols.forEach(c => !c.every(id => id in fixed) && c.forEach((id, i) => { row[id] = Math.round((row[id] - low) * 2) / 2; if (i) row[id] = Math.max(row[id], row[c[i - 1]] + h(c[i - 1])); }));
  return row;
}

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
  const sub = n.sub || n.sublabel || '', chips = (n.verbs || []).reduce((a, v) => a + textW(v, 9.5) + 14, -4); // its chips as svgOf draws them: each verb and 10 px, 4 px apart (#84)
  return Math.min(n.emphasis ? 205 : 386, Math.max(n.emphasis ? 146 : 138,
    Math.ceil(textW(n.label, px) + 70), badgesOf(n).length ? Math.ceil(badgesOf(n).reduce((a, b) => a + b.text.length * 6.4 + 10, 0) + (badgesOf(n).length - 1) * 4 + 120) : 0,
    Math.min(386, Math.ceil(Math.max(textW(sub, 10), chips) + 70))));
};
/* Geometry: node boxes, ports, orthogonal routes, label slots. A view with lines the router found no route for is laid
   out once more, with room where those lines need it (#40); a view whose lines all route keeps its geometry. */
function layoutGraph(dg, map) {
  let g = layoutPass(dg, map, null);
  if (g.room) { const g2 = layoutPass(dg, map, g.room, true); g2.ms.probe = g.ms.probe; g = g2; }
  // a label with no room where it fits: the view laid out again with room for it, kept with fewer issues and labels cut short
  if (g.labelRoom) { const g2 = layoutPass(dg, map, g.labelRoom, true), cut = h => h.edges.filter(e => (e.label || e.step != null) && (!e.lbl || e.lbl.short)).length;
    delete g.labelRoom; if (routeAudit(g2, '').length + cut(g2) < routeAudit(g, '').length + cut(g)) g = g2; }
  // two lines that still cross: one takes another side, and the view is laid out so once more, kept if it has fewer issues. A
  // line that closes a loop leaves its source on the far side, out round the map as a loop under the boxes does, and still comes
  // in on its target's near side (clinic's reminder, from the SMS gateway under Patient records, crossed the line into Patient
  // records); of two other lines, the steeper comes into its target's top or bottom (clinic's "Sends texts" with Clinic bookings
  // unfolded, up past Patient records into the SMS gateway's bottom). ponytail: a layout more, so only up to 30 cards (as
  // bestFlow); a larger view keeps its crossings
  const refs = [], pairs = map && !dg.quick && !dg.flipped && dg.nodes.length <= 30 ? routeAudit(g, '', null, refs).flatMap((s, k) => s.endsWith(' cross') ? [refs[k]] : []) : [];
  const far = { L: 'right', R: 'left', T: 'bottom', B: 'top' }, dy = e => (e.s.y + e.s.h / 2) - (e.t.y + e.t.h / 2), out = new Map();
  pairs.forEach(p => p.forEach(e => { if (e.back && !e.fixed && !e.fromSide) out.set(e.from + '>' + e.to, ['fromSide', far[e.fs]]); }));
  pairs.forEach(p => { const e = p.filter(e => !e.back && !e.fixed && !e.toSide && /[LR]/.test(e.ts) && dy(e)).sort((a, b) => Math.abs(dy(b)) - Math.abs(dy(a)))[0];
    if (e && !p.some(o => out.has(o.from + '>' + o.to))) out.set(e.from + '>' + e.to, ['toSide', dy(e) > 0 ? 'bottom' : 'top']); });
  let best = g, bestDg = dg, n = pairs.length ? routeAudit(g, '').length : 0;
  const attempt = d => { const h = layoutGraph({ ...d, flipped: true }, map), k = routeAudit(h, '').length; if (k < n) { best = h; bestDg = d; n = k; } };
  if (out.size) attempt({ ...dg, edges: dg.edges.map(e => out.has(e.from + '>' + e.to) ? { ...e, [out.get(e.from + '>' + e.to)[0]]: out.get(e.from + '>' + e.to)[1] } : e) });
  // two lines that still cross where neither can take another side without crossing the other (two cards that each feed the
  // same two cards, as web and admin feed kit and api-client in r15's monorepo, issue 111): one of them goes round the outside,
  // out its source's far side and into its target's top (bottom) from beyond. Of the first two crossing pairs, the lines from
  // two cards that both feed both their targets are tried first, then the pairs' own lines, each on its own (on the layout kept so far,
  // and on the first), and the best layout kept. ponytail: up to four layouts more, on views of up to 30 cards; r19/plain takes
  // about four times as long for them, and gains nothing
  const r2 = [], left = n && best !== g ? routeAudit(best, '', null, r2).flatMap((s, k) => s.endsWith(' cross') ? [r2[k]] : []) : pairs;
  const feeds = (s, t) => best.edges.some(o => o.s === s && o.t === t), both = ([a, b]) => { const k = a.t !== b.t && best.edges.filter(o => [a.t, b.t].includes(o.t) && feeds(o.s, a.t) && feeds(o.s, b.t)); return k && k.length >= 4 ? k : []; };
  const round = [...new Set([...left.slice(0, 2).flatMap(both), ...left.slice(0, 2).flat()])].filter(e => !e.back && !e.fixed && !e.fromSide && !e.toSide && /[LR]/.test(e.fs) && /[LR]/.test(e.ts));
  let tries = 4;
  round.forEach(e => { const side = { fromSide: e.fs === 'R' ? 'left' : 'right', toSide: dy(e) >= 0 ? 'top' : 'bottom' };
    [...new Set([bestDg, dg])].forEach(d => { if (n && tries-- > 0) attempt({ ...d, edges: d.edges.map(x => x.from === e.from && x.to === e.to ? { ...x, ...side } : x) }); }); });
  return best;
}
function layoutPass(dg, map, room, last) { // room: { x: { col: px }, y: { row: px } } (lx, ly: a label's, past the boxes'); last: lay out with it, find no more
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
  const boxed = new Set((dg.containers || []).flatMap(f => f.nodeIds || [])); // a box's row keeps to the box's columns
  nodes.forEach(n => { n.aside = map && !dg.abs && !ends.has(n.id) && n.row > low && !boxed.has(n.id); });
  cols.forEach(c => { const ns = nodes.filter(n => n.col === c && !n.aside); if (ns.length) colW[c] = Math.max(...ns.map(n => n.w)); });
  // a labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side (a
  // numbered line with no label: for its step mark)
  const gapAfter = {}, colOf = {}, boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if (map && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);
    // labelled lines that leave (or reach) one card side by side run 16 px apart, too close for their pills to stack,
    // so the pills sit next to each other: the gap fits them all, with 6 px between pills
    const sum = {};
    // a line to a container ends on its box's border, beside the box's nearest column of cards
    const inBox = (b, seen = new Set()) => { const c = !seen.has(b) && seen.add(b) && (dg.containers || []).find(f => f.id === b);
      return c ? [...(c.nodeIds || []), ...(dg.containers || []).filter(k => k.parent === b).flatMap(k => inBox(k.id, seen))] : []; };
    const near = (b, other) => { const cs = inBox(b).map(i => colOf[i]).filter(c => c != null); if (other == null || !cs.length) return null;
      const lo = Math.min(...cs), hi = Math.max(...cs); return other < lo ? lo : other > hi ? hi : null; };
    // a box in a box (an unfolded numbered view's lane, #82, or any nested box): a line to a card in one, or to the box that
    // holds it, crosses two borders
    const inLane = id => (dg.containers || []).some(f => f.parent && (f.parent === id || (f.nodeIds || []).includes(id)));
    (dg.edges || []).forEach(e => { const p = colOf[e.from] ?? near(e.from, colOf[e.to]), q = colOf[e.to] ?? near(e.to, colOf[e.from]); if (p == null || q == null || (!e.label && e.step == null) || Math.abs(p - q) !== 1) return;
      const c = Math.min(p, q), w = (e.label ? pillW(e.label, e.sublabel) : 0) + (e.step != null ? stepW(e.step) + (e.label ? 4 : 6) : 0), box = boxOf(e.from) !== boxOf(e.to) || !(e.from in colOf) || !(e.to in colOf) ? 48 + ([e.from, e.to].some(inLane) ? 12 : 0) : 0;
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
      const tabs = [...badgesOf(f).map((b, i) => ({ text: b.text, fill: toneOf(b), badge: i, w: b.text.length * 6.4 + 10 })), ...(f.unfolds ? [{ text: '⤡', fold: true, w: 28 }] : [])], all = tabs.reduce((a, t) => a + t.w + 4, -4); // an unfolded card's box: its ⤡ folds it (#71)
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
  // a label's room comes on top of what keeps the boxes apart
  if (room && (room.lx || room.ly)) { for (const [k, o] of [['lx', extraX], ['ly', extraY]]) Object.entries(room[k] || {}).forEach(([g, v]) => { o[g] = (o[g] || 0) + v; }); place(); }
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
  // a loop back out of a family runs under the frames: out the source's right side, down past every frame and card it
  // would cut through, left along the bottom, and up the gap right of its target into its near side, the lowest port
  // there (issue 128); where that would cut through a card, up into the target's bottom, as before. Loops into one target
  // nest: the outer comes up nearer the card, into the lower port.
  const inFam = n => families.filter(f => n.x >= f.x && n.x + n.w <= f.x + f.w && n.y >= f.y && n.y + n.h <= f.y + f.h);
  const unders = edges.filter(e => map && e.back && !e.fixed && (inFam(e.s).length || inFam(e.t).length));
  unders.forEach((e, k) => {
    // the source's other outgoing wires keep its middle port; the loop leaves lower down
    const { s, t } = e, sy = s.y + s.h / 2 + (edges.some(o => o !== e && o.from === s.id && !o.back) ? s.h / 4 : 0);
    const xr = Math.max(s.x + s.w + 22, ...inFam(s).map(f => f.x + f.w + 14)) + k * 10;
    const tx = t.tag ? Math.max(t.x + 12, (t.x + t.tag.x - 2) / 2) : t.x + t.w / 2, ty = t.y + t.h + (t.kids || t.opens ? 8 : 0);
    const xn = t.x + t.w + 16 + 10 * unders.slice(k + 1).filter(o => o.t === t).length, near = xn < xr;
    const span = nodes.filter(n => n.x < xr && n.x + n.w > (near ? xn : tx)), yb = Math.max(...[...inFam(s), ...inFam(t)].map(f => f.y + f.h), ...span.map(n => n.y + n.h + (n.tag ? 22 : 8))) + 24 + k * 10;
    const pts = [[s.x + s.w, sy], [xr, sy], [xr, yb]], up = [[xn, yb], [xn, t.y + t.h / 2], [t.x + t.w, t.y + t.h / 2]], bottom = [[tx, yb], [tx, ty]];
    if (near && !through([...pts, ...up], e)) { e.fixed = [...pts, ...up]; e.under = k + 1; }
    else if (!through([...pts, ...bottom], e)) { e.fixed = [...pts, ...bottom]; e.under = true; } // one that would cut through a card is left to the router
  });
  const free = edges.filter(e => !e.fixed);
  edges.filter(e => e.fixed).forEach(e => { e.pts = e.fixed; e.p1 = e.pts[0]; e.p2 = e.pts[e.pts.length - 1]; e.fs = 'R'; e.ts = e.under > 0 ? 'R' : e.under ? 'B' : 'L'; e.stubs = []; e.how = e.under ? 'under' : 'comb'; });
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
  edges.filter(e => e.under > 0).forEach(e => pushSide(e.t, 'R', e, e.s)); // a loop under the boxes takes its port with the side's other lines
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
    // Far ends level with each other go by the angle they come in at, as on a top or bottom side: of two above the card, the
    // nearer takes the higher port, since the farther one's line passes under it (b10/overview's Reports 7 took the port
    // under Billing 1's, whose line ran below Reports, and had no way in but round the map)
    const lean = it => Math.atan2(it.other.y + it.other.h / 2 - my, Math.abs(it.other.x + it.other.w / 2 - mx));
    list.sort((a, b) => vertical ? ((a.e.under || 0) - (b.e.under || 0)) || (a.other.y - b.other.y) || (lean(a) - lean(b)) || ((side === 'R' ? -1 : 1) * (a.other.x - b.other.x)) : turn(a) - turn(b));
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
  edges.filter(e => e.under > 0).forEach(e => { const P = e.fixed; e.pts = e.fixed = [...P.slice(0, 4), [P[3][0], e.p2[1]], e.p2]; });
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
  function gridRoute(e, allowCross, win, spare) {
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
    // routed after a port swap, it keeps off the end of its partner's stub, where the partner, routed next, starts
    if (spare) for (const p of [spare.stubs[0][1], spare.stubs[1][0]]) { const i = X.indexOf(p[0]), j = Y.indexOf(p[1]); if (i >= 0 && j >= 0) { if (allowCross) crossAt[i * ny + j] = 1; else ok[i * ny + j] = 0; } }
    // a line never runs round one of its own ends: the grid behind each (past the side opposite its port) is shut to it, unless its
    // other end is there. A route with no crossing went any length, round its own card too (clinic's reminder went over the
    // patient, down its far side and under it to reach the port below the patient's other line), and port repair saw nothing
    for (const [n, side, far] of [[e.s, e.fs, en], [e.t, e.ts, st]]) if (!behind(n, side, far)) {
      const lr = side === 'R' || side === 'L';
      (lr ? X : Y).forEach((v, a) => { if (behind(n, side, lr ? [v, n.y] : [n.x, v])) for (let b = 0; b < (lr ? ny : nx); b++) ok[lr ? a * ny + b : b * ny + a] = 0; });
    }
    if (any) for (const r of reserved) for (let i = from(X, r.x - 3); i < nx && X[i] < r.x + r.w + 3; i++) for (let j = from(Y, r.y - 3); j < ny && Y[j] < r.y + r.h + 3; j++) crossAt[i * ny + j] = 1;
    // a run within 8 px of a box's border costs ten times its length: the grid keeps a port's track and an earlier line's however
    // near a border, and a box levelled half a row from a card (#86) puts its border right by that card's ports
    const nearY = families.length && Y.map(y => families.filter(f => Math.abs(y - f.y) < 8 || Math.abs(y - f.y - f.h) < 8)), nearX = families.length && X.map(x => families.filter(f => Math.abs(x - f.x) < 8 || Math.abs(x - f.x - f.w) < 8));
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
      // in head-on if it can; else the cheapest way in, the first found (it kept the last, the dearest: a top-to-top line on
      // the top row ran past its card and back, #80)
      if (cell === t0) { if (dir === dEnd) { best = k; break; } if (best < 0) best = k; continue; }
      const xi = X[i], yj = Y[j];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === dir && ((nd >> 1) === (dir >> 1))) continue; // no reversal
        const i2 = i + DI[nd], j2 = j + DJ[nd];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        const c2 = i2 * ny + j2; if (!ok[c2] || (nd < 2 ? blockH[(nd === 0 ? i : i2) * ny + j] : blockV[i * ny + (nd === 2 ? j : j2)])) continue;
        let w = Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj) + (nd === dir ? 0 : BEND) + (crossAt[c2] ? CROSS : 0);
        if (any && (nd < 2 ? alongH[(nd === 0 ? i : i2) * ny + j] : alongV[i * ny + (nd === 2 ? j : j2)])) w += 2 * CROSS + 3 * (Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj));
        if (nearY && (nd < 2 ? nearY[j].some(f => Math.max(xi, X[i2]) > f.x && Math.min(xi, X[i2]) < f.x + f.w) : nearX[i].some(f => Math.max(yj, Y[j2]) > f.y && Math.min(yj, Y[j2]) < f.y + f.h))) w += 10 * (Math.abs(X[i2] - xi) + Math.abs(Y[j2] - yj));
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
  // every spot on e's line where a label of this text fits, best first, at pass 0 (strict), 1 (strict, but it may touch a box
  // border) or 2 (relaxed)
  const subOf = (e, text) => map && text && e.sublabel ? fit(e.sublabel, 9.5, e.under ? 320 : 440) : ''; // a second, smaller line under the label (#44)
  const sizeOf = (e, text, sub = subOf(e, text)) => { const two = !!(text && sub), pill = map && e.step != null;
    return { two, w: map ? (text ? pillW(text, two && sub) : 0) + (pill ? stepW(e.step) + (text ? 4 : 6) : 0) : textW(text, 10) + 12, hgt: map ? (two ? 32 : 20) : 18 }; };
  function* fits(e, text, pass) { const relax = pass === 2, sub = subOf(e, text);
    const segs = segsOf(e.pts).map((s, i) => ({ a: s[0], b: s[1], i, l: Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), h: s[0][1] === s[1][1] }));
    const order = [...segs].sort((p, q) => (q.h - p.h) * 40 + (q.l - p.l));
    // the strict spots along a segment: the middle, a third and a fifth of the way, then those just clear of each card's stub room,
    // tag, label and line beside it, the middle's nearest first: where the label fits, one of them is in. The five alone missed a
    // gap 15 px wide, and the label sat on a box's border (clinic's "Queues reminders")
    const spots = (sg, w, hgt) => { const v = sg.h ? 0 : 1, lo = sg.a[v], len = sg.b[v] - lo, half = (v ? hgt : w) / 2 + 3.5, mid = sg.a[1 - v], across = (v ? w : hgt) / 2 + 3;
      const span = r => [[r.x, r.x + r.w], [r.y, r.y + r.h]], rs = [...nodeRects.map(r => ({ x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 })), ...tagRects, ...placed,
        ...[...routed.filter(r => r !== e).map(r => r.pts), e.pts].flatMap(P => segsOf(P).map(([p, q]) => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) })))];
      return [.5, .32, .68, .2, .8, ...rs.map(span).filter(s => s[1 - v][0] < mid + across && s[1 - v][1] > mid - across).flatMap(s => [s[v][0] - half, s[v][1] + half])
        .map(u => (u - lo) / len).filter(f => f >= 0 && f <= 1).sort((p, q) => Math.abs(p - .5) - Math.abs(q - .5))]; };
    const { two, w, hgt } = sizeOf(e, text, sub), pill = map && e.step != null;
    for (const sg of order) {
      if (!relax && sg.h && sg.l < w + 10) continue;
      if (!relax && !sg.h && sg.l < hgt + 14) continue;
      for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : spots(sg, w, hgt))) {
        const lx = sg.a[0] + (sg.b[0] - sg.a[0]) * f, ly = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
        const box = { x: lx - w / 2, y: ly - hgt / 2, w, h: hgt };
        const grow = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
        if (nodeRects.some(r => hit(relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }, box))) continue; // keep port stubs free
        if (tagRects.some(r => hit(r, grow))) continue;
        if (placed.some(r => (pass === 0 || !r.band) && hit(r, grow))) continue;
        if (!relax && routed.some(r => r !== e && segsOf(r.pts).some(([a, b]) => segHitsRect(a, b, grow)))) continue;
        if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;
        yield { box, grow, lbl: { ...box, text, ...(two ? { sub } : {}), step: map ? e.step : null, ...(pill ? { sw: stepW(e.step) } : {}) } };
      }
    }
  }
  const put = (e, s, full) => { placed.push(s.box); reserved.push(s.grow); e.lbl = { ...s.lbl, short: s.lbl.text !== full }; };
  const unput = e => { const L = e.lbl, same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)), q = reserved.findIndex(same(3)); if (p >= 0) placed.splice(p, 1); if (q >= 0) reserved.splice(q, 1); e.lbl = null; };
  const fullOf = e => map ? fit(e.label || '', 10.5, e.under ? 320 : 440) : fit((e.step != null ? e.step + ' · ' : '') + (e.label || ''), 10, 150);
  function placeLabel(e) {
    if (!e.label && e.step == null) return;
    const full = fullOf(e);
    const tries = [full]; if (e.step != null && e.label && !dg.abs) tries.push(map ? '' : String(e.step));
    const first = (x, text, pass) => fits(x, text, pass).next().value;
    let s = first(e, full, 0); if (s) return put(e, s, full);
    // a label whose spots are all taken by a label placed before it: that label moves to each of its other spots in turn, until
    // this one fits too. Both centred on their lines, the labels of two lines that leave a card side by side (16 px apart, too
    // close to stack) left the second no room, and it fell back to its step (assistant's "a draft", by a jog of 16 px)
    if (map) for (const o of routed) { if (o === e || !o.lbl || o.lbl.short || o.fixed) continue;
      const was = o.lbl, back = () => put(o, { box: { x: was.x, y: was.y, w: was.w, h: was.h }, grow: { x: was.x - 3, y: was.y - 3, w: was.w + 6, h: was.h + 6 }, lbl: was }, was.text);
      unput(o); if (!first(e, full, 0)) { back(); continue; } // e finds no spot even without it
      for (const so of fits(o, was.text, 0)) { put(o, so, was.text); if ((s = first(e, full, 0))) return put(e, s, full); unput(o); }
      back(); }
    for (const pass of (map ? [0, 1, 2] : [0])) for (const text of tries) if ((pass || text !== full) && (s = first(e, text, pass))) return put(e, s, full);
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
  // fan-in (issue 111): lines into a card that six or more lines come into go first, in that order, so they take the tracks by
  // the card and the rest go round them (r19's logger has seven; its lines crossed the ones routed before them).
  // ponytail: six fits the bench (five made d24's hub worse); a fan-in card's own layout row is what is left
  const fan = {}, hot = e => fan[e.t.id] >= 6; free.forEach(e => { fan[e.t.id] = (fan[e.t.id] || 0) + 1; });
  order = [...order.filter(hot), ...order.filter(e => !hot(e))];
  let bad = runRouting(order);
  // rip-up and reroute: an edge that had to cross goes first next time; keep the best attempt (not when the view is laid
  // out again with room for lines: that layout's tries seldom gained anything, and they cost a third of its time; with room for
  // a label it tries, as the layout it may replace did)
  for (let tries = 0; bad && (!last || room.lx) && tries < 4; tries++) {
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
  // port repair: two routes that cross next to a shared node side swap ports, keep it if issues drop. On a map a detour
  // counts, as the layout check counts it: a swap that took u21's Web shop's two lines round the map to save one crossing
  // was kept (unfolding Catalog)
  const issueCount = only => routeAudit({ edges }, '', only).length + (map ? (only ? [...only] : edges).filter(e => detour(e.pts)).length : 0);
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
  const routeOne = (e, spare) => { let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320, spare);
    if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 320, spare) || gridRoute(e, true, 0, spare); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
    e.how = how; routed.push(e); placeLabel(e); return true; };
  let budget = 2 * free.length, swapped = false;
  for (let round = 0; issues && dg.repair !== false && round < 8 && budget > 0; round++) {
    let fixed = false; __ms.rounds++;
    const segsE = e => e.pts.slice(0, -1).map((p, i) => [p, e.pts[i + 1]]);
    const xing = (a, b) => segsE(a).some(([p, q]) => segsE(b).some(([r, s]) => crosses(p, q, r, s)));
    const pairs = []; edges.forEach((a, i) => edges.slice(i + 1).forEach(b => { if (xing(a, b)) pairs.push([a, b]); }));
    // a crossing pair, or a pair where one shares a node side with the other's crossing partner
    // each pair once, crossing pairs first; by place, since a model's edges need no id (by id, every pair of r15's was one)
    const cand = [], seen = new Set(), add = (a, b) => { const k = edges.indexOf(a) + '|' + edges.indexOf(b); if (!seen.has(k)) { seen.add(k); cand.push([a, b]); } };
    pairs.forEach(([a, b]) => add(a, b)); pairs.forEach(([a, b]) => free.forEach(o => { if (o !== a && o !== b) { add(a, o); add(b, o); } }));
    outer3: for (const [a, b] of cand.filter(([x, y]) => !x.fixed && !y.fixed)) {
      for (const n of [a.s, a.t]) for (const side of ['L', 'R', 'T', 'B']) {
        const ka = endAt(a, n, side), kb = endAt(b, n, side); if (!ka || !kb) continue;
        if (budget <= 0) break outer3;
        const pa = a[ka], pb = b[kb]; a[ka] = pb; b[kb] = pa; restub(a); restub(b);
        const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how]), snapR = [routed.slice(), reserved.slice(), placed.slice()];
        const ab = new Set([a, b]), was = issueCount(ab); // issues away from a and b cannot change
        budget -= 2; __ms.reroutes++;
        if (!was) { a[ka] = pa; b[kb] = pb; restub(a); restub(b); continue; } // nothing to gain: the count can only drop by their own issues
        ripUp(a); ripUp(b);
        // first the routes they have, each moved onto the other's port: two lines that cross where they leave one side no longer
        // cross (r15's web: its line to kit turned down past the line to api-client, and routed again they crossed again)
        const moved = (e, k, P) => { const [i, j] = k === 'p1' ? [0, 1] : [P.length - 1, P.length - 2], v = P[i][1] === P[j][1];
          return P.length > 2 && simplify(P.map((p, x) => x === i ? e[k] : x === j ? (v ? [p[0], e[k][1]] : [e[k][0], p[1]]) : p)); };
        const ma = moved(a, ka, a.pts), mb = moved(b, kb, b.pts); let now = Infinity;
        if (ma && mb) { a.pts = ma; b.pts = mb; a.lbl = b.lbl = null; routed.push(a, b); placeLabel(a); placeLabel(b); now = issues - was + issueCount(ab); if (now >= issues) { ripUp(a); ripUp(b); } }
        if (now >= issues) now = routeOne(a, b) && routeOne(b) ? issues - was + issueCount(ab) : Infinity;
        if (now < issues) { issues = now; fixed = swapped = true; if (!issues) break outer3; continue outer3; }
        a[ka] = pa; b[kb] = pb; restub(a); restub(b);
        snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
      }
    }
    if (!fixed) break;
  }
  if (swapped) { ['grid', 'cross', 'fallback'].forEach(k => { delete stats[k]; }); free.forEach(e => { stats[e.how] = (stats[e.how] || 0) + 1; }); }
  // a line that jogs 16 px or less between sides that face each other runs straight when one of its ends is the only port on its
  // side: that port moves level with the other end, if no issue comes with it. Ports are spread round the middle of a side, so a
  // line from the lower of a card's two ports into a card level with it jogged just before it (clinic's "Books appointments")
  if (map && dg.repair !== false) free.forEach(e => {
    const P = e.pts, ax = e.fs === 'L' || e.fs === 'R' ? 1 : 0, d = P[P.length - 1][ax] - P[0][ax];
    if (P.length !== 4 || !d || Math.abs(d) > 16 || OUT[e.fs][1 - ax] !== -OUT[e.ts][1 - ax]) return;
    const lone = (n, side) => !n.box && sides[n.id + '|' + side].length === 1, [k, n, side, v] = lone(e.t, e.ts) ? ['p2', e.t, e.ts, P[0][ax]] : lone(e.s, e.fs) ? ['p1', e.s, e.fs, P[3][ax]] : [];
    const sp = n && (ax ? [n.y + n.h * .08, n.y + n.h * .92] : sideSpan(n, side) || [n.x + n.w * .08, n.x + n.w * .92]);
    if (!k || v < sp[0] || v > sp[1]) return;
    const was = e[k], before = issueCount(new Set([e])), snap = [e.pts, e.lbl, e.how], snapR = [routed.slice(), reserved.slice(), placed.slice()];
    ripUp(e); e[k] = ax ? [was[0], v] : [v, was[1]]; restub(e); routeOne(e);
    if (e.pts.length === 2 && issueCount(new Set([e])) <= before) return;
    e[k] = was; restub(e); [e.pts, e.lbl, e.how] = snap;
    routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
  });
  // the last resort for a line still with no route: around the cards, across or along other lines if it must (it was a
  // plain elbow through whatever lay in its way, and a card's mask made the line look like a connection to that card)
  if (!dg.quick) free.filter(e => e.how === 'fallback').forEach(e => { ripUp(e); e.pts = gridRoute(e, 2, 320) || gridRoute(e, 2, 0) || e.pts; e.lbl = null; routed.push(e); placeLabel(e); });
  if (!dg.quick) edges.forEach(e => { const n = through(e.pts, e); if (n) warn(`the line for edge ${edgeRefIds(e).join(' / ') || e.from + '->' + e.to} runs through card "${n.id}", which it does not join: no route found around it`); });
  __ms.repair = performance.now() - __ms.t; delete __ms.t;
  // a label on a box's border, cut to its step or with no spot asks for room where it is: the column gap it sits in widens by
  // the label's width, else the row gap by its height and 14 px; a label in neither, or with no spot, the gap its line's longest
  // run crosses, a column's first. layoutGraph lays the view out again with it, and keeps that layout if it is better
  let labelRoom = null;
  const tight = !last && !dg.quick && map && !dg.abs ? free.filter(e => (e.label || e.step != null) && (!e.lbl || e.lbl.short || families.some(f => onBorder(e.lbl, f)))) : [];
  if (tight.length) {
    const cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs)), need = { x: {}, y: {} };
    const gaps = [...cs.filter(c => colX[c + 1] != null).map(c => ['x', c, colX[c] + (colW[c] || NW), colX[c + 1]]),
      ...Array.from({ length: Math.max(0, r1 - r0) }, (_, k) => ['y', r0 + k, rowY(r0 + k) + NH, rowY(r0 + k + 1)])];
    tight.forEach(e => { const { w, hgt: h } = sizeOf(e, fullOf(e)), L = e.lbl, c = L && { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      let best = c && ['x', 'y'].map(k => gaps.find(([gk, g, p, q]) => gk === k && c[k] >= p && c[k] <= q)).find(Boolean);
      if (!best) segsOf(e.pts).forEach(([a, b]) => { const k = a[1] === b[1] ? 'x' : 'y', i = k === 'x' ? 0 : 1, lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
        gaps.forEach(([gk, g, p, q]) => { const run = Math.min(hi, q) - Math.max(lo, p); if (gk === k && run > 0 && (!best || (k === 'x') > (best[0] === 'x') || ((k === 'x') === (best[0] === 'x') && run > best[2]))) best = [k, g, run]; }); });
      if (best) need[best[0]][best[1]] = (need[best[0]][best[1]] || 0) + (best[0] === 'x' ? w : h + 14); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) labelRoom = { ...room, lx: need.x, ly: need.y };
  }
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
  return { ms: __ms, ...(labelRoom ? { labelRoom } : {}), stats, nodes, edges, subAndChips: !!dg.subAndChips, groups, families, intake, tour: dg.tour || null, byId, map, hub: dg.hub || null, lanes: dg.lanes || [], blocks: dg.blocks || [], bounds: { x: minX, y: minY, w: Math.max(...xs) - minX + M, h: Math.max(...ys) - minY + M } };
}

let svgSeq = 0;
/* SVG markup. opts: { childCount(id) -> n, subject: id, title } */
function svgOf(geo, opts = {}) {
  const id = 'g' + (svgSeq++), { nodes, edges, groups, bounds: B, map } = geo;
  const col = k => `var(--um-${KIND[k][0]})`, fill = k => `var(--um-${KIND[k][0]}-f)`;
  const estyle = e => {
    if (e.style === 'faded') return { ...(map && e.wk ? { c: `var(--um-w-${e.wk})`, m: e.wk, cls: ' w-' + e.wk + ' faded' } : { c: 'var(--um-arrow)', m: 'd', cls: ' faded' }), dash: '', op: .35 }; // its own colour, faint, no flow (drift's idle lines)
    if (map && e.wk && !e.style) return { c: `var(--um-w-${e.wk})`, m: e.wk, dash: e.back ? '6 5' : '', cls: ' w-' + e.wk + (e.back ? ' back' : '') };
    const st = e.style || (e.change === 'added' ? 'added' : e.change === 'removed' ? 'removed' : '');
    if (st === 'added' || st === 'emphasis') return { c: 'var(--um-green)', m: 'g', dash: '', flow: st === 'added' || e.animate };
    if (st === 'removed') return { c: 'var(--um-rose)', m: 'r', dash: '5 5', op: .7 };
    if (st === 'security') return { c: 'var(--um-rose)', m: 'r', dash: '5 5' };
    if (st === 'dashed' || st === 'async') return { c: 'var(--um-violet)', m: 'v', dash: '4 4' };
    return { c: 'var(--um-arrow)', m: 'd', dash: '' };
  };
  // a line that breaks a rule (#70): rose, with a "!" just after its start that names the rule (opts.broken: rule titles by edge id)
  const broke = e => opts.broken ? [...new Set((e.all || [e]).flatMap(x => opts.broken[x._id] || []))] : [];
  const lstyle = e => broke(e).length ? { ...estyle(e), c: 'var(--um-rose)', m: 'r' } : estyle(e);
  const ruleMark = (e, why) => { const [a, b] = e.pts, L = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) || 1, t = Math.min(18, L / 2) / L, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    return `<g class="rule-mark"><title>Breaks rule: ${esc(why.join('; '))}</title><circle cx="${x}" cy="${y}" r="6.5"/><text x="${x}" y="${y + 3.4}" text-anchor="middle">!</text></g>`; };
  const marker = (n, c, k = 1) => `<marker id="${id}-${n}" markerWidth="${10 * k}" markerHeight="${8 * k}" refX="${9 * k}" refY="${4 * k}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L${10 * k} ${4 * k} L0 ${8 * k} Z" fill="${c}"/></marker>`;
  const MC = { d: 'var(--um-arrow)', g: 'var(--um-green)', r: 'var(--um-rose)', v: 'var(--um-violet)', h: 'var(--um-cyan)', ...Object.fromEntries(WIRES.map(w => [w[0], `var(--um-w-${w[0]})`])) };
  const heavy = [...new Set(edges.filter(e => e.weight > 1).map(e => lstyle(e).m + '-w' + e.weight))]; // a heavier line's arrowhead grows with it
  // the notation (0.15.0): each card's look, and each line as drawn, its ends on the cards' outlines (a map's cards only)
  const notation = map ? noteOf(opts.shapes) || 'box' : 'box', kidsOf = n => n.kids != null ? n.kids : opts.childCount ? opts.childCount(n.id) : 0;
  const ports = map ? sidePorts(geo) : null, looks = new Map(map ? nodes.map(n => [n, cardLook(n, notation, !!(kidsOf(n) || n.opens) && opts.openHint !== false, ports.get(n))]) : []);
  const drawn = edges.map(e => looks.size ? drawnPts(e, n => looks.get(n) || null) : e.pts);
  let s = `<svg viewBox="${B.x} ${B.y} ${B.w} ${B.h}" data-w="${B.w}" data-h="${B.h}" role="${map ? 'group' : 'img'}" aria-label="${esc(opts.title || 'Diagram')}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>${marker('d', 'var(--um-arrow)')}${marker('g', 'var(--um-green)')}${marker('r', 'var(--um-rose)')}${marker('v', 'var(--um-violet)')}${marker('h', 'var(--um-cyan)')}${map ? WIRES.map(w => marker(w[0], `var(--um-w-${w[0]})`)).join('') : ''}${heavy.map(m => { const [c, k] = m.split('-w'); return marker(m, MC[c], 1 + (k - 1) * .35); }).join('')}</defs>`;
  const families = geo.families || [], familyDepth = f => f.parent ? 1 + familyDepth(families.find(p => p.id === f.parent) || {}) : 0;
  families.slice().sort((a,b) => familyDepth(a)-familyDepth(b)).forEach(f => { // in c4 every box is a boundary, dashed as Structurizr draws one (a toned box is dashed in any notation)
    s += `<g class="family${f.tone ? ' toned' : ''}" data-family="${esc(f.id)}"${f.parent ? ` data-parent="${esc(f.parent)}"` : ''}${f.tone ? ` style="--um-tone:${toneOf(f)}"` : ''}><rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" stroke="var(--um-${familyDepth(f) ? 'cyan' : 'border-2'})"${notation === 'c4' ? ' stroke-dasharray="7 5"' : ''}/>
      <text class="family-title" x="${f.x+12}" y="${f.y+18}" fill="var(--um-muted)" data-t="ft" data-o="${esc(f.id)}">${esc(f.label || f.id)}</text>${(f.tabs || []).map(t => t.fold ? `
      <g class="fold-hint"><title>Fold back into one card (E, or Alt + click a card in it)</title><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="16" rx="8" class="n-mask" stroke="var(--um-accent)"/><text x="${t.x + t.w / 2}" y="${f.y + 4}" text-anchor="middle" class="badge-tx" fill="var(--um-accent)">⤡</text></g>` : `
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
      const p = edges[k].from === a ? drawn[k] : [...drawn[k]].reverse();
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
    const bp = roundPath(looks.size ? drawnPts({ pts: b.pts, t: geo.byId[b.to], ts: 'L' }, n => looks.get(n) || null) : b.pts); // its end on the card's outline, as a line's
    s += `<g class="intake"><title>${esc(b.label)} feeds ${esc((geo.byId[b.to] || {}).label || b.to)}</title><path d="${bp}" class="edge" stroke="var(--um-w-feeds)" marker-end="url(#${id}-feeds)"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" class="intake-chip${b.dashed ? ' dashed' : ''}"/>${b.logo ? `<image href="${esc(b.logo)}" x="${b.cx - 9}" y="${b.cy - 9}" width="18" height="18"/>` : b.mark ? `<text x="${b.cx}" y="${b.cy + 4.5}" text-anchor="middle" class="intake-mark">${esc(b.mark)}</text>` : ''}
      <text x="${b.cx - b.r - 7}" y="${b.cy + 3.5}" text-anchor="end" class="intake-tx">${esc(b.label)}</text>
      ${tour ? `<circle r="3.2" class="tour tour-packet" opacity="0"><animateMotion path="${bp}" keyPoints="0;0;1" keyTimes="0;.86;1" calcMode="linear" dur="${TOUR}s" repeatCount="indefinite"/>${tourAnim('0;0;.8;.8;0', [0, .86, .88, .99, 1])}</circle>` : ''}</g>`;
  });
  edges.forEach((e, i) => {
    const st = lstyle(e), why = broke(e), d = roundPath(drawn[i]), mk = st.m + (e.weight > 1 ? '-w' + e.weight : '');
    const tip = 9 * (e.weight > 1 ? 1 + (e.weight - 1) * .35 : 1), fd = roundPath(trimLine(drawn[i], e.both ? tip : 0, tip)); // an arrowhead's length (marker refX)
    if (tour && tour.legs[i]) { const [a, b] = tour.legs[i];
      s += `<path d="${d}" class="tour-glow" stroke="${st.c}" opacity="0">${tourAnim('0;0;.55;.55;0;0', [0, a, Math.min(a + .01, b), b, b + .03, 1])}</path>`; }
    s += `<g class="edge-g${st.cls || ''}${e.weight > 1 ? ' wt-' + e.weight : ''}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-i="${i}"><path d="${d}" class="halo"/><path d="${d}" class="hitline"/>
      <path d="${d}" class="edge${st.flow ? ' flow' : ''}" stroke="${st.c}" ${st.dash && !st.flow ? `stroke-dasharray="${st.dash}"` : ''} ${st.op ? `opacity="${st.op}"` : ''} marker-end="url(#${id}-${mk})" ${e.both ? `marker-start="url(#${id}-${mk})"` : ''}/>
      <path d="${fd}" class="flowline" stroke="${st.c}"/>${(e.all || [e]).some(x => x.edited) && !e.strong ? (() => { let m = [e.pts[0], e.pts[1]];
        e.pts.slice(1).forEach((p, k) => { const a = e.pts[k]; if (Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) > Math.abs(m[1][0] - m[0][0]) + Math.abs(m[1][1] - m[0][1])) m = [a, p]; });
        return `<circle cx="${(m[0][0] + m[1][0]) / 2}" cy="${(m[0][1] + m[1][1]) / 2}" r="4" class="edited-dot"><title>Edited</title></circle>`; })() : ''}${why.length ? ruleMark(e, why) : ''}
      <title>${e.step != null ? 'Step ' + esc(e.step) + ': ' : ''}${esc(e.s.label)} ${e.both ? '⇄' : '→'} ${esc(e.t.label)}${e.label ? ': ' + esc(e.label) : ''}${e.label && e.sublabel ? ' (' + esc(e.sublabel) + ')' : ''}${e.when ? '\n' + esc(e.when) : ''}${why.length ? '\nBreaks rule: ' + esc(why.join('; ')) : ''}</title></g>`;
  });
  // the tour's dot rides over the lines and boxes but under the cards: it goes into a card and comes out at its next
  // line, rather than across the card's name
  s += '</g>' + (tour ? `<g class="tour" aria-hidden="true"><circle r="5.5" class="tour-dot"><animateMotion path="${tour.d}" dur="${TOUR}s" repeatCount="indefinite"/></circle></g>` : '') + '<g class="nodes">';
  nodes.forEach(n => {
    const c = col(n.k), f = fill(n.k), removed = n.change === 'removed', planned = n.change === 'planned';
    const L = looks.get(n) || null, S = L && L.S; // a shaped card (0.15.0); null: a box, drawn as before
    const pub = map && n.k === 'm-public', priv = map && n.k === 'm-script', ext = map && n.k === 'm-ext', verb = map && n.k === 'm-verb', hook = map && n.k === 'm-hook' && String(n.shape ?? '').toLowerCase() !== 'box';
    const dash = removed || ext || planned || (map && notation !== 'box' && n.k === 'external'); // an external card is dashed where a notation draws types (the legend says so in every notation)
    const rx = verb ? n.h / 2 : map ? 10 : 9;
    const kids = kidsOf(n), stacked = !!(kids || n.opens); // opens a view, loaded or not (#47)
    const subject = opts.subject === n.id;
    const verbs = map && (n.verbs || []).length ? n.verbs : null;
    const subTxt = n.noSub ? '' : n.sub || (map && n.origin ? n.origin : '') || (map ? (n.what ? n.what.replace(/[`*]/g, '').split(/(?<=\.)\s/)[0] : KIND[n.k][1]) : '');
    const third = !!(verbs && subTxt && !priv && geo.subAndChips); // the view's subAndChips: the sub-line, then the chips on a third line (a script card shows no sub-line)
    const sw = map ? n.w - 70 : n.w - 24;  // map cards: text runs from 54 px in (after the mark) to 16 px from the right
    // a shape's face: the rows its mark and text use (a box's: the card). A short face takes a two-line sub-line to one, and
    // gives up the sub-line under a two-line name (the tooltip and the details panel keep it)
    const [ft, fb] = L ? S.face(L) : [n.y, n.y + n.h], fh = fb - ft, fy = (ft + fb) / 2;
    const labelPx = n.emphasis ? 15 : 13;
    const lw = map ? n.w - 70 : n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side
    const wraps = map && textW(n.label, labelPx) > lw && (!L || fh >= 30);
    const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > sw && textW(n.label, n.emphasis ? 15 : 13) <= sw && (!L || fh >= 56) ? wrap2(subTxt, 10, sw) : null;
    const sub = subTxt && (!verbs || third) && !(L && wraps && fh < 44) ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, sw)) : '';
    const two = wraps ? wrap2(n.label, labelPx, lw) : null;
    const lpx = two ? labelPx : textW(n.label, labelPx) > lw ? (measureText ? Math.max(11, labelPx * lw / textW(n.label, labelPx)) : Math.max(11, lw / (String(n.label).length * 0.6))) : labelPx;
    const ly = fy + (third ? -14 : sub || verbs ? -3 : 4) - (two ? 8 : 0) - (sub2 ? 6 : 0);
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
    if (L) { // a shape: its outline twice behind it when stacked, then the mask, the body and its details
      const o = S.out(L);
      if (stacked) parts.push([8, 4].map(k => `<path d="${o}" transform="translate(${k} ${k})" class="n-stack" stroke="${c}"/>`).join(''));
      if (pub) parts.push(`<path d="${S.out(L, 4)}" class="n-ring" stroke="${c}"/>`);
      parts.push(`<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="${f}" stroke="${c}"${dash ? ' stroke-dasharray="6 4"' : ''}${removed ? ' opacity=".6"' : ''}/>${S.det ? S.det(L, c, n.k) : ''}`); }
    else {
      if (stacked) parts.push(`<rect x="${n.x + 8}" y="${n.y + 8}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/><rect x="${n.x + 4}" y="${n.y + 4}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/>`);
      if (pub) parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="14" class="n-ring" stroke="${c}"/>`);
      if (hook) { const hx = Math.min(16, n.h / 3), pts = `${n.x + hx},${n.y} ${n.x + n.w - hx},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w - hx},${n.y + n.h} ${n.x + hx},${n.y + n.h} ${n.x},${n.y + n.h / 2}`;
        parts.push(`<polygon points="${pts}" class="n-mask"/><polygon points="${pts}" class="n-body" fill="${f}" stroke="${c}" stroke-linejoin="round"/>`); }
      else parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-mask"/>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-body" fill="${f}" stroke="${c}" ${dash ? 'stroke-dasharray="6 4"' : ''} ${removed ? 'opacity=".6"' : ''}/>`); }
    // the mark, centred on the face; in the uml notation a box's own sigil gives way to UML's component icon
    const glyph = L && SIGIL[L.sh] ? L.sh : notation === 'uml' && !L && !String(n.k).startsWith('m-') ? 'component' : n.k; // a person's, robot's, phone's, terminal's, folder's or node's own mark
    parts.push((() => { const I = (opts.icons || {})[n.icon], x = map ? n.x + 14 : n.x + (verb ? 14 : hook ? 17 : 9), y = map ? fy - 14 : n.y + (priv ? 8 : 11), M = map ? 28 : 16;  // map: one 28 px mark, left, centred
return I && I.src ? `<rect x="${x - M * 3 / 28}" y="${y - M * 3 / 28}" width="${M * 34 / 28}" height="${M * 34 / 28}" rx="${M / 4}" class="n-logo${I.dark ? ' dark' : ''}"/><image href="${I.src}" x="${x}" y="${y}" width="${M}" height="${M}"/>`
  : I && I.g ? `<g transform="translate(${x} ${y}) scale(${M / 24})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 24 / M}" stroke-linecap="round" stroke-linejoin="round">${I.g}</g>`
  : `<g transform="translate(${x} ${y}) scale(${M / 16})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 16 / M}" stroke-linecap="round" stroke-linejoin="round">${SIGIL[glyph]}</g>`; })());
    parts.push(`<text x="${tx0}" y="${ly}" text-anchor="${anchor}" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? 'text-decoration="line-through"' : ''}>${two ? lines(two, 15) : esc(label)}</text>`);
    const ty = tabLine(n, L); // the line the tabs, ⤢, the change badge and a step sit on
    if (map) { let tx = n.x + 12; mapTabs(n, c).forEach(t => { const tw = t.w; // each badge is its own tab, clickable on its own
      parts.push(`<g class="pub-tab"${t.badge != null ? ` data-badge="${t.badge}"` : ''}><rect x="${tx}" y="${ty - 8}" width="${tw}" height="15" rx="4" fill="${t.fill}"/><text x="${tx + tw / 2}" y="${ty + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`);
      said.push(t.badge != null ? badgesOf(n)[t.badge].text : t.text.toLowerCase()); tx += tw + 4; }); }
    if (map && n.edited) parts.push(`<g class="edited"><title>Edited</title><circle cx="${n.x + n.w - 10}" cy="${n.y + n.h - 10}" r="4" class="edited-dot"/></g>`);
    // a step on a shape's tab line (a person's shoulder), but never down over the arrow of a line into its left side: as low as
    // keeps 6 px clear of the highest one, and no higher than the box's corner
    if (map && n.step) { const t = String(n.step), sw = Math.max(20, sansW(t, 9.5, .9) + 10), sy = L ? Math.max(n.y, Math.min(ty, L.portL - 16)) : ty;
      parts.push(`<g class="step"><title>Step ${esc(t)}</title><rect x="${n.x - 10}" y="${sy - 10}" width="${sw}" height="20" rx="10" class="stp"/><text x="${n.x - 10 + sw / 2}" y="${sy + 3.5}" text-anchor="middle" class="stp-tx">${esc(t)}</text></g>`);
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
    if (hint) { const kx = map ? n.x + n.w - 44 : n.x + n.w - 40, ky = map ? ty - 8 : n.y + n.h - 11;
      parts.push(`<g class="open-hint${map ? '' : ' depth-read'}"><title>Open the inner view (or double-click the card)</title><rect x="${kx}" y="${ky}" width="36" height="16" rx="8" class="n-mask" stroke="${c}"/><text x="${kx + 18}" y="${ky + 12}" text-anchor="middle" class="badge-tx" fill="${c}">⤢${kids ? ' ' + kids : ''}</text></g>`);
      said.push(kids ? `${kids} (cards inside, opens the inner view)` : '(opens the inner view)'); }
    const ch = CHG[String(n.change || '').toLowerCase()];
    if (ch) {
      const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint && map ? 40 : 0); // left of a map card's ⤢ pill, which sits on the same edge
      parts.push(`<rect x="${bx}" y="${ty - 8}" width="${bw}" height="16" rx="8" fill="var(--um-mask)" stroke="var(--um-${ch[0]})"/>
        <text x="${bx + bw / 2}" y="${ty + 3}" text-anchor="middle" class="badge-tx" fill="var(--um-${ch[0]})">${ch[1]}</text>`);
      said.push(ch[1].toLowerCase());
    }
    if (sub) { parts.push(`<text x="${tx0}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="${anchor}" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? lines(sub2, 12) : esc(sub)}</text>`);
      if (subShown) said.push(part(sub, subTxt)); }
    if (verbs) { // verb chips: the node's public surface, at a glance
      let vx = 0; const chips = [], maxW = third ? sw : n.w - 24; // on a third line they keep to the text's column, clear of the mark
      for (let i = 0; i < verbs.length; i++) {
        const wv = textW(verbs[i], 9.5) + 10, rest = verbs.length - i - 1, more = rest ? textW('+' + rest, 9.5) + 10 : 0;
        if (vx + wv + (rest ? more + 4 : 0) > maxW) { chips.push(['+' + (verbs.length - i), textW('+' + (verbs.length - i), 9.5) + 10, true]); break; } // the first too: a verb wider than any card is "+N" (#84)
        chips.push([verbs[i], wv]); vx += wv + 4;
      }
      const total = chips.reduce((a, c2) => a + c2[1], 0) + (chips.length - 1) * 4;
      let px = third ? tx0 : n.x + (n.w - total) / 2; const py = third ? ly + 23 + (two ? 15 : 0) : ly + 7;
      parts.push(`<g class="verbs depth-read">${chips.map(([t, wv], ci) => { const m = `<rect x="${px}" y="${py}" width="${wv}" height="14" rx="7" class="verb-chip" data-chip="${ci}" stroke="${c}"/><text x="${px + wv / 2}" y="${py + 10}" text-anchor="middle" class="verb-tx" data-chip="${ci}" data-o="${esc(n.id)}" data-t="nv" fill="${c}">${esc(t)}</text>`; px += wv + 4; return m; }).join('\n')}</g>`);
      chips.forEach(([t, , more], ci) => said.push(more ? `${t} (more: ${verbs.slice(ci).join(', ')})` : t));
    }
    if (map) {
      const ports = new Map();
      edges.forEach((e, i) => { const point = e.from === n.id ? (L ? drawn[i][0] : e.p1) : e.to === n.id ? (L ? drawn[i][drawn[i].length - 1] : e.p2) : null; if (!point) return; // a shape's ports on its outline
        const key = point.join(','); const port = ports.get(key) || { point, indices: [] }; port.indices.push(i); ports.set(key, port); });
      ports.forEach(({ point, indices }) => { parts.push(`<circle cx="${point[0]}" cy="${point[1]}" r="3.5" class="n-port" data-edges="${indices.join(',')}" stroke="${c}"/>`); });
    }
    const name = said.join(', ') + (n.edited ? ' (edited)' : '') + (stacked && !hint ? ' (opens inner view)' : '');
    s += `<g class="node${pub ? ' pub' : ''}${priv ? ' priv' : ''}${stacked ? ' has-child' : ''}${subject ? ' subject' : ''}${n.emphasis ? ' main-step' : ''}${planned ? ' planned' : ''}${tour && n.id in tour.at ? ' tour-stop' : ''}"${tour && n.id in tour.at ? ` style="animation-delay:${(tour.at[n.id] * TOUR - .32).toFixed(2)}s"` : ''}${L ? ` data-shape="${L.sh}" data-face="${r2(ft)} ${r2(fb)}"` : ''} data-id="${esc(n.id)}" tabindex="${map ? 0 : -1}" role="${map ? 'button' : 'img'}" aria-label="${esc(name)}">
      ${parts.join('\n')}
    </g>`;
  });
  if (map) { // each line's focus target: after the cards, so lines follow them in the Tab order (#43), under the labels; the mouse still hits the line
    s += '</g><g class="keys">';
    edges.forEach((e, i) => { const said = e.label ? `: ${e.label}${e.sublabel ? ` (${e.sublabel})` : ''}` : '';
      const name = `${e.step != null ? `Step ${e.step}: ` : ''}Line ${e.both ? `between ${e.s.label} and ${e.t.label}, both ways` : `from ${e.s.label} to ${e.t.label}`}${said}${broke(e).length ? `, breaks rule ${broke(e).join('; ')}` : ''}`;
      s += `<g class="um-key line-key${e.weight > 1 ? ' wt-' + e.weight : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(name)}"><path d="${roundPath(drawn[i])}" class="key-ring"/></g>`; });
  }
  s += '</g><g class="labels depth-read">';
  edges.forEach((e, i) => {
    if (!e.lbl) return;
    const L = e.lbl;
    if (map) {
      const sw = L.sw || 16, cy = L.y + L.h / 2; // the step mark: a circle, or a pill as wide as a longer number (#82)
      const st = L.step != null ? `${sw > 16 ? `<rect x="${L.x + 3}" y="${cy - 8}" width="${sw}" height="16" rx="8" class="e-step"/>` : `<circle cx="${L.x + 11}" cy="${cy}" r="8" class="e-step"/>`}<text x="${L.x + 3 + sw / 2}" y="${cy + 3.3}" text-anchor="middle" class="e-step-tx" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.step)}</text>` : '';
      const ax = L.step != null ? L.x + 7 + sw : L.x + L.w / 2, an = L.step != null ? '' : 'text-anchor="middle"';
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
    // must settle its promise too; otherwise go() never releases its busy flag. It settles false: cut short (a story's step glides again)
    const done = this.animationDone; this.animationDone = null; if (done) done(false);
  }
  set(s) { this.stopAnimation(); this.s = this.clamp({ ...this.s, ...s }); this.apply(); }
  animate(to, ms = 380) { // resolves true once there, false when cut short
    this.stopAnimation();
    const from = { ...this.s }, dest = this.clamp({ ...this.s, ...to });
    if (this.o.still ? this.o.still() : reducedMotion()) { this.set(dest); return Promise.resolve(true); }
    return new Promise(res => {
      this.animationDone = res;
      const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lk0 = Math.log(from.k), lk1 = Math.log(dest.k);
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), e = ease(t);
        this.s = { cx: from.cx + (dest.cx - from.cx) * e, cy: from.cy + (dest.cy - from.cy) * e, k: Math.exp(lk0 + (lk1 - lk0) * e) };
        this.apply();
        if (t < 1) this.anim = requestAnimationFrame(step); else { this.anim = 0; this.animationDone = null; res(true); }
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
    if (e.target.closest('.ctl, .minimap, button, a, input, .um-edit, .um-story') || (this.o.skip && this.o.skip(e))) return;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    this.start = { x: e.clientX, y: e.clientY, s: { ...this.s }, dist: this.pinchDist() };
    this.moved = 0; this.dragged = false;
    this.stopAnimation(); // settles the glide's promise: a press during a navigation or a story's step lets it go on
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

// an issue's message, and what it is about (the cards, lines and boxes it names) when the caller keeps a list of that: check()
// turns those into Refs; the page's check reads only the messages
const teller = (issues, refs) => (message, ...about) => { issues.push(message); if (refs) refs.push(about); };
// a label's box L across one of box f's borders
const onBorder = (L, f) => { const xin = L.x + L.w > f.x && L.x < f.x + f.w, yin = L.y + L.h > f.y && L.y < f.y + f.h;
  return (xin && [f.y, f.y + f.h].some(u => L.y < u && L.y + L.h > u)) || (yin && [f.x, f.x + f.w].some(u => L.x < u && L.x + L.w > u)); };
// a detour: a route 2.5 times longer than the straight distance between its ends, or than 100 px; [its length, that distance]
const detour = pts => { const len = pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]), 0);
  const d = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]); return len > 2.5 * Math.max(d, 100) ? [len, d] : null; };
// behind a card a line meets on its side `side` (R, L, T or B): past the opposite side
const behind = (n, side, [x, y]) => side === 'R' ? x < n.x - .5 : side === 'L' ? x > n.x + n.w + .5 : side === 'B' ? y < n.y - .5 : y > n.y + n.h + .5;
// [the end, its side] that a line runs round: its route goes behind one of its own ends while its other end is not there. A
// long line passed the detour rule however it went round (clinic's reminder: over the patient, down its far side, under it)
const roundEnd = e => [[e.s, e.fs, e.pts[e.pts.length - 1]], [e.t, e.ts, e.pts[0]]].find(([n, side, far]) => n && side && !behind(n, side, far) && e.pts.some(p => behind(n, side, p)));
function routeAudit(geo, where, only, refs) { // only: a set of edges; counts just the issues that involve one of them
  const sk = e => only && !only.has(e);
  const issues = [], say = teller(issues, refs);
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
    if (found === 'cross') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} cross`, geo.edges[i], geo.edges[j]);
    if (found === 'share') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} share a line`, geo.edges[i], geo.edges[j]);
  }
  geo.edges.forEach((e, i) => { if (!e.lbl) return; const L = { x: e.lbl.x + 1, y: e.lbl.y + 1, w: e.lbl.w - 2, h: e.lbl.h - 2 };
    geo.edges.forEach((o, j) => { if (j !== i && !(sk(e) && sk(o)) && segs[j].some(([a, b]) => Math.max(a[0], b[0]) > L.x && Math.min(a[0], b[0]) < L.x + L.w && Math.max(a[1], b[1]) > L.y && Math.min(a[1], b[1]) < L.y + L.h)) say(`${where}: label "${e.lbl.text || e.lbl.step}" lies on edge ${name(o)}`, e, o); }); });
  const segHit = (r, i) => segs[i].some(([a, b]) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h);
  if (geo.map) {
    const ex = 12, drawn = new Set(geo.edges.map(e => e.from + '>' + e.to)); // A→B and B→A both drawn: a pair the view keeps apart
    geo.edges.forEach((e, i) => {
      // clearance: a route keeps 12+ px from every node it does not connect
      geo.nodes.forEach(n => { if (n.id === e.from || n.id === e.to) return;
        if (segHit({ x: n.x - ex + .5, y: n.y - ex + .5, w: n.w + 2 * ex - 1, h: n.h + 2 * ex - 1 }, i)) say(`${where}: edge ${name(e)} passes within ${ex}px of node "${n.label}"`, e, n); });
      const dt = detour(e.pts); if (dt) say(`${where}: edge ${name(e)} takes a detour (${Math.round(dt[0])}px for ${Math.round(dt[1])}px)`, e);
      const r = roundEnd(e); if (r) say(`${where}: edge ${name(e)} runs round its own end "${r[0].label}"`, e, r[0].box ? (geo.families || []).find(f => f.id === r[0].id) : r[0]);
      // reading order: every wire runs left to right, except one that closes a loop or answers its pair (keepPairs)
      if (!e.back && !e.both && !drawn.has(e.to + '>' + e.from) && e.t.x + e.t.w / 2 <= e.s.x + e.s.w / 2) say(`${where}: edge ${name(e)} runs right-to-left`, e);
    });
    if (geo.hub) { // hub views: one visible line into each callee
      const into = {}; geo.edges.forEach(e => { (into[e.to] ||= []).push(e); });
      Object.entries(into).forEach(([id, es]) => { es = es.filter(e => !e.back); if (es.some(e => e.from === geo.hub) && es.length > 1) say(`${where}: hub callee "${(geo.byId[id] || {}).label || id}" has ${es.length} incoming lines`, geo.byId[id]); });
    }
  }
  // author name tags hang under their card: no route may run through one
  (geo.nodes || []).forEach(n => { if (!n.tag) return; const r = { x: n.tag.x + 1, y: n.tag.y + 1, w: n.tag.w - 2, h: n.tag.h - 2 };
    geo.edges.forEach((o, j) => { if (segHit(r, j)) say(`${where}: name tag "${n.tag.text}" lies on edge ${name(o)}`, n, o); }); });
  // lanes: every part sits inside its own lane, lanes never overlap, no route crosses a lane header
  const lanes = geo.lanes || [];
  lanes.forEach((l, i) => {
    lanes.slice(i + 1).forEach(m => { if (hit(l, m, -1)) say(`${where}: lanes "${l.title}" and "${m.title}" overlap`); });
    (geo.nodes || []).forEach(n => {
      if (n.lane === i && (n.x < l.x || n.x + n.w > l.x + l.w || n.y < l.y || n.y + n.h + (n.tag ? 14 : 0) > l.y + l.h)) say(`${where}: lane "${l.title}": node "${n.label}" sticks out`, n);
      if (n.lane != null && n.lane !== i && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${n.label}" of another lane sits in it`, n);
      if (n.lane == null && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${n.label}" belongs to no lane but sits in it`, n);
    });
  });
  (geo.blocks || []).forEach(b => geo.edges.forEach((o, j) => { if (segHit({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }, j)) say(`${where}: lane "${b.title || ''}": header crossed by edge ${name(o)}`, o); }));
  const families = geo.families || [], inside = (a,b) => b.x > a.x && b.y > a.y && b.x+b.w < a.x+a.w && b.y+b.h < a.y+a.h;
  families.forEach(f => {
    const parent = families.find(p => p.id === f.parent);
    if (f.parent && (!parent || !inside(parent,f))) say(`${where}: family "${f.label}" sticks out of its parent`, f);
    (f.nodeIds || []).forEach(id => { const n = geo.byId[id]; if (n && !inside(f,n)) say(`${where}: family "${f.label}" does not contain "${n.label}"`, f, n); });
    families.filter(g => g !== f && g.parent === f.parent && g.id > f.id).forEach(g => { if (hit(f,g,-1)) say(`${where}: families "${f.label}" and "${g.label}" overlap`, f, g); });
    geo.edges.forEach((e,i) => { if (segHit({x:f.x+8,y:f.y+3,w:Math.min(f.w-16,textW(f.label || f.id,11)+16),h:22},i)) say(`${where}: family "${f.label}": header crossed by edge ${name(e)}`, f, e); });
    geo.edges.forEach((e,i) => { if (segs[i].some(([a,b]) => { const v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];
      const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);
      return hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8); })) say(`${where}: edge ${name(e)} runs along the border of family "${f.label}"`, e, f); });
    geo.edges.forEach(e => { const L = e.lbl; if (L && onBorder(L, f)) say(`${where}: label "${L.text || L.step}" sits on the border of family "${f.label}"`, e, f); });
  });
  return issues;
}

/* The layout check's geometry, which needs no fonts: check() runs it on layout()'s geometry, and the page adds what it
   measures in the DOM (text against its card, a lane's or box's title, edge labels against each other). */
const box = n => ({ x: n.x, y: n.y, w: n.w, h: n.h });
function overlapIssues(geo, where, refs) {
  const issues = [], nodes = geo.nodes, say = teller(issues, refs);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(box(nodes[i]), box(nodes[j]), -1)) say(`${where}: nodes "${nodes[i].label}" and "${nodes[j].label}" overlap`, nodes[i], nodes[j]);
  return issues;
}
function leaveIssues(geo, where, refs) {
  const issues = [], say = teller(issues, refs);
  // a numbered line's label with no room on it: only its step shows, its words in the line's title and the details only
  if (geo.map) geo.edges.forEach(e => { if (e.label && e.lbl && e.lbl.short) say(`${where}: label "${e.label}" has no room on edge ${e.s.label}→${e.t.label}: only its step ${e.lbl.step} shows`, e); });
  if (geo.map) geo.edges.forEach(e => { const L = e.lbl; if (!L || (!e.label && L.step == null) || !e.pts) return; // a label, or a step's mark, must leave some of its own line visible
    const c = [L.x + L.w / 2, L.y + L.h / 2], P = e.pts; let s = 0, at = null, half = 0, tot = 0;
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (at == null) { const onH = a[1] === b[1] && Math.abs(c[1] - a[1]) < 2 && c[0] >= Math.min(a[0], b[0]) - 1 && c[0] <= Math.max(a[0], b[0]) + 1;
        const onV = a[0] === b[0] && Math.abs(c[0] - a[0]) < 2 && c[1] >= Math.min(a[1], b[1]) - 1 && c[1] <= Math.max(a[1], b[1]) + 1;
        if (onH || onV) { at = tot + Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]); half = onH ? L.w / 2 : L.h / 2; } }
      tot += len; }
    if (at == null) return; const room = Math.min(at - half, tot - at - half);
    if (room < 16) say(`${where}: label "${e.label || L.step}" leaves its line ${Math.max(0, Math.round(room))} px (${e.s.label}→${e.t.label})`, e); });
  return issues;
}

/* label-overlap audit used by `visual.py check` (world coordinates, real font metrics) */
function auditSvg(svg, geo, where) {
  const issues = overlapIssues(geo, where), R = box;
  const T = [...svg.querySelectorAll('text[data-t]')].map(t => { let b; try { b = t.getBBox(); } catch (_) { return null; } return { t: t.dataset.t, o: t.dataset.o, txt: t.textContent, b: { x: b.x, y: b.y, w: b.width, h: b.height } }; }).filter(x => x && x.b.w);
  const nodes = geo.nodes, faces = Object.fromEntries([...svg.querySelectorAll('.node[data-face]')].map(g => [g.dataset.id, g.dataset.face.split(' ').map(Number)])); // a shape's face (0.15.0)
  T.forEach(a => {
    if (a.t === 'lt' || a.t === 'ft') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: lane "${a.txt}": header covers node "${n.label}"`); });
      if (a.t === 'ft') { const f = (geo.families || []).find(f => f.id === a.o); if (f && (a.b.x < f.x || a.b.x+a.b.w > f.x+f.w)) issues.push(`${where}: family title "${a.txt}" overflows its box`); }
    } else if (a.t === 'el') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: edge label "${a.txt}" covers node "${n.label}"`); });
    } else {
      const own = geo.byId[a.o];
      if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text "${a.txt}" overflows node "${own.label}"`);
      const face = own && faces[own.id], fy = face ? (face[0] + face[1]) / 2 : own && own.y + own.h / 2; // a shape's mark and text keep to its face
      if (own && geo.map && (a.t === 'nl' || a.t === 'ns') && hit(a.b, { x: own.x + 11, y: fy - 17, w: 34, h: 34 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${own.label}"`);
      if (face && (a.b.y < face[0] - 1 || a.b.y + a.b.h > face[1] + 1)) issues.push(`${where}: text "${a.txt}" overflows the shape of node "${own.label}"`);
      nodes.forEach(n => { if (n !== own && hit(a.b, R(n), -1)) issues.push(`${where}: text "${a.txt}" overlaps node "${n.label}"`); });
    }
  });
  svg.querySelectorAll('rect.verb-chip').forEach(r => { const own = geo.byId[r.closest('[data-id]').dataset.id], x = +r.getAttribute('x'); // a chip's pill, not only its text (#84)
    if (own && (x < own.x + 1 || x + +r.getAttribute('width') > own.x + own.w - 1)) issues.push(`${where}: chip "${r.nextElementSibling.textContent}" overflows node "${own.label}"`); });
  issues.push(...routeAudit(geo, where), ...leaveIssues(geo, where));
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
    const auto = autoPos(vid), out = {};
    ids.forEach(i => { if (Array.isArray(L[i])) out[i] = L[i]; });
    ids.forEach(i => { if (out[i]) return; let [c, r] = auto[i] || [0, 0]; while (Object.values(out).some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1)) r++; out[i] = [c, r]; }); // auto rows may be half rows: a row apart
    return out;
  }
  /* plain views: longest-path columns from the roots, state at the bottom of its column */
  /* views with containers: each container is a block in columns of its own, its cards in call order inside it; blocks (and
     cards in no container) run left to right by the lines between them, and those with no line between them stack in the
     same columns. A nested container is a block inside its parent's.
     A box is laid out three times (#86): by the lines inside it, as before; then each of its cards level with the cards its
     lines come from and go to outside it too, where the pass before put them; then ordered by those lines as well. Its far
     ends are items at their rows, in a column before its first (a line from the left) or after its last. A box's cards were
     placed by its own lines alone, so a box fed from outside, and the lines that pass it, ran into the cards beside it. */
  function blockPos(vid) {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v), boxes = (v.containers || []).filter(c => c && c.id);
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to), byBox = Object.fromEntries(boxes.map(b => [b.id, b]));
    const home = Object.fromEntries(ids.map(i => [i, (boxes.filter(b => (b.nodeIds || []).includes(i)).pop() || {}).id ?? null])); // the box a card is drawn in
    const up = x => ids.includes(x) ? home[x] : byBox[x] && byBox[byBox[x].parent] ? byBox[x].parent : null; // the box a card or box sits in
    const itemIn = (x, g) => { for (let k = 0; x != null && k < 64; k++, x = up(x)) if (up(x) === g) return x; }; // what in group g holds x
    const holds = (x, y) => { for (let k = 0; y != null && k < 64; k++, y = up(y)) if (y === x) return true; return false; };
    const first = x => { const k = lp.edges.findIndex(e => holds(x, e.from) || holds(x, e.to)); return k < 0 ? Infinity : k; };
    const sink = x => ids.includes(x) && isState(x) && !fwd.some(e => e.from === x); // state that leads nowhere goes last
    const lined = x => lp.edges.some(e => e.from !== e.to && (holds(x, e.from) || holds(x, e.to)));
    let was = {}, now = {}; // each box as the pass before laid it out, and as this one does
    const block = (g, P, order) => { // a group's cards at [col, row] from its top left, and its size in slots; P: where the pass before put each card
      const all = [...ids.filter(i => home[i] === g), ...boxes.filter(b => up(b.id) === g).map(b => b.id)];
      // cards with no line go in rows of their own under the group's columns, as under a plain view (#46): at the bottom of
      // their box, or under the view; they stacked in the first column with the sources
      const loose = all.some(lined) ? all.filter(x => ids.includes(x) && !lined(x)) : [], items = all.filter(x => !loose.includes(x)), size = {}, out = {};
      items.forEach(x => { size[x] = ids.includes(x) ? { w: 1, h: 1, pos: { [x]: [0, 0] } } : block(x, P, order); out[x] = []; });
      fwd.forEach(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g); if (a !== undefined && b !== undefined && a !== b && !out[a].includes(b)) out[a].push(b); });
      const st = {}, dag = [], into = new Set(Object.values(out).flat()); // lines that close a loop do not order the blocks
      const dfs = u => { st[u] = 1; out[u].forEach(w => { if (st[w] === 1) return; dag.push([u, w]); if (!st[w]) dfs(w); }); st[u] = 2; };
      [...items.filter(x => !into.has(x)), ...items].forEach(x => { if (!st[x]) dfs(x); });
      const rank = Object.fromEntries(items.map(x => [x, 0]));
      for (let it = 0; it < items.length; it++) dag.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) rank[b] = rank[a] + 1; });
      const cols = [], pos = {}; let c0 = 0, h = 0;
      items.forEach(x => (cols[rank[x]] ||= []).push(x));
      const main = cols.map(l => (l || []).filter(x => !sink(x)).sort((a, b) => first(a) - first(b)));
      const inside = (x, id) => ids.includes(x) ? 0 : (size[x].pos[id] || [0, null])[1]; // the row of a box's card that a line meets
      const dagged = new Set(dag.map(([a, b]) => a + '\u0000' + b)), lines = fwd.map(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g);
        return a !== undefined && b !== undefined && a !== b ? { e, link: [a, b, inside(a, e.from), inside(b, e.to)] } : null; }).filter(Boolean);
      // the box's lines to cards outside it (#86): each far end at its row from the box's top, where the pass before put both.
      // ponytail: three passes, so a far end that moves in the last one is followed where it was, and a far end in the card's
      // own column, or a line to a box, places nothing; passes until nothing moves, if a map needs them
      const far = [], fixed = {}, top = P && g != null && was[g] ? Object.keys(was[g].pos).map(c => P[c] && P[c][1] - was[g].pos[c][1]).find(r => r != null) : null;
      if (top != null) fwd.forEach(e => { const fin = holds(g, e.from); if (fin === holds(g, e.to)) return;
        const [mine, other] = fin ? [e.from, e.to] : [e.to, e.from], x = itemIn(mine, g), p = P[mine], q = P[other]; if (x === undefined || !p || !q || p[0] === q[0]) return;
        const id = '\u0002' + far.length, left = q[0] < p[0]; fixed[id] = q[1] - top;
        far.push({ e, id, left, link: left ? [id, x, 0, inside(x, mine)] : [x, id, inside(x, mine), 0] }); });
      const L = far.filter(f => f.left).map(f => f.id), R = far.filter(f => !f.left).map(f => f.id), M = [...(L.length ? [L] : []), ...main, ...(R.length ? [R] : [])];
      const hh = x => size[x] ? size[x].h : 1;
      untangle(M, [...lines.filter(l => dagged.has(l.link[0] + '\u0000' + l.link[1])), ...(order ? far : [])].map(l => l.link), hh, fixed); // in call order, unless another order crosses less (#53)
      main.splice(0, main.length, ...M.slice(L.length ? 1 : 0, M.length - (R.length ? 1 : 0)));
      const row = rowsFor(M, [...lines, ...far].filter(l => level(l.e)).map(l => l.link), hh, fixed); // each block level with the cards its lines come from and go to
      main.forEach((l, k) => { cols[k] = [...l, ...(cols[k] || []).filter(sink).sort((a, b) => first(a) - first(b))]; });
      cols.forEach(list => { let r0 = 0, w = 0;
        list.forEach(x => { const sz = size[x]; if (row[x] != null) r0 = Math.max(r0, row[x]);
          Object.entries(sz.pos).forEach(([id, [c, r]]) => { pos[id] = [c0 + c, r0 + r]; }); r0 += sz.h; w = Math.max(w, sz.w); });
        c0 += w; h = Math.max(h, r0); });
      const per = Math.max(2, c0); loose.forEach((x, k) => { pos[x] = [k % per, h + Math.floor(k / per)]; });
      if (loose.length) { c0 = Math.max(c0, Math.min(per, loose.length)); h += Math.ceil(loose.length / per); }
      return (now[g] = { w: c0, h, pos });
    };
    let P = block(null).pos;
    for (const order of [false, true]) { was = now; now = {}; P = block(null, P, order).pos; } // levelled by the lines from outside, then ordered by them too
    return P;
  }
  const autoPos = vid => ((V[vid] || {}).containers || []).length ? blockPos(vid) : bestFlow(vid);
  const level = e => !/^(top|bottom)$/.test(e.fromSide) && !/^(top|bottom)$/.test(e.toSide); // a line into a card's top or bottom asks for no row
  /* A small plain view is routed a few ways and keeps the one the layout check scores best: cards level with their
     neighbours, or packed from the top as before, with cards no line comes into beside their callee or not. A cheap
     version of the CLI's search (optimize), affordable up to 30 cards; a larger view takes the first way. */
  function bestFlow(vid) {
    const first = flowPos(vid), n = ((V[vid] || {}).nodeIds || []).length;
    if (n > 30 || n < 3) return first;
    const seen = new Set([JSON.stringify(first)]), ways = [first];
    for (const o of [{ pull: true }, { packed: true }, { pull: true, packed: true }]) { const p = flowPos(vid, o), k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); ways.push(p); } }
    if (ways.length < 2) return first;
    let best = first, score = Infinity;
    ways.forEach(p => { const g = buildGeo(vid, p), s = scoreGeo(g); if (s < score - 0.5) { score = s; best = p; drawn[vid] = { pos: p, g }; } }); // as it will be drawn: with port repair
    return best;
  }
  const drawn = {}; // the way bestFlow kept, routed already: the view's next buildGeo takes it once instead of routing it again
  function flowPos(vid, o = {}) {
    const v = V[vid], lp = loopsOf(v), fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    // cards with no line go in rows of their own under the view (#46), as wide as its columns; they stacked with the sources
    const all = (v.nodeIds || []).filter(i => N[i]), lined = new Set(lp.edges.filter(e => e.from !== e.to).flatMap(e => [e.from, e.to]));
    const loose = lined.size ? all.filter(i => !lined.has(i)) : [], ids = all.filter(i => !loose.includes(i));
    const rank = {}; ids.forEach(i => { rank[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (rank[e.to] < rank[e.from] + 1) rank[e.to] = rank[e.from] + 1; });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id || e.from === id); return k < 0 ? 999 : k; };
    const sink = i => isState(i) && !fwd.some(e => e.from === i); // state that leads nowhere sits along the bottom
    const pos = {}, links = fwd.map(e => [e.from, e.to]);
    const order = rk => { const cols = {}; ids.forEach(i => (cols[rk[i]] ||= []).push(i));
      const ranks = Object.keys(cols).map(Number).sort((a, b) => a - b), mains = ranks.map(c => cols[c].filter(i => !sink(i)).sort((a, b) => seen(a) - seen(b)));
      untangle(mains, links); return { cols, ranks, mains }; }; // in reading order, unless another order crosses less (#53)
    const { cols, ranks, mains } = order((o.pull && pullSources(ids, links, rank)) || rank);
    const row = o.packed ? Object.fromEntries(mains.flatMap(m => m.map((i, r) => [i, r]))) : rowsFor(mains, fwd.filter(level).map(e => [e.from, e.to]));
    const height = Math.max(0, ...Object.values(row)) + 1;
    Object.entries(cols).forEach(([c, list]) => {
      const main = mains[ranks.indexOf(+c)], st = list.filter(sink).sort((a, b) => seen(a) - seen(b));
      main.forEach(i => { pos[i] = [+c, row[i]]; });
      st.forEach((i, r) => { pos[i] = [+c, height + r]; }); // state along the bottom, never above the flow
    });
    const per = Math.max(2, Object.keys(cols).length), under = Math.max(...Object.values(pos).map(p => p[1])) + 1;
    loose.forEach((i, k) => { pos[i] = [k % per, under + Math.floor(k / per)]; });
    return pos;
  }

  function buildView(vid, opts = {}) {
    const g = buildGeo(vid);
    return { g, ...drawView(vid, g, opts) };
  }
  // a view's notation (0.15.0): its own `shapes`, else the model's, else box; drawView: the picture of a geometry in one,
  // with no layout (a change of notation draws the cards again and nothing else)
  const notationOf = vid => noteOf((V[vid] || {}).shapes) || noteOf(D.shapes) || 'box';
  function drawView(vid, g, opts = {}) {
    const v = V[vid], shapes = noteOf(opts.shapes) || notationOf(vid);
    return { markup: svgOf(g, { title: v.title, subject: subjectOf(v), icons: D.icons, broken: brokenIn(vid), ...opts, shapes }), shapes };
  }
  // the rules a view's lines break (#70), by model edge id: svgOf draws such a line rose, with a mark that names them
  let ruled = null;
  const brokenIn = vid => {
    if (!arrOf(D.rules).length) return null;
    const by = {}, title = id => { const r = D.rules.find(x => x && x.id === id); return String((r && (r.title || r.id)) ?? id); };
    (ruled ||= rules(D)).forEach(b => { if (b.view === vid) b.targets.forEach(t => { if (t.type === 'edge') t.ids.forEach(i => { const l = by[i] ||= []; if (!l.includes(title(b.rule))) l.push(title(b.rule)); }); }); });
    return Object.keys(by).length ? by : null;
  };
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
    return out.filter(e => { const r = !(V[vid] || {}).keepPairs && pair[e.to + '>' + e.from]; if (r) { r.both = true; r.back = false; r.all = [...(r.all || [r]), ...(e.all || [e])]; if (e.label && e.label !== r.label) r.label = (r.label ? r.label + ' / ' : '') + e.label;
      if (r.all.some(x => x.step != null)) r.when = r.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n'); else if (e.when) r.when = [r.when, e.when].filter(Boolean).join(' · '); return false; } pair[e.from + '>' + e.to] = e; return true; })
      .map(e => { const all = e.all || [e], subs = [...new Set(all.map(x => x.sublabel).filter(x => x != null && x !== '').map(String))];
        return { ...e, wk: wireKind(e, opts.kinds || (V[vid] || {}).kindsFromLabels), weight: Math.max(...all.map(x => [2, 3].includes(+x.weight) ? +x.weight : 1)), sublabel: subs.join(' / ') || undefined, ...markOf(all) }; });
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
    const ready = drawn[vid]; delete drawn[vid]; if (ready && !override && ready.pos === pos && repair === (v.repair !== false) && !quick) return ready.g;
    const mainSteps = v.mainSteps || v.render === 'process';
    const stepIds = v.stepIds || ids;
    const dg = { nodeH: mainSteps ? 82 : v.subAndChips ? 80 : 64, subAndChips: !!v.subAndChips, mainSteps, containers: v.containers, nodes: ids.map(i => { const n = nodeIn(i, vid), step = mainSteps && stepIds.includes(i); return { ...n, sub: n.sub || n.sublabel, emphasis: !!step || !!n.emphasis, step: step ? stepIds.indexOf(i) + 1 : (v.cardSteps || {})[i] || null, verbs: step ? [] : n.verbs, kids: kidCount(i, vid), opens: !!opensOf(i, vid), col: (pos[i] || [0, 0])[0], row: (pos[i] || [0, 0])[1] }; }),
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
    const start = JSON.stringify(pos), boxed = (v.containers || []).length, homeOf = i => ((v.containers || []).filter(c => (c.nodeIds || []).includes(i)).pop() || {}).id; // blocks stay whole
    const lined = new Set(viewEdges(v).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), loose = i => lined.size && !lined.has(i);
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
          else if (kind === 'col') { const nc = ca + arg; let r = ra; while (ids.some(b => b !== a && c[b][0] === nc && Math.abs(c[b][1] - r) < 1)) r++; c[a] = [nc, r]; }
          else if (kind === 'row') {
            let r = ra + arg;
            if (band(a) && r <= stateFloor()) r = stateFloor() + 1;
            while (ids.some(b => b !== a && c[b][0] === ca && Math.abs(c[b][1] - r) < 1)) r += arg > 0 ? 1 : -1; // rows may be half rows: keep a row apart
            if (r < 0 || (band(a) && r <= stateFloor())) continue;
            c[a][1] = r;
          }
          else { const nc = 2 * hubCol - ca; const occ = ids.find(b => c[b][0] === nc && c[b][1] === ra); if (occ) c[occ][0] = ca; c[a][0] = nc; }
          if (Math.min(...ids.map(i => c[i][0])) < 0) { const m = Math.min(...ids.map(i => c[i][0])); ids.forEach(i => { c[i][0] -= m; }); }
          if (tryPos(c)) { improved = true; break; }
        }
      }
    }
    // it scores without port repair: render()'s layout stays unless the one it found routes better as the page draws it (#86: for
    // r15's monorepo it baked in a crossing that render()'s layout has not)
    if (JSON.stringify(pos) !== start && scoreGeo(buildGeo(vid, JSON.parse(start))) <= scoreGeo(buildGeo(vid, pos))) pos = JSON.parse(start);
    return { pos, score: best, evals };
  }
  // what a view's picture is drawn from: an update keeps the layout of every view whose key did not change
  const viewKey = vid => {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), ns = ids.map(i => nodeIn(i, vid));
    const icons = [...new Set(ns.map(n => n.icon).filter(Boolean))].map(k => (D.icons || {})[k]), who = [...new Set(ns.map(n => n.author).filter(Boolean))].map(k => (D.authors || {})[k]);
    return JSON.stringify([{ ...v, shapes: undefined }, ns, viewEdges(v), ids.map(i => [kidCount(i, vid), opensOf(i, vid)]), icons, who]); // a view's notation lays nothing out
  };
  /* ---------- unfolding in place (#71): a stacked card opens into a box on the view it is on ----------
     The card becomes a box with its id and name, holding its inner view's own cards: those not on this view already (the
     inner view's other cards are this view's, its neighbours). Inside, the inner view's lines between them. This view's
     lines stay this view's: one to the card moves onto every card inside that the inner view joins to that neighbour, the
     same way round, or, with none, ends on the box's border; the inner view's other lines to neighbours are not added. The
     box is the inner view's own cards in their own order, at the card's place: later columns move right by its width, and
     the cards under it in its column move down by its height, so the rest of the picture keeps its places (a hub view, which
     has no columns, is laid out again). The inner view's boxes that hold its own cards come along inside, and a numbered
     (sequence) view's run order: its numbers, its loops back and its lanes (#82). Not in a numbered view: its own steps
     would be numbered again; that card opens. */
  // the inner view's own cards: those this view shows neither as cards nor as boxes (a card unfolded here already is one, #98)
  const ownOf = (v, C, nid) => (C.nodeIds || []).filter(i => N[i] && i !== nid && !(v.nodeIds || []).includes(i) && !(v.containers || []).some(b => b && b.id === i));
  const unfoldable = (nid, vid) => { const v = V[vid], ids = (v && v.nodeIds) || [], c = ids.includes(nid) && N[nid] && v.render !== 'sequence' ? childOf(nid, vid) : null;
    if (!c || c === vid || chain(vid).includes(c) || (v.containers || []).some(b => b && b.id === nid)) return null;
    return ownOf(v, V[c], nid).length ? c : null; };
  function unfold(vid, nid) {
    const v = V[vid], c = unfoldable(nid, vid); if (!c) return false;
    const C = V[c], outer = (v.nodeIds || []).filter(i => N[i]), inner = ownOf(v, C, nid);
    const n0 = nodeIn(nid, vid), holder = (v.containers || []).filter(b => b && (b.nodeIds || []).includes(nid)).pop();
    const boxes = (v.containers || []).filter(b => b && b.id).map(b => ({ ...b, nodeIds: (b.nodeIds || []).filter(i => i !== nid) }));
    const taken = new Set([...outer, ...inner, ...boxes.map(b => b.id)]);
    const cb = (C.containers || []).filter(b => b && b.id && !taken.has(b.id) && (b.nodeIds || []).some(i => inner.includes(i))), kept = new Set(cb.map(b => b.id));
    const above = b => { let p = b.parent; for (let k = 0; p != null && !kept.has(p) && k < 64; k++) p = ((C.containers || []).find(x => x && x.id === p) || {}).parent; return kept.has(p) ? p : nid; };
    // a numbered view drawn around one card (a hub) brings its lanes, boxed as it draws them, in their order (#82)
    const hp = C.render === 'sequence' && planOf(c).hub ? planOf(c) : null;
    const lanes = hp && hp.boxed ? hp.lanes.map((L, j) => ({ id: `${nid}:lane${j + 1}`, label: L.title, lane: true, nodeIds: L.ids.filter(i => inner.includes(i)), parent: nid })).filter(b => b.nodeIds.length) : [];
    const own = [...cb.map(b => ({ ...b, nodeIds: b.nodeIds.filter(i => inner.includes(i)), parent: above(b) })), ...lanes], boxed = new Set(own.flatMap(b => b.nodeIds));
    const box = { id: nid, label: n0.label || nid, nodeIds: inner.filter(i => !boxed.has(i)), unfolds: c, ...(holder ? { parent: holder.id } : {}), ...(badgesOf(n0).length ? { badges: badgesOf(n0) } : {}) };
    const isIn = id => inner.includes(id) || kept.has(id), mine = viewEdges(v);
    const to = new Set(mine.filter(e => e.to === nid).map(e => e.from)), from = new Set(mine.filter(e => e.from === nid).map(e => e.to)); // this view's neighbours of the card
    let theirs = viewEdges(C).filter(e => isIn(e.from) ? isIn(e.to) || from.has(e.to) : isIn(e.to) && to.has(e.from));
    // a line drawn both ways stays a pair: it moves inside only if the inner view joins that neighbour to one card both ways
    const ends = (a, out) => [...new Set(theirs.filter(e => out ? isIn(e.from) && e.to === a : e.from === a && isIn(e.to)).map(e => out ? e.from : e.to))].join();
    const split = new Set([...to].filter(a => from.has(a) && (ends(a, true) || ends(a, false)) && (ends(a, true) !== ends(a, false) || ends(a, true).includes(','))));
    theirs = theirs.filter(e => !split.has(isIn(e.from) ? e.to : e.from));
    /* a numbered view's run order comes along (#82): its lines keep their numbers, and a step back stays a loop back. A step
       between the card itself and a card inside has no line (the card is the box), and a hub's steps show on the cards they
       reach, as the numbered view draws them: those numbers go on that card inside. On a numbered card (a process view's
       step, or one an unfolded numbered view numbered) they go under its number: step 4's are 4.1, 4.2 */
    const tags = {}, onCard = e => e.from === nid ? e.to : e.to === nid ? e.from : hp && e.from === hp.hub ? e.to : null;
    const sid = v.stepIds || outer, at = (v.mainSteps || v.render === 'process') && sid.includes(nid) ? sid.indexOf(nid) + 1 : (v.cardSteps || {})[nid];
    const num = j => /^\d+(\.\d+)*$/.test(String(at ?? '')) ? `${at}.${j + 1}` : j + 1; // a card with several numbers (2·3) holds no one step
    if (C.render === 'sequence') { const lq = loopsOf(C);
      lq.edges.forEach((e, j) => { const o = onCard(e); if (inner.includes(o)) (tags[o] ||= []).push(num(j)); });
      theirs = theirs.map(e => { const j = lq.edges.indexOf(e); return { ...e, ...(inner.includes(onCard(e)) ? {} : { step: num(j) }), ...(lq.back.has(j) ? { loop: true } : {}) }; }); }
    const exact = new Set(theirs.flatMap(e => isIn(e.from) === isIn(e.to) ? [] : isIn(e.to) ? [e.from + '>'] : ['>' + e.to])); // neighbours the inner view joins to a card inside
    const k = (v.nodeIds || []).indexOf(nid), grid = !planOf(vid).hub;
    const pos = grid ? (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid))) : null;
    Object.assign(v, { nodeIds: [...v.nodeIds.slice(0, k), ...inner, ...v.nodeIds.slice(k + 1)], containers: [...boxes, box, ...own],
      edges: [...mine.filter(e => !(e.to === nid && exact.has(e.from + '>')) && !(e.from === nid && exact.has('>' + e.to))), ...theirs] });
    if ((v.tour || []).includes(nid)) delete v.tour;
    if (v.mainSteps || v.render === 'process') v.stepIds = v.stepIds || outer; // the steps keep their numbers; the cards inside are not steps
    if (Array.isArray(v.intake)) v.intake = v.intake.filter(s => s && s.to !== nid);
    if (+C.gap > (v.gap || 66)) v.gap = +C.gap; if (+C.rgap > (v.rgap || 44)) v.rgap = +C.rgap; // the room the inner view's lines were given
    Object.entries(tags).forEach(([i, s]) => { (v.cardSteps ||= {})[i] = s.length > 2 ? s[0] + '+' : s.join('·'); }); // as hubGeo's stepTxt; buildGeo draws them
    delete v.layout; delete planCache[vid]; delete layoutCache[vid]; delete drawn[vid];
    if (!grid) return true; // a hub view has no columns to keep: laid out again, with its boxes
    /* the box's slots: the inner view's own cards in its columns, or in this view's reading order, and in its rows packed,
       upside down, or each card level with its neighbours (the median row of the cards outside it joins to, and of those to
       its left inside, as rowsFor does). Each way is routed, and the one the layout check scores best is kept */
    const [xc, xr] = pos[nid] || [0, 0], seen = new Set(), ways = [], med = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const levelled = (ic, ir) => { const R = {}, cols = [...new Set(inner.map(ic))].sort((a, b) => a - b);
      cols.forEach(k => { const want = {}, col = inner.filter(i => ic(i) === k);
        col.forEach(i => { const nb = theirs.flatMap(e => e.from === i ? [e.to] : e.to === i ? [e.from] : []).map(o => !isIn(o) && pos[o] ? pos[o][1] - xr : R[o]).filter(r => r != null);
          want[i] = nb.length ? med(nb) : ir(i); });
        let prev = -1; col.sort((a, b) => want[a] - want[b] || ir(a) - ir(b)).forEach(i => { R[i] = prev = Math.max(0, Math.round(want[i]), prev + 1); }); });
      return i => R[i]; };
    // with boxes of its own, the inner view keeps its slots, moved to the box's corner: empty slots are its boxes' room. Else
    // its columns, or columns in this view's own reading order: a loop the inner view closes with one line may close here
    // with another, or not at all
    const inBox = (id, seen = new Set()) => seen.has(id) ? [] : (seen.add(id), [...((boxes.find(x => x.id === id) || {}).nodeIds || []), ...boxes.filter(k => k.parent === id).flatMap(k => inBox(k.id, seen))]);
    const xBoxes = new Set(); for (let b = holder, k = 0; b && k < 64; k++, b = boxes.find(x => x.id === b.parent)) xBoxes.add(b.id); // the boxes the card is in
    // a hub's slots, as it draws them: the hub, then its lanes' columns in order (#82). ponytail: rows in each column's order,
    // not level with the part before as hubGeo lines them up; do that if a lane of several columns reads badly
    const hs = hp && { [hp.hub]: [0, 0] };
    if (hs) hp.lanes.flatMap(L => L.cols).map(col => col.filter(i => inner.includes(i))).filter(col => col.length).forEach((col, j) => col.forEach((i, r) => { hs[i] = [j + 1, r]; }));
    const ip0 = hs || (C.layout ? fillLayout(c, C.layout) : (layoutCache[c] ||= autoPos(c))), lp = loopsOf(v), rk = Object.fromEntries(inner.map(i => [i, 0]));
    const fwd = lp.edges.filter((e, j) => !lp.back.has(j) && e.from !== e.to && inner.includes(e.from) && inner.includes(e.to));
    for (let it = 0; it < inner.length; it++) fwd.forEach(e => { if (rk[e.to] < rk[e.from] + 1) rk[e.to] = rk[e.from] + 1; });
    const one = own.length || v.nodeIds.length > 30; // its boxes' room to keep, or too big to route seven times: its own slots only
    // the sides the inner view gave its lines are for its own picture: with its own slots they stay; elsewhere each way is
    // also routed with the router picking them (copies, which keep the ids)
    const keepE = v.edges, freeE = theirs.some(e => e.fromSide || e.toSide) ? keepE.map(e => theirs.includes(e) && (e.fromSide || e.toSide) ? (({ fromSide, toSide, ...r }) => r)(e) : e) : null;
    [ip0, ...(one ? [] : [Object.fromEntries(inner.map(i => [i, [rk[i], (ip0[i] || [0, 0])[1]]]))])].forEach(ip => (one ? [false] : [false, true, 'level']).forEach(flip => {
      const at = (i, j) => (ip[i] || [0, 0])[j], rank = j => { const u = [...new Set(inner.map(i => at(i, j)))].sort((a, b) => flip === true && j ? b - a : a - b), lo = u[0];
        const k = j && u.some(r => r % 1) ? 2 : 1; // half rows doubled: a box that ends on a half row gets no gap under it (layoutPass widens whole rows)
        return own.length ? i => (at(i, j) - lo) * k : i => u.indexOf(at(i, j)); };
      const ic = rank(0), ir = flip === 'level' ? levelled(rank(0), rank(1)) : rank(1), w = Math.max(...inner.map(ic)) + 1, h = Math.max(...inner.map(ir)) + 1, L = {};
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + w - 1, r0] : Math.abs(c0 - xc) < .5 && r0 > xr ? [c0, r0 + h - 1] : [c0, r0]; });
      inner.forEach(i => { L[i] = [xc + ic(i), xr + ir(i)]; });
      // a box of this view with cards on both sides of the card's column, under it, would now reach into the unfolded box:
      // it moves down under it, whole; then a card on a taken slot moves down a row
      boxes.forEach(b => { if (xBoxes.has(b.id)) return; const ms = inBox(b.id).filter(i => L[i]); if (!ms.length) return;
        const cs = ms.map(i => L[i][0]), rs = ms.map(i => L[i][1]);
        if (Math.max(...cs) < xc || Math.min(...cs) > xc + w - 1 || Math.max(...rs) < xr || Math.min(...rs) > xr + h - 1) return;
        const dr = xr + h - Math.min(...rs); ms.forEach(i => { L[i] = [L[i][0], L[i][1] + dr]; }); });
      const slots = inner.map(i => L[i]); outer.forEach(i => { if (i === nid) return; let [c0, r0] = L[i];
        while (slots.some(([c1, r1]) => c1 === c0 && Math.abs(r1 - r0) < 1)) r0++; slots.push(L[i] = [c0, r0]); });
      const key = JSON.stringify(inner.map(i => L[i])); if (seen.has(key)) return; seen.add(key);
      ways.push({ L, free: false }); if (freeE && (ip !== ip0 || flip !== false)) ways.push({ L, free: true }); }));
    // a card inside a box it is not in reads as one of the box's (and loses a line to the box): a way with one loses
    const strays = g => (g.families || []).reduce((a, f) => a + g.nodes.filter(n => !(f.nodeIds || []).includes(n.id) && n.x + n.w / 2 > f.x && n.x + n.w / 2 < f.x + f.w && n.y + n.h / 2 > f.y && n.y + n.h / 2 < f.y + f.h
      && !(g.families || []).some(o => o.id !== f.id && (o.nodeIds || []).includes(n.id) && o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h)).length, 0);
    let best = null; // ponytail: up to 12 routings per unfold, a view of over 30 cards one; a smarter search when a bigger map needs it
    const score = ({ L, free }) => { v.edges = free ? freeE : keepE; hush = []; let g; try { g = buildGeo(vid, L); } finally { g && (g.said = hush); hush = null; }
      const s = scoreGeo(g) + (strays(g) * 5 + leaveIssues(g, '').length) * 1000; if (!best || s < best.s - .5) best = { L, g, s, free }; };
    ways.forEach(score);
    // still an issue, and cards under the card in its column: the box one column to the right instead, so they keep their slots
    if (best.s >= 1000 && v.nodeIds.length <= 30 && outer.some(i => i !== nid && pos[i] && Math.abs(pos[i][0] - xc) < .5)) { const B = best.L, L = {};
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + 1 + Math.max(...inner.map(j => B[j][0])) - xc, r0] : [c0, r0]; });
      inner.forEach(i => { L[i] = [B[i][0] + 1, B[i][1]]; }); score({ L, free: best.free }); }
    best.g.said.forEach(warn); delete best.g.said;
    v.edges = best.free ? freeE : keepE; v.layout = best.L; drawn[vid] = { pos: best.L, g: best.g }; // drawn as scored, without routing it again
    return true;
  }
  const unfolded = {}; // per view: the cards opts.expand named that did unfold, in order (one inside another unfolds after it)
  withM(() => Object.entries(opts.expand || {}).forEach(([vid, ids]) => { let todo = V[vid] ? [...new Set([].concat(ids || []))] : [];
    for (let more = true; more && todo.length;) { more = false; todo = todo.filter(nid => { if (!unfold(vid, nid)) return true; (unfolded[vid] ||= []).push(nid); return !(more = true); }); } }))();
  const geoCache = {};
  return { D, views, nodes, N, V, rootId, nodeIn, childOf, opensOf, subjectOf, viewsWith, kidsOf, chain, viewEdges, isState, planOf: withM(planOf), planCache,
    layoutCache, geoCache, buildGeo: withM(buildGeo), buildView: withM(buildView), drawView: withM(drawView), notationOf, optimize: withM(optimize), flowPos, kidCount, viewKey, brokenIn, unfoldable, unfolded };
}

const edgeRefIds = e => [...new Set((e.all || [e]).map(x => x._id).filter(Boolean))];

/* layout(model, viewId): one view's geometry, as the canvas draws it. No DOM. */
export function layout(model, viewId, options = {}) {
  const ctx = mapContext(model, { measure: options.measure, ...(options.expand ? { expand: { [viewId]: options.expand } } : {}) }); // expand: cards unfolded in place (#71)
  if (!ctx.V[viewId]) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  ctx.planOf(viewId);
  const g = ctx.buildGeo(viewId, undefined, options.repair);
  g.edges.forEach(e => { e.ids = edgeRefIds(e); });
  if (options.expand) g.unfolded = ctx.unfolded[viewId] || [];
  return g;
}

/** The layout check's geometry for one view, without a browser: overlapping cards, crossing or shared lines, detours,
 *  lines round their own ends, against reading order or through a card, labels on lines or off their own, boxes and lanes. The page's check
 *  (`umlimator.py check`) adds what it measures in the DOM: text that overflows its card or touches its mark, titles
 *  that overflow, edge labels on cards or on each other. Each issue names the cards and lines it is about. */
export function check(model, viewId, options = {}) {
  const g = layout(model, viewId, options), where = `view ${viewId}`, about = [], lines = new Set(g.edges), boxes = new Set(g.families || []);
  const ref = x => lines.has(x) ? { type: 'edge', ids: x.ids, view: viewId } : boxes.has(x) ? { type: 'container', id: x.id, view: viewId } : { type: 'node', id: x.id, view: viewId };
  return [...overlapIssues(g, where, about), ...routeAudit(g, where, null, about), ...leaveIssues(g, where, about)]
    .map((message, i) => ({ message, targets: about[i].filter(Boolean).map(ref) }));
}

const WIRE_KINDS = ['calls', 'feeds', 'triggers', 'state', 'guard'], SIDES = ['left', 'right', 'top', 'bottom'];
/** A model's own problems, before anything is drawn: errors draw as holes or not at all (ids that are missing,
 *  repeated or name nothing, boxes inside themselves); warnings draw other than they say (an unknown kind or weight,
 *  a side that is not one, a view opened before the host has loaded it). Each says where: `views[2].nodeIds[4]`. */
export function validate(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  const arr = x => (Array.isArray(x) ? x : []), m = model && typeof model === 'object' ? model : {}, views = arr(m.views).filter(v => v && typeof v === 'object');
  if (!Array.isArray(m.nodes)) err('nodes', 'the model needs a list of cards');
  if (!views.length) err('views', 'the model has no views');
  const ids = new Set(), vids = new Set(), lineIds = new Set();
  const card = (n, at) => {
    if (!n || typeof n.id !== 'string' || !n.id) return err(at + '.id', 'a card needs an id');
    if (ids.has(n.id)) err(at + '.id', `card id "${n.id}" is used twice`); ids.add(n.id);
    const k = String(n.kind ?? '').toLowerCase();
    if (n.kind != null && !(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(at + '.kind', `unknown kind "${n.kind}": drawn as a script card`);
    if (n.owner != null && typeof n.owner !== 'string') warn(at + '.owner', 'an owner is a name: ignored');
    shapeIs(n, at);
  };
  const shapeIs = (n, at) => { if (n && n.shape != null && !SHAPE_NAMES.includes(String(n.shape).toLowerCase())) warn(at + '.shape', `unknown shape "${n.shape}": the notation draws it by its kind (the shapes: ${SHAPE_NAMES.join(', ')})`); };
  const notation = (x, at) => { if (x != null && !noteOf(x)) warn(at, `"${x}" is not a notation (${NOTATIONS.join(', ')}): drawn as box`); }; // card shapes (0.15.0)
  notation(m.shapes, 'shapes');
  arr(m.nodes).forEach((n, i) => card(n, `nodes[${i}]`));
  views.forEach((v, i) => arr(v.nodes).forEach((n, j) => card(n, `views[${i}].nodes[${j}]`)));
  views.forEach((v, i) => { if (typeof v.id !== 'string' || !v.id) err(`views[${i}].id`, 'a view needs an id'); else if (vids.has(v.id)) err(`views[${i}].id`, `view id "${v.id}" is used twice`); else vids.add(v.id); });
  if (m.root != null && !vids.has(m.root)) err('root', `root "${m.root}" is not a view`);
  const later = (x, at) => { if (x && x.opensView && !vids.has(x.opensView)) warn(at + '.opensView', `opens "${x.opensView}", a view the model does not have: fine if the host loads it when it is opened`); };
  arr(m.nodes).forEach((n, i) => later(n, `nodes[${i}]`));
  views.forEach((v, i) => notation(v.shapes, `views[${i}].shapes`));
  // c4 draws a frontend card as a browser: a person's icon on one says the model means a person (0.15.0)
  const inC4 = new Set(views.filter(v => (noteOf(v.shapes) || noteOf(m.shapes)) === 'c4').flatMap(v => arr(v.nodeIds)));
  arr(m.nodes).forEach((n, i) => { if (!n || !inC4.has(n.id) || n.shape != null || !['user', 'users', 'usercheck'].includes(n.icon)) return;
    if (shapeOf({ ...n, k: kindOf(n.kind, true) }, 'c4') === 'browser') warn(`nodes[${i}].kind`, `"${n.label || n.id}" has a person's icon, but c4 draws a ${n.kind} card as a browser: kind "person" (or shape "person") draws a person`); });
  const line = (e, at, ends) => {
    if (!e || typeof e !== 'object') return err(at, 'a line is an object with from and to');
    ['from', 'to'].forEach(k => { if (!ends.has(e[k])) err(`${at}.${k}`, `"${e[k]}" is neither a card nor a box`); });
    if (e.kind != null && !WIRE_KINDS.includes(e.kind)) warn(at + '.kind', `unknown line kind "${e.kind}": drawn as calls`);
    if (e.weight != null && ![1, 2, 3].includes(e.weight)) warn(at + '.weight', `weight ${JSON.stringify(e.weight)} is not 1, 2 or 3: drawn as 1`);
    ['fromSide', 'toSide'].forEach(k => { if (e[k] != null && !SIDES.includes(e[k])) warn(`${at}.${k}`, `"${e[k]}" is not left, right, top or bottom: ignored`); });
    ['latency', 'cost'].forEach(k => { if (e[k] != null && !(typeof e[k] === 'number' && e[k] >= 0)) warn(`${at}.${k}`, `${k} ${JSON.stringify(e[k])} is not a number of 0 or more: counted as 0`); }); // budgets (#95)
    if (e.step != null && !(typeof e.step === 'number' ? e.step >= 0 : typeof e.step === 'string' && e.step.length >= 1 && e.step.length <= 3))
      warn(at + '.step', `step ${JSON.stringify(e.step)} is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written`);
  };
  // a model line may end on any view's box (#28); a view's own line only on that view's boxes
  const anyBox = new Set(views.flatMap(v => arr(v.containers).map(c => c && c.id)));
  arr(m.edges).forEach((e, i) => { line(e, `edges[${i}]`, new Set([...ids, ...anyBox]));
    if (e && e.id != null) { if (lineIds.has(e.id)) err(`edges[${i}].id`, `line id "${e.id}" is used twice`); lineIds.add(e.id); } });
  views.forEach((v, i) => {
    const at = `views[${i}]`, mine = new Set(arr(v.nodeIds)), boxes = {};
    if (v.parent != null && !vids.has(v.parent) && !ids.has(v.parent)) err(at + '.parent', `parent "${v.parent}" is not a view`);
    arr(v.nodeIds).forEach((id, j) => { if (!ids.has(id)) err(`${at}.nodeIds[${j}]`, `"${id}" is not a card`); });
    Object.entries(v.nodeOverrides || {}).forEach(([id, o]) => { if (!ids.has(id)) err(`${at}.nodeOverrides.${id}`, `"${id}" is not a card`); later(o, `${at}.nodeOverrides.${id}`); shapeIs(o, `${at}.nodeOverrides.${id}`); });
    arr(v.nodes).forEach((n, j) => later(n, `${at}.nodes[${j}]`));
    ['stepIds', 'tour'].forEach(k => arr(v[k]).forEach((id, j) => { if (!mine.has(id)) err(`${at}.${k}[${j}]`, `"${id}" is not one of the view's cards`); }));
    arr(v.browserOrder).forEach((id, j) => { if (!vids.has(id)) err(`${at}.browserOrder[${j}]`, `"${id}" is not a view`); });
    arr(v.intake).forEach((s, j) => { if (!mine.has(s && s.to)) err(`${at}.intake[${j}].to`, `"${s && s.to}" is not one of the view's cards`); });
    arr(v.containers).forEach((c, j) => { if (!c || !c.id) err(`${at}.containers[${j}].id`, 'a box needs an id'); else if (boxes[c.id]) err(`${at}.containers[${j}].id`, `box id "${c.id}" is used twice`); else boxes[c.id] = c; });
    arr(v.containers).forEach((c, j) => { if (!c) return;
      arr(c.nodeIds).forEach((id, k) => { if (!mine.has(id)) err(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards`); });
      if (c.parent != null && !boxes[c.parent]) err(`${at}.containers[${j}].parent`, `"${c.parent}" is not a box of this view`);
      if (c.tone != null && typeof c.tone !== 'string') warn(`${at}.containers[${j}].tone`, `tone ${JSON.stringify(c.tone)} is not a palette name (green, amber, ...): ${c.tone ? 'drawn in slate' : 'ignored'}`);
      for (let p = c.parent, seen = new Set([c.id]); p != null && boxes[p]; p = boxes[p].parent) { if (seen.has(p)) { err(`${at}.containers[${j}].parent`, `box "${c.id}" ends up inside itself`); break; } seen.add(p); } });
    const ends = new Set([...ids, ...Object.keys(boxes)]);
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { if (typeof e !== 'string') line(e, `${at}.edges[${j}]`, ends); else if (!lineIds.has(e)) err(`${at}.edges[${j}]`, `"${e}" is not a line`); });
    Object.keys(v.layout || {}).forEach(id => { if (!mine.has(id)) warn(`${at}.layout.${id}`, `"${id}" is not one of the view's cards: its place is ignored`); });
    if (Array.isArray(v.lanes)) v.lanes.forEach((l, j) => arr(l && l.nodeIds).forEach((id, k) => { if (!mine.has(id)) warn(`${at}.lanes[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards: left out of the lane`); }));
  });
  // rules (#70): an id, and from, to or noCycles; a selector that names nothing picks nothing, and a misspelt kind picks script cards
  if (m.rules != null && !Array.isArray(m.rules)) err('rules', 'rules is a list');
  const ruleIds = new Set(), allBoxes = new Set(anyBox), each = (x, at, f) => (Array.isArray(x) ? x : [x]).forEach((y, j) => { if (y != null) f(y, Array.isArray(x) ? `${at}[${j}]` : at); });
  const owners = new Set([...arr(m.nodes), ...views.flatMap(v => [...arr(v.nodes), ...Object.values(v.nodeOverrides || {})])].map(n => n && n.owner).filter(o => typeof o === 'string'));
  const pick = (s, at, lens) => { // lens: a lens's pick (#94), which also takes line kinds at its top
    if (s == null) return;
    if (typeof s !== 'object' || Array.isArray(s)) return err(at, `a selector is an object: id, kind, container, owner${lens ? ', line' : ''} or not`);
    Object.keys(s).forEach(k => { if (!['id', 'kind', 'container', 'owner', 'not', ...(lens ? ['line'] : [])].includes(k)) warn(`${at}.${k}`, `unknown key "${k}": ignored, so the selector picks more cards`); });
    each(s.id, at + '.id', (x, p) => { if (!ids.has(x) && !allBoxes.has(x)) warn(p, `"${x}" is neither a card nor a box: it picks nothing`); });
    each(s.kind, at + '.kind', (x, p) => { const k = String(x).toLowerCase(); if (!(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(p, `unknown kind "${x}": it picks script cards`); });
    each(s.container, at + '.container', (x, p) => { if (!allBoxes.has(x)) warn(p, `"${x}" is not a box: it picks nothing`); });
    each(s.owner, at + '.owner', (x, p) => { if (!owners.has(x)) warn(p, `no card's owner is "${x}": it picks nothing`); });
    if (lens) each(s.line, at + '.line', (x, p) => { if (!WIRE_KINDS.includes(x)) warn(p, `"${x}" is not a line kind (calls, feeds, triggers, state, guard): it picks no line`); });
    pick(s.not, at + '.not');
  };
  arr(m.rules).forEach((r, i) => {
    const at = `rules[${i}]`;
    if (!r || typeof r !== 'object') return err(at, 'a rule is an object with an id');
    if (typeof r.id !== 'string' || !r.id) err(at + '.id', 'a rule needs an id'); else if (ruleIds.has(r.id)) err(at + '.id', `rule id "${r.id}" is used twice`); else ruleIds.add(r.id);
    if (!r.from && !r.to && !r.noCycles) err(at, 'a rule needs from, to or noCycles');
    pick(r.from, at + '.from'); pick(r.to, at + '.to');
    arr(r.views).forEach((v, j) => { if (!vids.has(v)) err(`${at}.views[${j}]`, `"${v}" is not a view`); });
  });
  // lenses (#94): an id each, and a pick as a rule's selector, which also takes line kinds
  if (m.lenses != null && !Array.isArray(m.lenses)) err('lenses', 'lenses is a list');
  const lensIds = new Set();
  arr(m.lenses).forEach((l, i) => {
    const at = `lenses[${i}]`;
    if (!l || typeof l !== 'object') return err(at, 'a lens is an object with an id');
    if (typeof l.id !== 'string' || !l.id) err(at + '.id', 'a lens needs an id'); else if (lensIds.has(l.id)) err(at + '.id', `lens id "${l.id}" is used twice`); else lensIds.add(l.id);
    pick(l.pick, at + '.pick', true);
    if (l.color != null && l.color !== 'owner') warn(at + '.color', `color ${JSON.stringify(l.color)} is not "owner": ignored`);
  });
  // stories (#69): each step's view, and the cards, lines and tour it names there
  if (m.stories != null && !Array.isArray(m.stories)) err('stories', 'stories is a list of stories');
  const sids = new Set(), lines = new Set([...lineIds, ...views.flatMap(v => arr(v.edges).filter(e => e && e.id != null).map(e => e.id))]);
  arr(m.stories).forEach((s, i) => {
    const at = `stories[${i}]`;
    if (!s || typeof s.id !== 'string' || !s.id) return err(at + '.id', 'a story needs an id');
    if (sids.has(s.id)) err(at + '.id', `story id "${s.id}" is used twice`); sids.add(s.id);
    if (!arr(s.steps).length) err(at + '.steps', 'a story needs steps');
    arr(s.steps).forEach((st, j) => {
      const p = `${at}.steps[${j}]`, v = views.find(x => x.id === (st && st.view));
      if (!v) return err(p + '.view', `"${st && st.view}" is not a view`);
      const mine = new Set(arr(v.nodeIds)), named = (x, q) => { // a card of the view or a line ("a->b#0" names a line with no id)
        if (typeof x === 'string' && !mine.has(x) && !lines.has(x) && !x.includes('->')) err(q, `"${x}" is neither one of view "${v.id}"'s cards nor a line`); };
      named(st.select, p + '.select');
      arr(st.highlight).forEach((x, k) => named(x, `${p}.highlight[${k}]`));
      arr(st.tour).forEach((x, k) => { if (!mine.has(x)) err(`${p}.tour[${k}]`, `"${x}" is not one of the view's cards`); });
      const c = st.camera, fit = ': the step shows the whole view';
      if (c && typeof c === 'object' && c.card != null) { if (!mine.has(c.card)) warn(p + '.camera.card', `"${c.card}" is not one of the view's cards${fit}`); }
      else if (c != null && c !== 'fit' && !(c && Number.isFinite(c.x) && Number.isFinite(c.y))) warn(p + '.camera', `the camera is "fit", { x, y, zoom } or { card, zoom }${fit}`);
      if (st.duration != null && !(st.duration > 0)) warn(p + '.duration', `duration ${JSON.stringify(st.duration)} is not a number of ms: 4000`);
    });
  });
  return out;
}

/* ================= rules (#70): what a model says must hold =================
   A rule forbids lines from the cards `from` picks to the cards `to` picks (a side left out picks every card), or, with
   noCycles, boxes that reach each other through their lines. A line counts between the two boxes that hold its ends right
   under the box (or view) they share, so a box is weighed against its siblings, at every depth, and a line into a box's
   own inner box counts for nothing. A selector picks cards by id, kind (as the map draws it: "db" is a database) or box
   (at any depth), each a value or a list; every key it has must hold, and `not` turns a selector round. A line's end on
   a box (#28) is that box: in it, and of no kind. A rule that names a box (a container, or a box's id, in from, to or a
   not) holds only in the views that draw one of the boxes it names, as a box belongs to its view; any other rule holds in
   every view. `views` narrows that further. */
const boxesNamed = (s, isBox) => !s || typeof s !== 'object' ? []
  : [...[s.container].flat(), ...[s.id].flat().filter(isBox), ...boxesNamed(s.not, isBox)].filter(x => x != null);
const picks = (s, end) => !s || ((s.id == null || [s.id].flat().includes(end.id))
  && (s.kind == null || [s.kind].flat().some(k => end.kind != null && kindOf(k, true) === end.kind))
  && (s.container == null || [s.container].flat().some(c => end.boxes.includes(c)))
  && (s.owner == null || [s.owner].flat().includes(end.owner))
  && (s.not == null || !picks(s.not, end)));
const andList = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs.join(''), arrOf = x => (Array.isArray(x) ? x : []);
// a view's cards and boxes as a selector sees them (rules, lenses): a card's kind as drawn, the boxes it is in (outermost
// first) and its owner; a box is in itself and its parents, and has no kind or owner
function endsIn(ctx, v) {
  const cs = arrOf(v.containers).filter(c => c && c.id), box = {}; cs.forEach(c => { box[c.id] ||= c; });
  const home = {}; cs.forEach(c => arrOf(c.nodeIds).forEach(id => { home[id] ??= c.id; }));
  const chain = b => { const c = []; for (const seen = new Set(); b != null && box[b] && !seen.has(b); b = box[b].parent) { seen.add(b); c.unshift(b); } return c; }; // outermost first
  const end = id => box[id] ? { id, kind: null, boxes: chain(id), label: box[id].label || id }
    : (n => ({ id, kind: kindOf(n.kind, true), boxes: chain(home[id]), owner: typeof n.owner === 'string' ? n.owner : undefined, label: n.label || id }))(ctx.nodeIn(id, v.id));
  return { box, end };
}
/** Every rule the model breaks, in each view that draws it broken: a line a rule forbids, or a cycle of boxes. */
export function rules(model) {
  const list = arrOf(model && model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles));
  if (!list.length) return [];
  const ctx = mapContext(model), { views, N, viewEdges } = ctx, out = [];
  const anyBox = new Set(views.flatMap(v => arrOf(v.containers).map(c => c && c.id).filter(Boolean)));
  const named = new Map(list.map(r => [r, [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]))]));
  views.forEach(v => {
    const { box, end } = endsIn(ctx, v), order = Object.values(box).map(c => c.id);
    // a target names the drawn line, which may stand for several edges: grouped as prepEdges groups them (parallel edges, and
    // A→B with B→A, unless keepPairs), in its order, so select() finds it
    // ponytail: a copy of prepEdges' grouping; share one helper if that grouping changes
    const lines = viewEdges(v), par = new Map(), drawn = new Map(), ends = new Map();
    lines.forEach(e => { const k = e.from + '>' + e.to + (v.keepPairs ? '#' + e.id : ''); par.has(k) ? par.get(k).push(e) : par.set(k, [e]); });
    par.forEach(es => { const back = !v.keepPairs && ends.get(es[0].to + '>' + es[0].from);
      if (back) back.push(...es); else ends.set(es[0].from + '>' + es[0].to, es); es.forEach(e => drawn.set(e, back || es)); });
    const line = e => ({ type: 'edge', ids: [...new Set(drawn.get(e).map(x => x._id))], view: v.id });
    let rings = null; // the cycles of boxes, worked out for the first noCycles rule: [boxes, the lines between them]
    const cycles = () => {
      const next = {}; // box -> Map(box -> the lines from the one to the other)
      lines.forEach(e => { const A = end(e.from).boxes, B = end(e.to).boxes; let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
        if (i < A.length && i < B.length) { const m = next[A[i]] ||= new Map(); m.set(B[i], [...(m.get(B[i]) || []), e]); } });
      const reach = b => { const seen = new Set(), todo = [b]; while (todo.length) for (const c of (next[todo.pop()] || new Map()).keys()) if (!seen.has(c)) { seen.add(c); todo.push(c); } return seen; };
      const R = Object.fromEntries(order.map(b => [b, reach(b)])), done = new Set(), found = [];
      order.forEach(b => { if (done.has(b) || !R[b].has(b)) return;
        const ring = order.filter(c => R[b].has(c) && R[c].has(b)); ring.forEach(c => done.add(c));
        found.push([ring, ring.flatMap(a => ring.flatMap(c => (next[a] && next[a].get(c)) || []))]); });
      return found;
    };
    list.forEach(r => {
      if (Array.isArray(r.views) && !r.views.includes(v.id)) return;
      if (named.get(r).length && !named.get(r).some(b => box[b])) return; // it names boxes, none of them this view's
      const breaks = `breaks rule "${r.title || r.id}"`;
      if (r.noCycles) (rings ||= cycles()).forEach(([ring, via]) => out.push({ rule: r.id, view: v.id,
        message: `view ${v.id}: boxes ${andList(ring.map(c => `"${box[c].label || c}"`))} form a cycle, which ${breaks}`,
        targets: [...ring.map(c => ({ type: 'container', id: c, view: v.id })), ...[...new Set(via.map(e => drawn.get(e)))].map(es => line(es[0]))] }));
      else { const said = new Set(); // parallel edges that break it read as one line, once
        lines.forEach(e => { const a = end(e.from), b = end(e.to), message = `view ${v.id}: edge ${a.label}→${b.label} ${breaks}`;
          if (picks(r.from, a) && picks(r.to, b) && !said.has(message)) { said.add(message); out.push({ rule: r.id, view: v.id, message, targets: [line(e)] }); } }); }
    });
  });
  return out;
}

/* ---------- change: diff (#66) and drift (#68) ----------
   Each returns a model marked with what the map draws already, so a page the CLI writes, or a still, shows the marks
   with nothing to call at run time: a card's change (a NEW or CHANGED tab; REMOVED is faded, dashed and struck
   through), a line's style (added: green and flowing; removed: rose, dashed and faded; security: rose and dashed;
   faded: its own colour, faint and still) and edited (an amber dot on the line). */
const canon = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(f => [f, v[f]])) : v);
// a line's identity in a list, as a Ref names it: its id, else "<from>-><to>#<n>"; "=<id>" for a view's reference to a model line
const lineKeys = list => { const seen = {}; return list.map(e => typeof e === 'string' ? '=' + e : e && typeof e === 'object'
  ? (e.id != null ? String(e.id) : (k => `${k}#${seen[k] = (seen[k] ?? -1) + 1}`)(e.from + '->' + e.to)) : ''); };
// a line that stands for several edges (A→B and B→A, parallel edges) shows the strongest of their marks: removed or
// undrawn, then added, then changed (its edited dot, which a stronger mark hides); it fades as idle only when every one
// of them is idle, and otherwise takes the first style that is no mark
const markOf = all => { const top = all.find(x => x.style === 'removed' || x.drift === 'undrawn') || all.find(x => x.style === 'added');
  if (top) return { style: top.style, strong: true };
  return { style: all.every(x => x.style === 'faded') ? 'faded' : (all.find(x => x.style && x.style !== 'faded') || {}).style }; };
// the lines a view draws: its own list (a model line by id, or one of its own), else every model line between its cards and boxes
const linesOf = (m, v) => { const all = Array.isArray(m.edges) ? m.edges.filter(Boolean) : [];
  if (Array.isArray(v.edges)) { const byId = new Map(all.filter(e => e.id != null).map(e => [String(e.id), e])); return v.edges.map(e => typeof e === 'string' ? byId.get(e) : e).filter(Boolean); }
  const ids = new Set([...(v.nodeIds || []), ...(v.containers || []).map(c => c && c.id)]); return all.filter(e => ids.has(e.from) && ids.has(e.to)); };

/** What changed from one model to the next, as one model to draw: `after`, with each card and line marked added, changed
 *  or removed (removed ones come back from `before`, in their views, boxes and places), a summary in words, and the
 *  views that show a change. Cards and lines are matched by id (a line without one by its ends, as a Ref names it). */
export function diff(before, after) {
  const arr = x => (Array.isArray(x) ? x : []), A = structuredClone(before || {}), out = structuredClone(after || {});
  const how = new Map(), was = new Map(), said = []; // each marked card or line: added, changed or removed; a changed one's [before, after]
  const card = (x, h) => ({ ...x, change: h });
  const line = (x, h) => ({ ...x, change: h, ...(h === 'changed' ? { edited: true } : { style: h }) });
  function mark(old, now, put, keys = l => l.map(x => x && x.id)) { // now's items, marked; old's that left come back, marked removed
    const ko = keys(old), kn = keys(now), O = new Map(old.map((x, i) => [ko[i], x])), kept = new Set(kn);
    const res = now.map((x, i) => { if (!x || typeof x !== 'object') return x; const o = O.get(kn[i]);
      if (o && typeof o === 'object' && canon(o) === canon(x)) return x;
      const h = o && typeof o === 'object' ? 'changed' : 'added', y = put(x, h); how.set(y, h); if (h === 'changed') was.set(y, [o, x]); return y; });
    old.forEach((x, i) => { if (x && typeof x === 'object' && !kept.has(ko[i])) { const y = put(x, 'removed'); how.set(y, 'removed'); res.push(y); } });
    return res;
  }
  out.nodes = mark(arr(A.nodes), arr(out.nodes), card);
  out.edges = mark(arr(A.edges), arr(out.edges), line, lineKeys);
  const goneLines = new Set(out.edges.filter(e => how.get(e) === 'removed' && e.id != null).map(e => String(e.id)));
  const V0 = new Map(arr(A.views).filter(Boolean).map(v => [v.id, v])), V1 = new Set(arr(out.views).filter(Boolean).map(v => v.id));
  const moved = [], touched = new Set(); // cards put into or taken out of a view; views whose cards the diff marks there
  const views = arr(out.views).map(v => {
    const o = v && V0.get(v.id); if (!o) return v;
    const w = { ...v }, ids = arr(v.nodeIds), oldIds = arr(o.nodeIds);
    if (v.nodes || o.nodes) w.nodes = mark(arr(o.nodes), arr(v.nodes), card);
    const at = new Map([...out.nodes, ...arr(w.nodes)].filter(Boolean).map(n => [n.id, n]));
    const left = oldIds.filter(id => !ids.includes(id)), came = ids.filter(id => !oldIds.includes(id)), ov = { ...(v.nodeOverrides || {}) };
    w.nodeIds = [...ids, ...left];
    left.forEach(id => { if (how.get(at.get(id)) !== 'removed') { ov[id] = { ...(o.nodeOverrides || {})[id], change: 'removed' }; moved.push(['takes', id, v]); } });
    came.forEach(id => { if (at.get(id) && how.get(at.get(id)) !== 'added') { ov[id] = { ...ov[id], change: 'added' }; moved.push(['puts', id, v]); } });
    if (left.length || came.length) touched.add(v.id);
    if (Object.keys(ov).length) w.nodeOverrides = ov;
    if (left.length && Array.isArray(v.containers)) // a removed card stays in its box, and in its place on a view laid out by hand when that is free
      w.containers = v.containers.map(c => { const back = left.filter(id => c && arr(o.containers).some(b => b && b.id === c.id && arr(b.nodeIds).includes(id))); return back.length ? { ...c, nodeIds: [...arr(c.nodeIds), ...back] } : c; });
    if (left.length && v.layout && o.layout) { const L = { ...v.layout }, taken = new Set(Object.values(L).map(String));
      left.forEach(id => { const p = o.layout[id]; if (Array.isArray(p) && !taken.has(String(p))) { L[id] = p; taken.add(String(p)); } }); w.layout = L; }
    if (Array.isArray(v.edges)) { w.edges = mark(arr(o.edges), v.edges, line, lineKeys);
      arr(o.edges).forEach(e => { if (typeof e === 'string' && !v.edges.includes(e) && goneLines.has(e)) w.edges.push(e); }); } // a removed model line it showed
    return w;
  });
  arr(A.views).forEach(o => { if (!o || V1.has(o.id)) return; // a removed view comes back with everything in it removed
    const w = { ...o, nodeOverrides: { ...(o.nodeOverrides || {}) } };
    arr(o.nodeIds).forEach(id => { w.nodeOverrides[id] = { ...w.nodeOverrides[id], change: 'removed' }; });
    if (o.nodes) w.nodes = o.nodes.map(n => { const y = card(n, 'removed'); how.set(y, 'removed'); return y; });
    if (Array.isArray(o.edges)) w.edges = o.edges.map(e => e && typeof e === 'object' ? line(e, 'removed') : e);
    touched.add(o.id); views.push(w); });
  out.views = views;

  // the summary: views, then cards, then lines, in model order; a line to a card that came or went goes with the card
  const cards = [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].filter(Boolean);
  const named = new Map([...views.flatMap(v => arr(v && v.containers)), ...cards].filter(Boolean).map(n => [n.id, n]));
  const name = id => String((named.get(id) || {}).label || id), cardHow = new Map(cards.filter(n => how.has(n)).map(n => [n.id, how.get(n)]));
  const lines = [...out.edges, ...views.flatMap(v => arr(v && v.edges).filter(e => e && typeof e === 'object'))];
  const diffKeys = ([o, x]) => [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(k => canon(o[k]) !== canon(x[k]));
  views.forEach(v => { if (v && !V0.has(v.id)) said.push(`adds the view ${v.title || v.id}`); });
  arr(A.views).forEach(o => { if (o && !V1.has(o.id)) said.push(`removes the view ${o.title || o.id}`); });
  cards.forEach(n => { const h = how.get(n);
    if (h === 'added') { const ins = lines.filter(e => e.to === n.id && how.get(e) === 'added').map(e => name(e.from)), outs = lines.filter(e => e.from === n.id && how.get(e) === 'added').map(e => name(e.to));
      said.push(`adds ${name(n.id)}` + (ins.length === 1 && outs.length === 1 ? ` between ${ins[0]} and ${outs[0]}` : (ins.length ? `, from ${andList(ins)}` : '') + (outs.length ? `, to ${andList(outs)}` : ''))); }
    if (h === 'removed') said.push(`removes ${name(n.id)}`);
    if (h === 'changed') { const [o, x] = was.get(n), keys = diffKeys([o, x]), rest = keys.filter(k => k !== 'label');
      said.push((keys.includes('label') ? `renames ${o.label || o.id} to ${x.label || x.id}` : `changes ${name(n.id)}`) + (rest.length ? ` (${rest.join(', ')})` : '')); } });
  lines.forEach(e => { const h = how.get(e); if (!h || cardHow.get(e.from) === h && h !== 'changed' || cardHow.get(e.to) === h && h !== 'changed') return;
    const ends = `${name(e.from)} to ${name(e.to)}`, lab = e.label ? ` (${e.label})` : '';
    if (h === 'added') said.push(`adds a line from ${ends}${lab}`);
    if (h === 'removed') said.push(`removes the line from ${ends}${lab}`);
    if (h === 'changed') { const [o, x] = was.get(e);
      said.push(`changes the line from ${ends} (${diffKeys([o, x]).map(k => k === 'label' ? `label ${o.label ?? '-'} → ${x.label ?? '-'}` : k).join(', ')})`); } });
  moved.forEach(([verb, id, v]) => said.push(`${verb} ${name(id)} ${verb === 'puts' ? 'in' : 'out of'} the view ${v.title || v.id}`));

  // the views that show a change: a card or line the diff marks, or a card it put in or took out
  const changed = views.filter(v => v && (touched.has(v.id) || arr(v.nodeIds).some(id => cardHow.has(id)) || linesOf(out, v).some(e => how.has(e)))).map(v => v.id);
  return { model: out, summary: said, views: changed };
}

/** The map against the traffic seen: a line that carries traffic but is not drawn comes in, dashed rose ("not drawn",
 *  with its calls); a drawn line between two cards that traffic was seen at, with none of its own, fades. `observed`:
 *  [{ from, to, count }], or a Jaeger or Tempo dependency list ([{ parent, child, callCount }], or { data: [...] }). A
 *  service is a card by `options.match[service]`, else by id, else by label (case aside). Counts: lines that carried
 *  traffic, came in undrawn, are idle, or could not be judged (an end traffic never reached), and services with no card,
 *  each a count of model edges (a drawn line that stands for several fades only when all are idle); views: those that
 *  show drift. */
export function drift(model, observed, options = {}) {
  const arr = x => (Array.isArray(x) ? x : []), out = structuredClone(model || {}), match = options.match || {};
  const list = Array.isArray(observed) ? observed : arr(observed && observed.data);
  const cards = [...arr(out.nodes), ...arr(out.views).flatMap(v => arr(v && v.nodes))].filter(n => n && n.id != null);
  const ids = new Set(cards.map(n => String(n.id))), lower = new Map();
  cards.forEach(n => [n.id, n.label].forEach(s => { if (s != null && !lower.has(String(s).toLowerCase())) lower.set(String(s).toLowerCase(), String(n.id)); }));
  const cardOf = s => { s = String(s ?? ''); const id = Object.hasOwn(match, s) ? String(match[s]) : ids.has(s) ? s : lower.get(s.toLowerCase()); return ids.has(id) ? id : null; };
  const seen = new Map(), live = new Set(), unmatched = new Set(); let counted = false;
  list.forEach(o => { if (!o || typeof o !== 'object') return;
    const f = o.from ?? o.parent, t = o.to ?? o.child, n = o.count ?? o.callCount, a = cardOf(f), b = cardOf(t);
    if (a == null) unmatched.add(String(f)); if (b == null) unmatched.add(String(t));
    if (a == null || b == null || a === b) return;
    live.add(a); live.add(b);
    if (n != null) { counted = true; if (!(+n > 0)) return; } // seen with no calls: both ends were watched, the line carried nothing
    const k = a + '\n' + b, s = seen.get(k) || { a, b, n: 0 }; s.n += +n || 0; seen.set(k, s); });
  const counts = { carried: 0, undrawn: 0, idle: 0, unknown: 0, unmatched: [...unmatched].sort() }, drawn = new Set();
  const judge = e => { if (!e || typeof e !== 'object') return e; const k = e.from + '\n' + e.to;
    if (seen.has(k)) { drawn.add(k); counts.carried++; return e; }
    if (live.has(String(e.from)) && live.has(String(e.to))) { counts.idle++; return { ...e, style: 'faded', drift: 'idle' }; }
    counts.unknown++; return e; };
  out.edges = arr(out.edges).map(judge);
  arr(out.views).forEach(v => { if (v && Array.isArray(v.edges)) v.edges = v.edges.map(judge); });
  seen.forEach(({ a, b, n }, k) => { if (drawn.has(k)) return; counts.undrawn++;
    const e = { id: `drift:${a}->${b}`, from: a, to: b, label: 'not drawn', ...(counted ? { sublabel: `${n.toLocaleString('en-US')} calls` } : {}), style: 'security', drift: 'undrawn' };
    out.edges.push(e);
    arr(out.views).forEach(v => { if (v && Array.isArray(v.edges) && arr(v.nodeIds).includes(a) && arr(v.nodeIds).includes(b)) v.edges.push(e.id); }); });
  return { model: out, counts, views: arr(out.views).filter(v => v && linesOf(out, v).some(e => e.drift)).map(v => v.id) };
}

// the reader's setting; a handle drawn instant (the page's #check, #still and #shot hooks) is still on top of it, on its own
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const instant = !!P.instant, still = () => instant || reducedMotion(); // this map's motion: an instant page stills only itself
  const ctrlWheel = options.wheel === 'ctrl'; // the wheel zooms only with Ctrl or ⌘ (a trackpad's pinch too), and else scrolls the page: a map in a document
  const OPS = ['add', 'rename', 'move', 'delete', 'reorder'], ed = options.editable;
  const E = ed === true ? Object.fromEntries(OPS.map(o => [o, true])) : ed && typeof ed === 'object' ? Object.fromEntries(OPS.map(o => [o, !!ed[o]])) : null;
  const can = op => !!(E && E[op]);
  const host = document.createElement('div');
  host.className = 'umlimator'; host.style.cssText = 'display:block;position:relative;width:100%;height:100%;min-height:0';
  container.appendChild(host);
  // text is measured in the host's font (--um-sans); measure: false keeps the font-independent estimate
  const own = typeof options.measure === 'function' ? options.measure : null;
  let measure = options.measure === false ? null : own || hostMeasure(host), current = model;
  const expanded = {}; // per view: the cards unfolded in place (#71), in the order they unfolded; in this handle only, never in the model
  const asked = {}; // per view: card id -> the inner view it waits for, when E or Alt + click asked to unfold it before the host loaded that view
  let ctx = mapContext(model, { measure, kinds: !!P.kinds, expand: expanded }); // kinds: the standalone page guesses line kinds from label words, for its legend
  const root = host.attachShadow({ mode: 'open', delegatesFocus: true }); // host.focus() lands in the map (on the selected card)
  root.adoptedStyleSheets = [sheet()];
  // the standalone page's pieces a host asks for (#99), in a frame around the canvas: the views list left of the map (after
  // it in the tab order, so focus given to the element still lands on the map), the details panel under it, the legend and
  // the hint line over it. With none of them the map is drawn as it always was.
  const framed = ['nav', 'details', 'legend', 'hints'].some(k => options[k]);
  root.innerHTML = `<div class="um-live" role="status" aria-live="polite"></div>${framed ? '<div class="um-frame"><div class="um-main"><div class="um-stage">' : ''}<div class="stage" tabindex="-1">
      <div class="mctl">${options.minimap ? '<div class="minimap" title="Overview — click or drag to move"></div>' : ''}${options.controls === false ? '' : `
        <div class="ctl">
          <button data-z="up" title="Up one level (Esc)" aria-label="Up one level">↑</button><span class="sep"></span>
          <button data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button data-z="fit" class="pct" title="Fit to screen (0)">100%</button><button data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button><span class="sep"></span>
          <button data-z="one" title="Actual size (1)">1:1</button><button data-z="flow" title="Animate flow direction (F)" aria-label="Animate flow">≋</button>${E && E.add ? '<span class="sep"></span><button data-z="add" title="Add a card (N, or Alt + double-click)" aria-label="Add a card">＋</button>' : ''}<span class="depth" title="Reading depth follows zoom">READ</span>
        </div>`}</div></div>${!framed ? '' : (options.legend ? '<div class="m-legend"></div>' : '') + (options.hints ? `<div class="hint">${hintHTML('', ctrlWheel)}</div>` : '') + '</div>'
          + (options.details ? '<aside class="panel" aria-label="Node details" hidden></aside>' : '') + '</div>'
          + (options.nav ? '<button class="ibtn um-navbtn" title="Views (O)" aria-label="Toggle the views list" aria-expanded="false">☰</button><aside class="outline" aria-label="Views"></aside>' : '') + '</div>'}`;
  const stage = root.querySelector('.stage'), q = s => root.querySelector(s);
  const tell = q('.hint') && hinter(q('.hint'), hintHTML('', ctrlWheel)); // the hint line says what just happened, for a while
  const subs = {};
  // each listener on its own: an error in one is reported, and the map's own transition goes on (a host's bug never wedges it)
  const fail = err => { if (typeof reportError === 'function') reportError(err); else console.error(err); };
  const emit = (type, e, last = false) => { if (dead && !last) return; [(options.on || {})[type], ...(subs[type] || [])].forEach(fn => { if (typeof fn !== 'function') return; try { fn(e); } catch (err) { fail(err); } }); if (type !== 'state') touch(); };
  /* the map's state for hosts and agents (0.14.0): handle.state is a fresh, frozen, JSON-serializable snapshot, and the state
     event says which of its keys changed, once a frame at most (on a 16 ms timer, so a page in a hidden tab still says it).
     The camera is the exception: a pan, zoom, glide or drag is one state event, once it comes to rest; until then the
     event's camera is where it last rested (handle.state reads it live) */
  const KEYS = ['view', 'navigating', 'selection', 'expanded', 'lens', 'overlays', 'story', 'tour', 'replay', 'paused', 'camera', 'flow', 'shapes', 'motion', 'gesture', 'destroyed'];
  let lastState = null, stateT = 0, camRest = null, restT = 0; // the last state event's snapshot and the flush to come; the camera at rest, and its check to come
  const listensState = () => !!((options.on || {}).state || (subs.state || []).length);
  function touch() { if (!stateT && !dead && listensState()) stateT = setTimeout(flushState, 16); }
  function flushState(last = false) { clearTimeout(stateT); stateT = 0; if (!listensState() || (dead && !last)) return;
    const s = snapshot(true), changed = KEYS.filter(k => JSON.stringify(s[k]) !== JSON.stringify(lastState ? lastState[k] : undefined)); lastState = s;
    if (changed.length) emit('state', { state: s, changed }, last); }
  // at rest: 150 ms with no change, no glide, no press on the map and no move under way; a moving camera is looked at again
  function camMoved() { clearTimeout(restT); restT = !dead && listensState() ? setTimeout(rested, 150) : 0; }
  function rested() { restT = 0; if (dead) return; if (cam && (cam.anim || cam.ptrs.size) || nav) return camMoved(); camRest = camNow(); touch(); }
  let cam = null, geo = null, svg = null, cur = null, sel = null, more = [], busy = false, paused = false, dead = false;
  // the notation (0.15.0): the host's (render()'s shapes, then handle.shapes) for every view, else each view's own
  if (options.shapes != null && !noteOf(options.shapes)) warn(`render(…, { shapes: ${JSON.stringify(options.shapes)} }): the notations are ${NOTATIONS.join(', ')}; each view draws its own`);
  let shapesSet = noteOf(options.shapes);
  const noteFor = vid => shapesSet || ctx.notationOf(vid);
  const pic = vid => { // a view's picture in its notation: laid out once, drawn again only when the notation changes
    const want = noteFor(vid), o = { tour: P.tour !== false, openHint: P.openHint !== false, shapes: want };
    let c = ctx.geoCache[vid]; if (!c) c = ctx.geoCache[vid] = ctx.buildView(vid, o); else if (c.shapes !== want) Object.assign(c, ctx.drawView(vid, c.g, o));
    return c; };
  // each card's look in the notation shown, for what is drawn over the picture: rings, the minimap, a tour's or replay's dot
  // (in box too: a card's own shape is drawn there)
  const lookIn = (nt, g) => { const m = new Map(), ports = sidePorts(g); return n => { if (!m.has(n)) m.set(n, cardLook(n, nt, !!(n.kids || n.opens) && P.openHint !== false, ports.get(n))); return m.get(n); }; };
  const looker = () => lookIn(noteFor(cur), geo);
  const timers = new Set(), later = (f, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) f(); }, ms); timers.add(t); return t; };
  const sleeping = new Set(); // a sleep resolves on its own, or when the map is destroyed: nothing that awaits one is left pending
  const sleep = ms => new Promise(r => { if (dead) return r(); const wake = () => { sleeping.delete(wake); r(); }; sleeping.add(wake); later(wake, still() ? 0 : ms); });
  const status = t => P.status ? P.status(t) : tell && tell(t);
  const wide = P.wide || (() => (cam ? cam.size()[0] : stage.clientWidth) > 820);

  // the views the reader walked through, the one shown last: up goes back along them, then to the model's parent (issue 137)
  let trail = [];
  const upOf = () => (P.upTarget ? P.upTarget() : trail.length > 1 ? trail[trail.length - 2] : (ctx.V[cur] || {}).parent) || null;
  const nodeRef = id => ({ type: 'node', id, view: cur });
  const copyRef = r => r && { ...r, ...(Array.isArray(r.ids) ? { ids: [...r.ids] } : {}) }; // a host gets copies: the map's Refs stay its own
  const picked = () => sel ? [...more.map(nodeRef), copyRef(sel)] : []; // every selected thing, the latest last (more: other selected cards)
  const say = t => { const l = root.querySelector('.um-live'); if (l) l.textContent = t; };
  const nameOf = id => ctx.nodeIn(id, cur).label || ((geo.families || []).find(f => f.id === id) || {}).label || id;
  let said = '[]'; // the selection last reported: a select event means it changed, or a click asked again (again)
  const emitSel = (again = false) => {
    const now = JSON.stringify(picked()); if (now === said && !again) return; said = now;
    say(!sel ? 'Nothing selected' : sel.type === 'node' ? nameOf(sel.id) + (more.length ? `, ${more.length + 1} cards selected` : ', selected')
      : sel.type === 'edge' ? (e => e ? `Line from ${nameOf(e.from)} to ${nameOf(e.to)}, selected` : 'Line selected')(geo.edges[edgeIndex(sel)]) : `Box ${(svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"] .family-title`) || {}).textContent || sel.id}, selected`);
    emit('select', { target: copyRef(sel), targets: picked() });
  };
  const edgeRef = e => ({ type: 'edge', ids: edgeRefIds(e), view: cur });
  const edgeIndex = ref => geo.edges.findIndex(e => { const ids = edgeRefIds(e); return ids.length === ref.ids.length && ids.every((x, i) => x === ref.ids[i]); });
  const exists = ref => !ref ? true : ref.type === 'node' ? !!geo.byId[ref.id] : ref.type === 'edge' ? edgeIndex(ref) >= 0
    : ref.type === 'container' ? (geo.families || []).some(f => f.id === ref.id) : false;

  // focus in the map goes back on the same card or line in a new picture, else on the canvas; focus outside the map stays there
  const focusOf = () => { const a = root.activeElement; if (!a || !(a === stage || (svg && svg.contains(a)) || a.closest('.empty-view'))) return null;
    const lk = a.closest('.line-key'), k = a.closest('[data-node]'), g = a.closest('.node');
    return lk && geo.edges[+lk.dataset.i] ? edgeRef(geo.edges[+lk.dataset.i]) : k ? nodeRef(k.dataset.node) : g ? nodeRef(g.dataset.id) : {}; };
  const refocus = ref => { if (!ref) return; if ((ref.type === 'node' || ref.type === 'edge') && exists(ref)) focusMap(ref, false); else stage.focus({ preventScroll: true }); };
  function mount(vid) { // vid: a view of the model, checked first (one it lacks changes nothing: false), or null for a model with no views
    const v = vid == null ? null : ctx.V[vid]; if (vid != null && !v) return false;
    const back = focusOf();
    cancelGesture(!!v && vid === cur); // a new picture: a drag or a line under way stops; a name field stays over its card if the view draws it still
    cur = v ? vid : null; if (v) ctx.planOf(vid);
    if (v) { trail = trail.filter(id => ctx.V[id]); if (!trail.includes(vid)) trail = [vid]; } // the first view, or after an update() took the walk's views away
    stage.querySelectorAll('svg.map-svg, .empty-view').forEach(s => s.remove());
    if (!v || !(v.nodeIds || []).some(i => ctx.N[i])) { // a view with nothing in it, or a model with no views, gets a friendly card, not a blank canvas
      geo = { nodes: [], edges: [], groups: [], lanes: [], families: [], byId: {}, stats: {}, bounds: { x: 0, y: 0, w: 400, h: 300 } };
      stage.insertAdjacentHTML('afterbegin', '<svg class="map-svg" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"></svg>');
      const p = v && v.parent;
      stage.insertAdjacentHTML('beforeend', `<div class="empty-view"><div class="ico">◌</div><h4>Nothing here yet</h4><p>${v ? 'This view has no nodes yet.' : 'This map has no views yet.'}</p>${p ? `<button class="btn" data-v="${esc(p)}">← Back to ${esc(String(ctx.V[p].title || p).split(' · ')[0])}</button>` : ''}</div>`);
    } else {
      const c = pic(vid);
      stage.insertAdjacentHTML('afterbegin', c.markup); geo = c.g;
    }
    svg = stage.querySelector('svg'); svg.classList.add('map-svg'); if (paused) svg.pauseAnimations();
    if (!cam) cam = new Camera(stage, svg, { wheel: ctrlWheel ? 'ctrl' : 'zoom', maxFit: 1.15, max: 4, mapDepth: 0.3, onChange: onCam, still, skip: e => !!((can('move') || can('reorder') || can('add')) && e.target.closest && e.target.closest('.node, .um-handle')), inset: () => clearOf([].concat(P.inset ? P.inset() : fitIn())) });
    cam.setSvg(svg, geo.bounds);
    const ub = q('[data-z="up"]'); if (ub) ub.disabled = !upOf();
    if (options.minimap) buildMini();
    if (v && !geo.hub && geo.nodes.length && !(expanded[vid] || []).length && geo.nodes.every(n => Number.isFinite(n.col) && Number.isFinite(n.row))) placed[vid] = Object.fromEntries(geo.nodes.map(n => [n.id, [n.col, n.row]])); // unfolded: the places folded stay
    sel = null; more = []; sub = null; tabKeys(); paint(); // no select event here: the caller reports, once, what became of the selection
    endTrip(); relens(); drawMarks(); // a new picture: a tour or replay on the old one ends; the host's marks and the lens go on again (#63, #94)
    if (naming) { if (naming.ref && !exists(naming.ref)) naming.close(false); else naming.place(); }
    refocus(back);
    if (v && pc) pc.chrome();
    if (v && P.onMount) P.onMount(inner);
    touch();
    return true;
  }
  // at fit the cards keep off the pieces over the map (#99): the views list's button, the hint line, and the legend, which
  // the map leaves room for above it or to its right, whichever leaves the map larger
  const lg = q('.m-legend'), fitIn = () => { const I = { t: q('.um-navbtn') ? 54 : 16, r: 16, b: tell ? 40 : 16, l: 16 };
    return lg && !lg.hidden ? [{ ...I, b: 48 + lg.offsetHeight }, { ...I, l: 24 + lg.offsetWidth }] : I; };

  /* at fit, the zoom controls and the minimap keep off the cards (#50): when a card would sit under one of them, the fit
     also tries room for them at the bottom and at the right, and keeps whichever leaves the map larger */
  let clear = null; // the last answer, for one view, size and set of insets: the camera asks on every frame of a pan or zoom
  function clearOf(base) {
    if (!cam || !geo) return base;
    const [W, H] = cam.size(), key = JSON.stringify([W, H, base]); if (clear && clear.geo === geo && clear.key === key) return clear.sets;
    const boxes = [...stage.querySelectorAll('.ctl, .minimap, .um-story, .um-lens')].map(x => x.getBoundingClientRect()).filter(r => r.width && r.height);
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
    camMoved(); // the state event says where the camera comes to rest, once
    if (naming) naming.place(); // a name field stays over what it names
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
    const b = geo.bounds, el = q('.minimap'), bw = Math.max(2, b.w / 300), c4 = noteFor(cur) === 'c4';
    // a box's tone, as its region; and a box dashed in the picture (any box in c4, a toned box in any notation) dashed here
    const rg = (geo.families || []).filter(f => f.tone || c4).map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" ${f.tone ? `style="--um-tone:${toneOf(f)}" ` : ''}fill="${f.tone ? 'var(--um-tone, var(--um-slate))' : 'none'}" fill-opacity=".14" stroke="${f.tone ? 'var(--um-tone, var(--um-slate))' : 'var(--um-border-2)'}" stroke-width="${bw}" stroke-dasharray="${bw * 4} ${bw * 3}"/>`).join('');
    const ln = (geo.lanes || []).map(l => `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" fill="none" stroke="var(--um-border-2)" stroke-width="${Math.max(2, b.w / 300)}"/>`).join('');
    const look = looker(), r = geo.nodes.map(n => { const L = look(n), paint = `fill="var(--um-${KIND[n.k][0]})" opacity="${n.k === 'm-public' ? .95 : .55}"`;
      return L ? `<path d="${L.S.out(L)}" ${paint}/>` : `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" ${paint}/>`; }).join('');
    const l = geo.edges.map(e => `<polyline points="${e.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--um-arrow)" stroke-width="${Math.max(2, b.w / 260)}" opacity=".6"/>`).join('');
    el.innerHTML = `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">${rg}${ln}${l}${r}<rect class="vp" rx="${b.w / 80}"/></svg>`;
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

  /* a card's or box's tab, and a card's chip, is a button only for a host that listens for click (#43): it can act on one.
     A card's tabs and chips get focus targets right after the card, outside it (a button inside the card's button is
     invalid), tabs first; a box's tab is one itself. */
  const listening = () => !!((options.on || {}).click || (subs.click || []).length);
  let keysFor = null; // the picture and state the tabs were last set up for: a second listener changes nothing, focus stays
  function tabKeys() {
    const on = listening(); if (!svg || (keysFor && keysFor[0] === svg && keysFor[1] === on)) return; keysFor = [svg, on];
    svg.querySelectorAll('.tab-key, .chip-key').forEach(k => k.remove());
    const cards = Object.fromEntries([...svg.querySelectorAll('.node')].map(g => [g.dataset.id, g]));
    svg.querySelectorAll('.family [data-badge]').forEach(t => { if (on) { t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button'); } else { t.removeAttribute('tabindex'); t.removeAttribute('role'); } });
    const look = looker();
    if (on && geo.map) geo.nodes.forEach(n => { let tx = n.x + 12, html = ''; const card = cards[n.id], ty = tabLine(n, look(n)); if (!card) return;
      mapTabs(n).forEach(t => { if (t.badge != null) html += `<g class="um-key tab-key" data-node="${esc(n.id)}" data-badge="${t.badge}" tabindex="0" role="button" aria-label="${esc(t.text)}"><rect x="${tx - 2}" y="${ty - 10}" width="${t.w + 4}" height="19" rx="6" class="key-ring"/></g>`; tx += t.w + 4; });
      card.querySelectorAll('rect.verb-chip').forEach(r => { const i = +r.dataset.chip, { value } = chipRef(card, i), at = k => +r.getAttribute(k), verb = (n.verbs || [])[i];
        const name = value === verb ? value : `${value} (more: ${(n.verbs || []).slice(i).join(', ')})`; // the last chip may stand for the rest
        html += `<g class="um-key chip-key" data-node="${esc(n.id)}" data-chip="${i}" tabindex="0" role="button" aria-label="${esc(name)}"><rect x="${at('x') - 2}" y="${at('y') - 2}" width="${at('width') + 4}" height="${at('height') + 4}" rx="9" class="key-ring"/></g>`; });
      if (html) card.insertAdjacentHTML('afterend', html); });
  }
  const badgeRef = (node, box, i) => { const b = badgesOf(box != null ? boxDef(box) : ctx.nodeIn(node, cur))[i];
    return { type: 'badge', ...(box != null ? { container: box } : { node }), index: i, value: b ? b.text : '', view: cur }; };
  const chipRef = (card, i) => { const tx = card.querySelector(`text[data-chip="${i}"]`); return { type: 'chip', node: card.dataset.id, index: i, value: tx ? tx.textContent : '', view: cur }; };
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
      svg.querySelectorAll('.n-port[data-edges]').forEach(p => p.classList.toggle('hot', p.dataset.edges.split(',').some(i => geo.edges[i] && (geo.edges[i].from === nid || geo.edges[i].to === nid)))); // not an ease's fading copy (#67)
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
    if (ref && (!geo || !exists(ref))) return false;
    if (!o.story) readerMoved(); // a selection the story didn't make: a story playing waits (0.14.0)
    more = []; selectNew = false; // the reader moved on: an add the host has not answered selects nothing later
    sel = ref ? { ...copyRef(ref), view: cur } : null;
    if (!ofSel(sub)) sub = null; // a chip or badge acts for Delete and Alt + arrows only while its card or box is the one selected
    paint();
    if (sel && sel.type === 'node' && o.reveal !== false) { const n = geo.byId[sel.id]; requestAnimationFrame(() => { if (!dead) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); }); }
    emitSel(!!o.again);
    return true;
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
    sub = null; selectNew = false; paint(); emitSel();
  }

  /* navigation: zoom into the card that opens a view, out to the card a view came from. One move at a time, the latest
     wins: a setView() (or open, up) during a move takes it to its own view instead, and every request's promise says
     whether its view was shown (false: unknown, superseded, or the map destroyed). Under reduced motion a move is done
     before go() returns. */
  let nav = null; // the move under way: { to, how, waiting: the resolvers of the requests it answers }
  const answer = ok => { if (nav) nav.waiting.splice(0).forEach(r => r(ok)); };
  function go(vid, how = {}) {
    if (dead) return Promise.resolve(false);
    if (!ctx.V[vid]) { warn(`setView("${vid}"): the model has no such view; its views are ${ctx.views.map(v => `"${v.id}"`).join(', ') || 'none'}`); return Promise.resolve(false); }
    if (!nav && vid === cur) { if (how.select) select(nodeRef(how.select)); return Promise.resolve(true); }
    if (!how.story) readerMoved(); // a move the story didn't ask for: a story playing waits (0.14.0)
    return new Promise(res => {
      if (nav) { if (nav.to !== vid) answer(false); nav.to = vid; nav.how = how; nav.waiting.push(res); touch(); return; } // superseded: those requests learn so now
      nav = { to: vid, how, waiting: [res] }; move();
    });
  }
  async function move() { // takes the map from view to view until it shows the latest target; finishes or rolls back (busy, fading)
    const mine = nav, start = cur; let left = false; busy = true; touch();
    try {
      for (;;) {
        const prev = cur, via = () => nav.how.via; // a request's via: the card it opens, when the request is the latest
        const modeOf = v => prev && ctx.chain(v).includes(prev) || (v === nav.to && via()) ? 'in' : prev && ctx.chain(prev).includes(v) ? 'out' : 'jump';
        if (prev && !still() && nav.to !== prev) { // leave: into the card, or out, then fade
          const m = modeOf(nav.to), n = m === 'in' && via() && geo.byId[via()];
          if (n) await cam.animate(cam.zoomTo({ x: n.x, y: n.y, w: n.w, h: n.h }, 1.1), 420);
          else await cam.animate({ k: cam.s.k * (m === 'out' ? 0.6 : 1) }, m === 'out' ? 260 : 1);
          stage.classList.add('fading'); left = true; await sleep(130);
          if (dead || nav !== mine) return;
        }
        const vid = nav.to; // the latest request: one made during the leave is the view drawn
        if (!ctx.V[vid] || vid === cur) break; // gone from the model (an update() during the move), or back where it started
        const mode = modeOf(vid);
        delete asked[prev]; // an unfold asked for on the view left is not waited for (#71)
        if (P.onNavigate) P.onNavigate(vid, prev, mode);
        const at = trail.indexOf(vid); trail = at >= 0 ? trail.slice(0, at + 1) : trail.length === 1 && vid === (ctx.V[prev] || {}).parent ? [vid] : [...trail, vid];
        mount(vid); emitSel(); left = false;
        const fitS = startView(), back = mode === 'out' ? geo.nodes.find(n => ctx.childOf(n.id, cur) === prev) : null;
        if (prev && !still()) {
          if (mode === 'in') cam.set({ ...fitS, k: fitS.k * 0.55 });
          else if (mode === 'out') cam.set(back ? cam.zoomTo({ x: back.x, y: back.y, w: back.w, h: back.h }, 1.1) : { ...fitS, k: fitS.k * 1.6 });
          else cam.set(fitS);
          stage.classList.remove('fading');
          await cam.animate(fitS, mode === 'jump' ? 1 : 460);
        } else { cam.set(fitS); stage.classList.remove('fading'); }
        if (dead || nav !== mine) return;
        cam.touched = false;
        if (back) { flash(back.id); if (root.activeElement === stage) focusMap(nodeRef(back.id), false); } // keys go on from the card come back to
        if (nav.to === cur) break; // else a request during the zoom-in: on from here
      }
      // done: settled before any event, so a listener's own setView() starts a move of its own
      const ok = nav.to === cur, how = nav.how, shown = cur;
      answer(ok); nav = null; busy = false; stage.classList.remove('fading');
      if (left && cur) cam.animate(startView()); // left, and no other view drawn: the camera comes back
      if (shown && shown !== start) { say('Showing ' + (ctx.V[shown].title || shown)); emit('viewchange', { view: shown, from: start }); }
      if (ok && how.select && cur === shown) select(nodeRef(how.select), { reveal: true });
    } catch (err) { fail(err); } // a bug of ours or of a page hook: reported, and the map left usable below
    finally { if (nav === mine) { answer(false); nav = null; busy = false; stage.classList.remove('fading'); } touch(); }
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
  /* unfolding in place (#71): a stacked card opens into a box on this view (mapContext's unfold), and folds back. Off in
     an editable map: an edit names the model's own views and boxes, and an unfolded box is neither. */
  const unfoldBox = id => { const f = ((ctx.V[cur] || {}).containers || []).find(b => b && b.id === id); return f && f.unfolds ? f : null; };
  const foldOf = id => { const bs = (ctx.V[cur] || {}).containers || []; let b = bs.filter(x => x && (x.nodeIds || []).includes(id)).pop(); // the unfolded box a card is in
    for (let k = 0; b && k < 64; k++, b = bs.find(x => x && x.id === b.parent)) if (b.unfolds) return b.id; return null; };
  function setUnfold(nid, on) { // true when the picture changed
    const list = expanded[cur] || [];
    if (!on && asked[cur]) asked[cur].delete(nid); // folded back before its view came: no longer waited for
    if (E || dead || !cur || (on ? list.includes(nid) || !ctx.unfoldable(nid, cur) : !list.includes(nid))) return false;
    expanded[cur] = on ? [...list, nid] : list.filter(x => x !== nid);
    update(current, false, true);
    if ((expanded[cur] || []).includes(nid) !== on) { emitSel(); return false; } // the model would not have it after all
    unfolded(nid, on);
    return true;
  }
  function unfolded(nid, on) { // the box a card became is selected and brought into view, or the card it folded back into: one select event
    const f = on && (geo.families || []).find(x => x.id === nid);
    if (f) { cam.reveal({ x: f.x, y: f.y, w: f.w, h: f.h }); select({ type: 'container', id: nid }, { reveal: false }); }
    else if (!on && geo.byId[nid]) select(nodeRef(nid));
    else emitSel();
    say(`${nameOf(nid)} ${on ? 'unfolded here' : 'folded'}`);
  }
  function gesture(id, how) { // E, or Alt + click: a stacked card unfolds; an unfolded box, or a card in one, folds it
    if (E || !id || !geo) return false;
    const c = geo.byId[id] ? ctx.opensOf(id, cur) : null, on = !!c && (!ctx.V[c] || !!ctx.unfoldable(id, cur)), nid = on ? id : unfoldBox(id) ? id : foldOf(id);
    if (!nid) return false;
    let stop = false; // the host may take it, or load a view it has not yet and update() right here
    emit('expand', { target: nodeRef(nid), view: ctx.opensOf(nid, cur), expanded: on, preventDefault() { stop = true; } });
    if (stop || dead) return true;
    if (!setUnfold(nid, on)) {
      const c2 = on && ctx.opensOf(nid, cur);
      if (c2 && !ctx.V[c2]) { (asked[cur] ||= new Map()).set(nid, c2); say(`${nameOf(nid)}: its inner view is not loaded yet; it unfolds here once it is`); } // the update() that brings it unfolds it
      if (on) status(c2 && !ctx.V[c2] ? 'Its inner view is not loaded yet' : 'Nothing more to show here');
      return true; }
    if (how === 'key') { const f = on && (geo.families || []).find(x => x.id === nid), inside = n => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
      const n0 = f ? geo.nodes.filter(inside).sort((a, b) => a.x - b.x || a.y - b.y)[0] : null; focusMap(n0 ? nodeRef(n0.id) : sel); } // keys go on inside, or on the card
    return true;
  }
  function flash(nid) { const g = svg.querySelector(`.node[data-id="${CSS.escape(nid)}"]`); if (!g) return; g.classList.add('flash'); later(() => g.classList.remove('flash'), 1400); }
  /* the notation every view is drawn in (0.15.0): the host's, a reader's (the page's toggle and link), or null for each
     view's own. The view shown is drawn again from the geometry it has, with its camera, selection, lens and marks, and
     nothing is laid out. False for a notation that isn't one (with a warning). */
  function setShapes(x) {
    if (dead) return false;
    const want = x == null ? null : noteOf(x);
    if (x != null && !want) { warn(`shapes = ${JSON.stringify(x)}: the notations are ${NOTATIONS.join(', ')}`); return false; }
    shapesSet = want;
    if (cur && ctx.geoCache[cur] && ctx.geoCache[cur].shapes !== noteFor(cur)) {
      const keep = sel, keepMore = more, touched = cam.touched;
      mount(cur); cam.set({}); cam.touched = touched;
      if (keep && exists(keep)) { sel = keep; more = keep.type === 'node' ? keepMore.filter(id => geo.byId[id]) : []; paint(); }
      emitSel(); }
    touch(); return true;
  }
  function setFlow(on, save = true) { // save: the page keeps it as the reader's choice
    stage.classList.toggle('flowing', on);
    const b = q('[data-z="flow"]'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    if (save && P.onFlow) P.onFlow(on);
    touch();
  }
  function pause(on) { const was = paused; paused = on; stage.classList.toggle('paused', on); if (svg) on ? svg.pauseAnimations() : svg.unpauseAnimations();
    if (on !== was) touch(); // MapState.paused (0.15.0)
    if (story && on !== was) { if (on) clearTimeout(story.timer); else arm(story); } } // the page's Pause holds every clock: a dot that rides (startTrip), and a story's step, given its time again after

  /* keys on the canvas; the page forwards the same keys when the focus is elsewhere */
  function key(e) {
    const k = e.key, g = e.target && e.target.closest && e.target.closest('.node');
    if (k === 'Escape' && cancelGesture()) return true; // Escape stops a gesture in progress before anything else
    if (story) { const r = storyKey(e); if (r != null) return r; } // a story's keys first (#69)
    if (k === 'Escape' && trip && trip.kind) { const was = trip.kind; endTrip(); say(was === 'replay' ? 'Replay stopped' : 'Tour stopped'); return true; } // Esc ends a tour or a replay first
    if (E && editKey(e)) return true;
    if (e.altKey) return false;
    const lk = e.target && e.target.closest && e.target.closest('.line-key'), tk = e.target && e.target.closest && e.target.closest('.tab-key, .family [data-badge]');
    const ck = e.target && e.target.closest && e.target.closest('.chip-key'), card = ck && [...svg.querySelectorAll('.node')].find(x => x.dataset.id === ck.dataset.node);
    if (k === 'Enter' && lk && geo.edges[+lk.dataset.i]) select(edgeRef(geo.edges[+lk.dataset.i]), { again: true }); // as a click on the line (#43)
    else if (k === 'Enter' && tk) { const fam = tk.closest('.family'), ref = badgeRef(tk.dataset.node, fam ? fam.dataset.family : null, +tk.dataset.badge); if (activate(ref, e)) select(ref); }
    else if (k === 'Enter' && card) { const ref = chipRef(card, +ck.dataset.chip); if (activate(ref, e)) select(ref); } // as a click on the chip
    else if (k === 'e' || k === 'E') return gesture(g ? g.dataset.id : sel && (sel.type === 'node' || sel.type === 'container') ? sel.id : null, 'key'); // unfold here, or fold back (#71)
    else if (k === '+' || k === '=') cam.zoomAt(1.4, null, null, true);
    else if (k === '-' || k === '_') cam.zoomAt(1 / 1.4, null, null, true);
    else if (k === '0') cam.fit();
    else if (k === '1') cam.actual();
    else if (k === 'Enter' && (g || (sel && sel.type === 'node'))) { // a selected card opens its inner view; without one it is selected again, as a click does
      const id = g ? g.dataset.id : sel.id;
      if (sel && sel.type === 'node' && sel.id === id && ctx.opensOf(id, cur)) open(id); else select(nodeRef(id), { again: true }); }
    else if (k === 'Escape' || k === 'Backspace') { if (sel) select(null); else up(); }
    else if ((k === 'f' || k === 'F') && !reducedMotion()) setFlow(!stage.classList.contains('flowing')); // under reduced motion no flow is drawn, and ≋ isn't offered
    else if (k.startsWith('Arrow') && g && geo.byId[g.dataset.id]) { const to = nearest(geo.byId[g.dataset.id], k); if (!to) return false;
      const tg = svg.querySelector(`.node[data-id="${CSS.escape(to.id)}"]`); tg.focus({ preventScroll: true }); cam.reveal({ x: to.x, y: to.y, w: to.w, h: to.h }); }
    else if (k.startsWith('Arrow')) { const d = 80, m = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[k]; if (!m) return false; cam.pan(m[0], m[1], true); }
    else return false;
    readerMoved(); // a key the map acted on: a story playing waits
    return true;
  }


  /* ---------- editing: a gesture never changes the picture; it emits a `change` the host may apply (then update()) ----------
     Each event carries what the user meant and, apart from it, an optional hint: where the card was dropped. */
  let seq = 0, sub = null, drag = null, conn = null, naming = null, stale = false, selectNew = false, swallow = 0;
  /* the gesture in progress, one at a time: a card dragged, a line drawn from the handle, or a name field open (naming:
     { ref, place, close }). Escape, a new picture (setView, an update that redraws, unfolding) and destroy() cancel it,
     with no change emitted; keepName leaves a name field open over the same view's card, which mount() checks */
  const gestureNow = () => conn ? 'connecting' : drag && drag.on ? 'dragging' : naming ? 'naming' : 'idle';
  function cancelGesture(keepName = false) { // true when something was in progress
    let was = false;
    if (conn) { if (conn.path) conn.path.remove(); conn = null; was = stale = true; } // its pointerup and click then do nothing
    if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.on) was = stale = true; drag = null; }
    if (naming && !keepName) { naming.close(false); was = true; }
    if (was) touch();
    return was;
  }
  const placed = {};  // per view: the slot every card had when last drawn (stable positions across updates; never in the model)
  /* an edit's places wait for the host's answer, and the next update() says from its model whether it applied the edit:
     a move into or out of a box shows in the boxes, an add as a new card with its name, and a place alone (a move to a
     spot, a reorder) as the card's own `layout` entry the host wrote, or as the model unchanged (the host answering an
     edit that changes no field). Any other update drops it: an edit the host refused moves nothing, whatever comes next.
     Places an update applied are kept with the models before and after it, so an update back to either (undo, redo)
     puts the cards back where they were then */
  let pending = null; // the latest gesture's: { op, view, card, place, to, exact, label, ids, base, at }
  const moves = []; // { view, base, after, before, then }: places an update applied, and the ones before it
  const viewIn = (m, vid) => arrOf(m && m.views).find(v => v && v.id === vid) || {};
  const boxIdOf = (m, vid, id) => { const bs = arrOf(viewIn(m, vid).containers).filter(b => b && b.id != null && arrOf(b.nodeIds).includes(id)); // the innermost box listing it
    return ((bs.find(b => !bs.some(o => o.parent === b.id)) || bs[0]) || {}).id ?? null; };
  const norm = t => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const labelIn = (m, v, id) => norm(((v.nodeOverrides || {})[id] || {}).label ?? ([...arrOf(m.nodes), ...arrOf(m.views).flatMap(w => arrOf(w && w.nodes))].find(n => n && n.id === id) || {}).label);
  function change(c, exact) {
    const ev = { id: 'c' + Date.now().toString(36) + '-' + (++seq), view: cur, ...c };
    // only the latest gesture waits for the host: an edit the host never answered leaves no trace
    const place = ev.hint && Number.isFinite(ev.hint.col) ? [ev.hint.col, ev.hint.row] : null, card = c.target && c.target.type === 'node' ? c.target.id : null, v = viewIn(current, cur);
    pending = (place || exact) && (card || (c.op === 'add' && c.kind === 'node')) ? { op: c.op, view: cur, card, place, exact, label: norm(c.label), ids: arrOf(v.nodeIds),
      to: c.op === 'move' && (c.to ?? null) !== boxIdOf(current, cur, card) ? c.to ?? null : undefined, base: JSON.stringify(current), at: JSON.stringify((v.layout || {})[card] ?? null) } : null;
    selectNew = c.op === 'add' && c.kind === 'node'; // the latest gesture's: an add the host never answered selects nothing later
    emit('change', ev);
    return ev;
  }
  function answered(p, m2, json) { // the update's model shows the edit: the card its places go to, else null
    const v = viewIn(m2, p.view), was = new Set(p.ids);
    if (p.op === 'add') return arrOf(v.nodeIds).find(id => !was.has(id) && labelIn(m2, v, id) === p.label) ?? null; // a new card with its name
    if (p.to !== undefined) return boxIdOf(m2, p.view, p.card) === p.to ? p.card : null; // into or out of a box
    return json === p.base || JSON.stringify((v.layout || {})[p.card] ?? null) !== p.at ? p.card : null; // a place alone
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
  /* a text field over the canvas: names a new card, or renames a card, line or container. It follows the camera, and a
     redraw of the same view keeps it over its card (a new view, or its card gone, closes it: see mount) */
  const nameBox = ref => { // where the field sits, in map units: over a card's name, a line's label (or its middle), a box's title
    if (ref.type === 'node') { const n = geo.byId[ref.id]; return n ? { x: n.x + 50, y: n.y + n.h / 2 - 13, w: n.w - 58, h: 26 } : null; }
    if (ref.type === 'edge') { const e = geo.edges[edgeIndex(ref)]; if (!e) return null; const L = e.lbl, m = e.pts[Math.floor(e.pts.length / 2)];
      return L ? { x: L.x - 8, y: L.y - 2, w: L.w + 16, h: L.h + 4 } : { x: m[0] - 60, y: m[1] - 12, w: 120, h: 24 }; }
    const f = ref.type === 'container' && (geo.families || []).find(x => x.id === ref.id); return f ? { x: f.x + 8, y: f.y + 2, w: Math.min(f.w - 16, 220), h: 24 } : null; };
  function editor(where, text, done, ref = null) { // where: a box in map units (a new card's), or ref names what the field sits over
    if (naming) naming.close(false);
    const inp = document.createElement('input');
    inp.className = 'um-edit um-rename'; inp.value = text; inp.setAttribute('aria-label', text ? 'New name' : 'Name of the new card');
    const place = () => { const box = ref ? nameBox(ref) : where; if (!box) return; const k = cam.s.k, [W, H] = cam.size();
      Object.assign(inp.style, { left: (box.x - cam.s.cx) * k + W / 2 + 'px', top: (box.y - cam.s.cy) * k + H / 2 + 'px', width: Math.max(120, box.w * k) + 'px', height: Math.max(22, box.h * k) + 'px', fontSize: Math.max(11, 13 * k) + 'px' }); };
    place(); stage.appendChild(inp); inp.focus(); inp.select();
    // once only: removing a focused field can fire blur (cancel) in the middle of a commit
    let closed = false;
    const finish = ok => { if (closed) return; closed = true; naming = null; touch(); const v = inp.value.trim(); if (ok && v && v !== text) done(v); inp.remove(); stage.focus({ preventScroll: true }); };
    naming = { ref, place, close: finish }; touch();
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    inp.addEventListener('blur', () => finish(false));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    return inp;
  }
  function rename(ref) {
    ref = copyRef(ref); if (!can('rename') || !ref || !nameBox(ref)) return;
    const n = ref.type === 'node' && geo.byId[ref.id], e = ref.type === 'edge' && geo.edges[edgeIndex(ref)], f = ref.type === 'container' && (geo.families || []).find(x => x.id === ref.id);
    const text = n ? String(ctx.nodeIn(n.id, cur).label ?? n.label ?? '') : e ? String((e.all || [e])[0].label || '') : String(f.label || f.id);
    editor(null, text, v => change({ op: 'rename', target: ref, label: v }), ref);
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
  function focusMap(ref = sel, reveal = true) {
    const line = ref && ref.type === 'edge' && svg && svg.querySelector(`.line-key[data-i="${edgeIndex(ref)}"]`); if (line) return line.focus({ preventScroll: true }); // a line (#43)
    const id = ref && (ref.type === 'node' ? ref.id : ref.node), g = id && svg && [...svg.querySelectorAll('.node')].find(x => x.dataset.id === id); // no CSS.escape: jsdom has none
    if (!g) return stage.focus({ preventScroll: true });
    g.focus({ preventScroll: true }); const n = geo.byId[id]; if (n && reveal) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h });
  }
  stage.addEventListener('focus', e => { if (!pressed && sel && (sel.type === 'node' || sel.type === 'edge') && !(e.relatedTarget && root.contains(e.relatedTarget))) focusMap(); });
  stage.addEventListener('focusin', e => { const t = e.target; if (pressed || !cam || !t.closest || !t.closest('.node, .um-key, .family [data-badge]') || typeof t.getBBox !== 'function') return;
    const b = t.getBBox(); cam.reveal({ x: b.x, y: b.y, w: b.width, h: b.height }); }); // Tab to something out of view brings it in
  /* dragging a card: into or out of a container (move), along its column (reorder), or to another spot (move + hint) */
  stage.addEventListener('pointerdown', e => {
    if (!E || e.button !== 0 || e.altKey || !geo) return;
    const hd = e.target.closest('.um-handle');
    if (hd && can('add')) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (_) {} conn = { from: hd.dataset.from, path: null }; touch(); return; }
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
      drag.on = true; try { stage.setPointerCapture(drag.pid); } catch (_) {} drag.ghost = drag.g.cloneNode(true); drag.ghost.classList.add('um-ghost'); drag.ghost.classList.remove('sel'); svg.appendChild(drag.ghost); touch(); }
    drag.ghost.setAttribute('transform', `translate(${dx} ${dy})`);
    const n = geo.byId[drag.id], into = boxAt(n.x + n.w / 2 + dx, n.y + n.h / 2 + dy);
    svg.querySelectorAll('.family.um-target').forEach(f => f.classList.remove('um-target'));
    if (into) { const f = svg.querySelector(`.family[data-family="${CSS.escape(into.id)}"]`); if (f) f.classList.add('um-target'); }
  });
  const endGesture = e => {
    if (conn || drag) touch(); // the gesture ends
    if (stale) { stale = false; swallow = performance.now() + 400; return; } // the release of a gesture Escape or a new picture cancelled
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
  stage.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); if (conn && conn.path) conn.path.remove(); drag = conn = null; stale = false; });
  /* the model to draw after an update: cards keep the slots they had (the host's own layout wins), a moved or added card
     takes its hint; kept in this handle only, never written to the host's model */
  function withPlaces(m, use = null) { // use: an edit the update applied, { view, hv: id -> its place, ex: a reordered group's places }
    if (options.stableLayout === false) return m;
    const out = structuredClone(m);
    (out.views || []).forEach(v => {
      const was = placed[v.id], { hv = {}, ex = {} } = use && use.view === v.id ? use : {};
      if (!was && !Object.keys(hv).length && !Object.keys(ex).length) return;
      const ids = (v.nodeIds || []).filter(id => typeof id === 'string'), mine = v.layout || {}, L = {}, taken = new Set(), key = p => p[0] + ',' + p[1];
      const put = (id, p) => { let [c, r] = p; while (taken.has(key([c, r]))) r++; L[id] = [c, r]; taken.add(key([c, r])); };
      ids.forEach(id => { if (Array.isArray(mine[id])) { L[id] = mine[id]; taken.add(key(mine[id])); } });    // the host's own layout
      ids.forEach(id => { if (!L[id] && ex[id]) put(id, ex[id]); });                                               // a reordered column group
      ids.filter(id => !L[id] && !hv[id] && was && was[id]).sort((a, b) => was[a][0] - was[b][0] || was[a][1] - was[b][1]).forEach(id => put(id, was[id])); // everyone stays
      ids.forEach(id => { if (!L[id] && hv[id]) put(id, hv[id]); });                                              // a moved or added card: its drop, or the nearest free slot
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
    if (fam && t.closest('.fold-hint')) { if (e.detail <= 1) gesture(fam.dataset.family); return; } // an unfolded box's ⤡ tab folds it (#71)
    if (g && e.altKey && !E && e.detail <= 1 && gesture(g.dataset.id)) return; // Alt + click: unfold the card here, or fold the box it is in
    let ref = null;
    if (g && badge) ref = badgeRef(g.dataset.id, null, +badge.dataset.badge);
    else if (g && chip) ref = chipRef(g, +chip.dataset.chip);
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
  stage.addEventListener('dblclick', e => { const g = e.target.closest('.node'); if (!g) return; e.preventDefault(); if (e.target.closest('.open-hint') || (e.altKey && !E)) return; // Alt: its click unfolded
    if (can('rename') && sel && sel.type === 'node' && sel.id === g.dataset.id && e.target.closest('.n-label')) return rename(sel); // a selected card's name edits
    open(g.dataset.id); });
  stage.addEventListener('keydown', e => { if (e.defaultPrevented || e.metaKey || e.ctrlKey || (e.altKey && !E) || e.target.closest('input')) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) return; // a button of the map's own (zoom, ↑, ≋, Back) presses itself
    if (key(e)) { e.preventDefault(); e.stopPropagation(); } });
  stage.addEventListener('pointerover', e => { const g = e.target.closest('.node'); if (!g) return; svg.querySelectorAll('.edge-g').forEach(x => x.classList.toggle('hov', x.dataset.from === g.dataset.id || x.dataset.to === g.dataset.id)); });
  stage.addEventListener('pointerout', e => { if (e.target.closest('.node')) svg.querySelectorAll('.edge-g.hov').forEach(x => x.classList.remove('hov')); });
  const ctl = q('.ctl');
  if (ctl) ctl.addEventListener('click', e => { const z = e.target.closest('button')?.dataset.z; if (!z) return; readerMoved(); // a press by key too: a story playing waits
    if (z === 'in') cam.zoomAt(1.4, null, null, true); else if (z === 'out') cam.zoomAt(1 / 1.4, null, null, true); else if (z === 'fit') cam.fit(); else if (z === 'one') cam.actual(); else if (z === 'up') up(); else if (z === 'flow') setFlow(!stage.classList.contains('flowing')); else if (z === 'add') addAt(cam.s.cx, cam.s.cy); });
  setFlow(options.flow ?? !reducedMotion(), false); // the default, or the host's: not saved as the page reader's choice

  // the stage changes size with its container: keep the zoom, refit only an untouched view (no ResizeObserver, as in
  // jsdom: the view is fitted once)
  let rz;
  const ro = typeof ResizeObserver === 'function' && new ResizeObserver(() => { if (!cam || dead) return; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (dead) return; if (!cam.touched) cam.set(startView()); else cam.apply(); if (sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id]; cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); } }); });
  if (ro) ro.observe(stage);

  /* the picture as a file: CSS variables resolved into attributes so it stands alone. It is drawn at rest: no
     selection, hover, flow animation or edit handles, whatever the screen shows; the screen is left as it was. */
  function standalone(scale = 1, vid = cur, fontCSS = '') {
    if (settle) settle(); // an export right after update() draws where things end up, not mid-ease
    if (!svg || !geo || vid == null) return ''; // a model with no views draws nothing
    let s = svg, g = geo, off = null;
    if (vid !== cur) { // another view: drawn off screen, inside the shadow root so the same styles apply
      const v = ctx.V[vid]; if (!v || !(v.nodeIds || []).some(i => ctx.N[i])) return '';
      const c = pic(vid);
      off = document.createElement('div'); off.style.cssText = 'position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none';
      off.innerHTML = c.markup; stage.parentNode.appendChild(off); s = off.querySelector('svg'); s.classList.add('map-svg'); g = c.g;
    }
    if (off) { const mine = layers.get('lens'), L = mine && arrOf(ctx.D.lenses).find(x => x && x.id === lensId); // the host's marks, on another view too (#63), and the lens as it lights that view
      if (L) layers.set('lens', lensOf(ctx, vid, L).layer); drawMarks(s, g, vid); if (L) layers.set('lens', mine); }
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
    clone.querySelectorAll('title, .flowline, .um-edit, .um-ghost, .um-link, .keys, .um-key, .um-trip').forEach(t => t.remove());
    clone.setAttribute('role', 'img'); clone.querySelectorAll('[tabindex], [aria-pressed]').forEach(t => ['tabindex', 'role', 'aria-pressed'].forEach(a => t.removeAttribute(a)));
    clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); clone.setAttribute('width', b.w * scale); clone.setAttribute('height', b.h * scale);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, fill: getComputedStyle(stage).backgroundColor }).forEach(([k2, v]) => bg.setAttribute(k2, v));
    clone.insertBefore(bg, clone.firstChild.nextSibling);
    if (fontCSS) { const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = fontCSS; clone.insertBefore(st, clone.firstChild); } // the host's own @font-face rules, carried into the file
    return new XMLSerializer().serializeToString(clone);
  }

  /* the time-lapse (#67): an update that redraws the view eases into it. Cards that moved glide from where they were; new
     cards, and lines whose route changed, fade in; cards and lines that left fade out where they were, copied from the
     picture before (as nothing that can be clicked, focused, found or exported). CSS on the new picture only: the
     geometry is the update's own. Nothing moves under reduced motion. */
  let settle = null; // ends an ease still running (before an export, or the next update)
  function easeIn(oldGeo, oldSvg) {
    if (settle) settle();
    if (options.ease === false || still() || !oldGeo || !oldSvg || !geo || !svg || oldSvg === svg) return;
    const T = 600, moves = [], key = e => edgeRefIds(e).join(' ') || e.from + '>' + e.to, all = (s, q) => [...s.querySelectorAll(q)];
    const was = new Map(oldGeo.nodes.map(n => [n.id, n])), now = new Set(geo.nodes.map(n => n.id));
    const lines = new Map(oldGeo.edges.map((e, i) => [key(e), [e, i]])), kept = new Set(geo.edges.map(key));
    geo.nodes.forEach(n => { const g = svg.querySelector(`.node[data-id="${CSS.escape(n.id)}"]`), o = was.get(n.id); if (!g) return;
      if (!o) moves.push([g, 'opacity', '0', 0]);
      else if (o.x !== n.x || o.y !== n.y) moves.push([g, 'transform', `translate(${o.x - n.x}px, ${o.y - n.y}px)`, 0]); });
    geo.edges.forEach((e, i) => { const o = lines.get(key(e)); if (o && canon(o[0].pts) === canon(e.pts)) return;
      all(svg, `.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(x => moves.push([x, 'opacity', '0', T / 2])); });
    const gone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gone.setAttribute('class', 'um-leaving'); gone.setAttribute('aria-hidden', 'true'); gone.style.pointerEvents = 'none';
    const leave = x => { const c = x.cloneNode(true);
      [c, ...c.querySelectorAll('*')].forEach(y => { ['tabindex', 'role', 'data-id', 'data-i', 'data-from', 'data-to', 'data-o', 'data-t', 'data-chip', 'data-badge', 'data-edges'].forEach(a => y.removeAttribute(a)); y.classList.remove('node', 'edge-g', 'e-lab', 'sel', 'hot', 'hov'); }); // a port's data-edges named lines the new picture may lack
      gone.appendChild(c); };
    oldGeo.nodes.forEach(n => { if (!now.has(n.id)) all(oldSvg, `.node[data-id="${CSS.escape(n.id)}"]`).forEach(leave); });
    lines.forEach(([, i], k) => { if (!kept.has(k)) all(oldSvg, `.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(leave); });
    if (!moves.length && !gone.childNodes.length) return;
    svg.appendChild(gone);
    moves.forEach(([el, p, v]) => { el.style.transition = 'none'; el.style.setProperty(p, v); });
    svg.getBoundingClientRect(); // the start, drawn: each change below is a transition from it
    moves.forEach(([el, p, , d]) => { el.style.transition = `${p} ${T}ms ease ${d}ms`; el.style.removeProperty(p); });
    gone.style.transition = `opacity ${T / 2}ms ease`; gone.style.opacity = '0';
    const t = later(() => settle && settle(), T * 2);
    settle = () => { clearTimeout(t); timers.delete(t); moves.forEach(([el]) => el.style.removeProperty('transition')); gone.remove(); settle = null; };
  }

  function update(model2, relayout = false, unfolding = false) { // unfolding: the same model, a card unfolded or folded
    if (dead) return;
    if (!model2 || typeof model2 !== 'object' || Array.isArray(model2)) throw new TypeError(`umlimator: update(model) takes a map model, an object with nodes and views; it got ${model2 === null ? 'null' : Array.isArray(model2) ? 'an array' : typeof model2}`);
    // an identical model: nothing to redraw, unless it answers an edit (one that changed only a place)
    const json = JSON.stringify(model2), same = json === JSON.stringify(current), own = relayout || unfolding; // own: the map drawing its own model again, no answer to an edit
    if (!own && !pending && same) return;
    // the model before or after a move an update applied (undo, redo): the cards go back where they were then
    const back = !own && !same && [...moves].reverse().find(x => x.base === json || x.after === json);
    if (back) placed[back.view] = structuredClone(back.base === json ? back.before : back.then);
    // the edit waiting for this answer: its places if the model shows it, else none (it is dropped either way)
    const p = own ? null : pending, card = p && answered(p, model2, json);
    if (!own) pending = null;
    const use = card ? { view: p.view, hv: p.place ? { [card]: p.place } : {}, ex: p.exact || {} } : null, from = use && structuredClone(placed[p.view] || null);
    // a card E or Alt + click asked to unfold before its view was loaded unfolds once a model brings that view (#71)
    const brought = []; Object.entries(asked).forEach(([vid, m]) => m.forEach((c, nid) => { if (!arrOf(model2.views).some(v => v && v.id === c)) return;
      m.delete(nid); const l = expanded[vid] ||= []; if (!l.includes(nid)) { l.push(nid); if (vid === cur) brought.push(nid); } }));
    const old = ctx, keys = {}, wantNew = selectNew && !own;
    old.views.forEach(v => { keys[v.id] = relayout ? null : old.viewKey(v.id); });
    current = model2;
    ctx = mapContext(withPlaces(model2, use), { measure, kinds: !!P.kinds, prev: options.stableLayout === false ? null : old.planCache, expand: expanded });
    Object.keys(expanded).forEach(v => { expanded[v] = ctx.unfolded[v] || []; }); // a card or inner view the model no longer has folds
    if (!own) selectNew = false;
    ctx.views.forEach(v => { const id = v.id; if (keys[id] == null || keys[id] !== ctx.viewKey(id)) return;
      if (id in old.planCache) ctx.planCache[id] = old.planCache[id];
      if (old.layoutCache[id]) ctx.layoutCache[id] = old.layoutCache[id];
      if (old.geoCache[id] && JSON.stringify(old.brokenIn(id)) === JSON.stringify(ctx.brokenIn(id))) ctx.geoCache[id] = old.geoCache[id]; }); // the same rules broken (#70)
    restory(); // the story shown takes this model's steps, or stops when the model has it no more
    if (!cur) { // nothing shown yet (a first model with no views): this model's first view is drawn
      const v0 = ctx.V[options.view] ? options.view : ctx.rootId;
      if (v0 && cam) { mount(v0); cam.set(startView()); cam.touched = false; emitSel(); emit('viewchange', { view: cur, from: null }); }
      return; }
    if (!ctx.V[cur]) { // the view shown is gone: the root, or the empty card of a model with no views
      const from = cur; mount(ctx.rootId ?? null); cam.set(startView()); cam.touched = false; emitSel(); if (cur) emit('viewchange', { view: cur, from }); return; }
    if (ctx.geoCache[cur] && keys[cur] === ctx.viewKey(cur) && ctx.geoCache[cur].shapes === noteFor(cur)) { if (lensId != null) { relens(); drawMarks(); } if (pc) pc.chrome(); if (P.onMount) P.onMount(inner); return; } // this view's picture did not change (its lens or the views may have; the page reads the new model, issue 133)
    const keep = sel, keepMore = more, touched = cam.touched, prev = [geo, svg];
    mount(cur);
    if (touched) cam.set({}); else cam.set(startView());
    cam.touched = touched;
    // ponytail: the models' JSON, kept for 20 moves; a hash of them if models grow large enough for that to weigh
    if (use && p.view === cur && json !== p.base) { moves.push({ view: cur, base: p.base, after: json, before: from, then: structuredClone(placed[cur] || null) }); if (moves.length > 20) moves.shift(); }
    const box = brought.find(nid => (expanded[cur] || []).includes(nid));
    if (box) unfolded(box, true); // a card asked to unfold earlier: its box is selected
    else if (wantNew && use && p.op === 'add' && geo.byId[card]) select(nodeRef(card), { reveal: false }); // the card added, as the reader named it
    else { // the selection that is still drawn stays, and a select event comes only if it changed (unfolding: the caller says)
      if (keep && exists(keep)) { sel = keep; more = keep.type === 'node' ? keepMore.filter(id => geo.byId[id]) : []; paint(); }
      if (!unfolding) emitSel(); }
    if (!relayout) easeIn(...prev); // a font that came in late moves nothing on purpose: no ease
    touch();
  }

  function destroy() {
    if (dead) return;
    cancelGesture();
    dead = true; if (ro) ro.disconnect(); cancelAnimationFrame(rz); stopStory();
    answer(false); endTrip(); // every promise settles: a move's setView() false, a tour's and a replay's done false
    timers.forEach(clearTimeout); timers.clear(); sleeping.forEach(wake => wake());
    if (cam) cam.stopAnimation();
    host.remove();
    clearTimeout(restT); camRest = camNow(); flushState(true); // a state listener hears destroyed: true, last, and where the camera stopped
    Object.keys(subs).forEach(k => delete subs[k]);
  }

  /* ---------- marks: overlay(), highlight(), tour() and replay() (#62, #63, #65) ----------
     The host's marks, drawn over the picture without touching the model: named layers, stacked in the order first set.
     Each mount draws them again, so they survive update() and setView(); a card or line the view doesn't show is ignored.
     toSVG() and toPNG() draw them too, at rest: they are the host's, like the model (the selection and hover are not). */
  const layers = new Map(), DIM = .2, clamp01 = x => Math.min(1, Math.max(0, +x || 0));
  const scopes = new Map(); // layer name -> the views it is about: a highlight's Refs name theirs, and it lights those only
  // a drawn line that stands for several edges takes the strongest of their marks: a pulsing one, then the most lit, then the fastest
  const strongest = ms => ms.filter(Boolean).sort((a, b) => (!!b.pulse - !!a.pulse) || ((b.level ?? 1) - (a.level ?? 1)) || ((b.speed ?? 1) - (a.speed ?? 1)))[0];
  function markOf(get, here, dims) { // one card's or line's mark over the layers here: each property from the latest that sets it, the lowest level
    let out = null;
    here.forEach(L => { const m = get(L); if (!m && !dims.has(L)) return; out ||= { level: 1 };
      if (m) for (const k in m) if (m[k] != null && k !== 'level') out[k] = m[k];
      out.level = Math.min(out.level, m ? clamp01(m.level ?? 1) : DIM); });
    return out;
  }
  const longest = pts => pts.slice(1).reduce((m, p, k) => Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]) > Math.abs(m[1][0] - m[0][0]) + Math.abs(m[1][1] - m[0][1]) ? [pts[k], p] : m, [pts[0], pts[1]]);
  function drawMarks(s = svg, g = geo, vid = cur) {
    if (!s || !g) return;
    s.querySelectorAll('.um-rings, .um-marks, .um-glow').forEach(x => x.remove());
    s.querySelectorAll('.node[opacity], .edge-g[opacity], .e-lab[opacity]').forEach(x => x.removeAttribute('opacity'));
    s.querySelectorAll('.edge[style], .flowline[style]').forEach(x => x.removeAttribute('style'));
    s.querySelectorAll('.node[aria-description]').forEach(x => x.removeAttribute('aria-description'));
    s.querySelectorAll('[data-was]').forEach(x => { if (x.tagName === 'title') x.textContent = x.getAttribute('data-was'); else x.setAttribute('aria-label', x.getAttribute('data-was')); x.removeAttribute('data-was'); });
    // the layers about this view; one that dims dims only where it names something: on a view it names nothing of, nothing fades
    const named = [...layers].filter(([n]) => !scopes.has(n) || scopes.get(n).includes(vid)), here = named.map(([, L]) => L);
    const names = L => g.nodes.some(n => (L.nodes || {})[n.id]) || g.edges.some(e => edgeRefIds(e).some(x => (L.edges || {})[x]));
    let dims = new Set(here.filter(L => L.dim && names(L)));
    // a story's step dims alone (0.14.0): a layer that dimmed before the step keeps its marks but not its dimming, and one set
    // while the step shows dims in its place, so a step looks as it was told and what the reader lights later still shows
    const sl = layers.get('story'), at = n => dimAt.get(n) || 0;
    if (dims.has(sl)) dims = named.some(([n, L]) => L !== sl && dims.has(L) && at(n) > at('story')) ? new Set([...dims].filter(L => L !== sl)) : new Set([sl]);
    const markOf2 = get => markOf(get, here, dims);
    if (s === svg) stage.classList.toggle('um-lit', dims.size > 0);
    if (!here.length) return;
    const tone = t => 'var(--um-' + String(t || 'accent').replace(/[^\w-]/g, '') + ')', op = m => m.level < 1 ? ` opacity="${m.level}"` : '';
    const cards = Object.fromEntries([...s.querySelectorAll('.node')].map(x => [x.dataset.id, x]));
    let under = '', over = '';
    const look = lookIn(noteFor(vid), g);
    g.nodes.forEach(n => { const m = markOf2(L => (L.nodes || {})[n.id]), el = cards[n.id]; if (!m || !el) return;
      if (m.level < 1) el.setAttribute('opacity', m.level);
      const sh = (m.tone || m.pulse) && look(n); // a shape's ring: its outline, 5 px out (0.15.0)
      if (m.tone || m.pulse) under += `<g${op(m)}>${sh ? `<path d="${sh.S.out(sh, 5)}"` : `<rect x="${n.x - 5}" y="${n.y - 5}" width="${n.w + 10}" height="${n.h + 10}" rx="14"`} class="um-ring${m.pulse ? ' um-pulse' : ''}" stroke="${tone(m.tone)}"/></g>`;
      const b = m.badge == null ? null : badgesOf({ badges: [m.badge] })[0]; if (!b) return; // a tab after the card's own
      const L = look(n), ty = tabLine(n, L), w = b.text.toUpperCase().length * 6.4 + 10; // on the card's tab line, clear of a head and a folder's tab
      const x = tabAfter(n, L, w);
      over += `<g class="um-tab"${op(m)}><rect x="${x}" y="${ty - 8}" width="${w}" height="15" rx="4" fill="${toneOf(b)}"/><text x="${x + w / 2}" y="${ty + 3}" text-anchor="middle" class="tab-tx">${esc(b.text)}</text></g>`;
      el.setAttribute('aria-description', b.text); });
    const heads = (g.families || []).flatMap(f => [{ x: f.x + 8, y: f.y + 3, w: String(f.label || f.id).length * 6.6 + 8, h: 22 }, // a box's title, 11 px mono
      ...(f.tabs || []).map(t => ({ x: t.x, y: f.y - 8, w: t.w, h: 16 }))]); // and its tabs
    const pills = [], free = r => !g.nodes.some(n => hit(r, n, 8) || (n.tag && hit(r, n.tag, 2))) && !heads.some(h => hit(r, h, 2)) && !g.edges.some(o => o.lbl && hit(r, o.lbl, 2)) && !pills.some(p => hit(r, p, 2));
    g.edges.forEach((e, i) => { const m = markOf2(L => strongest(edgeRefIds(e).map(x => (L.edges || {})[x]))), eg = s.querySelector(`.edge-g[data-i="${i}"]`); if (!m || !eg) return;
      const path = eg.querySelector('.edge'), flow = eg.querySelector('.flowline');
      if (m.level < 1) [eg, s.querySelector(`.e-lab[data-i="${i}"]`)].forEach(x => x && x.setAttribute('opacity', m.level));
      if (m.tone || m.pulse) path.insertAdjacentHTML('beforebegin', `<path d="${path.getAttribute('d')}" class="um-glow${m.pulse ? ' um-pulse' : ''}" stroke="${tone(m.tone)}"/>`);
      if (m.dash) path.setAttribute('style', 'stroke-dasharray: 7 5');
      if (m.speed != null && flow) flow.setAttribute('style', +m.speed > 0 ? `animation-duration: ${(2.4 / m.speed).toFixed(2)}s` : 'animation: none; opacity: 0');
      if (m.label == null || m.label === '') return;
      // the pill takes the first place that covers no card, box title or tab, line label or pill before it (#81): under the
      // line's own label (else on its longest run), then a few places along the line. The view is not laid out again for
      // it, so with no room at any, its text goes in the line's tooltip and accessible name instead
      // ponytail: six places, and another line may lie under one; scan along the line if too few find room
      const t = String(m.label), w = sansW(t, 10, .92) + 14, L = e.lbl, [a, b] = longest(e.pts), len = lenOf(e.pts);
      const box = [L ? [L.x + L.w / 2, L.y + L.h + 10] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...[.5, .3, .7, .15, .85].map(f => along(e.pts, f * len))]
        .map(([x, y]) => ({ x: x - w / 2, y: y - 8, w, h: 16 })).find(free);
      if (!box) { const tt = eg.querySelector(':scope > title'), key = s.querySelector(`.line-key[data-i="${i}"]`);
        if (tt) { tt.setAttribute('data-was', tt.textContent); tt.textContent += '\n' + t; }
        if (key) { key.setAttribute('data-was', key.getAttribute('aria-label')); key.setAttribute('aria-label', key.getAttribute('aria-label') + ', ' + t); }
        return; }
      pills.push(box);
      over += `<g class="um-lab"${op(m)}><rect x="${box.x}" y="${box.y}" width="${w}" height="16" rx="8"${m.tone ? ` style="stroke: ${tone(m.tone)}"` : ''}/><text x="${box.x + w / 2}" y="${box.y + 11.5}" text-anchor="middle">${esc(t)}</text></g>`; });
    const cardsG = s.querySelector('.nodes');
    if (under && cardsG) cardsG.insertAdjacentHTML('beforebegin', `<g class="um-rings" aria-hidden="true">${under}</g>`);
    if (over) s.insertAdjacentHTML('beforeend', `<g class="um-marks" aria-hidden="true">${over}</g>`);
  }
  const dimAt = new Map(); let dimClock = 0; // layer name -> when it was last set (a story's step dims alone over older layers, see drawMarks)
  function overlay(name, layer, views = null) { // views: the views the layer is about (highlight()'s); none: every view
    if (dead || name == null) return;
    const n = String(name);
    if (layer == null) { layers.delete(n); dimAt.delete(n); } else { layers.set(n, layer); dimAt.set(n, ++dimClock); } // a Map keeps the order first set
    if (layer != null && views) scopes.set(n, views); else scopes.delete(n);
    drawMarks(); touch();
  }
  // the cards in a box, at any depth, on a view (an unfolded card's box too)
  const boxCards = (vid, id) => { const bs = ((ctx.V[vid] || {}).containers || []).filter(Boolean), out = new Set(), seen = new Set();
    const walk = b => { if (seen.has(b)) return; seen.add(b); const c = bs.find(x => x.id === b); if (!c) return; (c.nodeIds || []).forEach(i => out.add(i)); bs.filter(x => x.parent === b).forEach(x => walk(x.id)); };
    walk(id); return out; };
  /* the 'highlight' layer (or another, `name`: a story step's 'story', the MCP page's 'mcp'): these cards and lines lit, the
     rest dimmed; a Ref's level (0 to 1), else its distance, fades it. A box's Ref lights its cards and the lines between
     them; Refs that name their view light that view only */
  function highlight(refs, name = 'highlight') {
    if (refs == null) return overlay(name, null);
    const L = { nodes: {}, edges: {}, dim: true }, lv = r => clamp01(r.level ?? (r.distance > 0 ? Math.max(.45, 1 - .15 * r.distance) : 1));
    const lit = (o, x, r) => { o[x] = { level: Math.max(lv(r), (o[x] || {}).level || 0) }; }, list = [].concat(refs).filter(Boolean);
    list.forEach(r => { const id = r.type === 'node' ? r.id : r.node, box = r.type === 'container' ? r.id : r.container; // a chip or badge: its card, or its box
      if (id != null) lit(L.nodes, id, r);
      else if (r.type === 'edge') (r.ids || []).forEach(x => lit(L.edges, x, r));
      else if (box != null) { const vid = r.view ?? cur, ins = boxCards(vid, box), at = x => ins.has(x) || x === box;
        ins.forEach(x => lit(L.nodes, x, r));
        if (ctx.V[vid]) ctx.viewEdges(ctx.V[vid]).forEach(e => { if (at(e.from) && at(e.to) && e._id) lit(L.edges, e._id, r); }); } });
    const views = list.every(r => typeof r.view === 'string') ? [...new Set(list.map(r => r.view))] : null;
    overlay(name, L, views);
  }
  /* lenses (#94): one of the model's saved ways to look at the map, as the 'lens' layer, on every view it is shown on; the
     view is not laid out again. A lens that colours cards by owner puts their tones in a legend over the controls. */
  let lensId = null;
  function relens() {
    const L = lensId == null ? null : arrOf(ctx.D.lenses).find(x => x && x.id === lensId), was = q('.um-lens');
    if (was) { was.remove(); clear = null; }
    if (!L) { const had = lensId != null; lensId = null; layers.delete('lens'); if (had) emit('lens', { lens: null }); return; } // off, or the model no longer has it: the lens event says so
    if (!cur || !ctx.V[cur]) return;
    const { layer, owners } = lensOf(ctx, cur, L), name = esc(L.title || L.id);
    layers.set('lens', layer);
    if (owners.length) { q('.mctl').insertAdjacentHTML('afterbegin', `<div class="um-lens" role="group" aria-label="${name}"><b>${name}</b>${owners.map(([o, t]) => `<span><i style="border-color:var(--um-${t})"></i>${esc(o)}</span>`).join('')}</div>`); clear = null; }
  }
  function setLens(id) { // true when the model has that lens (or id is null)
    if (dead || (id != null && !arrOf(ctx.D.lenses).some(x => x && x.id === id))) return false;
    const was = lensId; lensId = id ?? null; if (lensId != null) dimAt.set('lens', ++dimClock); relens(); drawMarks(); if (lensId !== was) emit('lens', { lens: lensId });
    if (cam && geo && !cam.touched) cam.set(startView()); // fitted: the cards keep clear of the legend, as of the controls
    return true;
  }
  /* a dot that rides the map: a tour along a path the host names, or a trace replayed. One at a time; a new picture of the
     view (setView, an update that redraws it) ends it, as does destroy() */
  let trip = null;
  // a tour's or a replay's dots: over the lines and boxes, under the cards (as the model's own tour), so a dot goes into
  // a card and out at its next line rather than across the card's name
  function tripLayer() {
    const cards = svg.querySelector(':scope > .nodes');
    (cards || svg).insertAdjacentHTML(cards ? 'beforebegin' : 'beforeend', '<g class="um-trip" aria-hidden="true"></g>');
    return cards ? cards.previousElementSibling : svg.lastElementChild;
  }
  function endTrip(played = false) { const t = trip; if (!t) return; trip = null; cancelAnimationFrame(t.raf); if (t.dot) t.dot.remove(); t.end(played); touch(); }
  function startTrip(step, end) { // step(ms played, pauses left out) says whether to go on
    endTrip();
    const t = { raf: 0, dot: null, paused: false, at: 0, last: performance.now(), end }; trip = t;
    const frame = now => { if (trip !== t) return; if (dead) return endTrip(); if (!t.paused && !paused && !(t.story && story && story.held)) t.at += now - t.last; t.last = now; // paused: the page's Pause; held: a story's step's tour, by its own pause
      if (step(t.at)) t.raf = requestAnimationFrame(frame); else endTrip(true); };
    t.raf = requestAnimationFrame(frame);
    return t;
  }
  const lineBetween = (a, b) => { let i = geo.edges.findIndex(e => e.from === a && e.to === b); if (i < 0) i = geo.edges.findIndex(e => e.from === b && e.to === a); // either way
    if (i < 0) return null; const pts = drawnPts(geo.edges[i], looker()); // as drawn: into a shape at its outline (0.15.0)
    return { i, pts: geo.edges[i].from === a ? pts : [...pts].reverse() }; };
  const lenOf = pts => pts.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
  const along = (pts, d) => { for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || k === pts.length - 1) { const f = l ? Math.min(1, d / l) : 1; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } d -= l; } return pts[0]; };
  /* tour(path): the dot rides the line between each pair of cards in turn, through each card to its next line, and each
     card it reaches flashes; where no line joins two cards it skips to the next. Resolves true when it reaches the end. */
  function tour(path, o = {}, quiet = false) { // quiet: a story's step, whose caption says it
    endTrip();
    if (dead || !geo || path == null) return Promise.resolve(false);
    const ids = [].concat(path).map(String).filter(id => geo.byId[id]), legs = [];
    for (let k = 0; k + 1 < ids.length; k++) { const r = lineBetween(ids[k], ids[k + 1]); if (!r) continue;
      const prev = legs[legs.length - 1], n = geo.byId[ids[k]];
      const through = prev && prev.to === ids[k] ? [prev.pts[prev.pts.length - 1], [n.x + n.w / 2, n.y + n.h / 2]] : [], pts = [...through, ...r.pts];
      // skip: the part through the card, where the dot rides under it and can't be seen
      legs.push({ pts, to: ids[k + 1], len: lenOf(pts), skip: through.length ? lenOf([...through, r.pts[0]]) : 0, from: ids[k], i: r.i }); }
    if (legs.length && still() && P.tourAt == null) atRest(legs, quiet);
    if (!legs.length || (still() && P.tourAt == null)) return Promise.resolve(legs.length > 0);
    const speed = Math.max(20, +o.speed || 240); // map units a second
    const g = tripLayer(); g.insertAdjacentHTML('beforeend', '<circle r="5.5" class="tour-dot"/>');
    const dot = g.firstElementChild; let leg = 0, base = 0;
    if (P.tourAt != null) { // the page's #shot=1&at=<0 to 1>: the dot held that far along the ride, a frame for umlimator.py record (#83)
      // spread over the lines only: a frame inside a card would show no dot (it rides under the cards)
      const seen = l => l.len - l.skip;
      let d = clamp01(P.tourAt) * legs.reduce((s, l) => s + seen(l), 0); while (leg < legs.length - 1 && d > seen(legs[leg])) d -= seen(legs[leg++]);
      const [x, y] = along(legs[leg].pts, legs[leg].skip + d); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      trip = { raf: 0, dot: g, end() {} }; return Promise.resolve(true);
    }
    return new Promise(res => { startTrip(ms => { const d = ms * speed / 1000;
      while (leg < legs.length && d - base >= legs[leg].len) { base += legs[leg].len; flash(legs[leg].to); leg++; }
      if (leg >= legs.length) return false;
      const [x, y] = along(legs[leg].pts, d - base); dot.setAttribute('cx', x); dot.setAttribute('cy', y); return true; }, res); trip.dot = g; trip.kind = 'tour'; trip.story = quiet; touch(); });
  }
  // under reduced motion no dot rides: the path is lit at rest instead, its cards ringed and numbered in turn and its lines
  // glowing (the 'tour' layer, which nothing dims), and the live region says it; it stays until the trip slot is taken
  function atRest(legs, quiet) {
    const L = { nodes: {}, edges: {} }, order = [];
    legs.forEach(l => { [l.from, l.to].forEach(id => { if (!L.nodes[id]) { order.push(id); L.nodes[id] = { tone: 'accent', badge: String(order.length) }; } });
      edgeRefIds(geo.edges[l.i]).forEach(x => { L.edges[x] = { tone: 'accent' }; }); });
    overlay('tour', L); trip = { kind: 'path', raf: 0, dot: null, end() { overlay('tour', null); } };
    if (!quiet) say('Tour: ' + order.map(nameOf).join(' → '));
  }
  /* replay(spans): each call from one card to another (a span and its parent's) runs along their line at the trace's relative
     time, the whole trace in `duration` ms; the line glows while the call lasts and keeps its duration as a label */
  let replays = 0; // the newest replay's number: an older one's stop() leaves the newer one's marks alone
  function replay(spans, o = {}) {
    if (dead) return { hops: 0, skipped: 0, done: Promise.resolve(false), pause() {}, resume() {}, stop() {} };
    endTrip(); overlay('replay', null);
    const gen = ++replays;
    const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
    const byId = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(geo ? geo.nodes : [], o.match);
    let skipped = 0, t = null, done; const hops = [];
    list.forEach(s => { const to = cardOf(s.service); if (!to) return skipped++;
      const p = s.parent != null ? byId.get(String(s.parent)) : null, from = p && cardOf(p.service);
      if (!from || from === to) return; // a root span, a caller off the view, or work inside one card: no hop
      const r = lineBetween(from, to); if (!r) return skipped++; // a call the view draws no line for
      hops.push({ ...r, ids: edgeRefIds(geo.edges[r.i]), at: +s.start, dur: +s.end - +s.start, to, len: lenOf(r.pts) }); });
    const ctl = { hops: hops.length, skipped, done: new Promise(r => { done = r; }),
      pause() { if (t && trip === t) { t.paused = true; touch(); } }, resume() { if (t && trip === t) { t.paused = false; touch(); } },
      stop() { if (t && trip === t) endTrip(); else if (gen === replays) overlay('replay', null); } };
    const ms = msText, marks = {};
    // ponytail: two calls at once on one line share its mark; the one that ends first takes the glow off
    const show = (h, on) => { h.ids.forEach(x => { marks[x] = on ? { label: ms(h.dur), tone: 'accent', pulse: true } : { label: ms(h.dur) }; }); overlay('replay', { edges: { ...marks } }); };
    if (!hops.length || still()) { hops.forEach(h => show(h, false)); done(hops.length > 0); return ctl; }
    const t0 = Math.min(...list.map(s => +s.start)), k = (+o.duration || 6000) / Math.max(1e-6, Math.max(...list.map(s => +s.end)) - t0);
    hops.forEach(h => { h.start = (h.at - t0) * k; h.end = h.start + h.dur * k; h.travel = Math.min(1200, Math.max(350, h.dur * k)); });
    const total = Math.max(...hops.map(h => Math.max(h.end, h.start + h.travel)));
    const g = tripLayer();
    t = startTrip(now => { hops.forEach(h => {
      if (!h.on && now >= h.start) { h.on = true; show(h, true); g.insertAdjacentHTML('beforeend', '<circle r="4.5" class="tour-dot"/>'); h.dot = g.lastElementChild; }
      if (h.dot) { const f = (now - h.start) / h.travel; if (f >= 1) { h.dot.remove(); h.dot = null; flash(h.to); } else { const [x, y] = along(h.pts, f * h.len); h.dot.setAttribute('cx', x); h.dot.setAttribute('cy', y); } }
      if (h.on && !h.off && now >= h.end) { h.off = true; show(h, false); } });
      return now < total; }, played => { if (!played) overlay('replay', null); done(played); });
    t.dot = g; t.kind = 'replay'; touch();
    return ctl;
  }

  /* ---------- stories (#69): the model's narrated walk-throughs, played step by step ----------
     A step sets the whole picture: its view, camera, selection, highlight and caption (what it leaves out is cleared),
     then plays its tour. Playing goes on by itself after each step's duration; the caption bar and the keys (← → PageUp
     PageDown, Esc) step through and stop it. One story at a time.
     The player's state (0.14.0): entering a step (its view, camera, selection and highlight on their way), then playing or
     paused on it, until ended or stopped. A story event comes on each of these changes. The reader taking the map (a press,
     a key, a view or a selection the story didn't make) pauses it; a step lights its own layer, 'story'. */
  let story = null;
  const stepsOf = s => s && Array.isArray(s.steps) ? s.steps.filter(x => x && typeof x === 'object') : [];
  // the story event, on every change: a step entered, a pause or a resume (playing), the end (step null), destroy() too
  const storyEvent = st => emit('story', { story: st.s.id, step: story === st ? st.at : null, steps: st.steps.length, playing: story === st && !!st.auto }, dead);
  // a step's card or line: a string names a card of the view, else a line by its id (the drawn line that has it); an
  // object is a Ref already
  const stepRef = x => typeof x !== 'string' ? (x && typeof x === 'object' ? x : null) : geo.byId[x] ? nodeRef(x)
    : (e => e ? edgeRef(e) : null)(geo.edges.find(e => edgeRefIds(e).includes(x)));
  function stepLit(list) { // highlight: what it names, and every line between two cards it names
    const refs = [].concat(list || []).map(stepRef).filter(Boolean), ids = new Set(refs.filter(r => r.type === 'node').map(r => r.id));
    geo.edges.forEach(e => { if (ids.has(e.from) && ids.has(e.to)) refs.push(edgeRef(e)); });
    return refs.length ? refs : null;
  }
  function storyBar(st) {
    let bar = stage.querySelector('.um-story');
    if (!bar) {
      stage.insertAdjacentHTML('beforeend', `<div class="um-story" role="group"><div class="um-cap"><span class="um-st"></span><p></p></div><div class="um-sb">
        <button data-s="prev" title="Previous step (←)" aria-label="Previous step">‹</button><button data-s="play"></button><button data-s="next" title="Next step (→)"></button><button data-s="stop" title="Close (Esc)" aria-label="Close the story">✕</button></div></div>`);
      bar = stage.lastElementChild; clear = null; // the fit keeps the cards off the bar as it does off the controls
      bar.addEventListener('dblclick', e => e.stopPropagation()); // two quick clicks on › are two steps, not a zoom
      bar.addEventListener('click', e => { e.stopPropagation(); const s = story, b = e.target.closest('button'); if (!s || !b) return;
        ({ prev: () => stepStory(-1), next: () => stepStory(1), stop: () => stopStory(), play: () => s.auto ? s.ctl.pause() : s.ctl.resume() })[b.dataset.s](); });
    }
    const k = st.at, n = st.steps.length, b = s => bar.querySelector(`[data-s="${s}"]`);
    bar.setAttribute('aria-label', 'Story: ' + (st.s.title || st.s.id));
    bar.querySelector('.um-st').textContent = `${st.s.title || st.s.id} · ${k + 1} / ${n}`;
    bar.querySelector('p').textContent = (st.steps[k] || {}).caption || '';
    if (k <= 0) b('prev').setAttribute('aria-disabled', 'true'); else b('prev').removeAttribute('aria-disabled'); // off, and focusable still: a focused ‹ keeps the focus
    b('play').textContent = st.auto ? '❚❚' : '▶'; b('play').setAttribute('aria-label', st.auto ? 'Pause' : 'Play'); b('play').title = st.auto ? 'Pause' : 'Play';
    b('next').textContent = k + 1 < n ? '›' : '✓'; b('next').setAttribute('aria-label', k + 1 < n ? 'Next step' : 'Finish the story');
  }
  async function showStep(st, k) {
    const seq = ++st.seq, step = st.steps[k] || {}, live = () => story === st && st.seq === seq && !dead;
    st.at = k; st.phase = 'entering'; clearTimeout(st.timer); tour(null); storyBar(st);
    storyEvent(st); // before the step's own select and viewchange
    while (busy && live()) await new Promise(r => setTimeout(r, 30)); // a move the user started: let it land first
    if (!live()) return;
    if (step.view !== cur && ctx.V[step.view]) await go(step.view, { story: true });
    if (!live()) return;
    if (ctx.V[step.view] && step.view !== cur) { st.phase = 'left'; touch(); return; } // the reader went elsewhere on the way: the step waits, paused, for resume()
    if ((expanded[cur] || []).length) { expanded[cur] = []; update(current, false, true); } // a step sets the whole picture: what the reader unfolded here folds back first
    const c = step.camera && typeof step.camera === 'object' ? step.camera : null;
    const aim = () => { const n = c && c.card != null ? geo.byId[c.card] : null; // the step's camera, on the picture as it is now
      return n ? { cx: n.x + n.w / 2, cy: n.y + n.h / 2, k: +c.zoom || 1.5 }
        : c && Number.isFinite(+c.x) && Number.isFinite(+c.y) ? { cx: +c.x, cy: +c.y, k: +c.zoom || cam.s.k } : startView(); }; // 'fit', or none
    const moved = cam.animate(aim()); cam.touched = !!(c && (geo.byId[c.card] || Number.isFinite(+c.x)));
    select(step.select == null ? null : stepRef(step.select), { reveal: false, story: true });
    highlight(stepLit(step.highlight), 'story');
    say(`Step ${k + 1} of ${st.steps.length}${step.caption ? ': ' + step.caption : ''}`); // after select(), which says what it selected
    if (await moved === false && live() && st.taken !== seq) await cam.animate(aim()); // cut short, not by the reader (an update()): the step gets its framing still
    if (!live()) return;
    st.phase = 'shown'; touch();
    st.toured = step.tour ? tour(step.tour, {}, true) : Promise.resolve(true);
    arm(st);
  }
  function arm(st) { // playing: the next step once this one's duration is up and its tour has reached its end
    clearTimeout(st.timer);
    if (!st.auto || story !== st || st.phase !== 'shown' || paused) return; // entering: it arms once shown; the page's Pause: once it ends
    const seq = st.seq, dur = Math.max(500, +(st.steps[st.at] || {}).duration || 4000); // reading time: not cut by reduced motion
    Promise.all([st.toured, new Promise(r => { st.timer = later(r, dur); })]).then(() => { if (story === st && st.seq === seq && st.auto && !paused) stepStory(1); });
  }
  function pauseStory(st) { st.auto = false; st.held = true; clearTimeout(st.timer); storyBar(st); storyEvent(st); touch(); } // held: its step's tour waits too (startTrip)
  // the reader (or the host) took the map, by a press, a key, or a view or selection the story didn't make: a story playing waits
  function readerMoved() { const st = story; if (!st) return; st.taken = st.seq; if (st.auto) pauseStory(st); }
  stage.addEventListener('pointerdown', e => { if (!e.target.closest('.um-story')) readerMoved(); }, true); // not the bar's own buttons
  stage.addEventListener('wheel', e => { if (!ctrlWheel || e.ctrlKey || e.metaKey || stage.classList.contains('full')) readerMoved(); }, { capture: true, passive: true }); // a wheel that zooms (wheel: 'ctrl' leaves the rest to the page)
  function restory() { // update(): the story shown takes the model's steps, at the step it is on, or stops when the model has it no more
    const st = story; if (!st) return;
    const s = arrOf(current.stories).find(x => x && x.id === st.s.id), steps = stepsOf(s);
    if (!steps.length) return stopStory();
    const was = JSON.stringify(st.steps[st.at]), k = Math.min(st.at, steps.length - 1);
    st.s = s; st.steps = steps;
    if (st.phase !== 'left' && (k !== st.at || JSON.stringify(steps[k]) !== was)) showStep(st, k); // its step changed: shown again, as it is now
    else { st.at = k; storyBar(st); touch(); } // the same step (or one the reader left: the bar keeps within the model's steps)
  }
  function stepStory(d) {
    const st = story; if (!st) return;
    const k = st.at + d;
    if (k >= st.steps.length) return stopStory(true); // past the last step: the story has been told
    if (k >= 0) showStep(st, k);
  }
  function stopStory(told = false) {
    const st = story; if (!st) return;
    story = null; st.told = told; clearTimeout(st.timer); tour(null); highlight(null, 'story');
    const bar = stage.querySelector('.um-story');
    if (bar) { const back = bar.contains(root.activeElement); bar.remove(); clear = null; if (back && !dead) stage.focus({ preventScroll: true }); } // focus on the bar stays in the map
    if (!dead) say(told ? 'End of the story' : 'Story closed');
    storyEvent(st); touch(); // destroy() too: a listener hears the end
    st.end(told);
  }
  function storyKey(e) { // null: not a story's key; on the bar's own buttons, Enter and Space press them
    const k = e.key;
    if ((k === 'Enter' || k === ' ') && e.composedPath().some(x => x.classList && x.classList.contains('um-story'))) return false;
    const d = { ArrowLeft: -1, PageUp: -1, ArrowRight: 1, PageDown: 1 }[k];
    if (d) { stepStory(d); return true; }
    if (k === 'Escape') { stopStory(); return true; }
    return null;
  }
  function play(id, o = {}) {
    if (id == null) { stopStory(); return null; } // play(null): the story shown stops
    const s = arrOf(current.stories).find(x => x && x.id === id), steps = stepsOf(s);
    if (dead || !geo || !steps.length) return null; // a story the model lacks: the one shown plays on
    stopStory();
    let end; const st = { s, steps, at: -1, seq: 0, timer: 0, auto: o.auto !== false, phase: 'entering', told: false, toured: Promise.resolve(true), done: new Promise(r => { end = r; }) };
    st.end = end;
    st.ctl = { get story() { return st.s.id; }, get step() { return st.at; }, get steps() { return st.steps.length; }, get playing() { return st.auto && story === st; },
      get state() { return story !== st ? (st.told ? 'ended' : 'stopped') : st.phase === 'entering' ? 'entering' : st.auto ? 'playing' : 'paused'; },
      next() { if (story === st) stepStory(1); }, prev() { if (story === st) stepStory(-1); }, stop() { if (story === st) stopStory(); },
      pause() { if (story === st && st.auto) pauseStory(st); },
      resume() { if (story !== st || st.auto) return; st.auto = true; st.held = false; storyBar(st); storyEvent(st); touch(); if (st.phase === 'left') showStep(st, st.at); else arm(st); }, done: st.done };
    story = st;
    showStep(st, Math.max(0, Math.min(steps.length - 1, Math.floor(+o.step) || 0)));
    return st.ctl;
  }

  const inner = { ctx: () => ctx, geo: () => geo, cam: () => cam, svg: () => svg, stage, host, go, open, up, flash, setFlow, pause, key, startView, standalone, play,
    select, busy: () => busy, flowing: () => stage.classList.contains('flowing'), view: () => cur, unfold: gesture, lens: setLens,
    highlight, overlay, focus: focusMap, editable: !!E, shapes: () => shapesNow(), setShapes, override: () => shapesSet }; // a story's pointer is the pieces' own, from the story event (0.14.0)

  // the pieces a host asked for (#99): they follow the map's selection and views, and take their keys wherever the focus is
  // in the map (Enter and Space press their buttons; the map's other keys reach the canvas, as in the page)
  const frame = q('.um-frame'), pc = frame && pieces(() => inner, { tree: q('.outline'), legend: lg, panel: q('.panel') }, { frame, toggle: q('.um-navbtn'), layer: frame, status: tell || say });
  if (pc) {
    (subs.select ||= []).push(e => pc.select(e.target, e.targets)); (subs.viewchange ||= []).push(pc.unlight); (subs.story ||= []).push(pc.story);
    frame.addEventListener('keydown', e => { if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pc.key(e) || (!stage.contains(e.target) && e.key !== 'Enter' && e.key !== ' ' && key(e))) { e.preventDefault(); e.stopPropagation(); } });
    if (options.nav) { q('.um-navbtn').addEventListener('click', () => pc.setTree(!frame.classList.contains('tree-open'))); pc.setTree(ctx.views.length > 1); }
  }
  const motionOf = () => instant ? 'instant' : reducedMotion() ? 'reduced' : 'full';
  const shapesNow = () => cur ? noteFor(cur) : shapesSet || noteOf(ctx.D.shapes) || 'box';
  const camNow = () => { const r = (x, d) => Math.round(x * d) / d; return cam ? { x: r(cam.s.cx, 10), y: r(cam.s.cy, 10), zoom: r(cam.s.k, 1000) } : { x: 0, y: 0, zoom: 1 }; };
  function snapshot(event = false) { // MapState: built fresh on every read, frozen all the way down, plain JSON; event: the camera at rest
    const deep = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return Object.freeze(o); }, st = story, t = trip;
    return deep({ view: cur, navigating: nav ? nav.to : null, selection: picked(), expanded: [...(expanded[cur] || [])], lens: lensId, overlays: [...layers.keys()],
      story: st ? { id: st.s.id, step: st.at, steps: st.steps.length, playing: !!st.auto } : null, tour: !!(t && t.kind === 'tour'), replay: t && t.kind === 'replay' ? { playing: !t.paused } : null, paused: !!paused,
      camera: event && camRest ? { ...camRest } : camNow(), flow: stage.classList.contains('flowing'), shapes: shapesNow(), motion: motionOf(), gesture: gestureNow(), destroyed: dead });
  }
  const first = () => {
    if (dead) return;
    if (options.view != null && !ctx.V[options.view]) warn(`render(…, { view: "${options.view}" }): the model has no such view; it starts on ${ctx.rootId ? `"${ctx.rootId}"` : 'none'}`);
    if (!cam) { // a view shown already (a setView() before a deferred first draw) stays
      const v0 = ctx.V[options.view] ? options.view : ctx.rootId;
      mount(v0 ?? null); cam.set(startView()); cam.touched = false; // no views: the empty card, until an update() brings one
      if (v0 && options.select) select(options.select, { reveal: false });
    }
    if (cur && P.onReady) P.onReady();
  };
  if (P.defer) requestAnimationFrame(() => later(first, 16)); else first();
  camRest = camNow(); if (listensState()) lastState = snapshot(true); // the state event reports changes from here
  // the host's fonts may still be loading: measure again once they are in, and redraw
  if (measure && !own && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (dead || !current || typeof current !== 'object') return; measure = hostMeasure(host); update(current, true); });

  return {
    update: m => update(m),
    setView: id => go(id), // a Promise<boolean>: true once the view shows; false for a view the model lacks, a later request, or destroy()
    select: ref => { if (!dead) select(ref); },
    fit: () => { if (cam && !dead) { readerMoved(); cam.fit(); } }, // the host takes the camera: a story playing waits
    toSVG: (o = {}) => dead ? '' : standalone(o.scale ?? 1, o.view ?? cur, o.fontCSS),
    toPNG: (o = {}) => dead ? Promise.resolve(null) : pngOf(standalone(o.scale ?? 2, o.view ?? cur, o.fontCSS)),
    focus: ref => { if (!dead) focusMap(ref); },
    expand: id => setUnfold(id, true), // unfold a stacked card of the view shown in place (#71): true when it did
    collapse: id => setUnfold(id, false),
    get expanded() { return [...(expanded[cur] || [])]; },
    on(type, fn) { if (dead) return () => {}; if (type === 'state' && !listensState()) { camRest = camNow(); lastState = snapshot(true); } // a first state listener hears changes from now
      (subs[type] ||= []).push(fn); if (type === 'click') tabKeys();
      return () => { subs[type] = (subs[type] || []).filter(f => f !== fn); if (type === 'click' && !dead) tabKeys(); }; },
    get view() { return cur; },
    get selection() { return copyRef(sel); },
    get selected() { return picked(); },
    get state() { return snapshot(); }, // MapState (0.14.0): a fresh, frozen, JSON-serializable snapshot
    get navigating() { return nav ? nav.to : null; }, // the view a move is going to, while one is under way
    get destroyed() { return dead; },
    get flow() { return stage.classList.contains('flowing'); }, // the animated flow along lines (≋, F)
    set flow(on) { if (!dead) setFlow(!!on, false); }, // a host's choice, not the reader's: the page saves only ≋ and F
    get shapes() { return shapesNow(); }, // the notation the view shown is drawn in: 'box', 'c4' or 'uml' (0.15.0)
    set shapes(x) { setShapes(x); }, // every view in this one (null: each view's own); the cards are drawn again, nothing is laid out
    get motion() { return motionOf(); }, // 'instant' (the page's #check, #still, #shot), 'reduced' (the reader's setting), else 'full'
    get story() { return story ? story.ctl : null; }, // the player of the story shown (play()'s, the page menu's or a link's), else null
    overlay: (name, layer) => overlay(name, layer),
    highlight: (refs, options) => highlight(refs, (options && options.layer) || 'highlight'),
    lens: id => setLens(id), // one of the model's lenses on the map, or null for none (#94): false when the model has no such lens
    tour: (path, o) => tour(path, o),
    replay: (spans, o) => replay(spans, o),
    play: (id, o) => play(id, o),
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

/* ---------- paths(), reach(), describe() and otlpSpans(): a view's lines walked and put in words, with no DOM (#62, #64, #65) ----------
   A line runs from → to as the model gives it. Each result is a list of Refs a host can hand to highlight(); a line's Ref
   names one model edge (a drawn line that stands for several takes the strongest mark among them). */
function lineGraph(model, viewId) {
  const ctx = mapContext(model), v = ctx.V[viewId];
  if (!v) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  return { ctx, v, ids: (v.nodeIds || []).filter(i => ctx.N[i]), edges: ctx.viewEdges(v).filter(e => e.from !== e.to) };
}
const walkFrom = (edges, start, back) => { const seen = new Set([start]); // breadth first along lines (back: against them)
  for (let q = [start]; q.length;) { const u = q.shift(); edges.forEach(e => { const [a, b] = back ? [e.to, e.from] : [e.from, e.to]; if (a === u && !seen.has(b)) { seen.add(b); q.push(b); } }); }
  return seen; };

/** Every card and line on a path from one card to another, following lines forward: the cards both reachable from `from`
 *  and leading to `to`, and the lines between them. [] when no path joins them. */
export function paths(model, viewId, from, to) {
  const { ids, edges } = lineGraph(model, viewId);
  if (!ids.includes(from) || !ids.includes(to)) return [];
  const F = walkFrom(edges, from), B = walkFrom(edges, to, true), on = id => F.has(id) && B.has(id);
  if (!F.has(to)) return [];
  return [...ids.filter(on).map(id => ({ type: 'node', id, view: viewId })), ...edges.filter(e => on(e.from) && on(e.to)).map(e => ({ type: 'edge', ids: [e._id], view: viewId }))];
}

/** Everything a card's lines lead to (forward), or everything that leads to it (`backward`: for calls, who depends on it),
 *  each with its distance in lines; `depth` stops the walk that many lines out. The card itself is first, at 0. */
export function reach(model, viewId, from, options = {}) {
  const { ids, edges } = lineGraph(model, viewId), back = !!options.backward, depth = options.depth ?? Infinity;
  if (!ids.includes(from)) return [];
  const ends = e => back ? [e.to, e.from] : [e.from, e.to], dist = new Map([[from, 0]]);
  for (let q = [from]; q.length;) { const u = q.shift(), d = dist.get(u); if (d >= depth) continue;
    edges.forEach(e => { const [a, b] = ends(e); if (a === u && !dist.has(b)) { dist.set(b, d + 1); q.push(b); } }); }
  const near = (x, y) => x.distance - y.distance; // a stable sort: the view's order among equals
  return [...ids.filter(id => dist.has(id)).map(id => ({ type: 'node', id, view: viewId, distance: dist.get(id) })).sort(near),
    ...edges.filter(e => { const [a, b] = ends(e); return dist.has(a) && dist.has(b) && dist.get(a) < depth; })
      .map(e => ({ type: 'edge', ids: [e._id], view: viewId, distance: dist.get(ends(e)[0]) + 1 })).sort(near)];
}

/** A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do (in run order on a sequence
 *  view), and the cards with no line. The same model gives the same words: a text alternative, docs, or an AI's context. */
export function describe(model, viewId) {
  const { ctx, v, ids, edges } = lineGraph(model, viewId), boxes = (v.containers || []).filter(c => c && c.id);
  const name = id => ctx.N[id] ? ctx.nodeIn(id, viewId).label || id : (boxes.find(c => c.id === id) || {}).label || id;
  const list = xs => xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // a line's kind as its colour says it: the one it names, else a hook's line guards and a board's is state (no guesses from words)
  const kind = e => WIRE_KINDS.includes(e.kind) ? e.kind : (ctx.N[e.from] || {}).kind === 'hook' ? 'guard' : [e.from, e.to].some(i => (ctx.N[i] || {}).kind === 'board') ? 'state' : 'calls';
  const VERB = { calls: 'calls', feeds: 'feeds', triggers: 'triggers', state: 'reads or writes', guard: 'guards' };
  const what = e => { const t = [e.label && `"${e.label}"`, e.sublabel, v.render !== 'sequence' && e.step != null && `step ${e.step}`].filter(Boolean); return t.length ? ` (${t.join(', ')})` : ''; };
  const out = [`${v.title || v.id}: ${count(ids.length, 'card')} and ${count(edges.length, 'line')}.`];
  if (ids.length) out.push(`Cards: ${ids.map(id => `${name(id)} (${KIND[kindOf(ctx.nodeIn(id, viewId).kind, true)][1]})`).join(', ')}.`);
  boxes.forEach(c => { const ins = (c.nodeIds || []).filter(i => ids.includes(i)); if (ins.length) out.push(`${name(c.id)} holds ${list(ins.map(name))}.`); });
  if (v.render === 'sequence') edges.forEach((e, i) => out.push(`Step ${i + 1}: ${name(e.from)} ${VERB[kind(e)]} ${name(e.to)}${what(e)}.`));
  else [...ids, ...boxes.map(c => c.id)].forEach(id => { const outs = edges.filter(e => e.from === id); if (!outs.length) return;
    out.push(`${name(id)} ${[...new Set(outs.map(kind))].map(k => `${VERB[k]} ${list(outs.filter(e => kind(e) === k).map(e => name(e.to) + what(e)))}`).join('; ')}.`); });
  const alone = ids.filter(id => !edges.some(e => e.from === id || e.to === id));
  if (alone.length) out.push(`Not connected here: ${list(alone.map(name))}.`);
  return out.join('\n');
}

/** The spans of an OpenTelemetry trace exported as OTLP JSON, as replay() takes them: { id, parent, service, name, start,
 *  end }, times in milliseconds. */
export function otlpSpans(data) {
  const out = [], attr = (list, k) => { const v = ((list || []).find(a => a && a.key === k) || {}).value || {}; return v.stringValue ?? v.intValue ?? null; };
  ((data && data.resourceSpans) || []).forEach(rs => { const service = attr(rs.resource && rs.resource.attributes, 'service.name');
    (rs.scopeSpans || rs.instrumentationLibrarySpans || []).forEach(ss => (ss.spans || []).forEach(s => out.push({ id: s.spanId, parent: s.parentSpanId || null,
      service, name: s.name, start: Number(s.startTimeUnixNano) / 1e6, end: Number(s.endTimeUnixNano) / 1e6 }))); });
  return out;
}
// a service's card (#65, #96): the card `match` names, else the card with that id, else the one with that label (any case)
const cardMatcher = (cards, match) => { const m = match || {}, ids = new Set(cards.map(n => String(n.id))), low = x => String(x ?? '').trim().toLowerCase();
  return s => s == null ? null : Object.hasOwn(m, s) && m[s] != null ? (ids.has(String(m[s])) ? String(m[s]) : null)
    : ids.has(String(s)) ? String(s) : (n => n ? String(n.id) : null)(cards.find(n => low(n.label) === low(s))); };
// a duration in words, as replay() labels a line and a trace's view says a step's: "37 ms", "1.2 s"
const msText = x => x >= 1000 ? `${+(x / 1000).toFixed(x >= 1e4 ? 0 : 1)} s` : `${x >= 10 ? Math.round(x) : +x.toFixed(1)} ms`;

/** The path along a view's lines with the highest total of `by` (#95): `latency` (ms, the default) or `cost`, summed over
 *  its lines (a line without one counts 0). It starts at `from` and ends at `to`, either left out for any card, and never
 *  comes back to a card. { refs, total }: its cards in order, then its lines, as Refs for highlight(); no refs and 0 when
 *  no line leads from `from` (to `to`). */
export function critical(model, viewId, options = {}) {
  const { ids, edges } = lineGraph(model, viewId), by = options.by === 'cost' ? 'cost' : 'latency', { from, to } = options, none = { refs: [], total: 0 };
  if ((from != null && !ids.includes(from)) || (to != null && !ids.includes(to))) return none;
  const w = e => typeof e[by] === 'number' && e[by] > 0 ? e[by] : 0, path = [], on = new Set();
  let best = null;
  // ponytail: every path, depth first: exponential on a dense view with many ways between two cards; a longest-path pass
  // over the lines in run order (few loop back) if a map's size makes the page wait
  const walk = (u, sum) => { on.add(u);
    edges.forEach(e => { if (e.from !== u || on.has(e.to)) return;
      const s = sum + w(e); path.push(e);
      if ((to == null ? ids.includes(e.to) : e.to === to) && (!best || s > best.total)) best = { total: s, lines: [...path] };
      if (e.to !== to) walk(e.to, s);
      path.pop(); });
    on.delete(u); };
  (from != null ? [from] : ids).forEach(id => walk(id, 0));
  if (!best) return none;
  const cards = [best.lines[0].from, ...best.lines.map(e => e.to)].filter(id => ids.includes(id));
  return { refs: [...cards.map(id => ({ type: 'node', id, view: viewId })), ...best.lines.map(e => ({ type: 'edge', ids: [e._id], view: viewId }))],
    total: +best.total.toPrecision(12) };
}

/** What taking cards out would cost (#95), with the model left as it is: `unreachable`, what loses its way to them in the
 *  view (backward, as reach() finds it: for calls, what depends on them), each with its distance in lines from the nearest,
 *  the cards themselves at 0. No rule breaks: rules only forbid lines and cycles, which taking cards out never adds. */
export function whatIf(model, viewId, options = {}) {
  const gone = new Set([].concat(options.remove ?? []).map(String)), near = new Map();
  gone.forEach(id => reach(model, viewId, id, { backward: true }).forEach(r => { const k = r.type === 'node' ? r.id : '>' + r.ids[0];
    if (!near.has(k) || r.distance < near.get(k).distance) near.set(k, r); }));
  return { unreachable: [...near.values()].sort((a, b) => (a.type === 'edge') - (b.type === 'edge') || a.distance - b.distance) };
}

/** A trace kept as a numbered view (#96): `model` with a sequence view (`render: "sequence"`) made from `spans` (as
 *  otlpSpans() reads them). Each call from one card to another (a span and its parent's) is a step, in time order, its
 *  line labelled with the span's name and its duration under it. A span's service is a card as replay() matches it:
 *  through `match`, else by id, else by label (any case); a span with no card, or whose caller has none, is no step, and
 *  the view's caption names the services with no card. The view (`view`, default "trace"; `title`) takes the place of one
 *  with its id, else comes last, under the view that shows the most of its cards. The model passed in is not changed. */
export function sequenceFromTrace(model, spans, options = {}) {
  const out = structuredClone(model || {}), id = String(options.view ?? 'trace'), views = arrOf(out.views);
  const cards = [...arrOf(out.nodes), ...views.flatMap(v => arrOf(v && v.nodes))].filter(n => n && n.id != null);
  const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
  const span = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(cards, options.match), hops = [], lost = new Set();
  list.forEach(s => { const to = cardOf(s.service); if (!to) { if (s.service != null) lost.add(String(s.service)); return; }
    const p = s.parent != null ? span.get(String(s.parent)) : null, from = p && cardOf(p.service);
    if (from && from !== to) hops.push([from, to, s]); }); // a root span, a caller with no card, or work inside one card: no step
  hops.sort((a, b) => +a[2].start - +b[2].start); // stable: calls that start together keep the trace's order
  const nodeIds = [...new Set(hops.flatMap(([a, b]) => [a, b]))], n = hops.length, took = s => msText(+s.end - +s.start);
  const edges = hops.map(([from, to, s], i) => ({ id: `${id}-${i + 1}`, from, to, ...(s.name ? { label: String(s.name), sublabel: took(s) } : { label: took(s) }) }));
  const home = views.reduce((a, v) => { const k = v && v.id !== id ? nodeIds.filter(x => arrOf(v.nodeIds).includes(x)).length : 0; return k > a[1] ? [v.id, k] : a; }, [null, 0])[0];
  const view = { id, ...(home != null ? { parent: home } : {}), title: options.title || id,
    caption: `From a trace: ${n} call${n === 1 ? '' : 's'} between cards, in time order, each with its duration.${lost.size ? ` No card for ${andList([...lost])}.` : ''}`,
    render: 'sequence', lanes: false, nodeIds, edges };
  const at = views.findIndex(v => v && v.id === id);
  out.views = at < 0 ? [...views, view] : views.map((v, k) => k === at ? view : v);
  return out;
}

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

export function mountPage(container, model, options = {}) {
  const Q = options.params || new URLSearchParams();
  document.body.classList.add('map-mode');
  let { D, views, nodes, N, V, rootId, nodeIn: nodeIn0, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = mapContext(model);
  const nodeIn = (nid, vid = cur) => nodeIn0(nid, vid);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const modK = mac ? '⌘K' : 'Ctrl K';
  const HINT = hintHTML(modK);
  const ghost = [[10, 26, 22], [40, 18, 24], [40, 46, 24], [10, 60, 22], [70, 32, 20], [70, 70, 20]].map(([l, t, w]) => `<span style="left:${l}%;top:${t}%;width:${w}%"></span>`).join('');
  // the page's keys (0.14.0), in the order the key list (?) shows them: what to press and what it does, then, for the keys
  // the page reads itself, those keys and what they do; the rest are the map's own, which reach its canvas (the router)
  const KEYS = [
    ['/ or ' + modK, 'search nodes and views', ['/'], () => openPal()],
    ['Scroll · pinch', 'zoom (two-finger drag pans)'],
    ['Click', 'details below the map'],
    ['Double-click · Enter', 'open a stacked node ⤢'],
    ['E · Alt + click', 'unfold a stacked node here, or fold it back ⤡'],
    ['Esc · Backspace', 'close what is on top (a menu, the recorder, a story too), else clear the selection, else up one level', ['Escape', 'Backspace'], (e, inCanvas) => closeTop(e, inCanvas)],
    ['+ − 0 1', 'zoom in, out, fit, 100%'],
    ['← ↑ → ↓', 'pan'],
    ['[ ]', 'previous / next details tab', ['[', ']'], e => pc.key(e)],
    ['i', 'about this view', ['i', 'I'], () => togglePill()],
    ['O', 'views list', ['o', 'O'], e => pc.key(e)],
    ['F', 'flow on/off'],
    ['> <', 'light what a card leads to, what leads to it', ['>', '<'], e => pc.key(e)],
    ['Shift-click · P', 'light every path between two cards', ['p', 'P'], e => pc.key(e)],
    ['← → · PgUp PgDn', 'in a story: previous / next step'],
    ['?', 'these keys', ['?'], () => toggleHelp()],
  ];
  const ac = new AbortController(), signal = ac.signal; // the page's listeners on the document and window: destroy() takes them away

  const app = container; app.className = 'mapapp';
  app.innerHTML = `
    <header class="mbar">
      <button class="ibtn" id="m-outline" title="Views (O)" aria-label="Toggle the views list" aria-expanded="false">☰</button>
      <span class="mbrand"><i></i><span>${esc(D.title || 'Map')}</span></span>
      <nav class="crumbs" id="m-crumbs" aria-label="Breadcrumb"></nav>
      <button class="findbtn" id="m-find" type="button" aria-label="Search nodes and views (${modK})"><span aria-hidden="true">⌕</span><span class="ft">Find a node or view…</span><span class="kbd">${modK}</span></button>
      <button class="ibtn" id="m-theme" title="Light / dark" aria-label="Dark theme" aria-pressed="false">◐</button><button class="ibtn txt" id="m-shapes" type="button" title="Card shapes: box, c4 or uml">⬡<span class="lbl"></span></button>${(D.stories || []).length ? `
      <div class="menu"><button class="ibtn txt" id="m-stories" aria-haspopup="true" aria-expanded="false" title="Stories: walk-throughs of this map">▶<span class="lbl"> Stories</span></button>
        <div class="menu-pop" id="m-stories-pop" hidden>${D.stories.map(s => `<button data-story="${esc(s && s.id)}">${esc((s && (s.title || s.id)) || '')}</button>`).join('')}</div></div>` : ''}${arrOf(D.lenses).some(l => l && l.id) ? `
      <div class="menu"><button class="ibtn txt" id="m-lenses" aria-haspopup="true" aria-expanded="false" title="Lenses: ways to look at this map">◎<span class="lbl"> Lenses</span></button>
        <div class="menu-pop" id="m-lenses-pop" hidden>${D.lenses.filter(l => l && l.id).map(l => `<button data-lens="${esc(l.id)}" aria-pressed="false">${esc(l.title || l.id)}</button>`).join('')}<hr><button data-lens="" aria-pressed="true">No lens</button></div></div>` : ''}
      <div class="menu"><button class="pbtn" id="m-export" aria-haspopup="true" aria-expanded="false">Export ▾</button>
        <div class="menu-pop" id="m-export-pop" hidden><button data-x="svg">SVG · this view</button><button data-x="png">PNG · this view (2×)</button><button data-x="link">Copy link to view</button><hr><button data-x="json">Map model (JSON)</button><button data-x="record">Record a story…</button></div></div>
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
        <div class="hint" id="m-hint">${HINT}</div>
      </div>
      <aside class="panel" id="m-panel" aria-label="Node details" hidden></aside>
    </div>
    <div class="hpop" id="m-helpbox" role="dialog" aria-label="Keys" hidden><b>Keys</b>
      <dl>${KEYS.map(([k, d]) => `<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></div>
    <div class="scrim" id="m-pal" hidden><div class="pal" role="dialog" aria-label="Search">
      <div class="in"><span aria-hidden="true">⌕</span><input id="m-q" type="text" autocomplete="off" spellcheck="false" placeholder="Search nodes and views" aria-label="Search nodes and views" aria-controls="m-res"><span class="kbd">esc</span></div>
      <div class="res" id="m-res" role="listbox"></div>
      <div class="pft"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div></div>`;
  const $ = id => document.getElementById(id);
  const stage = $('m-stage'), panel = $('m-panel');
  let X = null, cam = null, geo = null, svg = null, cur = null, sel = null, stack = [], paused = false;
  const status = hinter($('m-hint'), HINT);
  // the views list, the legend and the details panel (#99): the same pieces render() draws for a host
  const pc = pieces(() => X, { tree: $('m-tree'), legend: $('m-legend'), panel }, { page: true, frame: document.body, toggle: $('m-outline'), layer: document.body, status });

  function renderChrome() {
    const v = V[cur];
    $('m-crumbs').innerHTML = stack.map((id, i) => i === stack.length - 1
      ? `<span class="crumb cur" aria-current="page">${esc(V[id].title || id)}</span>`
      : `<button class="crumb" data-v="${esc(id)}">${esc(shortT(V[id].title || id))}</button><span class="crumb-sep">›</span>`).join('');
    const parent = stack.length > 1 ? stack[stack.length - 2] : v.parent;
    renderPill(parent); pc.chrome();
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
  const setTree = pc.setTree;

  /* the link (0.14.0): one place writes it, from what the map shows: its view, card, story step and lens, and the reader
     copy and theme the page was opened with (the theme as it is now, after ◐ too). A new view is a new entry,
     written once the move lands; anything else rewrites the entry. Nothing is written while a link is being followed */
  function write(push = false) {
    if (!X || linking || handle.destroyed) return;
    const p = new URLSearchParams(); p.set('view', cur); if (sel) p.set('node', sel);
    if (told) { p.set('story', told.id); p.set('step', told.step + 1); } // the story shown, at its step (#69)
    if (lensOn) p.set('lens', lensOn); // the lens on the map (#94)
    if (X.override()) p.set('shapes', X.override()); // the notation a reader or the link picked (0.15.0)
    if (Q.get('theme')) p.set('theme', document.documentElement.dataset.theme || Q.get('theme'));
    if (Q.get('reader')) p.set('reader', Q.get('reader')); // check, shot and still describe one run: never in the link a reader shares (issue 136)
    const h = '#' + p.toString();
    if (location.hash !== h) window.history[push ? 'pushState' : 'replaceState'](null, '', h); // window's: history() is this module's undo helper
  }
  /* following a link, on load and on Back, Forward or an edited link: its lens, view, story step and card, applied in that
     order. Once the map has settled, the page writes the link it shows: what the model lacks is corrected, and the hint
     line says so. A move the reader starts meanwhile wins, as a move of the reader's own (a new entry) */
  let linking = null, follows = 0; // linking: { view } while a link is followed: the view it goes to, whose arrival writes no entry
  const idle = () => new Promise(r => { const t = () => X.busy() ? setTimeout(t, 30) : r(); t(); }); // once no move is under way
  async function follow(load = false) {
    const p = new URLSearchParams(location.hash.slice(1)), my = ++follows, lacks = [], stories = arrOf(D.stories);
    if (noteOf(p.get('shapes')) && noteOf(p.get('shapes')) !== handle.shapes) handle.shapes = p.get('shapes'); // the link's card shapes (0.15.0)
    else if (p.get('shapes') && !noteOf(p.get('shapes'))) lacks.push(`no card shapes “${p.get('shapes')}”`);
    const lens = p.get('lens') || null, sid = p.get('story'), at = Math.max(1, Math.floor(+p.get('step')) || 1) - 1;
    const def = sid ? stories.find(s => s && s.id === sid) : null, steps = def ? arrOf(def.steps).filter(s => s && typeof s === 'object') : [], step = steps[Math.min(at, steps.length - 1)];
    linking = { view: null };
    if (lens !== lensOn && !X.lens(lens)) lacks.push(`no lens “${lens}”`);
    if (sid && !step) lacks.push(`no story “${sid}”`); else if (sid && at >= steps.length) lacks.push(`no step ${at + 1} in “${sid}”`);
    const shown = handle.state.story, k = Math.min(at, steps.length - 1), played = !!step && (!shown || shown.id !== sid || shown.step !== k);
    const v = played ? step.view : p.get('view') || rootId; // a step to show: its own view, gone to first so the step moves nothing
    if (!V[v]) lacks.push(`no view “${v}”`);
    else if (v !== cur || X.busy()) { linking.view = v; const ok = await X.go(v); if (my !== follows) return; if (!ok || !linking) { linking = null; return; } } // the reader's own move won: its landing writes its own entry
    if (played) { handle.play(sid, { step: k, auto: false }); await idle(); if (my !== follows || !linking) return; } // the story at the link's step, shown and not playing on
    else if (!step && shown) handle.play(null); // a link with no story: the one shown stops
    if (!played) { // the link's card, unless a step just chose the selection
      const node = p.get('node') || (load && Q.get('shot') && cur !== rootId ? subjectOf(V[cur]) || (V[cur].nodeIds || [])[0] : null);
      if (node) { if (node !== sel && !X.select({ type: 'node', id: node }, { reveal: !load })) lacks.push(`no card “${node}” here`); }
      else if (handle.selection) X.select(null);
    }
    linking = null; write();
    if (lacks.length) status('Link corrected: ' + lacks.join('; '), 5000);
  }
  const go = (vid, how = {}) => X.go(vid, how);
  const open = nid => X.open(nid), up = () => X.up();
  const findNode = pc.find;

  /* events */
  stage.addEventListener('click', e => {
    if (e.target.closest('#m-pillbtn')) return togglePill();
    const bv = e.target.closest('.vpop [data-v]'); if (bv) return go(bv.dataset.v);
  });
  const setFlow = on => X.setFlow(on);
  const toggleHelp = force => { const on = force ?? $('m-helpbox').hidden; $('m-helpbox').hidden = !on; $('m-help').setAttribute('aria-expanded', on); if (on) openMenu(null); };
  /* the header's menus, Export, Stories and Lenses (0.14.0): one open at a time, or none. back: focus goes back to the
     button of the menu that closes (Esc) */
  let menuOn = null;
  function openMenu(name, back = false) {
    const was = menuOn; menuOn = name && $(`m-${name}-pop`) ? name : null;
    ['export', 'stories', 'lenses'].forEach(n => { const p = $(`m-${n}-pop`); if (!p) return; p.hidden = n !== menuOn; $(`m-${n}`).setAttribute('aria-expanded', n === menuOn); });
    if (menuOn) toggleHelp(false);
    if (back && was && !menuOn) $(`m-${was}`).focus();
  }
  ['export', 'stories', 'lenses'].forEach(n => { const b = $(`m-${n}`); if (b) b.addEventListener('click', () => openMenu(menuOn === n ? null : n)); });
  document.addEventListener('click', e => {
    const t = e.target, at = s => t.closest && t.closest(s);
    if (!at('.menu')) openMenu(null);
    if (!at('#m-helpbox, #m-help')) toggleHelp(false);
    const cv = at('#m-crumbs [data-v]'); if (cv) { if (innerWidth <= 820) setTree(false); go(cv.dataset.v); }
  }, { signal });
  $('m-outline').addEventListener('click', () => setTree(!document.body.classList.contains('tree-open')));
  if (innerWidth > 1180 && views.length > 1) setTree(true);
  // the views list, open over the map on a phone's width, closes when the window narrows to it: it would cover the map
  let narrow = innerWidth <= 820;
  addEventListener('resize', () => { const n = innerWidth <= 820; if (n && !narrow) setTree(false); narrow = n; }, { signal });
  $('m-help').addEventListener('click', () => toggleHelp());
  const themed = () => $('m-theme').setAttribute('aria-pressed', (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'); // ◐ says which theme is on (issue 135)
  themed(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themed, { signal }); // the system's theme, when the page sets none
  $('m-theme').addEventListener('click', () => { toggleTheme(); themed(); write(); }); // a link that names the theme names the one shown
  $('m-pause').addEventListener('click', e => { paused = !paused; const b = e.currentTarget, l = paused ? 'Play' : 'Pause'; X.pause(paused); b.setAttribute('aria-pressed', paused); b.title = l; b.setAttribute('aria-label', l); b.textContent = paused ? '▶' : '❚❚'; });
  $('m-export-pop').addEventListener('click', e => { const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; openMenu(null); exportView(x); });

  /* stories (#69): the Stories menu plays one; the link names the story and step shown, in the entry of the step's own view
     (0.14.0); Export ▸ Record a story… */
  let told = null; // { id, step }: the story on the map and its step, from the story event
  const stepView = t => { const s = arrOf(D.stories).find(x => x && x.id === t.id), st = s && arrOf(s.steps).filter(x => x && typeof x === 'object')[t.step]; return st ? st.view : null; };
  if ($('m-stories-pop')) $('m-stories-pop').addEventListener('click', e => { const b = e.target.closest('[data-story]'); if (!b) return; openMenu(null); handle.play(b.dataset.story); });
  /* lenses (#94): the Lenses menu puts one on the map; the lens event (the menu's, the handle's, a link's) names it on the
     menu's button and in the link (#lens=<id>) */
  let lensOn = null;
  const lensesPop = $('m-lenses-pop');
  function showLens() {
    if (!lensesPop) return;
    const L = arrOf(D.lenses).find(x => x && x.id === lensOn);
    lensesPop.querySelectorAll('[data-lens]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lens === (lensOn || '')));
    $('m-lenses').innerHTML = `◎<span class="lbl"> ${esc(L ? L.title || L.id : 'Lenses')}</span>`;
  }
  if (lensesPop) lensesPop.addEventListener('click', e => { const b = e.target.closest('[data-lens]'); if (!b) return; openMenu(null);
    if (X.lens(b.dataset.lens || null)) { const L = arrOf(D.lenses).find(x => x && x.id === lensOn); status(L ? 'Lens: ' + (L.title || L.id) : 'No lens'); } });
  // a story recorded from the page: each view and card the reader comes to is a step (Add step: as the camera is now too);
  // captions are typed in, and Save writes the story's JSON, for the model's `stories`. Not while a story is shown: its
  // steps are not the reader's. Esc closes it (when it is on top); Close, Esc and leaving the page ask first while it holds
  // steps not saved (0.14.0)
  let rec = null;
  const unsaved = () => !!rec && (rec.steps.length > 1 || rec.steps.some(s => s.caption)) && rec.json() !== rec.saved;
  const leaving = e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } };
  function closeRec() { // false: the reader kept it
    if (!rec || (unsaved() && !confirm(`Close the recorder? Its ${rec.steps.length} steps are not saved.`))) return false;
    clearTimeout(rec.t); rec = null; $('m-rec').remove(); removeEventListener('beforeunload', leaving); return true;
  }
  function record() {
    if (rec) return;
    stage.insertAdjacentHTML('beforeend', `<div class="m-rec" id="m-rec" role="region" aria-label="Recording a story">
      <div class="t"><b>● Recording a story</b><span id="m-rec-n"></span></div>
      <input id="m-rec-title" type="text" aria-label="Story title" placeholder="Story title" value="${esc((D.title || 'Map') + ': a walk-through')}">
      <ol id="m-rec-list"></ol>
      <div class="b"><button type="button" data-r="add">Add step</button><button type="button" data-r="save">Save JSON</button><button type="button" data-r="close">Close</button></div></div>`);
    const box = $('m-rec'), same = (a, b) => JSON.stringify([a.view, a.select, a.camera]) === JSON.stringify([b.view, b.select, b.camera]);
    rec = { steps: [], t: 0, saved: null };
    const story = () => { const title = $('m-rec-title').value.trim() || 'A walk-through', id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story';
      return { id, title, steps: rec.steps.map(({ caption, ...s }) => caption ? { view: s.view, caption, ...s } : s) }; };
    rec.json = () => JSON.stringify(story());
    addEventListener('beforeunload', leaving);
    const draw = () => { $('m-rec-n').textContent = rec.steps.length === 1 ? '1 step' : rec.steps.length + ' steps'; box.querySelector('[data-r="save"]').disabled = !rec.steps.length; // nothing to save: a story needs steps
      $('m-rec-list').innerHTML = rec.steps.map((s, i) => `<li><span>${esc(shortT((V[s.view] || {}).title || s.view))}${s.select ? ' · ' + esc(nodeIn(s.select, s.view).label || s.select) : ''}${s.camera ? ' · zoomed' : ''}</span>
        <input type="text" data-i="${i}" aria-label="Caption of step ${i + 1}" placeholder="Caption" value="${esc(s.caption)}"><button type="button" data-del="${i}" aria-label="Remove step ${i + 1}">✕</button></li>`).join(''); };
    rec.take = force => { // the map as it is: its view, selected card and, once moved by hand, its camera
      const c = X.cam(), s = { view: cur, caption: '' }, last = rec.steps[rec.steps.length - 1];
      if (sel) s.select = sel;
      if (c.touched) s.camera = { x: Math.round(c.s.cx), y: Math.round(c.s.cy), zoom: +c.s.k.toFixed(2) };
      if (force || !last || !same(last, s)) { rec.steps.push(s); draw(); }
    };
    box.addEventListener('input', e => { const i = e.target.dataset.i; if (i != null) rec.steps[+i].caption = e.target.value; });
    box.addEventListener('click', e => {
      const r = e.target.closest('[data-r]')?.dataset.r, del = e.target.closest('[data-del]');
      if (del) { rec.steps.splice(+del.dataset.del, 1); draw(); }
      else if (r === 'add') rec.take(true);
      else if (r === 'save' && rec.steps.length) {
        const st = story(); rec.saved = JSON.stringify(st);
        download(st.id + '.story.json', new Blob([JSON.stringify(st, null, 2) + '\n'], { type: 'application/json' }));
        status('Saved: add it to the model\'s "stories"', 4000);
      } else if (r === 'close') closeRec();
    });
    rec.take();
  }
  const recordSoon = () => { if (rec && !handle.story) { clearTimeout(rec.t); rec.t = setTimeout(() => rec && !handle.story && rec.take(), 650); } }; // once the camera has landed; not a story's steps

  /* ⌘K command box: nodes and views, Enter jumps. Indexed from the model shown, as an update() leaves it (issue 133) */
  const nodeIdx = () => nodes.map(n => ({ n, hay: [n.label, n.id, (n.verbs || []).join(' '), n.what, n.kind, n.author, ((D.authors || {})[n.author] || {}).name, n.origin].join(' ').toLowerCase() }));
  const viewIdx = () => views.map(v => ({ v, hay: [v.title, v.id, v.caption].join(' ').toLowerCase() }));
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
      const ns = nodeIdx().filter(x => words.every(w => x.hay.includes(w))).sort((a, b) => starts(a.n.label) - starts(b.n.label) || (geo.byId[b.n.id] ? 1 : 0) - (geo.byId[a.n.id] ? 1 : 0)).slice(0, 7).map(x => ({ t: 'n', n: x.n }));
      const vs = viewIdx().filter(x => words.every(w => x.hay.includes(w))).slice(0, 5).map(x => ({ t: 'v', v: x.v }));
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
  let palBack = null; // where focus was before search opened: Esc gives it back
  const openPal = () => { toggleHelp(false); openMenu(null); palBack = document.activeElement; pal.hidden = false; q.value = ''; hi = 0; drawHits(); q.focus(); };
  const closePal = (back = false) => { pal.hidden = true; q.blur(); if (back && palBack && palBack.isConnected && palBack !== document.body) palBack.focus(); palBack = null; };
  const pickHit = h => { if (!h) return; closePal(); if (h.t === 'n') findNode(h.n.id); else go(h.v.id); };
  q.addEventListener('input', () => { hi = 0; drawHits(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { hi = Math.min(hits.length - 1, hi + 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'Enter') { pickHit(hits[hi]); e.preventDefault(); }
    else if (e.key === 'Escape') { closePal(true); e.preventDefault(); }
    e.stopPropagation();
  });
  res.addEventListener('click', e => { const f = e.target.closest('[data-fill]'); if (f) { q.value = f.dataset.fill; hi = 0; drawHits(); q.focus(); return; } const b = e.target.closest('[data-i]'); if (b) pickHit(hits[+b.dataset.i]); });
  res.addEventListener('pointermove', e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== hi) { hi = +b.dataset.i; res.querySelectorAll('.fr').forEach(x => { const on = +x.dataset.i === hi; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); } });
  pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
  $('m-find').addEventListener('click', openPal);

  /* keyboard (0.14.0): one router, which reads each key from the top open layer down (an example shown full size, search,
     the key list, a menu, the view's popover, the story recorder, a story, then the map) and the KEYS table. Enter, Space
     and arrows aimed at a control outside the map are that control's own; the map's keys reach its canvas from anywhere
     else on the page */
  const layer = () => pc.modal() ? 'lightbox' : !pal.hidden ? 'search' : !$('m-helpbox').hidden ? 'help' : menuOn ? 'menu'
    : $('m-vpop') && !$('m-vpop').hidden ? 'pill' : rec ? 'recorder' : told ? 'story' : 'map';
  function closeTop(e, inCanvas) { // Esc and Backspace: the top open layer closes; else the map's own: the selection clears, then up a level
    const top = layer();
    if (top === 'search') closePal(true);
    else if (top === 'help') toggleHelp(false);
    else if (top === 'menu') openMenu(null, true);
    else if (top === 'pill') togglePill(false);
    else if (top === 'recorder') closeRec(); // asking first when it holds steps not saved
    else if (top === 'story') handle.play(null); // Backspace too
    else return !inCanvas && X.key(e); // in the canvas, the canvas takes its own
  }
  const CONTROL = 'a[href], button, input, select, textarea, summary, [contenteditable], [role=button], [role=tab], [role=option], [tabindex]:not([tabindex="-1"])';
  document.addEventListener('keydown', e => {
    if (!X) return;
    const k = e.key, t = e.target, top = layer(), own = () => { e.preventDefault(); e.stopPropagation(); };
    if (top === 'lightbox') { if (pc.key(e)) own(); return; } // it holds every key while open: Esc closes it, Tab keeps to it, Enter and Space press its buttons
    if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) { own(); return top === 'search' ? closePal(true) : openPal(); }
    if (e.metaKey || e.ctrlKey || e.altKey || (t && t.matches && t.matches('input, textarea, select, [contenteditable]'))) return; // the browser's own shortcuts; typing
    const inCanvas = e.composedPath().includes(X.stage), row = KEYS.find(r => r[2] && r[2].includes(k));
    if (top === 'search' && k !== 'Escape' && k !== 'Backspace') return; // search covers the map: its field and hits take their own keys
    if (row) { if (row[3](e, inCanvas) !== false) own(); return; }
    if (inCanvas || (t && t.closest && t.closest(CONTROL) && /^(Enter| |Arrow|Page|Home|End)/.test(k))) return; // the canvas's own keys; a control's own
    if (X.key(e)) own(); // the map's keys, from anywhere else on the page
  }, { capture: true, signal });
  addEventListener('popstate', () => follow(), { signal }); // Back, Forward, or an edited link

  /* export: resolve CSS variables into attributes so the file stands alone */
  const standalone = scale => X.standalone(scale);
  if (Q.get('still')) { const sv = Q.get('still'), sc = +(Q.get('scale') || 2);
    const tick = async () => { if (!geo) return setTimeout(tick, 100);
      if (!V[sv]) return document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, error: `the model has no view "${sv}"` })); // an answer, not a wait: no still comes
      if (cur !== sv) { await go(sv, {}); return setTimeout(tick, 200); }
      X.stage.querySelectorAll('.flowline').forEach(e => e.remove()); const out = standalone(sc), b = geo.bounds; document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, w: Math.ceil(b.w * sc), h: Math.ceil(b.h * sc) }));
      document.body.innerHTML = '<div id="still">' + out + '</div>'; document.body.style.margin = '0'; };
    setTimeout(tick, 300); }
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportView(x) {
    if (x === 'record') return record();
    const stem = (D.slug || D.title || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + cur.replace(/[^a-z0-9]+/gi, '-');
    if (x === 'svg') download(stem + '.svg', new Blob([standalone(1)], { type: 'image/svg+xml' }));
    else if (x === 'png') {
      pngOf(standalone(2)).then(bl => bl && download(stem + '.png', bl));
    } else if (x === 'link') { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => status('Link copied'), () => status(location.href)); }
    else if (x === 'json') { const { meta, kind, ...model } = D; download(stem.split('-' + cur)[0] + '.json', new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })); }
    if (x !== 'link') status('Exported ' + x.toUpperCase());
  }


  let flowPref = null; try { flowPref = reducedMotion() ? null : localStorage.getItem('visual-flow'); } catch (_) {} // the reader's ≋ and F; under reduced motion no flow is drawn
  const p0 = new URLSearchParams(location.hash.slice(1));
  const v0 = V[p0.get('view')] ? p0.get('view') : rootId;
  const shapesKey = 'visual-shapes:' + location.pathname; // the reader's notation, kept for this page (0.15.0)
  const shapes0 = noteOf(p0.get('shapes')) || (() => { try { return noteOf(localStorage.getItem(shapesKey)); } catch (_) { return null; } })() || noteOf(options.shapes);
  const handle = render($('m-canvas'), model, {
    view: v0, minimap: true, flow: flowPref ? flowPref === '1' : undefined, shapes: shapes0 || undefined,
    on: { story: e => { told = e.step == null ? null : { id: e.story, step: e.step }; app.classList.toggle('story', !!told); pc.story(e);
      const sv = told && stepView(told); if (X && !X.busy() && (!sv || sv === cur || !V[sv])) write(); } }, // a step on another view: in that view's entry, once it shows (#69)
    _page: {
      instant: options.instant, defer: !options.instant, tour: !(Q.get('still') || Q.get('pdf')), openHint: !Q.get('reader'), kinds: true, status, tourAt: Q.get('shot') ? Q.get('at') : null,
      wide: () => innerWidth > 820,
      upTarget: () => stack.length > 1 ? stack[stack.length - 2] : (V[cur] || {}).parent,
      inset: () => { const top = Math.max(58, 26 + $('m-vpill').offsetHeight); if (innerWidth <= 820) return { t: top, r: 12, b: 12, l: 12 }; const lg = $('m-legend'), on = lg && !lg.hidden; // the legend box sits bottom left
        return [{ t: top, r: 20, b: 40 + (on ? lg.offsetHeight + 8 : 0), l: 20 }, { t: top, r: 20, b: 40, l: 20 + (on ? lg.offsetWidth + 8 : 0) }]; },
      onNavigate: (vid, prev, mode) => { togglePill(false);
        if (stack.includes(vid)) stack = stack.slice(0, stack.indexOf(vid) + 1); else if (mode === 'in' && prev) stack = [...stack, vid]; else stack = chain(vid); },
      onMount: inner => { X = inner; ({ D, views, nodes, N, V, rootId, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = X.ctx()); nodeIn0 = X.ctx().nodeIn;
        cam = X.cam(); geo = X.geo(); svg = X.svg(); cur = X.view(); if (paused) X.pause(true);
        if (!stack.length || !stack.includes(cur)) stack = chain(cur);
        renderChrome(); },
      onBackground: () => togglePill(false),
      onFlow: on => { try { localStorage.setItem('visual-flow', on ? '1' : '0'); } catch (_) {} },
      onReady: () => { $('m-ghosts').remove(); queueMicrotask(() => follow(true)); }, // the link it opened with: its card, story step and lens (#69, #94), once the page listens
    },
  });
  const destroy0 = handle.destroy;
  handle.destroy = () => { ac.abort(); if (rec) clearTimeout(rec.t); destroy0(); }; // the page's listeners go with the map
  handle.on('select', ({ target, targets }) => { sel = target && target.type === 'node' ? target.id : null; pc.select(target, targets); if (!X.busy()) write(); recordSoon(); }); // mid-move: the view's entry, once it lands
  handle.on('viewchange', e => { pc.unlight(); recordSoon();
    if (linking && linking.view === e.view) return; // a link's own move: its entry, written once the link has settled
    linking = null; write(true); }); // a new view, a new entry (a move the reader started while a link was followed, too)
  handle.on('lens', e => { lensOn = e.lens; showLens(); write(); });
  // the header's card shapes (0.15.0): box, c4 and uml in turn, for every view; the page keeps the reader's choice
  const showShapes = () => { const b = $('m-shapes'), n = handle.shapes, next = NOTATIONS[(NOTATIONS.indexOf(n) + 1) % NOTATIONS.length];
    b.querySelector('.lbl').textContent = ' ' + n; b.setAttribute('aria-label', `Card shapes: ${n}. Show them as ${next}`); };
  $('m-shapes').addEventListener('click', () => { const next = NOTATIONS[(NOTATIONS.indexOf(handle.shapes) + 1) % NOTATIONS.length];
    handle.shapes = next; try { localStorage.setItem(shapesKey, next); } catch (_) {} showShapes(); write(); status(`Card shapes: ${next}`); });
  handle.on('state', e => { if (e.changed.includes('shapes')) showShapes(); });
  showShapes();
  // #pdf=1 (umlimator.py pdf, #93): the page becomes a document for Chrome to print (printDoc), once the fonts are in,
  // after the map's own redraw for them
  if (Q.get('pdf')) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => printDoc(X, model, Q));
  return handle;
}

/* #pdf=1[&views=a,pic-*][&paper=letter] (umlimator.py pdf): the map as a document to hand in for a review, laid out here a
   page at a time, as Chrome's own page breaks can't be read back for the contents. Each sheet is one page: @page sets the
   paper (A4 or US Letter, across) and its margins, and each sheet ends in the title and "page N of M".
   - The cover: the title, the date, the model's file, a summary line and the contents, each view with its page.
   - Each view, from a page of its own: a header (the view's path and its caption), its picture (toSVG()'s, in vectors)
     as large as the page allows and never larger than drawn, the legend of what it draws, then tables of its cards,
     lines and boxes. They fill two columns below the picture, or one column beside a picture too tall to leave room
     below. A table that runs out of room goes on in the next column, under its heading and header row again; a row is
     never cut, and a heading never ends a column.
   - The rules, when the model has any: each holding or broken in the views printed, and what breaks it. */
function printDoc(X, model, Q) {
  const { D, views, V, N, chain, nodeIn, viewEdges, geoCache } = X.ctx();
  const only = (Q.get('views') || '').split(',').filter(Boolean), want = v => !only.length || only.some(p => p.endsWith('*') ? v.id.startsWith(p.slice(0, -1)) : v.id === p);
  const shown = views.filter(want).map(v => [v, X.standalone(1, v.id)]).filter(([, s]) => s), on = new Set(shown.map(([v]) => v.id));
  const rs = shown.length ? arrOf(model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles)) : []; // as rules() reads them; none without a view
  const broken = rules(model).filter(b => on.has(b.view)); // judged in the views printed, as the document says
  const [pw, ph] = Q.get('paper') === 'letter' ? [279.4, 215.9] : [297, 210], title = esc(D.title || 'Map'); // the paper across, in mm
  const count = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`, T = v => esc(v.title || v.id), full = c => Object.assign(c, { full: true });
  const cards = v => arrOf(v.nodeIds).filter(i => N[i]), lines = v => viewEdges(v).filter(e => e.from !== e.to), boxes = v => arrOf(v.containers).filter(c => c && c.id); // as describe() reads a view
  const name = (v, id) => esc(N[id] ? nodeIn(id, v.id).label || id : (boxes(v).find(c => c.id === id) || {}).label || id);
  document.title = D.title || 'Map'; document.body.removeAttribute('class');
  document.body.innerHTML = `<style>@page { size: ${pw}mm ${ph}mm; margin: 11mm 13mm 9mm; background: var(--um-bg); }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: var(--um-bg); } body { margin: 0; background-image: none; }
    #um-pdf { color: var(--um-text); font: 8.5pt/1.4 var(--um-sans); font-variant-numeric: tabular-nums; }
    #um-pdf .sheet { width: ${pw - 26}mm; height: ${ph - 20.5}mm; padding: 0; display: flex; flex-direction: column; overflow: hidden; break-after: page; }
    #um-pdf .sheet:last-child { break-after: auto; }
    #um-pdf header { display: flex; align-items: baseline; justify-content: space-between; gap: 16pt; padding-bottom: 5pt; border-bottom: .75pt solid var(--um-border-2); }
    #um-pdf h1 { font-size: 26pt; line-height: 1.12; letter-spacing: -.02em; font-weight: 700; margin: 0 0 10pt; }
    #um-pdf h2, #um-pdf .h2 { display: block; font: 650 14pt/1.25 var(--um-sans); letter-spacing: -.01em; text-transform: none; color: var(--um-text); margin: 0; }
    #um-pdf h2::after { content: none; } #um-pdf .up { color: var(--um-muted); font-weight: 450; }
    #um-pdf .meta { color: var(--um-muted); font-size: 8pt; white-space: nowrap; } #um-pdf .cap { color: var(--um-muted); font-size: 9pt; margin: 4pt 0 0; }
    #um-pdf .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; margin-top: 8pt; } #um-pdf .body.side { flex-direction: row; gap: 16pt; }
    #um-pdf figure { flex: none; align-self: center; margin: 0; border: 1px solid var(--um-border); border-radius: 4pt; overflow: hidden; }
    #um-pdf .side figure { align-self: flex-start; } #um-pdf figure svg { display: block; }
    #um-pdf .lg { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 3pt 14pt; font-size: 7.5pt; } #um-pdf .lg > b { font-weight: 650; }
    #um-pdf .side .lg { margin-bottom: 10pt; }
    #um-pdf .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); gap: 18pt; }
    #um-pdf .col { min-height: 0; overflow: hidden; } #um-pdf .blk + .blk { margin-top: 10pt; }
    #um-pdf .h3 { font-size: 9pt; font-weight: 650; margin: 0 0 3pt; } #um-pdf .h3 span { color: var(--um-muted); font-weight: 450; }
    #um-pdf table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; line-height: 1.35; }
    #um-pdf th { text-align: left; font-size: 7pt; font-weight: 600; color: var(--um-muted); padding: 0 6pt 2.5pt 0; border-bottom: .75pt solid var(--um-border-2); }
    #um-pdf td { vertical-align: top; padding: 2.5pt 6pt 2.5pt 0; border-bottom: .5pt solid var(--um-border); overflow-wrap: anywhere; }
    #um-pdf td b { font-weight: 600; } #um-pdf td small { display: block; color: var(--um-muted); font: 7pt/1.3 var(--um-mono); }
    #um-pdf td p { margin: 0; } #um-pdf td ul { margin: 0; padding-left: 10pt; }
    #um-pdf td i { display: inline-block; font-style: normal; margin-right: 4pt; } #um-pdf i.sw { width: 8pt; height: 6pt; border: 1pt solid; border-radius: 1.5pt; }
    #um-pdf i.w { width: 10pt; border-top: 1.5pt solid; vertical-align: middle; }
    #um-pdf i.num { min-width: 10pt; height: 10pt; padding: 0 2pt; border-radius: 5pt; background: var(--um-text); color: var(--um-bg); font: 700 6.5pt/10pt var(--um-sans); text-align: center; }
    #um-pdf .cards th:nth-child(1), #um-pdf .boxes th:nth-child(1) { width: 32%; } #um-pdf .cards th:nth-child(2) { width: 20%; }
    #um-pdf .lines th.n { width: 6%; } #um-pdf .lines th:nth-last-child(3) { width: 42%; } #um-pdf .lines th:last-child { width: 24%; }
    #um-pdf .rules th:nth-child(1) { width: 30%; } #um-pdf .rules th:nth-child(2) { width: 24%; } #um-pdf .rules th:nth-child(3) { width: 10%; }
    #um-pdf .ok { color: var(--um-green); font-weight: 650; } #um-pdf .no { color: var(--um-rose); font-weight: 650; }
    #um-pdf .cover .body { flex-direction: row; gap: 28pt; margin-top: 0; } #um-pdf .cover .ttl { flex: 0 0 40%; padding-top: 34mm; } #um-pdf .cover .cols { padding-top: 34mm; }
    #um-pdf .sum { font-size: 10pt; margin: 6pt 0 0; } #um-pdf .toc td { padding: 4pt 6pt 4pt 0; } #um-pdf .toc td.pg { width: 3em; padding-right: 0; text-align: right; }
    #um-pdf .toc td span { display: block; color: var(--um-muted); font-size: 7.5pt; }
    #um-pdf footer { display: flex; justify-content: space-between; margin-top: 6pt; padding: 5pt 0 0; border-top: .5pt solid var(--um-border); color: var(--um-dim); font: 7pt var(--um-sans); }</style><main id="um-pdf"></main>`;
  const doc = document.getElementById('um-pdf');
  // a sheet: its header, the body its content fills, and its footer (`key` names the view or section it starts)
  const sheet = (head, key = '') => { doc.insertAdjacentHTML('beforeend', `<section class="sheet" data-key="${key}">${head}<div class="body"></div><footer><span>${title}</span><span class="pn"></span></footer></section>`);
    return doc.lastElementChild.querySelector('.body'); };
  const cols = (body, n) => { body.insertAdjacentHTML('beforeend', `<div class="cols" style="--n:${n}">${'<div class="col"></div>'.repeat(n)}</div>`); return [...body.lastElementChild.children]; };
  // tables into columns, next() handing out the next column (null: no more, and pour() says false). A table after the
  // first starts a column of its own while its page has one left. It starts with its heading, header row and first two
  // rows (its only one), else in the next column; a row that does not fit goes on, whole, in the next, never the last one
  // alone. A column handed out fresh on a page of its own (`full`) takes a table's start whatever its size.
  const pour = (next, blocks) => { let box = next();
    const over = () => box.lastElementChild.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom - 2, fresh = () => !box.firstElementChild;
    for (const [n, b] of blocks.entries()) { let tb = null;
      if (n && !fresh() && next.spare()) box = next();
      const open = (i, k, force) => { box.insertAdjacentHTML('beforeend', `<div class="blk">${b.title ? `<div class="h3">${b.title}${i ? ' <span>(continued)</span>' : ''}</div>` : ''}<table class="${b.cls}">${b.head ? `<thead><tr>${b.head}</tr></thead>` : ''}<tbody>${b.rows.slice(i, i + k).join('')}</tbody></table></div>`);
        if (force || !over()) return box.lastElementChild.querySelector('tbody'); box.lastElementChild.remove(); };
      for (let i = 0; i < b.rows.length;) {
        if (!tb) { const k = Math.min(2, b.rows.length - i);
          while (!(tb = open(i, k)) && !(fresh() && box.full)) if (!(box = next())) return false;
          tb ||= open(i, 1) || open(i, 1, true); // ponytail: a row taller than a page is cut at its foot
          i += tb.rows.length; continue; }
        tb.insertAdjacentHTML('beforeend', b.rows[i]);
        if (!over()) { i++; continue; }
        tb.lastElementChild.remove();
        if (i === b.rows.length - 1 && tb.rows.length > 2) { tb.lastElementChild.remove(); i--; }
        if (!(box = next())) return false; tb = null;
      } }
    return true; };
  // the columns of a page, then (paging) of as many pages as it takes, or (no `head`) none more
  const paging = (head, n, first) => { const q = [...first], f = () => q.shift() || (head ? (q.push(...cols(sheet(head(true)), n).map(full)), q.shift()) : null);
    f.spare = () => q.length > 0; return f; };

  // the cover, and its contents: a view's caption under its title, indented under the views printed that hold it
  const day = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const sum = [count(shown.length, 'view'), count(new Set(shown.flatMap(([v]) => cards(v))).size, 'card'), count(new Set(shown.flatMap(([v]) => lines(v).map(e => e._id))).size, 'line'), ...(rs.length ? [count(rs.length, 'rule')] : [])];
  const cover = sheet('', 'cover'); cover.parentNode.classList.add('cover');
  cover.insertAdjacentHTML('beforeend', `<div class="ttl"><h1>${title}</h1><p class="cap">${day}${D.source ? ` · <span class="mono">${esc(D.source)}</span>` : ''}</p><p class="sum">${sum.join(' · ')}</p></div>`);
  pour(paging(() => '<header><div class="h2">Contents <span class="up">(continued)</span></div></header>', 2, cols(cover, 1)), [{ title: 'Contents', cls: 'toc', rows: [
    ...shown.map(([v], i) => `<tr><td style="padding-left:${chain(v.id).slice(0, -1).filter(id => on.has(id)).length * 12}pt">${T(v)}${v.caption ? `<span>${esc(v.caption)}</span>` : ''}</td><td class="pg" data-pg="${i}"></td></tr>`),
    ...(rs.length ? ['<tr><td>Rules</td><td class="pg" data-pg="rules"></td></tr>'] : [])] }]);

  shown.forEach(([v, svg], vi) => {
    const g = geoCache[v.id].g, ids = cards(v), es = lines(v), seq = v.render === 'sequence', stepped = es.some(e => e.step != null), at = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    const wk = new Map(g.edges.flatMap(d => edgeRefIds(d).map(id => [id, d.wk]))), held = boxes(v).map(c => [c, arrOf(c.nodeIds).filter(i => ids.includes(i))]).filter(([, ins]) => ins.length);
    const up = chain(v.id).slice(0, -1).map(id => `<span class="up">${T(V[id])} › </span>`).join('');
    const head = more => `<header>${more ? `<div class="h2">${up}${T(v)} <span class="up">(continued)</span></div>` : `<h2>${up}${T(v)}</h2>`}<span class="meta">${[count(ids.length, 'card'), count(es.length, 'line'), ...(held.length ? [count(held.length, 'box', 'boxes')] : [])].join(' · ')}</span></header>${!more && v.caption ? `<p class="cap">${esc(v.caption)}</p>` : ''}`;
    const body = sheet(head(false), vi);
    body.insertAdjacentHTML('beforeend', `<figure>${svg}</figure><div class="lg"><b>Legend</b>${legendItems([g], 'opens a view of its own', [geoCache[v.id].shapes], D.icons).join('')}</div>`);
    // the picture as large as the page allows, never larger than drawn: below it the legend, then two columns of tables;
    // one too tall for that keeps the page's height, with the legend and one column beside it. Smaller (down to 70%, and
    // to a scale of 0.6 at least) when that keeps the tables on its page; else they go on over the next pages.
    const fig = body.firstElementChild, lg = fig.nextElementSibling, s = fig.firstElementChild, b = s.viewBox.baseVal, W = body.clientWidth - 2, H = body.clientHeight - 2, SIDE = 340;
    let k = Math.min(1, W / b.width, (H - lg.offsetHeight - 16) / b.height); const side = b.width * k <= W - SIDE;
    if (side) k = Math.min(1, H / b.height, (W - SIDE) / b.width);
    body.classList.toggle('side', side);
    const lay = (f, more) => { s.setAttribute('width', b.width * k * f); s.setAttribute('height', b.height * k * f); body.querySelector('.cols')?.remove();
      const first = cols(body, side ? 1 : 2); if (side) first[0].append(lg); return pour(paging(more && head, 2, first), tables); };
    const tables = [
      { title: `Cards <span>${ids.length}</span>`, cls: 'cards', head: '<th>Card</th><th>Kind</th><th>What it is</th>', rows: ids.map(id => { const c = nodeIn(id, v.id), t = KIND[kindOf(c.kind, true)], d = at[id] || {}, sub = c.sublabel ?? c.sub;
        return `<tr><td>${d.step ? `<i class="num">${esc(d.step)}</i>` : ''}<b>${esc(c.label || id)}</b>${d.kids || d.opens ? ' ⤢' : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</td>`
          + `<td><i class="sw" style="border-color:var(--um-${t[0]});background:var(--um-${t[0]}-f)"></i>${t[1]}</td><td>${c.what ? md(c.what) : ''}</td></tr>`; }) },
      { title: `Lines <span>${es.length}</span>`, cls: 'lines', head: `${seq || stepped ? '<th class="n">#</th>' : ''}<th>From → to</th><th>Label</th><th>Technology</th>`, rows: (stepped && !seq ? [...es].sort((a, b) => stepOrder(a.step, b.step)) : es).map((e, i) => { const w = wk.get(e._id) || 'calls';
        return `<tr>${seq ? `<td>${i + 1}</td>` : stepped ? `<td>${esc(e.step ?? '')}</td>` : ''}<td><i class="w" style="border-color:var(--um-w-${w})"></i>${name(v, e.from)} → ${name(v, e.to)}</td><td>${e.label ? esc(e.label) : `<span class="up">${w}</span>`}</td><td>${esc(e.sublabel || '')}</td></tr>`; }) },
      { title: `Boxes <span>${held.length}</span>`, cls: 'boxes', head: '<th>Box</th><th>Holds</th>', rows: held.map(([c, ins]) => `<tr><td><b>${esc(c.label || c.id)}</b></td><td>${andList(ins.map(i => name(v, i)))}</td></tr>`) },
    ].filter(x => x.rows.length);
    [1, .9, .8, .7].some(f => k * f >= Math.min(k, .6) && lay(f)) || lay(1, true);
  });

  if (rs.length) { // the rules: where rules() judges each (a rule that names boxes, in the views that draw one; `views` narrows it)
    // ponytail: rules()' own scope, again; one helper for both if it changes
    const anyBox = new Set(views.flatMap(v => boxes(v).map(c => c.id))), printed = shown.map(([v]) => v);
    const where = r => { const named = [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]));
      const vs = printed.filter(v => (!Array.isArray(r.views) || r.views.includes(v.id)) && (!named.length || boxes(v).some(c => named.includes(c.id))));
      return vs.length === printed.length ? 'every view printed' : vs.length ? vs.map(T).join(', ') : 'no view printed'; };
    const said = (x, r) => x.message.slice(`view ${x.view}: `.length).replace(`, which breaks rule "${r.title || r.id}"`, '').replace(` breaks rule "${r.title || r.id}"`, '').replace(/^edge /, ''); // its message's words: A→B, or the boxes in a cycle
    const head = more => `<header>${more ? '<div class="h2">Rules <span class="up">(continued)</span></div>' : '<h2>Rules</h2>'}<span class="meta">${count(rs.length, 'rule')} · ${new Set(broken.map(x => x.rule)).size} broken</span></header>${more ? '' : '<p class="cap">Judged in the views printed here.</p>'}`;
    pour(paging(head, 1, cols(sheet(head(false), 'rules'), 1).map(full)), [{ cls: 'rules', head: '<th>Rule</th><th>Applies in</th><th>State</th><th>Lines that break it</th>', rows: rs.map(r => { const bs = broken.filter(x => x.rule === r.id);
      return `<tr><td><b>${esc(r.title || r.id)}</b></td><td>${where(r)}</td><td class="${bs.length ? 'no' : 'ok'}">${bs.length ? 'broken' : 'holds'}</td><td>${bs.map(x => `<div>${T(V[x.view])}: ${esc(said(x, r))}</div>`).join('') || '<span class="up">none</span>'}</td></tr>`; }) }]);
  }
  const all = [...doc.children]; // the pages, numbered, and the contents' page of each view
  all.forEach((p, i) => { p.querySelector('.pn').textContent = `page ${i + 1} of ${all.length}`; });
  doc.querySelectorAll('[data-pg]').forEach(td => { td.textContent = all.findIndex(p => p.dataset.key === td.dataset.pg) + 1; });
}

/* ================= the standalone page's pieces (#99): views list, legend, hint line, details panel =================
   mountPage draws all four in its page; render() draws those a host asks for (nav, legend, hints, details) around its
   canvas, in its shadow root. The hint line is hintHTML() and hinter(); pieces() draws the others from the map and acts
   on it. X() is render()'s inner handle; el: the views list's, legend's and details panel's elements (null: not drawn);
   o.page: the standalone page, which keeps the reader's choices in localStorage; o.frame takes the class tree-open while
   the views list is open, and o.toggle says so; o.layer holds an example's lightbox; o.status(text, ms) says what happened. */
const shortT = t => String(t || '').split(' · ')[0];
const hintHTML = (keys, ctrl) => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches ? '<span>pinch = zoom</span><span>drag = move</span><span>tap = details</span>'
  : `<span>${ctrl ? 'Ctrl + scroll' : 'scroll'} = zoom</span><span>drag = move</span><span>double-click ⤢ = open</span>${keys ? `<span>${keys} = search</span><span>? = keys</span>` : ''}`; // keys: the page's search key; ctrl: wheel 'ctrl'
function hinter(el, html) { // messages are said in a live region of their own, apart from the key hints (issue 134)
  let t; const live = document.createElement('div'); live.className = 'um-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); el.after(live);
  return (s, ms = 1800) => { el.textContent = live.textContent = s; el.classList.add('msg'); clearTimeout(t); t = setTimeout(() => { el.innerHTML = html; el.classList.remove('msg'); }, ms); }; }

// Pull concise points from captured prose; retain wording and keep the full point in its tooltip. A point is a sentence
// or a clause; one longer than a line (160 characters) is cut in two, but a short sentence stays whole (#97).
function detailBullets(body) {
  const normalized = String(body || '').replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '').replace(/\n+/g, ' ').trim();
  let parts = normalized.split(/(?<=[.!?])\s+(?=[A-Z`/])|;\s+|\s+[·|]\s+/).filter(Boolean);
  while (parts.some(p => p.length > 160) && parts.length < 4) {
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

// what each shape stands for, in a legend (0.15.0)
const SHAPE_SAYS = { person: ['Person', 'someone who uses it'], browser: ['Browser app', 'runs in a web browser'], mobile: ['Mobile app', 'runs on a phone'],
  cylinder: ['Data store', 'a database or a store'], pipe: ['Queue', 'hands work on, in order'], document: ['File', 'a document or a config'],
  hexagon: ['Hexagon', 'a guard or a service'], robot: ['Agent', 'an AI agent'], terminal: ['Command line', 'a CLI or a script'],
  window: ['Desktop app', 'runs in a window'], folder: ['Package', 'a module or a folder of code'], node: ['Host', 'a machine or runtime it runs on'],
  component: ['Component', 'a part that runs (UML)'] };
const swatchOf = (sh, k, c, f, dashed) => { const n = { x: 0, y: 0, w: 100, h: 64 }, S = SHAPE[sh]; // a legend's key: the card's outline, small
  return `<svg class="lgs" viewBox="-4 -4 108 72" aria-hidden="true"><path d="${S.out(n)}" fill="${f}" stroke="${c}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${S.det ? S.det(n, c, k) : ''}</svg>`; };
function legendItems(gs, opens = 'double-click to open', notes = [], icons = {}) { // what these pictures draw, each with what it means: the view's legend, and the PDF's (#93). notes: each picture's notation (0.15.0)
  const ns = gs.flatMap(g => g.nodes), es = gs.flatMap(g => g.edges), used = [...new Set(ns.map(n => n.k))];
  // each card as its picture's notation draws it: its shape, its dash and its mark (the legend draws what the map draws)
  const cards = gs.flatMap((g, i) => { const nt = g.map ? noteOf(notes[i]) || 'box' : 'box';
    return g.nodes.map(n => { const sh = shapeOf(n, nt), I = (icons || {})[n.icon]; // an icon the table lacks leaves the card the component mark, as svgOf draws it
      return { k: n.k, sh, dash: nt !== 'box' && n.k === 'external', comp: nt === 'uml' && sh === 'box' && !(I && (I.src || I.g)) && !String(n.k).startsWith('m-') }; }); });
  const kindShape = k => { const s = [...new Set(cards.filter(d => d.k === k).map(d => d.sh))]; return s.length === 1 && s[0] !== 'box' && !(k === 'm-hook' && s[0] === 'hexagon') ? s[0] : null; };
  const dashOf = k => k === 'm-ext' || cards.some(d => d.k === k && d.dash); // an external card is dashed only where it is drawn so
  const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script', 'frontend', 'backend', 'ai', 'queue', 'database', 'security', 'cloud', 'external', 'file'];
  const shape = k => k === 'm-verb' ? 'p' : dashOf(k) ? 'd' : k === 'm-hook' ? 'h' : '';
  const kinds = order.filter(k => used.includes(k)), own = new Set(kinds.map(kindShape).filter(Boolean)), tone = k => `var(--um-${KIND[k][0]})`;
  // a shape the kinds' keys don't show already: in a neutral outline, as colour is the kinds' (and UML's component mark)
  const shapes = SHAPE_NAMES.filter(sh => sh !== 'box' && !own.has(sh) && cards.some(d => d.sh === sh && !(sh === 'hexagon' && d.k === 'm-hook')))
    .map(sh => `<span class="lgi" title="${esc(SHAPE_SAYS[sh].join(' — '))}">${swatchOf(sh, 'file', 'var(--um-muted)', 'var(--um-panel)')}<b>${SHAPE_SAYS[sh][0]}</b><span>${SHAPE_SAYS[sh][1]}</span></span>`)
    .concat(cards.some(d => d.comp) ? [`<span class="lgi" title="${esc(SHAPE_SAYS.component.join(' — '))}"><svg class="lgs" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="var(--um-muted)" stroke-linecap="round" stroke-linejoin="round">${SIGIL.component}</g></svg><b>${SHAPE_SAYS.component[0]}</b><span>${SHAPE_SAYS.component[1]}</span></span>`] : []);
  return kinds.map(k => `<span class="lgi" title="${esc(KIND[k][1] + ' — ' + KIND[k][2])}">${kindShape(k) ? swatchOf(kindShape(k), k, tone(k), `var(--um-${KIND[k][0]}-f)`, dashOf(k)) : `<i class="${shape(k)}" style="border-color:${tone(k)};background:var(--um-${KIND[k][0]}-f)${k === 'm-hook' ? `;background:${tone(k)}` : ''}"></i>`}<b>${KIND[k][1]}</b><span>${KIND[k][2]}</span></span>`)
    .concat(shapes)
    .concat(ns.some(n => n.kids || n.opens) ? [`<span class="lgi"><i class="s"></i><b>⤢ Stacked</b><span>${opens}</span></span>`] : [])
    .concat(ns.some(n => n.step) ? ['<span class="lgi"><i class="num">1</i><b>Step</b><span>run order</span></span>'] : [])
    .concat(ns.some(n => n.tag) ? ['<span class="lgi"><i class="tag"></i><b>@author</b><span>who wrote it</span></span>'] : [])
    .concat(WIRES.filter(w => es.some(e => e.wk === w[0])).map(w => `<span class="lgi"><i class="w" style="border-color:var(--um-w-${w[0]})"></i><b>${w[1]}</b><span>${w[2]}</span></span>`))
    .concat(es.some(e => e.back) ? ['<span class="lgi"><i class="w dash" style="border-color:var(--um-w-calls)"></i><b>loops back</b><span>the one line that runs right to left</span></span>'] : []);
}

function pieces(X, el, o) {
  const kept = k => { try { return o.page ? localStorage.getItem(k) : null; } catch (_) { return null; } };
  const keep = (k, v) => { try { if (o.page) localStorage.setItem(k, v); } catch (_) {} };
  // want: the tab the reader chose, kept; tab: the one shown, which is want when the card has it (0.14.0)
  let sel = null, picked = [], lit = null, lb = null, lbBack = null, folded = kept('visual-legend') === '0', want = kept('visual-tab') || 'when', tab = want, TABS = ['when', 'what', 'how', 'links'];
  let told = null; // the story's step shown: { id, step, pointer: the card its own select names, pending: that select is still to come }

  /* the legend: the kinds of cards and lines the view draws, in a box that folds away */
  function legend() {
    const items = legendItems([X().geo()], undefined, [X().shapes ? X().shapes() : 'box'], X().ctx().D.icons), back = el.legend.contains(el.legend.getRootNode().activeElement);
    el.legend.hidden = !items.length;
    el.legend.classList.toggle('folded', folded);
    el.legend.innerHTML = `<div class="t"><span>LEGEND</span><button type="button" id="m-lfold" aria-label="${folded ? 'Show' : 'Hide'} legend" aria-expanded="${!folded}">${folded ? '+' : '–'}</button></div>${items.join('')}`;
    if (back) el.legend.querySelector('#m-lfold').focus(); // a fold by keyboard keeps focus on the button
  }
  /* the views list: readable columns; a declared order may include shortcuts to descendants */
  function tree() {
    const { views, V, kidsOf, chain } = X().ctx(), cur = X().view(), ch = chain(cur);
    const roots = views.filter(x => !x.parent), cols = roots.length > 1 ? [{ head: 'Map', items: roots, on: ch[0] }] : [];
    ch.forEach((id, i) => { const order = V[id].browserOrder || [], k = [...new Set([...order, ...kidsOf(id).map(v => v.id)])].map(id => V[id]).filter(Boolean); if (k.length) cols.push({ head: shortT(V[id].title || id), items: k, on: ch[i + 1] }); });
    o.frame.style.setProperty('--browser-width', Math.min(448, Math.max(1, cols.length) * 224) + 'px');
    el.tree.innerHTML = `<div class="miller">${cols.map(c => `<div class="mcol"><div class="mch" title="${esc(c.head)}">${esc(c.head)}</div>${c.items.map(x => { const n = kidsOf(x.id).length;
      return `<button class="mit${x.id === cur ? ' on' : x.id === c.on ? ' path' : ''}" data-v="${esc(x.id)}" title="${esc(x.title || x.id)}"${x.id === cur ? ' aria-current="page"' : ''}><span>${esc(shortT(x.title || x.id))}</span><em>${(x.nodeIds || []).length}${n ? ' ›' : ''}</em></button>`; }).join('')}</div>`).join('')}</div>`;
    const m = el.tree.firstChild, last = m.lastElementChild; m.style.scrollBehavior = 'auto'; m.scrollLeft = last ? Math.max(0, last.offsetLeft + last.offsetWidth - m.clientWidth) : 0; m.style.scrollBehavior = '';
  }
  const setTree = on => { o.frame.classList.toggle('tree-open', on); if (o.toggle) o.toggle.setAttribute('aria-expanded', on); };

  /* the details panel: header, actions and tabs of the selected card */
  function relRows(list, dir) {
    const { N } = X().ctx();
    if (!list.length) return `<div class="rel-none">${dir === 'up' ? 'Nothing calls this here' : 'Calls nothing here'}</div>`;
    return '<ul class="relation-list">' + list.map(({ e, id, inView }) => { const o = N[id] || { label: id, kind: '' }, k = kindOf(o.kind, true);
      return `<li><button class="rel" data-n="${esc(id)}" title="${esc((e.when ? e.when + ' — ' : '') + (inView ? 'Select' : 'Find in another view'))}"><i style="background:var(--um-${KIND[k][0]})"></i><span class="rel-l">${esc(o.label)}</span>
        <span class="rel-e">${e.step != null ? esc(e.step) + ' · ' : ''}${esc(e.label || '')}${inView ? '' : ' ↗'}</span></button></li>`; }).join('') + '</ul>';
  }
  const authorChip = login => { const A = (X().ctx().D.authors || {})[login] || {};
    return `<a class="author" href="${esc(A.url || 'https://github.com/' + login)}" target="_blank" rel="noopener">${A.avatar ? `<img src="${A.avatar}" alt="">` : `<i>${esc(login.slice(0, 2).toUpperCase())}</i>`}<span>${esc(A.name || login)} <b>@${esc(login)}</b></span></a>`; };
  const focused = () => { const a = el.panel.getRootNode().activeElement; return a && el.panel.contains(a) ? a : null; };
  function show(nid) {
    const { D, N, V, nodeIn, opensOf, kidCount, unfoldable, viewsWith, viewEdges } = X().ctx(), geo = X().geo(), cur = X().view(), panel = el.panel;
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
    const n = nodeIn(nid, cur), k = kindOf(n.kind, true), c = `var(--um-${KIND[k][0]})`, pub = k === 'm-public', ext = k === 'm-ext';
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
    const child = opensOf(nid, cur), later = !o.page && child && !V[child], count = V[child] ? (V[child].nodeIds || []).length : kidCount(nid, cur); // later: a view the host loads when asked (#47)
    const vIn = viewsWith(nid).filter(v => v.id !== cur);
    const by = n.author ? `<span>·</span>${authorChip(n.author)}` : ext ? '<span class="origin">· author unknown</span>' : '';
    const exs = Array.isArray(n.examples) ? n.examples.filter(x => x && (x.thumb || x.href)) : [];
    const tabs = [['when', 'When to use'], ['what', 'What it is'], ['how', 'How it works'], ...(exs.length ? [['examples', 'Example']] : []), ['links', 'Behind the scenes']];
    TABS = tabs.map(t => t[0]);
    tab = TABS.includes(want) ? want : 'when'; // a card without the chosen tab shows its first; the choice stays for the next card
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
    const was = focused(), on = was && [...was.attributes].find(a => a.name.startsWith('data-')); // a panel drawn again keeps focus on the control it was on
    panel.innerHTML = `<div class="ph" style="--c:${c}">
        ${(() => { const I = (D.icons || {})[n.icon];
  return I && I.src ? `<span class="big logo${I.dark ? ' dark' : ''}" aria-hidden="true"><img src="${I.src}" width="22" height="22" alt=""></span>`
  : `<span class="big" style="background:${c}" aria-hidden="true"><svg viewBox="0 0 ${I && I.g ? 24 : 16} ${I && I.g ? 24 : 16}" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${I && I.g ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round">${I && I.g ? I.g : SIGIL[k]}</svg></span>`; })()}
        <div class="pt"><h3>${esc(n.label || nid)}</h3><small><span>${esc(KIND[k][1])}</span><span class="vis ${pub ? 'pub' : ext ? 'ext' : ''}">${badgesOf(n).length ? badgesOf(n).map(b => esc(b.text.toUpperCase())).join(' · ') : pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>${by}${n.origin ? `<span class="origin">${esc(n.origin)}</span>` : ''}</small></div>
        <div class="acts">${V[child] || later ? `<button class="obtn" data-open="${esc(nid)}" style="--c:${c}">⤢ Open ${esc(shortT(V[child] ? V[child].title || child : child))} <span>${V[child] || count ? count + ' nodes · ' : ''}Enter</span></button>` : ''}${!X().editable && (unfoldable(nid, cur) || later) ? `<button class="obtn" data-unfold="${esc(nid)}" style="--c:${c}">⤡ Unfold here <span>E</span></button>` : ''}${litButtons()}<button class="ibtn x" data-close title="Close (Esc)" aria-label="Close details">×</button></div>
      </div>
      <div class="ptabs"><div class="ptablist" role="tablist" aria-label="Details">${tabs.map(t => `<button class="ptab" role="tab" id="pt-${t[0]}" data-tab="${t[0]}" aria-selected="${t[0] === tab}" aria-controls="m-pbody">${t[1]}${t[2] != null ? `<em>${t[2]}</em>` : ''}</button>`).join('')}</div>
        <span class="pnav"><button class="ibtn sm" data-step="-1" title="Previous ([)" aria-label="Previous tab">‹</button><button class="ibtn sm" data-step="1" title="Next (])" aria-label="Next tab">›</button></span></div>
      <div class="pbody" id="m-pbody" role="tabpanel" aria-labelledby="pt-${tab}">${bodies[tab]}</div>`;
    panel.hidden = false;
    panel.dataset.node = nid;
    panel.querySelectorAll('.clamp').forEach(el => { if (el.scrollHeight > el.clientHeight + 2) el.insertAdjacentHTML('afterend', '<button class="morebtn" data-more>Show all</button>'); });
    if (was) ((on && [...panel.querySelectorAll(`[${on.name}]`)].find(x => x.getAttribute(on.name) === on.value)) || panel.querySelector('[aria-selected="true"]')).focus();
  }
  function hide() { const back = focused(); el.panel.hidden = true; if (back) queueMicrotask(() => { if (el.panel.hidden) X().focus(); }); } // a panel that closes gives focus back to the map
  function openExample(nid, i, from = null) { // from: the control that opened it, which focus goes back to
    const x = ((X().ctx().nodeIn(nid, X().view()) || {}).examples || [])[i]; if (!x) return;
    if (!lb) { lb = h(`<div class="lightbox" id="m-lightbox" role="dialog" aria-modal="true" aria-label="Example" hidden></div>`); o.layer.appendChild(lb);
      lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('[data-lbclose]')) closeExample(); }); }
    lb.innerHTML = `<figure><img src="${esc(x.full || x.thumb)}" alt="${esc(x.title || '')}"><figcaption><span>${inline(x.title || '')}</span>${x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}<button class="ibtn" data-lbclose title="Close (Esc)" aria-label="Close">×</button></figcaption></figure>`;
    lbBack = from; lb.hidden = false; lb.querySelector('[data-lbclose]').focus();
  }
  const closeExample = () => { if (!lb || lb.hidden) return; lb.hidden = true; // focus goes back where it came from: the thumbnail, else the panel's, else the map
    const to = lbBack && lbBack.isConnected ? lbBack : !el.panel.hidden && el.panel.querySelector('[data-ex]'); lbBack = null; if (to) to.focus(); else X().focus(); };
  const setTab = t => { want = tab = t; keep('visual-tab', t); if (sel && !el.panel.hidden) show(sel); };

  /* paths and reach (#64): lit on the map from the details panel or by key, and said in the hint line (a live region); a
     new selection or view clears them, and the same key again does */
  const cardName = id => X().ctx().nodeIn(id, X().view()).label || id, nCards = n => `${n} card${n === 1 ? '' : 's'}`;
  // the slowest and the costliest path (#95), offered where the view's lines have latency or cost
  const BY = { latency: ['⏱', 'slowest'], cost: ['¤', 'costliest'] }, budgets = () => Object.keys(BY).filter(k => X().ctx().viewEdges(X().ctx().V[X().view()]).some(e => typeof e[k] === 'number'));
  const litOn = k => !!lit && lit.split(' ')[0] === k; // the button whose light is on says so (aria-pressed)
  const litButtons = () => `<button class="ibtn" data-lit="out" title="Light what it leads to (&gt;)" aria-label="Light what it leads to" aria-pressed="${litOn('out')}">→</button><button class="ibtn" data-lit="in" title="Light what leads to it (&lt;)" aria-label="Light what leads to it" aria-pressed="${litOn('in')}">←</button>`
    + (picked.length > 1 ? `<button class="ibtn" data-lit="paths" title="Light every path between the two cards (P)" aria-label="Light every path between the two selected cards" aria-pressed="${litOn('paths')}">⇄</button>` : '')
    + budgets().map(k => { const t = `Light the ${BY[k][1]} path ${picked.length > 1 ? 'between the two cards' : 'from this card'}`; return `<button class="ibtn" data-lit="${k}" title="${t}" aria-label="${t}" aria-pressed="${litOn(k)}">${BY[k][0]}</button>`; }).join('')
    + `<button class="ibtn" data-lit="down" title="What if this goes down?" aria-label="What if this goes down?" aria-pressed="${litOn('down')}">⊘</button>`;
  /* what is lit is the pieces' own layer, 'lit' (0.14.0): it never takes a host's highlight() or a story's away, nor they it */
  const lv = r => Math.min(1, Math.max(0, +(r.level ?? (r.distance > 0 ? Math.max(.45, 1 - .15 * r.distance) : 1)) || 0)); // as highlight() fades a Ref
  function litLayer(refs, marks) { // the cards and lines lit, the rest dimmed, with the marks that go with them (a path's total, the card that is down)
    const L = { nodes: {}, edges: {}, dim: refs.length > 0 }, put = (to, x, r) => { to[x] = { level: Math.max(lv(r), (to[x] || {}).level || 0) }; };
    refs.forEach(r => { if (r.type === 'node') put(L.nodes, r.id, r); else if (r.type === 'edge') (r.ids || []).forEach(x => put(L.edges, x, r)); });
    Object.entries((marks || {}).nodes || {}).forEach(([id, m]) => { L.nodes[id] = { ...L.nodes[id], ...m }; });
    return L;
  }
  const pressed = () => { if (el.panel) el.panel.querySelectorAll('[data-lit]').forEach(b => b.setAttribute('aria-pressed', litOn(b.dataset.lit))); };
  function unlight() { if (lit) { lit = null; X().overlay('lit', null); pressed(); } }
  function light(key, refs, said, marks = null) {
    if (lit === key) { unlight(); return o.status('Highlight cleared'); }
    lit = key; X().overlay('lit', refs.length || marks ? litLayer(refs, marks) : null, [X().view()]); pressed(); o.status(said, 3600);
  }
  function lightReach(back) {
    if (!sel || !X().geo().byId[sel]) return;
    const refs = reach(X().ctx().D, X().view(), sel, { backward: back }), n = refs.filter(r => r.type === 'node').length - 1, s = cardName(sel);
    light((back ? 'in ' : 'out ') + sel, n ? refs : [], !n ? (back ? `Nothing leads to ${s} here` : `${s} leads nowhere here`)
      : back ? `${nCards(n)} ${n === 1 ? 'leads' : 'lead'} to ${s}: lit on the map` : `${s} leads to ${nCards(n)}: lit on the map`);
  }
  function lightPaths() {
    const [a, b] = picked.slice(-2); if (!b) return;
    const D = X().ctx().D, cur = X().view();
    let refs = paths(D, cur, a, b), [x, y] = [a, b];
    if (!refs.length) { refs = paths(D, cur, b, a); [x, y] = [b, a]; } // the two cards in either order
    const n = refs.filter(r => r.type === 'node').length;
    light(`paths ${a} ${b}`, refs, n ? `Every path from ${cardName(x)} to ${cardName(y)}: ${nCards(n)}, lit on the map` : `No path joins ${cardName(a)} and ${cardName(b)} here`);
  }
  function lightCritical(by) { // the slowest or costliest path from the selected card, or between the two selected, its total on its last card (#95)
    if (!sel) return;
    const D = X().ctx().D, cur = X().view(), [a, b] = picked.length > 1 ? picked.slice(-2) : [sel], run = (from, to) => critical(D, cur, { from, to, by });
    let r = run(a, b); if (b && !r.refs.length) r = run(b, a); // the two cards in either order
    const cs = r.refs.filter(x => x.type === 'node').map(x => x.id), sum = by === 'latency' ? msText(r.total) : `cost ${r.total}`, word = BY[by][1];
    light(`${by} ${a} ${b || ''}`, r.refs, !cs.length ? (b ? `No path joins ${cardName(a)} and ${cardName(b)} here` : `${cardName(a)} leads nowhere here`)
      : `The ${word} path: ${cs.map(cardName).join(' → ')}, ${sum}`, cs.length ? { nodes: { [cs[cs.length - 1]]: { badge: { text: sum, tone: 'amber' } } } } : null);
  }
  function lightDown() { // what if the selected card goes down (#95): what loses its way to it
    if (!sel) return;
    const r = whatIf(X().ctx().D, X().view(), { remove: [sel] }), n = r.unreachable.filter(x => x.type === 'node').length - 1;
    light('down ' + sel, r.unreachable, `If ${cardName(sel)} goes down: ${n ? `${nCards(n)} lose${n === 1 ? 's its' : ' their'} way to it` : 'nothing here leads to it'}`,
      { nodes: { [sel]: { tone: 'rose', badge: { text: 'down', tone: 'rose' } } } });
  }
  // a card: selected here, or shown in the view that has it, nearest this one first
  const find = nid => { const { viewsWith, chain } = X().ctx(), cur = X().view(); if (X().geo().byId[nid]) return X().select({ type: 'node', id: nid });
    const vs = viewsWith(nid), v = vs.find(x => chain(x.id).includes(cur)) || vs[0]; if (v) X().go(v.id, { select: nid }); };

  if (el.legend) el.legend.addEventListener('click', e => { if (!e.target.closest('#m-lfold')) return;
    folded = !folded; keep('visual-legend', folded ? '0' : '1'); legend(); if (!X().cam().touched) X().cam().set(X().startView()); });
  if (el.tree) el.tree.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (innerWidth <= 820) setTree(false); X().go(b.dataset.v); });
  if (el.panel) el.panel.addEventListener('click', e => {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if (tb) return setTab(tb.dataset.tab);
    const st = t.closest('[data-step]'); if (st) return setTab(TABS[(TABS.indexOf(tab) + +st.dataset.step + TABS.length) % TABS.length]);
    const mb = t.closest('[data-more]'); if (mb) { mb.previousElementSibling.classList.add('open'); mb.remove(); }
    const ex = t.closest('[data-ex]'); if (ex) return openExample(el.panel.dataset.node, +ex.dataset.ex, ex);
    if (t.closest('[data-close]')) return X().select(null);
    const lt = t.closest('[data-lit]'); if (lt) { const k = lt.dataset.lit; return k === 'paths' ? lightPaths() : k === 'down' ? lightDown() : BY[k] ? lightCritical(k) : lightReach(k === 'in'); }
    const ob = t.closest('[data-open]'); if (ob) return X().open(ob.dataset.open); // the open event first, as a double-click on the card
    const ub = t.closest('[data-unfold]'); if (ub) return X().unfold(ub.dataset.unfold); // in place (#71), the expand event first
    const pv = t.closest('.pview'); if (pv) return X().go(pv.dataset.v, { select: pv.dataset.sel });
    const rn = t.closest('[data-n]'); if (rn) return find(rn.dataset.n);
    const cp = t.closest('[data-copy]'); if (cp) navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => o.status('Path copied'), () => o.status(cp.dataset.copy));
  });

  /* a story's step points at a card (0.14.0): the select its step makes is a pointer, which opens no details; a card the
     reader picks opens them, that one too. One rule, by id: a step's select is a card's id or a Ref (a chip's or a badge's
     names its card) */
  const pointerOf = x => typeof x === 'string' ? x : x && typeof x === 'object' ? (x.type === 'node' ? x.id : x.node ?? null) : null;
  function story(e) { // the map's story event
    if (!e || e.step == null) { told = null; return; }
    if (told && told.id === e.story && told.step === e.step) return; // the same step, said again (paused, played on)
    const def = arrOf(X().ctx().D.stories).find(s => s && s.id === e.story), step = def && arrOf(def.steps).filter(s => s && typeof s === 'object')[e.step];
    const pointer = step ? pointerOf(step.select) : null, already = pointer != null && sel === pointer && step.view === X().view() && !X().busy(); // its select changes nothing: no event comes
    told = { id: e.story, step: e.step, pointer, pending: pointer != null && !already };
    if (already && el.panel) hide();
  }

  return {
    chrome() { if (el.legend) legend(); if (el.tree) tree(); if (sel && el.panel && !el.panel.hidden) show(sel); }, // each picture of the map
    select(target, targets) { // the map's select event: the selected card's details, unless it is the select a story's step makes (a pointer)
      sel = target && target.type === 'node' ? target.id : null; picked = (targets || []).filter(t => t.type === 'node').map(t => t.id);
      const pointer = !!(told && told.pending && sel != null && sel === told.pointer); if (pointer) told.pending = false;
      unlight(); if (el.panel) { if (sel && !pointer) show(sel); else hide(); }
    },
    story, unlight, find, setTree,
    modal: () => !!(lb && !lb.hidden), // an example shown full size, which holds the keys while open
    key(e) { // the pieces' keys: true when one was used
      const k = e.key;
      if (lb && !lb.hidden) { // the example shown full size holds every key: Esc closes it, Tab keeps to it, Enter and Space press its buttons
        if (k === 'Escape' || k === 'Backspace') closeExample();
        else if (k === 'Tab') { const f = [...lb.querySelectorAll('a[href], button')], i = f.indexOf(lb.getRootNode().activeElement); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
        else if (k === 'Enter' || k === ' ') return false;
        return true;
      }
      if ((k === '[' || k === ']') && sel && el.panel && !el.panel.hidden) setTab(TABS[(TABS.indexOf(tab) + (k === ']' ? 1 : -1) + TABS.length) % TABS.length]);
      else if ((k === 'o' || k === 'O') && el.tree) setTree(!o.frame.classList.contains('tree-open'));
      else if ((k === '>' || k === '<') && sel && el.panel) lightReach(k === '<');
      else if ((k === 'p' || k === 'P') && picked.length > 1 && el.panel) lightPaths();
      else return false;
      return true;
    },
  };
}
