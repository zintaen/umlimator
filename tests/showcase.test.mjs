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
// Audit 63: a file on the list could still gain a read unseen (round 62's AWS Alt + arrow test read examples/types/aws.json
// in tests/cloud.test.mjs), so each legacy file carries the number of its lines that read the showcase, and that number only
// falls: a new read in a legacy file fails as one in a new file does, and a read moved to tests/fixtures/ lowers it here.
const ALLOWED = ['tests/showcase.test.mjs', 'tests/gallery.test.mjs', 'tests/types.test.mjs', 'tests/docs.test.mjs',
  'tests/api-docs.test.mjs', 'tests/site.test.mjs', 'tests/readme.test.mjs'];
const LEGACY_READS = {
  'tests/activity.html': 2, 'tests/activity.test.mjs': 4, 'tests/aids.test.mjs': 2, 'tests/apply.test.mjs': 8,
  'tests/blocks.test.mjs': 5, 'tests/bpmn-xml.test.mjs': 1, 'tests/bpmn.html': 2, 'tests/bpmn.test.mjs': 1,
  'tests/c4-views.html': 2, 'tests/c4-views.test.mjs': 1, 'tests/c4.html': 2, 'tests/c4.test.mjs': 8,
  'tests/change.html': 1, 'tests/class-editor.html': 6, 'tests/change.test.mjs': 7, 'tests/class.html': 3,
  'tests/class.test.mjs': 3, 'tests/cli.py': 47, 'tests/cloud.html': 3, 'tests/cloud.test.mjs': 2,
  'tests/communication.html': 2, 'tests/communication.test.mjs': 1, 'tests/component.html': 1,
  'tests/component.test.mjs': 7, 'tests/composite.html': 4, 'tests/composite.test.mjs': 6, 'tests/contrast.html': 1,
  'tests/convert.test.mjs': 1, 'tests/core-diet.html': 2, 'tests/core-diet.json': 13, 'tests/core-diet.test.mjs': 2,
  'tests/delete-cascade.test.mjs': 4, 'tests/deployment.html': 2, 'tests/deployment.test.mjs': 1, 'tests/dfd.html': 2,
  'tests/dfd.test.mjs': 3, 'tests/element.html': 1, 'tests/embed.py': 20, 'tests/er.html': 2, 'tests/er.test.mjs': 3,
  'tests/flow.test.mjs': 1, 'tests/flowchart.html': 2, 'tests/flowchart.test.mjs': 3, 'tests/import.py': 5,
  'tests/import/state.mmd': 1, 'tests/information-flow.html': 2, 'tests/information-flow.test.mjs': 1,
  'tests/insight.test.mjs': 2, 'tests/interaction.test.mjs': 1, 'tests/internal-block.test.mjs': 3,
  'tests/layout-typed.test.mjs': 2, 'tests/layout.test.mjs': 2, 'tests/m4a-fixtures.test.mjs': 4,
  'tests/m4b-fixtures.test.mjs': 3, 'tests/mcp.py': 3, 'tests/mermaid-class.test.mjs': 3,
  'tests/mermaid-er.test.mjs': 3, 'tests/mermaid-flowchart.test.mjs': 2, 'tests/mermaid-requirement.test.mjs': 2,
  'tests/mermaid-sequence.test.mjs': 2, 'tests/mermaid-state.test.mjs': 3, 'tests/mindmap.html': 2,
  'tests/mindmap.test.mjs': 2, 'tests/model.test.mjs': 5, 'tests/motion.html': 1, 'tests/names.test.mjs': 5,
  'tests/notation.html': 8, 'tests/object.html': 2, 'tests/object.test.mjs': 1, 'tests/outcomes.py': 2,
  'tests/overview.html': 2, 'tests/overview.test.mjs': 2, 'tests/package.html': 2, 'tests/package.test.mjs': 1,
  'tests/page-state.html': 2, 'tests/parametric.test.mjs': 1, 'tests/print-typed.test.mjs': 2, 'tests/profile.html': 1,
  'tests/profile.test.mjs': 5, 'tests/registry.test.mjs': 1, 'tests/schema.test.mjs': 1, 'tests/sequence.html': 2,
  'tests/sequence.test.mjs': 7, 'tests/shapes.html': 3, 'tests/shapes.test.mjs': 2, 'tests/spike-sequence.test.mjs': 2,
  'tests/stage6-core.test.mjs': 2, 'tests/state-machine.html': 2, 'tests/state.test.mjs': 4,
  'tests/stereotypes.test.mjs': 3, 'tests/stories.test.mjs': 2, 'tests/structure.test.mjs': 1, 'tests/sysml.html': 1,
  'tests/sysml.test.mjs': 2, 'tests/timing.test.mjs': 7, 'tests/transition.test.mjs': 1,
  'tests/typed-diff.test.mjs': 57, 'tests/uml-panel.html': 1, 'tests/unfold.test.mjs': 2, 'tests/usecase.html': 2,
  'tests/usecase.test.mjs': 4
};
const LEGACY = Object.keys(LEGACY_READS);

// a path to a model under examples/ (not docs/diagrams/examples/), a template or a listing of the folder: a path segment
// "examples" in either quote after a / (pathlib) or in a join(), or a call given the folder (readdirSync('examples')).
// A quoted "examples" elsewhere (data-tab="examples") is no path (audit 52)
const READS = /(?<!diagrams\/)(?<![\w-])examples\/(?:types\/|variants\/)?(?:[\w.-]+\.json|\$\{|['"`])|\/ ?['"]examples['"]|join\([^)]*['"]examples['"]|\(\s*['"`](?:\.{1,2}\/)?examples\/?['"`]|URL\('\.\.\/examples\/'/;

// a test that loads an examples/ host page reads the models that page fetches (audit 51: tests/class-editor.html framed
// examples/class-editor.html and edit.html, pinning sales-classes.json and umlimator-atlas.json, unseen by READS)
const HOSTS = /(?<!diagrams\/)(?<![\w-])examples\/([\w-]+\.html)/g;
const loadsHost = t => [...t.matchAll(HOSTS)].some(([, page]) => existsSync(new URL(`examples/${page}`, root)) && /\bfetch\(/.test(readFileSync(new URL(`examples/${page}`, root), 'utf8')));
const readsShowcase = t => READS.test(t) || loadsHost(t);
const readLines = t => t.split('\n').filter(readsShowcase).length;

test('no test but the allowed ones reads the showcase models, and the legacy list and its reads only shrink', () => {
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
  // a legacy file reads the showcase on no more lines than it did (audit 63), and the count follows each read it drops
  const grown = LEGACY.filter(f => readers.includes(f) && readLines(readFileSync(new URL(f, root), 'utf8')) > LEGACY_READS[f]);
  assert.deepEqual(grown, [], 'a new test in a legacy file pins its own model in tests/fixtures/, never one of examples/');
  const fell = LEGACY.filter(f => readers.includes(f) && readLines(readFileSync(new URL(f, root), 'utf8')) < LEGACY_READS[f]);
  assert.deepEqual(fell, [], 'reads examples/ on fewer lines: lower its count in LEGACY_READS');
  // the count sees one more read added to a legacy file, the way round 62 added one to tests/cloud.test.mjs
  const cloud = readFileSync(new URL('tests/cloud.test.mjs', root), 'utf8');
  assert.equal(readLines(cloud + "\n  const ex = read('../examples/types/aws.json');\n"), readLines(cloud) + 1);
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
test('the tests that read the Umlimator atlas are the ones examples/README.md names, and it says the LEGACY tests still read examples/', () => {
  const tracked = execFileSync('git', ['ls-files', 'tests'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => /\.(mjs|js|py|html)$/.test(f));
  const atlas = tracked.filter(f => readFileSync(new URL(f, root), 'utf8').includes('umlimator-atlas'));
  assert.deepEqual(atlas.filter(f => !['tests/gallery.test.mjs', 'tests/docs.test.mjs', 'tests/showcase.test.mjs'].includes(f)), [], 'a test that reads the Atlas pins its content');
  const why = readFileSync(new URL('examples/README.md', root), 'utf8').split('## Why the Umlimator atlas is not a test model')[1].split('\n## ')[0];
  assert.match(why, /`LEGACY` in \[`\.\.\/tests\/showcase\.test\.mjs`\]/);
  assert.doesNotMatch(why, /never the showcase|only the gallery and doc-name tests read it/);
  assert.match(why, /the showcase test validates it/);
  assert.match(why, /\[`edit\.html`\]\(edit\.html\), which the editing tests open, draws it/);
  assert.match(readFileSync(new URL('examples/edit.html', root), 'utf8'), /fetch\('umlimator-atlas\.json'\)/, 'edit.html draws the Atlas, as the README says');
});
