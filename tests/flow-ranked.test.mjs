// A boxed arranged map view also lays itself out ranked (bestBlock in src/map/context.js) and keeps that only when it draws no
// more layout check problems and section 4's score puts it lower by more than 2 percent. The import fixtures' boxed C4 views
// (tests/fixtures/imported-arranged.json, a copy of bench/models/a8.json) drew 5 to 12 percent worse arranged than ranked, which
// failed the score gate against main (which lays every view out ranked); the views the flow draws better keep their main flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, check } from '../lib/umlimator-all.js';
import { WEIGHTS, viewMetrics, scoreView } from '../src/layout/score.js';

const m = JSON.parse(readFileSync(new URL('./fixtures/imported-arranged.json', import.meta.url), 'utf8'));
const ranked = { ...m, views: m.views.map(({ arrange, ...v }) => v) };
const scoreOf = (model, vid) => scoreView(viewMetrics(layout(model, vid), { model, view: model.views.find(v => v.id === vid) }), WEIGHTS);
const problems = (model, vid) => check(model, vid).filter(x => /right-to-left|detour|runs round/.test(x.message)).length;

test('a boxed arranged view scores no more than 2 percent worse than ranked, and draws no more layout check problems', () => {
  for (const v of m.views.filter(v => (v.containers || []).length)) {
    const a = scoreOf(m, v.id), r = scoreOf(ranked, v.id);
    assert.ok(a <= r * 1.02, `${v.id}: arranged ${a}, ranked ${r}`);
  }
  for (const vid of ['dsl-containers', 'dsl-api-components', 'puml-components']) {
    assert.equal(scoreOf(m, vid), scoreOf(ranked, vid), `${vid} takes the ranked way`);
    assert.ok(problems(m, vid) <= problems(ranked, vid), vid);
    assert.ok(!layout(m, vid).edges.some(e => e.mainLine), `${vid}: ranked, no main row`);
  }
});

test('a boxed arranged view the flow draws better keeps its main flow', () => {
  for (const vid of ['checkout-flowchart', 'compose-services']) {
    assert.ok(scoreOf(m, vid) < scoreOf(ranked, vid), vid);
    assert.ok(layout(m, vid).edges.some(e => e.mainLine), `${vid}: its main row`);
  }
});
