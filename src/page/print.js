import { legendItems } from '../canvas/pieces.js';
import { diagramOf } from '../core/registry.js';
import { esc, md } from '../core/text.js';
import { stepOrder } from '../layout/layered.js';
import { edgeRefIds } from '../map/api.js';
import { KIND, kindOf } from '../map/kinds.js';
import { andList, arrOf, boxesNamed, rules } from '../map/validate.js';

/* #pdf=1[&views=a,pic-*][&paper=letter] (umlimator.py pdf): the map as a document to hand in for a review, laid out here a
   page at a time, as Chrome's own page breaks can't be read back for the contents. Each sheet is one page: @page sets the
   paper (A4 or US Letter, across) and its margins, and each sheet ends in the title and "page N of M".
   - The cover: the title, the date, the model's file, a summary line and the contents, each view with its page.
   - Each view, from a page of its own: a header (the view's path and its caption), its picture (toSVG()'s, in vectors)
     as large as the page allows and never larger than drawn, the legend of what it draws, then tables of its cards,
     lines and boxes (on a typed view, "Elements": each element's type and members, or its type's word and rows, and each
     line's kind).
     They fill two columns below the picture, or one column beside a picture too tall to leave room below. A table that
     runs out of room goes on in the next column, under its heading and header row again; a row is never cut, and a
     heading never ends a column.
   - The rules, when the model has any: each holding or broken in the views printed, and what breaks it. */
function printDoc(X, model, Q) {
  const { D, views, V, N, chain, viewEdges, geoCache } = X.ctx();
  const only = (Q.get('views') || '').split(',').filter(Boolean), want = v => !only.length || only.some(p => p.endsWith('*') ? v.id.startsWith(p.slice(0, -1)) : v.id === p);
  const shown = views.filter(want).map(v => [v, X.standalone(1, v.id)]).filter(([, s]) => s), on = new Set(shown.map(([v]) => v.id));
  const rs = shown.length ? arrOf(model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles)) : []; // as rules() reads them; none without a view
  const broken = rules(model).filter(b => on.has(b.view)); // judged in the views printed, as the document says
  const [pw, ph] = Q.get('paper') === 'letter' ? [279.4, 215.9] : [297, 210], title = esc(D.title || 'Map'); // the paper across, in mm
  const count = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`, T = v => esc(v.title || v.id), full = c => Object.assign(c, { full: true });
  const cards = v => arrOf(v.nodeIds).filter(i => N[i]), lines = v => viewEdges(v).filter(e => e.from !== e.to), boxes = v => arrOf(v.containers).filter(c => c && c.id); // as describe() reads a view
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
    const g = geoCache[v.id].g, made = tablesOf(X.ctx(), v, g), [ids, es, held] = made.map(t => t.rows), tables = made.filter(x => x.rows.length);
    const up = chain(v.id).slice(0, -1).map(id => `<span class="up">${T(V[id])} › </span>`).join('');
    const head = more => `<header>${more ? `<div class="h2">${up}${T(v)} <span class="up">(continued)</span></div>` : `<h2>${up}${T(v)}</h2>`}<span class="meta">${[count(ids.length, 'card'), count(es.length, 'line'), ...(held.length ? [count(held.length, 'box', 'boxes')] : [])].join(' · ')}</span></header>${!more && v.caption ? `<p class="cap">${esc(v.caption)}</p>` : ''}`;
    const body = sheet(head(false), vi);
    body.insertAdjacentHTML('beforeend', `<figure>${svg}</figure><div class="lg"><b>Legend</b>${legendItems([g], 'opens a view of its own').join('')}</div>`);
    // the picture as large as the page allows, never larger than drawn: below it the legend, then two columns of tables;
    // one too tall for that keeps the page's height, with the legend and one column beside it. Smaller (down to 70%, and
    // to a scale of 0.6 at least) when that keeps the tables on its page; else they go on over the next pages.
    const fig = body.firstElementChild, lg = fig.nextElementSibling, s = fig.firstElementChild, b = s.viewBox.baseVal, W = body.clientWidth - 2, H = body.clientHeight - 2, SIDE = 340;
    let k = Math.min(1, W / b.width, (H - lg.offsetHeight - 16) / b.height); const side = b.width * k <= W - SIDE;
    if (side) k = Math.min(1, H / b.height, (W - SIDE) / b.width);
    body.classList.toggle('side', side);
    const lay = (f, more) => { s.setAttribute('width', b.width * k * f); s.setAttribute('height', b.height * k * f); body.querySelector('.cols')?.remove();
      const first = cols(body, side ? 1 : 2); if (side) first[0].append(lg); return pour(paging(more && head, 2, first), tables); };
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

// a view's tables, out of printDoc for Node's tests
function tablesOf({ D, N, nodeIn, viewEdges }, v, g) {
  const cards = v => arrOf(v.nodeIds).filter(i => N[i]), boxes = v => arrOf(v.containers).filter(c => c && c.id);
  const wk = new Map(g.edges.flatMap(d => edgeRefIds(d).map(id => [id, d.wk]))), typed = (v.diagram ?? 'map') !== 'map';
  const at = Object.fromEntries(g.nodes.map(n => [n.id, n])), ids = cards(v), es = viewEdges(v).filter(e => e.from !== e.to && (!typed || wk.has(e._id) || at[e._id])), seq = v.render === 'sequence', stepped = es.some(e => e.step != null); // a typed view's: those its type draws (a communication message is drawn as a row)
  if (typed) { const have = new Set(es.map(e => e._id)); // and a line its type draws to an end's owner (a member's, a port's), between the owners
    const M = new Map(arrOf(D.edges).filter(Boolean).map(x => [x._id, x]));
    g.edges.forEach(d => edgeRefIds(d).forEach(id => { const e = M.get(id); if (e && !have.has(id) && d.from !== d.to) { have.add(id); es.push({ ...e, from: d.from, to: d.to }); } })); }
  const drawn = id => (typed && at[id]?.label) || nodeIn(id, v.id).label || id; // a typed view's drawn name: sales::Order
  const name = (v, id) => esc(N[id] ? drawn(id) : (boxes(v).find(c => c.id === id) || {}).label || id);
  const held = boxes(v).map(c => [c, arrOf(c.nodeIds).filter(i => ids.includes(i))]).filter(([, ins]) => ins.length);
  const word = t => String(t || '').split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); // 'uml.DataType': "Data type"
  const T = diagramOf(v) || {}, asText = (T.member || {}).print || (m => m.label ?? m.id); // a member as its type writes it, else its name
  return [
    { title: `${typed ? 'Elements' : 'Cards'} <span>${ids.length}</span>`, cls: 'cards', head: `<th>Card</th><th>Kind</th><th>${typed ? 'Members' : 'What it is'}</th>`, rows: ids.map(id => { const c = nodeIn(id, v.id), t = KIND[kindOf(c.kind, true)], d = at[id] || {}, sub = c.sublabel ?? c.sub, rs = typed && T.rows?.(D, v, id);
      return `<tr><td>${d.step ? `<i class="num">${esc(d.step)}</i>` : ''}<b>${esc(drawn(id))}</b>${d.kids || d.opens ? ' ⤢' : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</td>`
        + (typed ? `<td>${esc(T.word?.(D, id) ?? word(c.type || 'uml.Class'))}</td><td>${(Array.isArray(rs) ? rs : arrOf(c.members).filter(m => m && typeof m === 'object').map(m => asText(m))).map(r => `<p>${esc(r)}</p>`).join('')}</td></tr>`
          : `<td><i class="sw" style="border-color:var(--um-${t[0]});background:var(--um-${t[0]}-f)"></i>${t[1]}</td><td>${c.what ? md(c.what) : ''}</td></tr>`); }) },
    { title: `Lines <span>${es.length}</span>`, cls: 'lines', head: `${seq || stepped ? '<th class="n">#</th>' : ''}<th>From → to</th><th>Label</th><th>${typed ? 'Kind' : 'Technology'}</th>`, rows: (stepped && !seq ? [...es].sort((a, b) => stepOrder(a.step, b.step)) : es).map((e, i) => { const w = wk.get(e._id) || 'calls', t = typed && T.text?.(D, v, e._id); // a type's text for the line (S17), else its label
      return `<tr>${seq ? `<td>${i + 1}</td>` : stepped ? `<td>${esc(e.step ?? '')}</td>` : ''}<td><i class="w" style="border-color:var(--um-w-${w})"></i>${name(v, e.from)} → ${name(v, e.to)}</td><td>${t || e.label ? esc(t || e.label) : typed ? '' : `<span class="up">${w}</span>`}</td><td>${esc(typed ? word(e.type) : e.sublabel || '')}</td></tr>`; }) },
    { title: `Boxes <span>${held.length}</span>`, cls: 'boxes', head: '<th>Box</th><th>Holds</th>', rows: held.map(([c, ins]) => `<tr><td><b>${esc(c.label || c.id)}</b></td><td>${andList(ins.map(i => name(v, i)))}</td></tr>`) },
  ];
}

export { printDoc, tablesOf };
