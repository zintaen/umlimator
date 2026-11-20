// The showcase: examples/ (each type's example, its variants and the atlases) is what the gallery and the site show, so
// tests only smoke-check it here: every model validates with no error and every view lays out. Tests pin content on their
// own models: tests/fixtures/ (the integration fixture, tests/fixtures/integration.json, among them) and the per-type
// tests/*-minimal.json and *-stress.json; the bench reads bench/models/ (the maintainer's decision, 20 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validate, layout } from '../lib/umlimator-all.js';

const root = new URL('../', import.meta.url);
const models = ['examples', 'examples/types', 'examples/variants']
  .filter(d => existsSync(new URL(d + '/', root)))
  .flatMap(d => readdirSync(new URL(d + '/', root)).filter(f => f.endsWith('.json')).sort().map(f => `${d}/${f}`));

test('every showcase model validates with no error, and each of its views lays out', () => {
  assert.ok(models.filter(f => f.startsWith('examples/types/')).length >= 28, 'a model for each type');
  for (const f of models) {
    const m = JSON.parse(readFileSync(new URL(f, root), 'utf8'));
    assert.deepEqual(validate(m).filter(p => p.level === 'error' || !p.level), [], f);
    assert.ok((m.views || []).length > 0, `${f}: no view`);
    for (const v of m.views) {
      let g;
      assert.doesNotThrow(() => { g = layout(m, v.id); }, `${f}: view ${v.id}`);
      assert.ok(g && Array.isArray(g.nodes), `${f}: view ${v.id} gave no layout`);
    }
  }
});

// No test pins showcase content but these: this smoke test, the gallery, types and docs tests (they check what the pages
// show), and the README test. The files in LEGACY read examples/ models from before the decision; each moves to a model
// of its own in tests/fixtures/ and leaves the list, which only shrinks: a file not listed may not start reading examples/.
// tests/class-editor.html joined it in audit 51: it read examples/ through host pages from before, unseen by the guard.
const ALLOWED = ['tests/showcase.test.mjs', 'tests/gallery.test.mjs', 'tests/types.test.mjs', 'tests/docs.test.mjs',
  'tests/api-docs.test.mjs', 'tests/site.test.mjs', 'tests/readme.test.mjs'];
const LEGACY = ['tests/activity.html', 'tests/activity.test.mjs', 'tests/aids.test.mjs', 'tests/apply.test.mjs',
  'tests/blocks.test.mjs', 'tests/bpmn-xml.test.mjs', 'tests/bpmn.html', 'tests/bpmn.test.mjs', 'tests/c4-views.html',
  'tests/c4-views.test.mjs', 'tests/c4.html', 'tests/c4.test.mjs', 'tests/change.html', 'tests/class-editor.html', 'tests/change.test.mjs',
  'tests/class.html', 'tests/class.test.mjs', 'tests/cli.py', 'tests/cloud.html', 'tests/cloud.test.mjs',
  'tests/communication.html', 'tests/communication.test.mjs', 'tests/component.html', 'tests/component.test.mjs',
  'tests/composite.html', 'tests/composite.test.mjs', 'tests/contrast.html', 'tests/convert.test.mjs',
  'tests/core-diet.html', 'tests/core-diet.json', 'tests/core-diet.test.mjs', 'tests/delete-cascade.test.mjs',
  'tests/deployment.html', 'tests/deployment.test.mjs', 'tests/dfd.html', 'tests/dfd.test.mjs', 'tests/element.html',
  'tests/embed.py', 'tests/er.html', 'tests/er.test.mjs', 'tests/flow.test.mjs', 'tests/flowchart.html',
  'tests/flowchart.test.mjs', 'tests/import.py', 'tests/import/state.mmd', 'tests/information-flow.html',
  'tests/information-flow.test.mjs', 'tests/insight.test.mjs', 'tests/interaction.test.mjs',
  'tests/internal-block.test.mjs', 'tests/layout-typed.test.mjs', 'tests/layout.test.mjs', 'tests/m4a-fixtures.test.mjs',
  'tests/m4b-fixtures.test.mjs', 'tests/mcp.py', 'tests/mermaid-class.test.mjs', 'tests/mermaid-er.test.mjs',
  'tests/mermaid-flowchart.test.mjs', 'tests/mermaid-requirement.test.mjs', 'tests/mermaid-sequence.test.mjs',
  'tests/mermaid-state.test.mjs', 'tests/mindmap.html', 'tests/mindmap.test.mjs', 'tests/model.test.mjs',
  'tests/motion.html', 'tests/names.test.mjs', 'tests/notation.html', 'tests/object.html', 'tests/object.test.mjs',
  'tests/outcomes.py', 'tests/overview.html', 'tests/overview.test.mjs', 'tests/package.html', 'tests/package.test.mjs',
  'tests/page-state.html', 'tests/parametric.test.mjs', 'tests/print-typed.test.mjs', 'tests/profile.html',
  'tests/profile.test.mjs', 'tests/registry.test.mjs', 'tests/schema.test.mjs', 'tests/sequence.html',
  'tests/sequence.test.mjs', 'tests/shapes.html', 'tests/shapes.test.mjs', 'tests/spike-sequence.test.mjs',
  'tests/stage6-core.test.mjs', 'tests/state-machine.html', 'tests/state.test.mjs', 'tests/stereotypes.test.mjs',
  'tests/stories.test.mjs', 'tests/structure.test.mjs', 'tests/sysml.html', 'tests/sysml.test.mjs', 'tests/timing.test.mjs',
  'tests/transition.test.mjs', 'tests/typed-diff.test.mjs', 'tests/uml-panel.html', 'tests/unfold.test.mjs',
  'tests/usecase.html', 'tests/usecase.test.mjs'];

// a path to a model under examples/ (not docs/diagrams/examples/), a template or a listing of the folder: a path segment
// "examples" in either quote after a / (pathlib) or in a join(), or a call given the folder (readdirSync('examples')).
// A quoted "examples" elsewhere (data-tab="examples") is no path (audit 52)
const READS = /(?<!diagrams\/)(?<![\w-])examples\/(?:types\/|variants\/)?(?:[\w.-]+\.json|\$\{|['"`])|\/ ?['"]examples['"]|join\([^)]*['"]examples['"]|\(\s*['"`](?:\.{1,2}\/)?examples\/?['"`]|URL\('\.\.\/examples\/'/;

// a test that loads an examples/ host page reads the models that page fetches (audit 51: tests/class-editor.html framed
// examples/class-editor.html and edit.html, pinning sales-classes.json and umlimator-atlas.json, unseen by READS)
const HOSTS = /(?<!diagrams\/)(?<![\w-])examples\/([\w-]+\.html)/g;
const loadsHost = t => [...t.matchAll(HOSTS)].some(([, page]) => existsSync(new URL(`examples/${page}`, root)) && /\bfetch\(/.test(readFileSync(new URL(`examples/${page}`, root), 'utf8')));
const readsShowcase = t => READS.test(t) || loadsHost(t);

test('no test but the allowed ones reads the showcase models, and the legacy list only shrinks', () => {
  const tracked = execFileSync('git', ['ls-files', 'tests'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter(f => /\.(mjs|js|py|html|json|mmd|dsl|txt)$/.test(f) && !f.startsWith('tests/fixtures/'));
  const readers = tracked.filter(f => readsShowcase(readFileSync(new URL(f, root), 'utf8')));
  // the guard sees a test that reads a showcase model through a host page
  assert.ok(readsShowcase("frame.src = '../examples/class-editor.html';") && !readsShowcase("'../docs/diagrams/examples/x.html'"));
  // ordinary path forms in either quote, and a listing of the folder; a quoted "examples" that is no path is not one (audit 52)
  for (const t of [`ROOT / 'examples' / 'shapes.json'`, `os.path.join(ROOT, "examples", "shapes.json")`, `path.join(root, "examples", "shapes.json")`,
    `readdirSync('examples')`, `readdirSync("./examples/")`, `ROOT / "examples" / "types"`, `join(root, 'examples')`]) assert.ok(readsShowcase(t), t);
  for (const t of [`<button data-tab="examples">`, `tab: 'examples'`, `'../docs/diagrams/examples/x.json'`]) assert.ok(!readsShowcase(t), t);
  assert.deepEqual(readers.filter(f => !ALLOWED.includes(f) && !LEGACY.includes(f)), [],
    'a test pins its own model in tests/fixtures/, never one of examples/');
  assert.deepEqual(LEGACY.filter(f => !readers.includes(f)), [], 'reads examples/ no more: take it off LEGACY');
  for (const f of tracked) assert.doesNotMatch(readFileSync(new URL(f, root), 'utf8'), /examples\/(?:bike-share|traces\/ride-end|traces\/match)/, f);
});

// the bike share left examples/ for good (20 Nov 2026): its model, its Structurizr pair, its page, stills and traces
test('the old test model and its files are gone from examples/', () => {
  for (const f of ['bike-share.json', 'bike-share-c4.json', 'bike-share.dsl', 'bike-share.html', 'stills/bike-share', 'traces/ride-end.json', 'traces/match.json'])
    assert.ok(!existsSync(new URL(`examples/${f}`, root)), `examples/${f}`);
  for (const f of ['tools/bike-share.mjs', 'tools/bike-share']) assert.ok(!existsSync(new URL(f, root)), f);
});

// audit 53: examples/README.md said no test reads the showcase and only the gallery and doc-name tests read the Atlas, while
// the LEGACY tests read examples/ and two of them pinned the Atlas: the Atlas is read only by the tests the README names, and
// the README names the LEGACY list
test('the tests that read the Umlimator Atlas are the ones examples/README.md names, and it says the LEGACY tests still read examples/', () => {
  const tracked = execFileSync('git', ['ls-files', 'tests'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => /\.(mjs|js|py|html)$/.test(f));
  const atlas = tracked.filter(f => readFileSync(new URL(f, root), 'utf8').includes('umlimator-atlas'));
  assert.deepEqual(atlas.filter(f => !['tests/gallery.test.mjs', 'tests/docs.test.mjs', 'tests/showcase.test.mjs'].includes(f)), [], 'a test that reads the Atlas pins its content');
  const why = readFileSync(new URL('examples/README.md', root), 'utf8').split('## Why the Umlimator Atlas is not a test model')[1].split('\n## ')[0];
  assert.match(why, /`LEGACY` in \[`\.\.\/tests\/showcase\.test\.mjs`\]/);
  assert.doesNotMatch(why, /never the showcase|only the gallery and doc-name tests read it/);
  assert.match(why, /the showcase test validates it/);
  assert.match(why, /\[`edit\.html`\]\(edit\.html\), which the editing tests open, draws it/);
  assert.match(readFileSync(new URL('examples/edit.html', root), 'utf8'), /fetch\('umlimator-atlas\.json'\)/, 'edit.html draws the Atlas, as the README says');
});
