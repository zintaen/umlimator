// Stories (#69): validate() checks each step against its view, with no browser. Playing them: tests/stories.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../lib/umlimator.js';

const bike = JSON.parse(readFileSync(new URL('../examples/bike-share.json', import.meta.url)));

test("bike-share's story is valid: steps on its views, naming their cards and lines", () => {
  assert.ok(bike.stories.length && bike.stories[0].steps.length === 5);
  assert.deepEqual(validate(bike), []);
});

test('validate() names what a story gets wrong, step by step: missing views, cards and lines are errors; a camera or duration it cannot use, warnings', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }, { id: 'w', nodeIds: ['c'] }],
    stories: [
      { id: 's', steps: [
        { view: 'v', select: 'ab', highlight: ['a', 'ab', 'a->b#0', { type: 'node', id: 'zz' }], tour: ['a', 'b'], camera: { card: 'b', zoom: 2 } },
        { view: 'nope' },
        { view: 'w', select: 'a', highlight: ['ghost'], tour: ['c', 'b'], camera: { card: 'a' }, duration: -1 },
        { view: 'v', camera: 'close' }] },
      { id: 's', steps: [] }, { title: 'no id' }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`), [
    'error stories[0].steps[1].view',
    'error stories[0].steps[2].select',
    'error stories[0].steps[2].highlight[0]',
    'error stories[0].steps[2].tour[1]',
    'warning stories[0].steps[2].camera.card',
    'warning stories[0].steps[2].duration',
    'warning stories[0].steps[3].camera',
    'error stories[1].id',
    'error stories[1].steps',
    'error stories[2].id',
  ]);
  assert.match(validate(m)[1].message, /"a" is neither one of view "w"'s cards nor a line/);
  assert.deepEqual(validate({ ...m, stories: {} }).map(p => p.path), ['stories']);
});
