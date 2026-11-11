import { reducedMotion } from './render.js';

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

export { Camera };
