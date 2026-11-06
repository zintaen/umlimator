# Third-party notices

umlimator contains, or builds on, the work below. Each entry says what is used and under which licence.

1. super-board `/visual` (MIT): the engine in `engine/`. Its own notices for BuilderIO/skills and archify follow,
   kept as super-board wrote them, with one note added on archify's later licence change.
2. caru-ini/stack-diagram (MIT): `tools/fetch_icons.py` and the rules for brand logos.
3. Lucide (ISC, some icons MIT from Feather): the line icons in `icons/`.
4. Brand logos: not distributed with umlimator (see the last section).

## EricTechPro/super-board, `/visual` skill

`engine/assets/template.html` (patched by `patches/apply.py`), `engine/scripts/visual.py` and `engine/references/`
are copied from super-board commit `d0b7d5a` (29 Oct 2026). MIT, Copyright (c) 2026 Eric Tech; the full text is in
`LICENSE.super-board`. Source: https://github.com/EricTechPro/super-board

super-board's own third-party notice for `/visual`, as it ships it:

`/visual` adapts ideas from two MIT-licensed projects. No source file is copied
whole; the borrowed parts are named below so the attribution is precise.

## BuilderIO/skills (visual-recap, visual-plan)

Adapted from BuilderIO/skills (MIT): the per-mode section list, the recap and
plan quality bar, the grounding and secret-redaction rules, and the
"Key changes" + file-tree layout. `references/sections.md` carries them. The
hosted Agent-Native Plans app, MDX blocks, MCP connector, and `npx` tooling are
not used.

Source: https://github.com/BuilderIO/skills

MIT License

Copyright (c) 2026 Builder.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## tt-a1i/archify

Diagram style adapted from Archify (MIT): the semantic node palette (dark and
light values), the opaque-mask-under-translucent-fill node construction, the
40px grid canvas, orthogonal rounded routes with arrowhead markers, and
per-kind icons (the cloud, shield, and external-link icon paths follow
Archify's semantic sigils). `assets/template.html` re-implements these as a small inline
renderer.

Viewer UX adapted from Archify's viewer (`viewer/viewer-camera.js`, `semantic-radar.js`,
`focus.js`, `node-finder.js`, `export.js`): camera zoom and pan with fit and 100% presets
and keyboard steps, reading depths that hide detail when zoomed out (map / read / full),
a minimap with a draggable viewport, a node focus panel with upstream and downstream reach
(Archify's "Semantic Passport"), dimming of unrelated nodes on focus, a node finder, SVG and
PNG export, and the floating control-pill and toolbar look. These are re-implemented from
scratch in `assets/template.html`; no Archify source file is copied. The edge router follows
the approach of Archify's `renderers/shared/route-quality.mjs` (`shortestOrthogonalGridRoute`)
and `renderers/architecture/routing.mjs`: one port per edge spread along the node side in the
order of the far ends, a sparse orthogonal visibility grid built from node edges plus clearance
and earlier routes plus separation, Dijkstra with a bend penalty over (cell, direction) states,
no collinear reuse of earlier routes, and labels reserved as obstacles for later routes.
Re-implemented, not copied. Drill-down views,
breadcrumbs, deep links, and the overlap check are /visual's own. Archify's JSON-IR CLI,
validators, viewer runtime, and embedded font are not bundled.

Source: https://github.com/tt-a1i/archify

Note added by umlimator (2 Nov 2026): archify moved to the Apache License 2.0 on 25 Oct 2026 (commit 9c306ee). Its
NOTICE keeps code and contributions received under MIT through commit 25cf370 under their original terms, and keeps
the historical MIT notice, reproduced below, in its LICENSE-MIT. archify itself originated from
Cocoon-AI/architecture-diagram-generator (MIT), which is why Cocoon AI appears in that notice. super-board adapted
ideas, not files, and umlimator copies none of archify's files.

MIT License

Copyright (c) 2026 tt-a1i (Archify)
Copyright (c) 2025 Cocoon AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## caru-ini/stack-diagram

`tools/fetch_icons.py` is copied unmodified from caru-ini/stack-diagram (commit `30cbbb7`). The rules umlimator follows
for brand logos (official marks only, never recoloured, a white tile, a dark tile for a white mark, fetched rather than
bundled) are stack-diagram's. MIT, Copyright (c) 2026 caru-ini; the full text is in `LICENSE.stack-diagram`.
stack-diagram's bundled fonts (SIL OFL 1.1) are not used. Source: https://github.com/caru-ini/stack-diagram

## Lucide icons

The line icons in `icons/` (every manifest entry whose source is `lucide`) are from Lucide, fetched from the
`lucide-static` package; `tools/fetch_icons.py` sets their stroke colour. Source: https://github.com/lucide-icons/lucide

ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

Of the icons umlimator ships, clock, database, link, lock, server, terminal and trash-2 are derived from the Feather
project, under this licence:

The MIT License (MIT)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Brand logos (not distributed)

umlimator does not ship any brand logo. `icons/manifest.json` records, for each one, where its official file is
published and a sha256; `umlimator.py render` downloads it into the user's cache the first time a model names it.
The logos are trademarks of their owners and keep their owners' terms: svgl (the project is MIT; the logos belong to
their owners), devicon (MIT), gilbarbara/logos (CC0), Microsoft's Azure and Entra architecture icons (allowed in
architecture diagrams, training material and documentation), and files published by the brands themselves. Their use
in a diagram does not imply endorsement.
