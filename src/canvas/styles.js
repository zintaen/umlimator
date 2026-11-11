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
  /* a typed view's editing (1.7): the panels over the map's left side, the relationship picker, a line's other end */
  svg .node.um-target .n-mask { stroke: var(--um-accent); stroke-width: 2.5; stroke-dasharray: 6 4; }
  .um-editor { position: absolute; left: 8px; top: 8px; bottom: 8px; width: 236px; overflow: auto; z-index: 5; box-sizing: border-box; padding: 2px 10px 10px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); font: 12px/1.45 var(--um-sans); color: var(--um-text); }
  .um-editor h3 { margin: 10px 0 4px; font: 700 10px var(--um-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--um-muted); }
  .um-editor ul { list-style: none; margin: 0; padding: 0; } .um-editor li, .um-editor .um-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0; }
  .um-editor li > :first-child { flex: 1; min-width: 0; text-align: left; } .um-editor small { color: var(--um-muted); }
  .um-editor label { display: block; margin: 4px 0; color: var(--um-muted); } .um-editor label.um-check { display: flex; gap: 6px; align-items: center; }
  .um-editor input:not([type]), .um-editor select { display: block; width: 100%; min-height: 24px; box-sizing: border-box; border: 1px solid var(--um-border-2); border-radius: 6px; background: var(--um-bg-2); color: var(--um-text); font: inherit; padding: 1px 6px; }
  .um-editor li input { display: inline-block; }
  .um-editor button, .um-pick button { min-height: 24px; min-width: 24px; border: 1px solid var(--um-border-2); border-radius: 6px; background: var(--um-bg-2); color: var(--um-text); font: inherit; padding: 1px 7px; cursor: pointer; }
  .um-editor button:hover, .um-editor button:focus-visible, .um-pick button:hover, .um-pick button:focus { border-color: var(--um-accent); color: var(--um-accent); outline: none; }
  .um-editor .um-err { border-color: color-mix(in srgb, var(--um-rose) 60%, var(--um-border-2)); } .um-editor .um-warn { border-color: color-mix(in srgb, var(--um-amber) 60%, var(--um-border-2)); }
  .um-editor .um-note, .um-editor dd { margin: 2px 0; color: var(--um-muted); } .um-editor dl { margin: 4px 0; } .um-editor dt { font-weight: 600; }
  .um-pick { position: absolute; z-index: 6; display: grid; gap: 2px; padding: 4px; border-radius: 8px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); font: 12px var(--um-sans); }
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

export { STYLES };
