// The API reference (docs/api/*.md) against the types it documents: every name lib/*.d.ts exports appears on some page,
// every exported function's signature is quoted as the .d.ts has it, and every relative link and anchor resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), api = join(root, 'docs/api');
const read = p => readFileSync(p, 'utf8');
const pages = Object.fromEntries(readdirSync(api).filter(f => f.endsWith('.md')).map(f => [f, read(join(api, f))]));
const all = Object.values(pages).join('\n');
const dts = readdirSync(join(root, 'lib')).filter(f => f.endsWith('.d.ts')).map(f => read(join(root, 'lib', f)));

test('the API reference has its seven pages', () => {
  assert.deepEqual(Object.keys(pages).sort(), ['apply-and-commands.md', 'element-and-plugins.md', 'events-and-state.md', 'index.md',
    'model-and-schema.md', 'render.md', 'typed-diagrams.md']);
});

test('every name lib/*.d.ts exports appears on some API page', () => {
  const names = dts.flatMap(s => [...s.matchAll(/^export\s+(?:declare\s+)?(?:function|interface|type|class|const)\s+(\w+)/gm)].map(m => m[1]));
  assert.ok(names.length > 100, `only ${names.length} exports found`);
  const missing = [...new Set(names)].filter(n => !new RegExp(`\\b${n}\\b`).test(all));
  assert.deepEqual(missing, [], `not in docs/api/*.md: ${missing.join(', ')}`);
});

test('every exported function of lib/umlimator.d.ts is quoted with its signature as the .d.ts has it', () => {
  const sigs = [...read(join(root, 'lib/umlimator.d.ts')).matchAll(/^export (function .+;)$/gm)].map(m => m[1]);
  assert.ok(sigs.length >= 19, `only ${sigs.length} functions found`);
  const stale = sigs.filter(s => !all.includes(s));
  assert.deepEqual(stale, [], 'a signature on the API pages differs from lib/umlimator.d.ts');
});

test('a Handle method whose doc comment says it resolves true is typed Promise<boolean>, and is quoted on the API pages as the .d.ts has it (audit 15)', () => {
  const d = read(join(root, 'lib/umlimator.d.ts')), handle = d.slice(d.indexOf('export interface Handle'), d.indexOf('\n}', d.indexOf('export interface Handle')));
  const members = [...handle.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\n\s*(\w+\(.*\): .+;)\n/g)];
  assert.ok(members.length > 10, `only ${members.length} methods found`);
  const wrong = members.filter(([, doc, sig]) => /Resolves true/.test(doc) && !/: Promise<boolean>;$/.test(sig)).map(m => m[2]);
  assert.deepEqual(wrong, [], 'resolves true or false, typed otherwise');
  const quoted = members.map(m => m[2]).filter(sig => all.includes('\n' + sig.slice(0, sig.indexOf('(') + 1)) && !all.includes(sig));
  assert.deepEqual(quoted, [], 'a Handle method quoted on the API pages differs from lib/umlimator.d.ts');
});

test('the Element doc comment names every diagram type umlimator/all draws (audit 15)', async () => {
  const { validate } = await import('../lib/umlimator-all.js'), { targets } = await import('../docs/diagrams/examples/check.mjs');
  const line = read(join(root, 'lib/umlimator.d.ts')).split('\n').find(l => l.includes('umlimator/all draws `uml.class`'));
  const types = [...new Set(targets().flatMap(([, url]) => JSON.parse(read(url)).views.map(v => v.diagram)).filter(Boolean))];
  const drawn = types.filter(t => !validate({ schemaVersion: 2, nodes: [], views: [{ id: 'v', title: 'v', diagram: t, nodeIds: [] }] }).some(p => /not drawn/.test(p.message)));
  assert.ok(drawn.length >= 28, `only ${drawn.length} drawn`);
  assert.deepEqual(drawn.filter(t => !line.includes('`' + t + '`')), [], 'drawn, but the comment says plain cards');
});

// a heading's anchor as GitHub and VitePress both make it for the plain headings these pages use; a repeat gets -1, -2
const anchors = md => {
  const seen = {}, out = new Set();
  for (const [, h] of md.replace(/^(```|````)[\s\S]*?^\1/gm, '').matchAll(/^#{1,6} (.+)$/gm)) {
    const base = h.replace(/`/g, '').trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
    out.add(seen[base] ? `${base}-${seen[base]}` : base); seen[base] = (seen[base] || 0) + 1;
  }
  return out;
};

test('every relative link on the API pages names a file that exists, and an anchor that heading makes', () => {
  const broken = [];
  for (const [f, md] of Object.entries(pages)) {
    const text = md.replace(/^(```|````)[\s\S]*?^\1/gm, '');
    for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(href)) continue;
      const [path, hash] = href.split('#'), target = path ? resolve(api, path) : join(api, f);
      if (!existsSync(target)) { broken.push(`${f}: ${href} (no file)`); continue; }
      if (hash && target.endsWith('.md') && !anchors(read(target)).has(hash)) broken.push(`${f}: ${href} (no heading)`);
    }
  }
  assert.deepEqual(broken, []);
});

test('audit 20: every prop the sequence, communication and timing panels offer on a message is declared in its .d.ts props and listed in docs/api/typed-diagrams.md', async () => {
  const { diagramOf } = await import('../src/core/registry.js'); await import('../src/map/typed.js');
  for (const f of ['sequence', 'communication', 'timing']) await import(`../src/uml/${f}.js`);
  const d = read(join(root, 'lib/umlimator.d.ts')), doc = pages['typed-diagrams.md'];
  for (const [diagram, name] of [['uml.sequence', 'UmlMessageProps'], ['uml.communication', 'UmlMessageProps'], ['uml.timing', 'UmlTimingMessageProps']]) {
    const keys = diagramOf({ diagram }).props['uml.Message'].map(f => f.key), decl = (d.match(new RegExp(`interface ${name} \\{([^}]*)\\}`)) || [])[1] || '';
    const row = doc.split('\n').find(l => l.startsWith(`| \`${name}\` |`)) || '';
    assert.deepEqual(keys.filter(k => !new RegExp(`\\b${k}\\?:`).test(decl)), [], `${diagram}: not in ${name}`);
    assert.deepEqual(keys.filter(k => !row.includes(`\`${k}\``)), [], `${diagram}: not in the ${name} row`); }
});

test('audit 22: drift()\'s page says what an entry with one end that is no name does, as drift() does it', async () => {
  const { drift } = await import('../lib/umlimator.js');
  const model = { nodes: [{ id: 'api', label: 'API' }], edges: [], views: [{ id: 'v', nodeIds: ['api'] }] };
  for (const o of [{ from: 'ghost', to: null }, { from: 'ghost', to: {} }, { parent: 'ghost', child: true, callCount: 3 }, { from: 'ghost' }])
    assert.deepEqual(drift(model, [o]).counts, { carried: 0, undrawn: 0, idle: 0, unknown: 0, unmatched: ['ghost'] }, JSON.stringify(o));
  const page = pages['apply-and-commands.md'];
  assert.ok(!/is skipped, and names no service|An entry with no end names none/.test(page), 'the page says such an entry is skipped whole');
  assert.match(page, /other end, when it is a name with no card, is still listed in `counts\.unmatched`/);
  assert.match(page, /\| `counts\.unmatched` \|[^\n]*the other end of its entry is still listed/);
});

test('audit 24: delete\'s rows say that a model element under a node one view alone holds is kept and lifted, as apply() does it', async () => {
  const { apply } = await import('../lib/umlimator-all.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'M', type: 'uml.ActivityPartition', label: 'Shop' }, { id: 'x', type: 'uml.Action', label: 'Pack', parent: 'P' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.activity', nodeIds: ['M', 'P', 'x'], nodes: [{ id: 'P', type: 'uml.ActivityPartition', label: 'Floor', parent: 'M' }] }, { id: 'w', diagram: 'uml.activity', nodeIds: ['M', 'x'] }] };
  assert.equal(apply(m, { op: 'delete', id: 'P' }).nodes.find(n => n.id === 'x').parent, 'M', 'kept, under its nearest owner left');
  assert.throws(() => apply(m, [{ op: 'add', element: { id: 'y', type: 'uml.Action', label: 'Y' } }, { op: 'reparent', id: 'y', parent: 'P' }]), /lives in view "v" only/);
  const row = (page, cell) => (page.split('\n').find(l => l.startsWith(cell)) || '');
  assert.match(row(pages['apply-and-commands.md'], '| `delete` |'), /kept: it moves to its nearest owner left, else to none/);
  assert.match(row(pages['apply-and-commands.md'], '| `reparent` |'), /under it throws, and `validate\(\)` warns/);
  assert.match(row(read(join(root, 'docs/guide/editing.md')), '| `delete` (Shift + Delete) |'), /except a model element under a node only this view holds: it moves to its nearest owner left/);
});
