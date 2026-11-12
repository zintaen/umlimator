import { diagramOf } from '../core/registry.js';
import { esc } from '../core/text.js';
import { arrOf, validate } from '../map/validate.js';

/* ---------- editing a typed view (work package 1.7) ----------
   In a schema version 2 model drawn with `editable`, a view whose `diagram` is set and is not 'map' is edited with
   commands (src/core/apply.js): each gesture emits one `edit` event, { view, commands }, a transaction the host applies with
   apply() and hands back with update(). Nothing is drawn before that (risks.md E12). A map view keeps the `change` event.
   The type's definition drives the panels (registry.js): `elements` the palette, `lines` the relationship picker, `props`
   the properties form. A type this release does not know gets one generic node and one generic line,
   core.Node and core.Line: a typed view's lines are typed, or validate() refuses them.

   Keys on a typed view: F2 renames, N adds the palette's first element, L connects (arrows or type a name, Enter),
   Alt + arrows move the card's pin, Delete hides it from this view, Shift + Delete deletes it from the model. A box the type
   gives (registry.js boxes) is selected as a container and takes F2, Delete and the panel as a card does; a card dropped in
   another box, or the Owner field, gives it a new owner (reparent). */

const GENERIC_NODE = { type: 'core.Node', label: 'Node' }, GENERIC_LINE = { type: 'core.Line', label: 'Line' };
const isRec = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/* every element of a model by id: { x, kind, owner } (owner: the element a member belongs to) */
function elementsOf(m) {
  const at = new Map(), put = (x, kind, owner) => { if (!isRec(x) || typeof x.id !== 'string' || at.has(x.id)) return;
    at.set(x.id, { x, kind, owner }); arrOf(x.members).forEach(y => put(y, 'member', x)); };
  arrOf(m && m.nodes).forEach(n => put(n, 'node')); arrOf(m && m.edges).forEach(e => put(e, 'edge'));
  arrOf(m && m.views).forEach(v => { if (isRec(v)) { arrOf(v.nodes).forEach(n => put(n, 'node')); arrOf(v.edges).forEach(e => put(e, 'edge')); } });
  return at;
}

/* the element a validate() problem's path names last ('nodes[2].members[0].type': that member), or null */
function elementAt(m, path) {
  let o = m, id = null;
  for (const [, k, i] of String(path).matchAll(/(\w+)(?:\[(\d+)\])?/g)) {
    o = isRec(o) ? o[k] : undefined; if (i != null) o = Array.isArray(o) ? o[+i] : undefined;
    if (i != null && ['nodes', 'edges', 'members'].includes(k) && isRec(o) && typeof o.id === 'string') id = o.id;
  }
  return id;
}

/* api: what render() lends: root, stage, can, say, status, emit(commands), view(), model() (the host's), geo(), svg(),
   cam(), sel(), picked(), selectId(id), drawn(id), nearest(node, key), nameOf(id), editor(box, text, done), rename(), focus(), touch() */
function typedEditor(api) {
  const { root, can, say } = api;
  let link = null, menu = null, panel = null, orphans = false, last = {};
  const model = () => api.model() || {};
  const view = () => arrOf(model().views).find(v => isRec(v) && v.id === api.view()) || null;
  const on = () => { const v = view(); return model().schemaVersion === 2 && !!v && v.diagram != null && v.diagram !== 'map'; };
  const def = () => diagramOf(view()) || {};
  const entries = k => arrOf(def()[k]).filter(t => isRec(t) && typeof t.type === 'string');
  const nodeTypes = () => entries('elements').length ? entries('elements') : [GENERIC_NODE];
  const lineTypes = () => entries('lines').length ? entries('lines') : [GENERIC_LINE];
  const emit = commands => { if (commands.length) api.emit(commands); return true; };
  const newId = base => { // the base and the first number free in the model: 'class1', 'line2'
    const used = new Set(); JSON.stringify(model(), (k, v) => { if (k === 'id' && typeof v === 'string') used.add(v); return v; });
    const b = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el'; let k = 1; while (used.has(b + k)) k++; return b + k; };
  const typeOf = x => typeof x.type === 'string' && x.type ? x.type : null; // a model may hold anything in type
  const typed = (t, base) => { const ty = typeOf(t); return { id: newId(ty ? ty.split('.').pop() : base), ...(ty ? { type: ty } : {}) }; };
  const idsOf = r => !r ? [] : r.type === 'node' || r.type === 'container' && elementsOf(model()).has(r.id) ? [r.id] : r.type === 'edge' ? arrOf(r.ids).filter(x => !String(x).includes('->')) : []; // not a positional line id
  const selId = (at = elementsOf(model())) => { const id = idsOf(api.sel())[0]; return id && at.has(id) ? id : null; };
  const top = (id, at = elementsOf(model())) => { let e = at.get(id); while (e && e.owner) e = at.get(e.owner.id); return e ? e.x.id : id; }; // a member: its node

  /* the gestures */
  const label = (ref, value) => { const at = elementsOf(model()), id = idsOf(ref).find(x => at.has(x)); if (id && can('rename')) emit([{ op: 'set', id, path: 'label', value }]); };
  const pin = (id, c, r) => can('move') && Number.isFinite(c) && Number.isFinite(r) && c >= 0 && r >= 0 && emit([{ op: 'set', view: api.view(), path: ['layout', id], value: [c, r] }]);
  // a drop (notes/stage-2.md §8): in the box it is drawn in, its pin; into another box, or out of every box, a new owner (the
  // box's, else the view's subject or none), in one transaction. The view is then laid out again (§3.2), so a slot read off the
  // picture before would land elsewhere and stretch a box over cards it does not hold: no pin, and a pin it had is removed.
  // into, from: the box under the drop, the box it was in
  const drop = (n, hint, into = null, from = null) => { const L = view().layout; return into === from ? (hint.col !== n.col || hint.row !== n.row) && pin(n.id, hint.col, hint.row)
    : can('move') && emit([{ op: 'reparent', id: n.id, parent: into ?? view().subject ?? null }, ...(isRec(L) && Object.hasOwn(L, n.id) ? [{ op: 'set', view: api.view(), path: ['layout', n.id], value: undefined }] : [])]); };
  function remove(fromModel) { // Delete: out of this view; Shift + Delete: out of the model (risks.md E5). One transaction for the selection (E2)
    const ids = [...new Set(api.picked().flatMap(idsOf))]; if (!can('delete') || !ids.length) return false;
    if (fromModel) return emit(ids.map(id => ({ op: 'delete', id })));
    const v = view(), own = new Set([...arrOf(v.nodes), ...arrOf(v.edges)].filter(isRec).map(x => x.id)), at = elementsOf(model()), out = [];
    ids.forEach(id => { const e = at.get(id);
      if (own.has(id)) out.push({ op: 'delete', id }); // lives in this view only: hiding it is deleting it
      else if (e && e.kind === 'edge' && !Array.isArray(v.edges)) api.status('This view shows every line between its cards: Shift + Delete deletes the line');
      else out.push({ op: 'hide', id, view: v.id }); });
    return emit(out);
  }
  function addNode(i) {
    const t = nodeTypes()[i], cam = api.cam(); if (!t || !can('add') || !cam) return;
    api.editor({ x: cam.s.cx - 80, y: cam.s.cy - 13, w: 160, h: 26 }, '', value => emit([{ op: 'add', element: { ...typed(t, 'node'), label: value }, view: api.view() }]));
  }
  const hook = k => { const E = def().edits; return isRec(E) && typeof E[k] === 'function' ? E[k] : null; }; // registry.js edits
  const addLine = (from, to, t) => { const c = hook('connect'); // at (a slot): stage 3's
    emit(c ? arrOf(c(model(), view(), from, to, null, t)) : [{ op: 'add', element: { ...typed(t, 'line'), from, to, ...(isRec(t.props) ? { props: structuredClone(t.props) } : {}) }, view: api.view() }]); };
  function connect(from, to) { // the relationship picker, when the type has more than one kind of line
    if (!can('add') || !from || !to || from === to) return;
    const types = lineTypes();
    if (types.length === 1) addLine(from, to, types[0]); else picker(to, types, t => addLine(from, to, t));
  }
  function closeMenu(back) { const m = menu; if (!m) return false; menu = null; m.remove(); if (back) api.focus(); api.touch(); return true; }
  function picker(at, types, done) {
    closeMenu(false);
    const n = api.geo().byId[at], cam = api.cam(); if (!n || !cam) return;
    const [W, H] = cam.size(), k = cam.s.k, m = document.createElement('div');
    m.className = 'um-edit um-pick'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Kind of line');
    m.innerHTML = types.map((t, i) => `<button role="menuitem" data-i="${i}">${esc(t.label || t.type)}</button>`).join('');
    Object.assign(m.style, { left: Math.round((n.x + n.w / 2 - cam.s.cx) * k + W / 2) + 'px', top: Math.round((n.y + n.h - cam.s.cy) * k + H / 2 + 4) + 'px' });
    api.stage.appendChild(m); menu = m; api.touch();
    const items = [...m.querySelectorAll('button')];
    m.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button'); if (!b) return; closeMenu(true); done(types[+b.dataset.i]); });
    m.addEventListener('keydown', e => { e.stopPropagation(); const i = items.indexOf(root.activeElement), K = e.key;
      if (K === 'ArrowDown' || K === 'ArrowUp') { e.preventDefault(); items[(i + (K === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      else if (K === 'Enter' && i >= 0) { e.preventDefault(); items[i].click(); }
      else if (K === 'Escape') { e.preventDefault(); closeMenu(true); } });
    m.addEventListener('focusout', e => { if (!m.contains(e.relatedTarget)) closeMenu(false); });
    m.addEventListener('pointerdown', e => e.stopPropagation());
    items[0].focus();
  }

  /* keyboard connect: L on a selected card, then arrows or a name typed to pick the other end, Enter to choose */
  function mark() {
    const svg = api.svg(); if (!svg) return;
    svg.querySelectorAll('.node.um-target').forEach(g => g.classList.remove('um-target')); svg.querySelectorAll('.um-klink').forEach(p => p.remove());
    if (!link || !link.to) return;
    const g = [...svg.querySelectorAll('.node')].find(x => x.dataset.id === link.to), a = api.geo().byId[link.from], b = api.geo().byId[link.to];
    if (g) g.classList.add('um-target');
    if (a && b) svg.insertAdjacentHTML('beforeend', `<path class="um-edit um-link um-klink" d="M ${a.x + a.w} ${a.y + a.h / 2} L ${b.x + b.w / 2} ${b.y + b.h / 2}"/>`);
    say(`Line from ${api.nameOf(link.from)} to ${api.nameOf(link.to)}: Enter to choose`);
  }
  const endLink = () => { const was = !!link; link = null; mark(); if (was) api.touch(); return was; };
  function linkKey(e) {
    const K = e.key;
    if (K === 'Escape') { endLink(); say('No line added'); return true; }
    if (K === 'Enter') { const { from, to } = link; if (!to || to === from) { say('Pick another card first'); return true; } endLink(); connect(from, to); return true; }
    if (K.startsWith('Arrow')) { const g = api.geo(), n = api.nearest(g.byId[link.to || link.from], K); if (n) { link.to = n.id; mark(); } return true; }
    if (K.length === 1 && !e.altKey) { const now = performance.now(); link.find = (now - link.t < 900 ? link.find : '') + K.toLowerCase(); link.t = now;
      const hit = api.geo().nodes.find(n => n.id !== link.from && String(api.nameOf(n.id)).toLowerCase().startsWith(link.find));
      if (hit) { link.to = hit.id; mark(); } return true; }
    return false;
  }
  function key(e) { // a key on the canvas of a typed view: true when it was an edit
    if (link) return linkKey(e);
    const K = e.key, s = api.sel();
    if (e.altKey) { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[K], n = s && s.type === 'node' && api.geo().byId[s.id];
      if (!d || !n) return false; if (Number.isFinite(n.col)) pin(n.id, n.col + d[0], n.row + d[1]); return true; }
    if (K === 'F2' && s && can('rename')) { api.rename(); return true; }
    if ((K === 'n' || K === 'N') && can('add')) { addNode(0); return true; }
    if ((K === 'l' || K === 'L') && can('add') && s && s.type === 'node') {
      link = { from: s.id, to: null, find: '', t: 0 }; api.touch();
      say(`Line from ${api.nameOf(s.id)}: arrows or type a name, Enter to choose, Escape to stop`); return true; }
    if (K === 'Delete' && s) { remove(e.shiftKey); return true; }
    return false;
  }

  /* the panels: palette, properties, problems, and the outline of elements (risks.md M5) */
  function put(sel, html) { // a section drawn again only when it changed; the field that had the focus keeps it, and its text (E1)
    if (last[sel] === html) return; last[sel] = html;
    const el = panel.querySelector(sel); el.hidden = !html; // a palette with nothing to add is not there
    const a = root.activeElement, f = a && el.contains(a) ? a.dataset.f : null, text = f && a.type !== 'checkbox' ? a.value : null;
    el.innerHTML = html;
    const b = f && [...el.querySelectorAll('[data-f]')].find(x => x.dataset.f === f);
    if (b) { if (text != null && b.tagName === 'INPUT') b.value = text; b.focus(); }
  }
  const nameOf = x => String(x.label ?? (x.from != null ? `${x.from} → ${x.to}` : x.id));
  function palette() { // with `add` only
    if (!can('add')) return '';
    return '<h3>Add</h3><div class="um-row">' + nodeTypes().map((t, i) => `<button data-f="add:${i}" data-add="${i}"${i ? '' : ' title="N"'}>${esc(t.label || t.type)}</button>`).join('') + '</div>'
      + `<p class="um-note">Lines: ${lineTypes().map(t => esc(t.label || t.type)).join(', ')}. Drag a card's handle, or L</p>`;
  }
  function props() {
    const at = elementsOf(model()), id = selId(at), e = id && at.get(id);
    if (!e) return '<h3>Properties</h3><p class="um-note">Select a card or a line</p>';
    const x = e.x, P = isRec(x.props) ? x.props : {}, schema = arrOf(isRec(def().props) ? def().props[x.type] : null).filter(f => isRec(f) && typeof f.key === 'string');
    const off = can('rename') ? '' : ' disabled'; // the editable flags: a field the host does not offer is shown, to read
    const text = (f, v, name, more = '') => `<label>${esc(name)}<input data-f="${esc(f)}" data-was="${esc(v)}" value="${esc(v)}"${more}${off}></label>`;
    let h = `<h3>Properties${x.type != null ? ': ' + esc(x.type) : ''}</h3>` + text('label', x.label ?? '', 'Name');
    schema.forEach(f => { const v = Array.isArray(f.path) ? f.path.reduce((o, k) => isRec(o) ? o[k] : undefined, P) : P[f.key], name = f.label || f.key; // path: a field inside props (ends.from.role)
      const key = ` data-key="${esc(f.key)}"${Array.isArray(f.path) ? ` data-path="${esc(JSON.stringify(f.path))}"` : ''}`;
      if (f.kind === 'bool') h += `<label class="um-check"><input type="checkbox" data-f="p:${esc(f.key)}"${key}${v ? ' checked' : ''}${off}>${esc(name)}</label>`;
      else if (f.kind === 'enum') h += `<label>${esc(name)}<select data-f="p:${esc(f.key)}"${key}${off}>${['', ...arrOf(f.options)].map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
      else h += text('p:' + f.key, f.kind === 'list' ? arrOf(v).join(', ') : v ?? '', name, key + (f.kind === 'list' ? ' data-list' : '')); });
    // the Owner field (notes/stage-2.md §8): the owners the type offers, less the element and what it holds, and none
    const O = def().owners, os = e.kind !== 'member' && typeof O === 'function' ? O(model(), x) : null, under = id => { for (let k = 0, p = id; p != null && k < 64; k++, p = (at.get(p) || { x: {} }).x.parent) if (p === x.id) return true; return false; };
    // its owner is offered too when the type does not offer it (a class in a class), so the field says it and "none" is a change
    const offer = Array.isArray(os) && [{ id: '', label: 'none' }, ...os.filter(o => isRec(o) && o.id != null && !under(o.id))];
    if (offer && x.parent != null && !offer.some(o => o.id === x.parent)) offer.push({ id: x.parent, label: (at.get(x.parent) || { x: {} }).x.label });
    if (offer) h += `<label>Owner<select data-f="owner" data-owner${can('move') ? '' : ' disabled'}>${offer.map(o => `<option value="${esc(o.id)}"${o.id === (x.parent ?? '') ? ' selected' : ''}>${esc(o.label ?? o.id)}</option>`).join('')}</select></label>`;
    const rest = schema.length ? [] : Object.entries(P); // no schema: what it holds, to read
    if (rest.length) h += '<dl>' + rest.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'string' ? v : JSON.stringify(v))}</dd>`).join('') + '</dl>';
    const M = def().member;
    if (e.kind === 'node' && !(M && M.holds && !M.holds(x))) { // a comment holds none
      const ms = arrOf(x.members).filter(m => isRec(m) && typeof m.id === 'string'), line = m => M ? M.print(m) : m.label ?? ''; // a type's member text: "+ total: Money [1]" (1.9)
      h += '<h3>Members</h3><ul>' + ms.map((m, i) => `<li><input data-f="m:${esc(m.id)}" data-m="${esc(m.id)}" data-was="${esc(line(m))}" value="${esc(line(m))}" aria-label="Member ${i + 1} of ${ms.length}${can('reorder') ? ', Alt + arrows to move it' : ''}"${off}>`
        + (can('reorder') ? `<button data-f="up:${esc(m.id)}" data-up="${esc(m.id)}" aria-label="Move ${esc(nameOf(m))} up">↑</button><button data-f="down:${esc(m.id)}" data-down="${esc(m.id)}" aria-label="Move ${esc(nameOf(m))} down">↓</button>` : '') + '</li>').join('')
        + '</ul>' + (can('add') ? '<input data-f="new" data-new placeholder="New member, Enter adds it" aria-label="New member">' : '');
    }
    return h + (can('delete') ? '<div class="um-row"><button data-f="hide" data-hide title="Delete">Remove from view</button><button data-f="kill" data-kill title="Shift + Delete">Delete from model</button></div>' : '');
  }
  function problems() {
    const m = model(), vi = arrOf(m.views).indexOf(view()), at = elementsOf(m), drawn = id => api.drawn(top(id, at)); // one index for every problem; validate() itself is about 1 ms on 1000 nodes
    let list = []; try { list = validate(m); } catch (_) { /* a model validate() cannot read: no list */ }
    const mine = list.map(p => ({ ...p, id: elementAt(m, p.path) })).filter(p => p.id ? at.has(p.id) && drawn(p.id) : String(p.path).startsWith(`views[${vi}]`));
    return `<h3>Problems (${mine.length})</h3>` + (mine.length ? '<ul>' + mine.map((p, i) => `<li><button class="um-${p.level === 'error' ? 'err' : 'warn'}" data-f="pr:${i}" data-go="${esc(p.id || '')}">${esc(p.level)}: ${esc(p.message)}</button></li>`).join('') + '</ul>' : '<p class="um-note">None</p>');
  }
  function outline() {
    const m = model(), v = view(), views = arrOf(m.views).filter(isRec);
    // own: the view an element of one view only lives in (a card or a line of its own), which shows it there alone
    const shows = (w, x, line, own) => own ? w === own : line ? (Array.isArray(w.edges) ? w.edges.includes(x.id) : arrOf(w.nodeIds).includes(x.from) && arrOf(w.nodeIds).includes(x.to)) : arrOf(w.nodeIds).includes(x.id);
    const rows = [...arrOf(m.nodes).map(x => [x, false, null]), ...arrOf(m.edges).map(x => [x, true, null]),
      ...views.flatMap(w => [...arrOf(w.nodes).map(x => [x, false, w]), ...arrOf(w.edges).map(x => [x, true, w])])]
      .filter(([x, line, own]) => isRec(x) && typeof x.id === 'string' && (!orphans || !views.some(w => shows(w, x, line, own))));
    return `<h3>Elements</h3><label class="um-check"><input type="checkbox" data-f="orphans" data-orphans${orphans ? ' checked' : ''}>In no diagram</label><ul>` + rows.map(([x, line, own]) => { const n = esc(nameOf(x)), id = esc(x.id), ty = typeOf(x);
      return `<li><button data-f="go:${id}" data-go="${id}">${n}${ty ? ` <small>${esc(ty.split('.').pop())}</small>` : ''}${own ? ` <small>only in ${esc(own.title || own.id)}</small>` : ''}</button>`
        + (can('add') && !own && !shows(v, x, line) && (!line || Array.isArray(v.edges)) ? `<button data-f="show:${id}" data-show="${id}" aria-label="Show ${n} in this view">Show</button>` : '')
        + (can('delete') ? `<button data-f="x:${id}" data-del="${id}" aria-label="Delete ${n} from the model">✕</button>` : '') + '</li>'; }).join('') + '</ul>';
  }
  function refresh() { if (!panel || !on()) return; put('.um-pal', palette()); put('.um-props', props()); put('.um-probs', problems()); put('.um-els', outline()); }

  function commit(t) { // a field of the properties panel: one transaction
    const d = t.dataset, at = elementsOf(model()), id = selId(at);
    const M = def().member, bad = why => { t.setAttribute('aria-invalid', 'true'); api.status(why); }; // a line the type cannot read: kept as written, nothing applied (E3)
    if (d.new != null) { const value = t.value.trim(), x = id && at.get(id); if (!value || !x || !can('add')) return;
      const r = M && M.add(value, x.x); if (r && r.error) return bad(r.error);
      const prev = arrOf(x.x.members).filter(isRec).pop(); t.value = ''; t.removeAttribute('aria-invalid');
      return emit([{ op: 'add', element: r ? { ...typed(r, 'member'), label: r.label, ...(Object.keys(r.props).length ? { props: r.props } : {}) } : { ...typed(prev || {}, 'member'), label: value }, owner: id }]); }
    if (d.owner != null) { const p = t.value || null; return id && can('move') && p !== (at.get(id).x.parent ?? null) && emit([{ op: 'reparent', id, parent: p }]); }
    if (!can('rename') || (!id && d.m == null)) return;
    let value = t.type === 'checkbox' ? t.checked : t.value.trim();
    if (t.type !== 'checkbox') { if (t.value === d.was) return;
      if (value === '' && d.key == null) { t.value = d.was; return; } // an empty name does nothing, as on the map; an empty property is removed
      if (d.m != null && M) { const m = (at.get(d.m) || {}).x, r = m && M.edit(m, value); if (!r || r.error) return bad(r ? r.error : 'not a member');
        t.removeAttribute('aria-invalid'); d.was = t.value; return emit(r.commands); }
      d.was = t.value; if (value === '') value = undefined; else if (d.list != null) value = value.split(',').map(x => x.trim()).filter(Boolean); }
    const path = d.path ? ['props', ...JSON.parse(d.path)] : d.key == null ? 'label' : d.key.includes('.') ? ['props', d.key] : 'props.' + d.key;
    emit([{ op: 'set', id: d.m ?? id, path, value }]);
  }
  function moveMember(id, by) {
    const e = elementsOf(model()).get(id); if (!e || !e.owner || !can('reorder')) return;
    const i = e.owner.members.indexOf(e.x) + by; if (i >= 0 && i < e.owner.members.length) emit([{ op: 'move', id, index: i }]);
  }
  function show(id) {
    const v = view(), x = elementsOf(model()).get(id); if (!x || !can('add')) return;
    emit([x.kind === 'edge' ? { op: 'set', view: v.id, path: 'edges', value: [...arrOf(v.edges), id] } : { op: 'set', view: v.id, path: 'nodeIds', value: [...arrOf(v.nodeIds), id] }]);
  }
  function build() {
    panel = document.createElement('aside');
    panel.className = 'um-editor'; panel.setAttribute('aria-label', 'Edit this diagram');
    panel.innerHTML = '<section class="um-pal" aria-label="Palette"></section><section class="um-props" aria-label="Properties"></section><section class="um-probs" aria-label="Problems"></section><section class="um-els" aria-label="Elements"></section>';
    panel.addEventListener('click', e => { const b = e.target.closest('button, [data-orphans]'); if (!b) return; const d = b.dataset;
      if (d.add != null) addNode(+d.add);
      else if (d.go != null) { if (!d.go || !api.selectId(top(d.go))) api.status('Not drawn in this view'); }
      else if (d.show != null) show(d.show);
      else if (d.del != null) { if (can('delete')) emit([{ op: 'delete', id: d.del }]); }
      else if (d.up != null || d.down != null) moveMember(d.up ?? d.down, d.up != null ? -1 : 1);
      else if (d.hide != null || d.kill != null) remove(d.kill != null);
      else if (d.orphans != null) { orphans = b.checked; put('.um-els', outline()); } });
    panel.addEventListener('change', e => { if (e.target.dataset.orphans == null) commit(e.target); });
    panel.addEventListener('keydown', e => { e.stopPropagation(); const t = e.target, K = e.key; // the panel's keys stay in it
      if (K === 'Escape') { if (t.tagName === 'INPUT' && t.type !== 'checkbox') { t.value = t.dataset.was ?? ''; t.removeAttribute('aria-invalid'); } api.focus(); } // what was typed is not kept
      else if (K === 'Enter' && t.tagName === 'BUTTON') { e.preventDefault(); t.click(); }
      else if (K === 'Enter' && t.tagName === 'INPUT' && t.type !== 'checkbox') { e.preventDefault(); commit(t); }
      else if (e.altKey && t.dataset.m != null && (K === 'ArrowUp' || K === 'ArrowDown')) { e.preventDefault(); moveMember(t.dataset.m, K === 'ArrowUp' ? -1 : 1); } });
    root.appendChild(panel);
  }
  function mount() { // a new picture: a line being picked stops; the panels come with a typed view only
    link = null; closeMenu(false);
    if (!on()) { if (panel) { panel.remove(); panel = null; last = {}; } return; }
    if (!panel) build();
    refresh();
  }

  return { on, key, label, drop, connect, mount, refresh,
    paint: () => { if (panel && on()) put('.um-props', props()); },
    add: () => addNode(0),
    cancel: () => { const a = endLink(), b = closeMenu(false); return a || b; },
    linking: () => !!link || !!menu,
    width: () => panel ? panel.offsetWidth + 8 : 0 };
}

export { typedEditor };
