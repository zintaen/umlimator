import { isRec } from '../canvas/edit.js';
import { TYPED } from '../core/registry.js';
import { arrOf } from '../map/validate.js';

/* A type's editing hooks on the canvas (work package 3.4, notes/stage-3.md §5.1). Only lib/umlimator-all.js holds this file
   (risks.md C5): it fills TYPED.edit (registry.js), which typedEditor (src/canvas/edit.js) calls with its gestures, I, to take
   some over, and c, what they need of its insides. Without it a typed view is edited as in 0.17.0.
   Each hook of the type's `edits` returns commands (one transaction, emitted as an `edit` event), { commands, say } (emitted,
   and `say` said on the hint line), null to leave the gesture to the default, or { error }, said on the hint line, with
   nothing emitted (S5):
   - connect(model, view, from, to, at, line): a line drawn by pointer (at: the slot nearest the release) or by L (the slot
     after the element selected, else the last). A line from an element to itself is drawn too, by pointer or by typing its
     own name after L (a self-message, a reflexive association). A press on a lifeline's stem (SHAPE.lifeline's .ll-hit)
     draws a line too, released on another stem or its own.
   - moveTo(model, view, id, at): a card or line dropped (the slot nearest the drop: a line's pointer, a card's edge that
     leads the move; a card's at also holds pt, the point its centre was dropped at), Alt + arrows ({ by: [dx, dy] }), or a
     member's ↑ and ↓ in the panel and Alt + Up/Down on it ({ by: [0, ±1] }; null: the member list's own move). Null: the
     card's pin, as before, unless the type has layout.pins false.
   - wrap(model, view, ids, kind): W, then a picker of the type's `wraps` (strings, or entries with a label).
   - add(model, view, entry, label, at): the palette and N, once the name is typed; at as for L, with sel, the ids selected.
   - remove(model, view, ids, fromModel): Delete (fromModel false), Shift + Delete, the panel's buttons and the outline's ✕.
   A slot is an entry of the geometry's `slots` ({ index, y, parent, after }, src/layout/timeaxis.js; x too where a type has
   one); with none, at is null. A view's fragments (view.fragments) are elements too: selected, they show their properties and
   their members (operands) in the panel, as a card does; a double-click on a selected member drawn as a card (an operand's
   guard), or on a selected line, renames it, as F2 does. */

const DIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

TYPED.edit = (I, c) => {
  const { api, model, view, hook, emit } = c, base = { ...I }, can = api.can;
  I.self = true;
  const slots = () => arrOf((api.geo() || {}).slots).filter(isRec);
  const near = (x, y) => { let best = null, bd = Infinity; // the slot nearest a point of the picture
    slots().forEach(s => { const d = Math.abs(s.y - y) + (Number.isFinite(s.x) ? Math.abs(s.x - x) : 0); if (d < bd) { bd = d; best = s; } }); return best; };
  const keyAt = () => { const S = slots(), s = api.sel(), id = s && (s.id ?? arrOf(s.ids)[0]); return S.find(x => x.after != null && x.after === id) || S.at(-1) || null; };
  const world = ev => { const r = api.stage.getBoundingClientRect(); return api.cam().toWorld(ev.clientX - r.left, ev.clientY - r.top); };
  // what a hook returned: null, the default; { error }, said; else its commands
  const ran = (r, dflt) => { if (r == null) return dflt();
    if (isRec(r) && r.error != null) { api.status(String(r.error)); api.say(String(r.error)); return false; }
    if (isRec(r) && Array.isArray(r.commands)) { if (r.say != null) { api.status(String(r.say)); api.say(String(r.say)); } return emit(r.commands); }
    return emit(arrOf(r)); };
  I.ran = ran; // connect's result, read by the core's addLine

  I.connect = (from, to, ev, at) => base.connect(from, to, ev, at !== undefined ? at : ev ? near(...world(ev)) : keyAt());
  I.drop = (n, hint, into, from) => { const h = hook('moveTo'), dflt = () => base.drop(n, hint, into, from), dy = hint.y - (n.y + n.h / 2);
    return h && can('move') ? ran(h(model(), view(), n.id, { ...near(hint.x, hint.y + Math.sign(dy) * n.h / 2), pt: [hint.x, hint.y] }), dflt) : dflt(); };
  I.addNode = i => { const h = hook('add'), t = c.nodeTypes()[i], cam = api.cam(); if (!h || !t || !can('add') || !cam) return base.addNode(i);
    const s = keyAt(), at = s && { ...s, sel: c.picks() }; // where the selection is now, before the name field takes the focus
    api.editor({ x: cam.s.cx - 80, y: cam.s.cy - 13, w: 160, h: 26 }, '', label => ran(h(model(), view(), t, label, at),
      () => emit([{ op: 'add', element: { ...c.typed(t, 'node'), label }, view: api.view() }]))); };
  I.remove = (fromModel, ids = c.picks()) => { const h = hook('remove'), dflt = () => base.remove(fromModel, ids);
    return h && can('delete') && ids.length ? ran(h(model(), view(), ids, !!fromModel), dflt) : dflt(); };
  function wrap(ids) { // W: the picker of the type's wraps, under the first card selected, else under the far end of the first line
    const h = hook('wrap'), list = arrOf(c.def().wraps), opts = list.map(w => isRec(w) ? w : { label: String(w) }), g = api.geo();
    const at = ids.find(id => Object.hasOwn(g.byId || {}, id)) ?? (g.edges.find(x => ids.includes(x._id)) || {}).to;
    if (!opts.length || at == null) return api.status('Nothing to wrap it in');
    c.picker(at, opts, t => ran(h(model(), view(), ids, list[opts.indexOf(t)]), () => true));
    const m = api.stage.querySelector('.um-pick'); if (m) m.setAttribute('aria-label', 'Wrap in');
  }
  I.key = e => {
    if (I.linking()) return base.key(e);
    const K = e.key, ids = c.picks(), mv = hook('moveTo');
    if (e.altKey && DIR[K] && mv && ids.length && can('move')) { const r = mv(model(), view(), ids.at(-1), { by: DIR[K] }); if (r == null) return base.key(e); ran(r); return true; }
    if ((K === 'w' || K === 'W') && !e.altKey && hook('wrap') && can('add') && ids.length) { wrap(ids); return true; }
    return base.key(e);
  };

  /* a line dragged, when the type has moveTo: a ghost follows the pointer, and the drop asks moveTo with the slot nearest it.
     A press on a lifeline's stem, when the type has connect: a line follows the pointer from the press, and the release on
     a stem connects the two (I.connect, at the slot nearest the release). Either press is the gesture's, not the camera's
     nor a card drag's; the click after the drag selects nothing */
  let drag = null, swallow = false;
  const stop = () => { const d = drag; drag = null; if (d && d.ghost) d.ghost.remove(); return !!(d && d.on); };
  api.stage.addEventListener('pointerdown', e => { // a stem, before the card's own drag (capture)
    swallow = false; // a new press: the click a drag left behind is not coming
    const s = e.button === 0 && !e.altKey && I.on() && hook('connect') && can('add') && e.target.closest && e.target.closest('.ll-hit'), g = s && s.closest('.node');
    if (!g || !api.geo().byId[g.dataset.id]) return;
    e.stopPropagation();
    drag = { from: g.dataset.id, p: world(e), x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
  }, true);
  api.stage.addEventListener('pointerdown', e => {
    const g = !drag && e.button === 0 && !e.altKey && I.on() && hook('moveTo') && can('move') && e.target.closest && e.target.closest('.edge-g'), x = g && api.geo().edges[+g.dataset.i];
    if (!x || x.id == null) return;
    e.stopImmediatePropagation();
    drag = { id: x.id, g, x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
  });
  api.stage.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.on = true; try { api.stage.setPointerCapture(drag.pid); } catch (_) { /* a synthetic press holds no pointer */ }
      if (drag.from != null) { api.svg().insertAdjacentHTML('beforeend', '<path class="um-edit um-link"/>'); drag.ghost = api.svg().lastElementChild; }
      else { drag.ghost = drag.g.cloneNode(true); drag.ghost.classList.add('um-ghost'); api.svg().appendChild(drag.ghost); }
      api.touch(); }
    if (drag.from != null) { const [x, y] = world(e); drag.ghost.setAttribute('d', `M ${drag.p[0]} ${drag.p[1]} L ${x} ${y}`); return; }
    const k = api.cam().s.k; drag.ghost.setAttribute('transform', `translate(${(e.clientX - drag.x0) / k} ${(e.clientY - drag.y0) / k})`);
  });
  api.stage.addEventListener('pointerup', e => { const d = drag, h = hook('moveTo'); if (!stop()) return; swallow = true;
    if (d.from != null) { const t = api.root.elementFromPoint(e.clientX, e.clientY), g = t && t.closest && t.closest('.node'), [x, y] = world(e);
      // on a card, else on a stem where its strip is cut (a message's row, a bar): the lifeline whose stem it is
      const to = g && api.geo().byId[g.dataset.id] ? g.dataset.id : (api.geo().nodes.find(n => isRec(n.stem) && Math.abs(n.stem.x - x) <= 12 && y >= n.stem.y1 && y <= n.stem.y2) || {}).id;
      if (to != null) I.connect(d.from, to, e); }
    else if (h) ran(h(model(), view(), d.id, near(...world(e))), () => true);
    api.touch(); });
  api.stage.addEventListener('pointercancel', stop);
  api.stage.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  I.cancel = () => { const a = stop(); if (a) swallow = true; return base.cancel() || a; };
  I.mount = () => { stop(); base.mount(); };

  // a double-click on a selected operand (a member drawn as a card) or line: its name, as F2 (before the card's open)
  api.stage.addEventListener('dblclick', e => {
    const s = api.sel(), g = I.on() && can('rename') && s && e.target.closest && (e.target.closest('.node') || e.target.closest('.edge-g, .e-lab'));
    if (!g) return;
    const member = s.type === 'node' && g.dataset.id === s.id && arrOf((view() || {}).fragments).some(f => isRec(f) && arrOf(f.members).some(m => isRec(m) && m.id === s.id));
    if (!member && !(s.type === 'edge' && !g.classList.contains('node'))) return;
    e.preventDefault(); e.stopPropagation(); api.rename();
  }, true);
  /* a member's ↑ and ↓ in the panel, and Alt + Up/Down on it, ask moveTo first: an operand's occurrences move with it */
  const memberMove = (id, by, e) => { const h = hook('moveTo'); if (!h || !can('reorder') || !I.on()) return;
    const r = h(model(), view(), id, { by: [0, by] }); if (r == null) return;
    e.preventDefault(); e.stopPropagation(); ran(r); };
  api.root.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.um-editor [data-up], .um-editor [data-down]');
    if (b) memberMove(b.dataset.up ?? b.dataset.down, b.dataset.up != null ? -1 : 1, e); }, true);
  api.root.addEventListener('keydown', e => { const t = e.target;
    if (e.altKey && t && t.closest && t.closest('.um-editor') && t.dataset.m != null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) memberMove(t.dataset.m, e.key === 'ArrowUp' ? -1 : 1, e); }, true);
};
