import { hintHTML, hinter, pieces, shortT } from '../canvas/pieces.js';
import { pngOf, reducedMotion, render } from '../canvas/render.js';
import { esc, inline } from '../core/text.js';
import { mapContext } from '../map/context.js';
import { KIND, kindOf } from '../map/kinds.js';
import { arrOf } from '../map/validate.js';
import { printDoc } from './print.js';

/* ================= the standalone viewer =================
   One-row top bar · column browser of views on the left · map on top · details strip below; built on render().
   It owns the page: the document title, the URL hash (#view=&node=), keyboard shortcuts and saved preferences. */
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('visual-theme', next); } catch (e) {}
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
      <button class="ibtn" id="m-theme" title="Light / dark" aria-label="Dark theme" aria-pressed="false">◐</button>${(D.stories || []).length ? `
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
  const handle = render($('m-canvas'), model, {
    view: v0, minimap: true, flow: flowPref ? flowPref === '1' : undefined,
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
  // #pdf=1 (umlimator.py pdf, #93): the page becomes a document for Chrome to print (printDoc), once the fonts are in,
  // after the map's own redraw for them
  if (Q.get('pdf')) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => printDoc(X, model, Q));
  return handle;
}
