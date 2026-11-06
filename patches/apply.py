# Applies umlimator's customisations to engine/assets/template.html (super-board's /visual template, MIT).
# Each patch replaces one exact anchor that must occur exactly once; a missing anchor stops the run, so an upstream
# change can never be patched silently. Run after refreshing the template from upstream:
#   python3 -I patches/apply.py
import pathlib, sys

T = pathlib.Path(__file__).resolve().parents[1] / "engine" / "assets" / "template.html"
s = T.read_text(encoding="utf-8")
if "/* umlimator */" in s:
    sys.exit("already patched")

P = [
 # 1. Architecture kinds keep their own colours and wording in map mode: `external` no longer means "External skill".
 ("const MAPK = { public: 'm-public', lane: 'm-lane', script: 'm-script', external: 'm-ext', ",
  "const MAPK = { /* umlimator */ public: 'm-public', lane: 'm-lane', script: 'm-script', "),
 # 2. Architecture kinds get a one-line legend description.
 ("frontend: ['cyan', 'Client / UI'], backend: ['green', 'Service / API'], database: ['violet', 'Data store'],",
  "frontend: ['cyan', 'Client / UI', 'people and screens'], backend: ['green', 'Service / API', 'runs the logic'], "
  "database: ['violet', 'Data store', 'keeps data'],"),
 ("cloud: ['amber', 'Infra / Cloud'], security: ['rose', 'Auth / Security'], queue: ['orange', 'Queue / Event'],",
  "cloud: ['amber', 'Infra / Cloud', 'hosts, observability'], security: ['rose', 'Auth / Security', 'checks and holds secrets'], "
  "queue: ['orange', 'Queue / Event', 'hands work on'],"),
 ("external: ['slate', 'External'], file: ['slate', 'File / Doc'], ai: ['fuchsia', 'Agent / AI'],",
  "external: ['slate', 'External', 'outside the system'], file: ['slate', 'File / Doc', 'a document or config'], "
  "ai: ['fuchsia', 'Agent / AI', 'an agent or model'],"),
 # 3. The legend lists the architecture kinds a view uses, not only the skill-map kinds.
 ("const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script'];",
  "const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script', "
  "'frontend', 'backend', 'ai', 'queue', 'database', 'security', 'cloud', 'external', 'file'];"),
 ("const shape = k => k === 'm-verb' ? 'p' : k === 'm-ext' ? 'd' : k === 'm-hook' ? 'h' : '';",
  "const shape = k => k === 'm-verb' ? 'p' : (k === 'm-ext' || k === 'external') ? 'd' : k === 'm-hook' ? 'h' : '';"),
 # 4. A node's `badge` (PROPOSED, TARGET, OFF ...) shows as the card's tab and in the details panel.
 ("const mapTab = n => n.k === 'm-public' ? 'PUBLIC'",
  "const mapTab = n => n.badge ? String(n.badge).toUpperCase() : n.k === 'm-public' ? 'PUBLIC'"),
 ("${pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>",
  "${n.badge ? esc(String(n.badge).toUpperCase()) : pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>"),
 # 5. Still export: `#still=<view>&scale=2` renders that view and replaces the page with its stand-alone SVG, for
 #    headless Chrome (umlimator.py stills) to save as SVG and PNG for documents that cannot run the page.
 ("if (Q.get('shot') || Q.get('check')) window.__instant = true;",
  "if (Q.get('shot') || Q.get('check') || Q.get('still')) window.__instant = true;"),
 ("    function download(name, blob) {",
  "    if (Q.get('still')) { const sv = Q.get('still'), sc = +(Q.get('scale') || 2);\n"
  "      const tick = async () => { if (!geo || !V[sv]) return setTimeout(tick, 100); if (cur !== sv) { await go(sv, {}); return setTimeout(tick, 200); }\n"
  "        const out = standalone(sc), b = geo.bounds; document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, w: Math.ceil(b.w * sc), h: Math.ceil(b.h * sc) }));\n"
  "        document.body.innerHTML = '<div id=\"still\">' + out + '</div>'; document.body.style.margin = '0'; };\n"
  "      setTimeout(tick, 300); }\n"
  "    function download(name, blob) {"),
 # 6. A card name too wide for its card wraps onto two lines at a word break instead of being cut with "…", so
 #    stills keep the whole name (a still has no hover to recover it). Too long for two lines: the first line is filled
 #    and only the second ends in "…".
 ("function fit(s, px, max) {",
  "function wrap2(s, px, max) { const w = String(s ?? '').split(' '); let best = null;\n"
  "    for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), m = Math.max(textW(a, px), textW(b, px)); if (!best || m < best[2]) best = [a, b, m]; }\n"
  "    if (best && Math.max(textW(best[0], px), textW(best[1], px)) > max) { let i = 1; while (i < w.length - 1 && textW(w.slice(0, i + 1).join(' '), px) <= max) i++; best = [w.slice(0, i).join(' '), w.slice(i).join(' ')]; }\n"
  "    return best ? [fit(best[0], px, max), fit(best[1], px, max)] : null; }\n"
  "  function clauseFit(s, px, max) { s = String(s ?? ''); if (textW(s, px) <= max) return s; for (const sep of ['; ', ', ', ' (']) { const q = s.split(sep); let o = q[0]; if (textW(o, px) > max) continue; for (const x of q.slice(1)) { if (textW(o + sep + x, px) > max) break; o += sep + x; } return o; } return fit(s, px, max); }\n"
  "  function fit(s, px, max) {"),
 ("const lpx = textW(n.label, labelPx) > n.w - 30 ? Math.max(11, (n.w - 30) / (String(n.label).length * 0.6)) : labelPx;",
  "const two = map && textW(n.label, labelPx) > n.w - 30 ? wrap2(n.label, labelPx, n.w - 30) : null;\n"
  "      const lpx = two ? labelPx : textW(n.label, labelPx) > n.w - 30 ? Math.max(11, (n.w - 30) / (String(n.label).length * 0.6)) : labelPx;"),
 ("const ly = n.y + n.h / 2 + (sub || verbs ? -3 : 4);",
  "const ly = n.y + n.h / 2 + (sub || verbs ? -3 : 4) - (two ? 8 : 0);"),
 ("${removed ? 'text-decoration=\"line-through\"' : ''}>${esc(fit(n.label, lpx, n.w - 30))}</text>",
  "${removed ? 'text-decoration=\"line-through\"' : ''}>${two ? `<tspan x=\"${n.x + n.w / 2}\">${esc(two[0])}</tspan><tspan x=\"${n.x + n.w / 2}\" dy=\"15\">${esc(two[1])}</tspan>` : esc(fit(n.label, lpx, n.w - 30))}</text>"),
 ("if (sub) s += `<text x=\"${n.x + n.w / 2}\" y=\"${ly + 16}\"",
  "if (sub) s += `<text x=\"${n.x + n.w / 2}\" y=\"${ly + 16 + (two ? 15 : 0)}\""),
 # 7. Line labels in maps get 440 px before "…" (upstream 170), for the longer labels of an architecture.
 ("fit(e.label || '', 10.5, e.under ? 320 : 170)", "fit(e.label || '', 10.5, e.under ? 320 : 440)"),
 # 9. Cards grow to 340 px for a long sub-line (upstream 240, sub-line 205), so a still keeps the whole line.
 ("return Math.min(n.emphasis ? 205 : 240, Math.max(n.emphasis ? 146 : 138,",
  "return Math.min(n.emphasis ? 205 : 340, Math.max(n.emphasis ? 146 : 138,"),
 ("Math.min(205, Math.ceil(textW(sub, 10) + 24))));", "Math.min(340, Math.ceil(textW(sub, 10) + 24))));"),
 # 10. A map line label with no free spot on its own line is not dropped: a second pass places it on the line even
 #     where another line crosses it, so a still keeps every label (upstream drops it).
 ("      for (const text of tries) {", "      for (const relax of (map ? [false, true] : [false])) for (const text of tries) {"),
 ("if (routed.some(r => r !== e && segsOf(r.pts).some(([a, b]) => segHitsRect(a, b, grow)))) continue;",
  "if (!relax && routed.some(r => r !== e && segsOf(r.pts).some(([a, b]) => segHitsRect(a, b, grow)))) continue;"),
 ("if (segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;",
  "if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;"),
 # 11. A line's own `style` (emphasis, dashed, security) wins over the map's colour by kind, so a picture's bold and
 #     dashed lines keep their meaning.
 ("if (map && e.wk) return {", "if (map && e.wk && !e.style) return {"),
 # 12. Box titles (family headers) are obstacles: lines route around them and labels keep off them, so a title stays
 #     readable (upstream only reports a crossed header).
 ("(dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });",
  "(dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });\n"
  "      if (map) families.forEach(f => { const h = { x: f.x + 8, y: f.y + 3, w: Math.min(f.w - 16, textW(f.label || f.id, 11) + 16), h: 22 }; reserved.push(h); placed.push(h); });"),
 # 13. The last-resort pass also tries more spots along each segment and segments shorter than the label (the label may overhang the segment's ends,
 #     still never a card), for short lines between close cards.
 ("if (sg.h && sg.l < w + 10) continue;", "if (!relax && sg.h && sg.l < w + 10) continue;"),
 ("if (!sg.h && sg.l < hgt + 14) continue;", "if (!relax && !sg.h && sg.l < hgt + 14) continue;"),
 ("for (const f of [.5, .32, .68, .2, .8]) {",
  "for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : [.5, .32, .68, .2, .8])) {"),
 # 14. A box is at least as wide as its title (11 px mono, about 6.7 px a character), so the title never runs past it.
 ("const families = familyDefs.map(f => frameOf(f)).filter(Boolean);",
  "const families = familyDefs.map(f => frameOf(f)).filter(Boolean);\n"
  "    if (map) families.forEach(f => { f.w = Math.max(f.w, String(f.label || f.id).length * 6.7 + 32); });"),
 # 15. A sub-line too long for its card wraps onto two lines (when the name fits on one), not cut with "…"; with a
 #     two-line name it keeps as many whole clauses as fit on one line.
 ("const sub = subTxt && !verbs ? fit(subTxt, 10, n.w - 24) : '';",
  "const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > n.w - 24 && textW(n.label, n.emphasis ? 15 : 13) <= n.w - 30 ? wrap2(subTxt, 10, n.w - 24) : null;\n"
  "      const sub = subTxt && !verbs ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, n.w - 24)) : '';"),
 ("const ly = n.y + n.h / 2 + (sub || verbs ? -3 : 4) - (two ? 8 : 0);",
  "const ly = n.y + n.h / 2 + (sub || verbs ? -3 : 4) - (two ? 8 : 0) - (sub2 ? 6 : 0);"),
 ("${esc(sub)}</text>`;",
  "${sub2 ? `<tspan x=\"${n.x + n.w / 2}\">${esc(sub2[0])}</tspan><tspan x=\"${n.x + n.w / 2}\" dy=\"12\">${esc(sub2[1])}</tspan>` : esc(sub)}</text>`;"),
 # 16. The last-resort label pass keeps clear of the cards themselves and their tabs, not of the margin kept for ports.
 ("if (nodeRects.some(r => hit({ x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }, box))) continue;",
  "if (nodeRects.some(r => hit(relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }, box))) continue;"),
 # 17. A card is wide enough for its badge tab, the ⤢ pill and a port between them (a long tab such as "PARTIAL · CHECK").
 ("Math.ceil(textW(n.label, px) + 38),", "Math.ceil(textW(n.label, px) + 38), n.badge ? Math.ceil(String(n.badge).length * 6.4 + 130) : 0,"),
 # 18. Ports keep a few pixels clear of a badge tab, so a line's end dot never lands on the tab's last letter.
 ("if (tab) n.decoT.push([n.x + 12, tab.length * 6.4 + 10]);", "if (tab) n.decoT.push([n.x + 6, tab.length * 6.4 + 22]);"),
 # 19. A view with `keepPairs` draws A→B and B→A as two lines with their own labels (upstream joins them into one
 #     two-way line whose joined label can be cut), as a picture that drew them apart did.
 ("const r = pair[e.to + '>' + e.from];", "const r = !(V[vid] || {}).keepPairs && pair[e.to + '>' + e.from];"),
 # 20. An edge's `fromSide` / `toSide` (left, right, top, bottom) picks the side its line leaves and enters by, as a
 #     source picture placed it; and in a `keepPairs` view the second line of a pair is not drawn as a dashed return.
 ("else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }",
  "else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }\n"
  "      const SIDE = { left: 'L', right: 'R', top: 'T', bottom: 'B' }; if (SIDE[e.fromSide]) e.fs = SIDE[e.fromSide]; if (SIDE[e.toSide]) e.ts = SIDE[e.toSide];"),
 ("back: backKeys && backKeys.has(e.from + '>' + e.to)", "back: !(V[vid] || {}).keepPairs && backKeys && backKeys.has(e.from + '>' + e.to)"),
 # 21. In a `keepPairs` view, several lines between the same two cards stay separate lines with their own labels
 #     (upstream folds them into one line labelled "+1"), as a sequence picture's messages are.
 ("const k = e.from + '>' + e.to, m = par[k];", "const k = e.from + '>' + e.to + ((V[vid] || {}).keepPairs ? '#' + e.id : ''), m = par[k];"),
 # 22. A node with `noSub` shows its name only (its description stays in the details panel), for a card whose
 #     description would otherwise be cut.
 ("const subTxt = n.sub || ", "const subTxt = n.noSub ? '' : n.sub || "),
 # 8. A view's `gap` and `rgap` set the space between columns and rows, so numbered flows have room for each step's label.
 ("const CG = map ? (", "const CG = dg.gap ? dg.gap : map ? ("),
 (", RG = map ? 44 : RG0;", ", RG = dg.rgap ? dg.rgap : map ? 44 : RG0;"),
 ("dg.repair = repair; dg.intake = v.intake; dg.tour = v.tour;",
  "dg.repair = repair; dg.intake = v.intake; dg.tour = v.tour; dg.gap = v.gap; dg.rgap = v.rgap;"),
 # 23. `#still=<view>&reader=1`: a still for readers drops reviewer marks, the CHECK tab and the ⤢ drill-down pill
 #     (the interactive page and the review copy keep both).
 ("  const Q = new URLSearchParams(location.hash.slice(1));",
  "  const Q = new URLSearchParams(location.hash.slice(1));\n"
  "  if (Q.get('reader')) [...(D.nodes || []), ...(D.views || []).flatMap(v => Object.values(v.nodeOverrides || {}))].forEach(n => { if (!n.badge) return;\n"
  "    const b = String(n.badge).replace(/\\s*·\\s*check$/i, '').replace(/^check$/i, ''); if (b) n.badge = b; else delete n.badge; });"),
 ("s += `<g class=\"open-hint", "if (!Q.get('reader')) s += `<g class=\"open-hint"),
 # 24. Boxes (families) are drawn round the cards after routing, so a route could run on a box's border and read
 #     as part of it. The grid gets a channel 16 px outside each box and drops grid lines within 8 px of a border;
 #     the visual check flags any run of 40+ px within 8 px of a box border.
 ("      let X = co([...xs]), Y = co([...ys]);",
  "      if (map) families.forEach(f => { xs.add(f.x - 16); xs.add(f.x + f.w + 16); ys.add(f.y - 16); ys.add(f.y + f.h + 16); });\n"
  "      let X = co([...xs]), Y = co([...ys]);\n"
  "      if (map) { const far = (v, bs) => keep.has(v) || bs.every(u => Math.abs(v - u) >= 8);\n"
  "        X = X.filter(v => far(v, families.flatMap(f => [f.x, f.x + f.w]))); Y = Y.filter(v => far(v, families.flatMap(f => [f.y, f.y + f.h]))); }"),
 # 25. Root cause of 24: a map's port stub is 22 px and a box sat 20 px outside its cards, so every stub ended on the
 #     border. Boxes now sit 36 px outside the sides and 44 px below (stub 22, clearance lines 17), so stubs end inside.
 ("const rects = [...members.map(n => ({x:n.x - 8,y:n.y - 14,w:n.w + 16,h:n.h + 22 + (n.tag ? 14 : 0)})), ...children];",
  "const rects = [...members.map(n => ({x:n.x - 36,y:n.y - 14,w:n.w + 72,h:n.h + 44 + (n.tag ? 14 : 0)})), ...children];"),
 # 26. A label could sit on a box border (6.2: "gate B may move"). Box borders are label obstacles (not routing
 #     ones) in a first strict pass; a second strict pass may touch a border, before the relaxed pass may cross lines.
 ("if (map) families.forEach(f => { const h = { x: f.x + 8, y: f.y + 3, w: Math.min(f.w - 16, textW(f.label || f.id, 11) + 16), h: 22 }; reserved.push(h); placed.push(h); });",
  "if (map) families.forEach(f => { const h = { x: f.x + 8, y: f.y + 3, w: Math.min(f.w - 16, textW(f.label || f.id, 11) + 16), h: 22 }; reserved.push(h); placed.push(h);\n"
  "        placed.push(...[{ x: f.x, y: f.y - 3, w: f.w, h: 6 }, { x: f.x, y: f.y + f.h - 3, w: f.w, h: 6 }, { x: f.x - 3, y: f.y, w: 6, h: f.h }, { x: f.x + f.w - 3, y: f.y, w: 6, h: f.h }].map(r => ({ ...r, band: true }))); });"),
 ("for (const relax of (map ? [false, true] : [false])) for (const text of tries) {",
  "for (const pass of (map ? [0, 1, 2] : [0])) for (const text of tries) { const relax = pass === 2; // 0 strict, 1 strict but may touch a box border, 2 relaxed"),
 ("if (placed.some(r => hit(r, grow))) continue;", "if (placed.some(r => (pass === 0 || !r.band) && hit(r, grow))) continue;"),
 ("header crossed by edge ${name(e)}`); });\n",
  "header crossed by edge ${name(e)}`); });\n"
  "      geo.edges.forEach((e,i) => { if (segs[i].some(([a,b]) => { const v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];\n"
  "        const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);\n"
  "        return hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8); })) issues.push(`${where}: edge ${name(e)} runs along the border of family \"${f.label}\"`); });\n"
  "      geo.edges.forEach(e => { const L = e.lbl; if (!L) return; const xin = L.x + L.w > f.x && L.x < f.x + f.w, yin = L.y + L.h > f.y && L.y < f.y + f.h;\n"
  "        if ((xin && [f.y, f.y + f.h].some(u => L.y < u && L.y + L.h > u)) || (yin && [f.x, f.x + f.w].some(u => L.x < u && L.x + L.w > u))) issues.push(`${where}: label \"${L.text || L.step}\" sits on the border of family \"${f.label}\"`); });\n"),
 # 27. A badge tab is coloured by the status it names, like a status lozenge: green Built or Decided, amber Partial, Open or Opt-in, red Not built, blue Proposed, Agreed or Target,
 #     grey anything else (Off, TBC, Retired). Upstream the tab took the card's kind colour, so NOT BUILT showed green.
 ("const mapTab = n => n.badge ? String(n.badge).toUpperCase() : n.k === 'm-public' ? 'PUBLIC'",
  "const tabFill = (n, c) => { if (!n.badge) return c; const w = String(n.badge).toUpperCase().split('·')[0].trim();\n    return 'var(--' + (['BUILT', 'DECIDED'].includes(w) ? 'green' : ['PARTIAL', 'OPEN', 'OPT-IN'].includes(w) ? 'amber' : w === 'NOT BUILT' ? 'rose'\n      : ['PROPOSED', 'AGREED', 'TARGET'].includes(w) ? 'accent' : 'slate') + ')'; };\n  const mapTab = n => n.badge ? String(n.badge).toUpperCase() : n.k === 'm-public' ? 'PUBLIC'"),
 ('<rect x="${n.x + 12}" y="${n.y - 8}" width="${tw}" height="15" rx="4" fill="${c}"/>',
  '<rect x="${n.x + 12}" y="${n.y - 8}" width="${tw}" height="15" rx="4" fill="${tabFill(n, c)}"/>'),
 # 28. `#check=1&views=a,pic-*` checks only those views (a trailing * is a prefix), so a large model's reader pictures
 #     can be checked in seconds instead of auditing every view (`umlimator.py check --views`).
 ("      views.forEach(v => { if (!(v.nodeIds || []).some(i => N[i])) return; const { g, markup } = buildView(v.id);",
  "      const only = (Q.get('views') || '').split(',').filter(Boolean), want = v => !only.length || only.some(p => p.endsWith('*') ? v.id.startsWith(p.slice(0, -1)) : v.id === p);\n"
  "      views.forEach(v => { if (!want(v) || !(v.nodeIds || []).some(i => N[i])) return; const { g, markup } = buildView(v.id);"),
 ("checked: views.length + ' views', childView",
  "checked: views.filter(want).length + ' views', childView"),
 # 29. A node's `icon` names an entry in the model's `icons` table (umlimator.py render fills it from icons/): a brand
 #     mark on a small white tile (a dark one for a white mark), never recoloured, or a Lucide line icon in the kind's
 #     colour, where the kind sigil sat. Sigil, line icon and logo share one 16 px box (stroke 1.5 px); a logo's 20 px
 #     tile clears the tab above it. The card's size, colour and tab do not change, so layouts and the check stay.
 ("  svg .intake-chip { fill: #fff;",
  "  svg .n-logo { fill: #fff; stroke: var(--border-2); stroke-width: .8; } svg .n-logo.dark { fill: #1b1f23; }\n"
  "  .ph .big.logo { background: #fff !important; box-shadow: inset 0 0 0 1px var(--border-2); } .ph .big.logo.dark { background: #1b1f23 !important; }\n"
  "  svg .intake-chip { fill: #fff;"),
 ("<g transform=\"translate(${n.x + (verb ? 14 : hook ? 17 : 9)} ${n.y + (priv ? 6 : 9)}) scale(.8)\" class=\"n-sigil\" fill=\"none\" stroke=\"${c}\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">${SIGIL[n.k]}</g>",
  "${(() => { const I = (D.icons || {})[n.icon], x = n.x + (verb ? 14 : hook ? 17 : 9), y = n.y + (priv ? 8 : 11);  // one 16 px box for every mark\n"
  "  return I && I.src ? `<rect x=\"${x - 2}\" y=\"${y - 2}\" width=\"20\" height=\"20\" rx=\"4\" class=\"n-logo${I.dark ? ' dark' : ''}\"/><image href=\"${I.src}\" x=\"${x}\" y=\"${y}\" width=\"16\" height=\"16\"/>`\n"
  "    : I && I.g ? `<g transform=\"translate(${x} ${y}) scale(.6667)\" class=\"n-sigil\" fill=\"none\" stroke=\"${c}\" stroke-width=\"2.25\" stroke-linecap=\"round\" stroke-linejoin=\"round\">${I.g}</g>`\n"
  "    : `<g transform=\"translate(${x} ${y})\" class=\"n-sigil\" fill=\"none\" stroke=\"${c}\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">${SIGIL[n.k]}</g>`; })()}"),
 ("<span class=\"big\" style=\"background:${c}\" aria-hidden=\"true\"><svg viewBox=\"0 0 16 16\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">${SIGIL[k]}</svg></span>",
  "${(() => { const I = (D.icons || {})[n.icon];\n"
  "  return I && I.src ? `<span class=\"big logo${I.dark ? ' dark' : ''}\" aria-hidden=\"true\"><img src=\"${I.src}\" width=\"22\" height=\"22\" alt=\"\"></span>`\n"
  "    : `<span class=\"big\" style=\"background:${c}\" aria-hidden=\"true\"><svg viewBox=\"0 0 ${I && I.g ? 24 : 16} ${I && I.g ? 24 : 16}\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"${I && I.g ? 2 : 1.5}\" stroke-linecap=\"round\" stroke-linejoin=\"round\">${I && I.g ? I.g : SIGIL[k]}</svg></span>`; })()}"),
 # 29b. A card's name keeps 36 px clear on both sides (its mark reaches 27 px in), and a card sized by its name grows to
 #      match; before, a name that set the card's width ran under the logo tile.
 ("Math.ceil(textW(n.label, px) + 38), n.badge",
  "Math.ceil(textW(n.label, px) + 72), n.badge"),
 ("const two = map && textW(n.label, labelPx) > n.w - 30 ? wrap2(n.label, labelPx, n.w - 30) : null;\n"
  "      const lpx = two ? labelPx : textW(n.label, labelPx) > n.w - 30 ? Math.max(11, (n.w - 30) / (String(n.label).length * 0.6)) : labelPx;",
  "const lw = n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side\n"
  "      const two = map && textW(n.label, labelPx) > lw ? wrap2(n.label, labelPx, lw) : null;\n"
  "      const lpx = two ? labelPx : textW(n.label, labelPx) > lw ? Math.max(11, lw / (String(n.label).length * 0.6)) : labelPx;"),
 ("esc(fit(n.label, lpx, n.w - 30))", "esc(fit(n.label, lpx, lw))"),
 # 29c. The check sees each card's mark: a name or sub-line within 2 px of the mark's 20 px box is reported (the overlap
 #      under a logo tile passed the check because the audit did not know marks exist).
 ("        if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text \"${a.txt}\" overflows node \"${own.label}\"`);",
  "        if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text \"${a.txt}\" overflows node \"${own.label}\"`);\n"
  "        if (own && geo.map && (a.t === 'nl' || a.t === 'ns') && hit(a.b, { x: own.x + 7, y: own.y + 9, w: 20, h: 20 }, 2)) issues.push(`${where}: text \"${a.txt}\" touches the mark on node \"${own.label}\"`);"),
 # 29d. Map cards carry one 28 px mark on the left, centred vertically (a logo on a 34 px tile), and their name and
 #      sub-line left-aligned from 54 px in, 16 px clear on the right; the mark check follows the new box. A 16 px mark
 #      in the top corner was a few pixels wide once a picture was scaled to a page, and left the card looking empty.
 #      A card may grow to 386 px instead of 340, so its text keeps the room it had before the mark took 46 px.
 ("return Math.min(n.emphasis ? 205 : 340, Math.max(", "return Math.min(n.emphasis ? 205 : 386, Math.max("),
 ('      Math.ceil(textW(n.label, px) + 72), n.badge ? Math.ceil(String(n.badge).length * 6.4 + 130) : 0, Math.min(340, Math.ceil(textW(sub, 10) + 24))));',
  '      Math.ceil(textW(n.label, px) + 70), n.badge ? Math.ceil(String(n.badge).length * 6.4 + 130) : 0, Math.min(386, Math.ceil(textW(sub, 10) + 70))));'),
 ("      const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > n.w - 24 && textW(n.label, n.emphasis ? 15 : 13) <= n.w - 30 ? wrap2(subTxt, 10, n.w - 24) : null;\n      const sub = subTxt && !verbs ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, n.w - 24)) : '';",
  "      const sw = map ? n.w - 70 : n.w - 24;  // map cards: text runs from 54 px in (after the mark) to 16 px from the right\n      const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > sw && textW(n.label, n.emphasis ? 15 : 13) <= sw ? wrap2(subTxt, 10, sw) : null;\n      const sub = subTxt && !verbs ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, sw)) : '';"),
 ('      const lw = n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side',
  '      const lw = map ? n.w - 70 : n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side'),
 ('${(() => { const I = (D.icons || {})[n.icon], x = n.x + (verb ? 14 : hook ? 17 : 9), y = n.y + (priv ? 8 : 11);  // one 16 px box for every mark\n  return I && I.src ? `<rect x="${x - 2}" y="${y - 2}" width="20" height="20" rx="4" class="n-logo${I.dark ? \' dark\' : \'\'}"/><image href="${I.src}" x="${x}" y="${y}" width="16" height="16"/>`\n    : I && I.g ? `<g transform="translate(${x} ${y}) scale(.6667)" class="n-sigil" fill="none" stroke="${c}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${I.g}</g>`\n    : `<g transform="translate(${x} ${y})" class="n-sigil" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SIGIL[n.k]}</g>`; })()}\n        <text x="${n.x + n.w / 2}" y="${ly}" text-anchor="middle" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? \'text-decoration="line-through"\' : \'\'}>${two ? `<tspan x="${n.x + n.w / 2}">${esc(two[0])}</tspan><tspan x="${n.x + n.w / 2}" dy="15">${esc(two[1])}</tspan>` : esc(fit(n.label, lpx, lw))}</text>`;\n      if (sub) s += `<text x="${n.x + n.w / 2}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="middle" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? `<tspan x="${n.x + n.w / 2}">${esc(sub2[0])}</tspan><tspan x="${n.x + n.w / 2}" dy="12">${esc(sub2[1])}</tspan>` : esc(sub)}</text>`;',
  '${(() => { const I = (D.icons || {})[n.icon], x = map ? n.x + 14 : n.x + (verb ? 14 : hook ? 17 : 9), y = map ? n.y + n.h / 2 - 14 : n.y + (priv ? 8 : 11), M = map ? 28 : 16;  // map: one 28 px mark, left, centred\n  return I && I.src ? `<rect x="${x - M * 3 / 28}" y="${y - M * 3 / 28}" width="${M * 34 / 28}" height="${M * 34 / 28}" rx="${M / 4}" class="n-logo${I.dark ? \' dark\' : \'\'}"/><image href="${I.src}" x="${x}" y="${y}" width="${M}" height="${M}"/>`\n    : I && I.g ? `<g transform="translate(${x} ${y}) scale(${M / 24})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 24 / M}" stroke-linecap="round" stroke-linejoin="round">${I.g}</g>`\n    : `<g transform="translate(${x} ${y}) scale(${M / 16})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 16 / M}" stroke-linecap="round" stroke-linejoin="round">${SIGIL[n.k]}</g>`; })()}\n        <text x="${map ? n.x + 54 : n.x + n.w / 2}" y="${ly}" text-anchor="${map ? \'start\' : \'middle\'}" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? \'text-decoration="line-through"\' : \'\'}>${two ? `<tspan x="${map ? n.x + 54 : n.x + n.w / 2}">${esc(two[0])}</tspan><tspan x="${map ? n.x + 54 : n.x + n.w / 2}" dy="15">${esc(two[1])}</tspan>` : esc(fit(n.label, lpx, lw))}</text>`;\n      if (sub) s += `<text x="${map ? n.x + 54 : n.x + n.w / 2}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="${map ? \'start\' : \'middle\'}" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? `<tspan x="${map ? n.x + 54 : n.x + n.w / 2}">${esc(sub2[0])}</tspan><tspan x="${map ? n.x + 54 : n.x + n.w / 2}" dy="12">${esc(sub2[1])}</tspan>` : esc(sub)}</text>`;'),
 ('        if (own && geo.map && (a.t === \'nl\' || a.t === \'ns\') && hit(a.b, { x: own.x + 7, y: own.y + 9, w: 20, h: 20 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${own.label}"`);',
  '        if (own && geo.map && (a.t === \'nl\' || a.t === \'ns\') && hit(a.b, { x: own.x + 11, y: own.y + own.h / 2 - 17, w: 34, h: 34 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${own.label}"`);'),
 # 29e. A view drawn around a hub (one card fanning out to the rest) keeps its `tour`: upstream's hub layout dropped
 #      it, so the dot never rode the flows that centre on one card. A still leaves the tour out: one frame would freeze
 #      the dot at its start and outline its path.
 ("tour = map && (geo.tour || []).length > 1 ?", "tour = map && !Q.get('still') && (geo.tour || []).length > 1 ?"),
 ("edges: [...comb, ...others], lanes, blocks, laneGap: 24, repair, hub }, true);",
  "edges: [...comb, ...others], lanes, blocks, laneGap: 24, repair, hub, tour: V[vid].tour }, true);"),
 # 29f. A labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side
 #      (columns were a fixed 66 px apart, so a wide label left a stub of arrow; Anh, 2 Nov 2026), 48 px more when the line
 #      crosses into another box (its borders sit 20 px out and labels keep off them), and the check reports
 #      a label that leaves less than 16 px of its own line visible (kind shortLine).
 ('    for (let c = Math.floor(cols[0] ?? 0); c <= Math.ceil(cols[cols.length - 1] ?? 0); c++) { colX[c] = x; x += (colW[c] || NW) + CG; }\n    const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + CG);',
  '    // a labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side\n    const gapAfter = {}, colOf = {}, boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if (map && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);\n      (dg.edges || []).forEach(e => { const p = colOf[e.from], q = colOf[e.to]; if (p == null || q == null || !e.label || Math.abs(p - q) !== 1) return;\n        const c = Math.min(p, q), w = textW(fit(e.label, 10.5, 440), 10.5) * .92 + 18 + (e.step != null ? 20 : 0);\n        gapAfter[c] = Math.max(gapAfter[c] || 0, w + 54 + (boxOf(e.from) !== boxOf(e.to) ? 48 : 0)); }); }\n    const gap = c => Math.max(CG, gapAfter[c] || 0);\n    for (let c = Math.floor(cols[0] ?? 0); c <= Math.ceil(cols[cols.length - 1] ?? 0); c++) { colX[c] = x; x += (colW[c] || NW) + gap(c); }\n    const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + gap(Math.floor(c)));'),
 ('    issues.push(...routeAudit(geo, where));',
  '    issues.push(...routeAudit(geo, where));\n    if (geo.map) geo.edges.forEach(e => { const L = e.lbl; if (!L || !e.label || !e.pts) return; // a label must leave some of its own line visible\n      const c = [L.x + L.w / 2, L.y + L.h / 2], P = e.pts; let s = 0, at = null, half = 0, tot = 0;\n      for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);\n        if (at == null) { const onH = a[1] === b[1] && Math.abs(c[1] - a[1]) < 2 && c[0] >= Math.min(a[0], b[0]) - 1 && c[0] <= Math.max(a[0], b[0]) + 1;\n          const onV = a[0] === b[0] && Math.abs(c[0] - a[0]) < 2 && c[1] >= Math.min(a[1], b[1]) - 1 && c[1] <= Math.max(a[1], b[1]) + 1;\n          if (onH || onV) { at = tot + Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]); half = onH ? L.w / 2 : L.h / 2; } }\n        tot += len; }\n      if (at == null) return; const room = Math.min(at - half, tot - at - half);\n      if (room < 16) issues.push(`${where}: label "${e.label}" leaves its line ${Math.max(0, Math.round(room))} px (${e.s.label}→${e.t.label})`); });'),
 # 29g. A still leaves out the flow animation's pulse layer (10 px dashes every 80 px at 45% opacity): frozen in one
 #      frame they showed as faint marks along every line (Anh, 2 Nov 2026).
 ("const out = standalone(sc), b = geo.bounds;",
  "document.querySelectorAll('.flowline').forEach(e => e.remove()); const out = standalone(sc), b = geo.bounds;"),
 # 30. Benchmarks (bench/bench.py): a laid-out view records how long placement, routing and port repair took, and how
 #     many repair rounds and re-routes ran (geo.ms; drawing never reads it). `#bench=1&views=a,b&runs=5` times lane
 #     planning and layout per view with fresh caches, hashes the geometry so a change in output shows, adds the layout
 #     search with `&optimize=1`, and reports in <pre id="bench"> instead of drawing the page.
 ("  function layoutGraph(dg, map) {\n",
  "  function layoutGraph(dg, map) {\n    const __ms = { t: performance.now() };\n"),
 ("    let order = [...free].sort(", "    __ms.place = performance.now() - __ms.t; __ms.t = performance.now();\n    let order = [...free].sort("),
 ("    // port repair:",
  "    __ms.route = performance.now() - __ms.t; __ms.t = performance.now(); __ms.rounds = 0; __ms.reroutes = 0;\n    // port repair:"),
 ("let fixed = false;", "let fixed = false; __ms.rounds++;"),
 ("          runRouting(order);\n", "          runRouting(order); __ms.reroutes++;\n"),
 ("    const groups = (dg.groups || []).map(g => {",
  "    __ms.repair = performance.now() - __ms.t; delete __ms.t;\n    const groups = (dg.groups || []).map(g => {"),
 ("    return { stats, nodes, edges, groups, families,", "    return { ms: __ms, stats, nodes, edges, groups, families,"),
 ("    if (window.__instant) boot(); else", "    if (Q.get('bench')) { /* timings only, no page */ } else if (window.__instant) boot(); else"),
 ("    window.__mapAudit = () => {",
  "    window.__bench = (vid, runs, opt) => {\n"
  "      const out = [];\n"
  "      for (let i = 0; i < runs; i++) {\n"
  "        delete planCache[vid]; delete layoutCache[vid];\n"
  "        const t0 = performance.now(); planOf(vid); const t1 = performance.now(), g = buildGeo(vid), t2 = performance.now();\n"
  "        const sig = JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);\n"
  "        let h = 2166136261; for (let k = 0; k < sig.length; k++) h = Math.imul(h ^ sig.charCodeAt(k), 16777619) >>> 0;\n"
  "        out.push({ plan: t1 - t0, geo: t2 - t1, ...g.ms, issues: routeAudit(g, '').length, cross: g.stats.cross || 0, fallback: g.stats.fallback || 0, hash: h.toString(16) });\n"
  "      }\n"
  "      const r = { runs: out, nodes: (V[vid].nodeIds || []).filter(i => N[i]).length };\n"
  "      if (opt && !V[vid].layout && !planOf(vid).hub) { delete layoutCache[vid]; const t = performance.now(), o = optimize(vid); r.optimize = { ms: performance.now() - t, evals: o.evals, score: o.score }; }\n"
  "      return r;\n"
  "    };\n"
  "    window.__mapAudit = () => {"),
 ("  /* ---------- self-check hook",
  "  if (Q.get('bench')) {\n"
  "    const res = { views: {}, errors };\n"
  "    try { (Q.get('views') || '').split(',').filter(Boolean).forEach(v => { res.views[v] = window.__bench(v, +Q.get('runs') || 5, !!Q.get('optimize')); }); }\n"
  "    catch (err) { errors.push('bench: ' + err.message); }\n"
  "    const pre = document.createElement('pre'); pre.id = 'bench'; pre.hidden = true; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);\n"
  "  }\n"
  "  /* ---------- self-check hook"),
]
for old, new in P:
    n = s.count(old)
    if n != 1:
        sys.exit(f"anchor found {n} times: {old[:80]}")
    s = s.replace(old, new)
T.write_text(s, encoding="utf-8")
print("patched", len(P), "anchors")
