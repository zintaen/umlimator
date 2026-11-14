// The e-bike atlas (0.25.0, notes/milestone-3.md §15): examples/ebike-atlas.json is what tools/atlas.mjs builds from SysML's
// four e-bike examples and tools/ebike-links.json (--links, --out), byte for byte, so it cannot drift from them. The files
// agree on every element they share, written alike (M3.0's range-equation, and the EBike, Battery, Controller, Motor, Dock and
// Light each file writes whole; the requirements file names its blocks without members, which a requirement view does not
// draw), so each view lays out in the atlas exactly as in its own file and the atlas validates with
// no problem through the four types' rules. From the requirements, the root, a reader reaches every view by drill-down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import '../src/map/typed.js';
import '../src/typed/layout.js';
import '../src/typed/draw.js';
import '../src/sysml/requirement.js';
import '../src/sysml/blocks.js';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { diagramOf } from '../src/core/registry.js';
import { build } from '../tools/atlas.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const LINKS = read('../tools/ebike-links.json'), FILES = Object.fromEntries(LINKS.sources.map(n => [n, read(`../examples/${n}.json`)]));
const { model: M, shared, text } = build(LINKS);
const id = ref => ref.slice(ref.indexOf('/') + 1);
const canon = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(j => [j, v[j]])) : v));

test('the committed e-bike atlas is what tools/atlas.mjs --links tools/ebike-links.json --out examples/ebike-atlas.json writes, byte for byte', () => {
  const committed = readFileSync(new URL('../examples/ebike-atlas.json', import.meta.url), 'utf8');
  assert.equal(committed, text, 'examples/ebike-atlas.json is stale: run node tools/atlas.mjs --links tools/ebike-links.json --out examples/ebike-atlas.json and commit it');
  const dir = mkdtempSync(join(tmpdir(), 'ebike-')), out = join(dir, 'atlas.json'), root = new URL('..', import.meta.url).pathname;
  const said = execFileSync(process.execPath, ['tools/atlas.mjs', '--links', 'tools/ebike-links.json', '--out', out], { cwd: root, encoding: 'utf8' });
  assert.equal(readFileSync(out, 'utf8'), text); assert.match(said, /written; 46 elements shared by several files/);
  // --links with no --out (or a flag with no value) is refused, and the Bookshop's atlas is left alone
  const bookshop = readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url), 'utf8');
  for (const a of [['--links', 'tools/ebike-links.json'], ['--links', 'tools/ebike-links.json', '--out'], ['--out', out]])
    assert.throws(() => execFileSync(process.execPath, ['tools/atlas.mjs', ...a], { cwd: root, stdio: 'pipe' }), /usage/, a.join(' '));
  assert.equal(readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url), 'utf8'), bookshop);
  // the Bookshop's, with no flag, as before (tests/atlas.test.mjs holds it)
  assert.deepEqual(build().model.title, 'Bookshop atlas');
  // shared by id: the blocks the requirements name, EBike and its members, the blocks inside it, and the range equation
  assert.deepEqual(shared.filter(x => !x.id.includes('.')).map(x => [x.id, x.files.length]), [['battery', 3], ['controller', 3], ['dock', 3], ['ebike', 3], ['motor', 2],
    ['light', 2], ['charge-interface', 2], ['usable-energy', 2], ['range-equation', 2]]);
  const ids = [...M.nodes, ...M.edges].flatMap(x => [x, ...(x.members || [])]).map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'every element id once');
});

test('the four files agree on every element they share: written alike, not only mergeable (§15.2); the requirements file names its blocks only', () => {
  const bare = ({ members, ...x }) => x;
  for (const { id: x, files } of shared.filter(s => !s.id.includes('.'))) {
    const copies = files.map(f => FILES[f].nodes.find(n => n.id === x) || FILES[f].edges.find(e => e.id === x)), whole = copies.filter(c => c.members);
    whole.forEach(c => assert.equal(canon(c), canon(whole[0]), `${x}: written alike in ${files.join(', ')}`));
    copies.forEach((c, i) => assert.equal(canon(bare(c)), canon(bare(copies[0])), `${x}: ${files[i]} against ${files[0]}`));
    if (whole.length < copies.length) assert.deepEqual(files.filter((f, i) => !copies[i].members), ['ebike-requirements'], x);
  }
  // M3.0's clash (Q2), fixed and kept: one range equation, of energy
  const eq = M.nodes.find(n => n.id === 'range-equation');
  assert.deepEqual([eq.props.constraint, eq.members.map(m => m.label)], ['range = energy / consumption', ['range', 'energy', 'consumption']]);
  // 17's composite associations are drawings of EBike's part members (§7.2): one type and one multiplicity each
  const ebike = M.nodes.find(n => n.id === 'ebike');
  for (const e of M.edges.filter(e => e.type === 'uml.Association')) { const p = ebike.members.find(m => m.label === e.props.ends.to.role);
    assert.deepEqual([p.props.multiplicity, M.nodes.find(n => n.id === e.to).label], [e.props.ends.to.multiplicity, p.props.valueType], e.id); }
});

test('the atlas and each file validate with no problem at any level through the four types\' rules; each file passes its type\'s validate on its own and in the atlas', () => {
  assert.deepEqual(validate(M), []);
  for (const [name, src] of Object.entries(FILES)) {
    assert.deepEqual(validate(src), [], name);
    for (const v of src.views) {
      const T = diagramOf(v);
      assert.ok(T && T.validate && T.name === v.diagram, `${name} view ${v.id}: ${v.diagram} is registered`);
      assert.deepEqual(T.validate(src, v), [], `${name} view ${v.id}`);
      assert.deepEqual(T.validate(M, M.views.find(w => w.id === v.id)), [], `${name} view ${v.id} in the atlas`);
    }
  }
  assert.deepEqual(M.views.map(v => v.diagram), ['sysml.requirement', 'sysml.block-definition', 'sysml.internal-block', 'sysml.parametric']);
});

test('every view lays out in the atlas exactly as in its own file, and check() finds nothing (the frame header of a view with no subject names the model\'s title)', () => {
  const pic = (m, vid) => { const { ms, ...g } = layout(m, vid); return g; };
  for (const [name, src] of Object.entries(FILES)) for (const v of src.views) {
    assert.deepEqual(pic({ ...M, title: src.title }, v.id), pic(src, v.id), `${name} view ${v.id}`);
    assert.deepEqual([check(M, v.id), check(src, v.id)], [[], []], `${name} view ${v.id}`);
  }
  assert.deepEqual(M.views.map(v => layout(M, v.id).families[0].title), ['req [Model] E-bike atlas [E-bike requirements]', 'bdd [Model] E-bike atlas [E-bike blocks]',
    'ibd [Block] EBike [Inside the e-bike]', 'par [Block] EBike [E-bike range]']);
});

test('every drill-down opens a view of the atlas: the links file\'s and no other; from the root, every view', () => {
  const ctx = mapContext(M), opens = [];
  for (const v of M.views) for (const n of v.nodeIds) { const o = ctx.opensOf(n, v.id); if (o) opens.push([v.id, n, o]); }
  // the parametric view's subject is EBike too, so its frame opens the internal block view as the block's card does
  assert.deepEqual(opens, [['requirements', 'spec', 'blocks'], ['requirements', 'range', 'range-analysis'], ['blocks', 'ebike', 'inside-ebike'], ['range-analysis', 'ebike', 'inside-ebike']]);
  LINKS.links.forEach(l => assert.ok(opens.some(([, n, o]) => n === id(l.element) && o === id(l.opens)), `${l.element} opens ${l.opens}`));
  const next = new Map(M.views.map(v => [v.id, new Set(opens.filter(x => x[0] === v.id).map(x => x[2]))]));
  const seen = new Set([M.root]); for (const v of seen) next.get(v).forEach(w => seen.add(w));
  assert.equal(M.root, 'requirements');
  assert.deepEqual([...seen].sort(), M.views.map(v => v.id).sort());
});

test('describe() and the PDF\'s tables read every view of the atlas', () => {
  const ctx = mapContext(M);
  for (const v of M.views) { assert.ok(describe(M, v.id).length, v.id); assert.ok(tablesOf(ctx, ctx.V[v.id], ctx.buildGeo(v.id)).length, v.id); }
  assert.match(describe(M, 'inside-ebike'), /^Inside the e-bike: an internal block diagram of 24 elements and 6 lines\./);
});
