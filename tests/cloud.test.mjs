// The cloud architecture family, aws, gcp and azure (work package 4a.6, notes/milestone-4a.md §5): the three definitions, AWS
// registered since AWS accepted (CLOUD_AWS, 4a.8) and exported by no surface of lib/umlimator-all.js, the service card (an icon
// only through <image> from a data URL, with meet and nothing that crops or alters it; the glyph without one), the full name,
// groups as boxes titled with their kind, Google's legal line (its two copies equal; in the picture, the legend and
// describe() wherever a Google icon is drawn), the validators, names, reading order, legend, the PDF's rows, the editing
// hooks, a 30-step session saved and reopened, and P1's figures on a stress view (§11). tests/cloud.html draws it in a browser
// and edits it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code. The
// icons are synthetic data URLs: no vendor icon is committed or fetched (S18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf, registerDiagramType } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { CLOUD_AWS, CLOUD_DEFS, GCP_LEGAL, AWS_LEGAL } from '../src/cloud/cloud.js';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const GCP = read('../examples/bookshop-gcp.json'), AZ = read('../examples/bookshop-azure.json'), AWS = read('../examples/bookshop-aws.json'); // moved by 4a.7 and 4a.8, AWS's ids prefixed aws-
const T = { gcp: diagramOf({ diagram: 'gcp' }), azure: diagramOf({ diagram: 'azure' }), aws: diagramOf({ diagram: 'aws' }) };
const TARGETS = [['gcp', GCP, 'gcp-on-gcp'], ['azure', AZ, 'az-on-azure'], ['aws', AWS, 'aws-on-aws']];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };
const unid = s => s.replace(/\bg\d+-/g, 'g-');
// a synthetic icon (S18): a coloured square, or a white circle for a white icon; never a vendor's
const SQ = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#3367d6"/></svg>').toString('base64');
const WH = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#fff"/></svg>').toString('base64');
// the table the CLI builds from a fetched pack (§4.5): every icon a model names, Google's legal entry with its pack
const table = (pack, m, more = {}) => Object.fromEntries([...(pack === 'gcp' ? [['gcp/', { legal: GCP_LEGAL }]] : pack === 'aws' ? [['aws/', { legal: AWS_LEGAL }]] : []),
  ...m.nodes.filter(n => n.props && n.props.icon).map(n => [`${pack}/${n.props.icon}`, { src: SQ, dark: false, name: n.props.icon.replace(/-/g, ' ') }]), ...Object.entries(more)]);
const withIcons = (pack, m, more) => ({ ...structuredClone(m), icons: table(pack, m, more) });
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
const boxOff = (n, [x, y]) => { const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h); return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };
const images = markup => [...markup.matchAll(/<image\b[^>]*>/g)].map(m => m[0]);

test('the definitions: gcp, azure and aws registered by the module (CLOUD_AWS on, 4a.8); palettes, lines, fields, hooks, rules', () => {
  assert.equal(CLOUD_AWS, true);
  assert.ok(T.gcp && T.azure && T.aws === diagramOf({ diagram: 'aws' }) && T.aws.name === 'aws', 'aws registered by src/cloud/cloud.js');
  assert.throws(() => registerDiagramType('aws', CLOUD_DEFS.aws), /registered already/);
  assert.deepEqual(T.gcp.elements.map(e => e.label), ['Project', 'Region', 'Zone', 'Network', 'Subnetwork', 'Group', 'Product', 'User']);
  assert.deepEqual(T.gcp.elements[1], { type: 'gcp.Zone', label: 'Region', props: { zoneType: 'region' } });
  assert.deepEqual(T.azure.elements.map(e => e.label), ['Subscription', 'Resource group', 'Region', 'Virtual network', 'Subnet', 'Group', 'Service']);
  assert.deepEqual(T.aws.elements.map(e => e.label), ['Cloud', 'Account', 'Region', 'Availability zone', 'VPC', 'Public subnet', 'Private subnet', 'Security group', 'Group', 'Service', 'Resource']);
  assert.deepEqual([T.aws, T.gcp, T.azure].map(t => t.lines), [[{ type: 'aws.Connection', label: 'Connection' }], [{ type: 'gcp.Path', label: 'Path' }], [{ type: 'azure.Connector', label: 'Connector' }]]);
  assert.deepEqual(T.gcp.props['gcp.Zone'], [{ key: 'zoneType', label: 'Zone type', kind: 'enum', options: ['project', 'region', 'zone', 'network', 'subnetwork', 'generic'] }]);
  assert.deepEqual(T.azure.props['azure.Group'][0].options, ['subscription', 'resource-group', 'region', 'virtual-network', 'subnet', 'generic']);
  assert.deepEqual(T.aws.props['aws.Group'][0].options, ['cloud', 'account', 'region', 'availability-zone', 'vpc', 'public-subnet', 'private-subnet', 'security-group', 'generic'], 'model.md row 26');
  for (const t of ['gcp.Product', 'azure.Service', 'aws.Service', 'aws.Resource']) assert.deepEqual(T[t.split('.')[0]].props[t], [{ key: 'icon', label: 'Icon', kind: 'text' }], t);
  for (const x of Object.values(T)) {
    for (const k of ['layout', 'draw', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows']) assert.equal(typeof x[k], 'function', `${x.name} ${k}`);
    assert.deepEqual(Object.keys(x.edits), ['connect', 'add', 'remove']);
    assert.deepEqual(Object.keys(x.rules), ['group-kind', 'group-nesting', 'line-inside', 'icon-set', 'icon-missing']);
  }
});

test('lib/umlimator-all.js registers aws and exports none of the family (§4.7, 4a.8): an aws view draws as its type, as gcp and azure do', async () => {
  const lib = await import('../lib/umlimator-all.js'), src = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8');
  assert.deepEqual(Object.keys(lib).filter(k => /aws|cloud/i.test(k)), [], 'no export');
  assert.ok(src.includes("const CLOUD_AWS = true;"), "the switch on"); assert.equal(src.split("registerDiagramType('aws'").length, 2, 'one aws registration');
  for (const m of [GCP, AZ, AWS]) assert.deepEqual(lib.validate(m), [], m.title);
  const [aws, w2] = said(() => lib.layout(AWS, 'aws-on-aws'));
  assert.ok(lib.layout(GCP, 'gcp-on-gcp').families.length === 6 && !aws.map && aws.families.length === 10 && aws.nodes.filter(n => n.shape === 'cloud-card').length === 15, 'aws laid out as its type');
  assert.deepEqual(w2, []);
  // and the module's core holds none of the family (risks.md C5)
  const core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('gcp'", "registerDiagramType('aws'", "SHAPE['cloud-card']", 'GCP_LEGAL', 'AWS_LEGAL']) { assert.ok(src.includes(k), k); assert.ok(!core.includes(k), k); }
});

test('the legal lines: their two copies, icons/packs.json\'s and the type\'s, are equal (S9; AWS\'s trademark line, 4a.8)', () => {
  const P = read('../icons/packs.json');
  assert.equal(P.gcp.legal, GCP_LEGAL); assert.equal(P.aws.legal, AWS_LEGAL);
  assert.match(AWS_LEGAL, /^Amazon Web Services, AWS .* are trademarks of Amazon\.com, Inc\. or its affiliates\.$/);
  assert.ok(P.aws.terms.text.includes(AWS_LEGAL), 'AWS\'s terms, shown before the download, carry the line');
});

test('the three targets (rows 26 to 28) validate clean and lay out clean right and down: every line routed, no overlap, each in its group, ends on outlines; crossings pinned (repair and reroute off, §11)', () => {
  const got = {}, want = { 'gcp right': 1, 'gcp down': 1, 'azure right': 1, 'azure down': 3, 'aws right': 2, 'aws down': 2 };
  for (const [fam, M, vid] of TARGETS) {
    assert.deepEqual(validate(M), [], fam);
    for (const direction of ['right', 'down']) {
      const m = withDir(M, direction), tag = `${fam} ${direction}`, [g, warned] = said(() => layout(m, vid)), fam_ = Object.fromEntries(g.families.map(f => [f.id, f]));
      assert.deepEqual(warned, [], `${tag}: every line routed`);
      for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${tag}: ${p.id} and ${q.id} overlap`);
      for (const f of g.families) for (const id of f.nodeIds) assert.ok(inside(g.byId[id], f), `${tag}: ${id} inside ${f.id}`);
      for (const f of g.families) if (f.parent) assert.ok(inside(f, fam_[f.parent]), `${tag}: ${f.id} inside ${f.parent}`);
      assert.equal(g.edges.length, M.edges.length, `${tag}: every connection drawn`);
      const { markup } = mapContext(m).buildView(vid), off = ends(markup).flatMap(({ from, to, a, b }) => [[from, a], [to, b]]
        .filter(([id]) => !(g.byId[id] && g.byId[id].shape === 'cloud-user')).map(([id, p]) => [id, boxOff(g.byId[id] || fam_[id], p)]).filter(([, d]) => d > 1));
      assert.deepEqual(off, [], `${tag}: ends on outlines and group borders`);
      const issues = check(m, vid).map(p => p.message);
      assert.deepEqual(issues.filter(p => !/ cross$/.test(p)), [], `${tag}: no overlap or line through a node`);
      got[tag] = issues.length;
    }
  }
  console.log(`# 4a.6 targets, crossings: ${JSON.stringify(got)}`);
  assert.deepEqual(got, want);
  // Q8: a line from a group ends on its border: a subnet to a NAT gateway in a sibling subnet, the VPC to a service it does not hold
  const g = layout(AWS, 'aws-on-aws'), e = id => g.edges.find(x => x.id === id);
  assert.ok(e('aws-private-a-nat') && e('aws-vpc-monitoring'), 'both drawn');
});

test('groups (§5.3): boxes nested by parent, titled "<label> [<kind>]", dashed by kind (region, availability zone, zone); a group holding nothing shown is a closed card of that title', () => {
  const g = layout(GCP, 'gcp-on-gcp'), f = Object.fromEntries(g.families.map(x => [x.id, x]));
  assert.deepEqual(g.families.map(x => [x.id, x.title, x.dashed, x.shape]), [['gcp-project', 'bookshop-prod [Project]', false, 'cloud-group'], ['gcp-region', 'europe-west1 [Region]', true, 'cloud-group'],
    ['gcp-network', 'bookshop-vpc [Network]', false, 'cloud-group'], ['gcp-subnet', 'data subnet, 10.10.0.0/24 [Subnetwork]', false, 'cloud-group'], ['gcp-zone-b', 'europe-west1-b [Zone]', true, 'cloud-group'], ['gcp-zone-c', 'europe-west1-c [Zone]', true, 'cloud-group']]);
  assert.equal(f['gcp-zone-b'].parent, 'gcp-subnet');
  const s = svgOf(g);
  assert.match(s, /class="family-box"[^>]*stroke="var\(--um-muted\)" stroke-dasharray="6 4"\/><text class="family-title"[^>]*data-o="gcp-region">europe-west1 \[Region\]</);
  assert.match(s, /class="family-box"[^>]*stroke="var\(--um-muted\)"\/><text class="family-title"[^>]*data-o="gcp-project">bookshop-prod \[Project\]</);
  assert.equal(f['gcp-project'].aria, 'Project bookshop-prod, holding 6 elements');
  // the zone's service hidden: the zone holds nothing shown, a closed card titled with its kind, dashed
  const m = structuredClone(GCP); m.views[0].nodeIds = m.views[0].nodeIds.filter(id => id !== 'gcp-db-standby');
  const h = layout(m, 'gcp-on-gcp'), z = h.byId['gcp-zone-c'];
  assert.ok(z && z.shape === 'cloud-group' && z.title === 'europe-west1-c [Zone]' && z.dashed);
  assert.match(svgOf(h), /data-shape="cloud-group"[^>]*aria-label="Zone europe-west1-c"><path[^>]*class="n-mask"\/><path[^>]*class="n-body"[^>]*stroke-dasharray="6 4"\/><g class="c-head"><text[^>]*text-anchor="middle" class="c-name" data-o="gcp-zone-c"[^>]*>europe-west1-c \[Zone\]</);
  // Delete hides a group: its contents are drawn in the next shown group
  const hid = apply(GCP, [{ op: 'hide', id: 'gcp-network', view: 'gcp-on-gcp' }]), k = layout(hid, 'gcp-on-gcp');
  assert.equal(k.families.find(x => x.id === 'gcp-subnet').parent, 'gcp-region');
});

test('the service card (§5.2): 180 to 280 px wide, 56 px tall at least; the label on two lines of 180 px, the full name under it; a label equal to its name drawn once', () => {
  const C = SHAPE['cloud-card'], sz = (label, name) => C.size({ label, name });
  assert.deepEqual(sz('A', 'B'), { w: 180, h: 56 }, 'the smallest card');
  const long = sz('A service with a label too long for one line of the card', 'Front Door and CDN Profiles with a name that wraps too');
  assert.ok(long.w <= 280 && long.h > 56, JSON.stringify(long));
  assert.ok(sz('y'.repeat(300), 'n').w <= 280, 'a long label is cut');
  const n = { id: 'a', label: 'Shop API', name: 'Cloud Run', x: 0, y: 0, ...sz('Shop API', 'Cloud Run'), aria: 'Product Shop API, Cloud Run' };
  const glyph = C.draw(n);
  assert.match(glyph, /class="cl-glyph" fill="none" stroke="var\(--um-muted\)"/); assert.doesNotMatch(glyph, /<image/);
  assert.match(glyph, /class="c-name" data-o="a"[^>]*>Shop API<\/text>.*class="c-st cl-name"[^>]*>Cloud Run</);
  const same = C.draw({ ...n, label: 'Cloud Run' });
  assert.equal((same.match(/>Cloud Run</g) || []).length, 1, 'drawn once');
  const lines = C.draw({ ...n, label: 'A service with a label too long for one line', ...C.size({ label: 'A service with a label too long for one line', name: 'Cloud Run' }) });
  assert.equal((lines.match(/class="c-name"/g) || []).length, 2, 'two lines');
});

// every vendor <image> (§5.2): meet, never slice, and no clip-path, filter, mask, opacity or transform on it or on what holds it in the card
const plain = (markup, img) => { const at = markup.indexOf(img), g = markup.lastIndexOf('<g class="node', at), head = markup.slice(g, at);
  return /preserveAspectRatio="xMidYMid meet"/.test(img) && !/clip-path|filter|mask|opacity|transform|slice/.test(img) && !/clip-path|filter=|mask=|opacity|transform/.test(head); };
test('icons only from the host\'s table, through <image> from a data URL: meet, 32 px on a 39 px tile, dark for a white icon; never clipped, filtered, masked, faded or transformed; markup or another address never drawn (S6, risks.md S2)', () => {
  const m = withIcons('gcp', GCP, { 'gcp/Cloud-SQL': { src: WH, dark: true, name: 'Cloud SQL' } }), g = layout(m, 'gcp-on-gcp'), { markup } = mapContext(m).buildView('gcp-on-gcp'), imgs = images(markup);
  assert.equal(imgs.length, 9, 'one per product card; the user has none');
  for (const i of imgs) { assert.ok(plain(markup, i), i); assert.match(i, /width="32" height="32"/); }
  for (const l of g.legend.filter(x => /<image/.test(x))) for (const i of images(l)) assert.ok(/preserveAspectRatio="xMidYMid meet"/.test(i) && !/clip-path|filter|mask|opacity|transform|slice/.test(i), i);
  assert.match(markup, /class="n-logo dark"\/><image class="cl-icon" href="data:image\/svg\+xml;base64,[^"]+" x="[\d.]+" y="[\d.]+" width="32" height="32"/, 'a white icon on the dark tile');
  assert.match(markup, /width="38.86" height="38.86" rx="8" class="n-logo"\/>/, 'a coloured one on the light tile, 34/28 of the icon');
  // an entry with markup, or a src that is not a data URL, is never drawn: the glyph
  const bad = withIcons('gcp', GCP, { 'gcp/Cloud-Run': { g: '<path d="M0 0" onload="x()"/>', src: 'https://example.invalid/i.svg', name: 'Cloud Run' } }), b = mapContext(bad).buildView('gcp-on-gcp').markup;
  assert.ok(!b.includes('onload') && !b.includes('example.invalid'), 'nothing of the entry drawn but its name');
  assert.equal(layout(bad, 'gcp-on-gcp').byId['gcp-api'].aria, 'Product Shop API, Cloud Run, icon not available');
  assert.equal(validate(bad).filter(p => p.rule === 'icon-missing').length, 2, 'both Cloud Run products: the pack given has no drawable icon for them');
});

test('a view with no table (offline, no pack): glyphs and full names derived from the ids, "icon not available" in each name; no legal line', () => {
  const g = layout(GCP, 'gcp-on-gcp'), s = svgOf(g);
  assert.equal(images(s).length, 0); assert.equal((s.match(/class="cl-glyph"/g) || []).length, 9);
  assert.deepEqual(['gcp-dns', 'gcp-queue', 'gcp-db'].map(id => g.byId[id].name), ['Cloud DNS', 'Pub Sub', 'Cloud SQL']);
  assert.match(s, /class="c-st cl-name"[^>]*>Cloud Load Balancing</);
  assert.equal(g.byId['gcp-lb'].aria, 'Product Load balancer, Cloud Load Balancing, icon not available');
  assert.ok(!g.legal && !/cl-legal/.test(s) && !g.legend.some(l => l.includes(GCP_LEGAL)));
  assert.ok(g.legend.some(l => /<b>Icon not available<\/b>/.test(l)));
  const az = layout(AZ, 'az-on-azure'); assert.equal(az.byId['az-front-door'].name, 'Front Door and CDN Profiles');
});

test('Google\'s legal line (S9): under a picture that draws a Google icon, inside its bounds; the legend and describe() end with it; none without one, none on Azure\'s', () => {
  const m = withIcons('gcp', GCP), g = layout(m, 'gcp-on-gcp'), bare = layout(GCP, 'gcp-on-gcp'), { markup } = mapContext(m).buildView('gcp-on-gcp');
  assert.equal(g.legal.text, GCP_LEGAL);
  assert.ok(g.legal.y > Math.max(...g.nodes.map(n => n.y + n.h), ...g.families.map(f => f.y + f.h)), 'under the picture');
  assert.ok(g.legal.y + 3 <= g.bounds.y + g.bounds.h && g.legal.x >= g.bounds.x && g.bounds.h === bare.bounds.h + 18, 'inside its bounds');
  assert.match(markup, new RegExp(`<text class="cl-legal" x="[\\d.-]+" y="[\\d.-]+" fill="var\\(--um-muted\\)" style="font:400 10px var\\(--um-sans\\)">${GCP_LEGAL.replace(/\./g, '\\.')}</text>`));
  assert.match(g.legend.at(-1), /cl-legal/); assert.ok(g.legend.at(-1).includes(GCP_LEGAL));
  assert.equal(describe(m, 'gcp-on-gcp').split('\n').at(-1), GCP_LEGAL);
  assert.notEqual(describe(GCP, 'gcp-on-gcp').split('\n').at(-1), GCP_LEGAL);
  // one Google icon is enough; whatever the table's legal entry says, the type's words are drawn
  const one = { ...structuredClone(GCP), icons: { 'gcp/Cloud-SQL': { src: SQ, dark: false, name: 'Cloud SQL' } } };
  assert.equal(layout(one, 'gcp-on-gcp').legal.text, GCP_LEGAL);
  const azi = withIcons('azure', AZ), a = layout(azi, 'az-on-azure');
  assert.ok(!a.legal && images(mapContext(azi).buildView('az-on-azure').markup).length === 8 && !describe(azi, 'az-on-azure').includes(GCP_LEGAL), 'Azure\'s icons carry no Google line');
});

test('AWS\'s trademark line (4a.8, AWS\'s acceptance of 14 Nov 2026): under a picture that draws an AWS icon, inside its bounds; the legend and describe() end with it; none without one; never Google\'s', () => {
  const m = withIcons('aws', AWS), g = layout(m, 'aws-on-aws'), bare = layout(AWS, 'aws-on-aws'), { markup } = mapContext(m).buildView('aws-on-aws');
  assert.equal(g.legal.text, AWS_LEGAL);
  assert.ok(g.legal.y + 3 <= g.bounds.y + g.bounds.h && g.bounds.h === bare.bounds.h + 18, 'inside its bounds');
  assert.ok(markup.includes(`>${AWS_LEGAL}</text>`) && !markup.includes(GCP_LEGAL));
  assert.ok(g.legend.at(-1).includes(AWS_LEGAL));
  assert.equal(describe(m, 'aws-on-aws').split('\n').at(-1), AWS_LEGAL);
  assert.ok(!bare.legal && !describe(AWS, 'aws-on-aws').includes(AWS_LEGAL), 'no icon, no line');
  assert.equal(bare.nodes.find(n => n.id === 'aws-nat-a').name, 'Amazon VPC NAT Gateway', 'a derived name: hyphens and underscores as spaces');
  // each icon drawn unmodified, its service name beside it
  assert.equal(images(markup).length, 15); for (const i of images(markup)) assert.match(i, /preserveAspectRatio="xMidYMid meet"/);
  const words = id => [...markup.split(`data-id="${id}"`)[1].split('</g></g>')[0].matchAll(/class="c-st cl-name"[^>]*>([^<]*)</g)].map(x => x[1]).join(' ');
  for (const n of g.nodes.filter(n => n.img)) assert.equal(words(n.id), n.name, `${n.id}: the service name beside its icon`);
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (§2.5); a name arriving with a fetched pack lays the view out again', () => {
  const m = withIcons('gcp', GCP), memos = {}, first = mapContext(m, { memos }).buildView('gcp-on-gcp'), pts = JSON.stringify(memos['gcp-on-gcp'].g.edges.map(e => e.pts));
  const second = mapContext(m, { memos }).buildView('gcp-on-gcp');
  assert.equal(memos['gcp-on-gcp'].runs, 1); assert.equal(unid(second.markup), unid(first.markup)); assert.equal(JSON.stringify(memos['gcp-on-gcp'].g.edges.map(e => e.pts)), pts);
  const named = withIcons('gcp', GCP, { 'gcp/Cloud-SQL': { src: SQ, dark: false, name: 'Cloud SQL for PostgreSQL, a managed relational database' } });
  const third = mapContext(named, { memos }).buildView('gcp-on-gcp');
  assert.equal(memos['gcp-on-gcp'].runs, 2, 'a longer name sizes the card again');
  assert.match(third.markup, /managed relational/);
});

test('names, reading order and legend (A1): groups and what they hold, depth first, then the lines; each icon drawn with its full name, the group kinds, the user, the line', () => {
  const m = withIcons('gcp', GCP), g = layout(m, 'gcp-on-gcp'), s = svgOf(g);
  assert.equal(g.byId['gcp-api'].aria, 'Product Shop API, Cloud Run');
  assert.equal(g.byId['gcp-users'].aria, 'User Shoppers');
  assert.match(s, /data-shape="cloud-card" tabindex="-1" role="img" aria-label="Product Shop API, Cloud Run"/);
  assert.match(s, /data-shape="cloud-user" tabindex="-1" role="img" aria-label="User Shoppers"/);
  assert.equal(g.edges.find(e => e.id === 'gcp-users-lb').aria, 'Path HTTPS from Shoppers to Load balancer');
  assert.deepEqual(g.order.slice(0, 9), ['gcp-users', 'gcp-project', 'gcp-dns', 'gcp-lb', 'gcp-cdn', 'gcp-assets', 'gcp-queue', 'gcp-region', 'gcp-api']);
  assert.deepEqual(g.order.slice(16), GCP.edges.map(e => e.id));
  const L = g.legend.map(l => (/<b>([^<]+)<\/b>/.exec(l) || [])[1]).filter(Boolean);
  assert.deepEqual(L, ['Cloud DNS', 'Cloud Load Balancing', 'Cloud CDN', 'Cloud Storage', 'Pub Sub', 'Cloud Run', 'Cloud SQL', 'Project', 'Region', 'Network', 'Subnetwork', 'Zone', 'User', 'Path']);
  assert.match(g.legend[0], /<span>icon Cloud-DNS<\/span>/);
});

test('describe(): the groups as an outline, each service with its full name, then the connections', () => {
  const d = describe(AZ, 'az-on-azure').split('\n');
  assert.equal(d[0], 'Bookshop on Azure: an Azure diagram of 14 elements and 9 connections.');
  assert.deepEqual(d.slice(1, 5), ['Subscription Bookshop production, holding 1 element.', '  Resource group rg-bookshop-prod, holding 3 elements.',
    '    Service CDN and routing, Front Door and CDN Profiles, icon not available.', '    Service Logs and alerts, Monitor, icon not available.']);
  assert.equal(d.at(-1), 'Connector logs, metrics from snet-apps to Logs and alerts.');
  assert.equal(d.length, 1 + 14 + 9);
  assert.equal(describe(AWS, 'aws-on-aws').split('\n')[0], 'Bookshop on AWS: an AWS diagram of 25 elements and 17 connections.');
});

test('the PDF\'s tables (§5.7): a service\'s and a group\'s kind; a service\'s full name, icon id and group', () => {
  const m = withIcons('azure', AZ), v = m.views[0];
  assert.deepEqual(['az-api', 'az-vnet', 'az-rg', 'nowhere'].map(id => T.azure.word(m, id)), ['Service', 'Virtual network', 'Resource group', null]);
  assert.deepEqual(T.azure.rows(m, v, 'az-api'), ['App Services', 'icon App-Services', 'in snet-apps [Subnet]']);
  assert.equal(T.azure.rows(m, v, 'az-vnet'), null);
  assert.deepEqual(T.gcp.rows(GCP, GCP.views[0], 'gcp-dns'), ['Cloud DNS', 'icon Cloud-DNS', 'in bookshop-prod [Project]']);
  assert.equal(T.gcp.word(GCP, 'gcp-users'), 'User'); assert.equal(T.aws.word(AWS, 'aws-nat-a'), 'Resource');
});

// ---- §5.5: validators, each with a passing and a failing case, in each family
const N = (id, type, label, parent, props) => ({ id, type, label, ...(parent ? { parent } : {}), ...(props ? { props } : {}) });
const BREAKS = {
  gcp: { 'group-kind': m => { m.nodes.find(n => n.id === 'gcp-region').props.zoneType = 'continent'; return ['gcp-region']; },
    'group-nesting': m => { m.nodes.find(n => n.id === 'gcp-subnet').parent = 'gcp-project'; return ['gcp-subnet', 'gcp-project']; },
    'line-inside': m => { m.edges.push({ id: 'in', type: 'gcp.Path', from: 'gcp-region', to: 'gcp-db' }); return ['in', 'gcp-region', 'gcp-db']; },
    'icon-set': m => { delete m.nodes.find(n => n.id === 'gcp-dns').props; return ['gcp-dns']; },
    'icon-missing': m => { m.icons = table('gcp', m); delete m.icons['gcp/Cloud-CDN']; return ['gcp-cdn']; } },
  azure: { 'group-kind': m => { delete m.nodes.find(n => n.id === 'az-vnet').props; return ['az-vnet']; },
    'group-nesting': m => { m.nodes.find(n => n.id === 'az-monitor').parent = 'az-front-door'; return ['az-monitor', 'az-front-door']; },
    'line-inside': m => { m.edges.push({ id: 'in', type: 'azure.Connector', from: 'az-rg', to: 'az-rg' }); return ['in', 'az-rg']; },
    'icon-set': m => { m.nodes.find(n => n.id === 'az-db').props.icon = ''; return ['az-db']; },
    'icon-missing': m => { m.icons = { 'azure/Monitor': { src: SQ, name: 'Monitor' } }; return ['az-api', 'az-assets', 'az-db', 'az-front-door', 'az-queue', 'az-vault', 'az-worker']; } },
  aws: { 'group-kind': m => { m.nodes.find(n => n.id === 'aws-vpc').props.groupType = 'VPC'; return ['aws-vpc']; },
    'group-nesting': m => { m.nodes.find(n => n.id === 'aws-vpc').parent = 'aws-cloud'; return ['aws-vpc', 'aws-cloud']; },
    'line-inside': m => { m.edges.push({ id: 'in', type: 'aws.Connection', from: 'aws-db', to: 'aws-vpc' }); return ['in', 'aws-db', 'aws-vpc']; },
    'icon-set': m => { delete m.nodes.find(n => n.id === 'aws-nat-a').props.icon; return ['aws-nat-a']; },
    'icon-missing': m => { m.icons = table('aws', m); delete m.icons['aws/Amazon-RDS']; return ['aws-db', 'aws-db-standby']; } },
};
test('validators: each target breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level, in validate() too', () => {
  for (const [fam, M] of TARGETS) {
    assert.deepEqual(T[fam].validate(M), [], fam);
    assert.deepEqual(T[fam].validate(withIcons(fam, M)), [], `${fam} with its pack`);
    for (const [rule, broke] of Object.entries(BREAKS[fam])) {
      const m = structuredClone(M), ids = broke(m), got = T[fam].validate(m);
      const mine = got.filter(p => p.rule === rule);
      assert.ok(mine.length > 0 && got.every(p => p.rule === rule), `${fam} ${rule}: ${JSON.stringify(got)}`);
      assert.deepEqual([...new Set(mine.flatMap(p => p.ids))].sort(), [...ids].sort(), `${fam} ${rule}`);
      for (const p of mine) { assert.match(p.message, new RegExp('^' + rule + ': ')); assert.equal(p.level, ['group-kind', 'line-inside'].includes(rule) ? 'error' : 'warning', `${fam} ${rule}`);
        assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${fam} ${rule}: in validate()`); }
    }
  }
  // group-nesting, each family's table: what passes and what warns
  const pair = (fam, kind, up) => { const F = { aws: ['aws.Group', 'groupType'], gcp: ['gcp.Zone', 'zoneType'], azure: ['azure.Group', 'groupType'] }[fam];
    return T[fam].validate({ schemaVersion: 2, nodes: [N('o', F[0], 'O', null, { [F[1]]: up }), N('i', F[0], 'I', 'o', { [F[1]]: kind })], edges: [], views: [] }).map(p => `${p.level} ${p.rule}`); };
  for (const [fam, k, up] of [['aws', 'region', 'cloud'], ['aws', 'account', 'account'], ['aws', 'availability-zone', 'region'], ['aws', 'private-subnet', 'vpc'], ['aws', 'security-group', 'public-subnet'], ['aws', 'generic', 'security-group'], ['aws', 'vpc', 'generic'],
    ['gcp', 'network', 'project'], ['gcp', 'zone', 'subnetwork'], ['gcp', 'region', 'project'], ['azure', 'region', 'subscription'], ['azure', 'virtual-network', 'resource-group'], ['azure', 'subnet', 'virtual-network']]) assert.deepEqual(pair(fam, k, up), [], `${fam} ${k} in ${up}`);
  for (const [fam, k, up] of [['aws', 'vpc', 'cloud'], ['aws', 'cloud', 'region'], ['aws', 'public-subnet', 'region'], ['gcp', 'project', 'region'], ['gcp', 'subnetwork', 'region'], ['azure', 'subnet', 'region'], ['azure', 'resource-group', 'region']])
    assert.deepEqual(pair(fam, k, up), ['warning group-nesting'], `${fam} ${k} in ${up}`);
  assert.equal(T.gcp.validate({ schemaVersion: 2, nodes: [N('o', 'gcp.Zone', 'O', null, { zoneType: 'region' }), N('i', 'gcp.Zone', 'I', 'o', { zoneType: 'subnetwork' })], edges: [], views: [] })[0].message,
    'group-nesting: "I", a Subnetwork group, sits in "O", a Region group: it sits in Network');
  // a user names no icon and is not warned; a product with none is
  assert.deepEqual(T.gcp.validate({ schemaVersion: 2, nodes: [N('u', 'gcp.User', 'U')], edges: [], views: [] }), []);
});

// ---- §5.6: editing
test('the editing hooks: a line refused between a group and what it holds; the palette\'s entries added into the group selected; a group deleted says what it held; the Owner field', () => {
  const v = GCP.views[0];
  assert.equal(T.gcp.edits.connect(GCP, v, 'gcp-api', 'gcp-db'), null, 'two services: the default');
  assert.equal(T.gcp.edits.connect(GCP, v, 'gcp-network', 'gcp-lb'), null, 'a group and a service it does not hold');
  assert.deepEqual(T.gcp.edits.connect(GCP, v, 'gcp-region', 'gcp-db'), { error: 'A line cannot join the region and what it holds' });
  assert.deepEqual(T.gcp.edits.connect(GCP, v, 'gcp-db', 'gcp-network'), { error: 'A line cannot join the network and what it holds' });
  assert.deepEqual(T.aws.edits.connect(AWS, AWS.views[0], 'aws-vpc', 'aws-vpc'), { error: 'A line cannot join the VPC and what it holds' });
  assert.deepEqual(T.azure.edits.connect(AZ, AZ.views[0], 'az-rg', 'az-api'), { error: 'A line cannot join the resource group and what it holds' });
  // add: a group's kind from its palette entry; into the group selected, else at the top
  const sub = T.gcp.elements.find(e => e.label === 'Subnetwork'), prod = T.gcp.elements.find(e => e.label === 'Product');
  assert.deepEqual(T.gcp.edits.add(GCP, v, sub, 'apps subnet', { sel: ['gcp-network'] }), [{ op: 'add', element: { id: 'subnetwork1', type: 'gcp.Zone', label: 'apps subnet', props: { zoneType: 'subnetwork' }, parent: 'gcp-network' }, view: 'gcp-on-gcp' }]);
  assert.deepEqual(T.gcp.edits.add(GCP, v, prod, 'Cache', { sel: ['gcp-api'] }), [{ op: 'add', element: { id: 'product1', type: 'gcp.Product', label: 'Cache' }, view: 'gcp-on-gcp' }], 'a service selected: at the top');
  assert.deepEqual(T.gcp.edits.add(GCP, v, prod, 'Cache', null)[0].element.parent, undefined);
  for (const [fam, M] of TARGETS) for (const e of T[fam].elements) { const m = apply(M, T[fam].edits.add(M, M.views[0], e, 'New', null));
    assert.deepEqual(validate(m).filter(p => p.level === 'error'), [], `${fam} ${e.label}`); }
  // remove: Shift + Delete on a group counts what goes with it; Delete is the default (hide)
  assert.deepEqual(T.gcp.edits.remove(GCP, v, ['gcp-region'], true), { commands: [{ op: 'delete', id: 'gcp-region' }], say: 'Deleted Region europe-west1 and the 8 elements it held' });
  assert.equal(T.gcp.edits.remove(GCP, v, ['gcp-region'], false), null);
  assert.equal(T.gcp.edits.remove(GCP, v, ['gcp-api'], true), null);
  assert.equal(T.aws.edits.remove(AWS, AWS.views[0], ['aws-az-a', 'aws-az-b'], true).say, 'Deleted 2 groups and the 12 elements they held');
  const gone = apply(GCP, T.gcp.edits.remove(GCP, v, ['gcp-region'], true).commands);
  assert.ok(!gone.nodes.some(n => ['gcp-api', 'gcp-db', 'gcp-zone-c'].includes(n.id)) && !gone.edges.some(e => e.id === 'gcp-lb-api'), 'what it holds and their lines go');
  assert.deepEqual(validate(gone), []);
  // the Owner field: every group, its kind in brackets; none for a line
  assert.deepEqual(T.gcp.owners(GCP, GCP.nodes.find(n => n.id === 'gcp-api')).map(o => o.label), ['bookshop-prod [Project]', 'europe-west1 [Region]', 'bookshop-vpc [Network]',
    'data subnet, 10.10.0.0/24 [Subnetwork]', 'europe-west1-b [Zone]', 'europe-west1-c [Zone]']);
  assert.equal(T.gcp.owners(GCP, GCP.edges[0]), null);
  // a drop into a group emits reparent (stage 2's): the service is then drawn in it
  const moved = apply(GCP, [{ op: 'reparent', id: 'gcp-queue', parent: 'gcp-region' }]), g = layout(moved, 'gcp-on-gcp');
  assert.ok(g.families.find(f => f.id === 'gcp-region').nodeIds.includes('gcp-queue'));
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: N(`z${i}`, 'gcp.Zone', `zone ${i}`, 'gcp-region', { zoneType: 'zone' }), view: 'gcp-on-gcp' }],
    [{ op: 'add', element: N(`p${i}`, 'gcp.Product', `Job ${i}`, `z${i}`, { icon: 'Cloud-Run' }), view: 'gcp-on-gcp' }],
    [{ op: 'add', element: { id: `l${i}`, type: 'gcp.Path', from: 'gcp-api', to: `p${i}`, label: 'runs' }, view: 'gcp-on-gcp' }],
    [{ op: 'set', id: `p${i}`, path: 'props.icon', value: 'Cloud-Functions' }],
    [[{ op: 'set', id: `l${i}`, path: 'label', value: `HTTP ${i}` }], [{ op: 'reparent', id: `p${i}`, parent: 'gcp-project' }], [{ op: 'set', id: `z${i}`, path: 'props.zoneType', value: 'generic' }]][i % 3],
    [[{ op: 'hide', id: `z${i}`, view: 'gcp-on-gcp' }], [{ op: 'delete', id: `z${i}` }], [{ op: 'set', id: `p${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(GCP), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o) => unid(mapContext(m, o).buildView('gcp-on-gcp').markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos['gcp-on-gcp'].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, 'gcp-on-gcp'), describe(JSON.parse(seen[30]), 'gcp-on-gcp'));
});

// §11: 60 services in five levels of groups, 80 connections (P1): a project, two regions, a network in each, two subnetworks in
// each network and two zones in each subnetwork; six services in each zone, three in each region, six in the project
const STRESS = (() => {
  const nodes = [N('p', 'gcp.Zone', 'bookshop-prod', null, { zoneType: 'project' })], svc = [], put = (parent, k) => { for (let i = 0; i < k; i++) { const id = `s${svc.length}`; svc.push(id); nodes.push(N(id, 'gcp.Product', `Service ${svc.length}`, parent, { icon: ['Cloud-Run', 'Cloud-SQL', 'Pub-Sub'][svc.length % 3] })); } };
  put('p', 6);
  for (const r of [0, 1]) { nodes.push(N(`r${r}`, 'gcp.Zone', `region ${r}`, 'p', { zoneType: 'region' }), N(`n${r}`, 'gcp.Zone', `network ${r}`, `r${r}`, { zoneType: 'network' })); put(`r${r}`, 3);
    for (const s of [0, 1]) { nodes.push(N(`r${r}s${s}`, 'gcp.Zone', `subnetwork ${r}.${s}`, `n${r}`, { zoneType: 'subnetwork' }));
      for (const z of [0, 1]) { nodes.push(N(`r${r}s${s}z${z}`, 'gcp.Zone', `zone ${r}.${s}.${z}`, `r${r}s${s}`, { zoneType: 'zone' })); put(`r${r}s${s}z${z}`, 6); } } }
  const edges = svc.slice(1).map((id, i) => ({ id: `c${i}`, type: 'gcp.Path', from: svc[i], to: id, label: i % 2 ? 'gRPC' : 'HTTPS' }));
  for (let i = 0; edges.length < 80; i++) edges.push({ id: `x${i}`, type: 'gcp.Path', from: svc[i * 3 % 60], to: svc[(i * 3 + 13) % 60] });
  return { schemaVersion: 2, title: 'stress', nodes, edges, views: [{ id: 'v', diagram: 'gcp', nodeIds: nodes.map(n => n.id) }] };
})();
test('P1 (§11, decision 20): on 60 services in five levels of groups and 80 connections, a full layout, a service renamed, its icon changed, moved into another group and a connection added, laid out and drawn under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of five) (timed)', () => {
  assert.equal(STRESS.nodes.filter(n => n.type === 'gcp.Product').length, 60); assert.equal(STRESS.edges.length, 80); assert.deepEqual(validate(STRESS), []);
  const M = withIcons('gcp', STRESS, { 'gcp/Cloud-Functions': { src: SQ, dark: false, name: 'Cloud Functions' } });
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('v');
  draw(M);
  const runs = [0, 1, 2, 3, 4].map(k => ({ full: timed(() => mapContext(M).buildView('v')),
    rename: timed(() => draw(apply(M, [{ op: 'set', id: 's7', path: 'label', value: `Renamed service ${'x'.repeat(3 + 4 * k)}` }]))),
    icon: timed(() => draw(apply(M, [{ op: 'set', id: 's8', path: 'props.icon', value: k % 2 ? 'Cloud-Functions' : 'Pub-Sub' }]))),
    move: timed(() => draw(apply(M, [{ op: 'reparent', id: 's20', parent: `r1s${k % 2}z${k % 2}` }]))),
    connect: timed(() => draw(apply(M, [{ op: 'add', element: { id: `new${k}`, type: 'gcp.Path', from: 's2', to: `s${30 + k}` }, view: 'v' }]))) }));
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'rename', 'icon', 'move', 'connect']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 target 100 ms: a service renamed ${best('rename').toFixed(1)} ms, its icon changed ${best('icon').toFixed(1)} ms, moved into another group ${best('move').toFixed(1)} ms, a connection added ${best('connect').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms; routes ${JSON.stringify(layout(M, 'v').stats)}`);
});

test('audit 2: a node with no type in an AWS or Azure view is a card, not a user neither family has', () => {
  for (const fam of ['aws', 'azure']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'x', label: 'Thing' }], edges: [], views: [{ id: 'v', diagram: fam, nodeIds: ['x'] }] };
    const n = layout(m, 'v').byId.x;
    assert.equal(n.shape, 'cloud-card', fam); assert.ok(!/^User /.test(n.aria), n.aria);
    assert.notEqual(T[fam].word(m, 'x'), 'User', fam);
  }
});

test('audit 2: a pin of 1e308 lays out without walking every column between', () => {
  const m = structuredClone(AWS); m.views[0].layout = { ...(m.views[0].layout || {}), [m.views[0].nodeIds.find(id => !/group/i.test(m.nodes.find(n => n.id === id).type))]: [1e308, 0] };
  assert.ok(layout(m, m.views[0].id).nodes.length);
});
