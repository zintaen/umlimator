// The fuzz targets fuzz.mjs runs: the module's readers (Structurizr JSON, the seven Mermaid readers, BPMN XML) and
// umlimator_import.py's (Structurizr DSL, C4-PlantUML, Mermaid as a map, and the cloud formats: the JSON of
// `docker compose config` and `kubectl get`). A target is
//   { name, kind: 'text' | 'json', ext, seeds(): [text], available(): true | reason, check(text): throws on a defect }
// check() throws an Error for a crash; one whose `fuzzKind` is 'invalid' for a model the reader gave that validate()
// calls an error or layout() cannot draw. Input that is not even JSON for a JSON target is no finding: it returns.
// Seeds are the repository's own import fixtures (tests/import/, its hostile/ files, tests/fixtures/integration.dsl).
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const hostile = re => readdirSync(join(ROOT, 'tests/import/hostile')).filter(f => re.test(f)).map(f => read(`tests/import/hostile/${f}`));

let lib;
const all = async () => (lib ||= await import(pathToFileURL(join(ROOT, 'lib/umlimator-all.js'))));

function invalid(message) { const e = new Error(message); e.fuzzKind = 'invalid'; return e; }

// the model a reader gave: no core validate() error (a type rule's error is the input's, not the reader's), and every
// view lays out
async function sound(model) {
  const { validate, layout } = await all();
  const v = validate(model), problems = Array.isArray(v) ? v : v?.problems || [];
  const err = problems.find(p => p.level === 'error' && !p.rule);
  if (err) throw invalid(`validate: ${err.message}`);
  for (const view of model.views || []) {
    try { layout(model, view.id); } catch (e) { e.message = `layout of view ${view.id}: ${e.message}`; throw e; }
  }
}

const MERMAID = {
  class: ['mermaid-class', 'readMermaidClass', 'writeMermaidClass', ['classes.mmd', 'namespaces.mmd', 'meals.mmd']],
  sequence: ['mermaid-sequence', 'readMermaidSequence', 'writeMermaidSequence', ['sequence.mmd', 'checkout.mmd']],
  state: ['mermaid-state', 'readMermaidState', 'writeMermaidState', ['state.mmd']],
  er: ['mermaid-er', 'readMermaidEr', 'writeMermaidEr', ['er.mmd']],
  flowchart: ['mermaid-flowchart', 'readMermaidFlowchart', 'writeMermaidFlowchart', ['flowchart.mmd']],
  requirement: ['mermaid-requirement', 'readMermaidRequirement', 'writeMermaidRequirement', ['requirement.mmd']],
  mindmap: ['mermaid-mindmap', 'readMermaidMindmap', 'writeMermaidMindmap', ['mindmap.mmd']],
};

const mermaid = Object.entries(MERMAID).map(([kind, [file, readName, writeName, seeds]]) => ({
  name: `mermaid-${kind}`, kind: 'text', ext: 'mmd',
  seeds: () => [...seeds.map(f => read(`tests/import/${f}`)), ...(kind === 'mindmap' ? hostile(/^mindmap-.*\.mmd$/) : [])],
  available: () => true,
  async check(text) {
    const mod = await import(pathToFileURL(join(ROOT, `src/readers/${file}.js`)));
    const out = mod[readName](text);
    if (!out?.model) return;
    await sound(out.model);
    const again = mod[readName](mod[writeName](out.model)); // write, then read back: neither may throw
    if (!again?.model) throw invalid('what the writer wrote reads back as no model');
  },
}));

const structurizrJson = {
  name: 'structurizr-json', kind: 'json', ext: 'json',
  seeds: () => Object.values(JSON.parse(read('tests/import/structurizr.json'))).map(w => JSON.stringify(w, null, 1)),
  available: () => true,
  async check(text) {
    let ws;
    try { ws = JSON.parse(text); } catch { return; }
    const { readStructurizr } = await import(pathToFileURL(join(ROOT, 'src/readers/structurizr.js')));
    const out = readStructurizr(ws);
    if (out?.model) await sound(out.model);
  },
};

// bpmn-moddle is never a dependency: the target runs where UMLIMATOR_BPMN_MODDLE names a folder that has it (as for
// tests/bpmn-xml.test.mjs)
function moddle() {
  const folder = process.env.UMLIMATOR_BPMN_MODDLE;
  if (!folder) return null;
  try { return createRequire(join(folder, 'x')).resolve('bpmn-moddle'); } catch { return null; }
}

const bpmn = {
  name: 'bpmn', kind: 'text', ext: 'bpmn',
  seeds: () => [read('tests/import/descriptive.bpmn'), read('tests/import/weakened.bpmn'), ...hostile(/\.bpmn$/)],
  available: () => moddle() ? true : 'bpmn-moddle not found: set UMLIMATOR_BPMN_MODDLE to a folder that has it',
  async check(text) {
    const { BpmnModdle } = await import(pathToFileURL(moddle()));
    const { readBpmnXml } = await import(pathToFileURL(join(ROOT, 'src/readers/bpmn-xml.js')));
    const out = await readBpmnXml(text, new BpmnModdle());
    if (out?.model) await sound(out.model);
  },
};

// umlimator_import.py's read(), in a python3 child: a hang is the child running past the limit
const PY = 'import sys, json\nsys.path.insert(0, sys.argv[1])\nimport umlimator_import as imp\nm, unread = imp.read(sys.argv[2], sys.stdin.read(), "fuzz")\njson.dump(m, sys.stdout)\n';
let python;
const hasPython = () => (python ??= spawnSync('python3', ['-c', 'import sys'], { stdio: 'ignore' }).status === 0);

const py = (name, fmt, kind, ext, seeds) => ({
  name, kind, ext, seeds,
  available: () => hasPython() ? true : 'python3 not found',
  async check(text, { hangMs = 5000 } = {}) {
    if (kind === 'json') { try { JSON.parse(text); } catch { return; } }
    const r = spawnSync('python3', ['-c', PY, ROOT, fmt], { input: text, encoding: 'utf8', timeout: hangMs, maxBuffer: 64 << 20 });
    if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') { const e = new Error(`umlimator_import.py read ${fmt} ran past ${hangMs} ms`); e.fuzzKind = 'hang'; throw e; }
    if (r.status !== 0) {
      const lines = (r.stderr || '').trim().split('\n');
      const e = new Error(`umlimator_import.py read ${fmt}: ${lines.at(-1)}`);
      e.stack = lines.slice(-6).join('\n');
      throw e;
    }
    await sound(JSON.parse(r.stdout));
  },
});

const python3 = [
  py('structurizr-dsl', 'structurizr', 'text', 'dsl', () => [read('tests/fixtures/integration.dsl')]),
  py('c4-plantuml', 'plantuml', 'text', 'puml', () => [read('tests/import/parcels.puml')]),
  py('mermaid-map', 'mermaid', 'text', 'mmd', () => [read('tests/import/flowchart.mmd')]),
  py('cloud-compose', 'compose', 'json', 'json', () => [read('tests/import/compose.json')]),
  py('cloud-kubernetes', 'kubernetes', 'json', 'json', () => [read('tests/import/kubernetes.json')]),
];

export const targets = [structurizrJson, ...mermaid, bpmn, ...python3];
