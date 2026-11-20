import { h } from './render.js';
import { esc, glyph, inline } from '../core/text.js';
import { idTable } from '../core/registry.js';
import { SHAPE, SHAPE_NAMES, shapeOf } from '../draw/shapes.js';
import { WIRES, badgesOf } from '../map/cards.js';
import { critical, msText, paths, reach, whatIf } from '../map/insight.js';
import { KIND, SIGIL, kindOf } from '../map/kinds.js';
import { arrOf, runSteps } from '../map/validate.js';
import { elementCount } from '../map/context.js';
import { wordOf } from '../page/print.js';
import { labelOr } from '../core/model.js';

/* ================= the standalone page's pieces (#99): views list, legend, hint line, details panel =================
   mountPage draws all four in its page; render() draws those a host asks for (nav, legend, hints, details) around its
   canvas, in its shadow root. The hint line is hintHTML() and hinter(); pieces() draws the others from the map and acts
   on it. X() is render()'s inner handle; el: the views list's, legend's and details panel's elements (null: not drawn);
   o.page: the standalone page, which keeps the reader's choices in localStorage; o.frame takes the class tree-open while
   the views list is open, and o.toggle says so; o.layer holds an example's lightbox; o.status(text, ms) says what happened. */
const shortT = t => String(t ?? '').split(' · ')[0];
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
    const ticks = [0]; for (let i = 0; i < value.length; i++) ticks.push(ticks[i] + (value[i] === '`')); // backticks before each place, counted once (audit 25)
    const safe = i => ticks[i] % 2 === 0;
    const cuts = separators.filter(i => i >= 6 && i < value.length - 4 && safe(i));
    if (!cuts.length && parts.length < 2) for (const m of value.matchAll(/\s+/g)) if (m.index >= 6 && m.index < value.length - 4 && safe(m.index)) cuts.push(m.index); // a loop: a spread throws past ~120,000 (audit 25)
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
  window: ['Desktop app', 'runs in a window'], folder: ['Package', 'a module or a folder of code'], node: ['Host', 'a machine or runtime it runs on'] };
const swatchOf = (sh, k, c, f, dashed) => { const n = { x: 0, y: 0, w: 100, h: 64 }, S = SHAPE[sh]; // a legend's key: the card's outline, small
  return `<svg class="lgs" viewBox="-4 -4 108 72" aria-hidden="true"><path d="${S.out(n)}" fill="${f}" stroke="${c}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${S.det ? S.det(n, c, k) : ''}</svg>`; };
function legendItems(gs, opens = 'double-click to open') { // what these pictures draw, each with what it means: the view's legend, and the PDF's (#93)
  const typedKeys = [...new Set(gs.flatMap(g => g.legend || []))]; // a typed view's type writes its own keys (1.9); its cards and lines are not a map's
  const ns = gs.flatMap(g => g.legend ? [] : g.nodes), es = gs.flatMap(g => g.legend ? [] : g.edges), used = [...new Set(ns.map(n => n.k))];
  // each card as its picture draws it: its shape and its dash (the legend draws what the map draws)
  const cards = gs.flatMap(g => g.legend ? [] : g.nodes.map(n => ({ k: n.k, sh: shapeOf(n, !!g.map), dash: !!g.map && n.k === 'external' })));
  const kindShape = k => { const s = [...new Set(cards.filter(d => d.k === k).map(d => d.sh))]; return s.length === 1 && s[0] !== 'box' && !(k === 'm-hook' && s[0] === 'hexagon') ? s[0] : null; };
  const dashOf = k => k === 'm-ext' || cards.some(d => d.k === k && d.dash); // an external card is dashed only where it is drawn so
  const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script', 'frontend', 'backend', 'ai', 'queue', 'database', 'security', 'cloud', 'external', 'file'];
  const shape = k => k === 'm-verb' ? 'p' : dashOf(k) ? 'd' : k === 'm-hook' ? 'h' : '';
  const kinds = order.filter(k => used.includes(k)), own = new Set(kinds.map(kindShape).filter(Boolean)), tone = k => `var(--um-${KIND[k][0]})`;
  // a shape the kinds' keys don't show already: in a neutral outline, as colour is the kinds'
  const shapes = SHAPE_NAMES.filter(sh => sh !== 'box' && !own.has(sh) && cards.some(d => d.sh === sh && !(sh === 'hexagon' && d.k === 'm-hook')))
    .map(sh => `<span class="lgi" title="${esc(SHAPE_SAYS[sh].join(' — '))}">${swatchOf(sh, 'file', 'var(--um-muted)', 'var(--um-panel)')}<b>${SHAPE_SAYS[sh][0]}</b><span>${SHAPE_SAYS[sh][1]}</span></span>`);
  return kinds.map(k => `<span class="lgi" title="${esc(KIND[k][1] + ' — ' + KIND[k][2])}">${kindShape(k) ? swatchOf(kindShape(k), k, tone(k), `var(--um-${KIND[k][0]}-f)`, dashOf(k)) : `<i class="${shape(k)}" style="border-color:${tone(k)};background:var(--um-${KIND[k][0]}-f)${k === 'm-hook' ? `;background:${tone(k)}` : ''}"></i>`}<b>${KIND[k][1]}</b><span>${KIND[k][2]}</span></span>`)
    .concat(shapes)
    .concat(ns.some(n => n.kids || n.opens) ? [`<span class="lgi"><i class="s"></i><b>⤢ Stacked</b><span>${opens}</span></span>`] : [])
    .concat(ns.some(n => n.step) ? ['<span class="lgi"><i class="num">1</i><b>Step</b><span>run order</span></span>'] : [])
    .concat(ns.some(n => n.tag) ? ['<span class="lgi"><i class="tag"></i><b>@author</b><span>who wrote it</span></span>'] : [])
    .concat(WIRES.filter(w => es.some(e => e.wk === w[0])).map(w => `<span class="lgi"><i class="w" style="border-color:var(--um-w-${w[0]})"></i><b>${w[1]}</b><span>${w[2]}</span></span>`))
    .concat(es.some(e => e.back) ? ['<span class="lgi"><i class="w dash" style="border-color:var(--um-w-calls)"></i><b>loops back</b><span>the one line that runs right to left</span></span>'] : []).concat(typedKeys);
}

function pieces(X, el, o) {
  const kept = k => { try { return o.page ? localStorage.getItem(k) : null; } catch (_) { return null; } };
  const keep = (k, v) => { try { if (o.page) localStorage.setItem(k, v); } catch (_) {} };
  // want: the tab the reader chose, kept; tab: the one shown, which is want when the card has it (0.14.0)
  let sel = null, picked = [], lit = null, lb = null, lbBack = null, folded = kept('visual-legend') === '0', want = kept('visual-tab') || 'when', tab = want, TABS = ['when', 'what', 'how', 'links'];
  let told = null; // the story's step shown: { id, step, pointer: the card its own select names, pending: that select is still to come }

  /* the legend: the kinds of cards and lines the view draws, in a box that folds away */
  function legend() {
    const items = legendItems([X().geo()]), back = el.legend.contains(el.legend.getRootNode().activeElement);
    el.legend.hidden = !items.length;
    el.legend.classList.toggle('folded', folded);
    el.legend.innerHTML = `<div class="t"><span>LEGEND</span><button type="button" id="m-lfold" aria-label="${folded ? 'Show' : 'Hide'} legend" aria-expanded="${!folded}">${folded ? '+' : '–'}</button></div>${items.join('')}`;
    if (back) el.legend.querySelector('#m-lfold').focus(); // a fold by keyboard keeps focus on the button
  }
  /* the views list: readable columns; a declared order may include shortcuts to descendants */
  function tree() {
    const { views, V, kidsOf, chain } = X().ctx(), cur = X().view(), ch = chain(cur);
    // a typed view's count is what it draws, drawn yet or not (audit 38): one not laid out yet is counted just after, a slice
    // at a time, its row left blank till then rather than showing a number that would change
    const ctx = X().ctx(), count = x => viewCount(ctx, x, cur, X().geo(), true);
    const roots = views.filter(x => !x.parent), cols = roots.length > 1 ? [{ head: 'Map', items: roots, on: ch[0] }] : [];
    ch.forEach((id, i) => { const order = V[id].browserOrder || [], k = [...new Set([...order, ...kidsOf(id).map(v => v.id)])].map(id => V[id]).filter(Boolean); if (k.length) cols.push({ head: shortT(labelOr(V[id].title, id)), items: k, on: ch[i + 1] }); });
    o.frame.style.setProperty('--browser-width', Math.min(448, Math.max(1, cols.length) * 224) + 'px');
    el.tree.innerHTML = `<div class="miller">${cols.map(c => `<div class="mcol"><div class="mch" title="${esc(c.head)}">${esc(c.head)}</div>${c.items.map(x => { const n = kidsOf(x.id).length;
      return `<button class="mit${x.id === cur ? ' on' : x.id === c.on ? ' path' : ''}" data-v="${esc(x.id)}" title="${esc(labelOr(x.title, x.id))}"${x.id === cur ? ' aria-current="page"' : ''}><span>${esc(shortT(labelOr(x.title, x.id)))}</span><em>${count(x) ?? ''}${n ? ' ›' : ''}</em></button>`; }).join('')}</div>`).join('')}</div>`;
    const todo = cols.flatMap(c => c.items).filter(x => count(x) == null);
    if (todo.length) idle(dl => { try { if (!X() || X().ctx() !== ctx || !el.tree.isConnected) return true; } catch (_) { return true; } // the model changed, or the page went: its next tree() counts
      do { const x = todo.shift(), c = viewCount(ctx, x, cur, null);
        el.tree.querySelectorAll('.mit').forEach(b => { if (b.dataset.v === x.id) { const em = b.querySelector('em'); if (em && !/\d/.test(em.textContent)) em.textContent = c + em.textContent; } }); } while (todo.length && dl.timeRemaining() > 2); // one a turn at least
      return !todo.length; });
    const m = el.tree.firstChild, last = m.lastElementChild; m.style.scrollBehavior = 'auto'; m.scrollLeft = last ? Math.max(0, last.offsetLeft + last.offsetWidth - m.clientWidth) : 0; m.style.scrollBehavior = '';
  }
  const setTree = on => { o.frame.classList.toggle('tree-open', on); if (o.toggle) o.toggle.setAttribute('aria-expanded', on); };

  /* the details panel: header, actions and tabs of the selected card */
  function relRows(list, dir) {
    const { N } = X().ctx(), here = X().geo().byId || {};
    if (!list.length) return `<div class="rel-none">${dir === 'up' ? 'Nothing calls this here' : 'Calls nothing here'}</div>`;
    return '<ul class="relation-list">' + list.map(({ e, id, inView, view }) => { const at = view ? X().geoOf(view).byId : here, o = N[id] || at[id] || { label: id, kind: '' }, k = kindOf(o.kind, true);
      const up = !N[id] && o.owner != null && (N[o.owner] || at[o.owner]), label = up ? `${o.label} of ${String(up.label).split(" : ")[0]}` : o.label; // a port or a parameter: of its part, as it is announced
      return `<li><button class="rel" data-n="${esc(id)}"${view ? ` data-v="${esc(view)}"` : ''} title="${esc((e.when ? e.when + ' — ' : '') + (inView ? 'Select' : 'Find in another view'))}"><i style="background:var(--um-${KIND[k][0]})"></i><span class="rel-l">${esc(label)}</span>
        <span class="rel-e">${e.step != null ? esc(e.step) + ' · ' : ''}${esc(e.label || '')}${inView ? '' : ' ↗'}</span></button></li>`; }).join('') + '</ul>';
  }
  // a model is data: a link it names is http(s), mailto, file or relative, never javascript: (audit 7). Cleaned as a browser
  // reads a URL first (tabs and newlines dropped, controls and spaces trimmed), so "java\tscript:" is caught too
  const safeUrl = u => (u = String(u ?? '').replace(/[\t\n\r]/g, '').replace(/^[\0- ]+|[\0- ]+$/g, ''), /^(https?|mailto|file):/i.test(u) || !/^[a-z][\w+.-]+:/i.test(u) ? u : '');
  const authorChip = login => { login = String(login); const A = (X().ctx().D.authors || {})[login] || {};
    return `<a class="author" href="${esc(safeUrl(A.url) || 'https://github.com/' + login)}" target="_blank" rel="noopener">${A.avatar ? `<img src="${esc(A.avatar)}" alt="">` : `<i>${esc([...login].slice(0, 2).join('').toUpperCase())}</i>`}<span>${esc(A.name || login)} <b>@${esc(login)}</b></span></a>`; };
  const focused = () => { const a = el.panel.getRootNode().activeElement; return a && el.panel.contains(a) ? a : null; };
  function show(nid) {
    const { D, N, V, views, nodeIn, opensOf, kidCount, unfoldable, viewsWith, viewEdges } = X().ctx(), geo = X().geo(), cur = X().view(), panel = el.panel;
    const root = D.meta && D.meta.root ? String(D.meta.root).replace(/\/$/, '') : '';
    const base = D.sourcesBase ? String(D.sourcesBase).replace(/\/$/, '') + '/' : '';
    const srcPath = p => p.replace(/:\d+(-\d+)?$/, '');
    // meta.root is the repo root relative to this page (older pages: absolute). `~/…` sources live
    // outside the repo, so they get no link.
    // meta.sourceBase (render --source-base): in-pack sources were rewritten to URLs under it and
    // show as their pack-relative path; any other relative source gets no link on a published page.
    const sb = D.meta && D.meta.sourceBase ? String(D.meta.sourceBase) : '';
    const decode = s => { try { return decodeURI(s); } catch { return s; } }; // a bare % (100%off.ts) is no escape: shown as written
    const srcLabel = p => sb && p.startsWith(sb) ? decode(p.slice(sb.length)).replace(/#L(\d+)(?:-L(\d+))?$/, (_, a, b) => ':' + a + (b ? '-' + b : '')) : p;
    const srcHref = p => safeUrl(/^https?:/.test(p) ? p
      : p.startsWith('~') || sb ? ''
      : p.startsWith('/') ? 'file://' + encodeURI(srcPath(p))
      : root.startsWith('/') ? 'file://' + encodeURI(root + '/' + base + srcPath(p))
      : encodeURI((root ? root + '/' : '') + base + srcPath(p)));
    const srcList = n => (Array.isArray(n.source) ? n.source : n.source ? [n.source] : []).filter(s => typeof s === 'string'); // a path is text
    // a part or a port is no card: its drawn name and type, so its kind word, never the map's "Script INTERNAL" (audit 12)
    const n = N[nid] || !geo.byId?.[nid] ? nodeIn(nid, cur) : { ...geo.byId[nid] }, ty = n.type && wordOf(D, V[cur], nid, n.type), k = kindOf(n.kind, true), c = `var(--um-${KIND[k][0]})`, pub = k === 'm-public', ext = k === 'm-ext';
    const inView = new Set(geo.nodes.map(x => x.id)), seen = new Set();
    // a typed view draws a member end (a port of a part, a constraint's parameter) as "<part>-><end>": the end's id in geometry g
    const drawnIn = (e, side, g) => { const p = (((e.props || {}).ends || {})[side] || {}).part, d = `${p}->${e[side]}`; return p != null && g.byId && g.byId[d] ? d : e[side]; };
    const elsewhere = (e, side) => { for (const v of views.filter(x => x.diagram && x.id !== cur)) { // ponytail: lays out each typed view once (pic's cache), on the first such end
      let g; try { g = X().geoOf(v.id); } catch { continue; } const d = drawnIn(e, side, g); if (g.byId && g.byId[d]) return { id: d, view: v.id }; } return null; };
    const collect = dir => {
      const out = [];
      // one entry a line: by its ends and label, and by its model id (a typed view draws a line with its own label: a C4 technology, «use»)
      const add = (e, id, iv, mid, view) => { const key = dir + id + (e.label || ''), mk = mid != null && dir + '#' + mid; if (seen.has(key) || mk && seen.has(mk)) return; seen.add(key); if (mk) seen.add(mk); out.push({ e, id, inView: iv, view }); };
      geo.edges.forEach(e => { const all = (e.all || [e]).filter(x => x._id), mid = all.length === 1 ? all[0]._id : null; // a line for several edges: by label, as before
        const f = e.fromPort || e.from, t = e.toPort || e.to; // a line between ports: its ends are the ports
        if (dir === 'up' && (e.to === nid || e.toPort === nid)) add(e, f, true, mid); if (dir === 'down' && (e.from === nid || e.fromPort === nid)) add(e, t, true, mid); });
      const ve = viewEdges(V[cur]), k = runSteps(ve); ve.forEach((e, i) => { const e2 = V[cur].render === 'sequence' ? { ...e, step: k[i] } : e; if (dir === 'up' && e.to === nid) add(e2, e.from, true, e.id); if (dir === 'down' && e.from === nid) add(e2, e.to, true, e.id); });
      const [near, far] = dir === 'up' ? ['to', 'from'] : ['from', 'to'];
      (D.edges || []).forEach(e => { if (e[near] !== nid && drawnIn(e, near, geo) !== nid) return;
        const id = drawnIn(e, far, geo), w = !inView.has(id) && !N[id] && elsewhere(e, far); add(e, w ? w.id : id, inView.has(id), e.id, w && w.view); });
      return out;
    };
    const ups = collect('up'), downs = collect('down'), srcs = srcList(n);
    // the view it opens counted as that view's pill counts it (audit 39), or the count the host gives for one not loaded
    const child = opensOf(nid, cur), later = !o.page && child && !V[child], count = V[child] ? countText(X().ctx(), V[child], cur, geo) : kidCount(nid, cur) ? nWord(kidCount(nid, cur), 'node') : ''; // later: a view the host loads when asked (#47)
    const vIn = viewsWith(nid).filter(v => v.id !== cur);
    const by = n.author ? `<span>·</span>${authorChip(n.author)}` : ext ? '<span class="origin">· author unknown</span>' : '';
    const exs = Array.isArray(n.examples) ? n.examples.filter(x => x && (x.thumb || x.href)) : [];
    const tabs = [...(ty ? [] : [['when', 'When to use'], ['what', 'What it is'], ['how', 'How it works']]), ...(exs.length ? [['examples', 'Example']] : []), ['links', 'Behind the scenes']];
    TABS = tabs.map(t => t[0]);
    tab = TABS.includes(want) ? want : TABS[0]; // a card without the chosen tab shows its first; the choice stays for the next card
    const text = (h4, body, key) => body ? `<h3>${h4}</h3><ul class="detail-bullets">${detailBullets(body).map(b => `<li title="${esc(b)}">${inline(b)}</li>`).join('')}</ul>` : `<h3>${h4}</h3><div class="pnone">Not written yet — add <code>${key}</code> to this node in the map model.</div>`;
    const verbs = (n.verbs || []).length ? `<div class="pverbs">${n.verbs.map(v => { const vid = N[nid + ':' + v] ? nid + ':' + v : null; return `<${vid ? `button data-n="${esc(vid)}"` : 'span'} class="pverb" style="--c:${c}">${esc(v)}</${vid ? 'button' : 'span'}>`; }).join('')}</div>` : '';
    const srcHtml = srcs.length ? '<ul class="source-list">' + srcs.map(s => `<li class="src">${srcHref(s) ? `<a href="${esc(srcHref(s))}" title="Open ${esc(sb ? srcLabel(s) : base + s)}"${sb ? ' target="_blank" rel="noopener"' : ''}>${esc(srcLabel(s))}</a>` : `<span>${esc(s)}</span>`}<button class="ibtn sm" data-copy="${esc(sb ? srcLabel(s) : base + s)}" title="Copy path" aria-label="Copy path">⧉</button></li>`).join('') + '</ul>' : '<div class="rel-none">No source listed</div>';
    const bodies = {
      when: text('When to use', n.when, 'when'),
      what: text('What it is', n.what, 'what') + verbs,
      how: text('How it works', n.how, 'how'),
      examples: `<h3>Example</h3><ul class="exs">${exs.map((x, i) => `<li class="ex">${x.thumb ? `<button class="ex-thumb" data-ex="${i}" title="Open full size" aria-label="Open ${esc(x.title || 'example')} full size"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>` : ''}<b>${inline(x.title || '')}</b>${x.caption ? `<small>${inline(x.caption)}</small>` : ''}${safeUrl(x.href) ? `<a href="${esc(safeUrl(x.href))}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}</li>`).join('')}</ul>`,
      links: `<div class="links"><div><h3>← Comes from</h3>${relRows(ups, 'up')}</div><div><h3>→ Leads to</h3>${relRows(downs, 'down')}</div>
        <div><h3>Source files</h3>${srcHtml}${vIn.length ? `<h3 style="margin-top:10px">Also shown in</h3><ul class="pviews">${vIn.map(v => `<li><button class="pview" data-v="${esc(v.id)}" data-sel="${esc(nid)}">${esc(shortT(labelOr(v.title, v.id)))}</button></li>`).join('')}</ul>` : ''}</div></div>`,
    };
    const was = focused(), on = was && [...was.attributes].find(a => a.name.startsWith('data-')); // a panel drawn again keeps focus on the control it was on
    panel.innerHTML = `<div class="ph" style="--c:${c}">
        ${(() => { const I = (D.icons || {})[n.icon];
  return I && I.src ? `<span class="big logo${I.dark ? ' dark' : ''}" aria-hidden="true"><img src="${esc(I.src)}" width="22" height="22" alt=""></span>`
  : `<span class="big" style="background:${c}" aria-hidden="true"><svg viewBox="0 0 ${I && I.g ? 24 : 16} ${I && I.g ? 24 : 16}" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${I && I.g ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round">${I && I.g ? glyph(I.g) : SIGIL[k]}</svg></span>`; })()}
        <div class="pt"><h2>${esc(n.label || nid)}</h2><small><span>${esc(ty || KIND[k][1])}</span><span class="vis ${pub ? 'pub' : ext ? 'ext' : ''}">${ty ? '' : badgesOf(n).length ? badgesOf(n).map(b => esc(b.text.toUpperCase())).join(' · ') : pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>${by}${n.origin ? `<span class="origin">${esc(n.origin)}</span>` : ''}</small></div>
        <div class="acts">${V[child] || later ? `<button class="obtn" data-open="${esc(nid)}" style="--c:${c}">⤢ Open ${esc(shortT(V[child] ? labelOr(V[child].title, child) : child))} <span>${count ? count + ' · ' : ''}Enter</span></button>` : ''}${!X().editable && (unfoldable(nid, cur) || later) ? `<button class="obtn" data-unfold="${esc(nid)}" style="--c:${c}">⤡ Unfold here <span>E</span></button>` : ''}${litButtons()}<button class="ibtn x" data-close title="Close (Esc)" aria-label="Close details">×</button></div>
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
    lb.innerHTML = `<figure><img src="${esc(x.full || x.thumb)}" alt="${esc(x.title || '')}"><figcaption><span>${inline(x.title || '')}</span>${safeUrl(x.href) ? `<a href="${esc(safeUrl(x.href))}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}<button class="ibtn" data-lbclose title="Close (Esc)" aria-label="Close">×</button></figcaption></figure>`;
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
    const L = { nodes: idTable(), edges: idTable(), dim: refs.length > 0 }, put = (to, x, r) => { to[x] = { level: Math.max(lv(r), (to[x] || {}).level || 0) }; };
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
  const find = (nid, vid) => { const { viewsWith, chain } = X().ctx(), cur = X().view(); if (X().geo().byId[nid] || X().boxHere(nid)) return X().go(cur, { select: nid }); // a card, or an element drawn here as a box
    const vs = viewsWith(nid), v = vid || (vs.find(x => chain(x.id).includes(cur)) || vs[0] || {}).id; // vid: the view the panel found it drawn in
    if (v) return X().go(v, { select: nid }); o.status(`${nid} is drawn in no view`); return false; };

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
    const rn = t.closest('[data-n]'); if (rn) return find(rn.dataset.n, rn.dataset.v);
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

// a view's count before it is drawn too (audit 38), so the views list and the search palette say what the pill will: a typed
// view not drawn yet laid out once for it (kept per context), a map's cards. cur and g: the view on screen and its picture
// lazy: null for a typed view not laid out yet, instead of laying it out
const counted = new WeakMap();
// a numbered view counts its steps, as its pill says (audit 39: the pill said "5 steps", the views list and search 6): a process
// or numbered-card view's cards in run order, a sequence view's lines; null for any other view
const stepCount = (ctx, v) => v.mainSteps || v.render === 'process' ? arrOf(v.stepIds || v.nodeIds).length : v.render === 'sequence' ? runSteps(arrOf(ctx.viewEdges(v))).filter(k => k != null).length : null;
const nWord = (n, w) => (n === 1 ? '1 ' + w : n + ' ' + w + 's'); // "1 node", "1 step", "1 wire" (audits 38, 39)
// a view's count in words, as its pill gives it: "5 steps", "1 node"
const countText = (ctx, v, cur, g) => nWord(viewCount(ctx, v, cur, g), stepCount(ctx, v) != null ? 'step' : 'node');
const viewCount = (ctx, v, cur, g, lazy = false) => { if (!v) return 0; const s = stepCount(ctx, v); if (s != null) return s; if (v.diagram == null || v.diagram === 'map') return arrOf(v.nodeIds).length;
  const C = ctx.geoCache || {}, have = v.id === cur && g ? g : (C[v.id] || {}).g; if (have) return elementCount(v, have) ?? arrOf(v.nodeIds).length;
  let m = counted.get(ctx); if (!m) counted.set(ctx, m = new Map());
  if (!m.has(v.id)) { if (lazy) return null; let n; try { n = elementCount(v, ctx.buildGeo(v.id)); } catch { n = null; } m.set(v.id, n ?? arrOf(v.nodeIds).length); }
  return m.get(v.id); };
// run f(deadline) in slices of about 10 ms on timers, after the view on screen is drawn, until it returns true: no long task,
// and done in a tab requestIdleCallback starves (a background or headless one)
const idle = f => { const go = () => { const t = Date.now(); if (!f({ timeRemaining: () => Math.max(0, 10 - (Date.now() - t)) })) setTimeout(go, 0); }; setTimeout(go, 30); };

export { shortT, hintHTML, hinter, legendItems, pieces, detailBullets, elementCount, viewCount, stepCount, nWord, countText };
