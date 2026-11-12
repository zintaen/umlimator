import { Camera } from './camera.js';
import { typedEditor } from './edit.js';
import { hintHTML, hinter, pieces } from './pieces.js';
import { STYLES } from './styles.js';
import { esc, hostMeasure, sansW } from '../core/text.js';
import { cardLook, drawnPts, sidePorts, tabAfter, tabLine } from '../draw/shapes.js';
import { hit } from '../layout/layered.js';
import { edgeRefIds } from '../map/api.js';
import { badgesOf, mapTabs, toneOf } from '../map/cards.js';
import { warn } from '../core/warn.js';
import { diagramOf } from '../core/registry.js';
import { mapContext } from '../map/context.js';
import { canon } from '../map/diff.js';
import { cardMatcher, msText } from '../map/insight.js';
import { KIND } from '../map/kinds.js';
import { lensOf } from '../map/lens.js';
import { arrOf } from '../map/validate.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

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
  const KEYS = ['view', 'navigating', 'selection', 'expanded', 'lens', 'overlays', 'story', 'tour', 'replay', 'paused', 'camera', 'flow', 'motion', 'gesture', 'destroyed'];
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
  const pic = vid => ctx.geoCache[vid] ||= ctx.buildView(vid, { tour: P.tour !== false, openHint: P.openHint !== false }); // a view's picture: laid out once
  // each card's look, for what is drawn over the picture: rings, the minimap, a tour's or replay's dot
  const lookIn = g => { const m = new Map(), ports = sidePorts(g); return n => { if (!m.has(n)) m.set(n, cardLook(n, true, !!(n.kids || n.opens) && P.openHint !== false, ports.get(n))); return m.get(n); }; };
  const looker = () => lookIn(geo);
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
  const picked = () => sel ? [...more, sel].map(copyRef) : []; // every selected thing, the latest last (more: the others' refs)
  const say = t => { const l = root.querySelector('.um-live'); if (l) l.textContent = t; };
  const nodeG = id => [...svg.querySelectorAll('.node')].find(x => x.dataset.id === id), ringOf = id => [...svg.querySelectorAll('.node-key')].find(x => x.dataset.node === id); // no CSS.escape: jsdom has none
  const nameOf = id => ctx.nodeIn(id, cur).label || ((geo.families || []).find(f => f.id === id) || {}).label || id;
  let said = '[]'; // the selection last reported: a select event means it changed, or a click asked again (again)
  const emitSel = (again = false) => {
    const now = JSON.stringify(picked()); if (now === said && !again) return; said = now;
    say(!sel ? 'Nothing selected' : (sel.type === 'node' ? nameOf(sel.id) : sel.type === 'edge' ? (e => e ? `Line from ${nameOf(e.from)} to ${nameOf(e.to)}` : 'Line')(geo.edges[edgeIndex(sel)])
      : `Box ${(svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"] .family-title`) || {}).textContent || sel.id}`) + (more.length ? `, ${more.length + 1} ${picked().every(r => r.type === 'node') ? 'cards ' : ''}selected` : ', selected'));
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
    if (tx) tx.mount(); // a typed view's panels (1.7)
    touch();
    return true;
  }
  // at fit the cards keep off the pieces over the map (#99): the views list's button, the hint line, and the legend, which
  // the map leaves room for above it or to its right, whichever leaves the map larger
  const lg = q('.m-legend'), fitIn = () => { const I = { t: q('.um-navbtn') ? 54 : 16, r: 16, b: tell ? 40 : 16, l: 16 + (tx ? tx.width() : 0) }; // a typed view's panels, left
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
    const b = geo.bounds, el = q('.minimap'), bw = Math.max(2, b.w / 300);
    // a box's tone, as its region, dashed as in the picture
    const rg = (geo.families || []).filter(f => f.tone).map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" style="--um-tone:${toneOf(f)}" fill="var(--um-tone, var(--um-slate))" fill-opacity=".14" stroke="var(--um-tone, var(--um-slate))" stroke-width="${bw}" stroke-dasharray="${bw * 4} ${bw * 3}"/>`).join('');
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
    if (tx) tx.paint();
    svg.querySelectorAll('.um-handle').forEach(h => h.remove());
    if (can('add') && sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id];
      svg.insertAdjacentHTML('beforeend', `<g class="um-edit um-handle" data-from="${esc(n.id)}"><title>Drag to another card to add a line</title><circle cx="${n.x + n.w + 12}" cy="${n.y + n.h / 2}" r="6"/></g>`); }
    svg.querySelectorAll('.sel,.nb,.hot').forEach(g => g.classList.remove('sel', 'nb', 'hot')); stage.classList.remove('focusing');
    const pk = picked(), ns = pk.filter(r => r.type === 'node').map(r => r.id), li = pk.filter(r => r.type === 'edge').map(edgeIndex);
    svg.querySelectorAll('.line-key').forEach(k => k.setAttribute('aria-pressed', li.includes(+k.dataset.i))); svg.querySelectorAll('.node, .node-key').forEach(g => g.setAttribute('aria-pressed', ns.includes(g.dataset.id ?? g.dataset.node)));
    if (!sel) return;
    if (sel.type === 'node') {
      const nid = sel.id, ups = new Set(), downs = new Set();
      geo.edges.forEach(e => { if (e.to === nid) ups.add(e.from); if (e.from === nid) downs.add(e.to); });
      svg.querySelectorAll('.node').forEach(g => { const id = g.dataset.id; g.classList.toggle('sel', ns.includes(id)); g.classList.toggle('nb', ups.has(id) || downs.has(id)); });
      svg.querySelectorAll('.edge-g').forEach(g => g.classList.toggle('hot', g.dataset.from === nid || g.dataset.to === nid));
      svg.querySelectorAll('.e-lab').forEach(g => { const e = geo.edges[g.dataset.i]; g.classList.toggle('hot', e.from === nid || e.to === nid); });
      svg.querySelectorAll('.n-port[data-edges]').forEach(p => p.classList.toggle('hot', p.dataset.edges.split(',').some(i => geo.edges[i] && (geo.edges[i].from === nid || geo.edges[i].to === nid)))); // not an ease's fading copy (#67)
      stage.classList.add('focusing');
    } else if (sel.type === 'edge') {
      const e = geo.edges[edgeIndex(sel)];
      svg.querySelectorAll('.node').forEach(g => { g.classList.toggle('sel', ns.includes(g.dataset.id)); g.classList.toggle('nb', g.dataset.id === e.from || g.dataset.id === e.to); }); // a card selected before the line stays selected
      stage.classList.add('focusing');
    } else if (sel.type === 'container') {
      const f = svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"]`); if (f) f.classList.add('sel');
    }
    li.forEach(i => svg.querySelectorAll(`.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(g => g.classList.add('hot'))); // the lines selected
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

  /* several cards: Shift (or Cmd / Ctrl) + click adds a card to the selection, or takes it out; on a typed view a line too, and
     Shift + Enter on its ring (notes/stage-3.md §5.1). ref: a nodeRef or edgeRef */
  const kinds = () => typed() ? ['node', 'edge'] : ['node'], refKey = r => JSON.stringify([r.type, r.id, r.ids]);
  function toggle(ref) {
    const k = refKey(ref);
    if (k === refKey(sel)) { if (!more.length) return select(null); sel = more.pop(); }
    else if (more.some(r => refKey(r) === k)) more = more.filter(r => refKey(r) !== k);
    else { more.push(sel.type === 'node' ? nodeRef(sel.id) : sel); sel = ref; }
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
    const k = e.key, nk = e.target && e.target.closest && e.target.closest('.node-key'), g = nk ? nodeG(nk.dataset.node) : e.target && e.target.closest && e.target.closest('.node'); // a node's ring (svg.js): the node
    if (k === 'Escape' && cancelGesture()) return true; // Escape stops a gesture in progress before anything else
    if (story) { const r = storyKey(e); if (r != null) return r; } // a story's keys first (#69)
    if (k === 'Escape' && trip && trip.kind) { const was = trip.kind; endTrip(); say(was === 'replay' ? 'Replay stopped' : 'Tour stopped'); return true; } // Esc ends a tour or a replay first
    if (E && (typed() ? tx.key(e) : editKey(e))) return true;
    if (e.altKey) return false;
    const lk = e.target && e.target.closest && e.target.closest('.line-key'), tk = e.target && e.target.closest && e.target.closest('.tab-key, .family [data-badge]');
    const ck = e.target && e.target.closest && e.target.closest('.chip-key'), card = ck && [...svg.querySelectorAll('.node')].find(x => x.dataset.id === ck.dataset.node);
    const add = k === 'Enter' && e.shiftKey && sel && kinds().includes(sel.type) && typed(); // Shift + Enter: into the selection, or out of it
    if (k === 'Enter' && lk && geo.edges[+lk.dataset.i]) add ? toggle(edgeRef(geo.edges[+lk.dataset.i])) : select(edgeRef(geo.edges[+lk.dataset.i]), { again: true }); // as a click on the line (#43)
    else if (k === 'Enter' && tk) { const fam = tk.closest('.family'), ref = badgeRef(tk.dataset.node, fam ? fam.dataset.family : null, +tk.dataset.badge); if (activate(ref, e)) select(ref); }
    else if (k === 'Enter' && card) { const ref = chipRef(card, +ck.dataset.chip); if (activate(ref, e)) select(ref); } // as a click on the chip
    else if (k === 'e' || k === 'E') return gesture(g ? g.dataset.id : sel && (sel.type === 'node' || sel.type === 'container') ? sel.id : null, 'key'); // unfold here, or fold back (#71)
    else if (k === '+' || k === '=') cam.zoomAt(1.4, null, null, true);
    else if (k === '-' || k === '_') cam.zoomAt(1 / 1.4, null, null, true);
    else if (k === '0') cam.fit();
    else if (k === '1') cam.actual();
    else if (k === 'Enter' && (g || (sel && sel.type === 'node'))) { // a selected card opens its inner view; without one it is selected again, as a click does
      const id = g ? g.dataset.id : sel.id;
      if (add) toggle(nodeRef(id)); else if (sel && sel.type === 'node' && sel.id === id && ctx.opensOf(id, cur)) open(id); else select(nodeRef(id), { again: true }); }
    else if (k === 'Escape' || k === 'Backspace') { if (sel) select(null); else up(); }
    else if ((k === 'f' || k === 'F') && !reducedMotion()) setFlow(!stage.classList.contains('flowing')); // under reduced motion no flow is drawn, and ≋ isn't offered
    else if (k.startsWith('Arrow') && g && geo.byId[g.dataset.id]) { const to = nearest(geo.byId[g.dataset.id], k); if (!to) return false;
      (ringOf(to.id) || nodeG(to.id)).focus({ preventScroll: true }); cam.reveal({ x: to.x, y: to.y, w: to.w, h: to.h }); }
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
  const gestureNow = () => conn || (tx && tx.linking()) ? 'connecting' : drag && drag.on ? 'dragging' : naming ? 'naming' : 'idle';
  function cancelGesture(keepName = false) { // true when something was in progress
    let was = false;
    if (conn) { if (conn.path) conn.path.remove(); conn = null; was = stale = true; } // its pointerup and click then do nothing
    if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.on) was = stale = true; drag = null; }
    if (naming && !keepName) { naming.close(false); was = true; }
    if (tx && tx.cancel()) was = true;
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
    const T = typed() && (ctx.V[cur] || {}).direction === 'down', X = n => T ? n.y + n.h / 2 : n.x + n.w / 2, Y = n => T ? n.x : n.y; // a typed view laid out down: its columns run down
    if (T) [x, y] = [y, x];
    const cols = [...new Set(geo.nodes.filter(n => !n.aside).map(n => n.col))].sort((a, b) => a - b); // the row of cards with no line keeps off the columns
    const mid = c => { const ns = geo.nodes.filter(n => n.col === c && !n.aside); return ns.reduce((a, n) => a + X(n), 0) / ns.length; };
    const first = cols[0], last = cols[cols.length - 1], step = cols.length > 1 ? (mid(last) - mid(first)) / (last - first) : 260;
    let col = first, best = Infinity; cols.forEach(c => { const d = Math.abs(mid(c) - x); if (d < best) { best = d; col = c; } });
    if (x > mid(last) + step / 2) col = last + Math.round((x - mid(last)) / step);
    else if (x < mid(first) - step / 2) col = Math.max(0, first - Math.round((mid(first) - x) / step));
    const a = geo.nodes[0], b = geo.nodes.find(n => n.row !== a.row), pitch = b ? (Y(b) - Y(a)) / (b.row - a.row) : 108;
    h.col = col; h.row = Math.max(0, Math.round((y - (Y(a) - a.row * pitch) - 32) / pitch));
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
    editor(null, text, v => typed() ? tx.label(ref, v) : change({ op: 'rename', target: ref, label: v }), ref);
  }
  function addAt(x, y) {
    if (!can('add') || !geo) return;
    if (typed()) return tx.add();
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
    const id = ref && (ref.type === 'node' ? ref.id : ref.node), g = id && svg && (ringOf(id) || nodeG(id));
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
      if (t && geo.byId[t.dataset.id]) typed() ? tx.connect(c.from, t.dataset.id, e) : t.dataset.id !== c.from && change({ op: 'add', kind: 'edge', from: c.from, to: t.dataset.id }); // a typed view: maybe to itself (I.self, edit.js)
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
    if (typed()) ev = tx.drop(n, hint, toId, fromId); // a typed view: the card's pin, and its owner when it left its box (notes/stage-2.md §8)
    else if (toId !== fromId && can('move')) ev = change({ op: 'move', target: nodeRef(n.id), to: toId, hint });
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
     takes its hint; kept in this handle only, never written to the host's model. A typed view's boxes take no slot, and an edit
     that changed the box an element shown before and after is drawn in lays the view out again, so every box holds exactly its
     contents (notes/stage-2.md §3.2); hiding or deleting a card keeps the places */
  const boxesIn = (m, v) => { const T = m && m.schemaVersion === 2 && v && v.diagram != null && diagramOf(v); return T && T.boxes ? arrOf(T.boxes(m, v)).filter(b => b && b.id != null) : []; };
  const ownersOn = bs => new Map(bs.flatMap(b => [[b.id, b.parent ?? null], ...arrOf(b.nodeIds).map(id => [id, b.id])])); // id -> the box it is drawn in
  function withPlaces(m, use = null, prev = null) { // use: an edit the update applied, { view, hv: id -> its place, ex: a reordered group's places }; prev: the model before
    if (options.stableLayout === false) return m;
    const out = structuredClone(m);
    (out.views || []).forEach(v => {
      const bx = boxesIn(out, v), pv = viewIn(prev, v.id), A = ownersOn(boxesIn(prev, pv)), B = ownersOn(bx);
      const shown = new Set(arrOf(pv.nodeIds)), again = A.size + B.size > 0 && arrOf(v.nodeIds).some(id => shown.has(id) && (A.get(id) ?? null) !== (B.get(id) ?? null));
      const was = again ? null : placed[v.id], { hv = {}, ex = {} } = use && use.view === v.id && !again ? use : {};
      if (!was && !Object.keys(hv).length && !Object.keys(ex).length) return;
      const ids = (v.nodeIds || []).filter(id => typeof id === 'string' && !bx.some(b => b.id === id)), mine = v.layout || {}, L = {}, taken = new Set(), key = p => p[0] + ',' + p[1];
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
      if ((e.shiftKey || e.metaKey || e.ctrlKey) && sel && kinds().includes(ref.type) && kinds().includes(sel.type)) return toggle(ref); // several cards, and lines
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
    const old = ctx, keys = {}, wantNew = selectNew && !own, before = current;
    old.views.forEach(v => { keys[v.id] = relayout ? null : old.viewKey(v.id); });
    current = model2;
    ctx = mapContext(withPlaces(model2, use, before), { measure, kinds: !!P.kinds, prev: options.stableLayout === false ? null : old.planCache, expand: expanded, memos: relayout ? null : old.memos });
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
    if (ctx.geoCache[cur] && keys[cur] === ctx.viewKey(cur)) { if (lensId != null) { relens(); drawMarks(); } if (pc) pc.chrome(); if (P.onMount) P.onMount(inner); return; } // this view's picture did not change (its lens or the views may have; the page reads the new model, issue 133)
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
      if (keep && exists(keep)) { sel = keep; more = keepMore.filter(exists); paint(); }
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
    const look = lookIn(g);
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

  /* a typed view of a version 2 model (1.7): its gestures emit `edit`, a transaction of commands, and its panels show */
  const tx = E && typedEditor({ root, stage, can, say, status, touch, nearest, nameOf, editor, picked,
    emit: commands => emit('edit', { view: cur, commands }), view: () => cur, model: () => current, geo: () => geo, svg: () => svg, cam: () => cam, sel: () => sel,
    selectId: id => { const e = geo.byId[id] ? null : geo.edges.find(x => edgeRefIds(x).includes(id)); return e ? select(edgeRef(e)) : select(nodeRef(id)); },
    drawn: id => !!geo.byId[id] || geo.edges.some(x => edgeRefIds(x).includes(id)), rename: () => rename(sel), focus: () => focusMap() });
  const typed = () => !!tx && tx.on();

  const inner = { ctx: () => ctx, geo: () => geo, cam: () => cam, svg: () => svg, stage, host, go, open, up, flash, setFlow, pause, key, startView, standalone, play,
    select, busy: () => busy, flowing: () => stage.classList.contains('flowing'), view: () => cur, unfold: gesture, lens: setLens,
    highlight, overlay, focus: focusMap, editable: !!E }; // a story's pointer is the pieces' own, from the story event (0.14.0)

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
  const camNow = () => { const r = (x, d) => Math.round(x * d) / d; return cam ? { x: r(cam.s.cx, 10), y: r(cam.s.cy, 10), zoom: r(cam.s.k, 1000) } : { x: 0, y: 0, zoom: 1 }; };
  function snapshot(event = false) { // MapState: built fresh on every read, frozen all the way down, plain JSON; event: the camera at rest
    const deep = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return Object.freeze(o); }, st = story, t = trip;
    return deep({ view: cur, navigating: nav ? nav.to : null, selection: picked(), expanded: [...(expanded[cur] || [])], lens: lensId, overlays: [...layers.keys()],
      story: st ? { id: st.s.id, step: st.at, steps: st.steps.length, playing: !!st.auto } : null, tour: !!(t && t.kind === 'tour'), replay: t && t.kind === 'replay' ? { playing: !t.paused } : null, paused: !!paused,
      camera: event && camRest ? { ...camRest } : camNow(), flow: stage.classList.contains('flowing'), motion: motionOf(), gesture: gestureNow(), destroyed: dead });
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
    update: m => { update(m); if (tx && !dead) tx.refresh(); },
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

export { h, reducedMotion, pngOf };
